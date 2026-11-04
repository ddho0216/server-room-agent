// 가상 냉각기 값입니다. 서버 온도에서 계산하며 실제 장비와 무관합니다.
const SUPPLY_C = 18;
const WARN_RETURN_C = 35;

export function coolingReading(servers) {
  const hottest = servers.reduce((max, s) => Math.max(max, s.tempC), -Infinity);
  const returnC = Number.isFinite(hottest)
    ? Math.round((SUPPLY_C + Math.max(0, hottest - 40) / 2) * 10) / 10
    : SUPPLY_C;
  return { supplyC: SUPPLY_C, returnC, status: returnC > WARN_RETURN_C ? 'warn' : 'ok' };
}
