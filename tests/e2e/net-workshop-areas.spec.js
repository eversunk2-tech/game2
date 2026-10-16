import { expect, test } from '@playwright/test';
import { createRng } from '../../src/shared/core/random.js';
import { transformNet } from '../../src/games/net-workshop/fold.js';
import { CUBOID_BOARDS, FREE_CARDS, centerOnBoard as centerCuboid, freeNets } from '../../src/games/net-workshop/cuboid-logic.js';
import { BOARD_SIZES, LESSONS, STAGES, centerOnBoard, makeQuestions } from '../../src/games/net-workshop/logic.js';
import { BLOCK_HOW_TO, BLOCK_LESSONS, BLOCK_STAGES } from '../../src/games/net-workshop/blocks/blocks-logic.js';
import { collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

// ── 입체도형 공방: 학년 → 영역 → 단계 지도 (B0a, spec-grade6 7-1절 · 2026-10-16 사용자 수정 요청 "학년으로 먼저 고른다") ──
// 처음 화면의 학년 카드 · 학년 화면의 영역 카드(준비 중 포함) · 단계 지도의 영역 탭(같은 학년끼리) · ?grade=·?area= · 앱 이름 · 영역별 놀이 방법
// 영역에 든 차시·단계 수는 게임의 차시 목록에서 센다 — 쌓기나무 차시가 더해져도(S2) 이 파일의 검사가 달라지지 않게 고정값을 쓰지 않는다

const FILE = 'net-workshop.html';
const NAME = '입체도형 공방';
const MAX = 3;
const has = (id) => [...LESSONS, ...BLOCK_LESSONS].some((l) => l.id === id);
const AREAS = [
  { id: 'cube', grade: 5, title: '정육면체의 전개도', line: '5학년 2학기 · 직육면체와 정육면체', lessons: ['cube'], stages: STAGES },
  { id: 'cuboid', grade: 5, title: '직육면체의 전개도', line: '5학년 2학기 · 직육면체와 정육면체', lessons: ['cuboid'], stages: STAGES },
  { id: 'prism', grade: 6, title: '각기둥의 전개도', line: '6학년 1학기 · 각기둥과 각뿔', lessons: [], stages: [] },
  { id: 'blocks', grade: 6, title: '쌓기나무', line: '6학년 2학기 · 공간과 입체', lessons: BLOCK_LESSONS.map((l) => l.id), stages: BLOCK_STAGES },
  { id: 'cylinder', grade: 6, title: '원기둥의 전개도', line: '6학년 2학기 · 원기둥, 원뿔, 구', lessons: [], stages: [] },
].map((a) => ({ ...a, ready: a.lessons.length > 0, max: a.stages.filter((s) => !s.challenge && a.lessons.includes(s.lesson)).length * MAX }));
const area = (id) => AREAS.find((a) => a.id === id);
const GRADES = [
  { grade: 5, title: '5학년', note: '정육면체, 직육면체 전개도 탐구' },
  { grade: 6, title: '6학년', note: '각기둥의 전개도, 쌓기나무 탐구, 원기둥의 전개도 탐구' },
].map((g) => ({ ...g, areas: AREAS.filter((a) => a.grade === g.grade), max: AREAS.filter((a) => a.grade === g.grade).reduce((sum, a) => sum + a.max, 0) }));
const grade = (n) => GRADES.find((g) => g.grade === n);
const areaName = (a, stars = 0, here = false) => (a.ready ? `${a.title}, ${a.line}, 차시 ${a.lessons.length}개, 모은 별 ${stars} / ${a.max}${here ? ', 여기부터' : ''}` : `${a.title}, 준비 중`);
const gradeName = (g, stars = 0, here = false) => `${g.title}, ${g.note}, 모은 별 ${stars} / ${g.max}${here ? ', 여기부터' : ''}`;
const gradeCard = (page, n) => page.locator(`.grade-card[data-grade="${n}"]`);
const card = (page, id) => page.locator(`.area-card[data-area="${id}"]`);
const tab = (page, id) => page.locator(`.area-tab[data-area="${id}"]`);
/** 처음 화면 → 학년 카드 → 영역 카드 → 그 영역의 단계 지도 */
async function openArea(page, id) {
  await gradeCard(page, area(id).grade).click();
  await expect(page.locator('.screen-grade')).toBeVisible();
  await card(page, id).click();
  await expect(tab(page, id)).toHaveAttribute('aria-selected', 'true');
}

/** 움직임(화면 들어오기 0.32초, 카드 들뜸 등)이 모두 끝날 때까지 — 크기·자리는 그 뒤에 잰다 (common-rules 8절) */
const settled = (page) => page.waitForFunction(() => document.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));

const CUBE_HOW_TO_FIRST = '전개도를 보고, 접으면 입체가 될지 먼저 머릿속으로 생각해요.';
const howToLines = (page) => page.locator('.howto-list li').evaluateAll((els) => els.map((el) => el.lastElementChild.textContent));

