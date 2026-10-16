import { expect, test } from '@playwright/test';
import { LESSONS, STAGES } from '../../src/games/net-workshop/logic.js';
import { BLOCK_HOW_TO, BLOCK_LESSONS, BLOCK_STAGES } from '../../src/games/net-workshop/blocks/blocks-logic.js';
import { collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

// ── 입체도형 공방의 영역 (B0a, spec-grade6 7-1절): 처음 화면의 영역 카드 · 단계 지도의 영역 탭 · ?area= · 앱 이름 · 영역별 놀이 방법 ──
// 영역에 든 차시·단계 수는 게임의 차시 목록에서 센다 — 쌓기나무 차시가 더해져도(S2) 이 파일의 검사가 달라지지 않게 고정값을 쓰지 않는다

const FILE = 'net-workshop.html';
const NAME = '입체도형 공방';
const MAX = 3;
/** 보이는 영역: 5학년 전개도(정육면체ㆍ직육면체) · 쌓기나무. "6학년 전개도"는 차시가 없어 보이지 않는다 */
const AREAS = [
  { id: 'net5', title: '5학년 전개도', line: '정육면체ㆍ직육면체', lessons: LESSONS.map((l) => l.id), stages: STAGES },
  { id: 'blocks', title: '쌓기나무', line: '6학년 2학기 · 공간과 입체', lessons: BLOCK_LESSONS.map((l) => l.id), stages: BLOCK_STAGES },
].map((a) => ({ ...a, max: a.stages.filter((s) => !s.challenge && a.lessons.includes(s.lesson)).length * MAX }));
const NET5 = AREAS[0];
const BLOCKS = AREAS[1];
const areaName = (a, stars = 0, here = false) => `${a.title}, ${a.line}, 차시 ${a.lessons.length}개, 모은 별 ${stars} / ${a.max}${here ? ', 여기부터' : ''}`;
const card = (page, id) => page.locator(`.area-card[data-area="${id}"]`);
const tab = (page, id) => page.locator(`.area-tab[data-area="${id}"]`);

/** 움직임(화면 들어오기 0.32초, 카드 들뜸 등)이 모두 끝날 때까지 — 크기·자리는 그 뒤에 잰다 (common-rules 8절) */
const settled = (page) => page.waitForFunction(() => document.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));

const NET5_HOW_TO_FIRST = '전개도를 보고, 접으면 입체가 될지 먼저 머릿속으로 생각해요.';
const howToLines = (page) => page.locator('.howto-list li').evaluateAll((els) => els.map((el) => el.lastElementChild.textContent));

test('처음 화면: [시작하기] 자리에 영역 카드 둘(5학년 전개도 · 쌓기나무). 카드마다 그림·이름·학년과 단원·차시 수·그 영역의 모은 별, 첫 영역에 "여기부터!". 앱 이름은 "입체도형 공방"', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(page.locator('h1')).toHaveText(NAME);
  await expect(page.locator('.topbar-title')).toHaveText(NAME);
  await expect(page.locator('.brand-mark')).toHaveText('입');
  await expect(page).toHaveTitle(NAME);
  await expect(page.locator('.eyebrow')).toHaveText('5·6학년 수학 · 전개도와 쌓기나무');
  await expect(page.locator('.lead')).toContainText('쌓기나무');
  await expect(page.getByRole('button', { name: '시작하기' })).toHaveCount(0);
  await expect(page.locator('.area-card')).toHaveCount(2);
  expect(await page.locator('.area-card').evaluateAll((els) => els.map((el) => el.dataset.area))).toEqual(['net5', 'blocks']);
  await expect(page.locator('.area-card[data-area="net6"]')).toHaveCount(0); // 차시가 없는 영역은 보이지 않는다
  // 화면 읽기 이름: "5학년 전개도, 정육면체ㆍ직육면체, 차시 2개, 모은 별 0 / 24, 여기부터"
  await expect(card(page, 'net5')).toHaveAccessibleName(areaName(NET5, 0, true));
  await expect(card(page, 'blocks')).toHaveAccessibleName(areaName(BLOCKS, 0, false));
  await expect(page.getByRole('list', { name: '영역' })).toBeVisible();
  for (const a of AREAS) {
    const c = card(page, a.id);
    await expect(c.locator('.area-title')).toHaveText(a.title);
    await expect(c.locator('.area-line')).toHaveText(a.line);
    await expect(c.locator('.area-meta .chip')).toHaveText([`차시 ${a.lessons.length}개`, `별 0 / ${a.max}`]);
    await expect(c.locator('.area-art svg')).toHaveCount(1);
    await expect(c.locator('.area-art')).toHaveAttribute('aria-hidden', 'true');
  }
  // "여기부터!": 처음이면 첫 영역 — 깃발 글자 + 파랑 테두리(색만이 아니라 글자로도)
  await expect(page.locator('.area-cards .flag')).toHaveCount(1);
  await expect(page.locator('.area-cards > li').nth(0).locator('.flag')).toHaveText('여기부터!');
  await expect(card(page, 'net5')).toHaveClass(/is-now/);
  // 내 공방 카드는 게임 하나에 하나(모든 영역의 별·도감·도장)
  const all = (NET5.max + BLOCKS.max);
  await expect(page.locator('.workshop-meta .chip').first()).toHaveText(`별 0 / ${all}`);
  await expect(page.locator('.workshop-meta')).toContainText('도감 0 / 11');
  await expect(page.locator('.hero-more .btn')).toHaveText(['놀이 방법', '학습 기록']);
  expect(errors).toEqual([]);
});

