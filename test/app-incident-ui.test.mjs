import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('app.js는 사고와 복구를 POST로 부른다', () => {
  assert.ok(app.includes("'/api/incidents'"));
  assert.ok(app.includes("'/api/reset'"));
  assert.ok(app.includes("method: 'POST'"));
});

test('한도 초과(429)는 다시 해 달라는 안내를 보여 준다', () => {
  assert.ok(app.includes('429'));
  assert.ok(app.includes('잠시 후에 다시 해 주세요'));
});

test('index.html에 패널과 안내 자리가 있다', () => {
  assert.ok(html.includes('id="panel"'));
  assert.ok(html.includes('id="message"'));
});
