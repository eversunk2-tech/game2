/**
 * 여러 파일 빌드 (spec-grade6.md 7-3절 안 B · 7-4절 — B0b). 학생은 사이트 주소(하위 경로 /game2/)로만 연다(사용자 결정 10-09).
 *
 *   src/games/<id>/index.html  →  dist/<id>.html      스타일시트·모듈 스크립트의 주소만 해시 이름으로 바꾸고 modulepreload·글꼴 preload를 넣는다
 *   JS(모든 게임을 한 번에)     →  dist/assets/<이름>-<해시>.js   esbuild format esm + splitting: 게임 들머리, 같이 쓰는 묶음(chunk-…), 늦게 받는 묶음(import())
 *   CSS(<link>마다)             →  dist/assets/<이름>-<해시>.css  엔진 base.css는 모든 게임·게임 모음이 같은 파일 하나
 *   제목 글꼴                   →  dist/assets/display-<해시>.woff2  사이트 전체(게임 모음 + 모든 게임의 JS·CSS·HTML)에 쓰인 글자만 잘라 하나
 *   큰 그림(CSS url(), 16 KB 이상 래스터) → dist/assets/<이름>-<해시>.<확장자>  바이트 그대로(B0c2 — 캔바 AI 그림의 출처 정보가 남는다). 작은 그림·SVG는 data:
 *   사이트 맨 위 주소            →  dist/index.html = FRONT_GAME(입체도형 공방)의 게임 HTML과 같은 내용(spec-grade6 15-13 — 들어오면 인트로가 바로.
 *                                  넘겨 주기 없음. 옛 주소 <id>.html도 그대로 열리고, 같은 출처라 저장 열쇠·기록이 같다)
 *   선생님용 안내                →  dist/teacher.html (GUIDE_PAGE — 전의 게임 모음을 고쳐 씀, CSS는 공통 파일. 게임 목록은 game.json listed가 false인 게임을 뺀다)
 *
 * 주소는 모두 상대 주소(./assets/…, CSS 안에서는 ./이름, JS 사이는 ./이름) — 사이트가 하위 경로에 있다.
 * 검사(어기면 빌드 실패, checkSite): ① 바깥 주소 없음(결과물 전체에서 http(s)://·// — SVG 이름공간만 허용) ② 가리키는 파일이 모두 있음
 * ③ '/'로 시작하는 주소 없음. ④ 크기는 막지 않고 보고: 게임마다 "처음 화면이 받는 크기(gzip)"와 늦게 받는 묶음, 300 KB를 넘으면 알림.
 * 파일 크기에는 상한이 없다(2026-10-09 사용자 결정).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import * as esbuild from 'esbuild';
import { bootErrorHandler } from '../src/shared/core/reload.js';
import { collectFontText, displayFontRule, isHangulSyllable, missingSymbols, readCmapOfDisplay, subsetDisplayFont } from './lib/font.mjs';
import { isListed, loadGames } from './lib/games.mjs';
import { COPYRIGHT, escapeHtml, renderTeacherGuide } from './lib/hub.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

// 학교 크롬북·태블릿에서 돌아가는 범위 (ES 모듈·import()는 이 범위에서 모두 된다)
const TARGET = ['es2020', 'chrome90', 'safari15', 'firefox90'];

/** 따로 나간 파일이 놓이는 폴더(dist 아래). HTML 안에서는 ./assets/이름 */
export const ASSET_DIR = 'assets';
/** 따로 파일로 내보내는 그림: 래스터 그림(png·jpg·gif·webp) 가운데 이 크기 이상. 작은 그림·SVG는 data: 주소 (B0c2) */
export const ASSET_FILE_MIN = 16 * 1024;
/** 처음 화면이 받는 크기(gzip)가 이것을 넘으면 빌드 로그에 알림(막지는 않는다 — 7-4절 ④) */
export const FIRST_LOAD_NOTICE = 300 * 1024;
/** 바깥 주소 검사에서 허용하는 것: SVG 이름공간(문자열로만 쓰인다) */
export const ALLOWED_URLS = ['http://www.w3.org/2000/svg'];
/** 사이트 맨 위 주소(dist/index.html)로 여는 게임 — 그 게임 HTML을 index.html로도 내보낸다(spec-grade6 15-13) */
export const FRONT_GAME = 'net-workshop';
/** 선생님용 안내 페이지 이름(게임 main.js의 teacherGuide: './teacher.html'과 같아야 한다 — tests/unit/build.test.js) */
export const GUIDE_PAGE = 'teacher.html';
/** 같은 사이트가 올라가 있는 주소(선생님용 안내에 글로만 — 학생 기록은 주소마다 따로다). 바깥 주소 검사 ①에 걸리지 않게 https://는 빼고 쓴다 */
export const SITE_ADDRESSES = ['eversunk2-tech.github.io/game2/', 'solid-figure.pages.dev'];