test('영역 카드 → 그 영역의 단계 지도: 영역 탭(지금 영역 표시), 그 영역의 차시만, 차시 칩은 영역 안의 차례 "1차시"·"2차시", 모은 별·도감 칩은 그 영역의 것', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await card(page, 'blocks').click();
  await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: '영역' }).getByRole('tab');
  await expect(tabs).toHaveText(['5학년 전개도', '쌓기나무']);
  await expect(page.getByRole('tab', { name: '쌓기나무' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: '5학년 전개도' })).toHaveAttribute('aria-selected', 'false');
  const panel = page.getByRole('tabpanel');
  await expect(panel).toHaveAttribute('aria-labelledby', 'area-tab-blocks');
  await expect(panel).toHaveAccessibleName('쌓기나무');
  // 쌓기나무 영역: 그 영역의 차시만, 칩은 "1차시"·"2차시"… (차시 정의의 "쌓기나무 n차시"가 아니라), 단원 글·시간 칩은 그대로
  expect(await page.locator('.lesson-group').evaluateAll((els) => els.map((el) => el.dataset.lesson))).toEqual(BLOCKS.lessons);
  await expect(page.locator('.lesson-no')).toHaveText(BLOCKS.lessons.map((_, i) => `${i + 1}차시`));
  for (const lesson of BLOCK_LESSONS) {
    const group = page.locator(`.lesson-group[data-lesson="${lesson.id}"]`);
    await expect(group.locator('h3')).toHaveText(lesson.title);
    await expect(group.locator('.lesson-note')).toHaveText('6학년 2학기 · 공간과 입체');
    await expect(group.locator('.lesson-chips .chip')).toHaveText([`약 ${lesson.minutes}분`]);
    await expect(group.locator('.stage-card').nth(0)).toBeEnabled(); // 차시마다 첫 단계가 열려 있다
  }
  await expect(page.locator('.star-total')).toHaveText(`모은 별 0 / ${BLOCKS.max}`);
  await expect(page.locator('.collection-chip')).toHaveCount(0); // 쌓기나무 영역에는 도감이 없다(전개도 도감은 5학년 전개도 영역의 차시 머리에)
  await expect(page.getByText('정육면체의 전개도')).toHaveCount(0);

  // 탭으로 다른 영역: 5학년 전개도의 두 차시, 칩 "1차시"·"2차시", 도감·노트 칩은 정육면체 차시 머리에
  await page.getByRole('tab', { name: '5학년 전개도' }).click();
  await expect(page.getByRole('tab', { name: '5학년 전개도' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: '쌓기나무' })).toHaveAttribute('aria-selected', 'false');
  expect(await page.locator('.lesson-group').evaluateAll((els) => els.map((el) => el.dataset.lesson))).toEqual(NET5.lessons);
  await expect(page.locator('.lesson-no')).toHaveText(['1차시', '2차시']);
  await expect(page.locator('.lesson-group[data-lesson="cube"] .collection-chip')).toHaveText(['도감 0 / 11', '노트 0 / 24']);
  await expect(page.locator('.head-chips .collection-chip')).toHaveCount(0);
  await expect(page.locator('.star-total')).toHaveText(`모은 별 0 / ${NET5.max}`);
  await expect(page.locator('.lesson-group[data-lesson="cube"] .challenge-card')).toHaveCount(2);
  await expect(panel).toHaveAccessibleName('5학년 전개도');
  // [처음 화면]으로 돌아가는 길은 그대로
  await page.getByRole('button', { name: '처음 화면' }).click();
  await expect(page.locator('.area-card')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('영역 탭 키보드: 지금 영역 탭 하나만 Tab으로 들어가고(나머지 tabindex -1), ←·→·Home·End로 옮기면 그 영역이 보이며 초점이 따라간다. Tab은 차시의 단계 카드로', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=net5'));
  await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeFocused();
  await expect(tab(page, 'net5')).toHaveAttribute('tabindex', '0');
  await expect(tab(page, 'blocks')).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('Tab');
  await expect(tab(page, 'net5')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'blocks')).toBeFocused();
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.lesson-group').first()).toHaveAttribute('data-lesson', BLOCKS.lessons[0]);
  await page.keyboard.press('ArrowRight'); // 끝에서 처음으로 돈다
  await expect(tab(page, 'net5')).toBeFocused();
  await expect(page.locator('.lesson-group').first()).toHaveAttribute('data-lesson', 'cube');
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'blocks')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab(page, 'net5')).toBeFocused();
  await page.keyboard.press('End');
  await expect(tab(page, 'blocks')).toBeFocused();
  await expect(tab(page, 'blocks')).toHaveAttribute('tabindex', '0');
  await expect(tab(page, 'net5')).toHaveAttribute('tabindex', '-1');
  // Tab: 탭 목록을 나와 그 영역의 첫 단계 카드로(다른 탭은 건너뛴다)
  await page.keyboard.press('Tab');
  await expect(page.locator(`.lesson-group[data-lesson="${BLOCKS.lessons[0]}"] .stage-card`).first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(tab(page, 'blocks')).toBeFocused();
});

