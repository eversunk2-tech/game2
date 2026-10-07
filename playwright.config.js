import { defineConfig } from '@playwright/test';

/**
 * 빌드된 dist/*.html을 file://로 직접 연다(학생이 파일을 받아 여는 것과 같은 조건).
 * 교실 기기 두 가지: 크롬북(1366×768, 마우스)과 태블릿(세로, 터치).
 */
export default defineConfig({
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