test('처음 화면: [시작하기] 자리에 학년 카드 둘(5학년 · 6학년, 사용자 문장 그대로의 설명). 카드마다 그림·그 학년의 모은 별, 첫 학년에 "여기부터!". 앱 이름은 "입체도형 공방"', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(page.locator('h1')).toHaveText(NAME);
  await expect(page.locator('.topbar-title')).toHaveText(NAME);
  await expect(page.locator('.brand-mark')).toHaveText('입');
  await expect(page).toHaveTitle(NAME);
  await expect(page.locator('.eyebrow')).toHaveText('5·6학년 수학 · 전개도와 쌓기나무');
  await expect(page.locator('.lead')).toContainText('쌓기나무');
  await expect(page.getByRole('button', { name: '시작하기' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: '학년' })).toBeVisible();
  await expect(page.locator('.grade-card')).toHaveCount(2);
  await expect(page.locator('.area-card:not(.grade-card)')).toHaveCount(0); // 영역은 학년 화면에서 고른다
  for (const g of GRADES) {
    const c = gradeCard(page, g.grade);
    await expect(c.locator('.area-title')).toHaveText(g.title);
    await expect(c.locator('.area-line')).toHaveText(g.note); // 사용자가 준 문장 그대로
    await expect(c.locator('.area-meta .chip')).toHaveText([`별 0 / ${g.max}`]);
    await expect(c.locator('.area-art svg')).toHaveCount(1);
    await expect(c.locator('.area-art')).toHaveAttribute('aria-hidden', 'true');
    await expect(c).toBeEnabled();
  }
  // 화면 읽기 이름: "5학년, 정육면체, 직육면체 전개도 탐구, 모은 별 0 / 24, 여기부터"
  await expect(gradeCard(page, 5)).toHaveAccessibleName(gradeName(grade(5), 0, true));
  await expect(gradeCard(page, 6)).toHaveAccessibleName(gradeName(grade(6), 0, false));
  // "여기부터!": 처음이면 첫 학년 — 깃발 글자 + 파랑 테두리(색만이 아니라 글자로도)
  await expect(page.locator('.grade-cards .flag')).toHaveCount(1);
  await expect(page.locator('.grade-cards > li').nth(0).locator('.flag')).toHaveText('여기부터!');
  await expect(gradeCard(page, 5)).toHaveClass(/is-now/);
  // 내 공방 카드는 게임 하나에 하나(모든 학년·영역의 별·도감·도장)
  await expect(page.locator('.workshop-meta .chip').first()).toHaveText(`별 0 / ${grade(5).max + grade(6).max}`);
  await expect(page.locator('.workshop-meta')).toContainText('도감 0 / 11');
  await expect(page.locator('.hero-more .btn')).toHaveText(['놀이 방법', '학습 기록']);
  expect(errors).toEqual([]);
});

test('학년 화면: 학년 이름·설명·그 학년의 모은 별과 영역 카드. 6학년은 각기둥·원기둥이 "준비 중"(누를 수 없음, 자물쇠 + 글자), 쌓기나무에 "여기부터!". [← 학년 고르기]로 돌아간다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  for (const g of GRADES) {
    await gradeCard(page, g.grade).click();
    await expect(page.getByRole('heading', { level: 2, name: g.title })).toBeFocused();
    await expect(page.locator('.grade-note')).toHaveText(g.note);
    await expect(page.locator('.grade-guide')).toHaveText('공부할 영역을 골라요.');
    await expect(page.locator('.screen-grade .star-total')).toHaveText(`모은 별 0 / ${g.max}`);
    expect(await page.locator('.screen-grade .area-card').evaluateAll((els) => els.map((el) => el.dataset.area))).toEqual(g.areas.map((a) => a.id));
    const first = g.areas.find((a) => a.ready);
    for (const a of g.areas) {
      const c = card(page, a.id);
      await expect(c).toHaveAccessibleName(areaName(a, 0, a === first));
      await expect(c.locator('.area-title')).toHaveText(a.title);
      await expect(c.locator('.area-line')).toHaveText(a.line);
      await expect(c.locator('.area-art svg')).toHaveCount(1);
      if (a.ready) {
        await expect(c).toBeEnabled();
        await expect(c.locator('.area-meta .chip')).toHaveText([`차시 ${a.lessons.length}개`, `별 0 / ${a.max}`]);
      } else {
        await expect(c).toBeDisabled();
        await expect(c).toHaveClass(/is-soon/);
        await expect(c.locator('.area-meta .chip')).toHaveText(['준비 중']);
        await expect(c.locator('.chip-soon svg')).toHaveCount(1); // 자물쇠 그림
      }
    }
    await expect(page.locator('.screen-grade .flag')).toHaveCount(1);
    await expect(card(page, first.id)).toHaveClass(/is-now/);
    await page.getByRole('button', { name: '← 학년 고르기' }).click();
    await expect(page.locator('.grade-card')).toHaveCount(2);
  }
  // 준비 중 카드는 눌러도 아무 일이 없다
  await gradeCard(page, 6).click();
  await card(page, 'prism').click({ force: true });
  await expect(page.locator('.screen-grade')).toBeVisible();
  expect(errors).toEqual([]);
});

