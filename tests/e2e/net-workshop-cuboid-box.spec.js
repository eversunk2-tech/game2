/**
 * 직육면체 전개도 탐구 넓히기 (spec 16-16): 상자 크기 정하기 · 돌리기 손잡이 · 직육면체 도감 주문.
 * 처음 화면을 거치지 않고 ?stage=로 바로 들어간다. 배치 검사에는 글자 폭에 묶인 픽셀 상수를 쓰지 않는다(docs/engine.md 11절).
 * 크기·자리는 움직임이 끝난 뒤에 재고(settled), 사라지는 알림은 띄운 조작 바로 뒤에 지켜본다(watchToasts — common-rules 8절).
 */
import { expect, test } from '@playwright/test';
import { transformNet } from '../../src/games/net-workshop/fold.js';
import {
  BOX_AXES,
  CUBOID_BOARDS,
  DEFAULT_BOX,
  boxBoard,
  boxCards,
  boxCatalog,
  boxText,
  centerOnBoard,
  cuboidHintNet,
  freeNets,
} from '../../src/games/net-workshop/cuboid-logic.js';
import { collectErrors, expectNoFling, fileUrl, hasHorizontalScroll, touchGestures } from './helpers.js';

const FILE = 'net-workshop.html';
const STAGE_URL = (id, extra = '') => fileUrl(FILE, `?unlock=all&seed=1&sound=off&stage=${id}${extra}`);
const SIZES = { chromebook: { width: 1366, height: 768 }, low: { width: 1366, height: 680 }, tablet: { width: 820, height: 1180 }, phone: { width: 390, height: 844 } };
const sizesFor = (testInfo) => (testInfo.project.name === 'chromebook' ? [SIZES.chromebook, SIZES.low] : [SIZES.tablet, SIZES.phone]);
const storedXpOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards'))?.xp ?? 0);
const stored = (page, id) => page.evaluate((key) => Object.keys((JSON.parse(localStorage.getItem('edu:net-workshop:collections')) ?? {})[key] ?? {}), id);
const folded = (page) => expect(page.locator('.fold-stage')).toHaveAttribute('data-fold', 'done');

/** 그 요소들(과 그 안)의 움직임이 끝날 때까지 (끝없이 도는 움직임 · 자리를 바꾸지 않는 강조는 기다리지 않는다) */
const settled = (page, selector = '.screen') => page.waitForFunction((sel) => [...document.querySelectorAll(sel)].every((el) => el.getAnimations({ subtree: true }).every((a) => (
  a.playState !== 'running' || a.animationName === 'turn-hint' || a.effect?.getComputedTiming().iterations === Infinity))), selector);

async function noScroll(page, label = '') {
  await settled(page);
  const over = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  if (page.viewportSize().width > 560) expect(over, `${label} 세로 넘침`).toBeLessThanOrEqual(0);
  expect(await hasHorizontalScroll(page), `${label} 가로 스크롤`).toBe(false);
}

/** 오른쪽 판 안쪽이 넘치지 않고, 판 안의 보이는 버튼이 잘리지 않으며 48px 이상이다 */
async function expectPanelFits(page, label = '') {
  await settled(page, '.net-panel');
  const m = await page.evaluate(() => {
    const panel = document.querySelector('.net-panel');
    const box = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    const top = box.top + parseFloat(style.borderTopWidth);
    const bottom = box.bottom - parseFloat(style.borderBottomWidth);
    const buttons = [...panel.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0).map((b) => {
      const r = b.getBoundingClientRect();
      return { text: b.textContent.trim().slice(0, 12), height: Math.round(r.height), width: Math.round(r.width), cut: Math.round(Math.max(0, r.bottom - bottom, top - r.top)) };
    });
    return {
      over: panel.scrollHeight - panel.clientHeight,
      small: buttons.filter((b) => b.height < 48 || b.width < 48).map((b) => `${b.text} ${b.width}×${b.height}`),
      cut: buttons.filter((b) => b.cut > 0).map((b) => `${b.text} ${b.cut}px`),
    };
  });
  expect({ over: m.over, small: m.small, cut: m.cut }, label).toEqual({ over: 0, small: [], cut: [] });
}

/** 머리·제목·목표·매트의 문서 자리 (플레이 도중 움직이지 않아야 한다) */
const spot = (page) => page.evaluate(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el || el.getClientRects().length === 0) return null;
    const b = el.getBoundingClientRect();
    return [b.left + window.scrollX, b.top + window.scrollY, b.width, b.height].map((v) => Math.round(v * 100) / 100);
  };
  return { header: rect('.play-header'), title: rect('.play-title'), goal: rect('.play-goal'), mat: rect('.mat') };
});

