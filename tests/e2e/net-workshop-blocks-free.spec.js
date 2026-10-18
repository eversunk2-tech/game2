/**
 * F1 쌓기나무 "자유 쌓기" — 브라우저 검사. 기획서: spec-grade6.md 15-18·15-19(결정 1~9), plan-rotate-free.md 5절, build-brief-f1.md
 * - 자리: 쌓기나무 영역 단계 지도의 1차시 위 넓은 카드(차시 번호·별·잠금·"여기부터!" 없음), 모은 별·차시 칩은 그대로, 한 차시 주소에는 없다
 * - 판: 크롬북·태블릿 14×14칸·10층, 휴대폰 6×6칸·6층. 처음 보기에서 판과 3층 높이가 무대에 꽉 차게
 * - 오른쪽 좁은 세로 띠(버튼 한 줄), [위에서 본 판]은 처음에 숨김 → 누르면 펼침(머리에서 네 쪽 고르기, 앞이 아래) → 다시 누르면 접힘(결정 7·8)
 * - 펼쳐서 판이 가려지면 판 옮기기: 무대 가장자리 버튼 · Shift+방향키 · 두 손가락으로 함께 끌기. 접으면 처음 자리(결정 9)
 * - 저장: 판 크기마다 하나, 다시 들어오면 이어서, [모두 치우기]로 새로, 막힌 저장소에서도 오류 없이. 점수·별·학습 기록 없음
 * 정해진 시간으로 기다리지 않는다: 움직임이 끝난 것은 getAnimations로, 무대 그리기는 화면 프레임 두 번으로 본다.
 * 시간 예산(CPU 4·8·12배 흉내에서 잼): 12배에서 가장 긴 검사(다섯 크기 배치) 8.4초 → 예산 150초, 판 옮기기(크롬북) 5.1초 → 120초, 두 손가락(태블릿) 3.0초 → 120초
 */
