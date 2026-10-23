/**
 * F1 쌓기나무 "자유 쌓기" — 브라우저 검사. 기획서: spec-grade6.md 15-18·15-19(결정 1~9), plan-rotate-free.md 5절, build-brief-f1.md
 * - 자리: 쌓기나무 영역 단계 지도의 1차시 위 넓은 카드(차시 번호·별·잠금·"여기부터!" 없음), 모은 별·차시 칩은 그대로, 한 차시 주소에는 없다
 * - 판: 크롬북·태블릿 14×14칸·10층, 휴대폰 6×6칸·6층. 처음 보기에서 판과 3층 높이가 무대에 꽉 차게
 * - 오른쪽 좁은 세로 띠(버튼 한 줄), [위에서 본 판]은 처음에 숨김 → 누르면 펼침(14×14 전체가 작은 칸으로 한눈에, 앞이 아래) → 다시 누르면 접힘(결정 7·8, 덧붙임 2)
 * - 펼쳐서 판이 가려지면 판 옮기기: 무대 가장자리 버튼 · Shift+방향키 · 두 손가락으로 함께 끌기. 접으면 처음 자리(결정 9)
 * - 저장: 판 크기마다 하나, 다시 들어오면 이어서, [모두 치우기]로 새로, 막힌 저장소에서도 오류 없이. 점수·별·학습 기록 없음
 * 정해진 시간으로 기다리지 않는다: 움직임이 끝난 것은 getAnimations로, 무대 그리기는 화면 프레임 두 번으로 본다.
 * 시간 예산(CPU 4·8·12배 흉내에서 잼): 12배에서 가장 긴 검사(여섯 크기 배치 — 끝까지 옮김·위ㆍ앞ㆍ옆 포함) 20.2초 → 예산 150초, 알림 장면 10.5초 → 120초,
 *   판 옮기기(크롬북) 5.1초 → 120초, 두 손가락(태블릿) 3.0초 → 120초, 펼친 채 창 크기·방향 바꾸기(F1b-1) 27.3초 → 180초, 가장 작은 칸의 "10"(F1b-2) 1.9초
 */
import { expect, test } from '@playwright/test';
import { BLOCK_LESSONS, BLOCK_STAGES } from '../../src/games/net-workshop/blocks/blocks-logic.js';
import { collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

const FILE = 'net-workshop.html';
/**
 * 처음 보기 맞춤의 한 변(F2 — 자유 쌓기 판에 원근, spec-grade6 15-27·15-28). 독립 계산: 눈은 판 가운데(높이 1.5층)에서 판의 긴 변 × 3칸,
 * 처음 보기(판 돌림 45°, 높이 35.26°)에서 판 n×n과 3층 상자의 꼭짓점 여덟을 원근으로 그린 범위 + 여백(높이 0.8·너비 0.6칸)이 무대에 꽉 차게
 */
function perspUnit(w, h, n) {
  const D = 3 * n;
  const c = Math.SQRT1_2;
  const s3 = 1 / Math.sqrt(3);
  const right = [c, c, 0];
  const v = [c * Math.sqrt(2 / 3), -c * Math.sqrt(2 / 3), s3];
  const down = [right[1] * v[2] - right[2] * v[1], right[2] * v[0] - right[0] * v[2], right[0] * v[1] - right[1] * v[0]];
  const pts = [];
  for (const x of [0, n]) for (const y of [0, n]) for (const z of [0, 3]) {
    const q = [x - n / 2, y - n / 2, z - 1.5];
    const dot = (a) => a[0] * q[0] + a[1] * q[1] + a[2] * q[2];
    const f = D / (D - dot(v));
    pts.push([f * dot(right), f * dot(down)]);
  }
  const ys = pts.map((p) => p[1]);
  const side = Math.max(...pts.map((p) => Math.abs(p[0])));
  return Math.max(8, Math.floor(Math.min(h / (Math.max(...ys) - Math.min(...ys) + 0.8), w / (2 * side + 0.6))));
}
const KEY14 = 'edu:net-workshop:free-14x14';
const KEY6 = 'edu:net-workshop:free-6x6';
const isTouch = (testInfo) => testInfo.project.name === 'tablet';
const press = (testInfo, locator) => (isTouch(testInfo) ? locator.tap() : locator.click());
const settled = (page) => page.waitForFunction(() => document.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));
const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function openFree(page, extra = '') {
  await page.goto(fileUrl(FILE, `?sound=off&stage=blocks-free${extra}`));
  await page.locator('.blk-free .blk-stage[data-count]').waitFor();
  await settled(page);
}
const stage = (page) => page.locator('.blk-free .blk-stage');
const padButton = (page) => page.locator('.blk-free-strip .blk-free-pad');
const cell = (page, x, y) => page.locator(`.blk-free-slot .blk-cell[data-x="${x}"][data-y="${y}"]`);
const panPrev = (page) => page.locator('.blk-free-pan.is-prev');
const panNext = (page) => page.locator('.blk-free-pan.is-next');
const live = (page) => page.locator('.sr-only[role="status"]').first();

/** 무대에서 읽은 판: 판 칸의 상자, 무대 밖·펼친 칸에 가린 판 칸, 펼친 쪽(옅은 파랑) 칸, 쌓기나무 한 변 */
const board = (page) => page.evaluate(() => {
  const stageEl = document.querySelector('.blk-free .blk-stage');
  const S = stageEl.getBoundingClientRect();
  const slotEl = document.querySelector('.blk-free-slot');
  const slot = slotEl && !slotEl.hidden && getComputedStyle(slotEl).position === 'absolute' ? slotEl.getBoundingClientRect() : null;
  const rect = (sel) => [...stageEl.querySelectorAll(sel)].map((p) => p.getBoundingClientRect());
  const tiles = rect('polygon.blk-tile');
  const inside = (b, R) => {
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    return cx > R.left && cx < R.right && cy > R.top && cy < R.bottom;
  };
  return {
    tiles: tiles.length,
    unit: parseFloat(stageEl.style.getPropertyValue('--blk-unit')),
    x0: Math.min(...tiles.map((b) => b.left)),
    x1: Math.max(...tiles.map((b) => b.right)),
    y0: Math.min(...tiles.map((b) => b.top)),
    y1: Math.max(...tiles.map((b) => b.bottom)),
    out: tiles.filter((b) => !inside(b, S)).length,
    hidden: slot ? tiles.filter((b) => inside(b, slot)).length : 0,
    first: stageEl.querySelector('polygon.blk-tile[data-x="0"][data-y="0"]')?.getAttribute('points'), // 판의 왼쪽 앞 모서리 칸
    stage: { w: S.width, h: S.height },
  };
});

