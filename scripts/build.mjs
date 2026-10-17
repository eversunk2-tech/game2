/**
 * 게임마다 HTML 한 파일(+ 큰 그림은 따로 파일)을 만든다.
 *
 *   src/games/<id>/index.html  →  dist/<id>.html
 *   큰 그림(CSS url())          →  dist/assets/<이름>-<해시>.<확장자>   (HTML 안에서는 ./assets/… 상대 주소)
 *   게임 모음                    →  dist/index.html
 *
 * index.html의 <link rel="stylesheet" href="…">와 <script type="module" src="…">를
 * esbuild로 묶어 그 자리에 <style>, <script>로 넣는다. 그림 파일은 CSS url()로 쓰면
 * 작은 그림(SVG, 16 KB 미만의 래스터 그림)은 data: 주소로 들어가고, 16 KB 이상의 래스터 그림(png·jpg·gif·webp)은
 * dist/assets/로 바이트 그대로 복사되어 상대 주소로 가리킨다(docs/engine.md 7절 — B0c2, 2880 인트로 그림을 HTML에 넣으면 첫 화면이 늦어서).
 * 제목 글꼴(Do Hyeon)은 파일마다 쓰인 글자만 잘라 data: 주소 @font-face로 넣는다(scripts/lib/font.mjs).
 * 파일 크기에는 상한이 없다(2026-10-09 사용자 결정). 크기는 로그에 찍기만 한다.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { displayFontFace, injectStyle } from './lib/font.mjs';
import { loadGames } from './lib/games.mjs';
import { renderHub } from './lib/hub.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

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

// 학교 크롬북·태블릿에서 돌아가는 범위
const TARGET = ['es2020', 'chrome90', 'safari15', 'firefox90'];

/** 따로 파일로 내보내는 그림: 래스터 그림(png·jpg·gif·webp) 가운데 이 크기 이상. 작은 그림·SVG는 지금처럼 data: 주소 */
export const ASSET_FILE_MIN = 16 * 1024;
/** 따로 나간 그림이 놓이는 폴더(dist 아래)와 HTML 안의 상대 주소 앞머리 */
export const ASSET_DIR = 'assets';
const RASTER = /\.(png|jpe?g|gif|webp)$/i;

/** 큰 래스터 그림은 file 로더(바이트 그대로 복사 — 다시 인코딩하지 않는다), 작은 것은 data: 주소 */
const assetPlugin = {
  name: 'big-images-as-files',
  setup(b) {
    b.onLoad({ filter: RASTER }, async (args) => {
      const contents = await readFile(args.path);
      return { contents, loader: contents.length >= ASSET_FILE_MIN ? 'file' : 'dataurl' };
    });
  },
};

/** 묶기: { text(CSS·JS), assets: [{ name: 'assets/이름-해시.확장자', contents }] } */
async function bundle(entry, kind) {
  const outdir = path.dirname(entry); // 파일을 쓰지 않는다(write: false) — 따로 나간 그림의 이름을 셀 기준 폴더일 뿐
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    minify: true,
    charset: 'utf8',
    legalComments: 'none',
    target: TARGET,
    loader: ASSET_LOADERS,
    logLevel: 'silent',
    outdir,
    assetNames: `${ASSET_DIR}/[name]-[hash]`,
    publicPath: './',
    plugins: [assetPlugin],
    ...(kind === 'js' ? { format: 'iife' } : {}),
  });
  const ext = kind === 'js' ? '.js' : '.css';
  const main = result.outputFiles.filter((f) => f.path.endsWith(ext) && path.dirname(f.path) === outdir);
  if (main.length !== 1) {
    throw new Error(`${entry}: 결과 파일이 ${result.outputFiles.length}개예요. JS에서 CSS를 import하지 말고 index.html의 <link>로 넣어 주세요.`);
  }
  const assets = result.outputFiles.filter((f) => f !== main[0]).map((f) => ({ name: path.relative(outdir, f.path).split(path.sep).join('/'), contents: f.contents }));
  return { text: main[0].text, assets };
}

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ?? null;

