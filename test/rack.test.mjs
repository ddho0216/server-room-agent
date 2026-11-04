import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVERS } from './fixtures.mjs';
import {
  renderRack,
  renderError,
  renderIncidentPanel,
  renderChat,
  renderSteps,
  renderPending,
  renderLog,
} from '../public/rack.mjs';

const count = (text, needle) => text.split(needle).length - 1;

test('서버 4대가 data-server-id로 나온다', () => {
  assert.equal(count(renderRack(SERVERS), 'data-server-id="'), 4);
});

test('주의 서버에 led-warn이 붙는다', () => {
  const html = renderRack(SERVERS);
  assert.equal(count(html, 'led-warn'), 1);
  assert.equal(count(html, 'led-ok'), 3);
});

test('이름의 HTML은 글자로 나온다', () => {
  const html = renderRack([{ ...SERVERS[0], name: '<script>alert(1)</script>' }]);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('빈 목록이면 안내가 나온다', () => {
  assert.ok(renderRack([]).includes('서버가 없어요'));
});

test('renderError는 불러오지 못했어요 안내를 돌려준다', () => {
  assert.ok(renderError().includes('불러오지 못했어요'));
});

test('알 수 없는 상태는 led-unknown과 알 수 없음으로 나온다', () => {
  const html = renderRack([{ ...SERVERS[0], status: 'boom' }]);
  assert.ok(html.includes('led-unknown'));
  assert.ok(html.includes('알 수 없음'));
});

test('모션 줄이기 설정에서 움직임을 모두 끈다', () => {
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  const start = css.indexOf('@media (prefers-reduced-motion');
  assert.ok(start >= 0, 'prefers-reduced-motion 블록이 없다');
  const before = css.slice(0, start);
  const block = css.slice(start);
  assert.ok(block.includes('animation: none'), 'animation: none이 없다');
  const animated = [...before.matchAll(/([^{}]+)\{[^}]*animation:\s*(?!none)/g)].map((m) => m[1].trim());
  assert.ok(animated.length >= 3, '움직이는 규칙이 3개 이상 있어야 한다');
  for (const selector of animated) {
    for (const part of selector.split(',').map((x) => x.trim())) {
      assert.ok(block.includes(part), `${part}가 모션 줄이기 블록에 없다`);
    }
  }
});

test('issue가 있는 서버에 사고 이름이 나온다', () => {
  const html = renderRack([{ ...SERVERS[0], issue: 'temp' }]);
  assert.ok(html.includes('class="issue"'));
  assert.ok(html.includes('온도 상승'));
});

test('issue가 없거나 모르는 값이어도 깨지지 않는다', () => {
  assert.ok(!renderRack([{ ...SERVERS[0], issue: null }]).includes('class="issue"'));
  assert.ok(!renderRack([{ ...SERVERS[0], issue: 'boom' }]).includes('class="issue"'));
  assert.ok(!renderRack([{ ...SERVERS[0], issue: '<script>' }]).includes('<script>'));
});

test('사고 패널에 서버 4개와 종류 3개 선택지가 있다', () => {
  const html = renderIncidentPanel(SERVERS);
  assert.equal(count(html, '<option value="web-01"'), 1);
  assert.equal((html.match(/<option value="(web-01|app-02|db-01|cache-01)"/g) || []).length, 4);
  for (const type of ['temp', 'disk', 'network']) assert.ok(html.includes(`<option value="${type}"`));
  assert.ok(html.includes('id="incident-go"'));
  assert.ok(html.includes('id="reset-go"'));
});

test('사고 패널은 서버 이름의 HTML을 이스케이프하고 서버가 없으면 비어 있다', () => {
  const html = renderIncidentPanel([{ ...SERVERS[0], id: 'a', name: '<b>x</b>' }]);
  assert.ok(!html.includes('<b>x</b>'));
  assert.equal(renderIncidentPanel([]), '');
});

test('서버마다 앞판, 드라이브 칸 4개, 통풍구, 이름판이 있다', () => {
  const html = renderRack(SERVERS);
  assert.equal(count(html, 'class="faceplate"'), 4);
  assert.equal(count(html, 'class="bay"'), 16);
  assert.equal(count(html, 'class="vent"'), 4);
  assert.equal(count(html, 'class="plate"'), 4);
});

test('서버 줄에 상태 클래스가 붙고 팬 상태가 보인다', () => {
  const html = renderRack(SERVERS);
  assert.equal(count(html, 'server--warn'), 1);
  assert.equal(count(html, 'server--ok'), 3);
  assert.equal(count(html, 'fan-off'), 1);
  assert.equal(count(html, 'fan-on'), 3);
  assert.ok(renderRack([{ ...SERVERS[0], status: 'boom' }]).includes('server--unknown'));
});

test('스타일에 서버실 디자인 규칙이 있다', () => {
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  for (const selector of ['.faceplate', '.bay', '.vent', '.fan', '.server--warn', '.panel']) {
    assert.ok(css.includes(selector), `${selector} 규칙이 없다`);
  }
});

test('외부 주소를 부르지 않는다', () => {
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.ok(!/url\(\s*['"]?https?:/i.test(css));
  assert.ok(!/@import/i.test(css));
});

test('renderChat에 입력칸, 보내기, 순회 점검, 답 자리가 있다', () => {
  const html = renderChat();
  assert.ok(html.includes('id="agent-input"'));
  assert.ok(html.includes('maxlength="300"'));
  assert.ok(html.includes('id="agent-send"'));
  assert.ok(html.includes('id="agent-patrol"'));
  assert.ok(html.includes('id="agent-reply"'));
});

test('renderSteps는 세 상태를 문구로 보여 주고 글자를 이스케이프한다', () => {
  const html = renderSteps([
    { tool: 'get_server_status', status: 'done' },
    { tool: 'restart_fan', status: 'pending' },
    { tool: 'open_ticket', status: 'error' },
    { tool: '<img src=x>', status: 'done' },
  ]);
  assert.ok(html.includes('확인: 서버 상태'));
  assert.ok(html.includes('제안: 팬 재가동'));
  assert.ok(html.includes('실패: 티켓 열기'));
  assert.ok(!html.includes('<img'));
  assert.equal(renderSteps([]), '');
  assert.equal(renderSteps(undefined), '');
});

test('renderPending은 카드마다 id와 승인·거절 버튼을 낸다', () => {
  const html = renderPending([
    { id: 5, tool: 'restart_fan', input: { serverId: 'db-01' } },
    { id: 6, tool: 'open_ticket', input: { serverId: 'db-01', title: '팬 점검', priority: 'high' } },
    { id: 7, tool: 'save_report', input: { kind: 'patrol', body: '이상 없음' } },
  ]);
  assert.equal(count(html, 'data-pending-id="'), 3);
  assert.equal(count(html, 'class="approve"'), 3);
  assert.equal(count(html, 'class="reject"'), 3);
  assert.ok(html.includes('팬 재가동'));
  assert.ok(html.includes('db-01'));
  assert.ok(html.includes('팬 점검'));
  assert.ok(html.includes('이상 없음'));
});

test('renderPending은 내용의 HTML을 이스케이프하고 비면 빈 문자열', () => {
  const html = renderPending([
    { id: 1, tool: 'open_ticket', input: { serverId: '<b>x</b>', title: '<script>alert(1)</script>', priority: 'low' } },
    { id: 2, tool: '<i>t</i>', input: null },
  ]);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(!html.includes('<i>t</i>'));
  assert.equal(renderPending([]), '');
  assert.equal(renderPending(undefined), '');
});

test('renderPending은 id가 정수가 아닌 항목은 그리지 않는다', () => {
  const html = renderPending([{ id: '5" onclick="x', tool: 'restart_fan', input: {} }, { id: 3.5, tool: 'restart_fan', input: {} }]);
  assert.equal(html, '');
});

test('renderLog는 기록을 이스케이프하고 비면 안내', () => {
  const html = renderLog([
    { actor: 'user', tool: 'restart_fan', result: '<b>완료</b>', approved: true },
    { actor: 'agent', tool: 'get_server_status', result: 'done', approved: null },
  ]);
  assert.ok(!html.includes('<b>완료</b>'));
  assert.ok(html.includes('&lt;b&gt;'));
  assert.ok(html.includes('선배'));
  assert.ok(html.includes('부사수'));
  assert.ok(renderLog([]).includes('아직 기록이 없어요'));
  assert.ok(renderLog(undefined).includes('아직 기록이 없어요'));
});

test('renderChat에 규칙 기반 시뮬레이션이라는 안내가 있다', () => {
  const html = renderChat();
  assert.ok(html.includes('class="note"'));
  assert.ok(html.includes('규칙'));
  assert.ok(html.includes('시뮬레이션'));
});

test('renderChat에 고객 문의 예시 버튼이 있다', () => {
  const html = renderChat();
  assert.ok(html.includes('id="agent-inquiry"'));
  assert.ok(html.includes('고객 문의 예시'));
});

test('서버 없는 문의 티켓 카드는 제목, 분류, 답변 초안을 보여 주고 이스케이프하며 자른다', () => {
  const html = renderPending([
    {
      id: 9,
      tool: 'open_ticket',
      input: { title: '[고객 문의] 네트워크', priority: 'high', category: 'network', reply: '<script>x</script>'.concat('가'.repeat(200)) },
    },
  ]);
  assert.ok(html.includes('[고객 문의] 네트워크'));
  assert.ok(html.includes('답변 초안'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('가'.repeat(121)));
  assert.ok(html.includes('data-pending-id="9"'));
});
