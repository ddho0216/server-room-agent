import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler, { MAX_RUNS_PER_HOUR, MAX_MESSAGE_LENGTH } from '../api/agent.js';

const SB_KEY = 'SECRET123';
const AI_KEY = 'AIKEY456';
const envRule = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: SB_KEY,
};
const envAnthropic = { ...envRule, LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: AI_KEY };
const env = envRule;
const RESULT = {
  reply: '이상 없어요',
  steps: [{ tool: 'get_server_status', input: {}, status: 'done' }],
  pending: [],
};

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.setHeader = (name, value) => void (res.headers[name.toLowerCase()] = String(value));
  res.json = (data) => ((res.body = data), res);
  return res;
}

function makeDeps({ count = 0, agent, logFails = false, envOverride = env } = {}) {
  const seen = { agentCalls: [], clients: [], logged: [], counts: [] };
  return {
    seen,
    env: envOverride,
    now: () => new Date('2026-11-04T03:00:00.000Z'),
    fetchServers: async () => [],
    restRequest: async () => ({ status: 200, data: [] }),
    createClient: async (provider, apiKey) => {
      seen.clients.push({ provider, apiKey });
      return { fake: true };
    },
    runAgent:
      agent ??
      (async (args) => {
        seen.agentCalls.push(args);
        return RESULT;
      }),
    store: {
      countRecent: async (ctx, args) => {
        seen.counts.push(args);
        return count;
      },
      logActions: async (ctx, rows) => {
        if (logFails === 'always' || (logFails && seen.logged.length >= 1)) throw new Error('upstream');
        seen.logged.push(rows);
      },
    },
  };
}

const run = async (method, body, deps) => {
  const res = fakeRes();
  await handler({ method, body }, res, deps);
  return res;
};
const say = (message) => ({ message });

test('정상 요청은 200과 답, 단계, 승인 대기를 돌려준다', async () => {
  const deps = makeDeps();
  const res = await run('POST', say('순회 점검 해줘'), deps);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ...RESULT, brain: 'rule' });
  assert.equal(deps.seen.agentCalls.length, 1);
  const call = deps.seen.agentCalls[0];
  assert.equal(call.message, '순회 점검 해줘');
  assert.equal(call.client.fake, true);
  assert.deepEqual(deps.seen.clients[0], { provider: 'rule', apiKey: undefined });
  assert.equal(call.ctx.url, 'https://x.supabase.co');
});

test('기본값과 LLM_PROVIDER=rule은 Anthropic 키 없이 규칙 뇌로 동작한다', async () => {
  for (const extra of [{}, { LLM_PROVIDER: 'rule' }, { LLM_PROVIDER: '' }]) {
    const deps = makeDeps({ envOverride: { ...envRule, ...extra } });
    const res = await run('POST', say('점검'), deps);
    assert.equal(res.statusCode, 200, JSON.stringify(extra));
    assert.equal(res.body.brain, 'rule');
    assert.deepEqual(deps.seen.clients[0], { provider: 'rule', apiKey: undefined });
  }
});

test('LLM_PROVIDER=anthropic이면 키와 모델을 넘기고 brain이 anthropic', async () => {
  const deps = makeDeps({ envOverride: envAnthropic });
  const res = await run('POST', say('점검'), deps);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.brain, 'anthropic');
  assert.deepEqual(deps.seen.clients[0], { provider: 'anthropic', apiKey: AI_KEY });
  assert.equal(deps.seen.agentCalls[0].model, 'claude-opus-5-5');
});

test('anthropic인데 키가 없으면 500', async () => {
  const deps = makeDeps({ envOverride: { ...envRule, LLM_PROVIDER: 'anthropic' } });
  const res = await run('POST', say('점검'), deps);
  assert.equal(res.statusCode, 500);
  assert.equal(deps.seen.agentCalls.length, 0);
});

test('알 수 없는 LLM_PROVIDER는 500이고 응답에 설정 이름이 없으며 모델을 부르지 않는다', async () => {
  for (const provider of ['gpt', 'RULE', 'Anthropic', 'groq', 'rule ']) {
    const deps = makeDeps({ envOverride: { ...envRule, LLM_PROVIDER: provider, ANTHROPIC_API_KEY: AI_KEY } });
    const res = await run('POST', say('점검'), deps);
    assert.equal(res.statusCode, 500, provider);
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes('LLM_PROVIDER') && !text.includes('ANTHROPIC') && !text.includes(AI_KEY));
    assert.equal(deps.seen.agentCalls.length, 0);
    assert.equal(deps.seen.clients.length, 0);
  }
});

test('기본 createClient: rule은 SDK를 불러오지 않고 규칙 클라이언트를 돌려준다', async () => {
  const { default: realHandler } = await import('../api/agent.js');
  assert.equal(typeof realHandler, 'function');
  const { createClient } = await import('../api/agent.js');
  const client = await createClient('rule');
  assert.equal(typeof client.beta.messages.create, 'function');
});

test('ANTHROPIC_MODEL이 있으면 그 모델을 쓴다', async () => {
  const deps = makeDeps({ envOverride: { ...envAnthropic, ANTHROPIC_MODEL: 'claude-haiku-5-5' } });
  await run('POST', say('안녕'), deps);
  assert.equal(deps.seen.agentCalls[0].model, 'claude-haiku-5-5');
});

