import { coolingReading } from './cooling.mjs';
import { createPending, listIncidents, listLog } from './store.mjs';

export class ToolInputError extends Error {}

const PRIORITIES = ['low', 'normal', 'high'];
const CATEGORIES = ['server', 'power', 'network', 'access', 'other'];

export const TOOLS = [
  {
    name: 'get_server_status',
    description:
      '서버실 서버의 상태(상태, 온도, 팬, 진행 중인 사고)를 읽는다. serverId를 주면 한 대만, 안 주면 전체 서버를 돌려준다. 상태를 바꾸지 않는다.',
    input_schema: {
      type: 'object',
      properties: { serverId: { type: 'string', description: '서버 id. 예: db-01' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_cooling_temp',
    description: '냉각기의 공급 공기 온도와 돌아오는 공기 온도(°C)를 읽는다. 상태를 바꾸지 않는다.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_logs',
    description: '최근 사고 기록과 작업 기록을 읽는다. 상태를 바꾸지 않는다.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 20, description: '가져올 건수, 기본 10' } },
      additionalProperties: false,
    },
  },
  {
    name: 'restart_fan',
    description:
      '서버의 팬을 다시 돌린다. 서버 상태를 바꾸므로 사용자 승인이 있어야 실행되고, 호출하면 승인 대기만 만들어진다.',
    input_schema: {
      type: 'object',
      properties: { serverId: { type: 'string' } },
      required: ['serverId'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_ticket',
    description:
      '서버 문제나 고객 문의에 대한 티켓을 연다. 서버와 관련 있으면 serverId를 주고, 고객 문의처럼 서버와 무관하면 생략한다. 고객 문의면 category와 답변 초안(reply)을 함께 준다. 사용자 승인이 있어야 실행되고, 호출하면 승인 대기만 만들어진다.',
    input_schema: {
      type: 'object',
      properties: {
        serverId: { type: 'string' },
        title: { type: 'string', maxLength: 80 },
        priority: { type: 'string', enum: PRIORITIES },
        category: { type: 'string', enum: CATEGORIES },
        reply: { type: 'string', maxLength: 500, description: '고객에게 보낼 답변 초안' },
      },
      required: ['title', 'priority'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_report',
    description: '순회 점검 보고서를 저장한다. 사용자 승인이 있어야 실행되고, 호출하면 승인 대기만 만들어진다.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['patrol'] },
        body: { type: 'string', maxLength: 1500 },
      },
      required: ['kind', 'body'],
      additionalProperties: false,
    },
  },
];

export const CHANGE_TOOLS = ['restart_fan', 'open_ticket', 'save_report'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkInput(input, allowed) {
  if (!isPlainObject(input)) throw new ToolInputError('입력이 올바르지 않아요');
  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new ToolInputError('알 수 없는 입력 칸이 있어요');
  }
}

function requireServer(servers, serverId) {
  if (typeof serverId !== 'string') throw new ToolInputError('serverId가 필요해요');
  const server = servers.find((s) => s.id === serverId);
  if (!server) throw new ToolInputError(`없는 서버예요: ${serverId}`);
  return server;
}

function call(ctx, args) {
  return ctx.restRequest({ url: ctx.url, key: ctx.key, ...args });
}

export async function runReadTool(ctx, name, input) {
  if (name === 'get_server_status') {
    checkInput(input, ['serverId']);
    const servers = await ctx.fetchServers({ url: ctx.url, key: ctx.key });
    if (input.serverId === undefined) return JSON.stringify(servers);
    return JSON.stringify(requireServer(servers, input.serverId));
  }
  if (name === 'get_cooling_temp') {
    checkInput(input, []);
    const servers = await ctx.fetchServers({ url: ctx.url, key: ctx.key });
    return JSON.stringify(coolingReading(servers));
  }
  if (name === 'read_logs') {
    checkInput(input, ['limit']);
    const limit = input.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw new ToolInputError('limit은 1에서 20 사이의 정수여야 해요');
    }
    const [incidents, log] = await Promise.all([listIncidents(ctx, limit), listLog(ctx, limit)]);
    return JSON.stringify({ incidents, log });
  }
  throw new ToolInputError('알 수 없는 도구예요');
}

function normalizeChange(name, input, servers) {
  if (name === 'restart_fan') {
    checkInput(input, ['serverId']);
    requireServer(servers, input.serverId);
    return { serverId: input.serverId };
  }
  if (name === 'open_ticket') {
    checkInput(input, ['serverId', 'title', 'priority', 'category', 'reply']);
    const ticket = {};
    if (input.serverId !== undefined) {
      requireServer(servers, input.serverId);
      ticket.serverId = input.serverId;
    }
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (title.length < 1 || title.length > 80) throw new ToolInputError('title은 1~80자여야 해요');
    if (!PRIORITIES.includes(input.priority)) throw new ToolInputError('priority는 low, normal, high 중 하나예요');
    ticket.title = title;
    ticket.priority = input.priority;
    if (input.category !== undefined) {
      if (!CATEGORIES.includes(input.category)) throw new ToolInputError('category가 올바르지 않아요');
      ticket.category = input.category;
    }
    if (input.reply !== undefined) {
      const reply = typeof input.reply === 'string' ? input.reply.trim() : '';
      if (reply.length < 1 || reply.length > 500) throw new ToolInputError('reply는 1~500자여야 해요');
      ticket.reply = reply;
    }
    return ticket;
  }
  if (name === 'save_report') {
    checkInput(input, ['kind', 'body']);
    if (input.kind !== 'patrol') throw new ToolInputError('kind는 patrol만 가능해요');
    const body = typeof input.body === 'string' ? input.body.trim() : '';
    if (body.length < 1 || body.length > 1500) throw new ToolInputError('body는 1~1500자여야 해요');
    return { kind: 'patrol', body };
  }
  throw new ToolInputError('알 수 없는 도구예요');
}

export async function proposeChange(ctx, name, input) {
  if (!CHANGE_TOOLS.includes(name)) throw new ToolInputError('알 수 없는 도구예요');
  const servers = await ctx.fetchServers({ url: ctx.url, key: ctx.key });
  const normalized = normalizeChange(name, input, servers);
  return createPending(ctx, { tool: name, input: normalized });
}

export async function applyChange(ctx, { tool, input }) {
  if (!CHANGE_TOOLS.includes(tool)) throw new ToolInputError('알 수 없는 도구예요');
  const servers = await ctx.fetchServers({ url: ctx.url, key: ctx.key });
  const data = normalizeChange(tool, input, servers);
  const now = (ctx.now ?? (() => new Date()))();

  if (tool === 'restart_fan') {
    const server = requireServer(servers, data.serverId);
    const patch = { fan_ok: true, temp_c: 48 };
    if (server.issue === 'temp') Object.assign(patch, { status: 'ok', issue: null });
    await call(ctx, {
      method: 'PATCH',
      path: `/rest/v1/servers?id=eq.${encodeURIComponent(data.serverId)}`,
      body: patch,
    });
    return `${data.serverId}의 팬을 다시 돌렸어요`;
  }
  if (tool === 'open_ticket') {
    const category = data.category ?? (data.serverId ? 'server' : 'other');
    const head = data.serverId ? `${data.serverId}: ${data.title}` : data.title;
    await call(ctx, {
      method: 'POST',
      path: '/rest/v1/tickets',
      body: {
        source: 'agent',
        category,
        priority: data.priority,
        body: data.reply ? `${head}\n답변 초안: ${data.reply}` : head,
      },
    });
    return `티켓을 열었어요 (${data.priority})`;
  }
  await call(ctx, {
    method: 'POST',
    path: '/rest/v1/reports',
    body: { kind: data.kind, period: now.toISOString().slice(0, 10), body: data.body },
  });
  return '보고서를 저장했어요';
}