test('영역 → 단계 지도: 영역 탭은 같은 학년의 열린 영역만, 그 영역의 차시만, 차시 칩은 영역 안의 차례 "1차시"…, 모은 별·도감 칩은 그 영역의 것. [← 영역 고르기]·[처음 화면]', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await openArea(page, 'blocks');
  await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
  // 6학년: 열린 영역은 쌓기나무 하나(각기둥·원기둥은 준비 중이라 탭이 없다)
  await expect(page.getByRole('tablist', { name: '영역' }).getByRole('tab')).toHaveText(['쌓기나무']);
  const panel = page.getByRole('tabpanel');
  await expect(panel).toHaveAttribute('aria-labelledby', 'area-tab-blocks');
  await expect(panel).toHaveAccessibleName('쌓기나무');
  const blocks = area('blocks');
  expect(await page.locator('.lesson-group').evaluateAll((els) => els.map((el) => el.dataset.lesson))).toEqual(blocks.lessons);
  await expect(page.locator('.lesson-no')).toHaveText(blocks.lessons.map((_, i) => `${i + 1}차시`));
  for (const lesson of BLOCK_LESSONS) {
    const group = page.locator(`.lesson-group[data-lesson="${lesson.id}"]`);
    await expect(group.locator('h3')).toHaveText(lesson.title);
    await expect(group.locator('.lesson-note')).toHaveText('6학년 2학기 · 공간과 입체');
    await expect(group.locator('.lesson-chips .chip')).toHaveText([`약 ${lesson.minutes}분`]);
    await expect(group.locator('.stage-card').nth(0)).toBeEnabled(); // 차시마다 첫 단계가 열려 있다
  }
  await expect(page.locator('.star-total')).toHaveText(`모은 별 0 / ${blocks.max}`);
  await expect(page.locator('.collection-chip')).toHaveCount(0); // 쌓기나무 영역에는 도감이 없다
  await expect(page.getByText('정육면체의 전개도')).toHaveCount(0);
  await expect(page.locator('.screen-stages .actions .btn:not([hidden])')).toHaveText(['← 영역 고르기', '처음 화면', '놀이 방법']);
  await page.getByRole('button', { name: '← 영역 고르기' }).click();
  await expect(page.getByRole('heading', { level: 2, name: '6학년' })).toBeVisible();

  // 5학년: 정육면체·직육면체 두 탭, 도감·노트 칩은 정육면체 차시 머리에
  await page.getByRole('button', { name: '← 학년 고르기' }).click();
  await openArea(page, 'cube');
  await expect(page.getByRole('tab')).toHaveText(['정육면체의 전개도', '직육면체의 전개도']);
  expect(await page.locator('.lesson-group').evaluateAll((els) => els.map((el) => el.dataset.lesson))).toEqual(['cube']);
  await expect(page.locator('.lesson-no')).toHaveText(['1차시']);
  await expect(page.locator('.lesson-group[data-lesson="cube"] .collection-chip')).toHaveText(['도감 0 / 11', '노트 0 / 24']);
  await expect(page.locator('.lesson-group[data-lesson="cube"] .challenge-card')).toHaveCount(2);
  await expect(page.locator('.head-chips .collection-chip')).toHaveCount(0);
  await expect(page.locator('.star-total')).toHaveText(`모은 별 0 / ${area('cube').max}`);
  await page.getByRole('tab', { name: '직육면체의 전개도' }).click();
  await expect(page.getByRole('tab', { name: '직육면체의 전개도' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: '정육면체의 전개도' })).toHaveAttribute('aria-selected', 'false');
  expect(await page.locator('.lesson-group').evaluateAll((els) => els.map((el) => el.dataset.lesson))).toEqual(['cuboid']);
  await expect(page.locator('.lesson-no')).toHaveText(['1차시']); // 영역 안의 차례 (차시 묶음 전체의 "2차시"가 아니라)
  await expect(page.locator('.collection-chip')).toHaveCount(0);
  await expect(page.locator('.star-total')).toHaveText(`모은 별 0 / ${area('cuboid').max}`);
  await expect(panel).toHaveAccessibleName('직육면체의 전개도');
  await page.getByRole('button', { name: '처음 화면' }).click();
  await expect(page.locator('.grade-card')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('영역 탭 키보드: 지금 영역 탭 하나만 Tab으로 들어가고(나머지 tabindex -1), ←·→·Home·End로 옮기면 그 영역이 보이며 초점이 따라간다. Tab은 차시의 단계 카드로', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=cube'));
  await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeFocused();
  await expect(tab(page, 'cube')).toHaveAttribute('tabindex', '0');
  await expect(tab(page, 'cuboid')).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('Tab');
  await expect(tab(page, 'cube')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'cuboid')).toBeFocused();
  await expect(tab(page, 'cuboid')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.lesson-group').first()).toHaveAttribute('data-lesson', 'cuboid');
  await page.keyboard.press('ArrowRight'); // 끝에서 처음으로 돈다
  await expect(tab(page, 'cube')).toBeFocused();
  await expect(page.locator('.lesson-group').first()).toHaveAttribute('data-lesson', 'cube');
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'cuboid')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab(page, 'cube')).toBeFocused();
  await page.keyboard.press('End');
  await expect(tab(page, 'cuboid')).toBeFocused();
  await expect(tab(page, 'cuboid')).toHaveAttribute('tabindex', '0');
  await expect(tab(page, 'cube')).toHaveAttribute('tabindex', '-1');
  // Tab: 탭 목록을 나와 그 영역의 첫 단계 카드로(다른 탭은 건너뛴다)
  await page.keyboard.press('Tab');
  await expect(page.locator('.lesson-group[data-lesson="cuboid"] .stage-card').first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(tab(page, 'cuboid')).toBeFocused();
});

test('키보드만으로 한 바퀴: 학년 고르기 → 영역 고르기 → 단계 시작 → 돌아오면 그 영역의 지도 → [← 영역 고르기] → [← 학년 고르기] → 다른 학년의 영역 → 탭으로 옆 영역 → 단계 시작 → 처음 화면의 "여기부터!"', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  /** Tab을 눌러 조건에 맞는 요소에 초점이 갈 때까지 (최대 n번) */
  async function tabTo(selector, n = 12) {
    for (let i = 0; i < n; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate((sel) => document.activeElement?.matches(sel), selector)) return;
    }
    throw new Error(`${selector}에 Tab으로 가지 못했어요 (지금 초점: ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))})`);
  }
  await tabTo('.grade-card[data-grade="6"]');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: '6학년' })).toBeFocused();
  await tabTo('.area-card:not([disabled])'); // 준비 중(각기둥)은 Tab이 건너뛴다
  await expect(card(page, 'blocks')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  await tabTo('.lesson-group .stage-card');
  await page.keyboard.press('Enter');
  await expect(page.locator('.play-title')).toHaveText(BLOCK_STAGES.find((s) => s.lesson === area('blocks').lessons[0]).title);
  await page.keyboard.press('Shift+Tab'); // [← 단계 선택]은 제목 앞에 있다
  await expect(page.getByRole('button', { name: '← 단계 선택' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true'); // 그 차시가 든 영역의 지도
  await tabTo('.screen-stages .actions .btn', 40);
  await expect(page.getByRole('button', { name: '← 영역 고르기' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: '6학년' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: '← 학년 고르기' })).toBeFocused();
  await page.keyboard.press('Enter');
  await tabTo('.grade-card[data-grade="5"]');
  await page.keyboard.press('Enter');
  await tabTo('.area-card[data-area="cuboid"]');
  await page.keyboard.press('Enter');
  await expect(tab(page, 'cuboid')).toHaveAttribute('aria-selected', 'true');
  await tabTo('.area-tab');
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'cube')).toHaveAttribute('aria-selected', 'true');
  await tabTo('.lesson-group .stage-card');
  await page.keyboard.press('Enter');
  await expect(page.locator('.play-title')).toHaveText(STAGES.find((s) => s.lesson === 'cube').title);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(tab(page, 'cube')).toHaveAttribute('aria-selected', 'true');
  await tabTo('.screen-stages .actions .btn', 40);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '처음 화면' })).toBeFocused();
  await page.keyboard.press('Enter');
  // 방금 단계를 시작한 영역(정육면체)의 학년에 "여기부터!", 그 학년 화면에서는 그 영역에
  await expect(gradeCard(page, 5)).toHaveAccessibleName(gradeName(grade(5), 0, true));
  await expect(gradeCard(page, 6)).toHaveAccessibleName(gradeName(grade(6), 0, false));
  expect(errors).toEqual([]);
});