test('단계 지도: 쌓기나무 영역의 1차시 위에 넓은 자유 쌓기 카드 — 번호·별·잠금·"여기부터!" 없음, 차시 칩·모은 별은 그대로. 한 차시 주소·다른 영역에는 없다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?sound=off&area=blocks'));
  const card = page.locator('.free-space-card');
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('data-stage', 'blocks-free');
  await expect(card).toHaveAccessibleName('자유 쌓기 넓은 판에 쌓기나무를 마음대로 쌓고 돌려 보며 살펴봐요.');
  await expect(card.locator('.free-space-art svg')).toHaveCount(1);
  await expect(card.locator('.stage-medal, .star, .stage-lock, .flag')).toHaveCount(0);
  await expect(page.locator('.free-space-list + .lesson-group')).toHaveAttribute('data-lesson', 'blocks-look'); // 1차시 바로 위
  await expect(page.locator('.lesson-no')).toHaveText(BLOCK_LESSONS.map((_, i) => `${i + 1}차시`));
  const max = BLOCK_STAGES.filter((s) => !s.challenge).length * 3; // 독립: 차시의 일반 단계 수 × 별 3
  await expect(page.locator('.star-total')).toHaveText(`모은 별 0 / ${max}`);
  await expect(page.locator('.free-space-list .flag')).toHaveCount(0);
  // 한 차시 주소에는 자유 카드가 없다
  await page.goto(fileUrl(FILE, '?sound=off&lesson=blocks-look'));
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.lesson-group')).toHaveCount(1);
  await expect(page.locator('.free-space-card')).toHaveCount(0);
  // 다른 영역(정육면체)의 지도에도 없다
  await page.goto(fileUrl(FILE, '?sound=off&area=cube'));
  await expect(page.locator('.lesson-group')).toHaveCount(1);
  await expect(page.locator('.free-space-card')).toHaveCount(0);
  // 들어가면 점수 칸이 없는 자유 쌓기, [← 단계 선택]은 쌓기나무 영역 지도로
  await page.goto(fileUrl(FILE, '?sound=off&area=blocks'));
  await press(testInfo, page.locator('.free-space-card'));
  await page.locator('.blk-free .blk-stage[data-count]').waitFor();
  await expect(page.locator('.play-title')).toHaveText('자유 쌓기');
  await expect(page.locator('.meta-xp, .meta-streak, .play-chip')).toHaveCount(0);
  await press(testInfo, page.getByRole('button', { name: '← 단계 선택' }));
  await expect(page.locator('.area-tab[data-area="blocks"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.free-space-card')).toBeVisible();
  // 학습 기록·별·점수·도감이 생기지 않았다(지난번에 하던 영역만 기억)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /^edu:net-workshop:(log|stars|rewards|collections)$/.test(k)))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('edu:net-workshop:area'))).toBe('"blocks"');
  expect(errors).toEqual([]);
});

