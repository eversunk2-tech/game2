/**
 * 정육면체 차시 "내 맘대로 전개도"(cube-free)의 끝내기 기준 (사용자 결정 2026-10-11 — 직육면체 차시의 내 맘대로 전개도와 같은 기준):
 * 서로 다른 전개도 2가지를 찾으면 [결과 보기]로 끝낼 수 있고(별 2개), 3가지를 찾으면 별 3개. 결과 화면에 별 기준 안내.
 * 그 밖의 것(판·접기·까닭 고르기·도감·점수 규칙·힌트·3가지를 찾는 판의 화면과 점수)은 net-workshop.spec.js가 지금까지처럼 본다.
 */
import { expect, test } from '@playwright/test';
import { BOARD_SIZES, centerOnBoard } from '../../src/games/net-workshop/logic.js';
import { collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

const FILE = 'net-workshop.html';
const FREE = (extra = '') => fileUrl(FILE, `?unlock=all&seed=1&sound=off&stage=cube-free${extra}`);
const SHAPES = {
  cross: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]], // 1-4-1e (십자)
  n231: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [1, 2]], // 2-3-1a
  n33: [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [4, 1]], // 3-3
  line5: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [2, 1]], // 한 줄 5칸 (안 됨: 겹침)
  sameSide: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [2, 1]], // 같은 쪽 날개 (안 됨)
};
const storedXpOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards'))?.xp ?? 0);
const boardOf = (page) => (page.viewportSize().width <= 560 ? BOARD_SIZES.phone : BOARD_SIZES.wide);

/** 모양을 판 가운데에 놓고 [접어 보기] — 다 접힐 때까지 기다린다. 안 되는 모양이면 까닭 고르기는 넘어간다 */
async function fold(page, name) {
  for (const [x, y] of centerOnBoard(SHAPES[name], boardOf(page))) await page.locator(`.free-board .cell[data-cell="${x},${y}"]`).click();
  await page.locator('.free-fold').click();
  await expect(page.locator('.fold-stage')).toHaveAttribute('data-fold', 'done');
  if (await page.locator('.reason-skip').isVisible()) await page.locator('.reason-skip').click();
}
async function fresh(page) {
  await page.locator('.free-new').click();
  await expect(page.locator('.free-board .tile-face')).toHaveCount(0);
}
/** 결과 화면: "오늘의 솜씨" 칸 점수 합 + 단계 완료·별 점수 줄 = "이번에 모은 솜씨 점수" */
async function resultXp(page) {
  return page.evaluate(() => {
    const sum = (texts) => texts.flatMap((t) => t.match(/\+\d+/g) ?? []).reduce((total, x) => total + Number(x), 0);
    return {
      tiles: sum([...document.querySelectorAll('.behavior .b-xp')].map((el) => el.textContent)),
      line: sum([document.querySelector('.xp-line').textContent]),
      gained: Number(document.querySelector('.rank-card .xp-gain').textContent.replace(/\D/g, '')),
    };
  });
}
/**
 * 화면이 넘치지 않고(휴대폰은 가로만), 오른쪽 판 안쪽도 넘치지 않는다.
 * 재기 전에 화면 안의 움직임(버튼의 들뜸이 가라앉는 전환, 알림·도장이 들어오는 움직임)이 끝날 때까지 기다린다 — 느린 기기에서 움직임 도중에 재지 않게
 */
async function expectFits(page, label) {
  await page.waitForFunction(() => [...document.querySelectorAll('.screen')].every((el) => el.getAnimations({ subtree: true }).every((a) => (
    a.playState !== 'running' || a.animationName === 'turn-hint' || a.effect?.getComputedTiming().iterations === Infinity))));
  const m = await page.evaluate(() => {
    const panel = document.querySelector('.net-panel');
    return { page: document.documentElement.scrollHeight - window.innerHeight, panel: panel ? panel.scrollHeight - panel.clientHeight : 0 };
  });
  if (page.viewportSize().width > 560) expect(m.page, `${label} 세로 넘침`).toBeLessThanOrEqual(0);
  expect(m.panel, `${label} 판 안쪽 넘침`).toBe(0);
  expect(await hasHorizontalScroll(page), `${label} 가로 스크롤`).toBe(false);
}

