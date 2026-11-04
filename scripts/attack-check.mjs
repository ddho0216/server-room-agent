// 사용법: node scripts/attack-check.mjs <배포 주소>
// SUPABASE_URL 환경변수가 있으면 데이터베이스를 공개 주소로 직접 읽는 점검도 한다(키는 보내지 않는다).
import { CHECKS, NOT_RUN, buildSupabaseChecks, evaluate } from '../lib/attack-checks.mjs';

const base = process.argv[2]?.replace(/\/$/, '');
if (!base) {
  console.error('사용법: node scripts/attack-check.mjs <배포 주소>');
  process.exit(2);
}

const list = [...CHECKS, ...(process.env.SUPABASE_URL ? buildSupabaseChecks(process.env.SUPABASE_URL.replace(/\/$/, '')) : [])];
const rows = [];

for (const check of list) {
  const url = check.url ?? base + check.path;
  const headers = { ...(check.headers ?? {}) };
  if (check.body !== undefined) headers['Content-Type'] = 'application/json';
  let outcome;
  try {
    const response = await fetch(url, { method: check.method, headers, body: check.body });
    const text = await response.text();
    outcome = { status: response.status, ...evaluate(check, { status: response.status, text }) };
  } catch {
    outcome = { status: 0, pass: false, reason: '요청 실패(네트워크)' };
  }
  rows.push({ check, ...outcome });
}

const passed = rows.filter((r) => r.pass).length;
const cell = (value) => String(value).replace(/\|/g, '\\|');
console.log(`점검 대상: ${base}`);
console.log(`날짜: ${new Date().toISOString().slice(0, 10)}`);
console.log(`결과: ${passed}/${rows.length} 통과\n`);
console.log('| 번호 | 점검 | 요청 | 기대 | 결과 |');
console.log('|---|---|---|---|---|');
for (const r of rows) {
  const target = r.check.url ? r.check.url.replace(/^https?:\/\/[^/]+/, '') : r.check.path;
  const shown = target.length > 40 ? `${target.slice(0, 40)}…` : target;
  console.log(
    `| ${cell(r.check.id)} | ${cell(r.check.name)} | ${r.check.method} ${cell(shown)} | ${r.check.expect.join('/')} | ${
      r.pass ? `통과 (${r.status})` : `실패: ${cell(r.reason)}`
    } |`,
  );
}
console.log('\n하지 않은 점검:');
for (const n of NOT_RUN) console.log(`- ${n.name}: ${n.reason}`);

if (rows.some((r) => !r.pass)) process.exit(1);
process.exit(0);
