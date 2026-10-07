import { expect, test } from '@playwright/test';
import { collectErrors, fileUrl, gameFiles, hasHorizontalScroll } from './helpers.js';

// 모든 게임에 공통으로 적용되는 기본 검사. 새 게임을 만들면 자동으로 포함된다.

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

    await page.getByRole('button', { name: '시작하기' }).click();
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
    await page.getByRole('button', { name: '시작하기' }).click();
    const cards = page.locator('.stage-card');
    const count = await cards.count();
    for (let i = 0; i < count; i += 1) await expect(cards.nth(i)).toBeEnabled();
  });
}