test('내 맘대로 전개도(정육면체): 1가지로는 끝낼 수 없고, 2가지를 찾으면 [결과 보기]가 나온다 — 끝내면 별 2개와 "3가지를 찾으면 별 3개!" 23점. 다시 해서 3가지를 찾으면 별 3개(늘어난 별만큼만 +2)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(FREE());
  await expect(page.locator('.play-goal')).toHaveText('면 6장을 마음대로 놓고 접어 봐요. 서로 다른 전개도 3가지를 찾아요.');
  await expect(page.locator('.tool-finish')).toBeHidden();

  // 1가지: 끝낼 수 없다 — 버튼은 [펴서 고치기][새로 만들기] 둘
  await fold(page, 'cross');
  await expect(page.locator('.q-counter')).toHaveText('찾은 전개도 1 / 3');
  await expect(page.locator('.btn-pair .btn')).toHaveText(['펴서 고치기', '새로 만들기']);
  await expect(page.locator('.free-finish, .goal-done')).toHaveCount(0);
  await fresh(page);
  await expect(page.locator('.tool-finish')).toBeHidden();

  // 2가지: 끝낼 수 있다. 한 가지 더 찾으라는 안내 + 세 버튼 한 줄. [펴서 고치기]가 주 버튼이고 초점도 거기에 있다
  await fold(page, 'n231');
  await expect(page.locator('.q-counter')).toHaveText('찾은 전개도 2 / 3');
  await expect(page.locator('.goal-done')).toHaveText('전개도 2가지를 찾았어요! 한 가지 더 찾으면 별 3개예요.');
  await expect(page.locator('.btn-trio .btn')).toHaveText(['펴서 고치기', '새로 만들기', '결과 보기']);
  await expect(page.locator('.free-fix')).toHaveClass(/btn-primary/);
  await expect(page.locator('.free-finish')).not.toHaveClass(/btn-primary/);
  await expect(page.locator('.free-fix')).toBeFocused();
  await expectFits(page, '2가지를 찾은 장면');
  expect(await storedXpOf(page)).toBe(14); // (만들기 성공 2 + 도감 5) × 2 — 접은 그 자리에서 저장
  // 놓는 판으로 돌아가면 매트 띠에 [결과 보기]
  await page.locator('.free-fix').click();
  await expect(page.locator('.tool-finish')).toBeVisible();
  await expectFits(page, '2가지를 찾은 뒤의 놓는 판');
  await page.locator('.tool-finish').click();

  await expect(page.locator('.screen-result')).toBeVisible();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 2개');
  await expect(page.locator('.star-hint')).toHaveText('서로 다른 전개도 3가지를 찾으면 별 3개!');
  const stats = await page.locator('.result-stats').textContent();
  expect(stats).toContain('찾은 전개도2가지');
  expect(stats).toContain('접어 본 모양2가지');
  expect(stats).not.toMatch(/정답률|맞힘|%/);
  const first = await resultXp(page);
  expect(first).toEqual({ tiles: 14, line: 9, gained: 23 }); // 단계 완료 5 + 별 2개 4
  expect(await storedXpOf(page)).toBe(23);
  expect(await hasHorizontalScroll(page)).toBe(false);

  // 다시 하기: 찾아본 두 전개도는 0점(가지 수에는 센다) → 2가지에서 다시 끝낼 수 있고, 새 전개도까지 3가지면 별 3개
  await page.getByRole('button', { name: '다시 하기' }).click();
  await fold(page, 'cross');
  await expect(page.locator('.bonus-note')).toContainText('전에 접어 본 모양');
  await fresh(page);
  await fold(page, 'n231');
  await expect(page.locator('.goal-done')).toHaveText('전개도 2가지를 찾았어요! 한 가지 더 찾으면 별 3개예요.');
  expect(await storedXpOf(page)).toBe(23);
  await fresh(page);
  await fold(page, 'n33');
  await expect(page.locator('.q-counter')).toHaveText('찾은 전개도 3 / 3');
  await expect(page.locator('.goal-done')).toHaveText('서로 다른 전개도 3가지를 모두 찾았어요!');
  await expect(page.locator('.btn-pair .btn')).toHaveText(['결과 보기', '더 찾아보기']);
  await expect(page.locator('.free-finish')).toHaveClass(/btn-primary/);
  await expect(page.locator('.free-finish')).toBeFocused();
  await page.locator('.free-finish').click();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  await expect(page.locator('.star-hint')).toHaveText('별 3개를 모두 받았어요!');
  const second = await resultXp(page);
  expect(second.gained).toBe(9); // 새 전개도 7 + 별 하나 더 2 (단계 완료 점수는 처음 한 번뿐)
  expect(second.tiles + second.line).toBe(second.gained);
  expect(await storedXpOf(page)).toBe(32);
  expect(errors).toEqual([]);
});

