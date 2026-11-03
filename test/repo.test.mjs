import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('.gitignore는 .env와 node_modules와 .vercel을 막는다', () => {
  const lines = readFileSync(join(root, '.gitignore'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim());
  for (const entry of ['.env', 'node_modules', '.vercel']) {
    assert.ok(lines.includes(entry), `.gitignore에 ${entry} 줄이 없다`);
  }
});

const SKIP_DIRS = new Set(['.git', 'node_modules', '.vercel', 'docs']);
const SKIP_FILES = new Set(['AGENTS.md', 'repo.test.mjs']);
const SECRET_PATTERNS = [
  /sk-ant-/,
  /SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*['"]?\w{8,}/,
  /service_role/,
  /eyJ[A-Za-z0-9_-]{20,}/,
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(full);
    } else if (!SKIP_FILES.has(name) && /\.(mjs|js|json|html|css|md|txt|sql)$/.test(name)) {
      yield full;
    }
  }
}

test('작업 폴더의 파일에 비밀 패턴이 없다', () => {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    for (const re of SECRET_PATTERNS) {
      assert.ok(!re.test(text), `${relative(root, file)}에 비밀 패턴 ${re}이 있다`);
    }
  }
});

test('AGENTS.md와 README.md가 있다', () => {
  assert.ok(existsSync(join(root, 'AGENTS.md')));
  assert.ok(existsSync(join(root, 'README.md')));
});
