import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const publicDir = new URL('../public', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('public 폴더에 서버 상태 데이터가 없다', () => {
  for (const name of readdirSync(publicDir)) {
    const text = readFileSync(join(publicDir, name), 'utf8');
    for (const serverName of ['web-01', 'app-02', 'db-01', 'cache-01']) {
      assert.ok(!text.includes(serverName), `public/${name}에 ${serverName}이 있다`);
    }
  }
});
