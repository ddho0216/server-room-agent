import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVERS } from './fixtures.mjs';
import { renderRack, renderError, renderIncidentPanel } from '../public/rack.mjs';

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

test('모션 줄이기 설정에서 깜빡임을 끈다', () => {
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  const start = css.indexOf('prefers-reduced-motion');
  assert.ok(start >= 0, 'prefers-reduced-motion 블록이 없다');
  assert.ok(css.slice(start).includes('animation: none'), 'animation: none이 없다');
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