test('메시지는 앞뒤 공백을 자르고, 300자는 되고 301자는 안 된다', async () => {
  const deps = makeDeps();
  await run('POST', say('  점검  '), deps);
  assert.equal(deps.seen.agentCalls[0].message, '점검');
  assert.equal(MAX_MESSAGE_LENGTH, 300);
  assert.equal((await run('POST', say('가'.repeat(300)), makeDeps())).statusCode, 200);
  assert.equal((await run('POST', say('가'.repeat(301)), makeDeps())).statusCode, 400);
});

test('GET은 405와 Allow 헤더', async () => {
  const res = await run('GET', undefined, makeDeps());
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
});

test('Supabase 환경변수가 하나라도 없으면 500이고 응답에 변수 이름이 없다', async () => {
  for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const { [name]: omitted, ...rest } = envAnthropic;
    const deps = makeDeps({ envOverride: rest });
    const res = await run('POST', say('점검'), deps);
    assert.equal(res.statusCode, 500, name);
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes('SUPABASE') && !text.includes('ANTHROPIC'));
    assert.equal(deps.seen.agentCalls.length, 0);
  }
});

test('잘못된 본문은 400이고 모델을 부르지 않는다', async () => {
  for (const body of [undefined, null, 'hi', [], {}, say(''), say('   '), say(5), say(null), say({}), say('가'.repeat(301))]) {
    const deps = makeDeps();
    const res = await run('POST', body, deps);
    assert.equal(res.statusCode, 400, JSON.stringify(body)?.slice(0, 40));
    assert.equal(deps.seen.agentCalls.length, 0);
    assert.equal(deps.seen.logged.length, 0);
  }
});

test('한 시간에 20번을 넘으면 429이고 모델을 부르지 않으며 기록도 안 남긴다', async () => {
  assert.equal(MAX_RUNS_PER_HOUR, 20);
  const over = makeDeps({ count: 20 });
  const res = await run('POST', say('점검'), over);
  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.body, { error: '잠시 후에 다시 해 주세요' });
  assert.equal(over.seen.agentCalls.length, 0);
  assert.equal(over.seen.logged.length, 0);
  const under = makeDeps({ count: 19 });
  assert.equal((await run('POST', say('점검'), under)).statusCode, 200);
  assert.deepEqual(under.seen.counts[0], {
    table: 'action_log',
    tool: 'agent_run',
    minutes: 60,
    now: new Date('2026-11-04T03:00:00.000Z'),
  });
});

test('agent_run을 먼저 기록하고 도구 단계를 agent 기록으로 남긴다', async () => {
  const deps = makeDeps();
  await run('POST', say('점검'), deps);
  assert.equal(deps.seen.logged.length, 2);
  assert.deepEqual(deps.seen.logged[0], [
    { actor: 'user', tool: 'agent_run', input: { message: '점검' }, result: null },
  ]);
  assert.deepEqual(deps.seen.logged[1], [
    { actor: 'agent', tool: 'get_server_status', input: {}, result: 'done' },
  ]);
});

test('모델 쪽 오류는 502이고 응답·헤더·로그에 키가 없다', async () => {
  const printed = [];
  const original = console.error;
  console.error = (...args) => void printed.push(args.join(' '));
  try {
    for (const status of [401, 429, 529, undefined]) {
      const deps = makeDeps({
        envOverride: envAnthropic,
        agent: async () => {
          throw Object.assign(new Error(`boom ${AI_KEY} ${SB_KEY} x.supabase.co`), { status });
        },
      });
      const res = await run('POST', say('점검'), deps);
      assert.equal(res.statusCode, 502);
      assert.deepEqual(res.body, { error: '불러오지 못했어요' });
      const all = JSON.stringify(res.body) + JSON.stringify(res.headers) + printed.join('\n');
      assert.ok(!all.includes(AI_KEY));
      assert.ok(!all.includes(SB_KEY));
      assert.ok(!all.includes('supabase.co'));
    }
  } finally {
    console.error = original;
  }
});

test('시작 기록이 안 남으면 한도를 셀 수 없으니 모델을 부르지 않고 502', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const deps = makeDeps({ logFails: 'always' });
    const res = await run('POST', say('점검'), deps);
    assert.equal(res.statusCode, 502);
    assert.equal(deps.seen.agentCalls.length, 0);
  } finally {
    console.error = original;
  }
});

test('도구 기록이 실패해도 이미 만든 답은 돌려준다', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const res = await run('POST', say('점검'), makeDeps({ logFails: true }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ...RESULT, brain: 'rule' });
  } finally {
    console.error = original;
  }
});

test('모든 응답에 Cache-Control no-store', async () => {
  for (const [method, body, deps] of [
    ['POST', say('점검'), makeDeps()],
    ['GET', undefined, makeDeps()],
    ['POST', null, makeDeps()],
    ['POST', say('점검'), makeDeps({ count: 99 })],
    ['POST', say('점검'), makeDeps({ envOverride: {} })],
  ]) {
    assert.equal((await run(method, body, deps)).headers['cache-control'], 'no-store');
  }
});

test('vercel.json에 에이전트 함수 최대 실행 시간이 있고 SDK가 의존성에 있다', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(vercel.functions['api/agent.js'].maxDuration, 60);
  assert.equal(vercel.outputDirectory, 'public');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.dependencies['@anthropic-ai/sdk']);
});
