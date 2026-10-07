import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { DISPLAY_FONT, readCmap } from '../../scripts/lib/font.mjs';
import { createRng } from '../../src/shared/core/random.js';
import { STAGES, makeQuestions } from '../../src/games/net-workshop/logic.js';
import { collectErrors, fileUrl } from './helpers.js';

// D1 Review 1·2번 고침 확인과 결과 화면 크기 (빌드 파일로 확인)

test('D1 Review 1: 전개도 면의 키보드 초점은 잉크 테두리라 어떤 면 색과도 3:1 이상', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  await page.goto(fileUrl('net-workshop.html', '?unlock=all&seed=1&sound=off&stage=cube-opposite'));
  await page.keyboard.press('Tab'); // 키보드로 다루는 중(:focus-visible)
  const results = await page.evaluate(() => {
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = (c) => {
      const [r, g, b] = rgb(c).map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    return [...document.querySelectorAll('.net-face:not([tabindex="-1"])')].map((el) => {
      el.focus();
      const s = getComputedStyle(el);
      return {
        face: el.dataset.label,
        visible: el.matches(':focus-visible'),
        style: s.outlineStyle,
        width: parseFloat(s.outlineWidth),
        contrast: ratio(s.outlineColor, s.backgroundColor),
      };
    });
  });
  expect(results.length).toBeGreaterThanOrEqual(5);
  for (const r of results) {
    expect(r.visible, r.face).toBe(true);
    expect(r.style, r.face).toBe('solid');
    expect(r.width, r.face).toBeGreaterThanOrEqual(3);
    expect(r.contrast, `${r.face}: ${r.contrast.toFixed(2)}`).toBeGreaterThanOrEqual(3);
  }
});

test('D1 Review 2: 엔진이 제목 글꼴(Do Hyeon)로 그리는 글자는 모두 그 글꼴에 있다 (게임 이름 제외)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '글자 확인은 한 번만');
  const cmap = readCmap(readFileSync(DISPLAY_FONT.file));
  const errors = collectErrors(page);
  const FILE = 'sample-divisor-sort.html';
  /** 지금 화면에서 제목 글꼴로 그려지는 글자(게임 이름 제외) */
  const displayText = () => page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!getComputedStyle(el).fontFamily.startsWith('"Do Hyeon"')) continue;
      if (el.closest('[hidden]') || el.getClientRects().length === 0) continue;
      // 게임 이름 자리(머리 제목, 처음 화면 h1)는 게임이 정한 글자라 뺀다 (Review 2번: 게임 제목은 그대로 둬도 됨)
      if (el.closest('.topbar-title, .title-main')) continue;
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) out.push(node.textContent);
      }
    }
    return out.join('');
  });
  const seen = new Set();
  const check = async () => {
    for (const ch of await displayText()) if (ch.trim()) seen.add(ch);
  };

  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await check();
  await page.getByRole('button', { name: '시작하기' }).click();
  await check();
  await page.locator('.stage-card').first().click();
  const values = (await page.locator('.num-card').allTextContents()).map(Number);
  // 하나 틀리고 나머지 맞히기 (연속·다시 일어서기·다시 살펴볼 점이 모두 보이게)
  await page.locator('.num-card', { hasText: new RegExp(`^${values[0]}$`) }).click();
  await page.locator(`.bin[data-bin="${12 % values[0] === 0 ? 'no' : 'yes'}"]`).click();
  for (const v of values) {
    await page.locator('.num-card', { hasText: new RegExp(`^${v}$`) }).click();
    await page.locator(`.bin[data-bin="${12 % v === 0 ? 'yes' : 'no'}"]`).click();
    if (v === values[5]) await check();
  }
  await expect(page.locator('.screen-result')).toBeVisible();
  await page.keyboard.press('Escape');
  await check();
  await page.getByRole('button', { name: '단계 선택' }).click();
  await page.getByRole('button', { name: '처음 화면' }).click();
  await check();
  await page.getByRole('button', { name: '학습 기록' }).click();
  await check();
  await page.getByRole('button', { name: '기록 모두 지우기' }).click();
  await check();

  const missing = [...seen].filter((ch) => !cmap.has(ch.codePointAt(0)));
  expect(missing, missing.map((ch) => `${ch} U+${ch.codePointAt(0).toString(16)}`).join(' ')).toEqual([]);
  expect(seen.size).toBeGreaterThan(60);
  expect(errors).toEqual([]);
});

test('1366×680: 예시 게임과 전개도 게임의 결과 화면(칭호·새 도장 카드 포함)에 세로 스크롤이 없다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '크롬북 화면 크기에서 확인');
  await page.setViewportSize({ width: 1366, height: 680 });
  const noScroll = async () => {
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({ scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight }));
    expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
  };
  // 예시 게임: 하나 틀리고 마침 → 칭호 카드 + 새 도장 + 다시 살펴볼 점
  await page.goto(fileUrl('sample-divisor-sort.html', '?seed=1&sound=off&stage=divisors-of-12'));
  const values = (await page.locator('.num-card').allTextContents()).map(Number);
  await page.locator('.num-card', { hasText: new RegExp(`^${values[0]}$`) }).click();
  await page.locator(`.bin[data-bin="${12 % values[0] === 0 ? 'no' : 'yes'}"]`).click();
  for (const v of values) {
    await page.locator('.num-card', { hasText: new RegExp(`^${v}$`) }).click();
    await page.locator(`.bin[data-bin="${12 % v === 0 ? 'yes' : 'no'}"]`).click();
  }
  await expect(page.locator('.new-badge')).toBeVisible();
  await expect(page.locator('.review-note')).toBeVisible();
  await noScroll();
  await page.waitForTimeout(2100); // 연출이 끝난 뒤에도
  await noScroll();

  // 전개도 게임: 차시 끝 단계(면 붙이기)를 마침 → "이 차시를 마쳤어요!" + 새 도장
  const questions = makeQuestions(STAGES.find((s) => s.id === 'cube-complete'), createRng('1:cube-complete'));
  await page.goto(fileUrl('net-workshop.html', '?lesson=cube&unlock=all&seed=1&sound=off&stage=cube-complete'));
  for (const q of questions) {
    await page.locator('.face-card').click();
    await page.locator(`.net-slot[data-cell="${q.slots.find((x) => x.ok).key}"]`).click();
    await page.locator('.next-btn').click();
  }
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  await expect(page.locator('.new-badge')).toContainText('꼼꼼한 눈');
  await noScroll();
  await page.waitForTimeout(2100);
  await noScroll();
});
