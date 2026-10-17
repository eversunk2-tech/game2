import { defineConfig } from '@playwright/test';
import { DIST, E2E_PORT, SITE_URL } from './tests/e2e/helpers.js';

/**
 * 빌드된 dist/를 사이트와 같은 조건으로 연다(B0b): scripts/serve.mjs가 하위 경로 /game2/ 아래로 gzip으로 주고(GitHub Pages와 같게 —
 * 학생은 사이트 주소로만 연다, 사용자 결정 10-09), 테스트는 http://127.0.0.1:<E2E_PORT>/game2/<게임>.html 을 연다(tests/e2e/helpers.js의 fileUrl).
 * 포트: 환경 변수 E2E_PORT(기본 4173). 그 포트를 이미 다른 서버가 쓰고 있으면 그 서버를 쓰지 않고 실패한다(reuseExistingServer: false —
 * 여러 작업 폴더가 동시에 e2e를 돌릴 때 남의 dist/를 검사하지 않게). 서버는 테스트가 끝나면 Playwright가 내린다.
 * 교실 기기 두 가지: 크롬북(1366×768, 마우스)과 태블릿(세로, 터치).
 *
 * 글자 폭 넓힘 모드: E2E_WIDE_TEXT=font npm run test:e2e (글꼴 흉내 — 실제 CI의 실패와 맞았던 방법, macOS에서만)
 * 그 밖에 E2E_WIDE_TEXT=noto(크롬북 비슷한 폭) · 1(글자 사이 0.25px) · 0.5(그 px). 리눅스 CI·크롬북처럼 글자가 넓은 기기에서
 * 깨질 배치 검사를 로컬에서 미리 본다. 방법과 값마다의 한계는 tests/e2e/helpers.js 머리말.
 * 넓힘 모드에서는 globalSetup이 dist/의 복사본(test-results/wide-text-dist/)에 스타일을 넣고 테스트 서버가 그 복사본 폴더를 준다.
 * 환경 변수가 없으면 globalSetup 줄이 없고 서버는 dist/를 준다.
 */
const wideText = Boolean((process.env.E2E_WIDE_TEXT ?? '').trim()) && !['0', 'false'].includes(process.env.E2E_WIDE_TEXT.trim());

export default defineConfig({
  ...(wideText ? { globalSetup: './tests/e2e/helpers.js' } : {}),
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  webServer: {
    command: `node scripts/serve.mjs --dir "${DIST}" --port ${E2E_PORT} --host 127.0.0.1`,
    // 포트로 기다린다(127.0.0.1·::1 어느 쪽이든 이미 쓰이고 있으면 바로 실패). 주소(url)로 기다리면 글꼴 흉내에서 복사본이 서버보다 늦게 생겨
    // (Playwright는 webServer를 globalSetup보다 먼저 띄운다) 첫 페이지가 404인 동안 기다리기만 한다
    port: E2E_PORT,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    browserName: 'chromium',
    locale: 'ko-KR',
    baseURL: SITE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromebook', use: { viewport: { width: 1366, height: 768 } } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true } },
  ],
});
