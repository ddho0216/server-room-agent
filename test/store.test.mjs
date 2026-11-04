import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  logActions,
  countRecent,
  createPending,
  claimPending,
  releasePending,
  rejectPending,
  listPending,
  listLog,
  listIncidents,
} from '../lib/store.mjs';

const NOW = new Date('2026-11-04T03:00:00.000Z');

function makeCtx(reply = () => ({ status: 200, data: [] })) {
  const calls = [];
  return {
    calls,
    url: 'https://x.supabase.co',
    key: 'SECRET123',
    now: () => NOW,
    restRequest: async (args) => {
      calls.push(args);
      return reply(args);
    },
  };
}

test('logActions는 한 번의 POST에 행 배열을 보낸다', async () => {
  const ctx = makeCtx();
  await logActions(ctx, [
    { actor: 'agent', tool: 'get_server_status', input: { serverId: 'db-01' }, result: 'ok' },
    { actor: 'user', tool: 'restart_fan', input: {}, result: '완료', approved: true },
  ]);
  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.calls[0].method, 'POST');
  assert.equal(ctx.calls[0].path, '/rest/v1/action_log');
  assert.deepEqual(ctx.calls[0].body[0], {
    actor: 'agent',
    tool: 'get_server_status',
    input: { serverId: 'db-01' },
    result: 'ok',
    approved: null,
  });
  assert.equal(ctx.calls[0].body[1].approved, true);
});

test('logActions는 행이 없으면 요청하지 않는다', async () => {
  const ctx = makeCtx();
  await logActions(ctx, []);
  assert.equal(ctx.calls.length, 0);
});

test('logActions는 긴 결과를 500자로 줄인다', async () => {
  const ctx = makeCtx();
  await logActions(ctx, [{ actor: 'agent', tool: 't', input: {}, result: 'x'.repeat(900) }]);
  assert.equal(ctx.calls[0].body[0].result.length, 500);
});

test('countRecent는 시각·종류 조건과 건수 헤더를 쓴다', async () => {
  const ctx = makeCtx(() => ({ status: 200, data: [], count: 7 }));
  const count = await countRecent(ctx, { table: 'action_log', tool: 'agent_run', minutes: 60, now: NOW });
  assert.equal(count, 7);
  const since = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
  assert.ok(ctx.calls[0].path.includes(`created_at=gte.${encodeURIComponent(since)}`));
  assert.ok(ctx.calls[0].path.includes('tool=eq.agent_run'));
  assert.equal(ctx.calls[0].headers.Prefer, 'count=exact');
});

test('countRecent는 건수가 없으면 0', async () => {
  const ctx = makeCtx(() => ({ status: 200, data: [] }));
  assert.equal(await countRecent(ctx, { table: 'action_log', minutes: 60, now: NOW }), 0);
});

test('countRecent는 허용한 테이블만 센다', async () => {
  const ctx = makeCtx();
  await assert.rejects(countRecent(ctx, { table: 'servers?x', minutes: 1, now: NOW }), /table/);
});

test('createPending은 return=representation으로 id를 돌려받는다', async () => {
  const ctx = makeCtx(() => ({ status: 201, data: [{ id: 12 }] }));
  const result = await createPending(ctx, { tool: 'restart_fan', input: { serverId: 'db-01' } });
  assert.deepEqual(result, { id: 12 });
  assert.equal(ctx.calls[0].path, '/rest/v1/pending_actions');
  assert.equal(ctx.calls[0].headers.Prefer, 'return=representation');
  assert.deepEqual(ctx.calls[0].body, { tool: 'restart_fan', input: { serverId: 'db-01' } });
});

test('createPending은 id를 못 받으면 upstream 오류', async () => {
  const ctx = makeCtx(() => ({ status: 201, data: [] }));
  await assert.rejects(createPending(ctx, { tool: 'restart_fan', input: {} }), /upstream/);
});

test('claimPending은 대기 중인 행만 approved로 바꾸고 행을 돌려준다', async () => {
  const ctx = makeCtx(() => ({ status: 200, data: [{ id: 5, tool: 'restart_fan', input: { serverId: 'db-01' } }] }));
  const row = await claimPending(ctx, 5);
  assert.deepEqual(row, { id: 5, tool: 'restart_fan', input: { serverId: 'db-01' } });
  assert.equal(ctx.calls[0].method, 'PATCH');
  assert.equal(ctx.calls[0].path, '/rest/v1/pending_actions?id=eq.5&status=eq.pending');
  assert.deepEqual(ctx.calls[0].body, { status: 'approved', decided_at: NOW.toISOString() });
  assert.equal(ctx.calls[0].headers.Prefer, 'return=representation');
});

test('claimPending은 이미 처리된 행이면 null', async () => {
  const ctx = makeCtx(() => ({ status: 200, data: [] }));
  assert.equal(await claimPending(ctx, 5), null);
});

test('id가 정수가 아니면 요청하지 않고 거절한다', async () => {
  const ctx = makeCtx();
  for (const id of ['5', 5.5, 0, -1, null, undefined, '1;drop']) {
    await assert.rejects(claimPending(ctx, id), /id/);
    await assert.rejects(rejectPending(ctx, id), /id/);
    await assert.rejects(releasePending(ctx, id), /id/);
  }
  assert.equal(ctx.calls.length, 0);
});

test('releasePending은 상태를 다시 pending으로', async () => {
  const ctx = makeCtx();
  await releasePending(ctx, 5);
  assert.equal(ctx.calls[0].path, '/rest/v1/pending_actions?id=eq.5');
  assert.deepEqual(ctx.calls[0].body, { status: 'pending', decided_at: null });
});

test('rejectPending은 대기 중일 때만 rejected로 바꾸고 결과를 알려 준다', async () => {
  const yes = makeCtx(() => ({ status: 200, data: [{ id: 5 }] }));
  assert.equal(await rejectPending(yes, 5), true);
  assert.equal(yes.calls[0].path, '/rest/v1/pending_actions?id=eq.5&status=eq.pending');
  assert.equal(yes.calls[0].body.status, 'rejected');
  const no = makeCtx(() => ({ status: 200, data: [] }));
  assert.equal(await rejectPending(no, 5), false);
});

test('listPending, listLog, listIncidents의 요청', async () => {
  const ctx = makeCtx(() => ({ status: 200, data: [{ id: 1 }] }));
  assert.deepEqual(await listPending(ctx), [{ id: 1 }]);
  assert.ok(ctx.calls[0].path.includes('status=eq.pending'));
  assert.ok(ctx.calls[0].path.includes('limit=10'));
  await listLog(ctx, 8);
  assert.ok(ctx.calls[1].path.startsWith('/rest/v1/action_log?'));
  assert.ok(ctx.calls[1].path.includes('limit=8'));
  await listIncidents(ctx, 5);
  assert.ok(ctx.calls[2].path.startsWith('/rest/v1/incidents?'));
  assert.ok(ctx.calls[2].path.includes('limit=5'));
});

test('목록은 배열이 아닌 응답을 upstream 오류로 본다', async () => {
  const ctx = makeCtx(() => ({ status: 200, data: {} }));
  await assert.rejects(listPending(ctx), /upstream/);
  await assert.rejects(listLog(ctx, 5), /upstream/);
  await assert.rejects(listIncidents(ctx, 5), /upstream/);
});
