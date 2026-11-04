import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INCIDENT_TYPES, incidentPatch } from '../lib/incident-effects.mjs';

test('사고 종류는 세 가지다', () => {
  assert.deepEqual(INCIDENT_TYPES, ['temp', 'disk', 'network']);
});

test('온도 상승은 86도, 팬 정지, 주의', () => {
  assert.deepEqual(incidentPatch('temp'), { status: 'warn', tempC: 86, fanOk: false, issue: 'temp' });
});

test('디스크 경고는 주의만 바꾼다', () => {
  assert.deepEqual(incidentPatch('disk'), { status: 'warn', issue: 'disk' });
});

test('네트워크 끊김은 장애', () => {
  assert.deepEqual(incidentPatch('network'), { status: 'down', issue: 'network' });
});

test('모르는 종류는 오류', () => {
  assert.throws(() => incidentPatch('fire'), /unknown incident type/);
  assert.throws(() => incidentPatch(undefined), /unknown incident type/);
});
