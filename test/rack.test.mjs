import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVERS } from './fixtures.mjs';
import { renderRack, renderError } from '../public/rack.mjs';

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