test('판(결정 4·7): 14×14칸, 처음 보기 맞춤 한 변, 오른쪽 좁은 띠의 버튼 한 줄 — 위에서 본 판은 처음에 숨김, 판 옮기기 버튼도 없음', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 본다(태블릿은 아래 두 손가락 검사)');
  const errors = collectErrors(page);
  await openFree(page);
  const b = await board(page);
  expect(b.tiles).toBe(196);
  expect(b.unit).toBe(perspUnit(b.stage.w, b.stage.h, 14));
  expect(b.unit).toBeGreaterThanOrEqual(36); // 계획 시안(34~36px)보다 크다 — 1366×768에서 39px(원근 — 원근 없을 때 40px, 가까운 쪽은 더 크다)
  expect(b.out).toBe(0);
  const names = await page.locator('.blk-free-strip button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent.trim()));
  expect(names).toEqual(['쌓기', '빼기', '되돌리기', '모두 치우기', '위에서 본 판', '층별로 벌려 보기', '위ㆍ앞ㆍ옆 모양', '쌓기나무 색 고르기, 지금 노랑']); // F1-6: 제목 글꼴로 그리는 버튼에는 "ㆍ"
  // 세로 한 줄: 버튼마다 띠 폭 그대로, 위에서 아래로
  const boxes = await page.locator('.blk-free-strip button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height) })));
  expect(new Set(boxes.map((r) => r.x)).size).toBe(1);
  for (let i = 1; i < boxes.length; i += 1) expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y);
  for (const r of boxes) expect(r.h).toBeGreaterThanOrEqual(48);
  await expect(page.locator('.blk-free-slot')).toBeHidden();
  await expect(padButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(panPrev(page)).toBeHidden();
  await expect(panNext(page)).toBeHidden();
  expect(await page.evaluate(() => [document.documentElement.scrollHeight - innerHeight, document.querySelector('.blk-free-strip').scrollHeight - document.querySelector('.blk-free-strip').clientHeight])).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test('위에서 본 판(결정 8·덧붙임 2): 띠의 버튼 하나로 펼치고 접는다. 14×14 전체가 작은 칸으로 한눈에(앞이 아래, 네 쪽 고르기 없음), 방향키가 판 전체를 움직이고 10층까지', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '키보드·마우스 — 크롬북에서 본다');
  const errors = collectErrors(page);
  await page.addInitScript((key) => localStorage.removeItem(key), KEY14);
  await openFree(page);
  await padButton(page).click();
  await settled(page);
  await expect(padButton(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.blk-free-slot')).toBeVisible();
  await expect(page.locator('.blk-free-quads, .blk-quad')).toHaveCount(0); // 네 쪽 고르기는 없다
  await expect(page.locator('.blk-free .blk-stage polygon.blk-tile.is-region')).toHaveCount(0);
  await expect(page.locator('.blk-free-slot .blk-pad-title')).toHaveText('위에서 본 판');
  // 196칸이 모두 펼친 판 안에 보이고(가린 칸 없음), 칸은 약 24px, 칸 안 수 글자는 12px 이상
  await expect(page.locator('.blk-free-slot .blk-cell:visible')).toHaveCount(196);
  const m = await page.evaluate(() => {
    const slot = document.querySelector('.blk-free-slot').getBoundingClientRect();
    const cells = [...document.querySelectorAll('.blk-free-slot .blk-cell')].map((el) => el.getBoundingClientRect());
    const out = cells.filter((r) => r.left < slot.left - 0.5 || r.right > slot.right + 0.5 || r.top < slot.top - 0.5 || r.bottom > slot.bottom + 0.5).length;
    const font = parseFloat(getComputedStyle(document.querySelector('.blk-free-slot .blk-cell')).fontSize);
    return { w: Math.min(...cells.map((r) => r.width)), h: Math.min(...cells.map((r) => r.height)), max: Math.max(...cells.map((r) => r.width)), out, font, slot: { w: slot.width, h: slot.height } };
  });
  expect(m.out).toBe(0);
  expect(m.w).toBeGreaterThanOrEqual(22);
  expect(m.max).toBeLessThanOrEqual(26);
  expect(m.font).toBeGreaterThanOrEqual(12);
  expect(m.slot.w).toBeLessThan(420); // 펼친 판의 크기는 전과 같다(7×7 48px 칸 때 388×408)
  // 앞쪽이 아래로: 앞줄(줄 0)이 아래, 왼쪽(칸 0)이 왼쪽, "앞" 글자가 판 아래, "옆" 글자가 오른쪽
  const at = async (x, y) => cell(page, x, y).boundingBox();
  expect((await at(0, 0)).y).toBeGreaterThan((await at(0, 13)).y);
  expect((await at(0, 0)).x).toBeLessThan((await at(13, 0)).x);
  expect((await page.locator('.blk-free-slot .blk-pad-front').boundingBox()).y).toBeGreaterThan((await at(0, 0)).y);
  expect((await page.locator('.blk-free-slot .blk-pad-side').boundingBox()).x).toBeGreaterThan((await at(13, 7)).x);
  // 방향키: (0, 0)에서 → 13번이면 (13, 0), ↑ 13번이면 (13, 13) — 판 전체를 움직인다. 고른 칸은 또렷하게(굵은 테두리)
  await cell(page, 0, 0).focus();
  for (let i = 0; i < 13; i += 1) await page.keyboard.press('ArrowRight');
  await expect(cell(page, 13, 0)).toBeFocused();
  for (let i = 0; i < 13; i += 1) await page.keyboard.press('ArrowUp');
  await expect(cell(page, 13, 13)).toBeFocused();
  expect(await cell(page, 13, 13).evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.blk-free-slot .blk-pad-grid')).toHaveAttribute('aria-label', /^위에서 본 판\. .*숫자 0부터 9는 그 높이로/);
  // 숫자 9 → 9층, Enter → 10층(화면 읽기 "14줄 14칸에 쌓았어요. 모두 10개"), 한 번 더 → 10층까지라는 알림
  await page.keyboard.press('9');
  await expect(cell(page, 13, 13)).toHaveAccessibleName('14줄 14칸, 쌓기나무 9개');
  await expect(cell(page, 13, 13)).toHaveText('9');
  await page.keyboard.press('Enter');
  await expect(cell(page, 13, 13)).toHaveAccessibleName('14줄 14칸, 쌓기나무 10개');
  await expect(cell(page, 13, 13)).toHaveText('10');
  await expect(live(page)).toHaveText('14줄 14칸에 쌓았어요. 모두 10개');
  await expect(stage(page)).toHaveAttribute('data-count', '10');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('여기는 10층까지 쌓을 수 있어요.');
  await expect(stage(page)).toHaveAttribute('data-count', '10');
  await expect(page.locator('.blk-free-count b')).toHaveText('10');
  // "10"도 칸 안에 들어간다
  expect(await cell(page, 13, 13).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // 마우스로 칸을 누르면 쌓인다
  await cell(page, 6, 6).click();
  await expect(stage(page)).toHaveAttribute('data-count', '11');
  // 다시 누르면 접힘
  await padButton(page).click();
  await expect(padButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.blk-free-slot')).toBeHidden();
  expect(errors).toEqual([]);
});

test('판 옮기기(결정 9, 크롬북 1366×768 · 가로 태블릿 1024×768): 펼치면 판이 무대 안에서 비키고, 펼친 판에 가린 쪽은 가장자리 버튼·Shift+방향키로 본다. 접으면 처음 자리', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '마우스·키보드 — 크롬북에서 본다(두 손가락은 아래)');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  for (const [w, h] of [[1366, 768], [1024, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await openFree(page);
    const home = await board(page);
    await padButton(page).click();
    await settled(page);
    const open = await board(page);
    // 판은 오른쪽으로 비켰다(크기 그대로, 무대 밖으로 나가지 않을 만큼). 그래도 왼쪽 끝이 펼친 판에 가린다
    expect(open.x0).toBeGreaterThan(home.x0);
    expect(open.x1 - open.x0).toBeCloseTo(home.x1 - home.x0, 0);
    expect(open.unit).toBe(home.unit);
    expect(open.out).toBe(0);
    expect(open.hidden).toBeGreaterThan(0);
    // 옮기기 버튼: 왼쪽 보기는 켜짐, 오른쪽 보기는 끝(꺼짐 — 판 오른쪽은 이미 다 보인다)
    await expect(panPrev(page)).toBeVisible();
    await expect(panPrev(page)).toHaveAccessibleName('판 왼쪽 보기');
    await expect(panNext(page)).toHaveAccessibleName('판 오른쪽 보기');
    await expect(panPrev(page)).toBeEnabled();
    await expect(panNext(page)).toBeDisabled();
    for (const box of [await panPrev(page).boundingBox(), await panNext(page).boundingBox()]) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(48);
    // 왼쪽 보기를 끝까지: 판의 왼쪽 끝이 펼친 판 밖으로(가린 판 칸 0)
    let n = 0;
    while (await panPrev(page).isEnabled()) {
      await panPrev(page).click();
      n += 1;
      expect(n).toBeLessThan(6);
    }
    await settled(page);
    await frames(page);
    const left = await board(page);
    expect(left.hidden).toBe(0);
    expect(left.x0).toBeGreaterThan(open.x0);
    await expect(panNext(page)).toBeEnabled();
    await expect(live(page)).toContainText('판 왼쪽을 보도록 옮겼어요. 끝까지 옮겼어요.');
    // Shift+→ (무대에서) = 오른쪽 보기 → 판이 왼쪽으로. 그냥 →는 돌리기(판이 옮겨지지 않는다)
    await stage(page).focus();
    await page.keyboard.press('Shift+ArrowRight');
    await settled(page);
    await frames(page);
    const back = await board(page);
    expect(back.x0).toBeLessThan(left.x0 - 20);
    expect(back.first).not.toBe(left.first);
    // 접으면 처음 자리(판 칸의 점이 처음과 같다)
    await padButton(page).click();
    await settled(page);
    await frames(page);
    const closed = await board(page);
    expect(closed.first).toBe(home.first);
    await expect(panPrev(page)).toBeHidden();
    await expect(panNext(page)).toBeHidden();
    expect(await hasHorizontalScroll(page)).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('판 옮기기(결정 9, 태블릿 세로 820×1180): 펼친 칸은 매트 아래, 판은 위로 비킨다. 칸에 가린 아래쪽은 두 손가락으로 함께 위로 끌어 보고(판이 손을 따라, 크기 그대로), [▲][▼]로도', async ({ page }, testInfo) => {
  test.skip(!isTouch(testInfo), '터치 — 태블릿에서 본다');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openFree(page);
  const home = await board(page);
  expect(home.tiles).toBe(196);
  await padButton(page).tap();
  await settled(page);
  const open = await board(page);
  await expect(page.locator('.blk-free-slot .blk-cell:visible')).toHaveCount(196);
  expect(open.y0).toBeLessThan(home.y0); // 위로 비켰다
  await expect(panPrev(page)).toHaveAccessibleName('판 위쪽 보기');
  await expect(panNext(page)).toHaveAccessibleName('판 아래쪽 보기');
  // 판의 앞쪽 끝이 칸에 가려 있다: 두 손가락으로 함께 위로 60px 끈다(사이는 그대로 — 벌리기가 아니다)
  expect(open.hidden).toBeGreaterThan(0);
  await expect(panNext(page)).toBeEnabled();
  await expect(panPrev(page)).toBeDisabled(); // 위쪽은 가린 것이 없다
  const countBefore = await stage(page).getAttribute('data-count');
  const s = await stage(page).boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const a = [s.x + s.width * 0.45, s.y + 150];
  const bb = [s.x + s.width * 0.6, s.y + 150];
  let t = Date.now() / 1000;
  const send = (type, dy) => {
    t += 0.016;
    return cdp.send('Input.dispatchTouchEvent', { type, timestamp: t, touchPoints: type === 'touchEnd' ? [] : [{ x: a[0], y: a[1] + dy, id: 1 }, { x: bb[0], y: bb[1] + dy, id: 2 }] });
  };
  await send('touchStart', 0);
  for (let i = 1; i <= 12; i += 1) await send('touchMove', -i * 5);
  await send('touchEnd', -60);
  await frames(page);
  const moved = await board(page);
  expect(open.y0 - moved.y0).toBeGreaterThan(50);
  expect(open.y0 - moved.y0).toBeLessThan(66);
  expect(moved.hidden).toBeLessThan(open.hidden);
  expect(moved.unit).toBe(open.unit);
  expect(moved.x1 - moved.x0).toBeCloseTo(open.x1 - open.x0, 0); // 크게·작게가 되지 않았다
  await expect(stage(page)).toHaveAttribute('data-count', countBefore); // 쌓이지 않았다
  // [▲] 판 위쪽 보기 → 판이 다시 아래로(펼칠 때 자리까지), [▼] 판 아래쪽 보기 → 끝까지 위로: 칸에 가린 판 칸 0
  await expect(panPrev(page)).toBeEnabled();
  await panPrev(page).tap();
  await settled(page);
  await frames(page);
  expect((await board(page)).y0).toBeCloseTo(open.y0, 0);
  while (await panNext(page).isEnabled()) await panNext(page).tap();
  await settled(page);
  await frames(page);
  expect((await board(page)).hidden).toBe(0);
  // 접으면 처음 자리
  await padButton(page).tap();
  await settled(page);
  await frames(page);
  expect((await board(page)).first).toBe(home.first);
  expect(errors).toEqual([]);
});

test('쌓기·색·저장(결정 5·6): 고른 색으로 쌓이고(색 이름도), 이 기기에 판 크기마다 남아 다시 들어오면 이어서. [모두 치우기]로 새로, 되돌리기도', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.addInitScript(([k14, k6]) => {
    if (sessionStorage.getItem('free-test-started')) return;
    sessionStorage.setItem('free-test-started', '1');
    localStorage.removeItem(k14);
    localStorage.setItem(k6, JSON.stringify({ v: 1, h: [[6, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], c: [] }));
  }, [KEY14, KEY6]);
  await openFree(page);
  await expect(page.locator('.blk-free-count b')).toHaveText('0'); // 휴대폰 판(6×6)의 저장은 14×14 판에 보이지 않는다
  const color = page.locator('.blk-free-color');
  await press(testInfo, color);
  await expect(color).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.blk-free-colors .blk-color')).toHaveText(['노랑', '파랑', '초록', '분홍', '보라']);
  await press(testInfo, page.locator('.blk-free-colors .blk-color', { hasText: '파랑' }));
  await expect(color).toHaveAccessibleName('쌓기나무 색 고르기, 지금 파랑');
  await expect(page.locator('.blk-free-colors')).toBeHidden();
  await press(testInfo, padButton(page));
  await press(testInfo, cell(page, 0, 0));
  await press(testInfo, cell(page, 0, 0));
  await press(testInfo, color);
  await press(testInfo, page.locator('.blk-free-colors .blk-color', { hasText: '분홍' }));
  await press(testInfo, cell(page, 1, 0));
  await expect(stage(page)).toHaveAttribute('data-count', '3');
  await expect(page.locator('.blk-free-count b')).toHaveText('3');
  // 판의 칸 색 = 맨 위 쌓기나무의 색, 무대의 쌓기나무 면도 그 색(같은 자리의 위아래는 같은 색, 옆 자리는 다른 색)
  const bg = (x, y) => cell(page, x, y).evaluate((el) => getComputedStyle(el).backgroundColor);
  const face = (name) => page.evaluate((n) => { const el = document.createElement('i'); el.style.color = `var(${n})`; document.body.append(el); const c = getComputedStyle(el).color; el.remove(); return c; }, name);
  expect(await bg(0, 0)).toBe(await face('--face-2'));
  expect(await bg(1, 0)).toBe(await face('--face-4'));
  const fills = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.blk-free .blk-stage polygon.blk-top')].map((p) => [`${p.dataset.x},${p.dataset.y},${p.dataset.z}`, p.style.fill])));
  expect(fills['1,0,0']).not.toBe(fills['0,0,1']);
  const saved = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY14));
  expect([saved.v, saved.h[0].slice(0, 3), saved.c[0].slice(0, 3)]).toEqual([1, [2, 1, 0], ['22', '4', '']]); // 높이 · 쌓기나무마다 색(2 = 파랑, 4 = 분홍)
  // 다시 들어오면 이어서(색도)
  await openFree(page);
  await expect(page.locator('.blk-free-count b')).toHaveText('3');
  await press(testInfo, padButton(page));
  expect(await bg(0, 0)).toBe(await face('--face-2'));
  await expect(cell(page, 0, 0)).toHaveAccessibleName('1줄 1칸, 쌓기나무 2개');
  // 모두 치우기 → 0개, 다시 들어와도 빈 판. 치운 뒤 되돌리기는 다시 3개
  await press(testInfo, page.locator('.blk-free-strip .blk-clear'));
  await expect(page.locator('.blk-free-count b')).toHaveText('0');
  await press(testInfo, page.locator('.blk-free-strip .blk-undo'));
  await expect(page.locator('.blk-free-count b')).toHaveText('3');
  await press(testInfo, page.locator('.blk-free-strip .blk-clear'));
  await openFree(page);
  await expect(page.locator('.blk-free-count b')).toHaveText('0');
  expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY6)).h[0][0]).toBe(6); // 6×6 판의 저장은 그대로
  expect(errors).toEqual([]);
});

test('[기록 모두 지우기]는 자유 쌓기 작품을 지우지 않는다(사용자 결정 2026-10-18 "지금처럼 따로" — 새로는 [모두 치우기])', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만');
  const errors = collectErrors(page);
  const work = JSON.stringify({ v: 1, h: Array.from({ length: 14 }, (_, y) => Array.from({ length: 14 }, (__, x) => (x === 2 && y === 3 ? 4 : 0))), c: [] });
  await page.addInitScript(([k, v]) => {
    if (sessionStorage.getItem('clear-test-started')) return;
    sessionStorage.setItem('clear-test-started', '1');
    localStorage.setItem(k, v);
  }, [KEY14, work]);
  await page.goto(fileUrl(FILE, '?sound=off&intro=0'));
  await page.getByRole('button', { name: '학습 기록' }).first().click();
  const clear = page.getByRole('button', { name: '기록 모두 지우기' });
  await clear.click();
  await page.getByRole('button', { name: '한 번 더 누르면 지워져요' }).click();
  await expect(page.locator('.toast')).toContainText('기록을 지웠어요.');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY14)).toBe(work);
  await openFree(page);
  await expect(page.locator('.blk-free-count b')).toHaveText('4');
  expect(errors).toEqual([]);
});

test('막힌 저장소(사생활 보호 모드처럼 localStorage가 오류): 오류 없이 쌓고, 그 판 동안만 남는다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const fail = () => {
      throw new DOMException('막힘', 'SecurityError');
    };
    Object.defineProperty(window, 'localStorage', { get: fail });
  });
  await openFree(page);
  await press(testInfo, padButton(page));
  await press(testInfo, cell(page, 2, 3));
  await press(testInfo, cell(page, 2, 3));
  await expect(page.locator('.blk-free-count b')).toHaveText('2');
  await expect(stage(page)).toHaveAttribute('data-count', '2');
  expect(errors).toEqual([]);
});

