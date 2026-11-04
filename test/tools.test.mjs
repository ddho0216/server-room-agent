import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOLS,
  CHANGE_TOOLS,
  ToolInputError,
  runReadTool,
  proposeChange,
  applyChange,
} from '../lib/tools.mjs';
import { SERVERS } from './fixtures.mjs';

const NOW = new Date('2026-11-04T03:00:00.000Z');

function makeCtx({ servers = SERVERS } = {}) {
  const calls = [];
  return {
    calls,
    url: 'https://x.supabase.co',
    key: 'SECRET123',
    now: () => NOW,
    fetchServers: async () => servers,
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

test('도구는 6개이고 모두 additionalProperties가 false', () => {
  assert.deepEqual(TOOLS.map((t) => t.name), [
    'get_server_status',
    'get_cooling_temp',
    'read_logs',
    'restart_fan',
    'open_ticket',
    'save_report',
  ]);
  for (const tool of TOOLS) {
    assert.equal(tool.input_schema.additionalProperties, false, tool.name);
    assert.equal(typeof tool.description, 'string');
  }
  assert.deepEqual(CHANGE_TOOLS, ['restart_fan', 'open_ticket', 'save_report']);
});

test('get_server_status: 전체와 한 대', async () => {
  const all = JSON.parse(await runReadTool(makeCtx(), 'get_server_status', {}));
  assert.equal(all.length, 4);
  const one = JSON.parse(await runReadTool(makeCtx(), 'get_server_status', { serverId: 'db-01' }));
  assert.equal(one.id, 'db-01');
});

test('get_server_status: 없는 서버, 잘못된 입력은 ToolInputError', async () => {
  await assert.rejects(runReadTool(makeCtx(), 'get_server_status', { serverId: 'zzz' }), ToolInputError);
  await assert.rejects(runReadTool(makeCtx(), 'get_server_status', { serverId: 7 }), ToolInputError);
  await assert.rejects(runReadTool(makeCtx(), 'get_server_status', { other: 1 }), ToolInputError);
  await assert.rejects(runReadTool(makeCtx(), 'get_server_status', 'db-01'), ToolInputError);
  await assert.rejects(runReadTool(makeCtx(), 'get_server_status', null), ToolInputError);
});

test('get_cooling_temp는 냉각기 값을 돌려준다', async () => {
  const result = JSON.parse(await runReadTool(makeCtx(), 'get_cooling_temp', {}));
  assert.deepEqual(result, { supplyC: 18, returnC: 37, status: 'warn' });
});

test('read_logs: 기본 10건, 범위 밖은 거절', async () => {
  const ctx = makeCtx();
  const result = JSON.parse(await runReadTool(ctx, 'read_logs', {}));
  assert.deepEqual(Object.keys(result).sort(), ['incidents', 'log']);
  assert.ok(ctx.calls.some((c) => c.path.includes('limit=10')));
  for (const limit of [0, 21, 99, 1.5, '5']) {
    await assert.rejects(runReadTool(makeCtx(), 'read_logs', { limit }), ToolInputError);
  }
});

test('알 수 없는 읽기 도구는 ToolInputError', async () => {
  await assert.rejects(runReadTool(makeCtx(), 'delete_everything', {}), ToolInputError);
  await assert.rejects(runReadTool(makeCtx(), 'restart_fan', { serverId: 'db-01' }), ToolInputError);
});

test('proposeChange는 대기만 만들고 서버를 바꾸지 않는다', async () => {
  const ctx = makeCtx();
  const result = await proposeChange(ctx, 'restart_fan', { serverId: 'db-01' });
  assert.deepEqual(result, { id: 41 });
  const w = writes(ctx);
  assert.equal(w.length, 1);
  assert.equal(w[0].path, '/rest/v1/pending_actions');
});

test('proposeChange: 잘못된 입력은 DB를 바꾸지 않는다', async () => {
  const bad = [
    ['restart_fan', { serverId: 'zzz' }],
    ['restart_fan', {}],
    ['open_ticket', { serverId: 'db-01', title: 'x'.repeat(81), priority: 'high' }],
    ['open_ticket', { serverId: 'db-01', title: '', priority: 'high' }],
    ['open_ticket', { serverId: 'db-01', title: '확인', priority: 'urgent' }],
    ['open_ticket', { serverId: 'zzz', title: '확인', priority: 'low' }],
    ['save_report', { kind: 'monthly', body: '내용' }],
    ['save_report', { kind: 'patrol', body: '' }],
    ['save_report', { kind: 'patrol', body: 'x'.repeat(1501) }],
    ['get_server_status', {}],
    ['nope', {}],
  ];
  for (const [name, input] of bad) {
    const ctx = makeCtx();
    await assert.rejects(proposeChange(ctx, name, input), ToolInputError, `${name} ${JSON.stringify(input)}`);
    assert.equal(writes(ctx).length, 0, `${name} 쓰기 없음`);
  }
});

test('proposeChange는 정상 티켓·보고서 입력을 저장한다', async () => {
  const ctx = makeCtx();
  await proposeChange(ctx, 'open_ticket', { serverId: 'db-01', title: '  팬 점검  ', priority: 'high' });
  assert.deepEqual(writes(ctx)[0].body.input, { serverId: 'db-01', title: '팬 점검', priority: 'high' });
  const ctx2 = makeCtx();
  await proposeChange(ctx2, 'save_report', { kind: 'patrol', body: '이상 없음' });
  assert.equal(writes(ctx2)[0].body.tool, 'save_report');
});

test('applyChange restart_fan: 온도 사고였으면 정상으로 되돌린다', async () => {
  const ctx = makeCtx({ servers: SERVERS.map((s) => (s.id === 'db-01' ? { ...s, issue: 'temp' } : s)) });
  const result = await applyChange(ctx, { tool: 'restart_fan', input: { serverId: 'db-01' } });
  assert.ok(result.includes('db-01'));
  const patch = writes(ctx)[0];
  assert.equal(patch.method, 'PATCH');
  assert.equal(patch.path, '/rest/v1/servers?id=eq.db-01');
  assert.deepEqual(patch.body, { fan_ok: true, temp_c: 48, status: 'ok', issue: null });
});

test('applyChange restart_fan: 디스크 사고는 상태를 건드리지 않는다', async () => {
  const ctx = makeCtx({ servers: SERVERS.map((s) => (s.id === 'db-01' ? { ...s, issue: 'disk' } : s)) });
  await applyChange(ctx, { tool: 'restart_fan', input: { serverId: 'db-01' } });
  assert.deepEqual(writes(ctx)[0].body, { fan_ok: true, temp_c: 48 });
});

test('applyChange restart_fan: 서버가 사라졌으면 ToolInputError', async () => {
  const ctx = makeCtx();
  await assert.rejects(applyChange(ctx, { tool: 'restart_fan', input: { serverId: 'gone' } }), ToolInputError);
  assert.equal(writes(ctx).length, 0);
});

test('applyChange open_ticket과 save_report', async () => {
  const ctx = makeCtx();
  await applyChange(ctx, { tool: 'open_ticket', input: { serverId: 'db-01', title: '팬 점검', priority: 'high' } });
  const ticket = writes(ctx)[0];
  assert.equal(ticket.path, '/rest/v1/tickets');
  assert.deepEqual(ticket.body, { source: 'agent', category: 'server', priority: 'high', body: 'db-01: 팬 점검' });
  await applyChange(ctx, { tool: 'save_report', input: { kind: 'patrol', body: '이상 없음' } });
  const report = writes(ctx)[1];
  assert.equal(report.path, '/rest/v1/reports');
  assert.deepEqual(report.body, { kind: 'patrol', period: '2026-11-04', body: '이상 없음' });
});

test('applyChange: 목록에 없는 도구는 ToolInputError', async () => {
  await assert.rejects(applyChange(makeCtx(), { tool: 'get_server_status', input: {} }), ToolInputError);
});