/** 알림을 지켜본다(뜬 알림의 종류·글을 window.toastLog에) — 사라지는 알림은 띄운 조작 전에 지켜보기 시작한다 */
async function watchToasts(page) {
  await page.evaluate(() => {
    window.toastLog = [];
    if (window.toastSeen) return;
    window.toastSeen = new WeakSet();
    new MutationObserver(() => {
      for (const toast of document.querySelectorAll('.toast')) {
        if (window.toastSeen.has(toast)) continue;
        window.toastSeen.add(toast);
        window.toastLog.push({ type: toast.className.match(/toast-(\w+)/)?.[1] ?? '', text: toast.textContent });
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}
const toasted = (page, type, text) => expect.poll(() => page.evaluate((kind) => window.toastLog.filter((x) => x.type === kind).map((x) => x.text).join('\n'), type)).toContain(text);

// ── 놓는 판 도우미 ─────────────────────────────
const cellOf = (page, [x, y]) => page.locator(`.rect-board .cell[data-cell="${x},${y}"]`);
const tileOf = (page, label) => page.locator(`.rect-tile[data-label="${label}"]`);
const tileRect = (page, label) => tileOf(page, label).evaluate((el) => ['x', 'y', 'w', 'h'].map((k) => Number(el.style.getPropertyValue(`--${k}`))));
const valueOf = async (page, i) => Number((await page.locator(`.box-stepper[data-axis="${i}"] .box-value`).textContent()).replace(/\D/g, ''));

/** 상자 크기 정하기를 열고 가로·세로·높이를 dims로 맞춘다(± 버튼). apply면 [이 크기로 만들기](놓인 면이 있으면 묻는 말에 [바꾸기]) */
async function setBox(page, dims, { apply = true } = {}) {
  if (!(await page.locator('.box-chooser').isVisible())) await page.locator('.box-change').click();
  await expect(page.locator('.box-chooser')).toBeVisible();
  for (const [i, want] of dims.entries()) {
    for (let now = await valueOf(page, i); now !== want; now = await valueOf(page, i)) {
      await page.locator(`.box-stepper[data-axis="${i}"] ${now < want ? '.box-more' : '.box-less'}`).click();
    }
  }
  if (!apply) return;
  await page.locator('.box-apply').click();
  if (await page.locator('.box-confirm-yes').isVisible()) await page.locator('.box-confirm-yes').click();
  await expect(page.locator('.box-chooser')).toBeHidden();
}

/** 그 상자의 전개도(이름)를 판 가운데에 놓은 모습 — 면마다 크기가 맞는 카드(가~바) */
function netFor(dims, id, board = boxBoard(dims), k = 0) {
  const item = boxCatalog(dims).list.find((n) => n.id === id) ?? boxCatalog(dims).list[0];
  const rects = centerOnBoard(transformNet(item.net, k), board);
  const left = boxCards(dims).map((c) => ({ ...c }));
  return rects.map((r) => {
    const i = left.findIndex((c) => (c.w === r.w && c.h === r.h) || (c.w === r.h && c.h === r.w));
    const [card] = left.splice(i, 1);
    return { ...r, label: card.label };
  });
}
/** 면을 그 자리에 놓는다: 카드를 고르고 → 왼쪽 위 칸을 누르고 → 방향이 다르면 면을 두 번 눌러 돌린다 */
async function buildNet(page, rects) {
  for (const r of rects) {
    await page.locator(`.rect-card[data-label="${r.label}"]`).click();
    await cellOf(page, [r.x, r.y]).click({ position: { x: 4, y: 4 } });
    if ((await tileRect(page, r.label))[2] !== r.w) {
      await tileOf(page, r.label).click();
      await tileOf(page, r.label).click();
    }
    expect(await tileRect(page, r.label), `${r.label} 면`).toEqual([r.x, r.y, r.w, r.h]);
  }
}
async function foldIt(page) {
  await page.locator('.free-fold').click();
  await folded(page);
}
async function fresh(page) {
  if (await page.locator('.reason-skip').isVisible()) await page.locator('.reason-skip').click();
  if (await page.locator('.free-new').isVisible()) await page.locator('.free-new').click();
  else if (await page.locator('.rect-tile').count() > 0) await page.locator('.tool-clear').click();
  await expect(page.locator('.rect-tile')).toHaveCount(0);
}

/** 64가지 크기를 한 칸씩만 바꾸며 도는 차례 (가로 → 세로 → 높이를 뱀처럼) */
function snakeBoxes() {
  const out = [];
  let up = true;
  for (let a = 1; a <= 4; a += 1) {
    const bs = a % 2 ? [1, 2, 3, 4] : [4, 3, 2, 1];
    for (const b of bs) {
      for (const c of up ? [1, 2, 3, 4] : [4, 3, 2, 1]) out.push([a, b, c]);
      up = !up;
    }
  }
  return out;
}

// ── 상자 크기 정하기 ─────────────────────────────
test('상자 크기 정하기: [크기 바꾸기] → 가로·세로·높이 ± (1~4 cm, 끝에서는 꺼짐) → 매트에 그 직육면체와 가로·세로·높이 이름표 → [이 크기로 만들기]면 면 카드 6장과 판이 그 상자에 맞게. 정육면체 안내, [그대로 두기]', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  // 처음 상자: 지금까지와 같은 1 · 2 · 3 cm (가로 3 · 세로 2 · 높이 1)의 카드와 12 × 8 판
  await expect(page.locator('.box-tip')).toHaveText(boxText(DEFAULT_BOX));
  await expect(page.locator('.rect-card .size-text')).toHaveText(['3×2 cm', '3×2 cm', '3×1 cm', '3×1 cm', '2×1 cm', '2×1 cm']);
  await expect(page.locator('.rect-board .board-row')).toHaveCount(8);
  await expect(page.locator('.rect-board .cell')).toHaveCount(12 * 8);
  await expect(page.locator('.fold-stage')).toHaveCount(1); // 상자 보기는 고르는 동안에만 생긴다
  await page.locator('.box-change').click();
  await expect(page.locator('.box-chooser')).toBeVisible();
  await expect(page.locator('.rect-board')).toBeHidden();
  await expect(page.locator('.box-stepper')).toHaveText([/^가로-3 cm\+$/, /^세로-2 cm\+$/, /^높이-1 cm\+$/]);
  await expect(page.locator('.box-stepper[data-axis="0"]')).toHaveAttribute('aria-label', '가로 3 cm');
  await expect(page.locator('.box-stepper[data-axis="2"] .box-less')).toBeDisabled(); // 1 cm보다 작게는 못 한다
  await expect(page.locator('.box-stage .fold-stage')).toHaveAttribute('data-fold', 'done');
  await expect(page.locator('.box-stage .edge-tag')).toHaveText(['가로 3 cm', '세로 2 cm', '높이 1 cm']);
  await expect(page.locator('.box-caption')).toHaveText(`직육면체 · ${boxText([3, 2, 1])}`);
  // ±로 고르면 상자와 이름표가 바로 바뀐다 (화면 읽기 "가로 4 cm")
  await page.locator('.box-stepper[data-axis="0"] .box-more').click();
  await expect(page.locator('.box-stepper[data-axis="0"]')).toHaveAttribute('aria-label', '가로 4 cm');
  await expect(page.locator('.box-stepper[data-axis="0"] .box-more')).toBeDisabled(); // 4 cm보다 크게는 못 한다
  await expect(page.locator('.box-stage .edge-tag').first()).toHaveText('가로 4 cm');
  await expect(page.locator('.box-cards')).toHaveText('면 6장: 4×2 cm 두 장 · 4×1 cm 두 장 · 2×1 cm 두 장');
  // 상자는 끌어서 돌려 볼 수 있다
  const stage = await page.locator('.box-stage .fold-stage').boundingBox();
  const before = await page.locator('.box-stage .net-scene').evaluate((el) => el.style.transform);
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width / 2 + 80, stage.y + stage.height / 2 + 10, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.locator('.box-stage .net-scene').evaluate((el) => el.style.transform)).not.toBe(before);
  // [그대로 두기]: 상자는 처음 그대로
  await page.locator('.box-cancel').click();
  await expect(page.locator('.box-chooser')).toBeHidden();
  await expect(page.locator('.box-tip')).toHaveText(boxText([3, 2, 1]));
  await expect(page.locator('.fold-stage')).toHaveCount(1);
  await expect(page.locator('.box-change')).toBeFocused();
  // 세 길이가 같으면 정육면체 안내 — 그대로 만들 수 있다
  await setBox(page, [2, 2, 2], { apply: false });
  await expect(page.locator('.box-notice')).toHaveText('세 모서리의 길이가 모두 같으면 정육면체예요. 정육면체도 직육면체라 그대로 만들 수 있어요.');
  await expect(page.locator('.box-apply')).toBeEnabled();
  await expect(page.locator('.box-caption')).toHaveText(`정육면체 · ${boxText([2, 2, 2])}`);
  // 2 × 3 × 4 cm로 만든다: 카드 · 판 · 안내가 그 상자에 맞게
  await setBox(page, [2, 3, 4]);
  await expect(page.locator('.box-tip')).toHaveText(boxText([2, 3, 4]));
  await expect(page.locator('.rect-card .size-text')).toHaveText(['3×2 cm', '3×2 cm', '4×2 cm', '4×2 cm', '4×3 cm', '4×3 cm']);
  const board = boxBoard([2, 3, 4]);
  await expect(page.locator('.rect-board .board-row')).toHaveCount(board.rows);
  await expect(page.locator('.rect-board .cell')).toHaveCount(board.cols * board.rows);
  await expect(page.locator('.fold-stage')).toHaveCount(1);
  // 그 상자의 전개도를 놓고 접는다: 새 전개도 +7
  await buildNet(page, netFor([2, 3, 4], '123-07', board));
  await foldIt(page);
  await expect(page.locator('.reason')).toContainText('새 전개도 발견');
  await expect(page.locator('.meta-xp b')).toHaveText('+7');
  expect(await stored(page, 'cuboid-nets')).toEqual(['123-07']);
  expect(errors).toEqual([]);
});

test('같은 전개도는 크기만 바꿔 다시 접으면 다시 세지 않는다(같은 판 · 다른 판). 두 길이가 같은 상자는 다른 모음, 정육면체 상자는 1차시의 정육면체 도감에. 놓인 면이 있으면 크기를 바꾸기 전에 한 번 묻는다', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  await page.evaluate(() => localStorage.clear());
  await page.goto(STAGE_URL('cuboid-free'));
  // 1 · 2 · 3 cm 상자의 123-20
  await buildNet(page, netFor([3, 2, 1], '123-20'));
  await foldIt(page);
  await expect(page.locator('.meta-xp b')).toHaveText('+7');
  // 같은 모양을 4 × 3 × 2 cm로: 이번에 이미 접어 본 모양 (점수 · 기록 없음)
  await page.locator('.free-new').click();
  await setBox(page, [4, 3, 2]);
  await buildNet(page, netFor([4, 3, 2], '123-20'));
  await foldIt(page);
  await expect(page.locator('.reason')).toContainText('이미 접어 본 모양');
  await expect(page.locator('.bonus-note')).toContainText('크기만 바꿔도 다시 세지 않아요');
  await expect(page.locator('.meta-xp b')).toHaveText('+7');
  // 놓인 면이 있으면 크기를 바꾸기 전에 묻는다: [취소]면 그대로, [바꾸기]면 판의 면을 모두 거둔다
  await page.locator('.free-fix').click();
  await expect(page.locator('.rect-tile')).toHaveCount(6);
  await setBox(page, [2, 2, 1], { apply: false });
  await page.locator('.box-apply').click();
  await expect(page.locator('.box-confirm-text')).toHaveText('판에 놓은 면 6장을 모두 거두고 새 크기의 면 카드로 바꿀까요?');
  await expect(page.locator('.box-confirm-yes')).toBeFocused();
  await page.locator('.box-confirm-no').click();
  await expect(page.locator('.box-confirm')).toBeHidden();
  await page.locator('.box-cancel').click();
  await expect(page.locator('.rect-tile')).toHaveCount(6);
  await expect(page.locator('.box-tip')).toHaveText(boxText([4, 3, 2]));
  await setBox(page, [2, 2, 1]); // [바꾸기]
  await expect(page.locator('.rect-tile')).toHaveCount(0);
  await expect(page.locator('.rect-card .size-text')).toHaveText(['2×2 cm', '2×2 cm', '2×1 cm', '2×1 cm', '2×1 cm', '2×1 cm']);
  // 두 길이가 같은 상자: 다른 모음(cuboid-pair-nets), 처음 찾은 전개도 +7
  const pairId = boxCatalog([2, 2, 1]).list[3].id;
  await buildNet(page, netFor([2, 2, 1], pairId));
  await foldIt(page);
  await expect(page.locator('.meta-xp b')).toHaveText('+14');
  expect(await stored(page, 'cuboid-pair-nets')).toEqual([pairId]);
  await expect(page.locator('.found-count')).toHaveText('지금까지 2가지'); // 직육면체 전개도(세 길이가 다른 것 + 두 길이가 같은 것)
  // 정육면체 상자: 1차시의 정육면체 전개도 도감에 넣는다(십자 = 1-4-1e). 무대 도장은 정육면체 도감의 칸 수
  await page.locator('.free-new').click();
  await setBox(page, [2, 2, 2]);
  await buildNet(page, netFor([2, 2, 2], '1-4-1e'));
  await foldIt(page);
  await expect(page.locator('.reason')).toContainText('1차시의 전개도 도감에 넣었어요');
  await expect(page.locator('.found-stamp')).toContainText('도감 1 / 11');
  await expect(page.locator('.stage-badge')).toHaveText('정육면체가 됐어요');
  expect(await stored(page, 'cube-nets')).toEqual(['1-4-1e']);
  await expect(page.locator('.meta-xp b')).toHaveText('+22'); // 처음 찾은 전개도 셋을 연달아: 7 × 3 + 연속 1
  expect(await storedXpOf(page)).toBe(22); // 화면 = 저장 (모두 그 자리에서 저장된다)
  // 정육면체 차시의 내 맘대로 전개도에서 같은 십자를 접으면: 이 기기에서 이미 찾은 전개도라 점수가 없다(모양마다 한 번)
  await page.goto(STAGE_URL('cube-free'));
  for (const [x, y] of [[2, 1], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3]]) await page.locator(`.free-board .cell[data-cell="${x},${y}"]`).click();
  await page.locator('.free-fold').click();
  await folded(page);
  await expect(page.locator('.bonus-note')).toContainText('전에 접어 본 모양');
  await expect(page.locator('.meta-xp b')).toHaveText('+0');
  expect(await storedXpOf(page)).toBe(22);
  expect(errors).toEqual([]);
});

test('배치(크기 64가지 × 네 크기): 상자를 고르는 장면과 그 상자의 놓는 판 모두 세로·가로 스크롤 0, 판 안쪽 넘침 0, 버튼 48px · 잘림 0, 판과 상자는 매트 안, 머리·매트는 0px 움직인다. 큰 상자는 접은 장면까지', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  for (const size of sizesFor(testInfo)) {
    const phone = size.width <= 560;
    await page.setViewportSize(size);
    await page.goto(STAGE_URL('cuboid-free'));
    await page.waitForFunction(() => document.querySelector('.screen-play').getAnimations().every((a) => a.playState === 'finished'));
    const start = await spot(page);
    const at = (label) => `${size.width}×${size.height} ${label}`;
    const inside = () => page.evaluate(() => {
      const mat = document.querySelector('.mat').getBoundingClientRect();
      const box = (el) => el.getBoundingClientRect();
      const within = (b, o, slack = 0.5) => b.left >= o.left - slack && b.right <= o.right + slack && b.top >= o.top - slack && b.bottom <= o.bottom + slack;
      const board = document.querySelector('.rect-board');
      const out = {};
      if (board && board.getClientRects().length > 0) {
        const tools = box(document.querySelector('.edit-tools'));
        out.board = within(box(board), box(document.querySelector('.free-host'))) && box(board).bottom <= tools.top + 1 && within(box(board), mat);
        out.cell = parseFloat(getComputedStyle(board).getPropertyValue('--cell'));
      }
      const faces = [...document.querySelectorAll('.box-stage .net-face')];
      if (faces.length > 0) {
        const stage = box(document.querySelector('.box-stage'));
        out.box = faces.every((f) => within(box(f), stage, 1)) && within(stage, mat);
        out.tags = document.querySelectorAll('.box-stage .edge-tag').length;
      }
      return out;
    });
    let last = [...DEFAULT_BOX];
    for (const dims of [[1, 1, 1], ...snakeBoxes().slice(1)]) {
      const label = at(dims.join('×'));
      // 고르는 장면: 한 축씩 바꾼다(처음엔 1 · 1 · 1까지)
      await setBox(page, dims, { apply: false });
      await noScroll(page, `${label} 고르는 중`);
      if (!phone) await expectPanelFits(page, `${label} 고르는 중`);
      expect(await inside(), `${label} 고르는 중`).toMatchObject({ box: true, tags: 3 });
      await page.locator('.box-apply').click();
      await expect(page.locator('.box-chooser')).toBeHidden();
      await expect(page.locator('.box-tip')).toHaveText(boxText(dims));
      await noScroll(page, label);
      if (!phone) await expectPanelFits(page, label);
      const m = await inside();
      expect(m.board, `${label} 판이 매트 안`).toBe(true);
      expect(m.cell, `${label} 1 cm 칸`).toBeGreaterThanOrEqual(24);
      expect(await spot(page), `${label} 머리·매트`).toEqual(start);
      last = dims;
    }
    expect(last).toEqual(snakeBoxes().at(-1));
    // 큰 상자는 접은 장면까지 (판이 큰 상자 넷)
    for (const dims of [[4, 4, 4], [1, 1, 4], [2, 3, 4], [4, 1, 4]]) {
      if (phone && dims.join() === '4,4,4') continue; // 휴대폰 판에는 다 들어가지 않는 전개도가 있다
      await setBox(page, dims);
      const board = boxBoard(dims, { phone });
      const net = boxCatalog(dims).list.find((n) => centerOnBoard(n.net, board));
      await buildNet(page, netFor(dims, net.id, board));
      await foldIt(page);
      await noScroll(page, at(`${dims.join('×')} 접음`));
      if (!phone) await expectPanelFits(page, at(`${dims.join('×')} 접음`));
      expect(await spot(page), at(`${dims.join('×')} 접음: 머리·매트`)).toEqual(start);
      await fresh(page);
    }
  }
  expect(errors).toEqual([]);
});