test('휴대폰 390×844: 6×6칸·6층, [위에서 본 판]은 쪽 고르기 없이 판 전체(48px 칸), 띠는 판 아래 가로 줄, 가로 스크롤 없음 · 층별로 벌린 층 글자가 판을 가리지 않는다', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만(크롬북 묶음에서 휴대폰 크기로 연다)');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.addInitScript(([k14, k6]) => {
    localStorage.removeItem(k6);
    localStorage.setItem(k14, JSON.stringify({ v: 1, h: Array.from({ length: 14 }, () => new Array(14).fill(1)), c: [] }));
  }, [KEY14, KEY6]);
  await openFree(page);
  const b = await board(page);
  expect(b.tiles).toBe(36);
  expect(b.unit).toBe(perspUnit(b.stage.w, b.stage.h, 6));
  await expect(page.locator('.blk-free-count b')).toHaveText('0'); // 14×14 판의 저장은 휴대폰 판에 보이지 않는다
  expect(await hasHorizontalScroll(page)).toBe(false);
  const strip = await page.locator('.blk-free-strip').boundingBox();
  const mat = await page.locator('.blk-free-mat').boundingBox();
  expect(strip.y).toBeGreaterThan(mat.y + mat.height - 1);
  await padButton(page).tap();
  await expect(page.locator('.blk-free-quads')).toHaveCount(0);
  await expect(page.locator('.blk-free-slot .blk-cell:visible')).toHaveCount(36);
  for (const size of await page.locator('.blk-free-slot .blk-cell').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))) expect(size).toBeGreaterThanOrEqual(48);
  await expect(panPrev(page)).toBeHidden();
  // 6층까지: 숫자 6 다음 Enter는 알림
  await cell(page, 5, 5).focus();
  await page.keyboard.press('6');
  await expect(cell(page, 5, 5)).toHaveAccessibleName('6줄 6칸, 쌓기나무 6개');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('여기는 6층까지 쌓을 수 있어요.');
  for (const [x, y] of [[0, 0], [1, 0], [0, 1]]) await cell(page, x, y).tap();
  expect(await hasHorizontalScroll(page)).toBe(false);
  // 층별로 벌리기: 층마다 개수, 글자가 판(판 칸·면)과 겹치지 않는다
  await page.locator('.blk-free-apart').tap();
  await settled(page);
  await frames(page);
  await expect(page.locator('.blk-free-apart')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.blk-free .blk-layer text')).toHaveText(['1층 4개', '2층 1개', '3층 1개', '4층 1개', '5층 1개', '6층 1개']);
  const overlap = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.blk-free .blk-layer')].map((g) => g.getBoundingClientRect());
    const shapes = [...document.querySelectorAll('.blk-free .blk-stage .blk-shapes polygon')].map((p) => p.getBoundingClientRect());
    return chips.filter((c) => shapes.some((s) => s.left < c.right - 1 && s.right > c.left + 1 && s.top < c.bottom - 1 && s.bottom > c.top + 1)).length;
  });
  expect(overlap).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
});