test('지난번에 하던 학년·영역: 단계를 시작한 영역(과 그 학년)에 "여기부터!", 새로 열어도 그대로(저장 값 area 하나만 더함). 엉뚱한 값·기록 모두 지우기 뒤에는 첫 학년·첫 영역', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  const keys = async () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('edu:net-workshop:')).sort());
  const before = await keys();
  await openArea(page, 'blocks');
  expect(await page.evaluate(() => localStorage.getItem('edu:net-workshop:area'))).toBeNull(); // 고르기만 해서는 바뀌지 않는다
  await page.locator('.lesson-group .stage-card').first().click();
  await expect(page.locator('.play-area')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('edu:net-workshop:area'))).toBe('"blocks"');
  expect((await keys()).filter((k) => !before.includes(k))).toEqual(['edu:net-workshop:area']);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(gradeCard(page, 6)).toHaveClass(/is-now/);
  await expect(gradeCard(page, 5)).not.toHaveClass(/is-now/);
  await expect(page.locator('.grade-cards > li').nth(1).locator('.flag')).toHaveText('여기부터!');
  await gradeCard(page, 6).click();
  await expect(card(page, 'blocks')).toHaveClass(/is-now/);
  // ?lesson=으로 한 차시만 열어 단계를 해도 그 영역을 기억한다(직육면체 → 5학년, 그 학년 화면에서는 직육면체)
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&lesson=cuboid'));
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.locator('.stage-card').first().click();
  await expect(page.locator('.play-area')).toBeVisible();
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(gradeCard(page, 5)).toHaveClass(/is-now/);
  await gradeCard(page, 5).click();
  await expect(card(page, 'cuboid')).toHaveClass(/is-now/);
  await expect(card(page, 'cube')).not.toHaveClass(/is-now/);
  // 저장 값이 엉뚱하면(준비 중·없는 영역·깨진 값) 첫 학년·첫 영역
  for (const raw of ['"prism"', '"zzz"', '{bad', '3', '"net5"']) {
    await page.evaluate((v) => localStorage.setItem('edu:net-workshop:area', v), raw);
    await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
    await expect(gradeCard(page, 5)).toHaveClass(/is-now/);
    await gradeCard(page, 5).click();
    await expect(card(page, 'cube')).toHaveClass(/is-now/);
  }
  // 기록 모두 지우기: 다음 학생은 첫 학년부터
  await page.evaluate(() => localStorage.setItem('edu:net-workshop:area', '"blocks"'));
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await page.getByRole('button', { name: '학습 기록' }).click();
  await page.getByRole('button', { name: '기록 모두 지우기' }).click();
  await page.getByRole('button', { name: '한 번 더 누르면 지워져요' }).click();
  expect(await page.evaluate(() => localStorage.getItem('edu:net-workshop:area'))).toBeNull();
  await page.getByRole('button', { name: '처음 화면' }).click();
  await expect(gradeCard(page, 5)).toHaveClass(/is-now/);
  expect(errors).toEqual([]);
});

test('옛 저장 값(학년·영역이 없던 때의 기록)으로 열어도 별·점수·칭호·도감·도장·학습 기록이 그대로 보이고, 학년·영역 카드의 별은 그 학년·영역 단계의 합이다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  // 사이트(영역이 생기기 전)에서 쌓은 것과 같은 모양의 값 — 열쇠·모양은 그대로, "area" 값은 없다
  const STARS = { 'cube-judge': 3, 'cube-opposite': 2, 'cuboid-edge': 1, 'blocks-play': 3, 'blocks-copy': 2, 'cube-dice': 3 };
  await page.evaluate((stars) => {
    localStorage.clear();
    const set = (k, v) => localStorage.setItem(`edu:net-workshop:${k}`, JSON.stringify(v));
    set('stars', stars);
    set('rewards', { v: 1, xp: 112, badges: { 'first-step': { at: 1760000000000 }, 'beyond-cross': { at: 1760000000001 } }, counters: { bounce: 1, retryFix: 0, explain: 2, inspect: 0, discover: 3 }, best: {}, rank: '접기 장인' });
    set('collections', { 'cube-nets': { '1-4-1a': { at: 1, stage: 'cube-free' }, '2-3-1a': { at: 2, stage: 'cube-free' } }, 'cube-non-nets': {} });
    set('log', [{ stageId: 'cube-judge', stageTitle: '접힐까, 안 접힐까?', startedAt: 1760000000000, durationMs: 61000, attempts: 5, correct: 5, accuracy: 1, stars: 3, cleared: true, answers: [] },
      { stageId: 'blocks-play', stageTitle: '쌓기 놀이터', startedAt: 1760000100000, durationMs: 90000, attempts: 0, correct: 0, accuracy: null, stars: 3, cleared: true, answers: [] }]);
  }, STARS);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  // 내 공방 카드: 게임 하나에 하나 — 일반 단계의 별 합(도전 주문서 별은 빼는 엔진 규칙 그대로), 칭호, 도감, 도장
  await expect(page.locator('.rank-chip')).toContainText('접기 장인'); // 112점: 셋째 칭호(100점부터)
  await expect(page.locator('.rank-chip small')).toHaveText('112점');
  await expect(page.locator('.workshop-meta .chip')).toHaveText([`별 11 / ${grade(5).max + grade(6).max}`, '도감 2 / 11', '도장 2 / 12']);
  // 학년 카드의 별: 5학년 3 + 2 + 1, 6학년 3 + 2. "지난번 영역" 값이 없으니 첫 학년에 "여기부터!"
  await expect(gradeCard(page, 5)).toHaveAccessibleName(gradeName(grade(5), 6, true));
  await expect(gradeCard(page, 6)).toHaveAccessibleName(gradeName(grade(6), 5, false));
  await gradeCard(page, 5).click();
  await expect(page.locator('.screen-grade .star-total')).toHaveText(`모은 별 6 / ${grade(5).max}`);
  await expect(card(page, 'cube')).toHaveAccessibleName(areaName(area('cube'), 5, true));
  await expect(card(page, 'cuboid')).toHaveAccessibleName(areaName(area('cuboid'), 1, false));
  await card(page, 'cube').click();
  await expect(page.locator('.star-total')).toHaveText(`모은 별 5 / ${area('cube').max}`);
  await expect(page.locator('.lesson-group[data-lesson="cube"] .collection-chip')).toHaveText(['도감 2 / 11', '노트 0 / 24']);
  await expect(page.locator('.lesson-group[data-lesson="cube"] .stage-card').nth(2)).toBeEnabled(); // 마친 단계 다음이 열려 있다
  await expect(page.locator('.lesson-group[data-lesson="cube"] .stage-card').nth(3)).toBeDisabled();
  await page.getByRole('button', { name: '처음 화면' }).click();
  await gradeCard(page, 6).click();
  await expect(card(page, 'blocks')).toHaveAccessibleName(areaName(area('blocks'), 5, true));
  await page.getByRole('button', { name: '← 학년 고르기' }).click();
  await page.getByRole('button', { name: '학습 기록' }).click();
  await expect(page.locator('.report-table tbody tr')).toHaveCount(2);
  await expect(page.locator('.tile', { hasText: '칭호·솜씨 점수' })).toContainText('접기 장인 112점');
  await expect(page.locator('.tile', { hasText: '모은 별' })).toContainText(`11 / ${grade(5).max + grade(6).max}`);
  await expect(page.locator('.badge-item.is-earned')).toHaveCount(2);
  await expect(page.locator('.btn-collection')).toHaveText('전개도 도감 2 / 11 ㆍ 노트 0 / 24');
  // 저장 값은 하나도 바뀌지 않았다 (열기만 했다)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:stars')))).toEqual(STARS);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards')).xp)).toBe(112);
  expect(await page.evaluate(() => localStorage.getItem('edu:net-workshop:area'))).toBeNull();
  expect(errors).toEqual([]);
});

