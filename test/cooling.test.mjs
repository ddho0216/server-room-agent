import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coolingReading } from '../lib/cooling.mjs';
import { SERVERS } from './fixtures.mjs';

test('모든 서버가 정상 온도면 기본값', () => {
  const normal = SERVERS.map((s) => ({ ...s, tempC: 40 }));
  assert.deepEqual(coolingReading(normal), { supplyC: 18, returnC: 18, status: 'ok' });
});

test('가장 뜨거운 서버를 기준으로 돌아오는 공기 온도가 오른다', () => {
  const hot = [{ ...SERVERS[0], tempC: 86 }, ...SERVERS.slice(1)];
  assert.deepEqual(coolingReading(hot), { supplyC: 18, returnC: 41, status: 'warn' });
});

test('서버가 없으면 기본값', () => {
  assert.deepEqual(coolingReading([]), { supplyC: 18, returnC: 18, status: 'ok' });
});

test('소수 한 자리로 반올림한다', () => {
  const s = [{ ...SERVERS[0], tempC: 45 }];
  assert.equal(coolingReading(s).returnC, 20.5);
  const t = [{ ...SERVERS[0], tempC: 41 }];
  assert.equal(coolingReading(t).returnC, 18.5);
});
