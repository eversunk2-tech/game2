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

/** 1단계 카드를 모두 처음에 맞혀 끝낸다 */
async function solveAll(page) {
  for (const value of await cardValues(page)) {
    await page.locator('.num-card', { hasText: new RegExp(`^${value}$`) }).click();
    await page.locator(`.bin[data-bin="${answerFor(value)}"]`).click();
  }
  await expect(page.locator('.screen-result')).toBeVisible();
}

test('예시 게임은 코드를 고치지 않아도 솜씨 점수·칭호·도장이 저절로 붙고, "기록 모두 지우기"로 모두 0이 된다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(page.locator('.rank-chip')).toContainText('새싹');
  await expect(page.locator('.rank-chip')).toContainText('0점');
  await expect(page.locator('.workshop-card')).toContainText('도장 0 / 6');
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.locator('.stage-card').first().click();
  await expect(page.locator('.meta-xp')).toContainText('+0');
  await solveAll(page);

  // 9문항 모두 처음에 맞힘: 2×9 + 연속 3번마다 1(3) + 단계 완료 5 + 별 3개 6 = 32
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.locator('.rank-card .xp-gain')).toHaveText('+32');
  await expect(page.locator('.behavior').first()).toContainText('9 / 9');
  await expect(page.locator('.xp-line')).toHaveText('단계 완료 +5 · 별 3개 +6 · 빨리 푼 시간에는 점수가 없어요');
  await expect(page.locator('.new-badge')).toContainText('첫 발걸음');
  await expect(page.locator('.new-badge')).toContainText('꼼꼼한 눈');
  await expect(page.locator('.rank-chip')).toContainText('32점');
  await expect(page.locator('[role="status"]')).toContainText('새 도장: 첫 발걸음, 꼼꼼한 눈');

  // 같은 단계를 다시 하면 답 점수만 받는다(단계 완료·별 점수 없음). 53점이 되어 칭호가 오른다
  await page.getByRole('button', { name: '다시 하기' }).click();
  await solveAll(page);
  await expect(page.locator('.rank-card .xp-gain')).toHaveText('+21');
  await expect(page.locator('.xp-line')).toContainText('별이 처음 늘 때만');
  await expect(page.locator('.new-badge')).toHaveCount(0);
  await expect(page.locator('.rank-card')).toContainText('칭호가 올랐어요');
  await expect(page.locator('.rank-chip')).toContainText('탐험가');

  // 학습 기록: 칭호·솜씨 점수 칸, 도장판(받은 도장 2개, 나머지는 받는 방법이 보임)
  await page.getByRole('button', { name: '단계 선택' }).click();
  await page.getByRole('button', { name: '처음 화면' }).click();
  await expect(page.locator('.workshop-card')).toContainText('도장 2 / 6');
  await page.getByRole('button', { name: '학습 기록' }).click();
  await expect(page.locator('.tile', { hasText: '칭호·솜씨 점수' })).toContainText('탐험가 53점');
  await expect(page.locator('.badge-item.is-earned')).toHaveCount(2);
  await expect(page.locator('.badge-item.is-locked')).toHaveCount(4);
  await expect(page.locator('.badge-item[data-badge="try-again"]')).toContainText('틀린 문제를 다시 도전해 3번 맞혀요');

  const clearButton = page.getByRole('button', { name: '기록 모두 지우기' });
  await clearButton.click();
  await page.getByRole('button', { name: '한 번 더 누르면 지워져요' }).click();
  await expect(page.locator('.tile', { hasText: '칭호·솜씨 점수' })).toContainText('새싹 0점');
  await expect(page.locator('.badge-item.is-earned')).toHaveCount(0);
  await expect(page.locator('.rank-chip')).toContainText('0점');
  await page.reload();
  await expect(page.locator('.workshop-card')).toContainText('도장 0 / 6');
  await expect(page.locator('.workshop-card')).toContainText('별 0 / 9');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edu:sample-divisor-sort:rewards')).xp)).toBe(0);
  expect(errors).toEqual([]);
});

/** 색종이 조각이 한 번에 가장 많을 때의 수를 센다 */
async function watchConfetti(page) {
  await page.evaluate(() => {
    window.maxConfetti = 0;
    new MutationObserver(() => {
      window.maxConfetti = Math.max(window.maxConfetti, document.querySelectorAll('.confetti-piece').length);
    }).observe(document.body, { childList: true, subtree: true });
  });
}

test.describe('결과 축하 연출', () => {
  test.beforeEach(async ({ page }) => {
    // 코어 2개 이하 기기는 자동으로 효과를 줄이므로, 테스트 기기와 상관없이 보통 기기로 맞춘다
    await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }));
  });

  test('보통: 별 → 도장 → 점수 막대 연출, 색종이는 12개 이하이고 2초 안에 사라지며 키를 누르면 끝 상태로 건너뛴다', async ({ page }) => {
    await page.goto(fileUrl(FILE, '?seed=1&sound=off&stage=divisors-of-12'));
    await watchConfetti(page);
    await solveAll(page);
    await expect(page.locator('.screen-result')).toHaveClass(/is-celebrating/);
    await expect.poll(() => page.evaluate(() => window.maxConfetti)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.maxConfetti)).toBeLessThanOrEqual(12);
    await expect(page.locator('.confetti-piece')).toHaveCount(0, { timeout: 2500 });
    await expect(page.locator('.screen-result')).not.toHaveClass(/is-celebrating/);

    // 다시 해서 연출 중에 Esc → 바로 끝 상태
    await page.getByRole('button', { name: '다시 하기' }).click();
    await solveAll(page);
    await expect(page.locator('.screen-result')).toHaveClass(/is-celebrating/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.screen-result')).not.toHaveClass(/is-celebrating/);
    await expect(page.locator('.confetti-piece')).toHaveCount(0);
  });

  test('?fx=low(저사양): 색종이 0개, 처음부터 끝 상태, 축하는 글자로 전한다', async ({ page }) => {
    await page.goto(fileUrl(FILE, '?seed=1&sound=off&stage=divisors-of-12&fx=low'));
    await watchConfetti(page);
    await solveAll(page);
    await expect(page.locator('.screen-result')).not.toHaveClass(/is-celebrating/);
    await expect(page.locator('.new-badge')).toContainText('첫 발걸음');
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => window.maxConfetti)).toBe(0);
    await expect(page.locator('[role="status"]')).toContainText('별 3개 중 3개');
  });
});

test.describe('결과 축하 연출 (움직임 줄이기)', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('움직임 줄이기: 색종이 0개, 처음부터 끝 상태', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }));
    await page.goto(fileUrl(FILE, '?seed=1&sound=off&stage=divisors-of-12'));
    await watchConfetti(page);
    await solveAll(page);
    await expect(page.locator('.screen-result')).not.toHaveClass(/is-celebrating/);
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => window.maxConfetti)).toBe(0);
    await expect(page.locator('.rank-card .xp-gain')).toHaveText('+32');
  });
});
