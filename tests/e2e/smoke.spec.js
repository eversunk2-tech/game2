import { expect, test } from '@playwright/test';
import { collectErrors, fileUrl, gameFiles, hasHorizontalScroll } from './helpers.js';

// 모든 게임에 공통으로 적용되는 기본 검사. 새 게임을 만들면 자동으로 포함된다.

/**
 * 처음 화면 → 단계 지도: [시작하기]를 누른다. 영역이 있는 게임(엔진 areas)은 [시작하기] 자리에 영역 카드가 있어 첫 영역 카드를,
 * 학년이 있는 게임은 학년 카드 → 학년 화면의 첫 열린 영역 카드를 누른다
 * (B0a: 학년·영역 카드가 생기며 바꿈 — 뜻은 그대로 "처음 화면에서 단계 지도로")
 */
async function openStageMap(page) {
  const grade = page.locator('.grade-card:not([disabled])');
  const area = page.locator('.area-card:not([disabled])');
  await expect(area.or(page.getByRole('button', { name: '시작하기' })).first()).toBeVisible();
  if (await grade.count()) {
    await grade.first().click();
    await expect(page.locator('.screen-grade')).toBeVisible();
  }
  if (await area.count()) await area.first().click();
  else await page.getByRole('button', { name: '시작하기' }).click();
}

test('게임 모음 페이지가 모든 게임으로 연결된다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl('index.html'));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  for (const file of gameFiles()) {
    await expect(page.locator(`a[href="${file}"]`)).toHaveCount(1);
  }
  expect(await hasHorizontalScroll(page)).toBe(false);
  expect(errors).toEqual([]);
});

for (const file of gameFiles()) {
  test(`${file}: 오류 없이 열리고 첫 단계를 시작할 수 있다`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(fileUrl(file));

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);

    await openStageMap(page);
    await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
    await expect(page.locator('.stage-card').nth(1)).toBeDisabled();

    await page.locator('.stage-card').first().click();
    await expect(page.locator('.play-area')).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);

    await page.getByRole('button', { name: '← 단계 선택' }).click();
    await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`${file}: ?unlock=all 이면 모든 단계가 열린다`, async ({ page }) => {
    await page.goto(fileUrl(file, '?unlock=all&sound=off'));
    /** 지금 단계 지도의 모든 단계 카드가 열려 있다 */
    const allOpen = async () => {
      await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
      const cards = page.locator('.stage-card');
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) await expect(cards.nth(i)).toBeEnabled();
    };
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // 영역이 있는 게임은 학년마다(있으면) 영역 탭마다 그 영역의 단계 카드를 본다 (모든 단계)
    const grades = await page.locator('.grade-card:not([disabled])').count();
    await openStageMap(page);
    for (let g = 0; g < Math.max(1, grades); g += 1) {
      if (g > 0) {
        await page.getByRole('button', { name: '처음 화면' }).click();
        await page.locator('.grade-card:not([disabled])').nth(g).click();
        await page.locator('.area-card:not([disabled])').first().click();
      }
      const tabs = page.getByRole('tab');
      const areas = await tabs.count();
      for (let t = 0; t < Math.max(1, areas); t += 1) {
        if (areas) {
          await tabs.nth(t).click();
          await expect(tabs.nth(t)).toHaveAttribute('aria-selected', 'true');
        }
        await allOpen();
      }
    }
  });
}