// ── 돌리기 손잡이 ─────────────────────────────
test('돌리기 손잡이(마우스): 면을 누르면 모서리에 ↻ 손잡이(48px, "가 면 돌리기 손잡이, 지금 0°") → 잡고 돌리면 면이 따라 돌다가 놓으면 가장 가까운 90° — 가운데를 축으로, 두 번 돌리면 제자리. 반 바퀴는 그대로, 누르면 90°, 자리가 없으면 제자리 + 알림', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '마우스는 크롬북 화면에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  const handle = page.locator('.turn-handle-board');
  await expect(page.locator('.turn-handle')).toHaveCount(2);
  await expect(page.locator('.turn-handle:visible')).toHaveCount(0);
  await page.locator('.rect-card[data-label="가"]').click();
  await cellOf(page, [4, 3]).click({ position: { x: 4, y: 4 } });
  expect(await tileRect(page, '가')).toEqual([4, 3, 3, 2]);
  await expect(handle).toBeHidden();
  await tileOf(page, '가').click();
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute('aria-label', '가 면 돌리기 손잡이, 지금 0°');
  await settled(page);
  const hb = await handle.boundingBox();
  expect([Math.round(hb.width), Math.round(hb.height)]).toEqual([48, 48]);
  // 손잡이는 면의 오른쪽 위 모서리에 있다
  const tb = await tileOf(page, '가').evaluate((el) => {
    const board = el.closest('.rect-board').getBoundingClientRect();
    const cell = parseFloat(getComputedStyle(el.closest('.rect-board')).getPropertyValue('--cell'));
    return { x: board.left + 7 * cell, y: board.top + 3 * cell, cx: board.left + 5.5 * cell, cy: board.top + 4 * cell };
  });
  expect(Math.abs(hb.x + hb.width / 2 - tb.x)).toBeLessThan(1);
  expect(Math.abs(hb.y + hb.height / 2 - tb.y)).toBeLessThan(1);
  /** 손잡이를 잡고 면의 가운데를 중심으로 deg만큼 돌린다 (끝까지 가기 전에 check) */
  const turn = async (deg, check = null) => {
    await settled(page);
    const [x, y, w, h] = await tileRect(page, '가');
    const unit = await page.locator('.rect-board').evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--cell')));
    const origin = await page.locator('.rect-board').boundingBox();
    tb.cx = origin.x + (x + w / 2) * unit;
    tb.cy = origin.y + (y + h / 2) * unit;
    const b = await handle.boundingBox();
    const [hx, hy] = [b.x + b.width / 2, b.y + b.height / 2];
    const r = Math.hypot(hx - tb.cx, hy - tb.cy);
    const a0 = Math.atan2(hy - tb.cy, hx - tb.cx);
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      const a = a0 + ((deg * Math.PI) / 180) * (i / 12);
      await page.mouse.move(tb.cx + r * Math.cos(a), tb.cy + r * Math.sin(a));
      if (i === 6 && check) await check();
    }
    await page.mouse.up();
  };
  // 시계 방향 90°: 돌리는 도중에는 면이 손을 따라 돈다(45°쯤), 놓으면 90°로 맞춰져 가로·세로가 바뀐다 (가운데를 축으로)
  await turn(90, async () => {
    const rot = await tileOf(page, '가').evaluate((el) => parseFloat(getComputedStyle(el).rotate));
    expect(rot).toBeGreaterThan(30);
    expect(rot).toBeLessThan(60);
    await expect(page.locator('.free-play')).toHaveClass(/is-turning-face/);
  });
  expect(await tileRect(page, '가')).toEqual([4, 3, 2, 3]);
  await expect(handle).toHaveAttribute('aria-label', '가 면 돌리기 손잡이, 지금 90°');
  expect(await tileOf(page, '가').evaluate((el) => getComputedStyle(el).rotate)).toBe('none');
  // 끈 뒤 따라오는 click은 한 번 더 돌리지 않는다 · 반 바퀴는 가로·세로 그대로
  await turn(180);
  expect(await tileRect(page, '가')).toEqual([4, 3, 2, 3]);
  // 손잡이를 누르기만 하면 90°: 두 번 돌리면 늘 제자리(돌릴수록 한쪽으로 흘러가지 않는다)
  for (let i = 0; i < 5; i += 1) {
    await handle.click();
    expect(await tileRect(page, '가')).toEqual(i % 2 ? [4, 3, 2, 3] : [4, 3, 3, 2]);
  }
  await expect(tileOf(page, '가')).toHaveClass(/is-selected/); // 돌려도 고른 채로 둔다
  // 자리가 없으면 제자리 + 알림: 가(3 × 2)의 아래 · 오른쪽을 막는다
  await page.locator('.rect-card[data-label="다"]').click();
  await cellOf(page, [4, 5]).click({ position: { x: 4, y: 4 } });
  await page.locator('.rect-card[data-label="나"]').click();
  await cellOf(page, [7, 3]).click({ position: { x: 4, y: 4 } });
  await page.locator('.rect-card[data-label="라"]').click();
  await cellOf(page, [4, 2]).click({ position: { x: 4, y: 4 } });
  await page.locator('.rect-card[data-label="마"]').click();
  await cellOf(page, [2, 3]).click({ position: { x: 4, y: 4 } });
  expect(await tileRect(page, '마')).toEqual([2, 3, 2, 1]);
  await tileOf(page, '가').click();
  await watchToasts(page);
  await handle.click();
  await toasted(page, 'info', '돌릴 자리가 모자라요');
  expect(await tileRect(page, '가')).toEqual([4, 3, 3, 2]);
  expect(errors).toEqual([]);
});

