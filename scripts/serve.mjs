/**
 * 빌드 결과(dist/)를 사이트와 같은 조건으로 보여 주는 작은 서버 (B0b — spec-grade6.md 7-4절). Node 내장 모듈만 쓴다.
 *
 *   npm run preview                          →  http://127.0.0.1:4173/game2/   (먼저 npm run build)
 *   node scripts/serve.mjs --dir <폴더> --port <번호> [--host 127.0.0.1] [--base /game2/]
 *   PORT·HOST 환경 변수로도 바꿀 수 있다(--port·--host가 먼저)
 *
 * GitHub Pages와 같게: 하위 경로 /game2/ 아래에서만 준다(그 밖은 404, /game2 는 /game2/ 로 옮김), 글 파일(html·js·css·svg·json)은 gzip,
 * 모든 파일에 Cache-Control: max-age=600(Pages가 10분 캐시한다고 알려진 것과 같게 — 실제 Pages 머리글은 이 환경에서 확인 못 함).
 * 주소 실수(‘/’로 시작하는 주소, 하위 경로 밖을 가리킴)가 여기서 404로 드러난다. e2e(playwright.config.js의 webServer)도 이 서버를 쓴다.
 * 포트를 이미 다른 서버가 쓰고 있으면 기다리지 않고 바로 실패한다(남의 dist/를 검사하는 일을 막는다).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** 사이트의 하위 경로(저장소 이름 — https://eversunk2-tech.github.io/game2/) */
export const SITE_BASE = '/game2/';
export const DEFAULT_PORT = 4173;

export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
};
const GZIP = /\.(html|m?js|css|svg|json|txt)$/i;

/**
 * 요청 처리기: dir(결과 폴더)를 base(하위 경로) 아래로 준다. 파일은 요청마다 디스크에서 읽는다(빌드·글꼴 흉내 복사본을 다시 만들어도 그대로).
 * → (req, res) => Promise
 */
export function createHandler({ dir, base = SITE_BASE, maxAge = 600 } = {}) {
  const root = path.resolve(dir);
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(body);
  };
  return async function handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '405');
    const url = new URL(req.url, 'http://local');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return send(res, 400, '400');
    }
    if (pathname === prefix.slice(0, -1)) return send(res, 301, '', { Location: `${prefix}${url.search}` });
    if (!pathname.startsWith(prefix)) return send(res, 404, `404: ${pathname} (사이트는 ${prefix} 아래에 있어요)`);
    let file = path.resolve(root, `.${pathname.slice(prefix.length - 1)}`);
    if (file !== root && !file.startsWith(root + path.sep)) return send(res, 403, '403');
    try {
      let info = await stat(file);
      if (info.isDirectory()) {
        if (!pathname.endsWith('/')) return send(res, 301, '', { Location: `${pathname}/${url.search}` });
        file = path.join(file, 'index.html');
        info = await stat(file);
      }
      if (!info.isFile()) return send(res, 404, `404: ${pathname}`);
      const ext = path.extname(file).toLowerCase();
      let body = await readFile(file);
      const headers = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': `max-age=${maxAge}`, Vary: 'Accept-Encoding' };
      if (GZIP.test(file) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
        body = gzipSync(body);
        headers['Content-Encoding'] = 'gzip';
      }
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
      return undefined;
    } catch {
      return send(res, 404, `404: ${pathname}`);
    }
  };
}

/** 명령줄: --dir · --port · --host · --base */
export function readArgs(argv, env = process.env) {
  const get = (name) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  return {
    dir: path.resolve(ROOT, get('dir') ?? 'dist'),
    port: Number(get('port') ?? env.PORT) || DEFAULT_PORT,
    host: get('host') ?? env.HOST ?? '127.0.0.1',
    base: get('base') ?? SITE_BASE,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { dir, port, host, base } = readArgs(process.argv.slice(2));
  if (!existsSync(dir)) console.log(`알림: ${path.relative(ROOT, dir) || dir} 폴더가 아직 없어요(npm run build 먼저). 생기면 그대로 보여 줘요.`);
  const handle = createHandler({ dir, base });
  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') console.error(`서버를 띄우지 못했어요: ${host}:${port}을(를) 이미 다른 서버가 쓰고 있어요. 다른 포트(--port, e2e는 E2E_PORT)를 써요.`);
    else console.error(`서버를 띄우지 못했어요: ${error.message}`);
    process.exit(1);
  });
  server.listen(port, host, () => {
    console.log(`빌드 결과 보기: http://${host}:${port}${base}  (${path.relative(ROOT, dir) || dir}, 끄려면 Ctrl+C)`);
  });
}