test('키보드만으로 한 바퀴: 영역 고르기 → 단계 시작 → 돌아오면 그 영역의 지도 → 탭으로 다른 영역 → 단계 시작 → 처음 화면에서 "여기부터!"가 방금 한 영역으로', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  const focused = () => page.evaluate(() => {
    const el = document.activeElement;
    return el?.dataset?.area ?? el?.textContent?.trim() ?? '';
  });
  /** Tab을 눌러 조건에 맞는 요소에 초점이 갈 때까지 (최대 n번) */
  async function tabTo(selector, n = 12) {
    for (let i = 0; i < n; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate((sel) => document.activeElement?.matches(sel), selector)) return;
    }
    throw new Error(`${selector}에 Tab으로 가지 못했어요 (지금 초점: ${await focused()})`);
  }
  await tabTo('.area-card[data-area="blocks"]');
  await page.keyboard.press('Enter');
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  await tabTo('.lesson-group .stage-card');
  await page.keyboard.press('Enter');
  await expect(page.locator('.play-area')).toBeVisible();
  await expect(page.locator('.play-title')).toHaveText(BLOCK_STAGES.find((s) => s.lesson === BLOCKS.lessons[0]).title);
  // [← 단계 선택]은 제목 앞에 있다
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: '← 단계 선택' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true'); // 그 차시가 든 영역의 지도
  await tabTo('.area-tab');
  await expect(tab(page, 'blocks')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'net5')).toHaveAttribute('aria-selected', 'true');
  await tabTo('.lesson-group .stage-card');
  await page.keyboard.press('Enter');
  await expect(page.locator('.play-title')).toHaveText(STAGES.find((s) => s.lesson === 'cube').title);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(tab(page, 'net5')).toHaveAttribute('aria-selected', 'true');
  await tabTo('.actions .btn:not([hidden])', 40);
  await expect(page.getByRole('button', { name: '처음 화면' })).toBeFocused();
  await page.keyboard.press('Enter');
  // 방금 단계를 시작한 영역(5학년 전개도)에 "여기부터!"
  await expect(card(page, 'net5')).toHaveAccessibleName(areaName(NET5, 0, true));
  await expect(card(page, 'blocks')).toHaveAccessibleName(areaName(BLOCKS, 0, false));
  expect(errors).toEqual([]);
});