test('끄는 중 돌리기(마우스): 면을 끄는 동안 R 키 · 오른쪽 버튼으로 90° — 끄는 면(복제)과 놓일 자리가 함께 돌고, 놓으면 돌린 대로 놓인다. 오른쪽 버튼의 메뉴는 뜨지 않는다. 카드 칸의 카드도', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '마우스는 크롬북 화면에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  await page.evaluate(() => {
    window.menus = 0;
    window.addEventListener('contextmenu', (e) => {
      if (!e.defaultPrevented) window.menus += 1;
    });
  });
  const cell = await cellOf(page, [0, 0]).boundingBox();
  const mid = (b) => [b.x + b.width / 2, b.y + b.height / 2];
  const ghostSize = () => page.evaluate(() => {
    const g = document.querySelector('body > .dnd-ghost');
    const b = g?.getBoundingClientRect();
    return b ? [Math.round(b.width / 10), Math.round(b.height / 10)] : null;
  });
  const previewRect = () => page.locator('.rect-preview').evaluate((el) => (el.hidden ? null : ['x', 'y', 'w', 'h'].map((k) => Number(el.style.getPropertyValue(`--${k}`)))));
  // 카드(가: 3 × 2)를 끌다가 R → 2 × 3으로, 가운데를 (6, 4) 칸에
  const card = mid(await page.locator('.rect-card[data-label="가"]').boundingBox());
  const to = mid(await cellOf(page, [6, 4]).boundingBox());
  await page.mouse.move(...card);
  await page.mouse.down();
  await page.mouse.move(card[0] - 20, card[1], { steps: 3 });
  await page.mouse.move(...to, { steps: 8 });
  expect(await previewRect()).toEqual([5, 4, 3, 2]);
  await page.keyboard.press('r');
  expect(await previewRect()).toEqual([6, 3, 2, 3]);
  await expect(page.locator('body > .dnd-ghost .size-text')).toHaveText('2×3 cm');
  await page.mouse.up();
  expect(await tileRect(page, '가')).toEqual([6, 3, 2, 3]);
  await expect(page.locator('.dnd-ghost')).toHaveCount(0);
  // 놓인 면을 끌다가 오른쪽 버튼 → 다시 3 × 2. 집은 칸(왼쪽 위 칸)은 포인터 아래 그대로 돈다
  const grab = [(await tileOf(page, '가').boundingBox()).x + cell.width / 2, (await tileOf(page, '가').boundingBox()).y + cell.height / 2];
  const before = await ghostSize();
  expect(before).toBeNull();
  await page.mouse.move(...grab);
  await page.mouse.down();
  await page.mouse.move(grab[0] + 20, grab[1] + 5, { steps: 3 });
  const target = mid(await cellOf(page, [2, 2]).boundingBox());
  await page.mouse.move(...target, { steps: 6 });
  const [w0, h0] = await ghostSize();
  expect(h0).toBeGreaterThan(w0);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  const [w1, h1] = await ghostSize();
  expect([w1, h1]).toEqual([h0, w0]);
  expect(await previewRect()).toEqual([0, 2, 3, 2]); // 집은 칸: 2 × 3의 왼쪽 위 (0, 0) → 시계 방향으로 돌린 3 × 2에서 오른쪽 위 (2, 0)
  await page.mouse.up();
  expect(await tileRect(page, '가')).toEqual([0, 2, 3, 2]);
  expect(await page.evaluate(() => window.menus)).toBe(0);
  // 끄지 않을 때의 R은 지금까지처럼 판의 키보드 돌리기(커서 칸의 면)만 한다 — 손잡이·끌기와 섞이지 않는다
  await expect(page.locator('.rect-tile')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('돌리기 손잡이(터치): 면을 톡 → 손잡이를 손가락으로 돌리면 90°(돌리는 동안 화면이 쓸리지 않고 관성 0, 끝난 뒤 첫 탭이 먹힌다). 카드를 끄는 중에 다른 손가락으로 톡 → 90°, 그 손가락이 닿은 버튼은 눌리지 않는다', async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', '터치는 태블릿 화면에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  await page.evaluate(() => {
    window.clicked = [];
    document.addEventListener('click', (e) => window.clicked.push(e.target.closest('button')?.className ?? ''), true);
  });
  const cdp = await page.context().newCDPSession(page);
  const mid = (b) => [b.x + b.width / 2, b.y + b.height / 2];
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await cellOf(page, [4, 3]).tap({ position: { x: 4, y: 4 } }); // 빈 칸 누르기: 가(3 × 2)가 놓인다
  expect(await tileRect(page, '가')).toEqual([4, 3, 3, 2]);
  await tileOf(page, '가').tap();
  const handle = page.locator('.turn-handle-board');
  await expect(handle).toBeVisible();
  await settled(page);
  const center = mid(await tileOf(page, '가').evaluate((el) => {
    const b = el.closest('.rect-board').getBoundingClientRect();
    const cell = parseFloat(getComputedStyle(el.closest('.rect-board')).getPropertyValue('--cell'));
    return { x: b.left + 4 * cell, y: b.top + 3 * cell, width: 3 * cell, height: 2 * cell };
  }));
  const [hx, hy] = mid(await handle.boundingBox());
  const r = Math.hypot(hx - center[0], hy - center[1]);
  const a0 = Math.atan2(hy - center[1], hx - center[0]);
  const prevented = [];
  await page.evaluate(() => {
    window.moves = [];
    window.addEventListener('touchmove', (e) => setTimeout(() => window.moves.push(e.defaultPrevented)), { passive: true });
  });
  const seen = await touchGestures(browser, page, async () => {
    await touch('touchStart', [{ x: hx, y: hy, id: 1 }]);
    for (let i = 1; i <= 12; i += 1) {
      const a = a0 + (Math.PI / 2) * (i / 12);
      await touch('touchMove', [{ x: center[0] + r * Math.cos(a), y: center[1] + r * Math.sin(a), id: 1 }]);
    }
    await touch('touchEnd', [{ x: center[0] + r * Math.cos(a0 + Math.PI / 2), y: center[1] + r * Math.sin(a0 + Math.PI / 2), id: 1 }]);
  });
  expect(await tileRect(page, '가')).toEqual([4, 3, 2, 3]);
  prevented.push(...await page.evaluate(() => window.moves));
  expect(prevented.length).toBeGreaterThan(0);
  expect(prevented.every(Boolean), '손잡이를 돌리는 동안의 touchmove는 쓴 것으로 알린다').toBe(true);
  expectNoFling(expect, testInfo, seen);
  // 돌린 바로 뒤의 첫 탭이 먹힌다: 손잡이를 톡 → 90°
  await handle.tap();
  expect(await tileRect(page, '가')).toEqual([4, 3, 3, 2]);
  // 카드(나)를 끄는 중에 다른 손가락으로 [크기 바꾸기] 자리를 톡: 끄는 카드만 돌고, 버튼은 눌리지 않는다
  await page.evaluate(() => {
    window.clicked = [];
  });
  const from = mid(await page.locator('.rect-card[data-label="나"]').boundingBox());
  const to = mid(await cellOf(page, [9, 4]).boundingBox());
  const other = mid(await page.locator('.box-change').boundingBox());
  await touch('touchStart', [{ x: from[0], y: from[1], id: 1 }]);
  for (let i = 1; i <= 10; i += 1) await touch('touchMove', [{ x: from[0] + ((to[0] - from[0]) * i) / 10, y: from[1] + ((to[1] - from[1]) * i) / 10, id: 1 }]);
  await touch('touchStart', [{ x: to[0], y: to[1], id: 1 }, { x: other[0], y: other[1], id: 2 }]);
  await touch('touchEnd', [{ x: other[0], y: other[1], id: 2 }]); // 다른 손가락만 뗀다
  await expect(page.locator('body > .dnd-ghost .size-text')).toHaveText('2×3 cm');
  await expect(page.locator('.rect-preview')).toBeVisible();
  await touch('touchEnd', [{ x: to[0], y: to[1], id: 1 }]);
  expect(await tileRect(page, '나')).toEqual([9, 3, 2, 3]);
  await expect(page.locator('.box-chooser')).toBeHidden();
  expect(await page.evaluate(() => window.clicked.filter((c) => c.includes('box-change')))).toEqual([]);
  // 끈 바로 뒤의 첫 탭이 먹힌다: 빈 칸을 누르면 다음 카드(다)가 놓인다
  await cellOf(page, [0, 0]).tap({ position: { x: 4, y: 4 } });
  expect(await tileRect(page, '다')).toEqual([0, 0, 3, 1]);
  expect(errors).toEqual([]);
});

