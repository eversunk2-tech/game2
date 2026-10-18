import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createHash } from 'node:crypto';
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import subsetFont from 'subset-font';
import { ASSET_FILE_MIN, FIRST_LOAD_NOTICE, FRONT_GAME, GUIDE_PAGE, SITE_ADDRESSES, build, checkSite, cssRefs, findUrls, htmlRefs, jsRefs } from '../../scripts/build.mjs';
import { DISPLAY_FONT, collectFontText, isHangulSyllable, missingSymbols, readCmap } from '../../scripts/lib/font.mjs';
import { loadGames } from '../../scripts/lib/games.mjs';
import { COPYRIGHT, FILTER_MIN_GAMES, URL_OPTIONS, renderHub, renderTeacherGuide } from '../../scripts/lib/hub.mjs';
import { createGame } from '../../scripts/new-game.mjs';

// 여러 파일 빌드(B0b — spec-grade6.md 7-3절 안 B · 7-4절). 전에는 "게임마다 HTML 한 파일" 검사였다(7-4절 표: "HTML 한 파일"·"400 KB 이하" 검사를
// "가리키는 파일이 모두 있음·바깥 주소 없음·글꼴이 쓰인 글자를 모두 가짐"으로 바꾼다)

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const temps = [];
const tempDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'edu-games-'));
  temps.push(dir);
  return dir;
};
after(() => Promise.all(temps.map((d) => rm(d, { recursive: true, force: true }))));

/** 한 번 빌드한 결과를 여러 검사가 같이 본다 */
let built = null;
const site = () => {
  built ??= (async () => {
    const outDir = await tempDir();
    const result = await build({ outDir, quiet: true });
    return { outDir, ...result };
  })();
  return built;
};
const read = (outDir, rel) => readFile(path.join(outDir, rel), 'utf8');
const md5 = (b) => createHash('md5').update(b).digest('hex');

/** 이 검사가 따로 짠 참조 읽기(빌드의 htmlRefs·cssRefs·jsRefs를 쓰지 않는다) */
const refsInHtml = (html) => [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1]).filter((r) => !r.startsWith('data:'));
const refsInCss = (css) => [...css.matchAll(/url\(\s*"?([^")]*)"?\s*\)/g)].map((m) => m[1]).filter((r) => !r.startsWith('data:') && !r.startsWith('#'));
const refsInJs = (js) => [...js.matchAll(/(?:from|import)\s*\(?\s*"(\.\/[^"]+)"/g)].map((m) => m[1]);

/** 들머리 JS에서 정적으로 닿는 파일(import … from "…"만, import()는 빼고) — 이 검사가 따로 계산 */
async function staticFiles(outDir, rel) {
  const seen = [];
  const walk = async (r) => {
    if (seen.includes(r)) return;
    seen.push(r);
    const js = await read(outDir, r);
    for (const m of js.matchAll(/(?:^|[;}\s])(?:import|export)\s*[\w$*\s{},]*?\s*from\s*"(\.\/[^"]+)"/g)) await walk(path.posix.join(path.posix.dirname(r), m[1]));
    for (const m of js.matchAll(/(?:^|[;}\s])import\s*"(\.\/[^"]+)"/g)) await walk(path.posix.join(path.posix.dirname(r), m[1]));
  };
  await walk(rel);
  return seen;
}