const ASSET_LOADERS = {
  '.png': 'dataurl',
  '.jpg': 'dataurl',
  '.jpeg': 'dataurl',
  '.gif': 'dataurl',
  '.webp': 'dataurl',
  '.svg': 'dataurl',
  '.mp3': 'dataurl',
  '.wav': 'dataurl',
  '.ogg': 'dataurl',
  '.woff2': 'dataurl',
};
const RASTER = /\.(png|jpe?g|gif|webp)$/i;

/** 큰 래스터 그림은 file 로더(바이트 그대로 복사 — 다시 인코딩하지 않는다), 작은 것은 data: 주소 (B0c2와 같다) */
const assetPlugin = {
  name: 'big-images-as-files',
  setup(b) {
    b.onLoad({ filter: RASTER }, async (args) => {
      const contents = await readFile(args.path);
      return { contents, loader: contents.length >= ASSET_FILE_MIN ? 'file' : 'dataurl' };
    });
  },
};

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ?? null;
const isLocal = (ref) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref);
const gz = (buf) => gzipSync(buf, { level: 9 }).length;

/** 사이트 안의 내용 해시(esbuild와 같은 모양: 대문자·숫자 8자) */
export function contentHash(buf) {
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = createHash('sha256').update(buf).digest();
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 8) {
      out += ABC[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * 게임 index.html에서 묶을 것을 찾는다: <link rel="stylesheet" href> 목록과 <script type="module" src> 목록(로컬 파일만).
 * 바깥 주소·모듈이 아닌 <script src>는 오류(학교망·오프라인 — 그리고 모듈만 묶는다)
 */
export function readPage(html, baseDir) {
  const styles = [];
  const scripts = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(m[0])) continue;
    const href = attr(m[0], 'href');
    if (!href || !isLocal(href)) throw new Error(`외부 스타일시트는 쓸 수 없어요(오프라인·학교망): ${m[0]}`);
    styles.push({ tag: m[0], file: path.resolve(baseDir, href) });
  }
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script>/gi)) {
    const src = attr(m[0], 'src');
    if (!src || !isLocal(src)) throw new Error(`외부 스크립트는 쓸 수 없어요(오프라인·학교망): ${m[0]}`);
    if (!/\btype\s*=\s*["']module["']/i.test(m[0])) throw new Error(`스크립트는 <script type="module">로 넣어요: ${m[0]}`);
    scripts.push({ tag: m[0], file: path.resolve(baseDir, src) });
  }
  return { styles, scripts };
}

/** 묶음의 이름: 엔진 CSS는 파일 이름(base·hub), 게임의 style.css·main.js는 게임 id, 그 밖의 게임 파일은 "<id>-<파일 이름>" */
function entryName(file, gameId, srcDir) {
  const base = path.basename(file).replace(/\.[^.]+$/, '');
  if (!gameId || !file.startsWith(path.join(srcDir, 'games') + path.sep)) return base;
  return base === 'style' || base === 'main' ? gameId : `${gameId}-${base}`;
}

/** 묶은 결과의 한 파일이 정적으로 가져오는 파일(import-statement)과 늦게 가져오는 파일(dynamic-import) — 결과물 기준 이름(assets/…) */
function importsOf(metafile, rel) {
  const out = metafile.outputs[rel];
  const pick = (kind) => (out?.imports ?? []).filter((i) => i.kind === kind && !i.external).map((i) => i.path);
  return { statics: pick('import-statement'), dynamics: pick('dynamic-import') };
}

/** 들머리에서 정적으로 닿는 JS 모두(들머리 포함, 차례 그대로) */
function staticClosure(metafile, entry) {
  const seen = [];
  const walk = (rel) => {
    if (seen.includes(rel)) return;
    seen.push(rel);
    importsOf(metafile, rel).statics.forEach(walk);
  };
  walk(entry);
  return seen;
}

/** 들머리에서 늦게 받는 묶음들: import()의 대상마다 { entry, files(그 묶음을 받을 때 더 받는 JS — 이미 처음에 받은 것 빼고) } */
function lazyBundles(metafile, entry) {
  const first = new Set(staticClosure(metafile, entry));
  const bundles = [];
  const queue = [entry];
  const done = new Set();
  while (queue.length) {
    const rel = queue.shift();
    if (done.has(rel)) continue;
    done.add(rel);
    for (const target of importsOf(metafile, rel).dynamics) {
      if (bundles.some((b) => b.entry === target)) continue;
      const files = staticClosure(metafile, target).filter((f) => !first.has(f));
      bundles.push({ entry: target, files });
      queue.push(target);
    }
    importsOf(metafile, rel).statics.forEach((s) => queue.push(s));
  }
  return bundles;
}

/** HTML에 들어갈 상대 주소 */
const href = (rel) => `./${rel}`;

/** 글꼴을 쓰는 HTML <head> 조각: 글꼴 미리 받기 + @font-face(./assets/display-해시.woff2) */
function fontHead(fontRel) {
  return `<link rel="preload" href="${href(fontRel)}" as="font" type="font/woff2" crossorigin>\n  <style>${displayFontRule(href(fontRel))}</style>`;
}

/**
 * 게임 HTML: <link rel="stylesheet">·<script type="module">의 주소만 해시 이름으로, </head> 앞에 modulepreload·글꼴.
 * 모듈 스크립트에는 onerror(처음 스크립트를 못 받으면 한 번만 새로 고침 — core/reload.js)
 */
function rewritePage(html, page, fontRel) {
  let out = html;
  for (const s of page.styles) out = out.replace(s.tag, () => `<link rel="stylesheet" href="${href(s.rel)}">`);
  const onerror = escapeHtml(bootErrorHandler());
  for (const s of page.scripts) out = out.replace(s.tag, () => `<script type="module" src="${href(s.rel)}" onerror="${onerror}"></script>`);
  const preload = [...new Set(page.scripts.flatMap((s) => s.closure))].map((rel) => `<link rel="modulepreload" href="${href(rel)}">`);
  const head = [...preload, fontHead(fontRel)].join('\n  ');
  if (!/<\/head>/i.test(out)) throw new Error(`${page.label}: </head>가 없어요.`);
  return out.replace(/<\/head>/i, () => `  ${head}\n</head>`);
}

// ── 검사 (① ② ③) ─────────────────────────────

const TEXT_EXT = /\.(html|js|css|svg|json|txt)$/i;

/** 결과물의 한 글(HTML·JS·CSS)에서 바깥 주소(①)를 찾는다: http(s)://·// — 허용하는 SVG 이름공간을 뺀 뒤 */
export function findUrls(text) {
  let rest = String(text);
  for (const ok of ALLOWED_URLS) rest = rest.split(ok).join(' ');
  return [...rest.matchAll(/.{0,24}(?:https?:|\/\/).{0,24}/g)].map((m) => m[0].trim());
}

/**
 * HTML이 가리키는 파일(src·href, 그리고 <style>·style=""의 url()). 로컬 상대 주소만 돌려준다 — data:·#·빈 값은 뺀다.
 * → [{ ref, where }]
 */
export function htmlRefs(html) {
  const refs = [];
  for (const m of html.matchAll(/<(script|img|audio|video|source|iframe|link|a)\b[^>]*>/gi)) {
    const name = m[1].toLowerCase() === 'a' || m[1].toLowerCase() === 'link' ? 'href' : 'src';
    const value = attr(m[0], name);
    if (value != null) refs.push({ ref: value, where: m[0].slice(0, 80) });
  }
  const styles = [
    ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]),
    ...[...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]),
    ...[...html.matchAll(/\sstyle\s*=\s*'([^']*)'/gi)].map((m) => m[1]),
  ];
  for (const css of styles) refs.push(...cssRefs(css).map((ref) => ({ ref, where: `url(${ref})` })));
  return refs.filter((r) => r.ref && !r.ref.startsWith('data:') && !r.ref.startsWith('#'));
}

