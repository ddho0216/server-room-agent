import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVERS, statusLabel } from '../public/servers.mjs';

test('서버는 4대이고 id가 모두 다르다', () => {
  assert.equal(SERVERS.length, 4);
  assert.equal(new Set(SERVERS.map((s) => s.id)).size, 4);
});

test('각 서버에 필요한 칸이 있다', () => {
  for (const s of SERVERS) {
    assert.equal(typeof s.id, 'string');
    assert.equal(typeof s.name, 'string');
    assert.equal(typeof s.tempC, 'number');
    assert.equal(typeof s.fanOk, 'boolean');
    assert.ok(['ok', 'warn', 'down'].includes(s.status), `상태값 ${s.status}`);
    assert.ok(Number.isInteger(s.slot) && s.slot >= 1 && s.slot <= 4, `슬롯 ${s.slot}`);
  }
});

test('주의 상태 서버가 1대 있다', () => {
  assert.equal(SERVERS.filter((s) => s.status === 'warn').length, 1);
});

test('statusLabel은 상태를 한국어로 바꾸고 모르는 값은 알 수 없음으로 바꾼다', () => {
  assert.equal(statusLabel('ok'), '정상');
  assert.equal(statusLabel('warn'), '주의');
  assert.equal(statusLabel('down'), '장애');
  assert.equal(statusLabel('zzz'), '알 수 없음');
  assert.equal(statusLabel(undefined), '알 수 없음');
});