test('지난번에 하던 영역: 단계를 시작한 영역에 "여기부터!", 새로 열어도 그대로(저장 값 area 하나만 더함). 기록 모두 지우기 뒤에는 첫 영역', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  const keys = async () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('edu:net-workshop:')).sort());
  const before = await keys();
  await card(page, 'blocks').click();
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => localStorage.getItem('edu:net-workshop:area'))).toBeNull(); // 고르기만 해서는 바뀌지 않는다
  await page.locator('.lesson-group .stage-card').first().click();
  await expect(page.locator('.play-area')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('edu:net-workshop:area'))).toBe('"blocks"');
  expect((await keys()).filter((k) => !before.includes(k))).toEqual(['edu:net-workshop:area']);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(card(page, 'blocks')).toHaveClass(/is-now/);
  await expect(card(page, 'net5')).not.toHaveClass(/is-now/);
  await expect(page.locator('.area-cards > li').nth(1).locator('.flag')).toHaveText('여기부터!');
  await expect(card(page, 'blocks')).toHaveAccessibleName(areaName(BLOCKS, 0, true));
  // ?lesson=으로 한 차시만 열어 단계를 해도 그 영역을 기억한다
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&lesson=cuboid'));
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.locator('.stage-card').first().click();
  await expect(page.locator('.play-area')).toBeVisible();
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(card(page, 'net5')).toHaveClass(/is-now/);
  // 저장 값이 엉뚱하면(없어진 영역·깨진 값) 첫 영역
  for (const raw of ['"net6"', '"zzz"', '{bad', '3']) {
    await page.evaluate((v) => localStorage.setItem('edu:net-workshop:area', v), raw);
    await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
    await expect(card(page, 'net5')).toHaveClass(/is-now/);
  }
  // 기록 모두 지우기: 다음 학생은 첫 영역부터
  await page.evaluate(() => localStorage.setItem('edu:net-workshop:area', '"blocks"'));
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await page.getByRole('button', { name: '학습 기록' }).click();
  await page.getByRole('button', { name: '기록 모두 지우기' }).click();
  await page.getByRole('button', { name: '한 번 더 누르면 지워져요' }).click();
  expect(await page.evaluate(() => localStorage.getItem('edu:net-workshop:area'))).toBeNull();
  await page.getByRole('button', { name: '처음 화면' }).click();
  await expect(card(page, 'net5')).toHaveClass(/is-now/);
  expect(errors).toEqual([]);
});

