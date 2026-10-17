import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BUILT = path.resolve('dist');

/**
 * 테스트 서버 (B0b): 빌드 결과를 사이트와 같은 하위 경로 /game2/ 아래로 주는 scripts/serve.mjs(gzip)를 playwright.config.js의 webServer가 띄운다.
 * 포트는 환경 변수 E2E_PORT(기본 4173) — 여러 작업 폴더가 동시에 e2e를 돌릴 때 서로 다른 포트를 준다. 그 포트를 이미 다른 서버가 쓰고 있으면
 * 그 서버를 쓰지 않고 실패한다(reuseExistingServer: false — 남의 dist/를 검사하지 않게).
 */
export const E2E_PORT = (() => {
  const raw = (process.env.E2E_PORT ?? '').trim();
  if (!raw) return 4173;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`E2E_PORT는 1~65535의 정수여야 해요: "${raw}"`);
  return port;
})();
/** 사이트의 하위 경로(GitHub Pages: https://eversunk2-tech.github.io/game2/) */
export const SITE_BASE = '/game2/';
export const SERVER_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
/** 테스트가 여는 사이트 주소(끝에 /) */
export const SITE_URL = `${SERVER_ORIGIN}${SITE_BASE}`;

/**
 * 글자 폭 넓힘 모드 (환경 변수 E2E_WIDE_TEXT).
 *
 * 리눅스(GitHub 자동 테스트)와 크롬북·안드로이드의 본문 글꼴은 macOS보다 넓다(한글 한 글자: macOS 0.865em, Noto Sans CJK KR 0.92em,
 * CI의 글꼴은 1em쯤으로 본다). 그래서 로컬에서 통과한 배치 검사가 CI에서 1px·한 줄 차이로 깨지곤 했다.
 * 이 모드는 모든 테스트 페이지의 본문 글자 폭을 넓혀, 같은 일을 로컬에서 미리 보게 한다.
 *
 *   E2E_WIDE_TEXT=font npm run test:e2e   글꼴 흉내 — 본문 글꼴을 한글 1em 폭 글꼴(macOS의 AppleGothic)로 바꾸고 글자 사이 0.25px.
 *                                          지금까지 실제 CI의 실패 목록과 똑같이 맞은 것은 이 방법뿐이다(a137a40의 3건, 673f871의 배치 1건.
 *                                          헛경보 0). **배치를 바꿨으면 보통 실행과 함께 이것을 통과해야 끝난 것이다.** macOS에서만 된다
 *   E2E_WIDE_TEXT=noto npm run test:e2e   크롬북·안드로이드 비슷한 폭 — 한글 0.92em(Noto Sans CJK KR), 라틴은 Arial 폭. macOS에서만 된다
 *   E2E_WIDE_TEXT=1 npm run test:e2e      글자 사이 0.25px(글자 폭 약 +2.3%). 어느 컴퓨터에서나 된다. 버튼 너비 1px 차이 같은 것은 잡지만
 *                                          글이 한 줄 넘어가는 종류는 못 잡는다(673f871에 넣으면 실패 0 — 실제 CI는 실패했다)
 *   E2E_WIDE_TEXT=0.5 npm run test:e2e    글자 사이를 그 px만큼(0.5px ≈ +4.6%). 한 줄 넘어가는 것은 잡지만, 제목 글꼴로 쓴 버튼 글자까지 넓혀
 *                                          실제 CI에서는 통과하는 검사("답하기 전 조작 띠…" 두 기기)가 실패한다(헛경보)
 *
 * 글꼴 흉내는 로컬 글꼴에 기대므로, 그 글꼴이 없는 컴퓨터(리눅스 CI 등)에서는 테스트를 시작하기 전에 까닭을 말하고 멈춘다.
 * 실제 CI의 글꼴 그 자체는 아니다 — 통과해도 "CI에서 확인 필요"는 남는다.
 *
 * 앱 코드에는 아무것도 넣지 않는다. 환경 변수가 없으면(보통 실행·CI) 테스트 서버가 dist/를 그대로 준다.
 * 환경 변수가 있으면 playwright.config.js가 이 파일의 기본 내보내기(prepareWideText)를 globalSetup으로 불러
 * dist/*.html의 복사본에 스타일을 넣어 test-results/wide-text-dist/에 두고(dist/assets/는 그대로 복사), 테스트 서버가 그 복사본 폴더를 주며
 * gameFiles()·DIST도 그 복사본을 가리킨다.
 * src/를 그대로 띄우는 시험 페이지(엔진 기능·차시 묶음)는 srcBody()가 base.css 끝에 같은 스타일을 붙인다.
 */
