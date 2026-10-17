import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { ASSET_FILE_MIN, assetRefs, build, findExternalRefs } from '../../scripts/build.mjs';
import { DISPLAY_FONT, collectFontText, isHangulSyllable, missingSymbols, readCmap } from '../../scripts/lib/font.mjs';
import { loadGames } from '../../scripts/lib/games.mjs';
import { FILTER_MIN_GAMES, renderHub } from '../../scripts/lib/hub.mjs';
import { createGame } from '../../scripts/new-game.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const temps = [];
const tempDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'edu-games-'));
  temps.push(dir);
  return dir;
};
after(() => Promise.all(temps.map((d) => rm(d, { recursive: true, force: true }))));

test('게임마다 HTML 한 파일(+ 큰 그림은 assets/에)과 게임 모음을 만든다. HTML이 가리키는 그림은 모두 assets/에 있다', async () => {
  const outDir = await tempDir();
  const { games, files: info } = await build({ outDir, quiet: true });
  const files = (await readdir(outDir)).filter((f) => f.endsWith('.html')).sort();
  assert.deepEqual(files, ['index.html', ...games.map((id) => `${id}.html`)].sort());
  assert.deepEqual((await readdir(outDir)).filter((f) => !f.endsWith('.html')), ['assets']); // 그 밖의 것은 따로 나간 그림 폴더뿐

  for (const id of games) {
    const html = await readFile(path.join(outDir, `${id}.html`), 'utf8');
    assert.deepEqual(findExternalRefs(html), [], id);
    for (const ref of assetRefs(html)) assert.ok((await readFile(path.join(outDir, ref))).length >= ASSET_FILE_MIN, `${id}: ${ref}`);
    assert.deepEqual(info.find((f) => f.name === `${id}.html`).assets.map((a) => a.name).sort(), assetRefs(html).sort(), id);
    assert.doesNotMatch(html, /type=["']module["']/, `${id}: 모듈 스크립트는 file://에서 열리지 않음`);
    assert.match(html, /<style>/);
    assert.match(html, /<script>/);
  }

  const hub = await readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.deepEqual(findExternalRefs(hub), []);
  for (const id of games) assert.match(hub, new RegExp(`href="${id}\\.html"`));
  assert.doesNotMatch(hub, /_template/);
});

test('입체도형 공방의 인트로 그림(사용자가 캔바에서 받은 2880 원본)은 dist/assets/로 바이트 그대로(md5 같음) 나가고 HTML은 ./assets/ 상대 주소로 가리킨다. 게임 모음·예시 게임은 따로 나가는 그림이 없다', async () => {
  const { createHash } = await import('node:crypto');
  const outDir = await tempDir();
  const { files } = await build({ outDir, quiet: true });
  const md5 = (b) => createHash('md5').update(b).digest('hex');
  const html = await readFile(path.join(outDir, 'net-workshop.html'), 'utf8');
  const refs = assetRefs(html).sort();
  assert.equal(refs.length, 2);
  assert.match(refs[0], /^assets\/intro-bg-[A-Z0-9]+\.jpg$/);
  assert.match(refs[1], /^assets\/intro-title-[A-Z0-9]+\.png$/);
  assert.equal(md5(await readFile(path.join(outDir, refs[0]))), 'a0ca1de662f43b43b63964d18f635e0c');
  assert.equal(md5(await readFile(path.join(outDir, refs[1]))), 'aa28acc246cf72c99d8a9a5a1367777f');
  for (const ref of refs) assert.ok(html.includes(`url("./${ref}")`) || html.includes(`url(./${ref})`), ref);
  assert.doesNotMatch(html, /data:image\/(jpeg|png)/); // 큰 그림이 HTML 안에 다시 들어가지 않는다
  assert.ok(Buffer.byteLength(html) < 800 * 1024, `${Buffer.byteLength(html)} bytes`);
  for (const name of ['index.html', 'sample-divisor-sort.html']) {
    assert.deepEqual(files.find((f) => f.name === name).assets, [], name);
    assert.deepEqual(assetRefs(await readFile(path.join(outDir, name), 'utf8')), [], name);
  }
});

/** HTML에 data: 주소로 넣은 제목 글꼴(woff2)을 꺼낸다 */
const embeddedFont = (html) => {
  const m = html.match(/@font-face\{font-family:"Do Hyeon";src:url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\) format\("woff2"\)/);
  return m ? Buffer.from(m[1], 'base64') : null;
};

test('제목 글꼴: 파일마다 쓰인 글자만 잘라 넣고, 쓰인 한글이 모두 글꼴 안에 있으며, 알려 주는 파일 크기는 실제 크기와 같다', async () => {
  const outDir = await tempDir();
  const { files } = await build({ outDir, quiet: true });
  for (const info of files) {
    const html = await readFile(path.join(outDir, info.name), 'utf8');
    assert.equal(info.bytes, Buffer.byteLength(html));
    assert.deepEqual(info.missing, [], `${info.name}: Do Hyeon에 없는 한글`);

    const woff2 = embeddedFont(html);
    assert.ok(woff2, `${info.name}: @font-face(data: woff2)가 없음`);
    assert.equal(woff2.subarray(0, 4).toString('latin1'), 'wOF2');
    assert.equal(woff2.length, info.fontBytes);
    assert.match(html, /Copyright 2018 The Do Hyeon Project Authors\. SIL Open Font License 1\.1/);

    // 넣은 글꼴을 다시 풀어 글자 표(cmap)를 읽고, 화면에 쓰일 수 있는 한글 음절이 모두 있는지 본다
    const hangul = [...collectFontText(html)].filter(isHangulSyllable);
    assert.ok(hangul.length > 50, `${info.name}: 한글 ${hangul.length}자`);
    const sfnt = await subsetFont(woff2, `${hangul.join('')}0A`, { targetFormat: 'sfnt' });
    const cmap = readCmap(sfnt);
    const lost = hangul.filter((ch) => !cmap.has(ch.codePointAt(0)));
    assert.deepEqual(lost, [], `${info.name}: 잘라 넣은 글꼴에 없는 글자`);
    assert.ok(cmap.has('0'.codePointAt(0)) && cmap.has('A'.codePointAt(0)), `${info.name}: 숫자·영문`);
  }
});

test('글꼴 원본과 라이선스 파일이 있다', async () => {
  const ttf = await readFile(DISPLAY_FONT.file);
  const cmap = readCmap(ttf);
  assert.ok(cmap.has('가'.codePointAt(0)) && cmap.size > 2000, `글자 ${cmap.size}개`);
  const ofl = await readFile(path.join(ROOT, 'src/shared/fonts/OFL.txt'), 'utf8');
  assert.match(ofl, /Copyright 2018 The Do Hyeon Project Authors/);
  assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/);
});

test('게임 모음: 표지(cover.svg)·게임 색을 넣고, 거르기 칩은 게임이 4개 이상일 때만', async () => {
  const games = await loadGames(path.join(ROOT, 'src/games'));
  const hub = renderHub({ games, hrefFor: (g) => `${g.meta.id}.html`, styles: { inline: '' } });
  for (const game of games) {
    const card = hub.slice(hub.indexOf(`href="${game.meta.id}.html"`)).split('</li>')[0];
    if (game.cover) assert.ok(card.includes(game.cover), `${game.dirName}: 표지`);
    else assert.match(card, /class="cover-paper"/);
    if (game.meta.color) assert.ok(card.includes(`--game-color: ${game.meta.color}`), `${game.dirName}: 색`);
    assert.match(card, new RegExp(`data-progress="${game.meta.id}"`));
  }
  assert.match(hub, /<h1>초등 5~6학년 <span class="mark">학습게임<\/span><\/h1>/);
  assert.equal(games.length < FILTER_MIN_GAMES, !hub.includes('class="hub-filter"'));

  // 게임이 4개 이상이면 교과·학년 거르기 칩
  const fake = (id, subject, grades) => ({ dirName: id, isTemplate: false, cover: null, meta: { id, title: id, subject, grades, summary: '', units: ['단원'], playMinutes: 10, mode: '개인', status: '완료' } });
  const many = renderHub({ games: [fake('a', '수학', [5]), fake('b', '수학', [6]), fake('c', '과학', [5, 6]), fake('d', '과학', [6])], hrefFor: (g) => g.meta.id, styles: { links: [] } });
  assert.match(many, /class="hub-filter"/);
  assert.match(many, /data-kind="subject" data-value="수학">수학 2</);
  assert.match(many, /data-kind="grade" data-value="6">6학년 3</);
  assert.doesNotMatch(many, /status-ribbon/); // 완료된 게임에는 띠가 없다
});

test('바깥 파일 참조를 찾아낸다', () => {
  assert.deepEqual(findExternalRefs('<img src="data:image/png;base64,AA"><link rel="icon" href="data:,">'), []);
  assert.equal(findExternalRefs('<script src="https://cdn.example.com/x.js"></script>').length, 1);
  assert.equal(findExternalRefs('<img src="./cat.png">').length, 1);
  assert.equal(findExternalRefs('<link rel="stylesheet" href="a.css">').length, 1);
  assert.equal(findExternalRefs('<style>.a{background:url(./a.png)}</style>').length, 1);
  assert.deepEqual(findExternalRefs('<script>new URL(location.href)</script>'), []);
  // <style> 안(SVG 표지 안 포함)의 @import와 style="" 속성의 url()도 잡는다 (D1 Review 3번)
  assert.deepEqual(findExternalRefs('<svg><style>@import "https://example.com/a.css"; .x{}</style></svg>'), ['@import https://example.com/a.css']);
  assert.equal(findExternalRefs('<style>@import url(https://example.com/a.css);</style>').length, 2);
  assert.equal(findExternalRefs('<div style="background:url(https://example.com/a.png)"></div>').length, 1);
  assert.deepEqual(findExternalRefs('<div style="--game-color: #2f6f5e"></div><style>.a{background:url(data:image/png;base64,AA)}</style>'), []);
  // 같이 내보낸 그림(./assets/이름)만 된다. '/'로 시작하는 주소(사이트가 하위 경로 /game2/), 다른 폴더, ../ 은 안 된다
  assert.deepEqual(findExternalRefs('<style>.a{background:url("./assets/intro-bg-ABC123.jpg")}</style>'), []);
  assert.equal(findExternalRefs('<style>.a{background:url(/assets/a.png)}</style>').length, 1);
  assert.equal(findExternalRefs('<style>.a{background:url(./img/a.png)}</style>').length, 1);
  assert.equal(findExternalRefs('<style>.a{background:url(./assets/../a.png)}</style>').length, 1);
  assert.deepEqual(assetRefs('<style>.a{background:url("./assets/a-1.jpg")}.b{mask:url(./assets/a-1.jpg)}.c{background:url(data:x)}</style>'), ['assets/a-1.jpg']);
});

test('제목 글꼴에 없는 기호를 알려 준다 (가운뎃점은 제목 자리에 쓰지 않는다)', async () => {
  const ttf = await readFile(DISPLAY_FONT.file);
  const cmap = readCmap(ttf);
  assert.deepEqual(missingSymbols('약수·배수 ㆍ → ★ ✦ … abc 가', cmap), ['·', '✦', '…']);
  assert.ok(cmap.has('ㆍ'.codePointAt(0)), '엔진이 제목 자리에 쓰는 구분 기호');
  const outDir = await tempDir();
  const { files } = await build({ outDir, quiet: true });
  for (const info of files) assert.ok(Array.isArray(info.symbols), info.name);
});

test('템플릿으로 만든 새 게임은 바로 빌드된다', async () => {
  const rootDir = await tempDir();
  await cp(path.join(ROOT, 'src'), path.join(rootDir, 'src'), { recursive: true });
  await mkdir(path.join(rootDir, 'docs'));
  await cp(path.join(ROOT, 'docs/game-design-template.md'), path.join(rootDir, 'docs/game-design-template.md'));

  const title = '테스트 "게임" <1>';
  await createGame({ rootDir, id: 'test-game', title });
  const meta = JSON.parse(await readFile(path.join(rootDir, 'src/games/test-game/game.json'), 'utf8'));
  assert.equal(meta.id, 'test-game');
  assert.equal(meta.title, title);
  const doc = await readFile(path.join(rootDir, 'docs/games/test-game/spec.md'), 'utf8');
  assert.match(doc, /테스트 "게임" <1>/);
  assert.doesNotMatch(doc, /__GAME_(ID|TITLE)__/);

  // CSS url()로 넣은 그림은 data: 주소로 들어간다 (docs/engine.md 7절)
  const gameDir = path.join(rootDir, 'src/games/test-game');
  await mkdir(path.join(gameDir, 'img'));
  await writeFile(path.join(gameDir, 'img/dot.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
  await appendFile(path.join(gameDir, 'style.css'), "\n.dot { background: url('./img/dot.svg'); }\n");

  const { games } = await build({ rootDir, outDir: path.join(rootDir, 'dist'), quiet: true });
  assert.ok(games.includes('test-game'));
  const html = await readFile(path.join(rootDir, 'dist/test-game.html'), 'utf8');
  assert.match(html, /<title>테스트 &quot;게임&quot; &lt;1&gt;<\/title>/);
  assert.match(html, /url\(["']?data:image\/svg\+xml/);

  await assert.rejects(createGame({ rootDir, id: 'test-game' }), /이미 있는/);
  await assert.rejects(createGame({ rootDir, id: 'Bad_Id' }), /소문자/);

  // 16 KB 미만의 래스터 그림은 지금처럼 data: 주소로 들어간다
  const small = Buffer.alloc(ASSET_FILE_MIN - 1, 3);
  await writeFile(path.join(gameDir, 'img/small.png'), small);
  await appendFile(path.join(gameDir, 'style.css'), "\n.small { background: url('./img/small.png'); }\n");
  const withSmall = await build({ rootDir, outDir: path.join(rootDir, 'dist'), quiet: true });
  const smallHtml = await readFile(path.join(rootDir, 'dist/test-game.html'), 'utf8');
  const smallRule = smallHtml.match(/\.small\{background:url\(["']?data:image\/png;base64,([A-Za-z0-9+/=]+)["']?\)\}/);
  assert.ok(smallRule && Buffer.from(smallRule[1], 'base64').equals(small), '작은 그림이 data: 주소로 원본 그대로');
  assert.deepEqual(withSmall.files.find((file) => file.name === 'test-game.html').assets, []);

  // 큰 래스터 그림(16 KB 이상)은 dist/assets/<이름>-<해시>.png로 바이트 그대로 나가고 HTML은 ./assets/ 상대 주소로 가리킨다(B0c2).
  // 크기 상한은 여전히 없다(2026-10-09 사용자 결정) — 큰 그림이 따로 나가서 HTML은 작다
  const big = Buffer.alloc(320 * 1024, 7);
  await writeFile(path.join(gameDir, 'img/big.png'), big);
  await appendFile(path.join(gameDir, 'style.css'), "\n.big { background: url('./img/big.png'); }\n");
  const large = await build({ rootDir, outDir: path.join(rootDir, 'dist'), quiet: true });
  assert.deepEqual(large.games, games);
  const info = large.files.find((file) => file.name === 'test-game.html');
  const largeHtml = await readFile(path.join(rootDir, 'dist/test-game.html'), 'utf8');
  assert.equal(info.bytes, Buffer.byteLength(largeHtml));
  assert.ok(info.bytes < 300 * 1024, `${info.bytes} bytes`);
  assert.deepEqual(findExternalRefs(largeHtml), []);
  const rule = largeHtml.match(/\.big\{background:url\(["']?\.\/(assets\/big-[A-Z0-9]+\.png)["']?\)\}/);
  assert.ok(rule, '.big 규칙이 ./assets/의 그림을 가리키지 않음');
  assert.deepEqual(info.assets, [{ name: rule[1], bytes: big.length }]);
  assert.ok((await readFile(path.join(rootDir, 'dist', rule[1]))).equals(big), '내보낸 그림이 원본과 다름');
  // 그 규칙 하나 말고는 큰 그림을 넣기 전과 한 글자도 다르지 않다
  assert.ok(largeHtml.replace(rule[0], () => '') === smallHtml, '큰 그림 규칙 말고 다른 곳이 달라짐');
});