test('옛 저장 값(영역이 없던 때의 기록)으로 열어도 별·점수·칭호·도감·도장·학습 기록이 그대로 보이고, 영역 카드의 별은 그 영역 단계의 합이다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  // 사이트(영역이 생기기 전)에서 쌓은 것과 같은 모양의 값 — 열쇠·모양은 그대로, "area" 값은 없다
  await page.evaluate(() => {
    localStorage.clear();
    const set = (k, v) => localStorage.setItem(`edu:net-workshop:${k}`, JSON.stringify(v));
    set('stars', { 'cube-judge': 3, 'cube-opposite': 2, 'cuboid-edge': 1, 'blocks-play': 3, 'blocks-copy': 2, 'cube-dice': 3 });
    set('rewards', { v: 1, xp: 112, badges: { 'first-step': { at: 1760000000000 }, 'beyond-cross': { at: 1760000000001 } }, counters: { bounce: 1, retryFix: 0, explain: 2, inspect: 0, discover: 3 }, best: {}, rank: '접기 장인' });
    set('collections', { 'cube-nets': { '1-4-1a': { at: 1, stage: 'cube-free' }, '2-3-1a': { at: 2, stage: 'cube-free' } }, 'cube-non-nets': {} });
    set('log', [{ stageId: 'cube-judge', stageTitle: '접힐까, 안 접힐까?', startedAt: 1760000000000, durationMs: 61000, attempts: 5, correct: 5, accuracy: 1, stars: 3, cleared: true, answers: [] },
      { stageId: 'blocks-play', stageTitle: '쌓기 놀이터', startedAt: 1760000100000, durationMs: 90000, attempts: 0, correct: 0, accuracy: null, stars: 3, cleared: true, answers: [] }]);
  });
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  // 내 공방 카드: 게임 하나에 하나 — 일반 단계의 별 합(도전 주문서 별은 빼는 엔진 규칙 그대로), 칭호, 도감, 도장
  await expect(page.locator('.rank-chip')).toContainText('접기 장인'); // 112점: 셋째 칭호(100점부터)
  await expect(page.locator('.rank-chip small')).toHaveText('112점');
  await expect(page.locator('.workshop-meta .chip')).toHaveText([`별 11 / ${NET5.max + BLOCKS.max}`, '도감 2 / 11', '도장 2 / 12']);
  // 영역 카드의 별: 그 영역 일반 단계의 합 (5학년 전개도 3 + 2 + 1, 쌓기나무 3 + 2). "지난번 영역" 값이 없으니 첫 영역에 "여기부터!"
  await expect(card(page, 'net5')).toHaveAccessibleName(areaName(NET5, 6, true));
  await expect(card(page, 'blocks')).toHaveAccessibleName(areaName(BLOCKS, 5, false));
  await card(page, 'net5').click();
  await expect(page.locator('.star-total')).toHaveText(`모은 별 6 / ${NET5.max}`);
  await expect(page.locator('.lesson-group[data-lesson="cube"] .collection-chip')).toHaveText(['도감 2 / 11', '노트 0 / 24']);
  await expect(page.locator('.lesson-group[data-lesson="cube"] .stage-card').nth(1)).toBeEnabled(); // 마친 단계 다음이 열려 있다
  await expect(page.locator('.lesson-group[data-lesson="cube"] .stage-card').nth(3)).toBeDisabled();
  await page.getByRole('tab', { name: '쌓기나무' }).click();
  await expect(page.locator('.star-total')).toHaveText(`모은 별 5 / ${BLOCKS.max}`);
  await page.getByRole('button', { name: '처음 화면' }).click();
  await page.getByRole('button', { name: '학습 기록' }).click();
  await expect(page.locator('.report-table tbody tr')).toHaveCount(2);
  await expect(page.locator('.tile', { hasText: '칭호·솜씨 점수' })).toContainText('접기 장인 112점');
  await expect(page.locator('.tile', { hasText: '모은 별' })).toContainText(`11 / ${NET5.max + BLOCKS.max}`);
  await expect(page.locator('.badge-item.is-earned')).toHaveCount(2);
  await expect(page.locator('.btn-collection')).toHaveText('전개도 도감 2 / 11 ㆍ 노트 0 / 24');
  // 저장 값은 하나도 바뀌지 않았다 (열기만 했다)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:stars')))).toEqual({ 'cube-judge': 3, 'cube-opposite': 2, 'cuboid-edge': 1, 'blocks-play': 3, 'blocks-copy': 2, 'cube-dice': 3 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards')).xp)).toBe(112);
  expect(await page.evaluate(() => localStorage.getItem('edu:net-workshop:area'))).toBeNull();
  expect(errors).toEqual([]);
});