test('돌리기 손잡이(키보드만): 크기 고르기(Tab · Enter) → 카드를 Enter로 골라 Tab 한 번에 손잡이 → Enter로 90°(카드가 1×3 cm로) → 판에 놓기 → 판의 면을 Enter로 들고 Tab으로 손잡이 → → 키로 90° → Esc로 판의 칸에 초점이 돌아온다 → 접기', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  // 크기 고르기: [크기 바꾸기]에서 Enter → 첫 초점은 가로의 ±. 세로 1 cm 늘리기 → [이 크기로 만들기]
  await page.locator('.box-change').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.box-stepper[data-axis="0"] .box-more')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('.box-stepper[data-axis="1"] .box-more')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.box-stepper[data-axis="1"]')).toHaveAttribute('aria-label', '세로 3 cm');
  await page.locator('.box-apply').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.box-tip')).toHaveText(boxText([3, 3, 1]));
  await expect(page.locator('.rect-card').first()).toBeFocused();
  // 카드(다: 3 × 1)를 Enter로 고르면 Tab 한 번에 그 카드의 손잡이
  await page.locator('.rect-card[data-label="다"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.rect-card[data-label="다"]')).toHaveClass(/is-selected/);
  await expect(page.locator('.turn-handle-tray')).toBeVisible();
  await page.keyboard.press('Tab');
  const trayHandle = page.locator('.turn-handle-tray');
  await expect(trayHandle).toBeFocused();
  await expect(trayHandle).toHaveAttribute('aria-label', '다 면 돌리기 손잡이, 지금 0°');
  expect(await trayHandle.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none'); // 초점 표시
  await page.keyboard.press('Enter');
  await expect(page.locator('.rect-card[data-label="다"] .size-text')).toHaveText('1×3 cm');
  await expect(page.locator('.rect-card[data-label="다"]')).toHaveAttribute('aria-label', '다 면 카드, 가로 1 cm, 세로 3 cm');
  await expect(trayHandle).toBeFocused();
  await expect(trayHandle).toHaveAttribute('aria-label', '다 면 돌리기 손잡이, 지금 90°');
  // 판으로: 판의 칸 하나만 Tab에 걸린다. 고른 카드를 그 칸에 Enter → 돌린 대로(1 × 3) 놓인다
  await page.locator('.rect-board .cell[tabindex="0"]').focus();
  const [cx, cy] = (await page.locator('.rect-board .cell[tabindex="0"]').getAttribute('data-cell')).split(',').map(Number);
  await page.keyboard.press('Enter');
  expect(await tileRect(page, '다')).toEqual([cx, cy, 1, 3]);
  // 놓인 면을 Enter로 들고 Tab → 판의 손잡이 → →로 90° (가운데를 축으로) → Esc
  await page.keyboard.press('Enter');
  await expect(tileOf(page, '다')).toHaveClass(/is-held/);
  await page.keyboard.press('Tab');
  const boardHandle = page.locator('.turn-handle-board');
  await expect(boardHandle).toBeFocused();
  await page.keyboard.press('ArrowRight');
  expect(await tileRect(page, '다')).toEqual([cx - 1, cy + 1, 3, 1]);
  await expect(boardHandle).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  expect(await tileRect(page, '다')).toEqual([cx, cy, 1, 3]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.rect-board .cell[tabindex="0"]')).toBeFocused();
  await expect(boardHandle).toBeHidden();
  await expect(page.locator('.rect-tile.is-held')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('정사각형 면에는 손잡이가 없다: 정육면체 상자(2 cm)의 면을 눌러도 손잡이가 보이지 않고, 두 길이가 같은 상자는 정사각형 면에만 없다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '크롬북 화면에서 한 번');
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  await setBox(page, [2, 2, 2]);
  await cellOf(page, [3, 2]).click({ position: { x: 4, y: 4 } });
  await tileOf(page, '가').click();
  await expect(tileOf(page, '가')).toHaveClass(/is-selected/);
  await expect(page.locator('.turn-handle:visible')).toHaveCount(0);
  await page.locator('.rect-card[data-label="나"]').click();
  await expect(page.locator('.turn-handle:visible')).toHaveCount(0);
  await page.locator('.rect-card[data-label="나"]').click();
  await setBox(page, [2, 2, 3]);
  await page.locator('.rect-card[data-label="가"]').click(); // 2 × 2
  await expect(page.locator('.turn-handle:visible')).toHaveCount(0);
  await page.locator('.rect-card[data-label="다"]').click(); // 3 × 2
  await expect(page.locator('.turn-handle-tray')).toBeVisible();
  expect(errors).toEqual([]);
});

// ── 직육면체 도감 주문 ─────────────────────────────
async function seedOld(page, { cuboid = [], pair = [], cube = [] } = {}) {
  await page.evaluate(({ cuboid: c, pair: p, cube: q }) => {
    const entries = (list) => Object.fromEntries(list.map((id, i) => [id, { at: 1000 + i, stage: 'cuboid-free' }]));
    localStorage.setItem('edu:net-workshop:collections', JSON.stringify({ 'cuboid-nets': entries(c), ...(p.length ? { 'cuboid-pair-nets': entries(p) } : {}), ...(q.length ? { 'cube-nets': entries(q) } : {}) }));
  }, { cuboid, pair, cube });
}

test('직육면체 도감 주문: 옛 저장 값(내 맘대로에서 찾은 9가지)이 이어진다 → 10번째 +7 · "도감 10가지! 별 1개" 도장 → [오늘은 여기까지] 별 1개와 별 기준 → 다시 열면 그대로. 도감 보기 54칸(찾은 칸만 그림), 결과 복사 "직육면체 전개도 10/54"', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const ids = freeNets().filter((n) => centerOnBoard(n.net, CUBOID_BOARDS.wide)).map((n) => n.id);
  await page.goto(STAGE_URL('cuboid-dex'));
  await page.evaluate(() => localStorage.clear());
  await seedOld(page, { cuboid: ids.slice(0, 9) });
  await page.goto(STAGE_URL('cuboid-dex'));
  await expect(page.locator('.play-title')).toHaveText('직육면체 도감 주문');
  await expect(page.locator('.q-counter')).toHaveText('직육면체 도감 9 / 54');
  await expect(page.locator('.dex-strip-count')).toHaveText('9 / 54');
  await expect(page.locator('.meta-progress small')).toHaveText('별 0 / 3');
  await expect(page.locator('.timer-toggle')).toBeVisible(); // 시간 재기는 켜는 학생만
  await expect(page.locator('.free-stop')).toHaveCount(0); // 아직 접어 본 모양이 없다
  await expect(page.locator('.dex-rule')).toContainText('10가지 별 1개 · 20가지 별 2개 · 30가지 별 3개');
  // 도감 보기: 54칸, 찾은 9칸만 그림 — 못 찾은 칸에는 전개도를 알 수 있는 것이 없다
  await page.locator('.dex-open').click();
  await expect(page.locator('.dex-board')).toBeVisible();
  await expect(page.locator('.dex-board-close')).toBeFocused();
  await expect(page.locator('.dex-cell')).toHaveCount(54);
  await expect(page.locator('.dex-cell.is-found svg')).toHaveCount(9);
  await expect(page.locator('.dex-cell.is-empty')).toHaveCount(45);
  const empty = await page.locator('.dex-cell.is-empty').evaluateAll((els) => [...new Set(els.map((el) => `${el.textContent}|${[...el.attributes].map((a) => a.name).sort().join(',')}|${el.getAttribute('aria-label').replace(/\d+/, 'n')}`))]);
  expect(empty).toEqual(['?|aria-label,class|도감 n번, 아직 못 찾음']);
  await page.keyboard.press('Escape');
  await expect(page.locator('.dex-board')).toBeHidden();
  await expect(page.locator('.dex-open')).toBeFocused();
  // 10번째를 찾는다: +7, 무대 도장 "10가지! 별 1개", 쪽지에 별 안내
  const tenth = freeNets().find((n) => n.id === ids[9]);
  await buildNet(page, netFor([3, 2, 1], tenth.id));
  await foldIt(page);
  await expect(page.locator('.meta-xp b')).toHaveText('+7');
  await expect(page.locator('.found-stamp')).toContainText('10가지!');
  await expect(page.locator('.found-stamp')).toContainText('별 1개');
  await expect(page.locator('.reason')).toContainText('도감 10가지! 지금 끝내도 별 1개를 받아요.');
  await expect(page.locator('.q-counter')).toHaveText('직육면체 도감 10 / 54');
  await expect(page.locator('.meta-progress small')).toHaveText('별 1 / 3');
  await expect(page.locator('.free-stop .stop-sub')).toHaveText('지금 끝내면 별 1개 · 20가지면 별 2개');
  // 도감 보기: 방금 찾은 칸은 "이번에 찾음"
  await page.locator('.dex-open').click();
  await expect(page.locator('.dex-cell.is-found')).toHaveCount(10);
  await expect(page.locator('.dex-cell.is-new')).toHaveCount(1);
  await page.locator('.dex-board-close').click();
  // [오늘은 여기까지]: 별 1개, 별 기준 안내
  await page.locator('.free-stop').click();
  await expect(page.locator('.screen-result')).toBeVisible();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 1개');
  await expect(page.locator('.screen-result')).toContainText('도감 20가지를 채우면 별 2개예요');
  await expect(page.locator('.screen-result')).not.toContainText(/정답률|예상|예측/);
  await expect(page.locator('.behavior').first()).toContainText('10 / 54');
  await page.keyboard.press('Escape');
  // 다시 열면 이어진다
  await page.goto(STAGE_URL('cuboid-dex'));
  await expect(page.locator('.q-counter')).toHaveText('직육면체 도감 10 / 54');
  expect((await stored(page, 'cuboid-nets')).length).toBe(10);
  // 결과 복사 문장 끝에 "직육면체 전개도 10/54"
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off'));
  await page.getByRole('button', { name: '학습 기록' }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copied = text; } } });
  });
  await page.getByRole('button', { name: '결과 복사' }).click();
  await expect.poll(() => page.evaluate(() => window.copied ?? '')).toMatch(/ · 직육면체 전개도 10\/54$/);
  await expect(page.locator('.report-table')).toContainText('직육면체 도감 주문');
  expect(errors).toEqual([]);
});

