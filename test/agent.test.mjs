import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent, SYSTEM_PROMPT, MAX_ITERATIONS } from '../lib/agent.mjs';
import { TOOLS } from '../lib/tools.mjs';
import { SERVERS } from './fixtures.mjs';

const text = (t) => ({ type: 'text', text: t });
const use = (id, name, input) => ({ type: 'tool_use', id, name, input });
const reply = (stop_reason, ...content) => ({ stop_reason, content });

function makeClient(responses) {
  const calls = [];
  let i = 0;
  return {
    calls,
    beta: {
      messages: {
        create: async (params) => {
          calls.push(JSON.parse(JSON.stringify(params)));
          const next = typeof responses === 'function' ? responses(calls.length) : responses[i++];
          if (next instanceof Error) throw next;
          return next;
        },
      },
    },
  };
}

function makeCtx({ failDb = false } = {}) {
  const calls = [];
  return {
    calls,
    url: 'https://x.supabase.co',
    key: 'SECRET123',
    now: () => new Date('2026-11-04T03:00:00.000Z'),
    fetchServers: async () => {
      if (failDb) throw new Error('upstream');
      return SERVERS;
    },
    restRequest: async (args) => {
      calls.push(args);
      if (args.path.startsWith('/rest/v1/pending_actions') && args.method === 'POST') {
        return { status: 201, data: [{ id: 41 }] };
      }
      return { status: 200, data: [] };
    },
  };
}
const writes = (ctx) => ctx.calls.filter((c) => c.method && c.method !== 'GET');
const run = (client, ctx = makeCtx(), message = '점검해 줘') =>
  runAgent({ client, model: 'claude-opus-5-5', ctx, message });
const lastMessage = (call) => call.messages[call.messages.length - 1];

test('도구 없이 끝나면 답만 돌려준다', async () => {
  const client = makeClient([reply('end_turn', text('이상 없어요'))]);
  const result = await run(client);
  assert.deepEqual(result, { reply: '이상 없어요', steps: [], pending: [] });
  assert.equal(client.calls.length, 1);
});

test('읽기 도구를 실행하고 결과를 tool_result로 돌려준다', async () => {
  const assistant = [text('확인할게요'), use('t1', 'get_server_status', { serverId: 'db-01' })];
  const client = makeClient([reply('tool_use', ...assistant), reply('end_turn', text('db-01은 주의예요'))]);
  const result = await run(client);
  assert.equal(result.reply, 'db-01은 주의예요');
  assert.deepEqual(result.steps, [{ tool: 'get_server_status', input: { serverId: 'db-01' }, status: 'done' }]);
  const second = client.calls[1];
  assert.deepEqual(second.messages[1], { role: 'assistant', content: assistant });
  const results = lastMessage(second);
  assert.equal(results.role, 'user');
  assert.equal(results.content[0].type, 'tool_result');
  assert.equal(results.content[0].tool_use_id, 't1');
  assert.ok(!('is_error' in results.content[0]));
  assert.equal(JSON.parse(results.content[0].content).id, 'db-01');
});

test('도구가 여러 개면 한 개의 user 메시지에 tool_result를 모두 담는다', async () => {
  const client = makeClient([
    reply('tool_use', use('a', 'get_server_status', {}), use('b', 'get_cooling_temp', {})),
    reply('end_turn', text('끝')),
  ]);
  await run(client);
  const results = lastMessage(client.calls[1]).content;
  assert.deepEqual(results.map((r) => r.tool_use_id), ['a', 'b']);
});

test('변경 도구는 실행하지 않고 승인 대기만 만든다', async () => {
  const ctx = makeCtx();
  const client = makeClient([
    reply('tool_use', use('t1', 'restart_fan', { serverId: 'db-01' })),
    reply('end_turn', text('승인을 기다리고 있어요')),
  ]);
  const result = await run(client, ctx);
  assert.deepEqual(result.pending, [{ id: 41, tool: 'restart_fan', input: { serverId: 'db-01' } }]);
  assert.deepEqual(result.steps, [{ tool: 'restart_fan', input: { serverId: 'db-01' }, status: 'pending' }]);
  const w = writes(ctx);
  assert.equal(w.length, 1);
  assert.equal(w[0].path, '/rest/v1/pending_actions');
  assert.ok(!ctx.calls.some((c) => c.path.startsWith('/rest/v1/servers')));
  const content = lastMessage(client.calls[1]).content[0];
  assert.ok(content.content.includes('승인 대기'));
  assert.ok(!('is_error' in content));
});