import { expect, test } from '@playwright/test';
import { homeUnitFor } from '../../src/games/net-workshop/blocks/block-view.js';
import { BLOCK_LESSONS, BLOCK_STAGES } from '../../src/games/net-workshop/blocks/blocks-logic.js';
import { collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

const FILE = 'net-workshop.html';
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
const quad = (page, name) => page.locator('.blk-free-quads .blk-quad', { hasText: name });
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
  const region = rect('polygon.blk-tile.is-region');
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
    region: region.length,
    regionHidden: slot ? region.filter((b) => inside(b, slot)).length : 0,
    regionOut: region.filter((b) => !inside(b, S)).length,
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
  expect(b.unit).toBe(homeUnitFor(b.stage.w, b.stage.h, { cols: 14, rows: 14, fitH: 3 }));
  expect(b.unit).toBeGreaterThanOrEqual(36); // 계획 시안(34~36px)보다 크다 — 1366×768에서 40px
  expect(b.out).toBe(0);
  const names = await page.locator('.blk-free-strip button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent.trim()));
  expect(names).toEqual(['쌓기', '빼기', '되돌리기', '모두 치우기', '위에서 본 판', '층별로 벌려 보기', '위·앞·옆 모양', '쌓기나무 색 고르기, 지금 노랑']);
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

test('위에서 본 판(결정 8): 띠의 버튼 하나로 펼치고 접는다. 머리에서 네 쪽을 고르고(앞이 아래), 방향키로 쪽 경계를 넘으면 저절로 다음 쪽. 10층까지', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '키보드·마우스 — 크롬북에서 본다');
  const errors = collectErrors(page);
  await page.addInitScript((key) => localStorage.removeItem(key), KEY14);
  await openFree(page);
  await padButton(page).click();
  await settled(page);
  await expect(padButton(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.blk-free-slot')).toBeVisible();
  await expect(page.locator('.blk-free-quads .blk-quad')).toHaveText(['왼쪽 앞', '오른쪽 앞', '왼쪽 뒤', '오른쪽 뒤']);
  await expect(quad(page, '왼쪽 앞')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.blk-free-slot .blk-cell:visible')).toHaveCount(49);
  for (const size of await page.locator('.blk-free-slot .blk-cell:visible').evaluateAll((els) => els.map((el) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height)))) expect(size).toBeGreaterThanOrEqual(48);
  // 앞쪽이 아래로: 앞줄(줄 0)이 아래, 왼쪽(칸 0)이 왼쪽, "앞" 글자가 판 아래
  const at = async (x, y) => cell(page, x, y).boundingBox();
  expect((await at(0, 0)).y).toBeGreaterThan((await at(0, 6)).y);
  expect((await at(0, 0)).x).toBeLessThan((await at(6, 0)).x);
  expect((await page.locator('.blk-free-slot .blk-pad-front').boundingBox()).y).toBeGreaterThan((await at(0, 0)).y);
  expect((await board(page)).region).toBe(49); // 무대의 판에 고른 쪽(옅은 파랑)
  await quad(page, '오른쪽 앞').click();
  await expect(quad(page, '오른쪽 앞')).toHaveAttribute('aria-pressed', 'true');
  await expect(quad(page, '왼쪽 앞')).toHaveAttribute('aria-pressed', 'false');
  await expect(cell(page, 7, 0)).toBeVisible();
  await expect(cell(page, 6, 0)).toBeHidden();
  // 방향키: 왼쪽 앞의 오른쪽 끝(6, 0)에서 → 는 오른쪽 앞(7, 0), 그다음 ↑ 일곱 번이면 오른쪽 뒤(7, 7)
  await quad(page, '왼쪽 앞').click();
  await cell(page, 6, 0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(quad(page, '오른쪽 앞')).toHaveAttribute('aria-pressed', 'true');
  await expect(cell(page, 7, 0)).toBeFocused();
  for (let i = 0; i < 7; i += 1) await page.keyboard.press('ArrowUp');
  await expect(quad(page, '오른쪽 뒤')).toHaveAttribute('aria-pressed', 'true');
  await expect(cell(page, 7, 7)).toBeFocused();
  await expect(page.locator('.blk-free-slot .blk-pad-grid')).toHaveAttribute('aria-label', /^위에서 본 판, 오른쪽 뒤\. .*숫자 0부터 9은 그 높이로/);
  // 숫자 9 → 9층, Enter → 10층(화면 읽기 "8줄 8칸에 쌓았어요. 모두 10개"), 한 번 더 → 10층까지라는 알림
  await page.keyboard.press('9');
  await expect(cell(page, 7, 7)).toHaveAccessibleName('8줄 8칸, 쌓기나무 9개');
  await page.keyboard.press('Enter');
  await expect(cell(page, 7, 7)).toHaveAccessibleName('8줄 8칸, 쌓기나무 10개');
  await expect(live(page)).toHaveText('8줄 8칸에 쌓았어요. 모두 10개');
  await expect(stage(page)).toHaveAttribute('data-count', '10');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('여기는 10층까지 쌓을 수 있어요.');
  await expect(stage(page)).toHaveAttribute('data-count', '10');
  await expect(page.locator('.blk-free-count b')).toHaveText('10');
  // 다시 누르면 접힘: 판·표시가 사라진다
  await padButton(page).click();
  await expect(padButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.blk-free-slot')).toBeHidden();
  expect((await board(page)).region).toBe(0);
  expect(errors).toEqual([]);
});

test('판 옮기기(결정 9, 크롬북 1366×768 · 가로 태블릿 1024×768): 펼치면 고른 쪽이 다 보이게 판이 비키고, 가려진 쪽은 가장자리 버튼·Shift+방향키로 본다. 접으면 처음 자리', async ({ page }, testInfo) => {
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
    // 고른 쪽(왼쪽 앞)은 칸에 가리지 않고 무대 안에 다 있다. 판은 오른쪽으로 비켰다(크기 그대로)
    expect([open.region, open.regionHidden, open.regionOut]).toEqual([49, 0, 0]);
    expect(open.x0).toBeGreaterThan(home.x0);
    expect(open.x1 - open.x0).toBeCloseTo(home.x1 - home.x0, 0);
    expect(open.unit).toBe(home.unit);
    // 판 끝이 무대 밖으로 나갔으니 옮기기 버튼: 왼쪽 보기는 끝(꺼짐), 오른쪽 보기는 켜짐
    expect(open.out).toBeGreaterThan(0);
    await expect(panPrev(page)).toBeVisible();
    await expect(panPrev(page)).toHaveAccessibleName('판 왼쪽 보기');
    await expect(panNext(page)).toHaveAccessibleName('판 오른쪽 보기');
    await expect(panPrev(page)).toBeDisabled();
    await expect(panNext(page)).toBeEnabled();
    for (const box of [await panPrev(page).boundingBox(), await panNext(page).boundingBox()]) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(48);
    // 오른쪽 보기를 끝까지: 판의 오른쪽 끝이 무대 안으로
    let n = 0;
    while (await panNext(page).isEnabled()) {
      await panNext(page).click();
      n += 1;
      expect(n).toBeLessThan(6);
    }
    await settled(page);
    await frames(page);
    const right = await board(page);
    expect(right.out).toBe(0);
    expect(right.x0).toBeLessThan(open.x0);
    await expect(panPrev(page)).toBeEnabled();
    await expect(live(page)).toContainText('판 오른쪽을 보도록 옮겼어요. 끝까지 옮겼어요.');
    // Shift+← (무대에서) = 왼쪽 보기 → 판이 오른쪽으로. 그냥 ←은 돌리기(판이 옮겨지지 않는다)
    await stage(page).focus();
    await page.keyboard.press('Shift+ArrowLeft');
    await settled(page);
    await frames(page);
    const back = await board(page);
    expect(back.x0).toBeGreaterThan(right.x0 + 20);
    expect(back.first).not.toBe(right.first);
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
  expect([open.region, open.regionHidden, open.regionOut]).toEqual([49, 0, 0]);
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
  expect(b.unit).toBe(homeUnitFor(b.stage.w, b.stage.h, { cols: 6, rows: 6, fitH: 3 }));
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

test('위·앞·옆 모양(결정 6): 켜면 세 그림이 펼쳐지고 쌓는 대로 바뀐다. 다시 누르면 접힘', async ({ page }, testInfo) => {
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

test('배치(다섯 크기, 처음·위에서 본 판 펼침·층별로 벌림): 스크롤 없음(휴대폰은 가로만), 띠 안쪽 넘침 없음, 펼친 판이 매트 안, 판이 무대에 꽉 차되 잘리지 않음', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만(크롬북 묶음에서 다섯 크기로 연다)');
  test.setTimeout(150_000);
  for (const [w, h, phone] of [[1366, 768], [1366, 680], [1024, 768], [820, 1180], [390, 844, true]]) {
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
        return {
          scrollY: document.documentElement.scrollHeight - innerHeight,
          scrollX: document.documentElement.scrollWidth - innerWidth,
          stripOver: strip.scrollHeight - strip.clientHeight + (strip.scrollWidth - strip.clientWidth),
          slotOut: slot ? Math.max(0, mat.top - slot.top, slot.bottom - mat.bottom, mat.left - slot.left, slot.right - mat.right) : 0,
          slotOver: slotEl.hidden ? 0 : slotEl.scrollHeight - slotEl.clientHeight,
        };
      });
      expect(m.scrollX, `${w}×${h} ${label}`).toBeLessThanOrEqual(0);
      if (!phone) expect(m.scrollY, `${w}×${h} ${label}`).toBeLessThanOrEqual(0);
      expect([m.stripOver, m.slotOut, m.slotOver], `${w}×${h} ${label}`).toEqual([0, 0, 0]);
    };
    const home = await board(page);
    expect([home.out, home.tiles], `${w}×${h}`).toEqual([0, phone ? 36 : 196]);
    expect(home.unit, `${w}×${h}`).toBe(homeUnitFor(home.stage.w, home.stage.h, { cols: phone ? 6 : 14, rows: phone ? 6 : 14, fitH: 3 }));
    await check('처음');
    await page.locator('.blk-free-pad').click();
    await settled(page);
    await check('펼침');
    if (!phone) expect([(await board(page)).regionHidden, (await board(page)).regionOut], `${w}×${h}`).toEqual([0, 0]);
    await page.locator('.blk-free-pad').click();
    await page.locator('.blk-free-apart').click();
    await settled(page);
    await check('벌림');
    expect((await board(page)).out, `${w}×${h} 벌림`).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
  }
});