test('주소: ?grade=는 그 학년 화면, ?area=는 그 영역의 단계 지도. ?lesson= > ?area= > ?grade=, ?stage=는 그 단계로. 없는·준비 중인 것은 다음 차례(없으면 처음 화면)', async ({ page }) => {
  const errors = collectErrors(page);
  for (const g of GRADES) {
    await page.goto(fileUrl(FILE, `?seed=1&sound=off&grade=${g.grade}`));
    await expect(page.getByRole('heading', { level: 2, name: g.title })).toBeVisible();
  }
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=blocks'));
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.lesson-group')).toHaveCount(area('blocks').lessons.length);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=cuboid&grade=6')); // ?area=가 ?grade=보다 먼저
  await expect(tab(page, 'cuboid')).toHaveAttribute('aria-selected', 'true');
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=prism&grade=6')); // 준비 중인 영역 → 다음 차례 ?grade=
  await expect(page.getByRole('heading', { level: 2, name: '6학년' })).toBeVisible();
  for (const bad of ['area=prism', 'area=zzz', 'grade=7', 'grade=x', 'grade=', 'area=net5']) {
    await page.goto(fileUrl(FILE, `?seed=1&sound=off&${bad}`));
    await expect(page.locator('h1')).toHaveText(NAME);
    await expect(page.locator('.grade-card')).toHaveCount(2);
  }
  // ?lesson=이 가장 세다: 그 차시만, 학년·영역 카드·탭 없음
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&grade=6&area=blocks&lesson=cube'));
  await expect(page.locator('.eyebrow')).toHaveText('정육면체의 전개도');
  await expect(page.locator('.area-card')).toHaveCount(0);
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.locator('.lesson-group h3')).toHaveText(['정육면체의 전개도']);
  // ?stage=가 있으면 그 단계로 바로, 돌아오면 그 단계가 든 영역의 지도
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&unlock=all&grade=5&area=cube&stage=blocks-copy'));
  await expect(page.locator('.play-title')).toHaveText(BLOCK_STAGES.find((s) => s.id === 'blocks-copy').title);
  await page.getByRole('button', { name: '← 단계 선택' }).click();
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('한 차시 주소(?lesson=)는 지금처럼 그 차시만: 학년·영역 카드·탭 없이 [시작하기], 차시 칩은 1차시·2차시·쌓기나무 1차시…, 놀이 방법은 그 영역의 줄만', async ({ page }) => {
  const errors = collectErrors(page);
  const cases = [
    { lesson: 'cube', chip: '1차시', howTo: 'cube' },
    { lesson: 'cuboid', chip: '2차시', howTo: 'cuboid' },
    ...BLOCK_LESSONS.map((l) => ({ lesson: l.id, chip: l.chip ?? null, howTo: 'blocks' })),
  ];
  for (const c of cases) {
    await page.goto(fileUrl(FILE, `?seed=1&sound=off&lesson=${c.lesson}`));
    await expect(page.locator('h1')).toHaveText(NAME);
    await expect(page.locator('.area-card')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible();
    await page.getByRole('button', { name: '놀이 방법' }).click();
    const lines = await howToLines(page);
    if (c.howTo === 'blocks') {
      expect(lines).toEqual(BLOCK_HOW_TO);
      expect(lines.join(' '), c.lesson).not.toContain('전개도'); // 쌓기나무 차시 주소에 전개도 줄이 없다
    } else {
      expect(lines[0]).toBe(CUBE_HOW_TO_FIRST);
      expect(lines.join(' '), c.lesson).not.toContain('쌓기나무'); // S1b-5: 전개도 차시 주소에 쌓기나무 줄이 없다
      if (c.howTo === 'cube') expect(lines).toHaveLength(6);
      else expect(lines.join(' ')).not.toMatch(/도감|도전 주문서/); // 직육면체 차시에는 도감·도전 주문서가 없다
    }
    await page.getByRole('button', { name: '시작하기' }).click();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(page.locator('.lesson-group')).toHaveCount(1);
    if (c.chip) await expect(page.locator('.lesson-no')).toHaveText(c.chip);
  }
  expect(errors).toEqual([]);
});

test('놀이 방법: 처음 화면(학년·영역을 고르기 전)은 공통 몇 줄, 영역의 단계 지도에서는 그 영역의 줄과 [단계 선택](그 영역의 지도로)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await page.getByRole('button', { name: '놀이 방법' }).click();
  const common = await howToLines(page);
  expect(common.length).toBeGreaterThanOrEqual(3);
  expect(common.length).toBeLessThanOrEqual(6);
  expect(common[0]).toContain('학년');
  expect(common).not.toContain(CUBE_HOW_TO_FIRST);
  for (const line of BLOCK_HOW_TO) expect(common).not.toContain(line);
  await expect(page.locator('.screen-howto .actions .btn')).toHaveText(['처음 화면']); // 학년·영역은 처음 화면의 카드로 고른다
  await page.getByRole('button', { name: '처음 화면' }).click();
  for (const a of AREAS.filter((x) => x.ready)) {
    await openArea(page, a.id);
    await page.getByRole('button', { name: '놀이 방법' }).click();
    const lines = await howToLines(page);
    if (a.id === 'blocks') expect(lines).toEqual(BLOCK_HOW_TO);
    else {
      expect(lines[0]).toBe(CUBE_HOW_TO_FIRST);
      expect(lines.join(' ')).not.toContain('쌓기나무');
      if (a.id === 'cuboid') expect(lines.join(' ')).not.toMatch(/도감|도전 주문서/);
      else expect(lines.join(' ')).toContain('도전 주문서');
    }
    await expect(page.locator('.screen-howto .actions .btn')).toHaveText(['단계 선택', '처음 화면']);
    await page.getByRole('button', { name: '단계 선택' }).click();
    await expect(tab(page, a.id)).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: '처음 화면' }).click();
  }
  expect(errors).toEqual([]);
});

