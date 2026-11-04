import { fetchServers } from '../lib/servers-query.mjs';
import { restRequest } from '../lib/supabase-rest.mjs';
import { runAgent } from '../lib/agent.mjs';
import { countRecent, logActions } from '../lib/store.mjs';

export const MAX_RUNS_PER_HOUR = 20;
export const MAX_MESSAGE_LENGTH = 300;
const DEFAULT_MODEL = 'claude-opus-5-5';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// SDK는 실제로 모델을 부를 때만 불러온다(시험은 가짜 클라이언트를 쓴다).
async function createClient(apiKey) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey, maxRetries: 1, timeout: 25_000 });
}

export default async function handler(
  req,
  res,
  deps = {
    env: process.env,
    now: () => new Date(),
    fetchServers,
    restRequest,
    createClient,
    runAgent,
    store: { countRecent, logActions },
  },
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: '허용되지 않는 요청이에요' });
  }

  const {
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: key,
    ANTHROPIC_API_KEY: apiKey,
    ANTHROPIC_MODEL: model = DEFAULT_MODEL,
  } = deps.env;
  if (!url || !key || !apiKey) {
    return res.status(500).json({ error: '설정 오류' });
  }

  const { body } = req;
  const message = isPlainObject(body) && typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < 1 || message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: '잘못된 요청이에요' });
  }

  const ctx = { url, key, restRequest: deps.restRequest, fetchServers: deps.fetchServers, now: deps.now };

  try {
    const recent = await deps.store.countRecent(ctx, {
      table: 'action_log',
      tool: 'agent_run',
      minutes: 60,
      now: deps.now(),
    });
    if (recent >= MAX_RUNS_PER_HOUR) {
      return res.status(429).json({ error: '잠시 후에 다시 해 주세요' });
    }

    await deps.store.logActions(ctx, [
      { actor: 'user', tool: 'agent_run', input: { message }, result: null },
    ]);

    const client = await deps.createClient(apiKey);
    const result = await deps.runAgent({ client, model, ctx, message });

    // 답은 이미 만들어졌으므로 기록 실패가 사용자에게 보이는 답을 막지 않게 한다.
    try {
      await deps.store.logActions(
        ctx,
        result.steps.map((step) => ({ actor: 'agent', tool: step.tool, input: step.input, result: step.status })),
      );
    } catch (error) {
      console.error('agent log failed, status:', error?.status ?? 'none');
    }

    return res.status(200).json({ reply: result.reply, steps: result.steps, pending: result.pending });
  } catch (error) {
    console.error('agent failed, status:', error?.status ?? 'none');
    return res.status(502).json({ error: '불러오지 못했어요' });
  }
}
