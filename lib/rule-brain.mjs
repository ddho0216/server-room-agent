// 규칙 뇌: AI 모델 대신 키워드 규칙표로 다음 행동을 정합니다.
// client.beta.messages.create와 같은 모양의 응답을 돌려주므로 runAgent(루프, 도구, 승인, 기록)는 그대로 쓰입니다.
// 상태를 저장하지 않고 매번 params.messages(사용자 말과 도구 결과)만 보고 결정합니다.

const STATUS = { ok: '정상', warn: '주의', down: '장애' };
const ISSUE = { temp: '온도 상승', disk: '디스크 경고', network: '네트워크 끊김' };

const serverIdOf = (text) => text.match(/[a-z]+-\d+/i)?.[0].toLowerCase();

function detectIntent(text) {
  if (/티켓/.test(text)) return 'ticket';
  if (/보고서/.test(text)) return 'report';
  if (/기록|로그|이력/.test(text)) return 'logs';
  if (serverIdOf(text)) return 'server';
  if (/순회|점검|전체|한 바퀴|돌아/.test(text)) return 'patrol';
  if (/냉각|온도|에어컨/.test(text)) return 'cooling';
  return 'help';
}

function readsFor(intent, serverId) {
  if (intent === 'patrol' || intent === 'report') {
    return [
      { name: 'get_server_status', input: {} },
      { name: 'get_cooling_temp', input: {} },
    ];
  }
  if (intent === 'server' || intent === 'ticket') {
    return serverId ? [{ name: 'get_server_status', input: { serverId } }] : [];
  }
  if (intent === 'cooling') return [{ name: 'get_cooling_temp', input: {} }];
  if (intent === 'logs') return [{ name: 'read_logs', input: {} }];
  return [];
}

// 지금까지 부른 도구와 그 결과를 짝지어 모은다.
function collect(messages) {
  const uses = new Map();
  const history = [];
  for (const message of messages.slice(1)) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (message.role === 'assistant' && block.type === 'tool_use') uses.set(block.id, block);
      if (message.role === 'user' && block.type === 'tool_result') {
        const use = uses.get(block.tool_use_id);
        if (use) history.push({ name: use.name, input: use.input, content: block.content, isError: block.is_error === true });
      }
    }
  }
  return { history, toolUseCount: uses.size };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const findCall = (history, call) => history.find((h) => h.name === call.name && same(h.input, call.input));

function problemProposals(servers) {
  const out = [];
  for (const s of servers) {
    if (s.issue === 'temp' || s.fanOk === false) {
      out.push({ name: 'restart_fan', input: { serverId: s.id } });
    }
    if (s.issue === 'disk' || s.issue === 'network' || s.status === 'down') {
      out.push({
        name: 'open_ticket',
        input: {
          serverId: s.id,
          title: ISSUE[s.issue] ?? '장애 확인',
          priority: s.status === 'down' ? 'high' : 'normal',
        },
      });
    }
  }
  return out;
}

function serverLine(s) {
  const extras = [];
  if (ISSUE[s.issue]) extras.push(ISSUE[s.issue]);
  if (s.fanOk === false) extras.push('팬 멈춤');
  return `${s.id}: ${STATUS[s.status] ?? '알 수 없음'}, ${s.tempC}°C${extras.length ? ` (${extras.join(', ')})` : ''}`;
}

function coolingLine(c) {
  return `냉각기: 공급 ${c.supplyC}°C, 돌아오는 공기 ${c.returnC}°C (${STATUS[c.status] ?? '알 수 없음'})`;
}

function reportBody(servers, cooling, proposalCount) {
  const lines = ['순회 점검 보고서', ...servers.map((s) => `- ${serverLine(s)}`)];
  if (cooling) lines.push(`- ${coolingLine(cooling)}`);
  lines.push(proposalCount > 0 ? `- 조치 제안 ${proposalCount}건 (승인 대기)` : '- 이상 없음');
  return lines.join('\n').slice(0, 1500);
}