/** 화면의 크기 검사: 가로 스크롤 0, 누를 것 48px 이상(보이는 것, 준비 중 카드 포함), 카드·탭이 화면 안, 카드 안의 글자·칩이 카드 밖으로 넘치지 않는다 */
async function layoutOf(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const press = [...document.querySelectorAll('.area-card, .area-tab, .screen .btn, .stage-card')].filter((el) => el.getClientRects().length > 0 && !el.closest('[hidden]'));
    const small = press.map((el) => ({ el: el.className + (el.dataset.area ? `[${el.dataset.area}]` : ''), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 47.5 || r.width < 47.5).map(({ el, r }) => `${el} ${r.width.toFixed(1)}×${r.height.toFixed(1)}`);
    const outside = [...document.querySelectorAll('.area-card, .area-tab, .area-meta .chip, .hero-more .btn, .btn-back')].map((el) => el.getBoundingClientRect())
      .filter((r) => r.left < -0.5 || r.right > innerWidth + 0.5).length;
    const spill = [...document.querySelectorAll('.area-card')].flatMap((c) => {
      const box = c.getBoundingClientRect();
      return [...c.querySelectorAll('.area-title, .area-line, .area-meta .chip, .area-art')].map((el) => el.getBoundingClientRect())
        .filter((r) => r.right > box.right + 0.5 || r.bottom > box.bottom + 0.5 || r.left < box.left - 0.5);
    }).length;
    return { hScroll: doc.scrollWidth - doc.clientWidth, vScroll: doc.scrollHeight - innerHeight, small, outside, spill };
  });
}

test('배치(네 크기): 처음 화면·두 학년 화면·영역의 단계 지도에 가로 스크롤 0, 크롬북(1366×768·1366×680)과 태블릿은 처음 화면·학년 화면 세로 스크롤 0, 누를 것 48px, 카드 넘침 0', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '네 크기를 한 번에 잰다');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  for (const [w, hgt] of [[1366, 768], [1366, 680], [820, 1180], [390, 844]]) {
    const check = (m, what, { vertical = false } = {}) => {
      expect(m.hScroll, `${w}×${hgt} ${what} 가로`).toBeLessThanOrEqual(0);
      if (vertical && w > 560) expect(m.vScroll, `${w}×${hgt} ${what} 세로`).toBeLessThanOrEqual(0);
      expect(m.small, `${w}×${hgt} ${what}`).toEqual([]);
      expect(m.outside, `${w}×${hgt} ${what} 화면 밖`).toBe(0);
      expect(m.spill, `${w}×${hgt} ${what} 카드 넘침`).toBe(0);
    };
    await page.setViewportSize({ width: w, height: hgt });
    await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
    await expect(page.locator('.grade-card')).toHaveCount(2);
    await settled(page);
    check(await layoutOf(page), '처음 화면', { vertical: true });
    const cards = await page.locator('.grade-card').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ bottom: r.bottom, h: r.height })));
    if (w > 560) for (const c of cards) expect(c.bottom).toBeLessThanOrEqual(hgt);
    if (w > 900) expect(Math.abs(cards[0].h - cards[1].h)).toBeLessThan(1);
    for (const g of GRADES) {
      await page.goto(fileUrl(FILE, `?seed=1&sound=off&grade=${g.grade}`));
      await expect(page.locator('.screen-grade .area-card')).toHaveCount(g.areas.length);
      await settled(page);
      check(await layoutOf(page), `${g.title} 화면`, { vertical: true });
      // 한 학년의 영역 카드는 넓은 화면에서 한 줄, 높이가 같다
      const rows = await page.locator('.screen-grade .area-card').evaluateAll((els) => els.map((el) => ({ top: el.offsetTop, h: el.getBoundingClientRect().height })));
      if (w > 900) {
        expect(new Set(rows.map((r) => r.top)).size, `${w}×${hgt} ${g.title} 한 줄`).toBe(1);
        expect(Math.max(...rows.map((r) => r.h)) - Math.min(...rows.map((r) => r.h))).toBeLessThan(1);
      }
    }
    for (const a of AREAS.filter((x) => x.ready)) {
      await page.goto(fileUrl(FILE, `?seed=1&sound=off&area=${a.id}`));
      await expect(tab(page, a.id)).toHaveAttribute('aria-selected', 'true');
      await settled(page);
      check(await layoutOf(page), `${a.id} 지도`);
      // 지금 탭은 눌린 키(내려앉음) — 같은 학년의 다른 탭과 색만이 아니라 자리·그림자도 다르다. 탭은 한 줄
      const tabs = await page.locator('.area-tab').evaluateAll((els) => els.map((el) => {
        const s = getComputedStyle(el);
        return { top: el.offsetTop, current: el.getAttribute('aria-selected') === 'true', shadow: s.boxShadow, transform: s.transform };
      }));
      if (tabs.length > 1) {
        if (w > 560) expect(new Set(tabs.map((t) => t.top)).size, `${w}×${hgt} 탭 한 줄`).toBe(1);
        const on = tabs.find((t) => t.current);
        const off = tabs.find((t) => !t.current);
        expect(on.shadow).not.toBe(off.shadow);
        expect(on.transform).not.toBe(off.transform);
      }
    }
  }
  expect(errors).toEqual([]);
});

