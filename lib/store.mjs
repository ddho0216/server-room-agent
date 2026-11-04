const RESULT_LIMIT = 500;
const COUNT_TABLES = new Set(['action_log', 'incidents']);

function assertId(id) {
  if (!Number.isInteger(id) || id < 1) throw new Error('invalid id');
}

function nowOf(ctx) {
  return (ctx.now ?? (() => new Date()))();
}

function call(ctx, args) {
  return ctx.restRequest({ url: ctx.url, key: ctx.key, ...args });
}

function asArray(data) {
  if (!Array.isArray(data)) throw new Error('upstream');
  return data;
}

export async function logActions(ctx, rows) {
  if (rows.length === 0) return;
  await call(ctx, {
    method: 'POST',
    path: '/rest/v1/action_log',
    body: rows.map((r) => ({
      actor: r.actor,
      tool: r.tool,
      input: r.input ?? null,
      result: r.result == null ? null : String(r.result).slice(0, RESULT_LIMIT),
      approved: r.approved ?? null,
    })),
  });
}

export async function countRecent(ctx, { table, tool, minutes, now }) {
  if (!COUNT_TABLES.has(table)) throw new Error('table not allowed');
  const since = new Date(now.getTime() - minutes * 60 * 1000).toISOString();
  const column = table === 'incidents' ? 'started_at' : 'created_at';
  let path = `/rest/v1/${table}?select=id&${column}=gte.${encodeURIComponent(since)}`;
  if (tool) path += `&tool=eq.${encodeURIComponent(tool)}`;
  const { count } = await call(ctx, { path, headers: { Prefer: 'count=exact', Range: '0-0' } });
  return count ?? 0;
}

export async function createPending(ctx, { tool, input }) {
  const { data } = await call(ctx, {
    method: 'POST',
    path: '/rest/v1/pending_actions',
    body: { tool, input },
    headers: { Prefer: 'return=representation' },
  });
  const id = Array.isArray(data) ? data[0]?.id : undefined;
  if (!Number.isInteger(id)) throw new Error('upstream');
  return { id };
}

async function decide(ctx, id, status) {
  assertId(id);
  const { data } = await call(ctx, {
    method: 'PATCH',
    path: `/rest/v1/pending_actions?id=eq.${id}&status=eq.pending`,
    body: { status, decided_at: nowOf(ctx).toISOString() },
    headers: { Prefer: 'return=representation' },
  });
  return Array.isArray(data) ? data : [];
}

export async function claimPending(ctx, id) {
  const rows = await decide(ctx, id, 'approved');
  return rows[0] ?? null;
}

export async function rejectPending(ctx, id) {
  const rows = await decide(ctx, id, 'rejected');
  return rows.length > 0;
}

export async function releasePending(ctx, id) {
  assertId(id);
  await call(ctx, {
    method: 'PATCH',
    path: `/rest/v1/pending_actions?id=eq.${id}`,
    body: { status: 'pending', decided_at: null },
  });
}

export async function listPending(ctx) {
  const { data } = await call(ctx, {
    path: '/rest/v1/pending_actions?select=id,tool,input,created_at&status=eq.pending&order=id.desc&limit=10',
  });
  return asArray(data);
}

export async function listLog(ctx, limit) {
  const { data } = await call(ctx, {
    path: `/rest/v1/action_log?select=id,actor,tool,result,approved,created_at&order=id.desc&limit=${limit}`,
  });
  return asArray(data);
}

export async function listIncidents(ctx, limit) {
  const { data } = await call(ctx, {
    path: `/rest/v1/incidents?select=server_id,type,started_at,resolved_at&order=id.desc&limit=${limit}`,
  });
  return asArray(data);
}