test('내 맘대로 전개도(정육면체): 2가지에서 [결과 보기]가 보여도 더 찾을 수 있고 3가지를 찾으면 지금까지처럼 별 3개 — 힌트는 3가지를 찾기 전까지 나온다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(FREE());
  await fold(page, 'cross');
  await fresh(page);
  await fold(page, 'n231');
  await expect(page.locator('.btn-trio .free-finish')).toBeVisible();
  // 2가지를 찾은 뒤에도 안 되는 모양을 연달아 2번 접으면 힌트가 나온다(3가지가 목표다)
  await fresh(page);
  await fold(page, 'line5');
  await expect(page.locator('.btn-trio .btn')).toHaveText(['펴서 고치기', '새로 만들기', '결과 보기']); // 안내 문장 없이 세 버튼
  await expect(page.locator('.goal-done')).toHaveCount(0);
  await fresh(page);
  await fold(page, 'sameSide');
  await fresh(page);
  await expect(page.locator('.tool-hint')).toBeVisible();
  await expect(page.locator('.tool-finish')).toBeVisible();
  // 셋째 전개도: 목표 달성 — 지금까지와 같은 장면([결과 보기]가 주 버튼, [더 찾아보기])
  await fold(page, 'n33');
  await expect(page.locator('.goal-done')).toHaveText('서로 다른 전개도 3가지를 모두 찾았어요!');
  await expect(page.locator('.btn-pair .btn')).toHaveText(['결과 보기', '더 찾아보기']);
  await page.locator('.free-finish').click();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  await expect(page.locator('.star-hint')).toHaveText('별 3개를 모두 받았어요!');
  const r = await resultXp(page);
  expect(r.tiles + r.line).toBe(r.gained);
  expect(r.line).toBe(11); // 단계 완료 5 + 별 3개 6
  // 전개도 3가지 21 + 안 되는 모양 2가지의 노트 2 + 다시 일어서기 1 = 24 (까닭은 넘어갔다) → 35점. 안 되는 모양 없이 3가지면 33점(아래)
  expect(r.gained).toBe(35);
  expect(await storedXpOf(page)).toBe(35);
  expect(errors).toEqual([]);
});

test('내 맘대로 전개도(정육면체): 전개도 3가지만 찾아 마치는 판의 점수는 33점 그대로다 (연속 3번 +1, 단계 완료 5 + 별 3개 6)', async ({ page }) => {
  await page.goto(FREE());
  await fold(page, 'cross');
  expect(await storedXpOf(page)).toBe(7);
  await fresh(page);
  await fold(page, 'n231');
  expect(await storedXpOf(page)).toBe(14);
  await fresh(page);
  await fold(page, 'n33');
  expect(await storedXpOf(page)).toBe(22);
  await page.locator('.free-finish').click();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  expect(await resultXp(page)).toEqual({ tiles: 22, line: 11, gained: 33 });
  expect(await storedXpOf(page)).toBe(33);
});