test('위ㆍ앞ㆍ옆 모양(결정 6): 켜면 세 그림이 펼쳐지고 쌓는 대로 바뀐다. 다시 누르면 접힘', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.addInitScript((k) => localStorage.removeItem(k), KEY14);
  await openFree(page);
  const views = page.locator('.blk-free-views');
  await press(testInfo, views);
  await expect(views).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.blk-free-viewspanel figcaption')).toHaveText(['위', '앞', '옆']);
  await expect(page.locator('.blk-free-viewspanel svg[aria-label="위에서 본 모양"] .is-on')).toHaveCount(0);
  // 무대의 판 칸을 눌러 쌓는다(가운데쯤 — 펼친 그림이 가리지 않는 곳)
  const target = page.locator('.blk-free .blk-stage polygon.blk-tile[data-x="10"][data-y="10"]');
  await press(testInfo, target);
  await expect(stage(page)).toHaveAttribute('data-count', '1');
  await expect(page.locator('.blk-free-viewspanel svg[aria-label="위에서 본 모양"] .is-on')).toHaveCount(1);
  await expect(page.locator('.blk-free-viewspanel svg[aria-label="앞에서 본 모양"] .is-on')).toHaveCount(1);
  await press(testInfo, views);
  await expect(page.locator('.blk-free-slot')).toBeHidden();
  expect(errors).toEqual([]);
});

