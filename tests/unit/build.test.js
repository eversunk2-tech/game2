import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, findExternalRefs } from '../../scripts/build.mjs';
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
});
