/**
 * 개발 서버: src/ 를 그대로 보여 준다(빌드 없이 새로고침만 하면 바뀜).
 *   npm run dev  →  http://localhost:5173
 * PORT, HOST 환경 변수로 바꿀 수 있다.
 * 제목 글꼴: 빌드는 쓰인 글자만 잘라 넣지만, 개발 서버는 전체 글꼴 파일을 /__fonts/ 에서 주고
 * HTML마다 그 스타일시트 링크를 끼워 넣는다(게임 index.html은 고치지 않는다).
 *
 * 주소는 사이트와 같은 뜻으로(사용자 결정 spec-grade6 15-13 끝 — scripts/lib/site.mjs):
 *   /                  → /games/<FRONT_GAME>/ 로 옮긴다(입체도형 공방의 인트로 — 빌드의 index.html. 쿼리 그대로: /?lesson=cube)
 *   …/teacher.html     → 선생님용 안내(빌드의 dist/teacher.html과 같은 내용 — 게임 링크만 개발 서버 주소). 게임의 [선생님용 안내](./teacher.html)가 여기로 온다
 *   /__games/          → 개발용 게임 모음(템플릿·예시 게임까지 모두 — 전에 / 에 있던 것)
 *   그 밖(/games/<id>/ 등)은 src/ 그대로
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DISPLAY_FONT, devFontCss } from './lib/font.mjs';
import { loadGames } from './lib/games.mjs';
import { renderHub } from './lib/hub.mjs';
import { FRONT_GAME, GUIDE_PAGE, teacherGuideHtml } from './lib/site.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = path.join(ROOT, 'src');
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || 'localhost';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const FONT_CSS = '/__fonts/display.css';
const FONT_FILE = '/__fonts/display.ttf';
/** 개발용 게임 모음(템플릿·예시 게임까지) */
export const DEV_HUB = '/__games/';
/** 개발 서버에서 게임을 여는 주소 */
const devGameHref = (id) => `/games/${id}/`;
const PAGE_STYLES = ['/shared/styles/base.css', '/shared/styles/hub.css', FONT_CSS];
const withFont = (html) => html.replace(/<\/head>/i, () => `  <link rel="stylesheet" href="${FONT_CSS}">\n</head>`);

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

export async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === FONT_CSS) return send(res, 200, devFontCss(FONT_FILE), TYPES['.css']);
  if (pathname === FONT_FILE) return send(res, 200, await readFile(DISPLAY_FONT.file), TYPES['.ttf']);

  // 맨 위 주소 = 입체도형 공방(사이트의 index.html과 같은 뜻 — 개발 서버는 게임 폴더의 주소로 옮겨야 ./main.js 같은 상대 주소가 맞다)
  if (pathname === '/') {
    res.writeHead(302, { Location: `${devGameHref(FRONT_GAME)}${url.search}`, 'Cache-Control': 'no-store' });
    return res.end();
  }
  // 선생님용 안내: 어느 폴더의 teacher.html이든(게임의 ./teacher.html은 /games/<id>/teacher.html) — 빌드와 같은 내용
  if (path.posix.basename(pathname) === GUIDE_PAGE) {
    const games = await loadGames(path.join(SRC, 'games'));
    return send(res, 200, teacherGuideHtml({ games, gameHref: devGameHref, styles: { links: PAGE_STYLES } }), TYPES['.html']);
  }
  if (pathname === DEV_HUB || pathname === DEV_HUB.slice(0, -1)) {
    const games = await loadGames(path.join(SRC, 'games'), { includeTemplates: true });
    const html = renderHub({
      games,
      hrefFor: (g) => devGameHref(g.dirName),
      styles: { links: PAGE_STYLES },
      title: '학습게임 모음 (개발 중)',
    });
    return send(res, 200, html, TYPES['.html']);
  }

  let file = path.resolve(SRC, `.${pathname}`);
  if (file !== SRC && !file.startsWith(SRC + path.sep)) return send(res, 403, '403');

  try {
    const info = await stat(file);
    if (info.isDirectory()) {
      // 상대 경로(./main.js)가 맞게 풀리도록 끝에 / 를 붙인다.
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${pathname}/${url.search}` });
        return res.end();
      }
      file = path.join(file, 'index.html');
    }
    const ext = path.extname(file).toLowerCase();
    const body = await readFile(file);
    if (ext === '.html') return send(res, 200, withFont(body.toString('utf8')), TYPES[ext]);
    return send(res, 200, body, TYPES[ext] ?? 'application/octet-stream');
  } catch {
    return send(res, 404, `404: ${pathname}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(error);
      send(res, 500, String(error));
    });
  }).listen(PORT, HOST, () => {
    console.log(`개발 서버: http://${HOST}:${PORT}  (끄려면 Ctrl+C) — 선생님용 안내 /${GUIDE_PAGE} · 개발용 게임 모음 ${DEV_HUB}`);
  });
}
