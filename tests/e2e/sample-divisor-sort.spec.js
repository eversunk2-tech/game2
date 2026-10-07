import { expect, test } from '@playwright/test';
import { collectErrors, fileUrl } from './helpers.js';

const FILE = 'sample-divisor-sort.html';

// 1단계 "12의 약수": 카드 숫자를 보고 정답 상자를 고른다.
const answerFor = (value) => (12 % value === 0 ? 'yes' : 'no');

async function cardValues(page) {
  return (await page.locator('.num-card').allTextContents()).map(Number);
}

test('눌러서 고르고 넣기로 1단계를 모두 맞히면 별 3개, 다음 단계가 열린다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1'));
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.locator('.stage-card').first().click();

  const values = await cardValues(page);
  expect(values.length).toBe(9);
  for (const value of values) {
    await page.locator('.num-card', { hasText: new RegExp(`^${value}$`) }).click();
    await page.locator(`.bin[data-bin="${answerFor(value)}"]`).click();
  }

  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.getByRole('img', { name: '별 3개 중 3개' })).toBeVisible();
  await expect(page.getByText('9번 중 9번 맞힘')).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 단계' })).toBeVisible();

  await page.getByRole('button', { name: '단계 선택' }).click();
  await expect(page.locator('.stage-card').nth(1)).toBeEnabled();
  expect(errors).toEqual([]);
});

test('틀리면 이유를 보여 주고, 학습 기록에 오개념이 남는다', async ({ page }) => {
  await page.goto(fileUrl(FILE, '?seed=1&stage=divisors-of-12'));

  // 1은 늘 나온다(must). "약수가 아닌 수"에 넣어 일부러 틀린다.
  await page.locator('.num-card', { hasText: /^1$/ }).click();
  await page.locator('.bin[data-bin="no"]').click();
  await expect(page.locator('.toast-wrong')).toContainText('1은 모든 수의 약수예요');
  await expect(page.locator('.num-card', { hasText: /^1$/ })).toBeVisible(); // 카드는 제자리

  for (const value of await cardValues(page)) {
    await page.locator('.num-card', { hasText: new RegExp(`^${value}$`) }).click();
    await page.locator(`.bin[data-bin="${answerFor(value)}"]`).click();
  }
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.getByText('1과 자기 자신도 약수 (1번)')).toBeVisible();

  await page.getByRole('button', { name: '단계 선택' }).click();
  await page.getByRole('button', { name: '처음 화면' }).click();
  await page.getByRole('button', { name: '학습 기록' }).click();
  await expect(page.getByRole('heading', { name: '자주 틀린 개념' })).toBeVisible();
  await expect(page.locator('.report-table tbody tr')).toHaveCount(1);
});

test('마우스로 끌어다 놓아도 된다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '마우스 끌기는 크롬북 화면에서 확인');
  await page.goto(fileUrl(FILE, '?seed=1&stage=divisors-of-12&sound=off'));

  const card = page.locator('.num-card').first();
  const value = Number(await card.textContent());
  const from = await card.boundingBox();
  const to = await page.locator(`.bin[data-bin="${answerFor(value)}"]`).boundingBox();

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(page.locator(`.bin[data-bin="${answerFor(value)}"] .placed`, { hasText: new RegExp(`^${value}$`) })).toBeVisible();
  await expect(page.locator('.num-card')).toHaveCount(8);
});

test('키보드(Tab + Enter)로도 넣을 수 있다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  await page.goto(fileUrl(FILE, '?seed=1&stage=divisors-of-12&sound=off'));

  const card = page.locator('.num-card').first();
  const value = Number(await card.textContent());
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.locator(`.bin[data-bin="${answerFor(value)}"]`).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.num-card')).toHaveCount(8);
});