// B0d(spec-grade6 15-13): 사이트 맨 위 index.html은 게임 모음 대신 입체도형 공방의 게임 HTML(인트로가 바로), 게임 모음은 선생님용 안내 teacher.html로 바뀌었다
test('여러 파일 빌드: dist에는 게임 HTML·맨 위 index.html(입체도형 공방과 같은 내용)·선생님용 안내·assets/만, assets/의 이름은 <이름>-<해시>. 게임 HTML은 ./assets/의 CSS·모듈 스크립트(onerror)·modulepreload·글꼴 preload를 가리킨다', async () => {
  const { outDir, games } = await site();
  const top = (await readdir(outDir)).sort();
  assert.deepEqual(top, ['assets', 'index.html', GUIDE_PAGE, ...games.map((id) => `${id}.html`)].sort());
  const assets = await readdir(path.join(outDir, 'assets'));
  for (const name of assets) assert.match(name, /^[a-z0-9-]+-[A-Z0-9]{8}\.(js|css|woff2|png|jpe?g|gif|webp)$/, name);
  assert.equal(assets.filter((n) => n.startsWith('display-') && n.endsWith('.woff2')).length, 1, '제목 글꼴은 사이트에 하나');
  assert.equal(assets.filter((n) => /^base-.*\.css$/.test(n)).length, 1, '엔진 CSS는 모든 페이지가 같은 파일 하나');

  for (const id of games) {
    const html = await read(outDir, `${id}.html`);
    const source = await readFile(path.join(ROOT, 'src/games', id, 'index.html'), 'utf8');
    // 스타일시트는 원본 index.html의 <link> 수 그대로, 모두 ./assets/의 해시 이름
    const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
    assert.equal(sheets.length, [...source.matchAll(/rel="stylesheet"/g)].length, id);
    for (const s of sheets) assert.match(s, /^\.\/assets\/[a-z0-9-]+-[A-Z0-9]{8}\.css$/, id);
    assert.match(sheets[0], /^\.\/assets\/base-/, `${id}: 첫 스타일시트는 엔진 base.css`);
    // 모듈 스크립트 하나(게임 id 이름) + 처음 스크립트 실패 때 한 번만 새로 고침(onerror)
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
    assert.equal(scripts.length, 1, `${id}: 스크립트는 모듈 하나뿐(인라인 스크립트 없음)`);
    assert.match(scripts[0], new RegExp(`type="module" src="\\./assets/${id}-[A-Z0-9]{8}\\.js" onerror="`), id);
    assert.match(scripts[0], /edu:reload-once/);
    // modulepreload = 들머리에서 정적으로 닿는 JS 모두(이 검사가 JS의 import를 따라가 따로 계산), import()로 늦게 받는 묶음은 넣지 않는다
    const entry = /src="\.\/(assets\/[^"]+\.js)"/.exec(scripts[0])[1];
    const preload = [...html.matchAll(/<link rel="modulepreload" href="\.\/([^"]+)">/g)].map((m) => m[1]);
    assert.deepEqual(preload.sort(), (await staticFiles(outDir, entry)).sort(), id);
    // 글꼴: 미리 받기(crossorigin — 글꼴은 CORS 모드로 받는다) + @font-face
    const font = /<link rel="preload" href="\.\/(assets\/display-[A-Z0-9]{8}\.woff2)" as="font" type="font\/woff2" crossorigin>/.exec(html)?.[1];
    assert.ok(font, `${id}: 글꼴 preload`);
    assert.ok(html.includes(`@font-face{font-family:"Do Hyeon";src:url(./${font}) format("woff2")`), id);
    assert.match(html, /Copyright 2018 The Do Hyeon Project Authors\. SIL Open Font License 1\.1/);
    assert.doesNotMatch(html, /data:(font|image\/(png|jpeg))/, `${id}: 글꼴·큰 그림이 HTML에 다시 들어가지 않는다`);
  }
  // 맨 위 주소 = 입체도형 공방 HTML 그대로(바이트까지 — 넘겨 주기 없음, 같은 ./assets/ 파일·같은 저장 열쇠)
  assert.equal(FRONT_GAME, 'net-workshop');
  assert.equal(await read(outDir, 'index.html'), await read(outDir, `${FRONT_GAME}.html`));
  // 선생님용 안내(전의 게임 모음): 목록에 보이는 게임(예시 게임 빼고)만 인트로를 건너뛰는 주소로, CSS는 공통 파일
  const guide = await read(outDir, GUIDE_PAGE);
  assert.deepEqual([...guide.matchAll(/<a class="hub-card" href="([^"]+)"/g)].map((m) => m[1]), [`${FRONT_GAME}.html?intro=0`]);
  assert.doesNotMatch(guide, /sample-divisor-sort|_template/);
  assert.match(guide, /<link rel="stylesheet" href="\.\/assets\/base-[A-Z0-9]{8}\.css">\s*<link rel="stylesheet" href="\.\/assets\/hub-[A-Z0-9]{8}\.css">/, '선생님용 안내: CSS는 인라인 대신 공통 파일');
  assert.doesNotMatch(guide, /<style>[^<]{2000,}/, '선생님용 안내에 큰 인라인 CSS가 없다');
});

