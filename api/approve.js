import { fetchServers } from '../lib/servers-query.mjs';
import { restRequest } from '../lib/supabase-rest.mjs';
import { applyChange, ToolInputError } from '../lib/tools.mjs';
import { claimPending, rejectPending, releasePending, logActions } from '../lib/store.mjs';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export default async function handler(
  req,
  res,
  deps = {
    env: process.env,
    fetchServers,
    restRequest,
    applyChange,
    store: { claimPending, rejectPending, releasePending, logActions },
  },
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: '허용되지 않는 요청이에요' });
  }

  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = deps.env;
  if (!url || !key) {
    return res.status(500).json({ error: '설정 오류' });
  }

  const { body } = req;
  if (
    !isPlainObject(body) ||
    !Number.isInteger(body.id) ||
    body.id < 1 ||
    !['approve', 'reject'].includes(body.decision)
  ) {
    return res.status(400).json({ error: '잘못된 요청이에요' });
  }

  const ctx = { url, key, restRequest: deps.restRequest, fetchServers: deps.fetchServers };
  const already = { error: '이미 처리됐거나 없는 요청이에요' };
  let claimed = null;

  try {
    if (body.decision === 'reject') {
      if (!(await deps.store.rejectPending(ctx, body.id))) return res.status(409).json(already);
      await deps.store.logActions(ctx, [
        { actor: 'user', tool: 'reject', input: { id: body.id }, result: '거절했어요', approved: false },
      ]);
      return res.status(200).json({
        result: '거절했어요',
        servers: await deps.fetchServers({ url, key }),
      });
    }

    // 먼저 대기 중인 행을 내 것으로 잡아 두면 같은 승인을 두 번 눌러도 한 번만 실행된다.
    claimed = await deps.store.claimPending(ctx, body.id);
    if (!claimed) return res.status(409).json(already);

    const result = await deps.applyChange(ctx, claimed);
    await deps.store.logActions(ctx, [
      { actor: 'user', tool: claimed.tool, input: claimed.input, result, approved: true },
    ]);
    return res.status(200).json({ result, servers: await deps.fetchServers({ url, key }) });
  } catch (error) {
    if (claimed) {
      try {
        await deps.store.releasePending(ctx, claimed.id);
      } catch {
        // 되돌리기에 실패해도 원래 오류를 그대로 알린다.
      }
    }
    if (error instanceof ToolInputError) {
      return res.status(422).json({ error: '지금은 실행할 수 없어요' });
    }
    console.error('approve upstream failed, status:', error?.status ?? 'none');
    return res.status(502).json({ error: '불러오지 못했어요' });
  }
}