/** 태그를 찾아 비동기로 바꾼다. 바꿀 내용에 $가 있어도 안전하도록 직접 이어 붙인다. */
async function replaceTags(html, pattern, replacer) {
  let out = '';
  let last = 0;
  for (const match of html.matchAll(pattern)) {
    out += html.slice(last, match.index) + (await replacer(match[0]));
    last = match.index + match[0].length;
  }
  return out + html.slice(last);
}

const isLocal = (ref) => !/^(?:[a-z]+:|\/\/)/i.test(ref);

/** index.html의 스타일·스크립트를 묶어 넣는다 → { html, assets }(따로 나갈 그림, 이름이 같으면 한 번) */
export async function inlineHtml(html, baseDir) {
  const assets = new Map();
  const keep = (list) => list.forEach((a) => assets.set(a.name, a));
  let out = await replaceTags(html, /<link\b[^>]*>/gi, async (tag) => {
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag)) return tag;
    const href = attr(tag, 'href');
    if (!href || !isLocal(href)) throw new Error(`외부 스타일시트는 쓸 수 없어요(오프라인·학교망): ${tag}`);
    const css = await bundle(path.resolve(baseDir, href), 'css');
    keep(css.assets);
    return `<style>${css.text.trim()}</style>`;
  });

  out = await replaceTags(out, /<script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script>/gi, async (tag) => {
    const src = attr(tag, 'src');
    if (!src || !isLocal(src)) throw new Error(`외부 스크립트는 쓸 수 없어요(오프라인·학교망): ${tag}`);
    const js = await bundle(path.resolve(baseDir, src), 'js');
    keep(js.assets);
    return `<script>${js.text.trim()}</script>`;
  });

  return { html: out, assets: [...assets.values()] };
}

/** HTML(스타일 안)이 가리키는 따로 나간 그림: './assets/이름' 목록 */
const ASSET_REF = new RegExp(`url\\(\\s*["']?\\./${ASSET_DIR}/([A-Za-z0-9._-]+)["']?\\s*\\)`, 'g');
export function assetRefs(html) {
  return [...new Set([...String(html).matchAll(ASSET_REF)].map((m) => `${ASSET_DIR}/${m[1]}`))];
}

/**
 * 빌드 결과가 바깥 파일 없이 열리는지 검사한다: data: 주소와, 같이 내보낸 그림을 가리키는 상대 주소 ./assets/이름만 된다
 * (사이트가 하위 경로 /game2/에 있어 '/'로 시작하는 주소는 안 된다. ./assets/ 아래의 다른 경로(../ 등)도 안 된다)
 */