test('?area=: 그 영역의 단계 지도로 바로. 없는 영역·차시가 없는 영역이면 처음 화면. ?lesson=과 함께 오면 ?lesson=이 이긴다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=blocks'));
  await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.lesson-group')).toHaveCount(BLOCKS.lessons.length);
  await page.getByRole('button', { name: '처음 화면' }).click();
  await expect(page.locator('.area-card')).toHaveCount(2);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=net5'));
  await expect(tab(page, 'net5')).toHaveAttribute('aria-selected', 'true');
  for (const bad of ['zzz', 'net6', '']) {
    await page.goto(fileUrl(FILE, `?seed=1&sound=off&area=${bad}`));
    await expect(page.locator('h1')).toHaveText(NAME);
    await expect(page.locator('.area-card')).toHaveCount(2);
  }
  // ?lesson=이 이긴다: 그 차시만, 영역 카드·탭 없음
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=blocks&lesson=cube'));
  await expect(page.locator('.eyebrow')).toHaveText('정육면체의 전개도');
  await expect(page.locator('.area-card')).toHaveCount(0);
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.locator('.lesson-group h3')).toHaveText(['정육면체의 전개도']);
  // ?stage=가 있으면 그 단계로 바로(?area=보다 먼저), 돌아오면 그 단계가 든 영역의 지도
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&unlock=all&area=net5&stage=blocks-copy'));
  await expect(page.locator('.play-title')).toHaveText(BLOCK_STAGES.find((s) => s.id === 'blocks-copy').title);
  await page.getByRole('button', { name: '← 단계 선택' }).click();
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('한 차시 주소(?lesson=)는 지금처럼 그 차시만: 영역 카드·탭 없이 [시작하기], 차시 칩은 1차시·2차시·쌓기나무 1차시·쌓기나무 2차시, 놀이 방법은 그 영역의 줄만', async ({ page }) => {
  const errors = collectErrors(page);
  const cases = [
    { lesson: 'cube', chip: '1차시', howTo: 'net' },
    { lesson: 'cuboid', chip: '2차시', howTo: 'net' },
    ...BLOCK_LESSONS.map((l) => ({ lesson: l.id, chip: l.chip ?? null, howTo: 'blocks' })),
  ];
  for (const c of cases) {
    await page.goto(fileUrl(FILE, `?seed=1&sound=off&lesson=${c.lesson}`));
    await expect(page.locator('h1')).toHaveText(NAME);
    await expect(page.locator('.area-card')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible();
    await page.getByRole('button', { name: '놀이 방법' }).click();
    const lines = await howToLines(page);
    if (c.howTo === 'net') {
      expect(lines[0]).toBe(NET5_HOW_TO_FIRST);
      expect(lines).toHaveLength(6);
      expect(lines.join(' '), c.lesson).not.toContain('쌓기나무'); // S1b-5: 전개도 차시 주소에 쌓기나무 줄이 없다
    } else {
      expect(lines).toEqual(BLOCK_HOW_TO);
      expect(lines.join(' '), c.lesson).not.toContain('전개도'); // 쌓기나무 차시 주소에 전개도 줄이 없다
    }
    await page.getByRole('button', { name: '시작하기' }).click();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(page.locator('.lesson-group')).toHaveCount(1);
    if (c.chip) await expect(page.locator('.lesson-no')).toHaveText(c.chip);
  }
  expect(errors).toEqual([]);
});

test('놀이 방법: 처음 화면(영역을 고르기 전)은 공통 몇 줄, 영역의 단계 지도에서는 그 영역의 줄과 [단계 선택](그 영역의 지도로)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await page.getByRole('button', { name: '놀이 방법' }).click();
  const common = await howToLines(page);
  expect(common.length).toBeGreaterThanOrEqual(3);
  expect(common.length).toBeLessThanOrEqual(6);
  expect(common[0]).toContain('영역');
  expect(common).not.toContain(NET5_HOW_TO_FIRST);
  for (const line of BLOCK_HOW_TO) expect(common).not.toContain(line);
  await expect(page.locator('.screen-howto .actions .btn')).toHaveText(['처음 화면']); // 영역은 처음 화면의 카드로 고른다
  await page.getByRole('button', { name: '처음 화면' }).click();
  for (const a of AREAS) {
    await card(page, a.id).click();
    await page.getByRole('button', { name: '놀이 방법' }).click();
    const lines = await howToLines(page);
    if (a.id === 'blocks') expect(lines).toEqual(BLOCK_HOW_TO);
    else {
      expect(lines[0]).toBe(NET5_HOW_TO_FIRST);
      expect(lines.join(' ')).not.toContain('쌓기나무');
    }
    await expect(page.locator('.screen-howto .actions .btn')).toHaveText(['단계 선택', '처음 화면']);
    await page.getByRole('button', { name: '단계 선택' }).click();
    await expect(tab(page, a.id)).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: '처음 화면' }).click();
  }
  expect(errors).toEqual([]);
});

