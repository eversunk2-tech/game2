import { defineConfig } from '@playwright/test';

/**
 * 빌드된 dist/*.html을 file://로 직접 연다(학생이 파일을 받아 여는 것과 같은 조건).
 * 교실 기기 두 가지: 크롬북(1366×768, 마우스)과 태블릿(세로, 터치).
 *
 * 글자 폭 넓힘 모드: E2E_WIDE_TEXT=font npm run test:e2e (글꼴 흉내 — 실제 CI의 실패와 맞았던 방법, macOS에서만)
 * 그 밖에 E2E_WIDE_TEXT=noto(크롬북 비슷한 폭) · 1(글자 사이 0.25px) · 0.5(그 px). 리눅스 CI·크롬북처럼 글자가 넓은 기기에서
 * 깨질 배치 검사를 로컬에서 미리 본다. 방법과 값마다의 한계는 tests/e2e/helpers.js 머리말.
 * 환경 변수가 없으면 아래 globalSetup 줄이 없는, 지금까지와 똑같은 설정이다.
 */
const wideText = Boolean((process.env.E2E_WIDE_TEXT ?? '').trim()) && !['0', 'false'].includes(process.env.E2E_WIDE_TEXT.trim());

export default defineConfig({
  ...(wideText ? { globalSetup: './tests/e2e/helpers.js' } : {}),
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    browserName: 'chromium',
    locale: 'ko-KR',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromebook', use: { viewport: { width: 1366, height: 768 } } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true } },
  ],
});
