import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusLabel, issueLabel, toolLabel } from '../public/servers.mjs';
import { SERVERS } from './fixtures.mjs';

test('테스트용 서버는 4대이고 id가 모두 다르다', () => {
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

test('statusLabel은 상태를 한국어로 바꾸고 모르는 값은 알 수 없음으로 바꾼다', () => {
  assert.equal(statusLabel('ok'), '정상');
  assert.equal(statusLabel('warn'), '주의');
  assert.equal(statusLabel('down'), '장애');
  assert.equal(statusLabel('zzz'), '알 수 없음');
  assert.equal(statusLabel(undefined), '알 수 없음');
});

test('issueLabel은 사고 종류를 한국어로 바꾸고 없거나 모르는 값은 빈 문자열', () => {
  assert.equal(issueLabel('temp'), '온도 상승');
  assert.equal(issueLabel('disk'), '디스크 경고');
  assert.equal(issueLabel('network'), '네트워크 끊김');
  assert.equal(issueLabel(null), '');
  assert.equal(issueLabel(undefined), '');
  assert.equal(issueLabel('boom'), '');
});

test('toolLabel은 도구 이름을 한국어로 바꾸고 모르는 이름은 그대로 돌려준다', () => {
  assert.equal(toolLabel('get_server_status'), '서버 상태');
  assert.equal(toolLabel('get_cooling_temp'), '냉각기 온도');
  assert.equal(toolLabel('read_logs'), '기록 읽기');
  assert.equal(toolLabel('restart_fan'), '팬 재가동');
  assert.equal(toolLabel('open_ticket'), '티켓 열기');
  assert.equal(toolLabel('save_report'), '보고서 저장');
  assert.equal(toolLabel('mystery'), 'mystery');
  assert.equal(toolLabel(undefined), '');
});