const HELP =
  '저는 이런 일을 도와드려요: 순회 점검, 서버 확인(예: db-01 확인해 줘), 냉각기 온도, 기록 보기, 순회 보고서, 티켓 열기. ' +
  '상태를 바꾸는 조치는 제안만 하고, 선배가 승인하면 실행돼요. (규칙으로 움직이는 시뮬레이션이에요)';

const text = (value) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: value }] });

export function createRuleClient() {
  async function create(params) {
    const messages = params.messages;
    const userText = String(Array.isArray(messages[0].content) ? '' : messages[0].content ?? '');
    const intent = detectIntent(userText);
    const serverId = serverIdOf(userText);
    const { history, toolUseCount } = collect(messages);
    let counter = toolUseCount;
    const toolUse = (calls) => ({
      stop_reason: 'tool_use',
      content: calls.map((call) => ({
        type: 'tool_use',
        id: `rule_${++counter}`,
        name: call.name,
        input: call.input,
      })),
    });

    if (intent === 'help') return text(HELP);
    if (intent === 'ticket' && !serverId) return text('어느 서버의 티켓인지 알려 주세요. 예: db-01 티켓 열어 줘');

    // 1) 읽기
    const reads = readsFor(intent, serverId);
    const missingReads = reads.filter((call) => !findCall(history, call));
    if (missingReads.length > 0) return toolUse([missingReads[0]]);

    const failed = reads.map((call) => findCall(history, call)).find((h) => h?.isError);
    if (failed) return text(`확인하지 못했어요: ${failed.content}`);

    const results = reads.map((call) => findCall(history, call));
    const parse = (name) => {
      const found = results.find((h) => h?.name === name);
      return found ? JSON.parse(found.content) : undefined;
    };
    const statusData = parse('get_server_status');
    const servers = statusData === undefined ? [] : Array.isArray(statusData) ? statusData : [statusData];
    const cooling = parse('get_cooling_temp');
    const logs = parse('read_logs');

    // 2) 제안
    let proposals = [];
    if (intent === 'patrol' || intent === 'server') proposals = problemProposals(servers);
    if (intent === 'report') {
      proposals = problemProposals(servers);
      proposals.push({
        name: 'save_report',
        input: { kind: 'patrol', body: reportBody(servers, cooling, problemProposals(servers).length) },
      });
    }
    if (intent === 'ticket') {
      proposals = [{ name: 'open_ticket', input: { serverId, title: '점검 요청', priority: 'normal' } }];
    }
    const missingProposals = proposals.filter((call) => !findCall(history, call));
    if (missingProposals.length > 0) return toolUse(missingProposals);

    // 3) 마지막 답
    const made = proposals.filter((call) => findCall(history, call) && !findCall(history, call).isError);
    const failedProposals = proposals.length - made.length;
    const note = failedProposals > 0 ? ' (일부 제안은 만들지 못했어요)' : '';
    const waiting = made.length > 0 ? `조치를 ${made.length}건 제안했어요. 승인을 기다리고 있어요.${note}` : '이상 없어요.';

    if (intent === 'cooling') return text(`${coolingLine(cooling)}.`);
    if (intent === 'logs') {
      return text(`최근 사고 ${logs?.incidents?.length ?? 0}건, 작업 기록 ${logs?.log?.length ?? 0}건이에요.`);
    }
    if (intent === 'ticket') return text(`${serverId} 점검 티켓을 제안했어요. 승인을 기다리고 있어요.${note}`);
    if (intent === 'server') return text(`${servers.map(serverLine).join('\n')}\n${waiting}`);
    const lines = ['순회 점검 결과예요.', ...servers.map(serverLine)];
    if (cooling) lines.push(coolingLine(cooling));
    lines.push(intent === 'report' ? `보고서 저장도 제안했어요. ${waiting}` : waiting);
    return text(lines.join('\n'));
  }

  return { beta: { messages: { create } } };
}