test('대비 4.5:1: 학년 카드·영역 카드(준비 중 포함)의 이름·한 줄·칩, 영역 탭(지금·다른 탭)의 글자, 학년 화면의 설명', async ({ page }) => {
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
  const expectAll = async (sel, n) => {
    const ratios = await contrastOf(sel);
    expect(ratios.length, sel).toBeGreaterThanOrEqual(n);
    for (const ratio of ratios) expect(ratio, sel).toBeGreaterThanOrEqual(4.5);
  };
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(page.locator('.grade-card')).toHaveCount(2);
  await settled(page);
  for (const sel of ['.grade-card .area-title', '.grade-card .area-line', '.grade-card .area-meta .chip']) await expectAll(sel, 2);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&grade=6'));
  await expect(page.locator('.screen-grade .area-card')).toHaveCount(3);
  await settled(page);
  for (const sel of ['.area-card .area-title', '.area-card .area-line', '.area-meta .chip', '.grade-note', '.grade-guide']) await expectAll(sel, 1);
  await expectAll('.area-card.is-soon .chip-soon', 2); // 준비 중 카드(회색 종이)의 글자도
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=cube'));
  await expect(tab(page, 'cube')).toHaveAttribute('aria-selected', 'true');
  await settled(page);
  await expectAll('.area-tab', 2);
});

test('움직임 줄이기 · ?fx=low: 처음 화면·학년 화면·영역의 단계 지도가 끝 상태로 바로 보인다(움직임 줄이기는 누를 때의 들뜸도 없음, ?fx=low는 화면 들어오기 움직임 없음)', async ({ page }) => {
  // 움직임 줄이기: 0.001초보다 긴 움직임(애니메이션·전환)이 하나도 돌지 않는다
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const longRunning = () => page.evaluate(() => document.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && Number(a.effect?.getComputedTiming().duration) > 1).length);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(page.locator('.grade-card')).toHaveCount(2);
  expect(await longRunning()).toBe(0);
  await gradeCard(page, 5).click();
  expect(await longRunning()).toBe(0);
  await card(page, 'cube').click();
  expect(await longRunning()).toBe(0);
  await tab(page, 'cuboid').click();
  await expect(tab(page, 'cuboid')).toHaveAttribute('aria-selected', 'true');
  expect(await longRunning()).toBe(0);
  // ?fx=low (움직임 줄이기 없이): 화면 들어오기 움직임(CSS 애니메이션)이 없다 — 엔진이 다른 화면에 하는 것과 같다
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const cssAnimations = () => page.evaluate(() => document.getAnimations({ subtree: true }).filter((a) => a.constructor.name === 'CSSAnimation' && a.playState === 'running').length);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&fx=low'));
  await expect(page.locator('#app')).toHaveClass(/fx-low/);
  await expect(page.locator('.grade-card')).toHaveCount(2);
  expect(await cssAnimations()).toBe(0);
  await gradeCard(page, 6).click();
  expect(await cssAnimations()).toBe(0);
  await card(page, 'blocks').click();
  await expect(tab(page, 'blocks')).toHaveAttribute('aria-selected', 'true');
  expect(await cssAnimations()).toBe(0);
});

test('터치(태블릿): 학년 카드 → 영역 카드를 눌러 단계 지도로, 탭을 눌러 같은 학년의 다른 영역으로, 단계 시작', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', '터치는 태블릿에서');
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await gradeCard(page, 5).tap();
  await card(page, 'cuboid').tap();
  await expect(tab(page, 'cuboid')).toHaveAttribute('aria-selected', 'true');
  await tab(page, 'cube').tap();
  await expect(tab(page, 'cube')).toHaveAttribute('aria-selected', 'true');
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

// ── 사용자 결정 (2026-10-16, spec.md 16-15): 크기형 도움말에 "펴서" · 2가지일 때 놓는 판의 [결과 보기]는 보통 버튼 ──
const stageUrl = (id, seed = '1') => fileUrl(FILE, `?unlock=all&seed=${seed}&sound=off&stage=${id}`);
const judgeQuestions = (seed) => makeQuestions(STAGES.find((s) => s.id === 'cuboid-judge'), createRng(`${seed}:cuboid-judge`));
const folded = (page) => expect(page.locator('.fold-stage')).toHaveAttribute('data-fold', 'done');

test('길이까지 살펴요(크기형): 틀리면 살펴볼 거리가 "펴서 마주 보는 두 면에 적힌 길이를 견줘 봐요." — 다른 종류의 살펴볼 거리는 그대로', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  const seed = ['1', '2', '3', '4', '5'].find((x) => judgeQuestions(x).some((q) => q.intended === 'pair'));
  await page.goto(stageUrl('cuboid-judge', seed));
  const seen = new Set();
  for (const q of judgeQuestions(seed)) {
    await page.locator(`.answer-btn:not([data-answer="${q.expected}"])`).click(); // 틀린 답 → 바로 까닭과 살펴볼 거리
    await folded(page);
    await expect(page.locator('.reason.is-wrong')).toBeVisible();
    const tip = page.locator('.reason .note-tip');
    if (q.intended === 'pair') await expect(tip).toHaveText('펴서 마주 보는 두 면에 적힌 길이를 견줘 봐요.');
    else if (q.intended === 'length') await expect(tip).toHaveText('같은 무늬로 표시한 두 변에 적힌 길이를 견줘 봐요.');
    else if (q.intended === 'overlap') await expect(tip).toHaveText('빗금 친 면과 점선(비어요)을 찾아보고, 돌려 보기로 빈 자리를 확인해요.');
    else await expect(tip).toHaveCount(0);
    seen.add(q.intended ?? 'valid');
    await page.locator('.next-btn').click();
  }
  expect(seen.has('pair')).toBe(true);
  expect(errors).toEqual([]);
});