/** CSS의 url()·@import가 가리키는 것(data:·# 빼고) */
export function cssRefs(css) {
  const refs = [];
  for (const m of String(css).matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)) refs.push(m[2].trim());
  for (const m of String(css).matchAll(/@import\s*(?:url\(\s*)?["']?([^"';)\s]*)/gi)) refs.push(`@import ${m[1]}`);
  return refs.filter((r) => r && !r.startsWith('data:') && !r.startsWith('#'));
}

/** JS(esbuild ESM 결과)가 가져오는 것: import … from "…", import "…", import("…") */
export function jsRefs(js) {
  const refs = [];
  for (const m of String(js).matchAll(/(?:^|[;}\s])(?:import|export)\s*[\w$*\s{},]*?\s*from\s*["']([^"']+)["']/g)) refs.push(m[1]);
  for (const m of String(js).matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) refs.push(m[1]);
  for (const m of String(js).matchAll(/(?:^|[;}\s])import\s*["']([^"']+)["']/g)) refs.push(m[1]);
  return refs;
}

/** 같은 사이트 안의 상대 주소인가: ./ 로 시작하고, 위로 가지 않고(..), 이름은 영문·숫자·._- */
const SAFE_REL = /^\.\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;

/**
 * 결과물 폴더 전체를 검사한다(빌드 끝과 단위 검사가 같이 쓴다). → 문제 목록(비면 통과)
 *   ① 바깥 주소 없음: 모든 글 파일에서 http(s)://·// (SVG 이름공간만 허용)
 *   ② 가리키는 파일이 모두 있음: HTML의 src·href·url(), CSS의 url(), JS의 import — 그 파일 기준 상대 주소로 풀어 dist 안에 있어야 한다
 *   ③ '/'로 시작하는 주소 없음(하위 경로 /game2/에서 깨진다) — 상대 주소는 ./로 시작하고 ..로 위로 가지 않는다
 *   HTML의 <a href>는 같은 폴더의 다른 HTML(선생님용 안내의 게임 링크 "<id>.html?intro=0", 게임의 [선생님용 안내] "./teacher.html")만 된다
 */
export async function checkSite(outDir) {
  const problems = [];
  const files = await listFiles(outDir);
  const have = new Set(files);
  for (const rel of files) {
    if (!TEXT_EXT.test(rel)) continue;
    const text = await readFile(path.join(outDir, rel), 'utf8');
    for (const hit of findUrls(text)) problems.push(`${rel}: 바깥 주소 ① — ${hit}`);
    const dir = path.posix.dirname(rel);
    const check = (ref, where, { page = false } = {}) => {
      if (ref.startsWith('@import')) return problems.push(`${rel}: @import는 쓰지 않아요 — ${ref}`);
      if (ref.startsWith('/')) return problems.push(`${rel}: '/'로 시작하는 주소 ③ — ${where}`);
      const plain = ref.split(/[?#]/)[0];
      if (page && /^[A-Za-z0-9._-]+\.html$/.test(plain)) {
        if (!have.has(path.posix.join(dir, plain))) problems.push(`${rel}: 가리키는 파일이 없어요 ② — ${ref}`);
        return null;
      }
      if (!SAFE_REL.test(plain)) return problems.push(`${rel}: 같은 사이트의 상대 주소(./…)가 아니에요 — ${where}`);
      const target = path.posix.normalize(path.posix.join(dir, plain));
      if (!have.has(target)) problems.push(`${rel}: 가리키는 파일이 없어요 ② — ${ref}`);
      return null;
    };
    if (rel.endsWith('.html')) {
      for (const { ref, where } of htmlRefs(text)) check(ref, where, { page: /^<a\b/i.test(where) });
    } else if (rel.endsWith('.css')) {
      for (const ref of cssRefs(text)) check(ref, `url(${ref})`);
    } else if (rel.endsWith('.js')) {
      for (const ref of jsRefs(text)) check(ref, `import ${ref}`);
    }
  }
  return problems;
}

async function listFiles(dir, base = '') {
  const out = [];
  for (const entry of await readdir(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(dir, rel)));
    else out.push(rel);
  }
  return out.sort();
}

// ── 빌드 ─────────────────────────────

export async function build({ rootDir = ROOT, outDir = path.join(rootDir, 'dist'), quiet = false, log: logTo = console.log } = {}) {
  const log = quiet ? () => {} : logTo;
  const srcDir = path.join(rootDir, 'src');
  const games = await loadGames(path.join(srcDir, 'games'));

  const invalid = games.filter((g) => g.errors.length > 0);
  if (invalid.length > 0) {
    const detail = invalid.map((g) => `  ${g.dirName}:\n${g.errors.map((e) => `    - ${e}`).join('\n')}`).join('\n');
    throw new Error(`game.json·cover.svg를 고쳐 주세요.\n${detail}`);
  }

  // 1. 페이지마다 묶을 것: 게임 HTML의 <link>·<script type="module">, 게임 모음의 엔진 CSS 둘
  const entries = new Map(); // 원본 파일 → { file, out(이름) }
  const addEntry = (file, gameId) => {
    if (!entries.has(file)) entries.set(file, { file, out: entryName(file, gameId, srcDir) });
    return entries.get(file);
  };
  const pages = [];
  for (const game of games) {
    const html = await readFile(path.join(game.dir, 'index.html'), 'utf8');
    const found = readPage(html, game.dir);
    if (found.scripts.length === 0) throw new Error(`${game.dirName}: index.html에 <script type="module" src="./main.js">가 없어요.`);
    found.styles.forEach((s) => addEntry(s.file, game.meta.id));
    found.scripts.forEach((s) => addEntry(s.file, game.meta.id));
    pages.push({ name: `${game.meta.id}.html`, label: game.dirName, html, ...found });
  }
  const front = pages.find((p) => p.name === `${FRONT_GAME}.html`);
  if (!front) throw new Error(`사이트 맨 위 주소로 열 게임(${FRONT_GAME})이 src/games에 없어요(scripts/build.mjs FRONT_GAME).`);
  const styleDir = path.join(srcDir, 'shared/styles');
  const hubStyles = ['base.css', 'hub.css'].map((f) => ({ file: path.join(styleDir, f) }));
  hubStyles.forEach((s) => addEntry(s.file, null));
  const names = [...entries.values()].map((e) => `${e.out}${path.extname(e.file)}`);
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  if (twice.length) throw new Error(`묶음 이름이 겹쳐요: ${twice.join(', ')} (게임 폴더의 파일 이름을 바꿔 주세요)`);

  // 2. esbuild 한 번: 모든 게임의 JS(format esm, splitting — 같이 쓰는 묶음·늦게 받는 묶음) + CSS. 파일은 아직 쓰지 않는다
  const result = await esbuild.build({
    entryPoints: [...entries.values()].map((e) => ({ in: e.file, out: e.out })),
    bundle: true,
    splitting: true,
    format: 'esm',
    write: false,
    metafile: true,
    minify: true,
    charset: 'utf8',
    legalComments: 'none',
    target: TARGET,
    loader: ASSET_LOADERS,
    logLevel: 'silent',
    absWorkingDir: rootDir,
    outdir: outDir,
    entryNames: `${ASSET_DIR}/[name]-[hash]`,
    chunkNames: `${ASSET_DIR}/[name]-[hash]`,
    assetNames: `${ASSET_DIR}/[name]-[hash]`,
    plugins: [assetPlugin],
  });
  const relOut = (abs) => path.relative(outDir, abs).split(path.sep).join('/');
  const outputs = new Map(result.outputFiles.map((f) => [relOut(f.path), f.contents]));
  // metafile의 경로(rootDir 기준)를 결과물 기준(assets/…)으로
  const metafile = { outputs: {} };
  for (const [key, value] of Object.entries(result.metafile.outputs)) {
    const rel = relOut(path.resolve(rootDir, key));
    metafile.outputs[rel] = { ...value, imports: value.imports.map((i) => ({ ...i, path: i.external ? i.path : relOut(path.resolve(rootDir, i.path)) })) };
  }
  const outputOf = (file) => {
    const found = Object.entries(metafile.outputs).find(([, v]) => v.entryPoint && path.resolve(rootDir, v.entryPoint) === file);
    if (!found) throw new Error(`${file}: 묶은 결과가 없어요.`);
    return found[0];
  };
  for (const [rel, value] of Object.entries(metafile.outputs)) {
    if (rel.endsWith('.js') && value.cssBundle) throw new Error(`${rel}: JS에서 CSS를 import했어요. CSS는 index.html의 <link>로 넣어 주세요.`);
  }
  for (const page of pages) {
    page.styles.forEach((s) => { s.rel = outputOf(s.file); });
    page.scripts.forEach((s) => {
      s.rel = outputOf(s.file);
      s.closure = staticClosure(metafile, s.rel);
      s.lazy = lazyBundles(metafile, s.rel);
    });
  }
  const hubRels = hubStyles.map((s) => outputOf(s.file));

  // 3. 선생님용 안내 HTML(글꼴 이름은 아직 모른다 — 자리표: ASCII라 글꼴 글자에는 영향이 없다). 게임 카드·맨 위 링크는 인트로를 건너뛰는 주소(?intro=0)
  const FONT_SLOT = `${ASSET_DIR}/display-FONTSLOT.woff2`;
  const skipIntro = (id) => `${id}.html?intro=0`;
  const guideHtml = renderTeacherGuide({
    games: games.filter(isListed),
    hrefFor: (g) => skipIntro(g.meta.id),
    home: { href: skipIntro(FRONT_GAME), title: games.find((g) => g.meta.id === FRONT_GAME).meta.title },
    sites: SITE_ADDRESSES,
    copyright: COPYRIGHT,
    styles: { links: hubRels.map(href), head: fontHead(FONT_SLOT) },
  });
  const drafts = pages.map((page) => ({ page, html: rewritePage(page.html, page, FONT_SLOT) }));

  // 4. 제목 글꼴: 사이트 전체(게임 모음 + 모든 게임의 JS·CSS·HTML)에 쓰인 글자 → display-해시.woff2 하나
  const textOf = (rel) => (/\.(js|css)$/.test(rel) ? Buffer.from(outputs.get(rel)).toString('utf8') : '');
  const textOutputs = [...outputs.keys()].filter((rel) => /\.(js|css)$/.test(rel));
  const siteText = collectFontText([guideHtml, ...drafts.map((d) => d.html), ...textOutputs.map(textOf)].join('\n'));
  const cmap = await readCmapOfDisplay();
  const kept = [...siteText].filter((ch) => cmap.has(ch.codePointAt(0)));
  const woff2 = Buffer.from(await subsetDisplayFont(kept.join(''), 'woff2'));
  const fontRel = `${ASSET_DIR}/display-${contentHash(woff2)}.woff2`;
  const withFont = (html) => html.split(FONT_SLOT).join(fontRel);

  // 5. 쓰기
  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, ASSET_DIR), { recursive: true });
  for (const [rel, contents] of outputs) await writeFile(path.join(outDir, rel), contents);
  await writeFile(path.join(outDir, fontRel), woff2);

  const sizeOf = (rel) => {
    const buf = rel === fontRel ? woff2 : outputs.get(rel);
    return { bytes: buf.length, gzip: /\.(js|css|html|svg)$/.test(rel) ? gz(buf) : buf.length };
  };
  const sum = (list) => list.reduce((acc, rel) => {
    const s = sizeOf(rel);
    return { bytes: acc.bytes + s.bytes, gzip: acc.gzip + s.gzip };
  }, { bytes: 0, gzip: 0 });
  const imagesOf = (cssRels) => [...new Set(cssRels.flatMap((rel) => (metafile.outputs[rel]?.imports ?? []).filter((i) => i.kind === 'url-token' && outputs.has(i.path)).map((i) => i.path)))]; // data: 그림은 빼고 따로 나간 파일만

  /** 페이지 하나를 쓰고 크기·글꼴 글자를 알린다 */
  const files = [];
  async function emit(name, html, { cssRels, jsFirst = [], lazy = [] }) {
    const out = withFont(html);
    await writeFile(path.join(outDir, name), out);
    const htmlSize = { bytes: Buffer.byteLength(out), gzip: gz(Buffer.from(out)) };
    const first = sum([...cssRels, ...jsFirst, fontRel]);
    const firstLoad = { files: [name, ...cssRels, ...jsFirst, fontRel], bytes: htmlSize.bytes + first.bytes, gzip: htmlSize.gzip + first.gzip };
    const lazyInfo = lazy.map((b) => ({ entry: b.entry, files: b.files, ...sum(b.files) }));
    const images = imagesOf(cssRels).map((rel) => ({ name: rel, bytes: outputs.get(rel).length }));
    // 제목 글꼴에 없는 글자: 이 페이지가 받을 수 있는 모든 글(HTML + CSS + 처음·늦게 받는 JS)
    const pageText = collectFontText([out, ...cssRels.map(textOf), ...jsFirst.map(textOf), ...lazy.flatMap((b) => b.files.map(textOf))].join('\n'));
    const missing = [...pageText].filter((ch) => isHangulSyllable(ch) && !cmap.has(ch.codePointAt(0)));
    const symbols = missingSymbols(pageText, cmap);
    const info = { name, bytes: htmlSize.bytes, html: htmlSize, css: cssRels, js: jsFirst, firstLoad, lazy: lazyInfo, assets: images, font: fontRel, missing, symbols };
    files.push(info);
    const lazyText = lazyInfo.length ? ` · 늦게 받는 묶음 ${lazyInfo.map((b) => `${path.posix.basename(b.entry)} ${kb(b.gzip)}`).join(', ')}` : '';
    const imageText = images.length ? ` · 따로 나간 그림 ${images.length}개 ${kb(images.reduce((s, a) => s + a.bytes, 0))}` : '';
    const lost = missing.length ? `, 제목 글꼴에 없는 글자 ${missing.join('')}` : '';
    log(`  ✓ dist/${name}  처음 받는 크기 ${kb(firstLoad.gzip)}(gzip, 파일 ${firstLoad.files.length}개)${lazyText}${imageText}${lost}`);
    if (firstLoad.gzip > FIRST_LOAD_NOTICE) log(`    알림: 처음 화면이 받는 크기가 ${kb(FIRST_LOAD_NOTICE)}를 넘어요(${kb(firstLoad.gzip)}) — 늦게 받는 묶음으로 나눌 수 있는지 봐요(막지는 않아요)`);
    if (symbols.length) {
      // 알림: 본문 글자에는 문제없지만 제목·버튼(제목 글꼴 자리)에 쓰면 기기 글꼴로 섞여 보인다
      log(`    알림: 제목 글꼴에 없는 기호 ${[...new Set(symbols)].join(' ')} — 제목·버튼 자리에는 쓰지 마세요(가운뎃점은 'ㆍ'로)`);
    }
  }

  for (const { page, html } of drafts) {
    const jsFirst = [...new Set(page.scripts.flatMap((s) => s.closure))];
    const lazy = page.scripts.flatMap((s) => s.lazy);
    const opts = { cssRels: page.styles.map((s) => s.rel), jsFirst, lazy };
    await emit(page.name, html, opts);
    // 사이트 맨 위 주소: 그 게임 HTML과 같은 내용(같은 폴더라 ./assets/ 주소가 그대로 맞다 — 넘겨 주기 없이 인트로가 바로)
    if (page === front) await emit('index.html', html, opts);
  }
  await emit(GUIDE_PAGE, guideHtml, { cssRels: hubRels });
  log(`  ✓ dist/${fontRel}  제목 글꼴 ${kept.length}자 ${kb(woff2.length)} (사이트 전체에 하나)`);

  // 6. 검사 ① ② ③ (어기면 실패)
  const problems = await checkSite(outDir);
  if (problems.length > 0) throw new Error(`결과물 검사에 걸렸어요:\n  ${problems.join('\n  ')}`);

  return { outDir, games: games.map((g) => g.meta.id), files, font: { name: fontRel, chars: kept.length, bytes: woff2.length }, outputs: [...outputs.keys(), fontRel].sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().then(
    ({ games }) => console.log(`\n게임 ${games.length}개를 dist/에 만들었어요. 확인: npm run preview`),
    (error) => {
      console.error(`\n빌드 실패: ${error.message}`);
      process.exit(1);
    },
  );
}

