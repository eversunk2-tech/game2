/**
 * 게임마다 외부 파일 없이 열리는 HTML 한 파일을 만든다.
 *
 *   src/games/<id>/index.html  →  dist/<id>.html
 *   게임 모음                    →  dist/index.html
 *
 * index.html의 <link rel="stylesheet" href="…">와 <script type="module" src="…">를
 * esbuild로 묶어 그 자리에 <style>, <script>로 넣는다. 그림 파일은 CSS url()로 쓰면
 * data: 주소로 들어간다(docs/engine.md 7절).
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { loadGames } from './lib/games.mjs';
import { renderHub } from './lib/hub.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

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
    throw new Error(`game.json을 고쳐 주세요.\n${detail}`);
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const game of games) {
    const html = await readFile(path.join(game.dir, 'index.html'), 'utf8');
    const out = await inlineHtml(html, game.dir);
    const problems = findExternalRefs(out);
    if (problems.length > 0) {
      throw new Error(`${game.dirName}: 파일 하나로 열리지 않아요. 바깥 파일 참조:\n  ${problems.join('\n  ')}`);
    }
    const file = path.join(outDir, `${game.meta.id}.html`);
    await writeFile(file, out);
    log(`  ✓ ${path.relative(rootDir, file)}  (${(Buffer.byteLength(out) / 1024).toFixed(1)} KB)`);
  }

  const styles = path.join(srcDir, 'shared/styles');
  const css = (await bundle(path.join(styles, 'base.css'), 'css')) + (await bundle(path.join(styles, 'hub.css'), 'css'));
  const hub = renderHub({ games, hrefFor: (g) => `${g.meta.id}.html`, styles: { inline: css.trim() } });
  await writeFile(path.join(outDir, 'index.html'), hub);
  log(`  ✓ ${path.relative(rootDir, path.join(outDir, 'index.html'))}  (게임 모음)`);

  return { outDir, games: games.map((g) => g.meta.id) };
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