/** 화면의 크기 검사: 가로 스크롤 0, 누를 것 48px 이상(보이는 것), 영역 카드·탭이 화면 안 */
async function layoutOf(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const press = [...document.querySelectorAll('.area-card, .area-tab, .screen .btn, .stage-card')].filter((el) => el.getClientRects().length > 0 && !el.closest('[hidden]'));
    const small = press.map((el) => ({ el: el.className + (el.dataset.area ? `[${el.dataset.area}]` : ''), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 47.5 || r.width < 47.5).map(({ el, r }) => `${el} ${r.width.toFixed(1)}×${r.height.toFixed(1)}`);
    const outside = [...document.querySelectorAll('.area-card, .area-tab, .area-meta .chip, .hero-more .btn')].map((el) => el.getBoundingClientRect())
      .filter((r) => r.left < -0.5 || r.right > innerWidth + 0.5).length;
    // 카드 안의 글자·칩이 카드 밖으로 넘치지 않는다
    const spill = [...document.querySelectorAll('.area-card')].flatMap((c) => {
      const box = c.getBoundingClientRect();
      return [...c.querySelectorAll('.area-title, .area-line, .area-meta .chip, .area-art')].map((el) => el.getBoundingClientRect())
        .filter((r) => r.right > box.right + 0.5 || r.bottom > box.bottom + 0.5 || r.left < box.left - 0.5);
    }).length;
    return { hScroll: doc.scrollWidth - doc.clientWidth, vScroll: doc.scrollHeight - innerHeight, small, outside, spill, pressed: press.length };
  });
}

test('배치(네 크기): 처음 화면과 두 영역의 단계 지도에 가로 스크롤 0, 크롬북(1366×768·1366×680)과 태블릿은 처음 화면 세로 스크롤 0, 누를 것 48px, 카드 넘침 0', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '네 크기를 한 번에 잰다');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  for (const [w, hgt] of [[1366, 768], [1366, 680], [820, 1180], [390, 844]]) {
    await page.setViewportSize({ width: w, height: hgt });
    await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
    await expect(page.locator('.area-card')).toHaveCount(2);
    await settled(page);
    const title = await layoutOf(page);
    expect(title.hScroll, `${w}×${hgt} 처음 화면 가로`).toBeLessThanOrEqual(0);
    if (w > 560) expect(title.vScroll, `${w}×${hgt} 처음 화면 세로`).toBeLessThanOrEqual(0);
    expect(title.small, `${w}×${hgt}`).toEqual([]);
    expect(title.outside).toBe(0);
    expect(title.spill, `${w}×${hgt} 카드 넘침`).toBe(0);
    // 두 카드가 같은 높이, 보이는 화면 안(크롬북·태블릿)
    const cards = await page.locator('.area-card').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom, h: r.height })));
    if (w > 560) for (const c of cards) expect(c.bottom).toBeLessThanOrEqual(hgt);
    if (w > 900) expect(Math.abs(cards[0].h - cards[1].h)).toBeLessThan(1);
    for (const a of AREAS) {
      await page.goto(fileUrl(FILE, `?seed=1&sound=off&area=${a.id}`));
      await expect(tab(page, a.id)).toHaveAttribute('aria-selected', 'true');
      await settled(page);
      const map = await layoutOf(page);
      expect(map.hScroll, `${w}×${hgt} ${a.id} 지도 가로`).toBeLessThanOrEqual(0);
      expect(map.small, `${w}×${hgt} ${a.id}`).toEqual([]);
      expect(map.outside).toBe(0);
      // 탭 둘이 한 줄(휴대폰은 줄을 넘겨도 된다), 지금 탭은 눌린 키(내려앉음) — 다른 탭과 색만이 아니라 자리·그림자도 다르다
      const tabs = await page.locator('.area-tab').evaluateAll((els) => els.map((el) => {
        const s = getComputedStyle(el);
        return { top: el.offsetTop, current: el.getAttribute('aria-selected') === 'true', shadow: s.boxShadow, transform: s.transform };
      }));
      if (w > 560) expect(tabs[0].top, `${w}×${hgt} 탭 한 줄`).toBe(tabs[1].top);
      const on = tabs.find((t) => t.current);
      const off = tabs.find((t) => !t.current);
      expect(on.shadow).not.toBe(off.shadow);
      expect(on.transform).not.toBe(off.transform);
    }
  }
  expect(errors).toEqual([]);
});