test('배치(다섯 크기 + 960×768, 처음·위에서 본 판 펼침·끝까지 옮김·위ㆍ앞ㆍ옆 모양·층별로 벌림): 스크롤 없음(휴대폰은 가로만), 띠 안쪽 넘침 없음, 펼친 칸이 매트 안·안쪽 넘침 0, 옮기기의 모든 자리를 합치면 판 칸이 다 보인다', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만(크롬북 묶음에서 여러 크기로 연다)');
  test.setTimeout(150_000);
  // 960×768: 폭 901~1000px의 가로 화면 — 펼치는 칸의 자리·옮기기 방향은 폭이 아니라 매트 모양으로(F1-1)
  for (const [w, h, phone] of [[1366, 768], [1366, 680], [1024, 768], [960, 768], [820, 1180], [390, 844, true]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: Boolean(phone), isMobile: Boolean(phone) });
    const page = await context.newPage();
    const errors = collectErrors(page);
    await openFree(page);
    const check = async (label) => {
      const m = await page.evaluate(() => {
        const strip = document.querySelector('.blk-free-strip');
        const mat = document.querySelector('.blk-free-mat').getBoundingClientRect();
        const slotEl = document.querySelector('.blk-free-slot');
        const slot = slotEl.hidden ? null : slotEl.getBoundingClientRect();
        // 펼친 칸 안의 칸·그림이 칸 밖으로 잘린 정도(가운데 맞춤 넘침은 왼쪽을 밀어도 못 본다 — F1-2)
        let clip = 0;
        if (slot) for (const el of slotEl.querySelectorAll('.blk-cell, svg, figure')) {
          const r = el.getBoundingClientRect();
          clip = Math.max(clip, slot.left - r.left, slot.top - r.top, r.bottom - slot.bottom);
        }
        return {
          scrollY: document.documentElement.scrollHeight - innerHeight,
          scrollX: document.documentElement.scrollWidth - innerWidth,
          stripOver: strip.scrollHeight - strip.clientHeight + (strip.scrollWidth - strip.clientWidth),
          slotOut: slot ? Math.max(0, mat.top - slot.top, slot.bottom - mat.bottom, mat.left - slot.left, slot.right - mat.right) : 0,
          slotOver: slotEl.hidden ? 0 : slotEl.scrollHeight - slotEl.clientHeight + (slotEl.scrollWidth - slotEl.clientWidth),
          clip: Math.max(0, Math.round(clip)),
        };
      });
      expect(m.scrollX, `${w}×${h} ${label}`).toBeLessThanOrEqual(0);
      if (!phone) expect(m.scrollY, `${w}×${h} ${label}`).toBeLessThanOrEqual(0);
      expect([m.stripOver, m.slotOut, m.slotOver, m.clip], `${w}×${h} ${label}`).toEqual([0, 0, 0, 0]);
    };
    /** 지금 보이는 판 칸(무대 안 · 펼친 칸 밖) */
    const seen = () => page.evaluate(() => {
      const stage = document.querySelector('.blk-free .blk-stage');
      const S = stage.getBoundingClientRect();
      const slotEl = document.querySelector('.blk-free-slot');
      const slot = !slotEl.hidden && getComputedStyle(slotEl).position === 'absolute' ? slotEl.getBoundingClientRect() : null;
      return [...stage.querySelectorAll('polygon.blk-tile')].filter((t) => {
        const r = t.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        return x > S.left && x < S.right && y > S.top && y < S.bottom && !(slot && x > slot.left && x < slot.right && y > slot.top && y < slot.bottom);
      }).map((t) => `${t.dataset.x},${t.dataset.y}`);
    });
    const home = await board(page);
    const tiles = phone ? 36 : 196;
    expect([home.out, home.tiles], `${w}×${h}`).toEqual([0, tiles]);
    expect(home.unit, `${w}×${h}`).toBe(perspUnit(home.stage.w, home.stage.h, phone ? 6 : 14));
    await check('처음');
    await page.locator('.blk-free-pad').click();
    await settled(page);
    await check('펼침');
    await expect(page.locator('.blk-free-slot .blk-cell:visible'), `${w}×${h}`).toHaveCount(tiles); // 판 전체가 한눈에
    // 판 옮기기(결정 9): 양쪽 끝까지 옮기며 본 칸을 합치면 판 칸이 모두 보인다
    const union = new Set(await seen());
    for (const b of [panPrev(page), panNext(page), panPrev(page)]) {
      let n = 0;
      while (n < 10 && (await b.isVisible()) && (await b.isEnabled())) {
        await b.click();
        await settled(page);
        await frames(page);
        for (const k of await seen()) union.add(k);
        n += 1;
      }
    }
    expect(union.size, `${w}×${h} 옮기기로 본 칸`).toBe(tiles);
    await page.locator('.blk-free-pad').click();
    await page.locator('.blk-free-views').click();
    await settled(page);
    await check('위ㆍ앞ㆍ옆 모양');
    await page.locator('.blk-free-views').click();
    await page.locator('.blk-free-apart').click();
    await settled(page);
    await check('벌림');
    expect((await board(page)).out, `${w}×${h} 벌림`).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
  }
});