// 안 되는 배치 (처음 상자, 12칸 × 8줄 판 위): 옆면 네 장(가 다 나 라)을 한 줄로 놓고 작은 면 두 장을 붙인다
const STRIP = [{ label: '가', x: 3, y: 2, w: 2, h: 3 }, { label: '다', x: 5, y: 2, w: 1, h: 3 }, { label: '나', x: 6, y: 2, w: 2, h: 3 }, { label: '라', x: 8, y: 2, w: 1, h: 3 }];
const TOP = { label: '마', x: 3, y: 1, w: 2, h: 1 };
const BAD = {
  overlap: [...STRIP, TOP, { label: '바', x: 6, y: 1, w: 2, h: 1 }], // 작은 면 두 장이 같은 쪽
  length: [...STRIP, TOP, { label: '바', x: 6, y: 5, w: 1, h: 2 }], // 바 면을 돌려 붙임: 1 cm인 변이 2 cm인 변에
};

test('직육면체 도감 주문: 같은 길이가 있는 상자는 고를 수 없다("도감 주문은 세 모서리의 길이가 모두 달라야 해요"). 힌트 그림자는 도감에 없는 전개도, 세 길이가 다른 다른 크기로 찾은 전개도도 같은 도감 칸에', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-dex'));
  await page.evaluate(() => localStorage.clear());
  const ids = freeNets().filter((n) => centerOnBoard(n.net, CUBOID_BOARDS.wide)).map((n) => n.id);
  await seedOld(page, { cuboid: ids.slice(0, 3) });
  await page.goto(STAGE_URL('cuboid-dex'));
  // 힌트: 안 되는 모양을 두 번 → [힌트] → 글 → 그림자 = 도감에 없는 전개도 가운데 가장 작은 것
  if (page.viewportSize().width > 560) {
    for (const bad of [BAD.overlap, BAD.length]) {
      await fresh(page);
      await buildNet(page, bad);
      await foldIt(page);
      await page.locator('.reason-skip').click();
    }
    await page.locator('.free-fix').click();
    await expect(page.locator('.tool-hint')).toBeVisible();
    await expect(page.locator('.free-stop')).toBeVisible(); // 접어 본 모양이 있으니 별 0개라도 끝낼 수 있다
    await page.locator('.tool-hint').click();
    await expect(page.locator('.hint-sticky')).toContainText('길이가 3 cm인 변끼리');
    await page.locator('.tool-hint').click();
    await expect(page.locator('.rect-shadow')).toHaveCount(6);
    const shadow = await page.locator('.rect-shadow').evaluateAll((els) => els.map((el) => ['x', 'y', 'w', 'h'].map((k) => Number(el.style.getPropertyValue(`--${k}`))).join(',')));
    const dex = new Set(ids.slice(0, 3));
    const hint = cuboidHintNet(dex, CUBOID_BOARDS.wide, dex, [3, 2, 1]);
    expect(dex.has(hint.id)).toBe(false);
    expect(shadow.sort()).toEqual(centerOnBoard(hint.net, CUBOID_BOARDS.wide).map((r) => [r.x, r.y, r.w, r.h].join(',')).sort());
    await page.locator('.tool-clear').click();
  }
  // 같은 길이가 있는 상자는 고를 수 없다
  await setBox(page, [2, 2, 3], { apply: false });
  await expect(page.locator('.box-notice')).toHaveText('도감 주문은 세 모서리의 길이가 모두 달라야 해요.');
  await expect(page.locator('.box-apply')).toBeDisabled();
  await setBox(page, [3, 3, 3], { apply: false });
  await expect(page.locator('.box-apply')).toBeDisabled();
  // 세 길이가 다른 4 × 2 × 3 cm: 그 상자에서 찾은 전개도도 같은 54칸 도감에
  await setBox(page, [4, 2, 3]);
  await expect(page.locator('.box-tip')).toHaveText(boxText([4, 2, 3]));
  const board = boxBoard([4, 2, 3], { phone: page.viewportSize().width <= 560 });
  const fresh4 = boxCatalog([4, 2, 3]).list.find((n) => !ids.slice(0, 3).includes(n.id) && centerOnBoard(n.net, board));
  await buildNet(page, netFor([4, 2, 3], fresh4.id, board));
  await foldIt(page);
  await expect(page.locator('.meta-xp b')).toHaveText('+7');
  expect((await stored(page, 'cuboid-nets')).sort()).toEqual([...ids.slice(0, 3), fresh4.id].sort());
  await expect(page.locator('.q-counter')).toHaveText('직육면체 도감 4 / 54');
  // 이미 도감에 있는 전개도를 이 크기로 다시 접으면 "전에 찾은 전개도", 도감 보기에 그 칸이 "방금 접은 모양"
  await page.locator('.free-new').click();
  const known = boxCatalog([4, 2, 3]).list.find((n) => n.id === ids[0]);
  if (centerOnBoard(known.net, board)) {
    await buildNet(page, netFor([4, 2, 3], known.id, board));
    await foldIt(page);
    await expect(page.locator('.bonus-note')).toContainText('전에 찾은 전개도');
    await page.locator('.dex-open').click();
    await expect(page.locator('.dex-cell.is-same')).toHaveCount(1);
    await expect(page.locator('.dex-cell.is-same')).toHaveAttribute('aria-label', /방금 접은 모양/);
  }
  expect(errors).toEqual([]);
});