test('대비 4.5:1: 영역 카드의 이름·한 줄·칩, 영역 탭(지금·다른 탭)의 글자', async ({ page }) => {
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(page.locator('.area-card')).toHaveCount(2);
  const contrastOf = (selector) => page.locator(selector).evaluateAll((els) => {
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 4).map(Number);
    const lum = (c) => {
      const [r, g, b] = rgb(c).slice(0, 3).map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const bgOf = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        const a = rgb(c)[3];
        if (!(c === 'transparent' || a === 0)) return c;
      }
      return 'rgb(255, 255, 255)';
    };
    return els.map((el) => {
      const [x, y] = [lum(getComputedStyle(el).color), lum(bgOf(el))].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    });
  });
  for (const sel of ['.area-title', '.area-line', '.area-meta .chip']) {
    for (const ratio of await contrastOf(sel)) expect(ratio, sel).toBeGreaterThanOrEqual(4.5);
  }
  await card(page, 'blocks').click();
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  await settled(page);
  const tabs = await contrastOf('.area-tab');
  expect(tabs).toHaveLength(2);
  for (const ratio of tabs) expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('움직임 줄이기 · ?fx=low: 처음 화면·영역의 단계 지도가 끝 상태로 바로 보인다(움직임 줄이기는 누를 때의 들뜸도 없음, ?fx=low는 화면 들어오기 움직임 없음)', async ({ page }) => {
  // 움직임 줄이기: 0.001초보다 긴 움직임(애니메이션·전환)이 하나도 돌지 않는다
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const longRunning = () => page.evaluate(() => document.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && Number(a.effect?.getComputedTiming().duration) > 1).length);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(page.locator('.area-card')).toHaveCount(2);
  expect(await longRunning()).toBe(0);
  await card(page, 'net5').click();
  expect(await longRunning()).toBe(0);
  await tab(page, 'blocks').click();
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  expect(await longRunning()).toBe(0);
  // ?fx=low (움직임 줄이기 없이): 화면 들어오기 움직임(CSS 애니메이션)이 없다 — 엔진이 다른 화면에 하는 것과 같다
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const cssAnimations = () => page.evaluate(() => document.getAnimations({ subtree: true }).filter((a) => a.constructor.name === 'CSSAnimation' && a.playState === 'running').length);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&fx=low'));
  await expect(page.locator('#app')).toHaveClass(/fx-low/);
  await expect(page.locator('.area-card')).toHaveCount(2);
  expect(await cssAnimations()).toBe(0);
  await card(page, 'blocks').click();
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  expect(await cssAnimations()).toBe(0);
});

test('터치(태블릿): 영역 카드를 눌러 단계 지도로, 탭을 눌러 다른 영역으로', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', '터치는 태블릿에서');
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await card(page, 'blocks').tap();
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  await tab(page, 'net5').tap();
  await expect(tab(page, 'net5')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.lesson-group').first()).toHaveAttribute('data-lesson', 'cube');
  await page.locator('.lesson-group .stage-card').first().tap();
  await expect(page.locator('.play-area')).toBeVisible();
  expect(errors).toEqual([]);
});

test('게임 모음 카드: 새 이름 "입체도형 공방", 쌓기나무 문장이 든 요약, 표지에 전개도 조각과 쌓기나무, 주소는 그대로 net-workshop.html', async ({ page }) => {
  await page.goto(fileUrl('index.html'));
  const hubCard = page.locator(`a.hub-card[href="${FILE}"]`);
  await expect(hubCard).toHaveCount(1);
  await expect(hubCard.locator('.hub-card-title')).toHaveText(NAME);
  await expect(hubCard.locator('.hub-card-summary')).toContainText('쌓기나무');
  await expect(hubCard.locator('.hub-cover svg rect')).toHaveCount(6);
  await expect(hubCard.locator('.hub-cover svg polygon')).toHaveCount(9);
  await expect(hubCard.locator('.hub-card-meta')).toContainText('5-2 직육면체·정육면체 외 3단원');
  expect(await hasHorizontalScroll(page)).toBe(false);
});
