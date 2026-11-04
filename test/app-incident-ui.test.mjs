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

test('app.js는 부사수, 승인, 활동 API를 부른다', () => {
  assert.ok(app.includes("'/api/agent'"));
  assert.ok(app.includes("'/api/approve'"));
  assert.ok(app.includes("'/api/activity'"));
  assert.ok(app.includes('409'));
});

test('index.html에 부사수, 승인 대기, 활동 자리가 있다', () => {
  assert.ok(html.includes('id="agent"'));
  assert.ok(html.includes('id="pending"'));
  assert.ok(html.includes('id="activity"'));
});

test('app.js는 응답의 brain을 라벨로 보여 준다', () => {
  assert.ok(app.includes('brain'));
  assert.ok(app.includes('brainLabel'));
});

test('app.js는 가상 고객 문의 예시를 보내는 버튼을 처리한다', () => {
  assert.ok(app.includes('agent-inquiry'));
  assert.ok(app.includes('고객 문의:'));
});