export function findExternalRefs(html) {
  const problems = [];
  for (const m of html.matchAll(/<(script|img|audio|video|source|iframe)\b[^>]*\bsrc\s*=\s*["']([^"']*)["']/gi)) {
    if (!m[2].startsWith('data:')) problems.push(`<${m[1]} src="${m[2]}">`);
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const href = attr(m[0], 'href');
    if (href && !href.startsWith('data:')) problems.push(m[0]);
  }
  // <style> 블록(SVG 안 포함)과 style="" 속성: url()은 data:·#만, @import는 모두 바깥 참조로 본다
  const styles = [
    ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]),
    ...[...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]),
    ...[...html.matchAll(/\sstyle\s*=\s*'([^']*)'/gi)].map((m) => m[1]),
  ];
  for (const css of styles) {
    for (const m of css.matchAll(/url\(\s*["']?(?!data:|#)([^"')\s]+)/gi)) {
      if (new RegExp(`^\\./${ASSET_DIR}/[A-Za-z0-9._-]+$`).test(m[1]) && !m[1].includes('..')) continue; // 같이 내보낸 그림
      problems.push(`url(${m[1]})`);
    }
    for (const m of css.matchAll(/@import\s*(?:url\(\s*)?["']?([^"';)\s]*)/gi)) problems.push(`@import ${m[1]}`.trim());
  }
  return problems;
}

export async function build({ rootDir = ROOT, outDir = path.join(rootDir, 'dist'), quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  const srcDir = path.join(rootDir, 'src');
  const games = await loadGames(path.join(srcDir, 'games'));

  const invalid = games.filter((g) => g.errors.length > 0);
  if (invalid.length > 0) {
    const detail = invalid.map((g) => `  ${g.dirName}:\n${g.errors.map((e) => `    - ${e}`).join('\n')}`).join('\n');
    throw new Error(`game.json·cover.svg를 고쳐 주세요.\n${detail}`);
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  /** 글꼴을 넣고, 바깥 참조를 검사한 뒤 쓴다(따로 나갈 그림도). 크기는 로그에 찍기만 한다(상한 없음). */
  const files = [];
  const written = new Map(); // 따로 나간 그림: 이름 → 바이트 수 (게임 사이에 같은 그림이면 한 번)
  async function emit(name, html, label, assets = []) {
    const font = await displayFontFace(html);
    const out = injectStyle(html, font.css);
    const problems = findExternalRefs(out);
    if (problems.length > 0) {
      throw new Error(`${label}: 바깥 파일을 가리켜요(같이 내보낸 ./${ASSET_DIR}/ 그림만 된다):\n  ${problems.join('\n  ')}`);
    }
    // 가리키는 그림이 모두 같이 나가는지
    const names = new Set(assets.map((a) => a.name));
    const lost = assetRefs(out).filter((ref) => !names.has(ref));
    if (lost.length > 0) throw new Error(`${label}: 가리키는 그림이 없어요: ${lost.join(', ')}`);
    if (assets.length > 0) await mkdir(path.join(outDir, ASSET_DIR), { recursive: true });
    for (const a of assets) {
      if (!written.has(a.name)) await writeFile(path.join(outDir, a.name), a.contents);
      written.set(a.name, a.contents.length);
    }
    const bytes = Buffer.byteLength(out);
    const file = path.join(outDir, name);
    await writeFile(file, out);
    const missing = font.missing.length ? `, 제목 글꼴에 없는 글자 ${font.missing.join('')}` : '';
    const assetBytes = assets.reduce((sum, a) => sum + a.contents.length, 0);
    const outside = assets.length ? ` + 따로 나간 그림 ${assets.length}개 ${kb(assetBytes)}` : '';
    log(`  ✓ ${path.relative(rootDir, file)}  (${kb(bytes)}${outside}, 제목 글꼴 ${font.chars}자 ${kb(font.bytes)}${missing})`);
    if (font.symbols.length) {
      // 알림: 본문 글자에는 문제없지만 제목·버튼(제목 글꼴 자리)에 쓰면 기기 글꼴로 섞여 보인다
      log(`    알림: 제목 글꼴에 없는 기호 ${font.symbols.join(' ')} — 제목·버튼 자리에는 쓰지 마세요(가운뎃점은 'ㆍ'로)`);
    }
    files.push({ name, bytes, assets: assets.map((a) => ({ name: a.name, bytes: a.contents.length })), fontChars: font.chars, fontBytes: font.bytes, missing: font.missing, symbols: font.symbols });
  }

  for (const game of games) {
    const html = await readFile(path.join(game.dir, 'index.html'), 'utf8');
    const inlined = await inlineHtml(html, game.dir);
    await emit(`${game.meta.id}.html`, inlined.html, game.dirName, inlined.assets);
  }

  const styles = path.join(srcDir, 'shared/styles');
  const base = await bundle(path.join(styles, 'base.css'), 'css');
  const hubCss = await bundle(path.join(styles, 'hub.css'), 'css');
  const css = base.text + hubCss.text;
  const hub = renderHub({ games, hrefFor: (g) => `${g.meta.id}.html`, styles: { inline: css.trim() } });
  await emit('index.html', hub, '게임 모음', [...base.assets, ...hubCss.assets]);

  return { outDir, games: games.map((g) => g.meta.id), files };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().then(
    ({ games }) => console.log(`\n게임 ${games.length}개를 dist/에 만들었어요.`),
    (error) => {
      console.error(`\n빌드 실패: ${error.message}`);
      process.exit(1);
    },
  );
}