const HANGUL = 'U+1100-11FF, U+3130-318F, U+AC00-D7AF';
/** 한글 한 글자의 폭을 em으로 맞춘 본문 글꼴(macOS의 Apple SD Gothic Neo = 0.865em을 늘린다) + 라틴은 Arial 폭 */
const hangulWidthCss = (em) => [
  `@font-face { font-family: "E2EHangul"; src: local("AppleSDGothicNeo-Regular"), local("Apple SD Gothic Neo"); font-weight: 100 500; unicode-range: ${HANGUL}; size-adjust: ${((em / 0.865) * 100).toFixed(2)}%; }`,
  `@font-face { font-family: "E2EHangul"; src: local("AppleSDGothicNeo-Bold"), local("Apple SD Gothic Neo Bold"); font-weight: 600 900; unicode-range: ${HANGUL}; size-adjust: ${((em / 0.865) * 100).toFixed(2)}%; }`,
  '@font-face { font-family: "E2ELatin"; src: local("ArialMT"), local("Arial"); font-weight: 100 500; unicode-range: U+0020-007E; }',
  '@font-face { font-family: "E2ELatin"; src: local("Arial-BoldMT"), local("Arial Bold"); font-weight: 600 900; unicode-range: U+0020-007E; }',
  ':root { --font: "E2ELatin", "E2EHangul", system-ui, sans-serif; }',
].join('\n');

/**
 * 지금 모드: { mode: 'off' | 'font' | 'noto' | 'spacing', label(알림 글), css(페이지에 넣는 스타일), probe(이 글꼴이 실제로 있어야 한다) }
 * 본문 글꼴은 base.css의 --font, 제목·버튼 글꼴(Do Hyeon)은 게임 파일에 들어 있어 어느 기기나 같다 — 글꼴 흉내는 본문만 바꾼다.
 */
export const WIDE_TEXT = (() => {
  const raw = (process.env.E2E_WIDE_TEXT ?? '').trim();
  const spacing = (px) => `body, button { letter-spacing: ${px}px; }`;
  if (!raw || raw === '0' || raw === 'false') return { mode: 'off', label: '', css: '', probe: null };
  if (raw === 'font') {
    return { mode: 'font', label: '글꼴 흉내(본문 한글 1em 폭 글꼴 AppleGothic + 글자 사이 0.25px)', css: `:root { --font: "AppleGothic", sans-serif; }\n${spacing(0.25)}`, probe: '"AppleGothic"' };
  }
  if (raw === 'noto') return { mode: 'noto', label: '크롬북·안드로이드 비슷한 폭(한글 0.92em, 라틴 Arial 폭)', css: hangulWidthCss(0.92), probe: '"E2EHangul"' };
  const px = raw === '1' || raw === 'true' ? 0.25 : Number(raw);
  if (!Number.isFinite(px) || px <= 0 || px > 2) throw new Error(`E2E_WIDE_TEXT는 font · noto · 1(= 0.25px) · 0~2 사이의 px 값 가운데 하나여야 해요: "${raw}"`);
  return { mode: 'spacing', label: `글자 사이 ${px}px`, css: spacing(px), probe: null };
})();

/** 넓힘 모드에서 페이지에 넣는 스타일 (보통 실행에서는 빈 문자열) */
export const wideTextCss = () => WIDE_TEXT.css;

const WIDE_DIST = path.resolve('test-results', 'wide-text-dist');

export const DIST = WIDE_TEXT.mode === 'off' ? BUILT : WIDE_DIST;

/**
 * 글꼴 흉내에 쓰는 글꼴이 이 컴퓨터에 실제로 있는가: 브라우저에서 한글 글자 폭이 기본 글꼴과 달라지는지로 본다.
 * (없는 글꼴 이름을 주면 브라우저는 조용히 기본 글꼴로 그린다 — 그러면 "넓힌 줄 알았는데 안 넓혀진" 실행이 된다)
 */
