import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { MAX_FILE_BYTES, build, findExternalRefs } from '../../scripts/build.mjs';
import { DISPLAY_FONT, collectFontText, isHangulSyllable, readCmap } from '../../scripts/lib/font.mjs';
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

test('게임마다 바깥 파일 없이 열리는 HTML 한 파일과 게임 모음을 만든다', async () => {
  const outDir = await tempDir();
  const { games } = await build({ outDir, quiet: true });
  const files = (await readdir(outDir)).sort();
  assert.deepEqual(files, ['index.html', ...games.map((id) => `${id}.html`)].sort());

  for (const id of games) {
    const html = await readFile(path.join(outDir, `${id}.html`), 'utf8');
    assert.deepEqual(findExternalRefs(html), [], id);
    assert.doesNotMatch(html, /type=["']module["']/, `${id}: 모듈 스크립트는 file://에서 열리지 않음`);
    assert.match(html, /<style>/);
    assert.match(html, /<script>/);
  }

  const hub = await readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.deepEqual(findExternalRefs(hub), []);
  for (const id of games) assert.match(hub, new RegExp(`href="${id}\\.html"`));
  assert.doesNotMatch(hub, /_template/);
});

/** HTML에 data: 주소로 넣은 제목 글꼴(woff2)을 꺼낸다 */
const embeddedFont = (html) => {
  const m = html.match(/@font-face\{font-family:"Do Hyeon";src:url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\) format\("woff2"\)/);
  return m ? Buffer.from(m[1], 'base64') : null;
};

test('제목 글꼴: 파일마다 쓰인 글자만 잘라 넣고, 쓰인 한글이 모두 글꼴 안에 있으며, 파일은 400 KB 이하', async () => {
  const outDir = await tempDir();
  const { files } = await build({ outDir, quiet: true });
  assert.equal(MAX_FILE_BYTES, 400 * 1024);
  for (const info of files) {
    const html = await readFile(path.join(outDir, info.name), 'utf8');
    assert.ok(Buffer.byteLength(html) <= MAX_FILE_BYTES, `${info.name}: ${info.bytes} bytes`);
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

  // 게임 파일이 400 KB를 넘으면 빌드가 멈춘다
  await writeFile(path.join(gameDir, 'img/big.png'), Buffer.alloc(320 * 1024, 7));
  await appendFile(path.join(gameDir, 'style.css'), "\n.big { background: url('./img/big.png'); }\n");
  await assert.rejects(build({ rootDir, outDir: path.join(rootDir, 'dist'), quiet: true }), /test-game: 파일이 .*400\.0 KB를 넘어요/);
});
