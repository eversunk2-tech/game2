/**
 * 게임마다 외부 파일 없이 열리는 HTML 한 파일을 만든다.
 *
 *   src/games/<id>/index.html  →  dist/<id>.html
 *   게임 모음                    →  dist/index.html
 *
 * index.html의 <link rel="stylesheet" href="…">와 <script type="module" src="…">를
 * esbuild로 묶어 그 자리에 <style>, <script>로 넣는다. 그림 파일은 CSS url()로 쓰면
 * data: 주소로 들어간다(docs/engine.md 7절).
 * 제목 글꼴(Do Hyeon)은 파일마다 쓰인 글자만 잘라 data: 주소 @font-face로 넣는다(scripts/lib/font.mjs).
 * 게임 파일 하나는 MAX_FILE_BYTES(400 KB)를 넘지 않아야 한다.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { displayFontFace, injectStyle } from './lib/font.mjs';
import { loadGames } from './lib/games.mjs';
import { renderHub } from './lib/hub.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** 게임 파일 크기 상한: 학교망에서도 사진 한 장보다 작게 */
export const MAX_FILE_BYTES = 400 * 1024;
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

async function bundle(entry, kind) {
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
    ...(kind === 'js' ? { format: 'iife' } : {}),
  });
  if (result.outputFiles.length !== 1) {
    throw new Error(`${entry}: 결과 파일이 ${result.outputFiles.length}개예요. JS에서 CSS를 import하지 말고 index.html의 <link>로 넣어 주세요.`);
  }
  return result.outputFiles[0].text;
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

export async function inlineHtml(html, baseDir) {
  let out = await replaceTags(html, /<link\b[^>]*>/gi, async (tag) => {
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag)) return tag;
    const href = attr(tag, 'href');
    if (!href || !isLocal(href)) throw new Error(`외부 스타일시트는 쓸 수 없어요(오프라인·학교망): ${tag}`);
    const css = await bundle(path.resolve(baseDir, href), 'css');
    return `<style>${css.trim()}</style>`;
  });

  out = await replaceTags(out, /<script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script>/gi, async (tag) => {
    const src = attr(tag, 'src');
    if (!src || !isLocal(src)) throw new Error(`외부 스크립트는 쓸 수 없어요(오프라인·학교망): ${tag}`);
    const js = await bundle(path.resolve(baseDir, src), 'js');
    return `<script>${js.trim()}</script>`;
  });

  return out;
}

/** 빌드 결과가 정말 파일 하나로 열리는지 검사한다. */
export function findExternalRefs(html) {
  const problems = [];
  for (const m of html.matchAll(/<(script|img|audio|video|source|iframe)\b[^>]*\bsrc\s*=\s*["']([^"']*)["']/gi)) {
    if (!m[2].startsWith('data:')) problems.push(`<${m[1]} src="${m[2]}">`);
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const href = attr(m[0], 'href');
    if (href && !href.startsWith('data:')) problems.push(m[0]);
  }
  for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const m of style[1].matchAll(/url\(\s*["']?(?!data:|#)([^"')\s]+)/gi)) problems.push(`url(${m[1]})`);
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

  /** 글꼴을 넣고, 바깥 참조·크기를 검사한 뒤 쓴다. */
  const files = [];
  async function emit(name, html, label) {
    const font = await displayFontFace(html);
    const out = injectStyle(html, font.css);
    const problems = findExternalRefs(out);
    if (problems.length > 0) {
      throw new Error(`${label}: 파일 하나로 열리지 않아요. 바깥 파일 참조:\n  ${problems.join('\n  ')}`);
    }
    const bytes = Buffer.byteLength(out);
    if (bytes > MAX_FILE_BYTES) {
      throw new Error(`${label}: 파일이 ${kb(bytes)}로 상한 ${kb(MAX_FILE_BYTES)}를 넘어요. 그림·글자를 줄여 주세요.`);
    }
    const file = path.join(outDir, name);
    await writeFile(file, out);
    const missing = font.missing.length ? `, 제목 글꼴에 없는 글자 ${font.missing.join('')}` : '';
    log(`  ✓ ${path.relative(rootDir, file)}  (${kb(bytes)}, 제목 글꼴 ${font.chars}자 ${kb(font.bytes)}${missing})`);
    files.push({ name, bytes, fontChars: font.chars, fontBytes: font.bytes, missing: font.missing });
  }

  for (const game of games) {
    const html = await readFile(path.join(game.dir, 'index.html'), 'utf8');
    await emit(`${game.meta.id}.html`, await inlineHtml(html, game.dir), game.dirName);
  }

  const styles = path.join(srcDir, 'shared/styles');
  const css = (await bundle(path.join(styles, 'base.css'), 'css')) + (await bundle(path.join(styles, 'hub.css'), 'css'));
  const hub = renderHub({ games, hrefFor: (g) => `${g.meta.id}.html`, styles: { inline: css.trim() } });
  await emit('index.html', hub, '게임 모음');

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