test('알림(F1-3): 좁은 배치(세로 태블릿·휴대폰)에서도 알림이 띠의 버튼을 가리지 않는다 — 매트 안 아래쪽(펼친 칸이 있으면 그 칸 밖), 넓은 배치도 펼친 판을 가리지 않는다', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만(크롬북 묶음에서 크기마다 연다)');
  test.setTimeout(120_000);
  for (const [w, h] of [[820, 1180], [960, 768], [1366, 680], [1024, 768], [390, 844]]) {
    const touch = w < 600 || h > w;
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    const errors = collectErrors(page);
    await openFree(page);
    // 휴대폰에서 위에서 본 판을 펼치면 화면 대부분이 그 판이라 알림이 어디든 무언가를 덮는다(차시의 휴대폰과 같은 정도 — 지침) → 접은 장면만
    for (const opened of w < 600 ? [false] : [false, true]) {
      if (opened) {
        await page.locator('.blk-free-pad').click();
        await settled(page);
      }
      await page.locator('.blk-free-strip .blk-mode[data-mode="remove"]').click();
      // 빈 판 칸을 누르면 "여기에는 뺄 쌓기나무가 없어요." — 알림이 떠 있는 동안 그 밑에 있는 버튼(띠·매트의 조작판·펼친 판의 칸)
      const tile = page.locator(`.blk-free .blk-stage polygon.blk-tile[data-x="${w < 600 ? 5 : 13}"][data-y="${w < 600 ? 3 : 13}"]`);
      const tb = await tile.boundingBox();
      await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
      await expect(page.locator('.toast')).toContainText('여기에는 뺄 쌓기나무가 없어요.');
      await settled(page);
      const under = await page.evaluate(() => {
        const t = document.querySelector('.toast').getBoundingClientRect();
        return [...document.querySelectorAll('.blk-free button')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && !el.closest('[hidden]') && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top;
        }).map((el) => el.getAttribute('aria-label') || el.textContent.trim());
      });
      expect(under, `${w}×${h}${opened ? ' 펼침' : ''}`).toEqual([]);
      await page.locator('.blk-free-strip .blk-mode[data-mode="add"]').click();
    }
    expect(errors).toEqual([]);
    await context.close();
  }
});

test('키보드(F1-4): [위에서 본 판]을 Enter로 펼치면 초점이 판의 고른 칸으로, [색]을 Enter로 열면 지금 색으로. [색]은 Escape로 닫히고 초점은 [색] 버튼', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '키보드 — 크롬북에서 본다');
  const errors = collectErrors(page);
  await openFree(page);
  await expect(padButton(page)).toHaveAttribute('aria-controls', 'blk-free-slot');
  await padButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 0)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 1, 0)).toBeFocused();
  // 다시 닫고 열면 마지막 칸으로
  await padButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.blk-free-slot')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(cell(page, 1, 0)).toBeFocused();
  // 마우스로 펼치면 초점은 버튼에 그대로
  await padButton(page).click();
  await padButton(page).click();
  await expect(padButton(page)).toBeFocused();
  // [색]: Enter로 열면 지금 색(노랑), Escape로 닫힘 → 초점 [색]
  const color = page.locator('.blk-free-color');
  await expect(color).toHaveAttribute('aria-controls', 'blk-free-colors');
  await color.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.blk-free-colors .blk-color', { hasText: '노랑' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.blk-free-colors')).toBeHidden();
  await expect(color).toBeFocused();
  await expect(color).toHaveAttribute('aria-expanded', 'false');
  // [색] 버튼에 초점이 있을 때도 Escape로 닫힌다
  await color.click();
  await expect(page.locator('.blk-free-colors')).toBeVisible();
  await color.focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.blk-free-colors')).toBeHidden();
  expect(errors).toEqual([]);
});