/** 정육면체 놓는 판: 모양을 판 가운데에 놓고 [접어 보기] (안 되는 모양이 아니므로 까닭 고르기 없음) */
const CUBE_SHAPES = {
  cross: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]],
  n231: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [1, 2]],
  n33: [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [4, 1]],
};
async function foldCube(page, name) {
  const board = page.viewportSize().width <= 560 ? BOARD_SIZES.phone : BOARD_SIZES.wide;
  for (const [x, y] of centerOnBoard(CUBE_SHAPES[name], board)) await page.locator(`.free-board .cell[data-cell="${x},${y}"]`).click();
  await page.locator('.free-fold').click();
  await folded(page);
}
const isPrimary = (locator) => locator.evaluate((el) => el.classList.contains('btn-primary'));

test('내 맘대로 전개도(정육면체): 2가지를 찾은 뒤 놓는 판의 [결과 보기]는 보통 버튼, 3가지부터 파란 주 버튼 — 접은 장면의 버튼·결과는 그대로', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(stageUrl('cube-free'));
  await foldCube(page, 'cross');
  await page.locator('.free-new').click();
  await foldCube(page, 'n231');
  // 접은 장면(2가지): [펴서 고치기]가 주 버튼, [결과 보기]는 보통 버튼 (지금까지와 같다)
  await expect(page.locator('.btn-trio .btn')).toHaveText(['펴서 고치기', '새로 만들기', '결과 보기']);
  expect(await isPrimary(page.locator('.free-fix'))).toBe(true);
  expect(await isPrimary(page.locator('.free-finish'))).toBe(false);
  // 놓는 판(2가지): 매트 띠의 [결과 보기]가 보통 버튼 — 파란 버튼은 [접어 보기] 하나
  await page.locator('.free-fix').click();
  await expect(page.locator('.tool-finish')).toBeVisible();
  expect(await isPrimary(page.locator('.tool-finish'))).toBe(false);
  await expect(page.locator('.tool-finish')).toHaveClass(/\bbtn\b/);
  // 셋째 전개도: 접은 장면은 [결과 보기]가 주 버튼(그대로), 놓는 판으로 돌아가면 매트 띠의 [결과 보기]도 주 버튼
  await page.locator('.tool-clear').click();
  await foldCube(page, 'n33');
  await expect(page.locator('.btn-pair .btn')).toHaveText(['결과 보기', '더 찾아보기']);
  expect(await isPrimary(page.locator('.free-finish'))).toBe(true);
  await page.locator('.free-more').click();
  await expect(page.locator('.tool-finish')).toBeVisible();
  expect(await isPrimary(page.locator('.tool-finish'))).toBe(true);
  await page.locator('.tool-finish').click();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  expect(errors).toEqual([]);
});

/** 직육면체 놓는 판: 전개도 번호의 면들을 판 가운데에 놓는다 (카드를 고르고 → 왼쪽 위 칸 → 방향이 다르면 두 번 눌러 돌림) */
function cuboidRects(id, board) {
  const left = FREE_CARDS.map((c) => ({ ...c }));
  return centerCuboid(transformNet(freeNets().find((n) => n.id === id).net, 0), board).map((r) => {
    const i = left.findIndex((c) => (c.w === r.w && c.h === r.h) || (c.w === r.h && c.h === r.w));
    const [cardDef] = left.splice(i, 1);
    return { ...r, label: cardDef.label };
  });
}
async function foldCuboid(page, id) {
  const board = page.viewportSize().width <= 560 ? CUBOID_BOARDS.phone : CUBOID_BOARDS.wide;
  const tileRect = (label) => page.locator(`.rect-tile[data-label="${label}"]`).evaluate((el) => ['x', 'y', 'w', 'h'].map((k) => Number(el.style.getPropertyValue(`--${k}`))));
  for (const r of cuboidRects(id, board)) {
    await page.locator(`.rect-card[data-label="${r.label}"]`).click();
    await page.locator(`.rect-board .cell[data-cell="${r.x},${r.y}"]`).click({ position: { x: 4, y: 4 } });
    if ((await tileRect(r.label))[2] !== r.w) {
      await page.locator(`.rect-tile[data-label="${r.label}"]`).click();
      await page.locator(`.rect-tile[data-label="${r.label}"]`).click();
    }
    expect(await tileRect(r.label), `${r.label} 면`).toEqual([r.x, r.y, r.w, r.h]);
  }
  await page.locator('.free-fold').click();
  await folded(page);
}

test('내 맘대로 직육면체 전개도: 2가지를 찾은 뒤 놓는 판의 [결과 보기]는 보통 버튼, 3가지부터 파란 주 버튼 — 접은 장면의 버튼·결과는 그대로', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const [a, b, c] = freeNets().map((n) => n.id);
  await page.goto(stageUrl('cuboid-free'));
  await foldCuboid(page, a);
  await page.locator('.free-new').click();
  await foldCuboid(page, b);
  await expect(page.locator('.goal-done')).toHaveText('전개도 2가지를 찾았어요! 한 가지 더 찾으면 별 3개예요.');
  expect(await isPrimary(page.locator('.free-fix'))).toBe(true);
  expect(await isPrimary(page.locator('.free-finish'))).toBe(false);
  await page.locator('.free-fix').click();
  await expect(page.locator('.tool-finish')).toBeVisible();
  expect(await isPrimary(page.locator('.tool-finish'))).toBe(false);
  await page.locator('.tool-clear').click();
  await expect(page.locator('.rect-tile')).toHaveCount(0);
  await foldCuboid(page, c);
  await expect(page.locator('.goal-done')).toHaveText('서로 다른 전개도 3가지를 찾았어요! 별 3개예요.');
  expect(await isPrimary(page.locator('.free-finish'))).toBe(true);
  await page.locator('.free-fix').click();
  await expect(page.locator('.tool-finish')).toBeVisible();
  expect(await isPrimary(page.locator('.tool-finish'))).toBe(true);
  await page.locator('.tool-finish').click();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  expect(errors).toEqual([]);
});