test('점수 상한의 경계(두 모음을 합쳐 센다)와 탭 두 개: 세 길이가 다른 것 9가지를 찾아 둔 기기를 두 탭에서 열어, 한 탭은 세 길이가 다른 것 · 다른 탭은 두 길이가 같은 것을 10번째로 찾아도 저장되는 것은 늘 한 탭의 한 쌍 — 10번째 점수를 두 번 받지 못한다', async ({ page, context }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  const ids = freeNets().filter((n) => centerOnBoard(n.net, CUBOID_BOARDS.wide)).map((n) => n.id);
  const pairIds = boxCatalog([2, 2, 1]).list.filter((n) => centerOnBoard(n.net, boxBoard([2, 2, 1]))).map((n) => n.id);
  const pairOf = async (p) => [(await stored(p, 'cuboid-nets')).length + (await stored(p, 'cuboid-pair-nets')).length, await storedXpOf(p)];
  const tabA = page;
  await tabA.goto(STAGE_URL('cuboid-free'));
  await tabA.evaluate(() => localStorage.clear());
  await seedOld(tabA, { cuboid: ids.slice(0, 9) });
  await tabA.reload();
  const tabB = await context.newPage();
  await tabB.goto(STAGE_URL('cuboid-free'));
  await expect(tabB.locator('.found-count')).toHaveText('지금까지 9가지');
  // A: 세 길이가 다른 것의 10번째 +7
  await tabA.bringToFront();
  await buildNet(tabA, netFor([3, 2, 1], ids[20]));
  await foldIt(tabA);
  await expect(tabA.locator('.meta-xp b')).toHaveText('+7');
  expect(await pairOf(tabA)).toEqual([10, 7]);
  // B: 두 길이가 같은 상자의 전개도 — B에게도 10번째라 +7로 보이지만, 저장은 B의 한 쌍(10가지 · 7점)
  await tabB.bringToFront();
  await setBox(tabB, [2, 2, 1]);
  await buildNet(tabB, netFor([2, 2, 1], pairIds[0]));
  await foldIt(tabB);
  await expect(tabB.locator('.meta-xp b')).toHaveText('+7');
  expect(await pairOf(tabB)).toEqual([10, 7]);
  // A가 하나 더(두 길이가 같은 다른 전개도): A에게는 11번째라 +1 → 저장은 A의 한 쌍(11가지 · 8점)
  await tabA.bringToFront();
  await tabA.locator('.free-new').click();
  await setBox(tabA, [2, 2, 1]);
  await buildNet(tabA, netFor([2, 2, 1], pairIds[1]));
  await foldIt(tabA);
  await expect(tabA.locator('.meta-xp b')).toHaveText('+8');
  await expect(tabA.locator('.bonus-note')).toContainText('새 발견 +1');
  await expect(tabA.locator('.bonus-note')).toContainText('10가지를 넘으면 새 전개도마다 1점이에요.');
  expect(await pairOf(tabA)).toEqual([11, 8]);
  // 새 탭: 저장된 것(A의 한 쌍)에 없는 B의 전개도는 12번째라 +1뿐 — 10번째의 7점을 다시 받지 못한다
  const tabC = await context.newPage();
  await tabC.goto(STAGE_URL('cuboid-free'));
  await expect(tabC.locator('.found-count')).toHaveText('지금까지 11가지');
  await setBox(tabC, [2, 2, 1]);
  await buildNet(tabC, netFor([2, 2, 1], pairIds[0]));
  await foldIt(tabC);
  await expect(tabC.locator('.meta-xp b')).toHaveText('+1');
  expect(await pairOf(tabC)).toEqual([12, 9]);
  expect(errors).toEqual([]);
});

