import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_HUB, handle } from '../../scripts/dev.mjs';
import { loadGames } from '../../scripts/lib/games.mjs';
import { FRONT_GAME, GUIDE_PAGE, teacherGuideHtml } from '../../scripts/lib/site.mjs';

// 개발 서버의 주소도 사이트와 같은 뜻으로(사용자 결정 spec-grade6 15-13 끝 — B0d 덧붙임 5):
//   / → 입체도형 공방(빌드의 index.html), …/teacher.html → 선생님용 안내(빌드와 같은 내용), 개발용 게임 모음은 /__games/, 그 밖은 그대로

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
let server;
let origin;
before(async () => {
  server = createServer((req, res) => handle(req, res).catch((e) => { res.writeHead(500); res.end(String(e)); }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
const get = (p) => fetch(`${origin}${p}`, { redirect: 'manual' });

test('개발 서버의 맨 위 주소 /는 입체도형 공방(인트로)으로 옮긴다 — 쿼리 그대로', async () => {
  assert.equal(FRONT_GAME, 'net-workshop');
  for (const [p, to] of [['/', '/games/net-workshop/'], ['/?lesson=cube', '/games/net-workshop/?lesson=cube'], ['/?intro=0&sound=off', '/games/net-workshop/?intro=0&sound=off']]) {
    const r = await get(p);
    assert.equal(r.status, 302, p);
    assert.equal(r.headers.get('location'), to, p);
  }
  const game = await get('/games/net-workshop/');
  assert.equal(game.status, 200);
  assert.match(await game.text(), /<script type="module" src="\.\/main\.js">/);
});

test('개발 서버의 …/teacher.html은 선생님용 안내 — 빌드(dist/teacher.html)와 같은 내용이고 게임 링크만 개발 서버 주소', async () => {
  const games = await loadGames(path.join(ROOT, 'src/games'));
  const built = teacherGuideHtml({ games, gameHref: (id) => `${id}.html`, styles: { links: ['./assets/base.css'] } });
  for (const p of [`/${GUIDE_PAGE}`, `/games/net-workshop/${GUIDE_PAGE}`]) { // 게임의 [선생님용 안내](./teacher.html)는 /games/net-workshop/teacher.html
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /text\/html/);
    const html = await r.text();
    assert.match(html, /<h1>입체도형 공방 선생님용 <span class="mark">안내<\/span><\/h1>/);
    assert.deepEqual([...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1]), ['/games/net-workshop/?intro=0', '/games/net-workshop/?intro=0'], `${p}: [← 학년 고르기]·게임 카드(예시 게임 없음)`);
    assert.match(html, /<link rel="stylesheet" href="\/shared\/styles\/base\.css">\s*<link rel="stylesheet" href="\/shared\/styles\/hub\.css">/);
    // 링크·스타일만 빼면 빌드의 안내와 글자 하나까지 같다
    const body = (text) => text.slice(text.indexOf('<body>')).replaceAll('/games/net-workshop/?intro=0', 'net-workshop.html?intro=0');
    assert.equal(body(html), body(built), p);
  }
});

test('개발용 게임 모음은 /__games/ (템플릿·예시 게임까지) · 예시 게임과 그 밖의 주소는 그대로', async () => {
  assert.equal(DEV_HUB, '/__games/');
  for (const p of [DEV_HUB, '/__games']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    const html = await r.text();
    for (const dir of ['net-workshop', 'sample-divisor-sort', '_template']) assert.ok(html.includes(`href="/games/${dir}/"`), `${p}: ${dir}`);
  }
  for (const p of ['/games/sample-divisor-sort/', '/shared/styles/base.css', '/__fonts/display.css']) assert.equal((await get(p)).status, 200, p);
  assert.equal((await get('/games/net-workshop')).status, 301, '폴더 주소는 /를 붙여 옮긴다(전과 같다)');
  assert.equal((await get('/nope.html')).status, 404);
});