test('빌드 검사 ①②③: 바깥 주소 없음(SVG 이름공간만) · 가리키는 파일이 모두 있음 · "/"로 시작하는 주소 없음 — 빌드의 검사와 이 검사가 따로 짠 검사 모두', async () => {
  const { outDir } = await site();
  assert.deepEqual(await checkSite(outDir), []);
  const all = [];
  const walk = async (base) => {
    for (const e of await readdir(path.join(outDir, base), { withFileTypes: true })) {
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(rel);
      else all.push(rel);
    }
  };
  await walk('');
  let checked = 0;
  for (const rel of all.filter((r) => /\.(html|js|css)$/.test(r))) {
    const text = await read(outDir, rel);
    // ① 결과물 전체에서 http(s)://·// — SVG 이름공간을 지운 뒤 하나도 없다
    const rest = text.split('http://www.w3.org/2000/svg').join('');
    assert.doesNotMatch(rest, /https?:|\/\//, `${rel}: 바깥 주소`);
    // ② ③ 가리키는 것은 모두 같은 폴더 기준 ./ 상대 주소이고 파일이 있다
    const refs = rel.endsWith('.html') ? refsInHtml(text) : rel.endsWith('.css') ? refsInCss(text) : refsInJs(text);
    for (const ref of refs) {
      assert.ok(!ref.startsWith('/'), `${rel}: '/'로 시작 ${ref}`);
      // 선생님용 안내의 게임 링크만 "<id>.html"(인트로를 건너뛰는 ?intro=0까지) — 그 밖은 ./ 상대 주소 (B0d: 전에는 게임 모음 index.html의 "<id>.html")
      const [plain, query] = ref.split('?');
      const isPage = rel === GUIDE_PAGE && /^[a-z0-9-]+\.html$/.test(plain) && (query === undefined || query === 'intro=0');
      if (!isPage) assert.match(ref, /^\.\/[A-Za-z0-9._/-]+$/, `${rel}: ${ref}`);
      assert.ok(!ref.includes('..'), `${rel}: ${ref}`);
      assert.ok(all.includes(path.posix.normalize(path.posix.join(path.posix.dirname(rel), plain))), `${rel}: 없는 파일 ${ref}`);
      checked += 1;
    }
  }
  assert.ok(checked > 20, `참조 ${checked}개`);
  // 빌드에 걸린 HTML·CSS·JS의 해시 파일은 모두 어딘가에서 가리킨다(남는 파일 없음)
  const pointed = new Set();
  for (const rel of all.filter((r) => /\.(html|js|css)$/.test(r))) {
    const text = await read(outDir, rel);
    const refs = rel.endsWith('.html') ? refsInHtml(text) : rel.endsWith('.css') ? refsInCss(text) : refsInJs(text);
    for (const ref of refs) pointed.add(path.posix.normalize(path.posix.join(path.posix.dirname(rel), ref)));
  }
  assert.deepEqual(all.filter((r) => r.startsWith('assets/') && !pointed.has(r)), []);
});

test('빌드 검사는 바깥 주소 · 없는 파일 · "/"로 시작하는 주소 · 위로 가는 주소를 잡는다 (일부러 깨 본 결과물)', async () => {
  const outDir = await tempDir();
  await mkdir(path.join(outDir, 'assets'));
  const put = (rel, text) => writeFile(path.join(outDir, rel), text);
  await put('assets/ok-AAAAAAAA.js', 'export const a=1;');
  await put('assets/ok-BBBBBBBB.css', '.a{background:url(./ok-CCCCCCCC.png)}');
  await writeFile(path.join(outDir, 'assets/ok-CCCCCCCC.png'), Buffer.alloc(10));
  await put('good.html', '<link rel="stylesheet" href="./assets/ok-BBBBBBBB.css"><script type="module" src="./assets/ok-AAAAAAAA.js"></script><svg xmlns="http://www.w3.org/2000/svg"></svg><a href="good.html">a</a>');
  assert.deepEqual(await checkSite(outDir), []);
  const cases = [
    ['a.html', '<script type="module" src="/assets/ok-AAAAAAAA.js"></script>', /'\/'로 시작/],
    ['b.html', '<link rel="stylesheet" href="https://cdn.example.com/a.css">', /바깥 주소/],
    ['c.html', '<img src="//cdn.example.com/a.png">', /바깥 주소/],
    ['d.html', '<link rel="modulepreload" href="./assets/missing-AAAAAAAA.js">', /가리키는 파일이 없어요/],
    ['e.html', '<link rel="stylesheet" href="../x.css">', /상대 주소/],
    ['f.html', '<a href="nope.html">x</a>', /가리키는 파일이 없어요/],
    ['assets/g-AAAAAAAA.css', '.a{background:url(/assets/ok-CCCCCCCC.png)}', /'\/'로 시작/],
    ['assets/h-AAAAAAAA.css', '@import "./ok-BBBBBBBB.css";', /@import/],
    ['assets/i-AAAAAAAA.js', 'import("./gone-AAAAAAAA.js");', /가리키는 파일이 없어요/],
    ['assets/j-AAAAAAAA.js', 'import{a}from"/assets/ok-AAAAAAAA.js";', /'\/'로 시작/],
    ['assets/k-AAAAAAAA.js', 'fetch("https://example.com/a")', /바깥 주소/],
  ];
  for (const [rel, text, expect] of cases) {
    await put(rel, text);
    const problems = await checkSite(outDir);
    assert.ok(problems.some((p) => p.startsWith(`${rel}:`) && expect.test(p)), `${rel}: ${problems.join(' | ')}`);
    await rm(path.join(outDir, rel));
  }
  assert.deepEqual(await checkSite(outDir), []);
});

test('참조 읽기: HTML의 src·href·url(), CSS의 url()·@import, JS의 import … from·import()·import "…" (data:·#는 뺀다). 바깥 주소 찾기는 SVG 이름공간만 허용', () => {
  assert.deepEqual(htmlRefs('<img src="data:image/png;base64,AA"><link rel="icon" href="data:,">').map((r) => r.ref), []);
  assert.deepEqual(htmlRefs('<script type="module" src="./assets/a-H.js"></script><link rel="stylesheet" href="a.css"><a href="x.html">x</a>').map((r) => r.ref), ['./assets/a-H.js', 'a.css', 'x.html']);
  assert.deepEqual(htmlRefs('<style>.a{background:url(./a.png)}</style><div style="background:url(https://example.com/a.png)"></div>').map((r) => r.ref), ['./a.png', 'https://example.com/a.png']);
  assert.deepEqual(htmlRefs('<svg><style>@import "https://example.com/a.css"; .x{}</style></svg>').map((r) => r.ref), ['@import https://example.com/a.css']);
  assert.deepEqual(cssRefs('.a{background:url("./intro-bg-ABC.jpg")}.b{mask:url(./a.png)}.c{background:url(data:x)}.d{fill:url(#g)}'), ['./intro-bg-ABC.jpg', './a.png']);
  assert.deepEqual(jsRefs('import{a as b,c}from"./chunk-A.js";import"./side-B.js";const m=()=>import("./lazy-C.js");s.setProperty("--from",1);'), ['./chunk-A.js', './lazy-C.js', './side-B.js']);
  assert.deepEqual(findUrls('var n="http://www.w3.org/2000/svg";'), []);
  assert.equal(findUrls('a="https://cdn.example.com/x.js"').length, 1);
  assert.equal(findUrls('src="//cdn.example.com/x.js"').length, 1);
  assert.deepEqual(findUrls('new URL(location.href)'), []);
});

test('입체도형 공방의 인트로 그림(사용자가 캔바에서 받은 2880 원본)은 dist/assets/로 바이트 그대로(md5 같음) 나가고 게임 CSS가 ./ 상대 주소로 가리킨다. 선생님용 안내·예시 게임은 따로 나가는 그림이 없다', async () => {
  const { outDir, files } = await site();
  const info = files.find((f) => f.name === 'net-workshop.html');
  const css = await Promise.all(info.css.map((rel) => read(outDir, rel)));
  const refs = css.flatMap(refsInCss).map((r) => path.posix.join('assets', r)).sort();
  assert.equal(new Set(refs).size, 2);
  const [bg, title] = [...new Set(refs)];
  assert.match(bg, /^assets\/intro-bg-[A-Z0-9]+\.jpg$/);
  assert.match(title, /^assets\/intro-title-[A-Z0-9]+\.png$/);
  assert.equal(md5(await readFile(path.join(outDir, bg))), 'a0ca1de662f43b43b63964d18f635e0c');
  assert.equal(md5(await readFile(path.join(outDir, title))), 'aa28acc246cf72c99d8a9a5a1367777f');
  assert.deepEqual(info.assets.map((a) => a.name).sort(), [bg, title]);
  for (const text of [await read(outDir, 'net-workshop.html'), ...css]) assert.doesNotMatch(text, /data:image\/(jpeg|png)/); // 큰 그림이 다시 data:로 들어가지 않는다
  for (const name of [GUIDE_PAGE, 'sample-divisor-sort.html']) assert.deepEqual(files.find((f) => f.name === name).assets, [], name);
  assert.deepEqual(files.find((f) => f.name === 'index.html').assets, info.assets, '맨 위 주소는 입체도형 공방과 같은 그림'); // B0d: 전에는 게임 모음(그림 없음)
});

test('제목 글꼴: 사이트 전체(게임 모음 + 모든 게임의 HTML·JS·CSS)에 쓰인 글자만 잘라 display-해시.woff2 하나. 쓰인 한글은 모두 글꼴 안에 있고 모든 페이지가 같은 파일을 가리킨다', async () => {
  const { outDir, files, font } = await site();
  const woff2 = await readFile(path.join(outDir, font.name));
  assert.match(font.name, /^assets\/display-[A-Z0-9]{8}\.woff2$/);
  assert.equal(woff2.subarray(0, 4).toString('latin1'), 'wOF2');
  assert.equal(woff2.length, font.bytes);
  // 이 검사가 따로 모은 사이트의 글: dist의 모든 HTML·JS·CSS
  const texts = [];
  for (const name of await readdir(outDir)) if (name.endsWith('.html')) texts.push(await read(outDir, name));
  for (const name of await readdir(path.join(outDir, 'assets'))) if (/\.(js|css)$/.test(name)) texts.push(await read(outDir, `assets/${name}`));
  const hangul = [...collectFontText(texts.join('\n'))].filter(isHangulSyllable);
  assert.ok(hangul.length > 300, `한글 ${hangul.length}자`);
  const sfnt = await subsetFont(woff2, `${hangul.join('')}0A`, { targetFormat: 'sfnt' });
  const cmap = readCmap(sfnt);
  assert.deepEqual(hangul.filter((ch) => !cmap.has(ch.codePointAt(0))), [], '잘라 넣은 글꼴에 없는 글자');
  assert.ok(cmap.has('0'.codePointAt(0)) && cmap.has('A'.codePointAt(0)), '숫자·영문');
  for (const info of files) {
    assert.equal(info.font, font.name, info.name);
    assert.deepEqual(info.missing, [], `${info.name}: Do Hyeon에 없는 한글`);
    const html = await read(outDir, info.name);
    assert.ok(html.includes(`href="./${font.name}" as="font"`) && html.includes(`url(./${font.name})`), info.name);
  }
});

test('④ 크기는 막지 않고 보고: 게임마다 처음 받는 크기(gzip — HTML·CSS·정적 JS·글꼴)와 늦게 받는 묶음. 쌓기나무의 플레이는 늦게 받는 묶음이고 처음 받는 파일에 없다', async () => {
  const { outDir, files, font } = await site();
  const gz = async (rel) => (rel.endsWith('.woff2') ? (await readFile(path.join(outDir, rel))).length : gzipSync(await readFile(path.join(outDir, rel)), { level: 9 }).length);
  for (const info of files) {
    // 이 검사가 따로 더한 값
    const listed = info.firstLoad.files;
    assert.equal(listed[0], info.name);
    assert.ok(listed.includes(font.name), info.name);
    let total = 0;
    for (const rel of listed) total += await gz(rel);
    assert.equal(info.firstLoad.gzip, total, info.name);
  }
  const nw = files.find((f) => f.name === 'net-workshop.html');
  // 늦게 받는 묶음: 쌓기나무(B0b) · 각기둥(G1 — 6학년 전개도, grade6/prism-play.js)
  assert.deepEqual(nw.lazy.map((b) => b.entry.replace(/-[A-Z0-9]{8}\.js$/, '')), ['assets/blocks-play', 'assets/prism-play']);
  const blocksLazy = nw.lazy[0];
  assert.match(blocksLazy.entry, /^assets\/blocks-play-[A-Z0-9]{8}\.js$/);
  for (const bundle of nw.lazy) {
    assert.ok(bundle.files.includes(bundle.entry));
    for (const rel of bundle.files) assert.ok(!nw.firstLoad.files.includes(rel), `${rel}: 늦게 받는 파일이 처음 받는 파일에 있음`);
  }
  assert.ok(blocksLazy.gzip > 10 * 1024, `늦게 받는 묶음 ${blocksLazy.gzip} B`);
  // 쌓기나무의 문제 만들기·화면 코드(blocks-logic.js의 makeBlockQuestions 등)는 처음 받는 JS에 없다 — 화면 글자 하나로 확인(놀이 화면의 버튼 글)
  const first = (await Promise.all(nw.js.map((rel) => read(outDir, rel)))).join('\n');
  const lazy = (await Promise.all(blocksLazy.files.map((rel) => read(outDir, rel)))).join('\n');
  // 각기둥의 문제 만들기·판정·화면(prism-logic.js · solids.js)도 처음 받는 JS에 없다 — 까닭 칩의 글자로 확인. 단계 목록은 처음 받는 JS에
  const prismLazy = (await Promise.all(nw.lazy[1].files.map((rel) => read(outDir, rel)))).join('\n');
  assert.ok(prismLazy.includes('옆면이 직사각형이 아니에요') && !first.includes('옆면이 직사각형이 아니에요'), '각기둥 판별의 까닭 글은 늦게 받는 묶음에만');
  assert.ok(first.includes('각기둥이 될까?'), '각기둥의 단계 목록은 처음 받는 JS에');
  assert.ok(lazy.includes('여기는 ') && !first.includes('판 밖에는 놓을 수 없어요.'), '쌓기 판의 안내 글은 늦게 받는 묶음에만');
  assert.ok(first.includes('어느 방향에서 보았을까'), '쌓기나무의 차시·단계 목록은 처음 받는 JS에');
  for (const name of [GUIDE_PAGE, 'sample-divisor-sort.html']) assert.deepEqual(files.find((f) => f.name === name).lazy, [], name);
  const front = files.find((f) => f.name === 'index.html'); // B0d: 맨 위 주소는 입체도형 공방과 같은 파일을 받는다(전에는 게임 모음)
  assert.deepEqual({ js: front.js, css: front.css, lazy: front.lazy.map((b) => b.entry), gzip: front.firstLoad.gzip }, { js: nw.js, css: nw.css, lazy: nw.lazy.map((b) => b.entry), gzip: nw.firstLoad.gzip });
  assert.equal(FIRST_LOAD_NOTICE, 300 * 1024);
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
  // 안내글: 학생은 사이트 주소로 연다(사용자 결정 spec-grade6 15-12 — 파일을 내려받아 여는 쓰임은 지원하지 않는다)
  assert.match(hub, /<p class="lead">게임 링크를 학생에게 나눠 주세요\. 학생은 이 사이트 주소로 열어요\.<\/p>/);
  assert.doesNotMatch(hub, /HTML 파일 하나|내려받으면|인터넷 없이/);
  assert.equal(games.length < FILTER_MIN_GAMES, !hub.includes('class="hub-filter"'));

  // 게임이 4개 이상이면 교과·학년 거르기 칩
  const fake = (id, subject, grades) => ({ dirName: id, isTemplate: false, cover: null, meta: { id, title: id, subject, grades, summary: '', units: ['단원'], playMinutes: 10, mode: '개인', status: '완료' } });
  const many = renderHub({ games: [fake('a', '수학', [5]), fake('b', '수학', [6]), fake('c', '과학', [5, 6]), fake('d', '과학', [6])], hrefFor: (g) => g.meta.id, styles: { links: [] } });
  assert.match(many, /class="hub-filter"/);
  assert.match(many, /data-kind="subject" data-value="수학">수학 2</);
  assert.match(many, /data-kind="grade" data-value="6">6학년 3</);
  assert.doesNotMatch(many, /status-ribbon/); // 완료된 게임에는 띠가 없다
});

// B0d: ?intro=0이 ?grade= 다음에 더해졌다(spec-grade6 15-13). 선생님용 안내와 개발용 게임 모음이 같은 목록(URL_OPTIONS)을 쓴다
test('선생님용 주소 옵션: ?lesson= 다음에 ?area=·?grade=가 있고 차례(lesson, area, grade)를 알린다(review-b0a B0a-6). 그 다음 ?intro=0 (engine.md 8절)', async () => {
  const games = await loadGames(path.join(ROOT, 'src/games'));
  const hub = renderHub({ games, hrefFor: (g) => `${g.meta.id}.html`, styles: { links: ['./assets/base.css'], head: '<meta name="x">' } });
  const guide = renderTeacherGuide({ games, hrefFor: (g) => `${g.meta.id}.html?intro=0`, home: { href: 'net-workshop.html?intro=0', title: '입체도형 공방' }, styles: { links: ['./assets/base.css'], head: '<meta name="x">' } });
  for (const [name, html] of [['개발용 게임 모음', hub], ['선생님용 안내', guide]]) {
    const opts = [...html.matchAll(/<li><code>([^<]+)<\/code>([^<]*)<\/li>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(opts.map((o) => o[0]), ['?lesson=차시-id', '?area=영역-id', '?grade=6', '?intro=0', '?unlock=all', '?stage=단계-id', '?seed=1', '?sound=off', '?fx=low'], name);
    assert.equal(opts[1][1], '그 영역의 단계 지도로 바로');
    assert.match(opts[2][1], /^그 학년 화면으로 바로 \(함께 쓰면 lesson, area, grade 차례\)$/);
    assert.equal(opts[3][1], '인트로 없이 학년 고르기부터');
    assert.deepEqual(opts, URL_OPTIONS, name);
    assert.match(html, /<link rel="stylesheet" href="\.\/assets\/base\.css">\s*<meta name="x">\s*<\/head>/, `${name}: styles.head는 <head> 끝에`);
  }
});

test('선생님용 안내(dist/teacher.html, spec-grade6 15-13·15-14): 맨 위 [← 학년 고르기] · 제목에 앱 이름 · 학생은 사이트 주소로(인트로) · 입체도형 공방 카드만(학년 고르기로) · 기록은 주소마다 따로(두 주소) · 맨 아래 저작권 글', async () => {
  const { outDir } = await site();
  const guide = await read(outDir, GUIDE_PAGE);
  assert.equal(GUIDE_PAGE, 'teacher.html');
  assert.match(guide, /<title>선생님용 안내 - 입체도형 공방<\/title>/);
  // 맨 위: 학년 고르기로 돌아가는 링크(인트로를 건너뛴다) — 본문의 첫 링크
  const links = [...guide.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  assert.equal(links[0], 'net-workshop.html?intro=0');
  assert.match(guide, /<a class="btn btn-small btn-back" href="net-workshop\.html\?intro=0">← 학년 고르기<\/a>/);
  assert.ok(guide.indexOf('btn-back') < guide.indexOf('<h1>'), '돌아가는 링크가 제목보다 위');
  assert.match(guide, /<h1>입체도형 공방 선생님용 <span class="mark">안내<\/span><\/h1>/);
  // 안내글: 사용자가 정한 한 문장 그대로(B0d 덧붙임 6 — 전에는 "학생에게는 이 사이트 주소를 나눠 주세요. 사이트 주소로 열면 … 인트로 …" 세 문장)
  const lead = /<p class="lead">([^<]+)<\/p>/.exec(guide)[1];
  assert.equal(lead, '아래 카드를 누르면 학년 선택 페이지로 이동해요.');
  assert.equal((guide.match(/<p class="lead">/g) ?? []).length, 1, '안내글은 한 곳');
  assert.doesNotMatch(guide, /HTML 파일 하나|내려받으면|인터넷 없이/);
  // 게임 카드: 입체도형 공방 하나(예시 게임은 뺀다 — 사용자 결정 15-13), 카드는 학년 고르기로
  assert.deepEqual(links.slice(1), ['net-workshop.html?intro=0'], '맨 위 링크 다음은 게임 카드 하나뿐');
  assert.match(guide, /<span class="hub-card-title">입체도형 공방<\/span>/);
  assert.doesNotMatch(guide, /약수·배수|sample-divisor-sort/);
  // 기록 안내: 학생 기록은 사이트 주소마다 따로 — 두 주소를 정확히(글로만, 바깥 주소 검사 ①에 걸리지 않게 https://는 빼고)
  assert.deepEqual(SITE_ADDRESSES, ['eversunk2-tech.github.io/game2/', 'solid-figure.pages.dev']);
  const privacy = /<section class="panel hub-privacy">([\s\S]*?)<\/section>/.exec(guide)[1];
  assert.match(privacy, /학생 기록은 그 기기의 브라우저에만 남고 어디에도 전송되지 않아요\./);
  assert.match(privacy, /<b>학생 기록은 사이트 주소마다 따로 남아요\.<\/b> 같은 게임이 두 주소\(<span class="site-name">eversunk2-tech\.github\.io\/game2\/<\/span> · <span class="site-name">solid-figure\.pages\.dev<\/span>\)에 있으니 한 반에는 한 주소만 나눠 주세요\./);
  // 맨 아래 저작권 글(사용자 요청 15-14 덧붙임 2 — 글자 그대로), 본문의 마지막 글
  assert.equal(COPYRIGHT, '© 2026 PSC. All rights reserved.');
  assert.match(guide, /<p class="screen-copyright guide-copyright">© 2026 PSC\. All rights reserved\.<\/p>\s*<\/div>\s*<script>/);
});

test('게임과 빌드가 같은 이름을 쓴다: 입체도형 공방 main.js의 teacherGuide = ./teacher.html(GUIDE_PAGE), footer = 선생님용 안내의 저작권 글(COPYRIGHT)', async () => {
  const main = await readFile(path.join(ROOT, 'src/games', FRONT_GAME, 'main.js'), 'utf8');
  assert.ok(main.includes(`teacherGuide: './${GUIDE_PAGE}',`), 'teacherGuide');
  assert.ok(main.includes(`footer: '${COPYRIGHT}',`), 'footer');
  // 예시 게임·템플릿은 주지 않는다(화면이 지금과 같다)
  for (const dir of ['sample-divisor-sort', '_template']) {
    const src = await readFile(path.join(ROOT, 'src/games', dir, 'main.js'), 'utf8');
    assert.doesNotMatch(src, /teacherGuide|footer:/, dir);
  }
});

test('제목 글꼴에 없는 기호를 알려 준다 (가운뎃점은 제목 자리에 쓰지 않는다)', async () => {
  const ttf = await readFile(DISPLAY_FONT.file);
  const cmap = readCmap(ttf);
  assert.deepEqual(missingSymbols('약수·배수 ㆍ → ★ ✦ … abc 가', cmap), ['·', '✦', '…']);
  assert.ok(cmap.has('ㆍ'.codePointAt(0)), '엔진이 제목 자리에 쓰는 구분 기호');
  const { files } = await site();
  for (const info of files) assert.ok(Array.isArray(info.symbols), info.name);
});

test('템플릿으로 만든 새 게임은 바로 빌드된다. 작은 그림은 CSS 안에 data:, 큰 그림(16 KB 이상)은 assets/로 바이트 그대로. 처음 받는 크기가 300 KB를 넘으면 알리기만 한다', async () => {
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

  const outDir = path.join(rootDir, 'dist');
  const gameCss = async (result) => {
    const info = result.files.find((file) => file.name === 'test-game.html');
    const rel = info.css.find((r) => /^assets\/test-game-[A-Z0-9]{8}\.css$/.test(r));
    assert.ok(rel, info.css.join(', '));
    return { info, rel, text: await readFile(path.join(outDir, rel), 'utf8') };
  };

  // CSS url()로 넣은 SVG는 data: 주소로 들어간다 (docs/engine.md 7절)
  const gameDir = path.join(rootDir, 'src/games/test-game');
  await mkdir(path.join(gameDir, 'img'));
  await writeFile(path.join(gameDir, 'img/dot.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
  await appendFile(path.join(gameDir, 'style.css'), "\n.dot { background: url('./img/dot.svg'); }\n");

  const first = await build({ rootDir, outDir, quiet: true });
  assert.ok(first.games.includes('test-game'));
  const html = await readFile(path.join(outDir, 'test-game.html'), 'utf8');
  assert.match(html, /<title>테스트 &quot;게임&quot; &lt;1&gt;<\/title>/);
  assert.match((await gameCss(first)).text, /url\(["']?data:image\/svg\+xml/);
  assert.deepEqual(await checkSite(outDir), []);

  await assert.rejects(createGame({ rootDir, id: 'test-game' }), /이미 있는/);
  await assert.rejects(createGame({ rootDir, id: 'Bad_Id' }), /소문자/);

  // 16 KB 미만의 래스터 그림은 data: 주소로 들어간다
  const small = Buffer.alloc(ASSET_FILE_MIN - 1, 3);
  await writeFile(path.join(gameDir, 'img/small.png'), small);
  await appendFile(path.join(gameDir, 'style.css'), "\n.small { background: url('./img/small.png'); }\n");
  const withSmall = await build({ rootDir, outDir, quiet: true });
  const smallCss = await gameCss(withSmall);
  const smallRule = smallCss.text.match(/\.small\{background:url\(["']?data:image\/png;base64,([A-Za-z0-9+/=]+)["']?\)\}/);
  assert.ok(smallRule && Buffer.from(smallRule[1], 'base64').equals(small), '작은 그림이 data: 주소로 원본 그대로');
  assert.deepEqual(smallCss.info.assets, []);

  // 큰 래스터 그림(16 KB 이상)은 dist/assets/<이름>-<해시>.png로 바이트 그대로 나가고 게임 CSS(assets/ 안)는 ./ 상대 주소로 가리킨다(B0c2 · B0b).
  // 크기 상한은 여전히 없다(2026-10-09 사용자 결정)
  const big = Buffer.alloc(320 * 1024, 7);
  await writeFile(path.join(gameDir, 'img/big.png'), big);
  await appendFile(path.join(gameDir, 'style.css'), "\n.big { background: url('./img/big.png'); }\n");
  const large = await build({ rootDir, outDir, quiet: true });
  assert.deepEqual(large.games, first.games);
  const largeCss = await gameCss(large);
  const rule = largeCss.text.match(/\.big\{background:url\(["']?\.\/(big-[A-Z0-9]+\.png)["']?\)\}/);
  assert.ok(rule, '.big 규칙이 같은 폴더(assets/)의 그림을 가리키지 않음');
  assert.deepEqual(largeCss.info.assets, [{ name: `assets/${rule[1]}`, bytes: big.length }]);
  assert.ok((await readFile(path.join(outDir, 'assets', rule[1]))).equals(big), '내보낸 그림이 원본과 다름');
  // 그 규칙 하나 말고는 큰 그림을 넣기 전의 CSS와 한 글자도 다르지 않다
  assert.ok(largeCss.text.replace(rule[0], () => '') === smallCss.text, '큰 그림 규칙 말고 다른 곳이 달라짐');
  assert.deepEqual(await checkSite(outDir), []);

  // ④ 처음 받는 크기가 300 KB(gzip)를 넘으면 빌드 로그에 알림 — 막지는 않는다
  const noise = createHash('sha512');
  let blob = '';
  for (let i = 0; blob.length < 720 * 1024; i += 1) blob += noise.update(String(i)).copy().digest('hex'); // 16진수(‘/’ 없음 — 검사 ①에 걸리지 않게)
  await appendFile(path.join(gameDir, 'main.js'), `\nexport const NOISE = ${JSON.stringify(blob)};\nconsole.log(NOISE.length);\n`);
  const lines = [];
  const heavy = await build({ rootDir, outDir, log: (line) => lines.push(line) });
  const info = heavy.files.find((f) => f.name === 'test-game.html');
  assert.ok(info.firstLoad.gzip > FIRST_LOAD_NOTICE, `${info.firstLoad.gzip}`);
  assert.ok(lines.some((l) => l.includes('dist/test-game.html') && l.includes('처음 받는 크기')), lines.join('\n'));
  assert.ok(lines.some((l) => l.includes('알림: 처음 화면이 받는 크기가 300.0 KB를 넘어요')), lines.join('\n'));
});