test('1366×680에서 고른 상자를 접은 장면·까닭 고르기·도감 보기(도감 주문)도 넘치지 않는다 — 판 → 무대 어긋남 0px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '1366×680은 크롬북 화면에서');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.setViewportSize(SIZES.low);
  await page.goto(STAGE_URL('cuboid-dex'));
  await page.evaluate(() => localStorage.clear());
  await page.goto(STAGE_URL('cuboid-dex'));
  for (const dims of [[4, 3, 1], [1, 4, 2]]) {
    await setBox(page, dims);
    const net = netFor(dims, boxCatalog(dims).list[2].id);
    await buildNet(page, net);
    await page.waitForFunction(() => [...document.querySelectorAll('.rect-tile')].every((t) => t.getAnimations().every((a) => a.playState === 'finished')));
    const drift = await page.evaluate(() => {
      const center = (el) => {
        const b = el.getBoundingClientRect();
        return [b.left + b.width / 2, b.top + b.height / 2];
      };
      const tiles = [...document.querySelectorAll('.rect-tile')].map((t) => ({ label: t.dataset.label, at: center(t) }));
      document.querySelector('.free-fold').click();
      const faces = [...document.querySelectorAll('.fold-stage .net-face')].map((f) => ({ label: f.dataset.label, at: center(f) }));
      return Math.round(Math.max(...tiles.map((t) => {
        const f = faces.find((x) => x.label === t.label);
        return f ? Math.hypot(f.at[0] - t.at[0], f.at[1] - t.at[1]) : 999;
      })) * 100) / 100;
    });
    expect(drift, `${dims} 판 → 무대`).toBe(0);
    await folded(page);
    await noScroll(page, `${dims} 접음`);
    await expectPanelFits(page, `${dims} 접음`);
    await page.locator('.dex-open').click();
    await noScroll(page, `${dims} 도감 보기`);
    const fit = await page.evaluate(() => {
      const board = document.querySelector('.dex-board').getBoundingClientRect();
      const mat = document.querySelector('.mat').getBoundingClientRect();
      const cells = [...document.querySelectorAll('.dex-cell')].map((c) => c.getBoundingClientRect());
      return { inMat: board.left >= mat.left && board.right <= mat.right && board.top >= mat.top && board.bottom <= mat.bottom, cellsIn: cells.every((c) => c.bottom <= board.bottom + 0.5 && c.right <= board.right + 0.5), minCell: Math.min(...cells.map((c) => Math.min(c.width, c.height))) };
    });
    expect(fit.inMat && fit.cellsIn, `${dims} 도감 보기가 매트 안`).toBe(true);
    expect(fit.minCell).toBeGreaterThan(24);
    await page.locator('.dex-board-close').click();
    await page.locator('.free-new').click();
  }
  expect(errors).toEqual([]);
});

/** 상자 크기 화면 읽기 이름이 축 이름과 같다(가로 · 세로 · 높이) — 64가지 크기에서 카드 글과 상자 글이 그 상자의 것 */
test('상자 글: 화면 읽기의 축 이름과 카드의 크기 글이 상자와 맞다(무작위 크기 여섯)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '크롬북 화면에서 한 번');
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  for (const dims of [[1, 4, 2], [4, 4, 1], [2, 1, 3], [3, 3, 3], [1, 1, 2], [4, 2, 1]]) {
    await setBox(page, dims, { apply: false });
    for (const [i, axis] of BOX_AXES.entries()) await expect(page.locator(`.box-stepper[data-axis="${i}"]`)).toHaveAttribute('aria-label', `${axis} ${dims[i]} cm`);
    await page.locator('.box-apply').click();
    await expect(page.locator('.rect-card .size-text')).toHaveText(boxCards(dims).map((c) => `${c.w}×${c.h} cm`));
    for (const c of boxCards(dims)) await expect(page.locator(`.rect-card[data-label="${c.label}"]`)).toHaveAttribute('aria-label', `${c.label} 면 카드, 가로 ${c.w} cm, 세로 ${c.h} cm`);
  }
  // 카드 그림은 여섯 장이 같은 축척이다 (카드 그림의 가로 ÷ 길이가 모두 같다)
  const scale = await page.locator('.rect-card .size-rect').evaluateAll((els) => els.map((el) => Math.round((el.getBoundingClientRect().width / Number(el.style.getPropertyValue('--cw'))) * 10) / 10));
  expect(new Set(scale).size).toBe(1);
  expect(errors).toEqual([]);
});

/** 처음 상자로만 하는 학생: 판의 모양·카드·안내가 이 단계의 지난 모습과 같다(크기를 바꾸지 않으면 손잡이 말고는 놓는 판이 그대로) */
test('처음 상자로만 하면 놓는 판은 지금까지와 같다: 12 × 8 판, 카드 여섯 장의 크기 글, 1 cm 칸 크기(1366×768 · 1366×680)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '크롬북 화면에서');
  const errors = collectErrors(page);
  for (const [size, cell] of [[SIZES.chromebook, 58], [SIZES.low, 51]]) {
    await page.setViewportSize(size);
    await page.goto(STAGE_URL('cuboid-free'));
    await settled(page);
    expect(await page.locator('.rect-board').evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--cell'))), `${size.height}`).toBe(cell);
    await expect(page.locator('.rect-board .cell')).toHaveCount(96);
    await expect(page.locator('.rect-card .size-text')).toHaveText(['3×2 cm', '3×2 cm', '3×1 cm', '3×1 cm', '2×1 cm', '2×1 cm']);
    await expect(page.locator('.box-tip')).toHaveText('가로 3 cm · 세로 2 cm · 높이 1 cm');
  }
  expect(errors).toEqual([]);
});