test('펼친 채 창 크기·화면 방향 바꾸기(F1b-1): 무대가 새 크기를 잰 뒤 칸 자리·칸 크기·옮기기 방향을 다시 정한다 — 바로(움직임 끝)·30프레임 뒤 모두 넘침 0, 옮기기로 다 보이고, 알림 밑 버튼 0', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만(크롬북 묶음에서 크기마다 연다)');
  test.setTimeout(180_000);
  const many = (page, n) => page.evaluate((k) => new Promise((resolve) => {
    let i = 0;
    const step = () => (++i >= k ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);
  /** 펼친 칸·매트 모양·지금 보이는 판 칸 */
  const look = (page) => page.evaluate(() => {
    const stage = document.querySelector('.blk-free .blk-stage');
    const S = stage.getBoundingClientRect();
    const mat = document.querySelector('.blk-free-mat');
    const M = mat.getBoundingClientRect();
    const slotEl = document.querySelector('.blk-free-slot');
    const slot = slotEl.getBoundingClientRect();
    let clip = 0;
    for (const el of slotEl.querySelectorAll('.blk-cell')) {
      const r = el.getBoundingClientRect();
      clip = Math.max(clip, slot.left - r.left, slot.top - r.top, r.bottom - slot.bottom, r.right - slot.right);
    }
    const seen = [...stage.querySelectorAll('polygon.blk-tile')].filter((t) => {
      const r = t.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      return x > S.left && x < S.right && y > S.top && y < S.bottom && !(x > slot.left && x < slot.right && y > slot.top && y < slot.bottom);
    }).map((t) => `${t.dataset.x},${t.dataset.y}`);
    return {
      tall: mat.classList.contains('is-tall'),
      shapeTall: S.height > S.width * 0.9, // 매트(무대) 모양: 세로가 길면 펼친 칸은 아래
      // 펼친 칸 자리: 왼쪽 위 = 무대 위에서 84px, 아래 = 무대 아래에서 12px(blocks.css)
      slotBelow: Math.abs(S.bottom - slot.bottom - 12) <= 2 && Math.abs(slot.top - S.top - 84) > 2,
      over: slotEl.scrollHeight - slotEl.clientHeight + (slotEl.scrollWidth - slotEl.clientWidth),
      clip: Math.max(0, Math.round(clip)),
      outOfMat: Math.max(0, Math.round(Math.max(M.top - slot.top, slot.bottom - M.bottom, M.left - slot.left, slot.right - M.right))),
      seen,
    };
  });
  const runs = [
    { start: [1366, 680], seq: [[683, 680], [1366, 680]], touch: false },
    { start: [1366, 768], seq: [[960, 768], [1366, 768]], touch: false },
    { start: [1180, 820], seq: [[820, 1180], [1180, 820]], touch: true },
    { start: [1024, 768], seq: [[768, 1024], [1024, 768]], touch: true },
  ];
  for (const { start, seq, touch } of runs) {
    const context = await browser.newContext({ viewport: { width: start[0], height: start[1] }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    const errors = collectErrors(page);
    await openFree(page);
    await page.locator('.blk-free-pad').click();
    await settled(page);
    for (const [w, h] of seq) {
      const label = `${start.join('×')} → ${w}×${h}`;
      await page.setViewportSize({ width: w, height: h });
      await settled(page);
      await frames(page);
      for (const when of ['바로', '30프레임 뒤']) {
        if (when !== '바로') await many(page, 30);
        const m = await look(page);
        expect([m.tall, m.slotBelow], `${label} ${when} 칸 자리`).toEqual([m.shapeTall, m.shapeTall]);
        expect([m.over, m.clip, m.outOfMat], `${label} ${when} 넘침·잘림`).toEqual([0, 0, 0]);
      }
      // 옮기기의 모든 자리를 합치면 판 칸이 다 보인다
      const union = new Set((await look(page)).seen);
      for (const b of [panPrev(page), panNext(page), panPrev(page)]) {
        let n = 0;
        while (n < 10 && (await b.isVisible()) && (await b.isEnabled())) {
          await b.click();
          await settled(page);
          await frames(page);
          for (const k of (await look(page)).seen) union.add(k);
          n += 1;
        }
      }
      expect(union.size, `${label} 옮기기로 본 칸`).toBe(196);
      // 알림: [빼기]로 보이는 빈 판 칸을 누르면 "여기에는 뺄 쌓기나무가 없어요." — 그 밑에 버튼(띠·조작판·펼친 판의 칸)이 없다.
      // 예외(spec-grade6 15-23 사용자 결정: 그대로): 좁은 화면(900px 이하)인데 매트가 가로로 길어 펼친 칸이 왼쪽에 있는 때(크롬북 반 창 683×680)는
      // 엔진이 알림 폭을 화면 폭으로 정해 펼친 판의 아래쪽 칸을 잠깐 가린다 — 엔진은 고치지 않는다. 지금 값을 고정해 더 나빠지지 않게 본다:
      // 펼친 판의 칸만(띠·조작판 버튼은 가리지 않음), 앞 두 줄의 오른쪽 칸 8개(글꼴 흉내 10개 — 알림이 다 올라온 뒤에 잼) 이하, 약 2.9초 뒤 사라짐
      const sideNarrow = w <= 900 && !(await look(page)).tall;
      // 앞 크기에서 띄운 같은 알림이 아직 떠 있으면(옮기기 횟수에 따라 3초가 안 지났을 수 있다 — F2 원근으로 옮기는 횟수가 바뀜) 사라진 뒤에 새로 띄운다
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: 5000 });
      await page.locator('.blk-free-strip .blk-mode[data-mode="remove"]').click();
      // 누를 빈 판 칸: (7,7)이 보이면 그 칸, 아니면 보이는 첫 칸 — 그 가운데가 버튼(판 옮기기·조작판)에 덮이지 않은 칸이어야 한다
      // (F2 원근으로 판의 화면 자리가 바뀌어 (7,7)이 [▶] 밑에 들어가는 크기가 생겼다 — 덮인 칸을 누르면 버튼이 눌린다)
      const seenNow = (await look(page)).seen;
      const free = await page.evaluate((keys) => keys.filter((k) => {
        const [x, y] = k.split(',');
        const tile = document.querySelector(`.blk-free .blk-stage polygon.blk-tile[data-x="${x}"][data-y="${y}"]`);
        const r = tile.getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === tile;
      }), seenNow.includes('7,7') ? ['7,7', ...seenNow] : seenNow);
      expect(free.length, `${label} 누를 수 있는 빈 칸`).toBeGreaterThan(0);
      const [tx, ty] = free[0].split(',').map(Number);
      const tb = await page.locator(`.blk-free .blk-stage polygon.blk-tile[data-x="${tx}"][data-y="${ty}"]`).boundingBox();
      await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
      await expect(page.locator('.toast')).toContainText('여기에는 뺄 쌓기나무가 없어요.');
      const shownAt = Date.now();
      await settled(page);
      const under = await page.evaluate(() => {
        const t = document.querySelector('.toast').getBoundingClientRect();
        return [...document.querySelectorAll('.blk-free button')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && !el.closest('[hidden]') && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top;
        }).map((el) => ({ cell: el.classList.contains('blk-cell'), name: el.getAttribute('aria-label') || el.textContent.trim() }));
      });
      if (sideNarrow) {
        testInfo.annotations.push({ type: '사용자 결정 예외', description: `${label}: 알림이 펼친 판의 칸 ${under.length}개를 잠깐 가림(spec-grade6 15-23 — 그대로)` });
        expect(under.filter((u) => !u.cell), `${label} 알림 밑 칸 말고 버튼`).toEqual([]);
        expect(under.length, `${label} 알림이 가리는 칸(지금 8개 · 글꼴 흉내 10개)`).toBeLessThanOrEqual(10);
        await expect(page.locator('.toast'), `${label} 알림은 3초 안에 사라진다`).toHaveCount(0, { timeout: 3200 });
        expect(Date.now() - shownAt, `${label} 알림이 떠 있던 시간(ms)`).toBeLessThanOrEqual(3300);
      } else {
        expect(under.map((u) => u.name), `${label} 알림 밑 버튼`).toEqual([]);
      }
      await page.locator('.blk-free-strip .blk-mode[data-mode="add"]').click();
    }
    expect(errors).toEqual([]);
    await context.close();
  }
});

test('가장 작은 칸(960×600 — 13px, F1b-2): "10"과 "9"가 한 줄로 칸 안에 든다(보통·글꼴 흉내 실행 둘 다 — 글자 12px, 두 자리 수만 글자 사이를 좁힘)', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만(크롬북 묶음에서 연다)');
  const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const work = { v: 1, h: Array.from({ length: 14 }, (_, y) => Array.from({ length: 14 }, (__, x) => [10, 9, 0][(x + y) % 3])), c: [] };
  await context.addInitScript((v) => localStorage.setItem('edu:net-workshop:free-14x14', v), JSON.stringify(work));
  const page = await context.newPage();
  const errors = collectErrors(page);
  await openFree(page);
  await page.locator('.blk-free-pad').click();
  await settled(page);
  const m = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.blk-free-slot .blk-cell.is-on')];
    let bad = 0;
    for (const c of cells) {
      const cb = c.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(c.querySelector('.blk-cell-n'));
      const r = range.getBoundingClientRect();
      if (range.getClientRects().length !== 1 || r.left < cb.left + 0.5 || r.right > cb.right - 0.5 || r.top < cb.top || r.bottom > cb.bottom) bad += 1;
    }
    const first = cells[0];
    return { n: cells.length, bad, size: Math.round(first.getBoundingClientRect().width), font: parseFloat(getComputedStyle(first).fontSize), texts: [...new Set(cells.map((c) => c.textContent))].sort() };
  });
  expect(m.size).toBe(13); // 가장 작은 칸(사용자 결정 15-23 — 낮은 화면은 13px까지 줄여 한눈에)
  expect(m.font).toBeGreaterThanOrEqual(12);
  expect(m.texts).toEqual(['10', '9']);
  expect([m.n, m.bad]).toEqual([131, 0]);
  expect(errors).toEqual([]);
  await context.close();
});