async function fontWorks(css, family) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${css}</style><span id="a">가나다라마</span><br><span id="b">가나다라마</span>`);
    const widths = async () => {
      await page.evaluate((name) => {
        document.getElementById('a').style.font = `100px ${name}, monospace`;
        document.getElementById('b').style.font = '100px monospace';
      }, family);
      await page.evaluate(() => document.fonts.load('100px "E2EHangul"', '가').catch(() => []));
      await page.evaluate(() => document.fonts.ready);
      return page.evaluate(() => ['a', 'b'].map((id) => document.getElementById(id).getBoundingClientRect().width));
    };
    const [a, b] = await widths();
    return Math.abs(a - b) > 1;
  } finally {
    await browser.close();
  }
}

/** globalSetup(넓힘 모드에서만 불린다): dist/*.html → 스타일을 넣은 복사본. 넣지 못하거나 글꼴이 없으면 테스트를 시작하지 않는다 */
export default async function prepareWideText() {
  if (WIDE_TEXT.mode === 'off') return;
  if (WIDE_TEXT.probe && !(await fontWorks(WIDE_TEXT.css, WIDE_TEXT.probe))) {
    throw new Error(`E2E_WIDE_TEXT=${WIDE_TEXT.mode}: 이 컴퓨터에는 흉내에 쓰는 글꼴이 없어요(macOS의 AppleGothic·Apple SD Gothic Neo·Arial이 필요해요). `
      + '이 모드는 macOS에서만 돌려요. 다른 컴퓨터에서는 E2E_WIDE_TEXT=1(글자 사이 0.25px)이나 0.5를 쓰거나, 환경 변수 없이 돌려요.');
  }
  rmSync(WIDE_DIST, { recursive: true, force: true });
  mkdirSync(WIDE_DIST, { recursive: true });
  const files = readdirSync(BUILT).filter((f) => f.endsWith('.html'));
  if (files.length === 0) throw new Error('dist/에 .html이 없어요. 먼저 npm run build를 해요.');
  for (const file of files) {
    const html = readFileSync(path.join(BUILT, file), 'utf8');
    const at = html.indexOf('</head>');
    if (at < 0) throw new Error(`${file}: </head>를 찾지 못해 글자 폭 넓힘 스타일을 넣을 수 없어요.`);
    writeFileSync(path.join(WIDE_DIST, file), `${html.slice(0, at)}<style data-e2e-wide-text>${wideTextCss()}</style>\n${html.slice(at)}`);
  }
  // 빌드가 따로 내보낸 파일(dist/assets/ — JS·CSS·글꼴·큰 그림, HTML이 ./assets/…로 가리킨다)도 복사본 옆에 그대로 (B0c2 · B0b)
  if (!existsSync(path.join(BUILT, 'assets'))) throw new Error('dist/assets/가 없어요. 먼저 npm run build를 해요.');
  cpSync(path.join(BUILT, 'assets'), path.join(WIDE_DIST, 'assets'), { recursive: true });
  console.log(`글자 폭 넓힘 모드: ${WIDE_TEXT.label} (${files.length}개 파일 → ${path.relative(process.cwd(), WIDE_DIST)}/)`);
}

/** src/의 파일을 그대로 띄우는 시험 페이지용: 파일 내용(넓힘 모드에서는 base.css 끝에 넓힘 스타일을 붙인다) */
export function srcBody(file, text) {
  return WIDE_TEXT.mode !== 'off' && file.endsWith(`${path.sep}base.css`) ? `${text}\n/* E2E_WIDE_TEXT */\n${wideTextCss()}\n` : text;
}

export const gameFiles = () => readdirSync(DIST).filter((f) => f.endsWith('.html') && f !== 'index.html');

/** 빌드한 페이지의 주소: 테스트 서버의 하위 경로 아래(…/game2/<name>) — 서버는 보통 실행이면 dist/, 글꼴 흉내면 그 복사본을 준다 (B0b: 전에는 file://) */
export const fileUrl = (name, query = '') => `${SITE_URL}${name}${query}`;

/** 페이지의 오류(예외·console.error)를 모은다. 테스트 끝에 빈 배열인지 확인한다. */
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** 가로 스크롤이 생기지 않았는지 */
export async function hasHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

/**
 * 손가락으로 휙 끌기 (CDP 터치, 손가락 하나): from [x, y] → to [x, y]로 steps걸음.
 * 걸음마다의 시각(timestamp)을 stepMs 간격으로 직접 준다 — 주지 않으면 끄는 빠르기가 기기 속도에 달린다:
 * 느린 기기(CI)에서는 걸음 사이가 벌어져 브라우저가 "멈췄다가 뗀 것"으로 보고, 빠른 기기에서는 "휙 던진 것"으로 본다.
 * release: false면 떼지 않고 끝낸다 — 돌려주는 end()로 뗀다(떼는 것과 다음 탭을 틈 없이 이어 보낼 때)
 */
export async function touchFlick(cdp, from, to, { steps = 12, stepMs = 8, release = true } = {}) {
  let at = Date.now() / 1000;
  const send = (type, x, y) => {
    at += stepMs / 1000;
    return cdp.send('Input.dispatchTouchEvent', { type, timestamp: at, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  };
  await send('touchStart', from[0], from[1]);
  for (let i = 1; i <= steps; i += 1) await send('touchMove', from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
  const end = () => send('touchEnd');
  if (release) await end();
  return end;
}

/**
 * run() 동안 브라우저(Chromium)가 보이지 않는 관성 스크롤(fling)을 시작했는지 본다 — 입력 추적(input)에서 읽는다.
 * 돌려주는 값: { traced, flingStarts, flings }
 *   traced       추적에서 터치 제스처(누르기)가 읽혔는가. false면 이 환경에서는 추적을 쓸 수 없는 것이다 — 아래 두 수는 뜻이 없다
 *   flingStarts  관성 시작 제스처(GestureFlingStart)가 보인 횟수 (0인지 아닌지만 본다 — 한 번의 관성이 추적의 여러 곳에 적힌다)
 *   flings       브라우저의 관성 처리기가 실제로 돌린 관성의 수
 *
 * 쓰는 까닭: 터치로 끈 뒤 손을 떼면 브라우저는 관성 스크롤을 시작할 수 있고, 크롬북·안드로이드·리눅스의 크롬은 그 관성이 도는 동안의
 * 첫 탭을 "관성 멈추기"로 여겨 click을 만들지 않는다. macOS의 Chromium은 그 탭을 삼키지 않아 "탭이 먹히는가"만 봐서는 로컬에서 드러나지 않는다.
 * 누르기·탭 제스처의 **개수**는 기대하지 않는다 — 제스처를 만드는 길이 플랫폼마다 달라 수가 다를 수 있다. 관성이 0인지만 본다.
 * 추적의 이름은 Chromium 안쪽 이름이라 판이 바뀌면 달라질 수 있다. 그때는 traced가 false가 된다(부르는 쪽은 그 부분만 건너뛰고 알린다).
 */
export async function touchGestures(browser, page, run) {
  let tracing = true;
  try {
    await browser.startTracing(page, { categories: ['input'] });
  } catch {
    tracing = false;
  }
  let buffer = null;
  try {
    await run();
  } finally {
    if (tracing) buffer = await browser.stopTracing().catch(() => null);
  }
  const seen = { traced: false, flingStarts: 0, flings: 0 };
  let events = [];
  try {
    events = JSON.parse(buffer.toString()).traceEvents ?? [];
  } catch {
    return seen;
  }
  for (const event of events) {
    if (event.name === 'FlingController::HandlingGestureFling' && event.ph === 'b') seen.flings += 1;
    const type = event.args?.type;
    if (type === 'GestureTapDown') seen.traced = true;
    if (type === 'GestureFlingStart') seen.flingStarts += 1;
  }
  return seen;
}

/** 추적으로 본 관성 스크롤이 0인지 확인한다. 추적을 읽지 못한 환경이면 그 사실을 테스트 기록에 남기고 넘어간다(탭이 먹히는지는 부르는 쪽이 늘 본다) */
export function expectNoFling(expect, testInfo, seen) {
  if (!seen.traced) {
    testInfo.annotations.push({ type: '확인 못 함', description: '이 환경에서는 Chromium 입력 추적에서 터치 제스처를 읽지 못해 "관성 스크롤 0"은 보지 못했어요. 끈 직후의 탭이 먹히는지는 확인했어요.' });
    return;
  }
  expect({ flingStarts: seen.flingStarts, flings: seen.flings }, '터치로 끈 뒤 브라우저가 관성 스크롤을 시작하면 안 된다(끄는 동안의 touchmove를 쓴 것으로 알려야 한다)').toEqual({ flingStarts: 0, flings: 0 });
}