test('잘못된 도구 입력은 is_error로 돌려주고 계속한다', async () => {
  const ctx = makeCtx();
  const client = makeClient([
    reply(
      'tool_use',
      use('a', 'get_server_status', { serverId: 'zzz' }),
      use('b', 'open_ticket', { serverId: 'db-01', title: 'x'.repeat(81), priority: 'high' }),
    ),
    reply('end_turn', text('없는 서버예요')),
  ]);
  const result = await run(client, ctx);
  const results = lastMessage(client.calls[1]).content;
  assert.equal(results[0].is_error, true);
  assert.equal(results[1].is_error, true);
  assert.deepEqual(result.steps.map((s) => s.status), ['error', 'error']);
  assert.equal(writes(ctx).length, 0);
  assert.equal(result.reply, '없는 서버예요');
});

test('알 수 없는 도구 이름은 is_error', async () => {
  const client = makeClient([reply('tool_use', use('a', 'nope', {})), reply('end_turn', text('네'))]);
  const result = await run(client);
  assert.equal(lastMessage(client.calls[1]).content[0].is_error, true);
  assert.equal(result.steps[0].status, 'error');
});

test('도구만 계속 부르면 정확히 6번에서 멈춘다', async () => {
  const client = makeClient(() => reply('tool_use', use('t', 'get_cooling_temp', {})));
  const result = await run(client);
  assert.equal(MAX_ITERATIONS, 6);
  assert.equal(client.calls.length, 6);
  assert.ok(result.reply.includes('여기까지 확인했어요'));
  assert.equal(result.steps.length, 6);
});

test('refusal이면 고정 안내', async () => {
  const result = await run(makeClient([reply('refusal')]));
  assert.equal(result.reply, '이 요청은 도와드릴 수 없어요');
});

test('max_tokens로 끊기면 지금까지의 답에 안내를 붙인다', async () => {
  const result = await run(makeClient([reply('max_tokens', text('온도가 높아서'))]));
  assert.equal(result.reply, '온도가 높아서\n(답이 길어서 여기서 끊겼어요)');
});

test('답이 비어 있어도 깨지지 않는다', async () => {
  const result = await run(makeClient([reply('end_turn')]));
  assert.equal(typeof result.reply, 'string');
  assert.ok(result.reply.length > 0);
});

test('DB 오류는 그대로 던진다', async () => {
  const client = makeClient([reply('tool_use', use('t1', 'get_server_status', {}))]);
  await assert.rejects(run(client, makeCtx({ failDb: true })), /upstream/);
});

test('모델 호출 오류는 그대로 던진다', async () => {
  const error = Object.assign(new Error('boom'), { status: 529 });
  await assert.rejects(run(makeClient([error])), (err) => err.status === 529);
});

test('요청 모양: 모델, 한도, 도구, 폴백, 노력 수준, 금지된 값이 없다', async () => {
  const client = makeClient([reply('end_turn', text('네'))]);
  await run(client, makeCtx(), '순회 점검 해줘');
  const params = client.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.max_tokens, 1500);
  assert.equal(params.system, SYSTEM_PROMPT);
  assert.deepEqual(params.tools, JSON.parse(JSON.stringify(TOOLS)));
  assert.deepEqual(params.messages, [{ role: 'user', content: '순회 점검 해줘' }]);
  assert.deepEqual(params.betas, ['server-side-fallback-2026-06-01']);
  assert.deepEqual(params.fallbacks, [{ model: 'claude-opus-4-8' }]);
  assert.deepEqual(params.output_config, { effort: 'medium' });
  for (const forbidden of ['temperature', 'top_p', 'top_k', 'thinking', 'tool_choice']) {
    assert.ok(!(forbidden in params), `${forbidden}을 보내면 안 된다`);
  }
});

test('시스템 프롬프트에 승인과 가상 데이터 규칙이 있다', () => {
  assert.ok(SYSTEM_PROMPT.includes('승인'));
  assert.ok(SYSTEM_PROMPT.includes('가상'));
  assert.ok(SYSTEM_PROMPT.includes('도구'));
});
