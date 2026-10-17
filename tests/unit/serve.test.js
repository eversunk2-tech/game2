import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { SITE_BASE, createHandler, readArgs } from '../../scripts/serve.mjs';

// scripts/serve.mjs (B0b): dist/를 사이트와 같은 하위 경로 /game2/ 아래로 주는 작은 서버(e2e·npm run preview)

let dir;
let server;
let origin;
before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'edu-serve-'));
  await mkdir(path.join(dir, 'assets'));
  await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>모음</title>');
  await writeFile(path.join(dir, 'game.html'), '<!doctype html><title>게임</title>'.repeat(50));
  await writeFile(path.join(dir, 'assets/a-AAAAAAAA.js'), 'export const a = 1;\n'.repeat(40));
  await writeFile(path.join(dir, 'assets/p-AAAAAAAA.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
  await writeFile(path.join(dir, 'secret.txt'), 'no');
  server = createServer((req, res) => createHandler({ dir })(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

const get = (p, headers = {}) => fetch(`${origin}${p}`, { redirect: 'manual', headers });

test('하위 경로 /game2/ 아래에서만 준다: /game2/ → index.html, 파일 그대로. 그 밖은 404, /game2 는 /game2/ 로 옮긴다', async () => {
  assert.equal(SITE_BASE, '/game2/');
  let r = await get('/game2/');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<!doctype html><title>모음</title>');
  assert.match(r.headers.get('content-type'), /^text\/html/);
  r = await get('/game2/game.html?lesson=cube');
  assert.equal(r.status, 200);
  r = await get('/game2');
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), '/game2/');
  for (const p of ['/', '/game.html', '/index.html', '/assets/a-AAAAAAAA.js', '/game2x/', '/game22/game.html']) {
    r = await get(p);
    assert.equal(r.status, 404, p);
  }
  r = await get('/game2/없는-파일.html');
  assert.equal(r.status, 404);
  r = await get('/game2/assets');
  assert.equal(r.status, 301);
  r = await get('/game2/assets/');
  assert.equal(r.status, 404, '폴더에 index.html이 없으면 404');
});

test('폴더 밖으로 나가는 주소는 막는다 (../ · %2e%2e)', async () => {
  for (const p of ['/game2/../secret.txt', '/game2/%2e%2e/secret.txt', '/game2/assets/%2e%2e/%2e%2e/secret.txt', '/game2/..%2fsecret.txt']) {
    const r = await get(p);
    assert.notEqual(r.status, 200, p);
    if (r.status === 200) assert.notEqual(await r.text(), 'no');
  }
  // 폴더 안의 파일은 된다
  assert.equal((await get('/game2/secret.txt')).status, 200);
});

test('글 파일은 gzip(받는 쪽이 gzip을 받을 때), 그림은 그대로. 모든 파일에 max-age=600 (GitHub Pages와 같게)', async () => {
  const raw = await new Promise((resolve, reject) => {
    // fetch는 gzip을 저절로 풀므로 머리글과 바이트를 직접 본다
    import('node:http').then(({ get: httpGet }) => {
      httpGet(`${origin}/game2/assets/a-AAAAAAAA.js`, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
      }).on('error', reject);
    });
  });
  assert.equal(raw.headers['content-encoding'], 'gzip');
  assert.equal(raw.headers['cache-control'], 'max-age=600');
  assert.match(raw.headers['content-type'], /^text\/javascript/);
  assert.equal(gunzipSync(raw.body).toString(), 'export const a = 1;\n'.repeat(40));
  const png = await get('/game2/assets/p-AAAAAAAA.png', { 'Accept-Encoding': 'gzip' });
  assert.equal(png.headers.get('content-encoding'), null);
  assert.equal(png.headers.get('content-type'), 'image/png');
  assert.equal(png.headers.get('cache-control'), 'max-age=600');
  assert.deepEqual([...new Uint8Array(await png.arrayBuffer())], [0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
});

test('파일은 요청마다 디스크에서 읽는다(서버를 띄운 뒤 폴더를 다시 만들어도 — 글꼴 흉내 복사본은 서버보다 늦게 생긴다)', async () => {
  assert.equal((await get('/game2/late.html')).status, 404);
  await writeFile(path.join(dir, 'late.html'), 'late');
  assert.equal(await (await get('/game2/late.html')).text(), 'late');
});

test('명령줄: --dir · --port · --host (기본 dist · 4173 · 127.0.0.1, PORT·HOST 환경 변수)', () => {
  const a = readArgs([], {});
  assert.equal(path.basename(a.dir), 'dist');
  assert.deepEqual([a.port, a.host, a.base], [4173, '127.0.0.1', '/game2/']);
  const b = readArgs(['--dir', 'test-results/x', '--port', '5306', '--host', 'localhost'], { PORT: '1' });
  assert.ok(b.dir.endsWith(path.join('test-results', 'x')));
  assert.deepEqual([b.port, b.host], [5306, 'localhost']);
  assert.equal(readArgs([], { PORT: '5303' }).port, 5303);
});
