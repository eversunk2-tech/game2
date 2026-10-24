/**
 * 각기둥의 전개도 G2: 4단계 "전개도 완성하기"(prism-free — 자석 판, 사용자 요청 15-30 · 결정 15-31 + 덧붙임)와 도전 "모서리와 꼭짓점"(prism-count — 15-25 · 15-26).
 * 전개도 완성하기의 정답은 게임과 같은 시드 문자열(<seed>:<단계 id>)로 같은 판(각기둥 · 판 크기)을 만들고, 목표 모양(목록의 전개도 · 일부러 틀리게 놓은 판)을
 * 놓는 차례를 화면과 같은 놓기 함수로 미리 계산해 안다(tests/unit/net-workshop-prism-free-plan.js — 끌어 놓을 자리 · 카드 돌림 · 키보드 자석 자리 번호).
 * DOM에 정답을 숨겨 두지 않는다. 배치 검사에는 글자 폭에 묶인 픽셀 상수를 쓰지 않는다(docs/engine.md 11절). 재기 전에는 움직임이 끝날 때까지 기다린다(common-rules 8절).
 */
import { expect, test } from '@playwright/test';
import { createRng } from '../../src/shared/core/random.js';
import { centroid } from '../../src/games/net-workshop/geometry.js';
import { PRISM_STAGES } from '../../src/games/net-workshop/grade6/prism-stages.js';
import * as L from '../../src/games/net-workshop/grade6/prism-free-logic.js';
import { judgeCount, makeCountQuestions } from '../../src/games/net-workshop/grade6/prism-count-logic.js';
import { dropFor, fitOnBoard, looseSpot, planBoard, planCatalog, samePlace, turnCost } from '../unit/net-workshop-prism-free-plan.js';
import { collectErrors, fileUrl, hasHorizontalScroll, touchFlick, touchGestures } from './helpers.js';

const FILE = 'net-workshop.html';
const FREE = PRISM_STAGES.find((s) => s.id === 'prism-free');
const COUNT = PRISM_STAGES.find((s) => s.id === 'prism-count');
const STAGE_URL = (id, extra = '', seed = '1') => fileUrl(FILE, `?unlock=all&seed=${seed}&sound=off&stage=${id}${extra}`);
const storedXpOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards'))?.xp ?? 0);
const storedLog = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:log')) ?? []);
const SIZES = {
  chromebook: { width: 1366, height: 768 }, low: { width: 1366, height: 680 }, small: { width: 1024, height: 768 }, narrow: { width: 960, height: 768 },
  tablet: { width: 820, height: 1180 }, phone: { width: 390, height: 844 },
};
const sizesFor = (testInfo) => (testInfo.project.name === 'chromebook' ? [SIZES.chromebook, SIZES.low, SIZES.small, SIZES.narrow] : [SIZES.tablet, SIZES.phone]);
const touchOf = (testInfo) => testInfo.project.name === 'tablet';
const mid = (b) => [b.x + b.width / 2, b.y + b.height / 2];

/** 그 요소들의 움직임이 끝날 때까지 (끝없이 도는 움직임은 기다리지 않는다) */
const settled = (page, selector = '.screen') => page.waitForFunction((sel) => [...document.querySelectorAll(sel)].every((el) => el.getAnimations({ subtree: true }).every((a) => (
  a.playState !== 'running' || a.animationName === 'turn-hint' || a.effect?.getComputedTiming().iterations === Infinity))), selector);
/** 단계 열기: 화면(나중에 받는 묶음)이 그려지고 움직임이 끝날 때까지 — 빈 판 · 카드 · 만들 각기둥(전개도 완성하기) / 무대의 면 · 보기(모서리와 꼭짓점) */
async function openStage(page, id, extra = '', seed = '1') {
  await page.goto(STAGE_URL(id, extra, seed));
  if (id === 'prism-free') {
    await expect(page.locator('.pf-mboard')).toBeVisible();
    await expect(page.locator('.pf-cards .pf-card').first()).toBeVisible();
    await expect(page.locator('.pf-pic .net-face').first()).toBeAttached();
  } else {
    await expect(page.locator('.mat .fold-stage .net-face').first()).toBeAttached();
    await expect(page.locator('.pc-answers .answer-btn').first()).toBeVisible();
  }
  await settled(page);
}

// ── 전개도 완성하기: 같은 시드로 판을 만들고, 목표 모양을 놓는 차례를 화면과 같은 놓기 함수로 계산한다 ─────────────
const freePlay = (seed, page) => L.makeFreePlay(FREE, createRng(`${seed}:prism-free`), { portrait: page.viewportSize().width <= 560 });
const cardOf = (page, group) => page.locator(`.pf-cards .pf-card[data-group="${group}"]`);
const tiles = (page) => page.locator('.pf-mboard .pf-tile');
/**
 * 같은 판에서 k번째(0 · 1 · 2)로 만들 서로 다른 전개도: 목록의 앞 24가지 가운데 카드를 적게 돌려도 되는 차례로(검사를 빠르게 — 판정 · 배치는 어느 전개도든 같다)
 */
const netCache = new Map();
function netPlan(play, k) {
  const key = `${play.solidId}:${play.board.w}x${play.board.h}`;
  if (!netCache.has(key)) {
    const list = Array.from({ length: 24 }, (_, i) => planCatalog(play, i, { pick: 'fewest' })).filter(Boolean);
    netCache.set(key, list.map((plan) => ({ plan, cost: turnCost(plan.steps) })).sort((a, b) => a.cost - b.cost).map((x) => x.plan));
  }
  return netCache.get(key)[k];
}
/** 판의 (0, 0) cm가 화면의 어디이고 1 cm가 몇 px인가 — 판이 화면에 보이게 굴린 뒤 */
async function boardBox(page, play) {
  await page.locator('.pf-mboard').scrollIntoViewIfNeeded();
  const r = await page.locator('.pf-mboard-frame').boundingBox();
  return { x: r.x, y: r.y, unit: r.width / play.board.w };
}
const toScreen = (box, [x, y]) => [box.x + x * box.unit, box.y + y * box.unit];
/** 판에 놓인 면들의 모양(cm) — 화면의 조각(svg 다각형)을 읽어서 */
async function boardPolys(page, play) {
  const box = await boardBox(page, play);
  const list = await tiles(page).evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    const pts = el.querySelector('polygon').getAttribute('points').split(' ').map((p) => p.split(',').map(Number));
    return { id: el.dataset.face, pts: pts.map(([x, y]) => [x + r.left, y + r.top]) };
  }));
  return list.map((f) => ({ id: f.id, poly: f.pts.map(([x, y]) => [(x - box.x) / box.unit, (y - box.y) / box.unit]) }));
}
/** 그 면이 계획한 자리에 놓였나(화면에서 읽은 모양 — px 반올림만큼 봐준다) */
async function expectAt(page, play, step) {
  const got = (await boardPolys(page, play)).find((f) => f.id === step.card);
  expect(got, `${step.card} 놓임`).toBeTruthy();
  expect(samePlace(got.poly, step.poly, 0.06), `${step.card} 자리`).toBe(true);
}
const liveText = (page) => page.locator('.sr-only[role="status"]').first();

/**
 * 면 하나 놓기(step: planBoard의 차례). how:
 *   drag(마우스로 끌기 — 돌림은 카드에서 R) · drag-r(끄는 중 R로 돌림) · drag-right(끄는 중 오른쪽 버튼으로 돌림) · click(카드 누르고 [돌리기] · 판 누르기)
 *   tap(손가락: 카드 톡 · [돌리기] 톡 · 판 톡) · touch-drag(손가락으로 끌기 — 돌림은 카드 톡 · [돌리기] 톡) · keyboard(카드에서 Enter → 자석 자리 · Enter)
 */
async function placeStep(page, play, step, how = 'drag') {
  const before = await tiles(page).count();
  const card = cardOf(page, step.group);
  const turnNow = Number(await card.getAttribute('data-turn'));
  const need = (step.turn - turnNow + 12) % 12;
  if (how === 'keyboard') {
    await card.focus();
    if (step.root) {
      for (let i = 0; i < need; i += 1) await page.keyboard.press('r');
      await expect(card).toHaveAttribute('data-turn', String(step.turn));
      await page.keyboard.press('Enter');
      await expect(page.locator('.pf-mboard')).toBeFocused();
      for (let i = 0; i < Math.abs(step.kx); i += 1) await page.keyboard.press(step.kx > 0 ? 'ArrowRight' : 'ArrowLeft');
      for (let i = 0; i < Math.abs(step.ky); i += 1) await page.keyboard.press(step.ky > 0 ? 'ArrowDown' : 'ArrowUp');
    } else {
      await page.keyboard.press('Enter');
      await expect(page.locator('.pf-mboard')).toBeFocused();
      // 가까운 쪽으로 돈다(오른쪽 · 왼쪽 방향키)
      const back = step.spots - step.spot;
      if (step.spot <= back) for (let i = 0; i < step.spot; i += 1) await page.keyboard.press('ArrowRight');
      else for (let i = 0; i < back; i += 1) await page.keyboard.press('ArrowLeft');
      await expect(liveText(page)).toContainText(`붙일 자리 ${step.spot + 1} / ${step.spots}`);
    }
    await page.keyboard.press('Enter');
  } else if (how === 'click' || how === 'tap') {
    const press = (loc) => (how === 'tap' ? loc.tap() : loc.click());
    await press(card);
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    for (let i = 0; i < need; i += 1) await press(page.locator('.tool-turn'));
    await expect(card).toHaveAttribute('data-turn', String(step.turn));
    const [x, y] = toScreen(await boardBox(page, play), step.at);
    if (how === 'tap') await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  } else if (how === 'touch-drag') {
    if (need > 0) {
      await card.tap();
      for (let i = 0; i < need; i += 1) await page.locator('.tool-turn').tap();
      await expect(card).toHaveAttribute('data-turn', String(step.turn));
    }
    await card.scrollIntoViewIfNeeded();
    const from = mid(await card.boundingBox());
    const to = toScreen(await boardBox(page, play), step.at);
    const cdp = await page.context().newCDPSession(page);
    await touchFlick(cdp, from, to, { steps: 16, stepMs: 16 });
    await cdp.detach();
  } else {
    if (how === 'drag') {
      await card.focus();
      for (let i = 0; i < need; i += 1) await page.keyboard.press('r');
      await expect(card).toHaveAttribute('data-turn', String(step.turn));
    }
    const from = mid(await card.boundingBox());
    const to = toScreen(await boardBox(page, play), step.at);
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(from[0] - 14, from[1], { steps: 2 });
    await page.mouse.move(...to, { steps: 8 });
    if (how !== 'drag') {
      for (let i = 0; i < need; i += 1) {
        if (how === 'drag-r') await page.keyboard.press('r');
        else {
          await page.mouse.down({ button: 'right' });
          await page.mouse.up({ button: 'right' });
        }
      }
    }
    await page.mouse.up();
  }
  await expect(tiles(page)).toHaveCount(before + 1);
  await expectAt(page, play, step);
}
/** 계획대로 모두 놓기 (hows: 차례마다의 how — 모자라면 마지막 것) */
async function buildPlan(page, play, plan, hows = ['drag'], { upTo = plan.steps.length } = {}) {
  for (let i = 0; i < upTo; i += 1) await placeStep(page, play, plan.steps[i], hows[Math.min(i, hows.length - 1)]);
}
const foldNow = async (page, how = 'mouse') => {
  const btn = page.locator('.free-fold');
  await expect(btn).toBeEnabled();
  if (how === 'touch') await btn.tap();
  else if (how === 'keyboard') {
    await btn.focus();
    await page.keyboard.press('Enter');
  } else await btn.click();
  await expect(page.locator('.free-host .fold-stage')).toHaveAttribute('data-fold', 'done');
  await expect(page.locator('.pf-pic')).toBeHidden(); // 접는 동안 만들 각기둥 그림은 숨는다(휴대폰의 주문서 그림도)
};
const pressBtn = (page, selector, how) => (how === 'touch' || how === 'tap' ? page.locator(selector).tap() : page.locator(selector).click());

/**
 * 목록의 전개도에서 마지막 면만 다른 자석 자리에 놓은 판(접기 전에 한 장으로 이어진 것): want(spot, faces) → 그 판을 놓는 차례 | null.
 * 화면과 같은 놓기 함수로 계산한다(끌어 놓으면 그 자리에 붙는지까지)
 */
function twistedPlan(play, want, { tries = 40 } = {}) {
  const cards = L.freeCards(L.freeSolid(play.solidId));
  for (let i = 0; i < tries; i += 1) {
    const plan = planCatalog(play, i * 3);
    if (!plan) continue;
    const pre = plan.placed.slice(0, -1);
    const last = cards.find((c) => c.id === plan.placed.at(-1).id);
    for (const spot of L.magnetSpots(last, pre, play.board)) {
      const faces = [...pre, { id: last.id, role: last.role, label: last.label, poly: spot.poly }];
      if (!L.foldReadiness(faces, cards.length).ready || !want(spot, faces, pre, last)) continue;
      const solidOf = (id) => cards.find((c) => c.id === id).solid;
      try {
        const fit = { faces: faces.map((f) => ({ solid: solidOf(f.id), poly: f.poly })), rootSolid: 'b0', turn: plan.steps[0].turn };
        const twisted = planBoard(play, fit);
        if (twisted.steps.at(-1).card !== last.id) continue;
        return { ...twisted, spot, last, pre };
      } catch {
        // 끌어 놓아 그 자리에 붙지 않는 차례(다른 면이 먼저 맞닿음)는 건너뛴다
      }
    }
  }
  return null;
}
const lengthOf = (poly, e) => Math.round(Math.hypot(poly[(e + 1) % poly.length][0] - poly[e][0], poly[(e + 1) % poly.length][1] - poly[e][1]) * 100) / 100;
const isUnequal = (spot, pre, last) => Math.abs(lengthOf(last.poly, spot.cardEdge) - lengthOf(pre.find((p) => p.id === spot.face).poly, spot.edge)) > 1e-6;

/** 결과 화면: "오늘의 솜씨" 칸 점수 합 + 단계 완료·별 점수 줄 = "이번에 모은 솜씨 점수" */
async function resultXpSum(page) {
  return page.evaluate(() => {
    const sum = (texts) => texts.flatMap((t) => t.match(/\+\d+/g) ?? []).reduce((total, x) => total + Number(x), 0);
    return {
      tiles: sum([...document.querySelectorAll('.behavior .b-xp')].map((el) => el.textContent)),
      line: sum([document.querySelector('.xp-line').textContent]),
      gained: Number(document.querySelector('.rank-card .xp-gain').textContent.replace(/\D/g, '')),
    };
  });
}

// ── 화면 배치 검사 ───────────────────────────
async function noScroll(page, label = '') {
  await settled(page);
  const over = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  if (page.viewportSize().width > 560) expect(over, `${label} 세로 넘침`).toBeLessThanOrEqual(0);
  expect(await hasHorizontalScroll(page), `${label} 가로 스크롤`).toBe(false);
}
async function expectPanelFits(page, label = '') {
  await settled(page, '.net-panel');
  const m = await page.evaluate(() => {
    const panel = document.querySelector('.net-panel');
    const box = panel.getBoundingClientRect();
    const bottom = box.bottom - parseFloat(getComputedStyle(panel).borderBottomWidth);
    const top = box.top + parseFloat(getComputedStyle(panel).borderTopWidth);
    // 입체 그림의 면(.net-face — 누르는 것이 아니고 inert)은 빼고
    const buttons = [...panel.querySelectorAll('button')].filter((b) => !b.closest('.net-face') && b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden');
    return {
      over: panel.scrollHeight - panel.clientHeight,
      small: buttons.filter((b) => b.getBoundingClientRect().height < 48 || b.getBoundingClientRect().width < 48).map((b) => b.textContent.trim().slice(0, 14)),
      cut: buttons.filter((b) => b.getBoundingClientRect().bottom > bottom + 0.5 || b.getBoundingClientRect().top < top - 0.5).map((b) => b.textContent.trim().slice(0, 14)),
    };
  });
  expect(m, label).toEqual({ over: 0, small: [], cut: [] });
}
/**
 * 매트 위: 놓는 판은 매트 안이고 만들 각기둥 창 · 안내 띠 · 조작 띠와 겹치지 않는다. 놓인 면(다각형의 실제 꼭짓점)은 판 안이다.
 * 돌리기 손잡이(보일 때)는 48px 이상 · 매트 안이고 창 · 띠와 겹치지 않는다. 판의 글끼리 겹치지 않고, 조작 띠의 "놓은 면 n / m"이 잘리지 않는다
 * → { faces, handle } (센 것)
 */
async function expectMatClear(page, label = '') {
  const m = await page.evaluate(() => {
    const rect = (el) => el.getBoundingClientRect();
    const vis = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
    const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const mat = rect(document.querySelector('.mat'));
    const board = rect(document.querySelector('.pf-mboard'));
    const blocks = [...document.querySelectorAll('.pf-pic.is-mat, .mat .board-legend, .mat .edit-tools .btn, .mat .edit-tools .mat-status')].filter(vis).map((el) => ({ name: el.className.split(' ')[0], r: rect(el) }));
    const out = [];
    if (board.left < mat.left - 0.5 || board.right > mat.right + 0.5 || board.top < mat.top - 0.5 || board.bottom > mat.bottom + 0.5) out.push('판이 매트 밖');
    for (const b of blocks) if (hit(board, b.r)) out.push(`판 × ${b.name}`);
    const faces = [...document.querySelectorAll('.pf-tile')].map((el) => {
      const r = rect(el);
      return { key: el.dataset.face, pts: el.querySelector('polygon').getAttribute('points').split(' ').map((p) => p.split(',').map(Number)).map(([x, y]) => [x + r.left, y + r.top]) };
    });
    for (const f of faces) if (f.pts.some(([x, y]) => x < board.left - 0.5 || x > board.right + 0.5 || y < board.top - 0.5 || y > board.bottom + 0.5)) out.push(`면 판 밖 ${f.key}`);
    const handles = [...document.querySelectorAll('.pf-turn-handle')].filter(vis);
    for (const h of handles) {
      const r = rect(h);
      if (r.width < 47.5 || r.height < 47.5) out.push('작은 손잡이');
      if (r.left < mat.left - 0.5 || r.right > mat.right + 0.5 || r.top < mat.top - 0.5 || r.bottom > mat.bottom + 0.5) {
        if (h.closest('.mat')) out.push('손잡이 매트 밖');
      }
      if (h.closest('.mat')) for (const b of blocks) if (hit(r, b.r)) out.push(`손잡이 × ${b.name}`);
    }
    const status = document.querySelector('.mat .edit-tools .mat-status');
    if (vis(status) && status.scrollWidth > status.clientWidth + 1) out.push(`상태 글 잘림 ${status.textContent}`);
    // 판의 글(빈 모서리의 길이 · 면 이름)끼리 겹치지 않는다 — 돌린 길이 글은 돌린 직사각형으로 견준다(나눔축 검사)
    const boxes = [...document.querySelectorAll('.pf-len, .pf-face-label')].filter(vis).map((el) => {
      const r = rect(el);
      const deg = Number(/rotate\((-?[\d.]+)deg\)/.exec(el.style.transform)?.[1] ?? 0);
      const a = (deg * Math.PI) / 180;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      const [cx, cy, hw, hh] = [r.left + r.width / 2, r.top + r.height / 2, el.offsetWidth / 2, el.offsetHeight / 2];
      return { text: el.textContent, axes: [[c, s], [-s, c]], pts: [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]) };
    });
    const apart = (p, q) => [...p.axes, ...q.axes].some(([ax, ay]) => {
      const proj = (b) => b.pts.map(([x, y]) => x * ax + y * ay);
      const [u, v] = [proj(p), proj(q)];
      return Math.min(Math.max(...u), Math.max(...v)) - Math.max(Math.min(...u), Math.min(...v)) <= 0.5;
    });
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) if (!apart(boxes[i], boxes[j])) out.push(`글끼리 ${boxes[i].text} × ${boxes[j].text}`);
    }
    return { out, faces: faces.length, handle: handles.length };
  });
  expect(m.out, label).toEqual([]);
  return m;
}
/** 지금 보이는 알림이 조작과 겹치지 않는다 */
async function expectToastClear(page, label = '') {
  const handle = await page.waitForFunction(() => {
    const toast = document.querySelector('.toast');
    if (!toast) return { hits: [] };
    const controls = '.play-header button, .answer-btn, .free-fold, .free-buttons button, .reason-chip, .reason-skip, .mat-tools button, .view-pad button, .pf-card, .pf-turn-handle, .next-btn';
    const shown = [...document.querySelectorAll(controls)].filter((el) => el.getBoundingClientRect().width > 0 && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden');
    const moving = (el) => el.getAnimations({ subtree: true }).some((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity);
    if ([toast, ...shown].some(moving)) return null;
    const t = toast.getBoundingClientRect();
    return { hits: shown.filter((el) => {
      const b = el.getBoundingClientRect();
      return Math.min(t.right, b.right) - Math.max(t.left, b.left) > 0 && Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top) > 0;
    }).map((el) => el.className) };
  }, null, { timeout: 15_000 });
  expect((await handle.jsonValue()).hits, label).toEqual([]);
}

// ── 1. 전개도 완성하기 ───────────────────────────
test('전개도 완성하기(마우스 끌기 · 손가락): 빈 판(미리 놓인 면 · 주문 없음)에 면 카드를 모두 놓기 → 접어 보기(예상 없이) → 새 전개도 → [새로 만들기]로 빈 판 → 다른 모양 → 2가지면 [결과 보기](보통 버튼) → 한 가지 더 → 별 3개. 점수는 화면 = 저장 = 독립 계산, 도장 "기둥 설계사"', async ({ page }, testInfo) => {
  test.setTimeout(240_000); // 보통 40초 안팎
  const errors = collectErrors(page);
  const touch = touchOf(testInfo);
  const how = touch ? 'touch' : 'mouse';
  await openStage(page, 'prism-free');
  const play = freePlay('1', page);
  await expect(page.locator('.order-kind')).toHaveText('설계 주문');
  await expect(tiles(page)).toHaveCount(0); // 빈 판(15-30)
  await expect(page.locator('.pf-step, .pf-slot, .pf-lock')).toHaveCount(0);
  await expect(page.locator('.pf-pic')).toBeVisible();
  await expect(page.locator('.pf-pic .box-tag').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /될 거예요|안 될 거예요/ })).toHaveCount(0);
  await expect(page.locator('.free-fold')).toBeDisabled();
  await expect(page.locator('.free-note')).toContainText(`면 ${L.freeCards(L.freeSolid(play.solidId)).length}장을 모두 놓으면`);
  await buildPlan(page, play, netPlan(play, 0), touch ? ['touch-drag', 'tap'] : ['drag', 'click', 'drag']);
  await foldNow(page, how);
  await expect(page.locator('.stage-badge')).toContainText(`${L.freeSolid(play.solidId).name.slice(0, 2)}`);
  await expect(page.locator('.reason')).toContainText('새 전개도 발견');
  await expect(page.locator('.found-stamp')).toBeVisible();
  await expect(page.locator('.free-fix')).toHaveClass(/btn-primary/);
  await expect(page.locator('.free-finish')).toHaveCount(0); // 1가지로는 끝낼 수 없다
  await pressBtn(page, '.free-new', how);
  await expect(tiles(page)).toHaveCount(0); // [새로 만들기]: 빈 판
  await expect(page.locator('.pf-pic .net-face').first()).toBeAttached(); // 만들 각기둥 그림이 다시
  await buildPlan(page, play, netPlan(play, 1), touch ? ['tap'] : ['click']);
  await foldNow(page, how);
  // 2가지: [결과 보기]는 보통 버튼, [펴서 고치기]가 주 버튼(직육면체 자유 배치와 같다)
  await expect(page.locator('.free-finish')).toBeVisible();
  await expect(page.locator('.free-finish')).not.toHaveClass(/btn-primary/);
  await expect(page.locator('.goal-done')).toContainText('한 가지 더 찾으면 별 3개');
  await pressBtn(page, '.free-new', how);
  await buildPlan(page, play, netPlan(play, 2), touch ? ['tap'] : ['drag']);
  await foldNow(page, how);
  await expect(page.locator('.free-finish')).toHaveClass(/btn-primary/);
  await expect(page.locator('.found-slot.is-found')).toHaveCount(3);
  await pressBtn(page, '.free-finish', how);
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  await expect(page.getByText('찾은 전개도', { exact: true })).toBeVisible();
  const xp = await resultXpSum(page);
  expect(xp.tiles + xp.line).toBe(xp.gained);
  // 독립 계산(docs/engine.md 10절 점수 표): 처음 만든 전개도 3가지 × (등록 +5 + 만들기 성공 +2) + 연속 3번 +1 + 단계 완료 +5 + 별 3개 +6
  expect(xp.gained).toBe(3 * 7 + 1 + 5 + 6);
  expect(await storedXpOf(page)).toBe(xp.gained);
  await expect(page.locator('.new-badge-list li')).toContainText([/기둥 설계사/]);
  const rec = (await storedLog(page)).find((r) => r.stageId === 'prism-free');
  expect(rec.answers.map((a) => a.correct)).toEqual([true, true, true]);
  expect(new Set(rec.answers.map((a) => a.itemId.split(':')[2])).size).toBe(3);
  expect(errors).toEqual([]);
});

test('전개도 완성하기: 같은 판에서 같은 모양(다른 자리 · 다른 방향에 놓아도)을 두 번 접으면 기록 · 점수가 없고, 다시 하는 판에서 이미 찾은 전개도는 점수가 없다', async ({ page }, testInfo) => {
  test.skip(touchOf(testInfo), '크롬북에서 확인');
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await openStage(page, 'prism-free');
  const play = freePlay('1', page);
  const plan = netPlan(play, 0);
  await buildPlan(page, play, plan, ['click']);
  await foldNow(page);
  const after1 = await storedXpOf(page);
  expect(after1).toBe(7); // 등록 +5 · 만들기 성공 +2 — 그 자리에서 바로 저장
  // 같은 판: [새로 만들기] → 같은 전개도를 판의 다른 방향으로(통째로 돌린 모습) → "이미 접어 본 모양"
  await page.locator('.free-new').click();
  const list = L.freeCards(L.freeSolid(play.solidId));
  const faces = plan.placed.map((f) => ({ solid: list.find((c) => c.id === f.id).solid, poly: f.poly }));
  const fits = [3, 6, 9].map((pick) => fitOnBoard(play, faces, { pick })).filter((f) => f && f.turn !== plan.steps[0].turn);
  const again = planBoard(play, fits[0]);
  await buildPlan(page, play, again, ['drag']);
  await foldNow(page);
  await expect(page.locator('.reason')).toContainText('이미 접어 본 모양');
  await expect(page.locator('.free-fix')).toBeVisible();
  expect(await storedXpOf(page)).toBe(after1);
  // 새 판: 같은 전개도 → 전에 찾은 전개도(점수 없음)
  await openStage(page, 'prism-free');
  await buildPlan(page, play, plan, ['click']);
  await foldNow(page);
  await expect(page.locator('.reason')).toContainText('전에 찾은 전개도');
  await expect(page.locator('.bonus-slot')).toContainText('점수는 없어요');
  expect(await storedXpOf(page)).toBe(after1);
  expect(errors).toEqual([]);
});

test('전개도 완성하기 점수 상한(15-29): 이 기기에서 10가지를 찾은 뒤 새 전개도는 등록 +1뿐, 30가지를 찾은 뒤는 점수 없이 찾은 가지 수만 오른다 — 쪽지 · 저장 점수', async ({ page }, testInfo) => {
  test.skip(touchOf(testInfo), '크롬북에서 확인');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  for (const [have, xp, note] of [[10, 1, /새 발견 \+1.*10가지를 넘으면 새 전개도마다 1점/], [30, 0, /새 전개도.*30가지를 넘은 전개도는 점수 없이/]]) {
    await page.goto(fileUrl(FILE, '?seed=1&sound=off&intro=0'));
    const play = freePlay('1', page);
    const other = play.solidId === 'hex-b' ? 'hex-a' : 'hex-b';
    // 다른 각기둥의 전개도를 have가지 찾아 둔 기기
    await page.evaluate(([k, id]) => {
      const items = {};
      for (let i = 0; i < k; i += 1) items[`${id}-${String(i + 1).padStart(3, '0')}`] = { at: 1, stage: 'prism-free' };
      localStorage.setItem('edu:net-workshop:collections', JSON.stringify({ 'prism-nets': items }));
    }, [have, other]);
    await openStage(page, 'prism-free');
    await expect(page.locator('.found-count')).toHaveText(`각기둥 전개도 ${have}가지`);
    const before = await storedXpOf(page);
    await buildPlan(page, play, netPlan(play, 0), ['click']);
    await foldNow(page);
    await expect(page.locator('.reason')).toContainText('새 전개도 발견');
    await expect(page.locator('.bonus-note')).toContainText(note);
    await expect(page.locator('.found-count')).toHaveText(`각기둥 전개도 ${have + 1}가지`);
    expect(await storedXpOf(page), `${have}가지 뒤`).toBe(before + xp); // 등록 점수는 바로 저장, 만들기 성공(+2)은 처음 10가지만이라 없음
  }
  expect(errors).toEqual([]);
});

test('전개도 완성하기: 안 되는 모양을 접으면 "왜 안 될까요?"(고르기 전에는 까닭 글 · 표시 없음) → 고르면 까닭과 표시, 별은 깎이지 않는다. [펴서 고치기]는 놓은 그대로, [새로 만들기]는 빈 판', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  const touch = touchOf(testInfo);
  await openStage(page, 'prism-free', '', '3');
  const play = freePlay('3', page);
  // 목록의 전개도에서 마지막 면을 같은 길이의 다른 모서리에 놓은 판(접으면 안 된다)
  const wrong = twistedPlan(play, (spot, faces, pre, last) => !isUnequal(spot, pre, last)
    && !L.judgeFreeNet(L.freeSolid(play.solidId), faces, L.rootCardId(L.freeCards(L.freeSolid(play.solidId)))).valid);
  expect(wrong, '안 되는 판').not.toBeNull();
  await buildPlan(page, play, wrong, [touch ? 'tap' : 'click']);
  const cards = L.freeCards(L.freeSolid(play.solidId));
  await foldNow(page, touch ? 'touch' : 'mouse');
  await expect(page.locator('.reason-pick')).toBeVisible();
  // 고르기 전: 무대에 까닭 띠 · 이름표 없음, 쪽지에 까닭 문장 없음
  await expect(page.locator('.free-host .edge-band, .free-host .edge-tag')).toHaveCount(0);
  await expect(page.locator('.reason')).toContainText('왜 그런지 골라 볼까요?');
  const xpBefore = await storedXpOf(page);
  await pressBtn(page, '.reason-chip >> nth=0', touch ? 'tap' : 'click');
  await expect(page.locator('.reason')).toContainText('까닭');
  await expect(page.locator('.stage-badge')).toContainText('각기둥이 안 돼요');
  expect(await storedXpOf(page)).toBe(xpBefore); // 안 되는 모양은 점수 없음(별 · 점수가 깎이지도 않는다)
  // [펴서 고치기]: 놓은 그대로 판으로
  await pressBtn(page, '.free-fix', touch ? 'tap' : 'click');
  await expect(tiles(page)).toHaveCount(cards.length);
  for (const step of wrong.steps) await expectAt(page, play, step);
  await expect(page.locator('.free-fold')).toBeEnabled();
  await foldNow(page, touch ? 'touch' : 'mouse');
  await expect(page.locator('.reason')).toContainText('이미 접어 본 모양'); // 같은 안 되는 모양은 다시 기록하지 않는다
  await pressBtn(page, '.free-new', touch ? 'tap' : 'click');
  await expect(tiles(page)).toHaveCount(0);
  await expect(page.locator('.free-fold')).toBeDisabled();
  const log = (await storedLog(page)).find((r) => r.stageId === 'prism-free');
  expect(log ?? null).toBe(null); // 판을 마치기 전에는 학습 기록이 남지 않는다
  expect(errors).toEqual([]);
});

test('전개도 완성하기 길이가 다르게 붙인 판(15-31 덧붙임): 길이가 다른 모서리에도 자석처럼 붙고(붙는 모습 · 알림이 같은 길이와 같다), 놓은 그대로 접혀 "왜 안 될까요?"에서 "맞닿는 선분의 길이가 달라요"를 고르면 맞고 — 두 선분에 같은 무늬와 "○ cm" · "△ cm"', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  const touch = touchOf(testInfo);
  let found = null;
  let seed = 0;
  for (seed = 1; seed <= 12 && !found; seed += 1) {
    const play = freePlay(String(seed), page);
    found = twistedPlan(play, (spot, faces, pre, last) => isUnequal(spot, pre, last));
    if (found) found.play = play;
  }
  seed -= 1;
  expect(found, '길이가 다르게 붙는 판').not.toBeNull();
  const { play } = found;
  await openStage(page, 'prism-free', '', String(seed));
  await buildPlan(page, play, found, [touch ? 'tap' : 'drag'], { upTo: found.steps.length - 1 });
  // 같은 길이로 붙인 앞 면의 알림과 길이가 다르게 붙인 마지막 면의 알림은 같은 꼴
  const shape = (text) => text.replace(/[가-힣] 면/g, '○ 면').split('.')[0]; // 첫 문장(다 놓으면 "이제 접어 볼 수 있어요."가 뒤에 붙는다)
  const sameLen = shape(await liveText(page).textContent());
  await placeStep(page, play, found.steps.at(-1), touch ? 'tap' : 'drag');
  await expect(liveText(page)).toContainText('면의 모서리에 붙었어요');
  expect(shape(await liveText(page).textContent())).toBe(sameLen);
  const lens = [lengthOf(found.last.poly, found.spot.cardEdge), lengthOf(found.pre.find((p) => p.id === found.spot.face).poly, found.spot.edge)];
  await foldNow(page, touch ? 'touch' : 'mouse');
  await expect(page.locator('.reason-pick')).toBeVisible();
  await pressBtn(page, '.reason-chip[data-reason="length"]', touch ? 'tap' : 'click');
  await expect(page.locator('.reason-pick-result')).toContainText('맞아요');
  await expect(page.locator('.reason')).toContainText(/길이가 .+ cm와 .+ cm로 달라요/);
  await expect(page.locator('.free-host .edge-band')).toHaveCount(2); // 맞닿는 두 선분에 같은 무늬
  const tags = (await page.locator('.free-host .edge-tag').allTextContents()).map((t) => t.trim()).sort();
  const want = lens.map((v) => `${v} cm`).sort();
  // 접었을 때 맞닿는 두 선분이 붙인 그 두 변이면 두 길이가 그대로, 아니면(다른 곳이 먼저 어긋남) 그 두 선분의 길이 — 어느 쪽이든 둘은 다르다
  expect(tags).toHaveLength(2);
  expect(tags[0]).not.toBe(tags[1]);
  if (tags.join() !== want.join()) expect((await page.locator('.reason').textContent())).not.toContain(`${want[0]}와 ${want[1]}`);
  expect(errors).toEqual([]);
});

test('전개도 완성하기: 까닭이 둘 다 참인 판에서 "길이"를 고르면 쪽지 · 무대 표시가 그 까닭(길이가 다른 두 선분 — 같은 무늬 · 길이 이름표)을 먼저 보인다 (review-prism-g2 G2-5)', async ({ page }, testInfo) => {
  test.skip(touchOf(testInfo), '크롬북에서 확인');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  let found = null;
  let seed = 0;
  for (seed = 1; seed <= 20 && !found; seed += 1) {
    const play = freePlay(String(seed), page);
    const root = L.rootCardId(L.freeCards(L.freeSolid(play.solidId)));
    found = twistedPlan(play, (spot, faces) => {
      const r = L.createFreeSession({ solidId: play.solidId }).fold(faces, root);
      const truths = L.freeReasons(r.problems ?? []);
      return !r.valid && truths.includes('overlap') && truths.includes('length') && r.problems.some((p) => p.type === 'edge-length');
    });
    if (found) found.play = play;
  }
  seed -= 1;
  expect(found, '까닭이 둘인 판').not.toBeNull();
  await openStage(page, 'prism-free', '', String(seed));
  await buildPlan(page, found.play, found, ['click']);
  await foldNow(page);
  await page.locator('.reason-chip[data-reason="length"]').click();
  await expect(page.locator('.reason-pick-result')).toContainText('맞아요');
  await expect(page.locator('.reason')).toContainText(/길이가 .+로 달라요/);
  await expect(page.locator('.reason')).not.toContainText('겹쳐요');
  await expect(page.locator('.free-host .edge-band')).toHaveCount(2);
  await expect(page.locator('.free-host .edge-tag')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('전개도 완성하기 키보드만(크롬북): Tab으로 카드 → R로 카드 돌리기 → Enter(판 가운데에 든다) → 방향키로 옮겨 Enter, 다음 카드는 Enter → 좌우 방향키로 자석 자리 · 위아래로 다른 모서리 · R로 다른 변 → Enter. Esc로 그만두기 · Ctrl+Z 되돌리기 · 판에서 방향키로 면 고르기 · Delete로 빼기 · Enter로 들어 옮기기 · [접어 보기] · [새로 만들기]까지', async ({ page }, testInfo) => {
  test.skip(touchOf(testInfo), '키보드는 크롬북에서');
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await openStage(page, 'prism-free', '', '2');
  const play = freePlay('2', page);
  const plan = netPlan(play, 0);
  const board = page.locator('.pf-mboard');
  /** Tab만으로 그 요소에 초점(앞으로 · 많아야 40번) */
  async function tabTo(locator) {
    for (let i = 0; i < 40; i += 1) {
      if (await locator.evaluate((el) => el === document.activeElement)) return;
      await page.keyboard.press('Tab');
    }
    await expect(locator).toBeFocused();
  }
  const first = cardOf(page, plan.steps[0].group);
  await tabTo(first);
  // Esc: 든 것을 그만두면 카드로 초점이 돌아가고 판은 비어 있다
  await page.keyboard.press('Enter');
  await expect(board).toBeFocused();
  await expect(page.locator('.pf-preview')).toHaveCount(1); // 놓일 모양(점선)
  await expect(liveText(page)).toContainText('방향키로 옮기고 R로 돌리고 Enter로 놓아요');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(first).toBeFocused();
  await expect(page.locator('.pf-preview')).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(0);
  // 첫 면: 카드에서 R로 돌리고 Enter → 방향키 → Enter
  await placeStep(page, play, plan.steps[0], 'keyboard');
  await expect(board).toBeFocused();
  // 다음 면: 좌우 · 위아래 · R로 자리를 바꿔 보고 Esc → 다시 들어 계획한 자리에
  const second = plan.steps[1];
  await tabTo(cardOf(page, second.group));
  await page.keyboard.press('Enter');
  await expect(liveText(page)).toContainText(`붙일 자리 1 / ${second.spots}`);
  const previewAt = () => page.locator('.pf-preview').getAttribute('points');
  const p0 = await previewAt();
  const secondCard = L.freeCards(L.freeSolid(play.solidId)).find((c) => c.id === second.card);
  const edgeKeys = new Set(L.magnetSpots(secondCard, plan.placed.slice(0, 1), play.board).map((x) => `${x.face}:${x.edge}`)).size;
  await page.keyboard.press('ArrowDown');
  await expect(liveText(page)).toContainText('붙일 자리');
  if (edgeKeys > 1) expect(await previewAt()).not.toBe(p0); // 다른 모서리의 첫 자리
  await page.keyboard.press('ArrowRight');
  await expect.poll(previewAt).not.toBe(p0);
  await page.keyboard.press('r');
  await expect(liveText(page)).toContainText(/돌렸어요|다른 방향으로 붙지 않아요/);
  await page.keyboard.press('Escape');
  await expect(tiles(page)).toHaveCount(1);
  await placeStep(page, play, second, 'keyboard');
  // Ctrl+Z 되돌리기 → 다시 놓기
  await page.keyboard.press('Control+z');
  await expect(tiles(page)).toHaveCount(1);
  await tabTo(cardOf(page, second.group));
  await placeStep(page, play, second, 'keyboard');
  // 판: 방향키로 면 고르기(키보드 테두리) → Delete로 빼기 → Ctrl+Z
  await board.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.pf-outline.is-key')).toHaveCount(1);
  await page.keyboard.press('Delete');
  await expect(tiles(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(tiles(page)).toHaveCount(2);
  // 판의 면을 Enter로 들고(자석 자리) Esc — 그대로
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(liveText(page)).toContainText('들었어요');
  await page.keyboard.press('Escape');
  for (const s of plan.steps.slice(0, 2)) await expectAt(page, play, s);
  // 나머지
  for (const s of plan.steps.slice(2)) {
    await tabTo(cardOf(page, s.group));
    await placeStep(page, play, s, 'keyboard');
  }
  await tabTo(page.locator('.free-fold'));
  await page.keyboard.press('Enter');
  await expect(page.locator('.free-host .fold-stage')).toHaveAttribute('data-fold', 'done');
  await expect(page.locator('.reason')).toContainText('새 전개도 발견');
  await expect(page.locator('.free-fix')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.free-new')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tiles(page)).toHaveCount(0);
  await expect(page.locator('.pf-cards .pf-card').first()).toBeFocused();
  expect(errors).toEqual([]);
});

test('전개도 완성하기 손가락(태블릿): 카드를 판으로 끌면 복제가 손을 따라오고 놓일 모양(점선)이 보이며, 끄는 중 다른 손가락으로 톡 → 30° 돌고 그 손가락이 닿은 버튼은 눌리지 않는다. 면을 톡 → ↻ 손잡이를 손가락으로 돌리면 가까운 30°로(화면이 쓸리지 않고 관성 0, 끝난 뒤 첫 탭이 먹힌다)', async ({ page, browser }, testInfo) => {
  test.skip(!touchOf(testInfo), '손가락은 태블릿에서');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openStage(page, 'prism-free');
  const play = freePlay('1', page);
  const plan = netPlan(play, 0);
  await page.evaluate(() => {
    window.clicked = [];
    document.addEventListener('click', (e) => window.clicked.push(e.target.closest('button')?.className ?? ''), true);
  });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  // 첫 면: 손가락으로 끌기 — 끄는 동안 복제 · 점선, 다른 손가락으로 [모두 빼기] 자리를 톡 → 30°
  const s0 = plan.steps[0];
  const card = cardOf(page, s0.group);
  const want = (s0.turn - Number(await card.getAttribute('data-turn')) + 11) % 12; // 끄는 중 한 번 더 돌릴 것을 뺀 돌림
  if (want > 0) {
    await card.tap();
    for (let i = 0; i < want; i += 1) await page.locator('.tool-turn').tap();
  }
  const from = mid(await card.boundingBox());
  const to = toScreen(await boardBox(page, play), s0.at);
  const otherGroup = L.freeCards(L.freeSolid(play.solidId)).map((c) => c.group).find((g) => g !== s0.group);
  const other = mid(await cardOf(page, otherGroup).boundingBox()); // 다른 손가락이 닿는 곳: 다른 카드(눌리면 골라진다)
  await touch('touchStart', [{ x: from[0], y: from[1], id: 1 }]);
  for (let i = 1; i <= 12; i += 1) await touch('touchMove', [{ x: from[0] + ((to[0] - from[0]) * i) / 12, y: from[1] + ((to[1] - from[1]) * i) / 12, id: 1 }]);
  await expect(page.locator('body > .dnd-ghost')).toHaveCount(1);
  await expect(page.locator('.pf-preview')).toHaveCount(1);
  const before = await page.locator('.pf-preview').getAttribute('points');
  await touch('touchStart', [{ x: to[0], y: to[1], id: 1 }, { x: other[0], y: other[1], id: 2 }]);
  await touch('touchEnd', [{ x: other[0], y: other[1], id: 2 }]); // 다른 손가락만 뗀다
  await expect(liveText(page)).toContainText('끄는 면을 돌렸어요');
  expect(await page.locator('.pf-preview').getAttribute('points')).not.toBe(before);
  await touch('touchEnd', [{ x: to[0], y: to[1], id: 1 }]);
  await expect(tiles(page)).toHaveCount(1);
  await expectAt(page, play, s0);
  await expect(cardOf(page, otherGroup)).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.clicked.filter((c) => c.includes('pf-card')))).toEqual([]);
  // 다음 면을 톡으로 놓고, 그 면을 톡 → 손잡이를 손가락으로 90° 돌린다(놓으면 가까운 30°의 배수로 — 붙을 모서리가 있으면 붙는다)
  await placeStep(page, play, plan.steps[1], 'tap');
  const s1 = plan.steps[1];
  const tile = page.locator(`.pf-tile[data-face="${s1.card}"]`);
  const c1 = toScreen(await boardBox(page, play), centroid(s1.poly));
  await page.touchscreen.tap(...c1);
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  const handle = page.locator('.turn-handle-board');
  await expect(handle).toBeVisible();
  await settled(page);
  const [hx, hy] = mid(await handle.boundingBox());
  const r = Math.hypot(hx - c1[0], hy - c1[1]);
  const a0 = Math.atan2(hy - c1[1], hx - c1[0]);
  await page.evaluate(() => {
    window.moves = [];
    window.addEventListener('touchmove', (e) => setTimeout(() => window.moves.push(e.defaultPrevented)), { passive: true });
  });
  const expected = L.settlePoly(L.freeCards(L.freeSolid(play.solidId)).find((c) => c.id === s1.card), L.turnPoly(s1.poly, 90), [{ id: plan.placed[0].id, poly: plan.placed[0].poly }], play.board);
  const seen = await touchGestures(browser, page, async () => {
    await touch('touchStart', [{ x: hx, y: hy, id: 1 }]);
    for (let i = 1; i <= 12; i += 1) {
      const a = a0 + (Math.PI / 2) * (i / 12);
      await touch('touchMove', [{ x: c1[0] + r * Math.cos(a), y: c1[1] + r * Math.sin(a), id: 1 }]);
    }
    await touch('touchEnd', [{ x: c1[0] + r * Math.cos(a0 + Math.PI / 2), y: c1[1] + r * Math.sin(a0 + Math.PI / 2), id: 1 }]);
  });
  const moved = (await boardPolys(page, play)).find((f) => f.id === s1.card);
  if (expected) expect(samePlace(moved.poly, expected.poly, 0.06), '90° 돌린 자리').toBe(true);
  else expect(samePlace(moved.poly, s1.poly, 0.06), '놓을 수 없으면 제자리').toBe(true);
  const prevented = await page.evaluate(() => window.moves);
  expect(prevented.length).toBeGreaterThan(0);
  expect(prevented.every(Boolean), '손잡이를 돌리는 동안의 touchmove는 쓴 것으로 알린다').toBe(true);
  if (seen.traced) expect(seen.flingStarts, '관성 0').toBe(0);
  // 돌린 바로 뒤의 첫 탭이 먹힌다: 손잡이를 톡 → 30°(놓을 수 없으면 30°씩 더) 돌아 모양이 바뀐다
  const beforeTap = (await boardPolys(page, play)).find((f) => f.id === s1.card).poly;
  await handle.tap();
  await expect.poll(async () => samePlace((await boardPolys(page, play)).find((f) => f.id === s1.card).poly, beforeTap, 0.06)).toBe(false);
  await cdp.detach();
  expect(errors).toEqual([]);
});

test('전개도 완성하기 손짓(마우스): 놓인 면 끌어 옮기기 · 카드 칸으로 끌어 빼기 · 두 번 누르기 돌리기 · ↻ 손잡이(잡고 돌리기 · 누르기) · 카드 칸 카드의 손잡이 · 끄는 중 R과 오른쪽 버튼(메뉴 없음) · [되돌리기] · [모두 빼기] · 겹치는 자리는 제자리(안내) · 떨어진 면이 있으면 접기가 꺼지고 "떨어짐"', async ({ page }, testInfo) => {
  test.skip(touchOf(testInfo), '마우스는 크롬북에서');
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await openStage(page, 'prism-free', '', '3');
  const play = freePlay('3', page);
  const plan = netPlan(play, 0);
  const cards = L.freeCards(L.freeSolid(play.solidId));
  await page.evaluate(() => {
    window.menus = 0;
    window.addEventListener('contextmenu', (e) => {
      if (!e.defaultPrevented) window.menus += 1;
    });
  });
  const dragFromTo = async (from, to, during = null) => {
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(from[0] + 12, from[1] + 4, { steps: 2 });
    await page.mouse.move(...to, { steps: 8 });
    if (during) await during();
    await page.mouse.up();
  };
  const polyOf = async (id) => (await boardPolys(page, play)).find((f) => f.id === id)?.poly ?? null;
  /** 면 고르기(이미 골라져 있으면 그대로 — 고른 면을 한 번 더 누르면 돌아가므로) */
  const selectTile = async (id, at) => {
    if ((await page.locator(`.pf-tile[data-face="${id}"]`).getAttribute('aria-pressed')) !== 'true') await page.mouse.click(...at);
    await expect(page.locator(`.pf-tile[data-face="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
  };
  // 끄는 중 R(첫 면) · 오른쪽 버튼(둘째 면)으로 돌려 놓기 — 메뉴는 뜨지 않는다
  await placeStep(page, play, plan.steps[0], 'drag-r');
  await placeStep(page, play, plan.steps[1], 'drag-right');
  expect(await page.evaluate(() => window.menus)).toBe(0);
  const s1 = plan.steps[1];
  const box = await boardBox(page, play);
  const c1 = toScreen(box, centroid(s1.poly));
  // 놓인 면을 빈 곳으로 끌어 옮기기(가까운 모서리가 없으면 놓은 그대로) → 다시 제자리 모서리 가까이 끌면 붙는다
  const card1 = cards.find((c) => c.id === s1.card);
  const far = looseSpot(play, card1, s1.poly, [{ id: plan.placed[0].id, poly: plan.placed[0].poly }]);
  expect(far, '떨어진 빈 곳').not.toBeNull();
  await dragFromTo(c1, toScreen(box, far));
  const movedPoly = await polyOf(s1.card);
  expect(samePlace(movedPoly, s1.poly, 0.06)).toBe(false);
  expect(Math.hypot(...centroid(movedPoly).slice(0, 2).map((v, i) => v - far[i]))).toBeLessThan(0.1);
  await expect(page.locator('.free-note')).not.toHaveClass(/is-wrong/);
  await dragFromTo(toScreen(box, far), toScreen(box, centroid(s1.poly).slice(0, 2).map((v, i) => v + [0.25, -0.2][i])));
  await expectAt(page, play, s1);
  // 겹치는 자리에 놓으면 제자리 + 안내
  await dragFromTo(c1, toScreen(box, centroid(plan.steps[0].poly)));
  await expect(page.locator('.free-note')).toHaveClass(/is-wrong/);
  await expect(page.locator('.free-note')).toContainText('그 자리에는 놓을 수 없어요');
  await expectAt(page, play, s1);
  await expect(page.locator('.dnd-ghost')).toHaveCount(0);
  // 두 번 누르기: 고르고(손잡이) → 한 번 더 누르면 돌아간다(놓을 수 있는 다음 30°) → [되돌리기]
  await selectTile(s1.card, c1);
  await expect(page.locator('.turn-handle-board')).toBeVisible();
  await page.mouse.click(...c1);
  await expect(liveText(page)).toContainText('돌렸어요');
  expect(samePlace(await polyOf(s1.card), s1.poly, 0.06)).toBe(false);
  await page.locator('.tool-undo').click();
  await expectAt(page, play, s1);
  // 손잡이 누르기(30° 한 번) · 잡고 돌리기 — 놓으면 가까운 30°의 배수
  await selectTile(s1.card, c1);
  const handle = page.locator('.turn-handle-board');
  await handle.click();
  expect(samePlace(await polyOf(s1.card), s1.poly, 0.06)).toBe(false);
  await page.locator('.tool-undo').click();
  await expectAt(page, play, s1);
  await selectTile(s1.card, c1);
  await expect(handle).toBeVisible();
  const [hx, hy] = mid(await handle.boundingBox());
  const rr = Math.hypot(hx - c1[0], hy - c1[1]);
  const a0 = Math.atan2(hy - c1[1], hx - c1[0]);
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(c1[0] + rr * Math.cos(a0 + (Math.PI / 2) * (i / 10)), c1[1] + rr * Math.sin(a0 + (Math.PI / 2) * (i / 10)));
  await expect(page.locator('.pf-preview')).toHaveCount(1); // 놓을 모양(가까운 30°)
  await page.mouse.up();
  const expected = L.settlePoly(card1, L.turnPoly(s1.poly, 90), [{ id: plan.placed[0].id, poly: plan.placed[0].poly }], play.board);
  if (expected) expect(samePlace(await polyOf(s1.card), expected.poly, 0.06)).toBe(true);
  await page.locator('.tool-undo').click();
  await expectAt(page, play, s1);
  // 카드 칸의 카드: 누르면 손잡이 → 누르기 30° · [돌리기] 30°
  const s2 = plan.steps[2];
  const card2 = cardOf(page, s2.group);
  const t0 = Number(await card2.getAttribute('data-turn'));
  await card2.click();
  await expect(page.locator('.turn-handle-tray')).toBeVisible();
  await page.locator('.turn-handle-tray').click();
  await expect(card2).toHaveAttribute('data-turn', String((t0 + 1) % 12));
  await page.locator('.tool-turn').click();
  await expect(card2).toHaveAttribute('data-turn', String((t0 + 2) % 12));
  await card2.click(); // 고르기 풀기
  // 카드 칸으로 끌어 빼기 → [되돌리기]
  const tray = await page.locator('.pf-cards').boundingBox();
  await dragFromTo(c1, [tray.x + tray.width / 2, tray.y + tray.height - 6]);
  await expect(tiles(page)).toHaveCount(1);
  await expect(liveText(page)).toContainText('카드 칸으로 뺐어요');
  await page.locator('.tool-undo').click();
  await expect(tiles(page)).toHaveCount(2);
  // 나머지를 놓고, 마지막 면을 떨어진 곳으로 → 접기 꺼짐 · "떨어짐"
  await buildPlan(page, play, { steps: plan.steps.slice(2) }, ['click']);
  await expect(page.locator('.free-fold')).toBeEnabled();
  const last = plan.steps.at(-1);
  const lastCard = cards.find((c) => c.id === last.card);
  const loose = looseSpot(play, lastCard, last.poly, plan.placed.slice(0, -1));
  expect(loose, '떨어진 빈 곳').not.toBeNull();
  await dragFromTo(toScreen(box, centroid(last.poly)), toScreen(box, loose));
  await expect(page.locator('.free-fold')).toBeDisabled();
  await expect(page.locator('.free-note')).toContainText('떨어진 면이 있어요');
  await expect(page.locator('.pf-apart')).toHaveCount(1); // 떨어진 면의 점선 테두리(이름 옆 "떨어짐"은 면 안에 들 때)
  expect(await page.locator('.pf-apart-tag').count()).toBeLessThanOrEqual(1);
  await expectMatClear(page, '떨어진 면');
  await page.locator('.tool-undo').click();
  await expect(page.locator('.free-fold')).toBeEnabled();
  await expect(page.locator('.pf-apart')).toHaveCount(0);
  // [모두 빼기]
  await page.locator('.tool-clear').click();
  await expect(tiles(page)).toHaveCount(0);
  await expect(page.locator('.free-fold')).toBeDisabled();
  expect(await page.evaluate(() => window.menus)).toBe(0);
  expect(errors).toEqual([]);
});

test('전개도 완성하기 정답 노출 0: 끄는 동안 맞는 자리 · 틀린 자리 · 길이가 다른 자리에서 놓일 모양(점선)이 같은 모습이고, 놓으면 면 · 선 · 알림이 같은 꼴이다. 접기 전 판 · 무대에 결과(이름표 · 겹침 · 비어요)가 없다 (시드 6개)', async ({ page }, testInfo) => {
  test.skip(touchOf(testInfo), '마우스로 크롬북에서 (손가락은 같은 화면 — 모양 검사는 한 번)');
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  let kinds = { right: 0, wrong: 0, unequal: 0 };
  for (const seed of ['1', '2', '3', '4', '5', '6']) {
    await openStage(page, 'prism-free', '', seed);
    const play = freePlay(seed, page);
    const plan = netPlan(play, 0);
    await buildPlan(page, play, plan, ['click'], { upTo: 2 });
    const cards = L.freeCards(L.freeSolid(play.solidId));
    const next = plan.steps[2];
    const card = cards.find((c) => c.id === next.card);
    const pre = plan.placed.slice(0, 2);
    const spots = L.magnetSpots(card, pre, play.board);
    const pick = (test2) => spots.find((s) => test2(s) && dropFor(play, card, s.poly, pre));
    const lenOk = (s) => !isUnequal(s, pre, card);
    const right = pick((s) => samePlace(s.poly, plan.placed[2].poly));
    const wrong = pick((s) => lenOk(s) && !samePlace(s.poly, plan.placed[2].poly));
    const unequal = pick((s) => !lenOk(s));
    const box = await boardBox(page, play);
    const sigs = [];
    for (const [name, spot] of [['right', right], ['wrong', wrong], ['unequal', unequal]]) {
      if (!spot) continue;
      kinds[name] += 1;
      // 그 자리에 붙게 끌어 놓을 곳(카드는 그 자리의 방향에 가까운 30°로 돌려 둔다 — 화면과 같은 함수로 계산)
      const drop = dropFor(play, card, spot.poly, pre);
      const { turn } = drop;
      const step = { group: card.group, card: card.id, turn, at: drop.at, poly: drop.poly };
      const cardEl = cardOf(page, card.group);
      await cardEl.focus();
      const need = (turn - Number(await cardEl.getAttribute('data-turn')) + 12) % 12;
      for (let i = 0; i < need; i += 1) await page.keyboard.press('r');
      await expect(cardEl).toHaveAttribute('data-turn', String(turn));
      const from = mid(await cardEl.boundingBox());
      const to = toScreen(box, step.at);
      await page.mouse.move(...from);
      await page.mouse.down();
      await page.mouse.move(from[0] - 14, from[1], { steps: 2 });
      await page.mouse.move(...to, { steps: 8 });
      const preview = await page.locator('.pf-preview').evaluate((el) => ({ cls: el.getAttribute('class'), attrs: [...el.attributes].map((a) => a.name).sort().join(','), style: getComputedStyle(el).stroke + getComputedStyle(el).fill }));
      await page.mouse.up();
      await expect(tiles(page)).toHaveCount(3);
      await expectAt(page, play, step);
      await expect(liveText(page)).toContainText('면의 모서리에 붙었어요');
      const after = await page.evaluate((id) => {
        const tile = document.querySelector(`.pf-tile[data-face="${id}"]`);
        return {
          tile: [...tile.attributes].map((a) => a.name).sort().join(',') + tile.className,
          lines: [...document.querySelectorAll('.pf-overlay > *')].map((el) => el.getAttribute('class')).sort().join(','),
          live: document.querySelector('.sr-only[role="status"]').textContent.replace(/[가-힣] 면/g, '○ 면'),
        };
      }, card.id);
      sigs.push({ preview, tile: after.tile, live: after.live, lineKinds: [...new Set(after.lines.split(','))].sort().join(',') });
      await page.locator('.tool-undo').click();
      await expect(tiles(page)).toHaveCount(2);
    }
    expect(sigs.length, `시드 ${seed}`).toBeGreaterThanOrEqual(2);
    expect(new Set(sigs.map((s) => JSON.stringify(s))).size, `시드 ${seed}: ${JSON.stringify(sigs)}`).toBe(1);
    await expect(page.locator('.free-host .fold-stage')).toBeHidden();
    await expect(page.locator('.free-host .stage-badge')).toBeHidden();
    await expect(page.locator('.free-host .is-overlap, .free-host .edge-tag, .pf-mboard .is-right, .pf-mboard .is-wrong')).toHaveCount(0);
  }
  expect(kinds.right).toBe(6);
  expect(kinds.wrong).toBeGreaterThanOrEqual(5);
  expect(kinds.unequal).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});

test('전개도 완성하기: 판에서 무대로 이어 접을 때 펼친 모습이 판과 같은 자리 · 같은 크기다(어긋남 0px)', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openStage(page, 'prism-free');
  const play = freePlay('1', page);
  await buildPlan(page, play, netPlan(play, 0), [touchOf(testInfo) ? 'tap' : 'click']);
  const before = await page.evaluate(() => [...document.querySelectorAll('.pf-tile')].map((el) => {
    const r = el.getBoundingClientRect();
    const pts = el.querySelector('polygon').getAttribute('points').split(' ').map((p) => p.split(',').map(Number));
    return { id: el.dataset.face, pts: pts.map(([x, y]) => [x + r.left, y + r.top]) };
  }));
  // 접은 뒤 [펴기]로 다 펴면(접는 정도 0) 펼친 모습은 처음 모습 — 판과 같은 자리 · 같은 1 cm 크기여야 한다(접기 시작 장면과 같은 자리)
  await pressBtn(page, '.free-fold', touchOf(testInfo) ? 'tap' : 'click');
  await expect(page.locator('.free-host .fold-stage')).toHaveAttribute('data-fold', 'done');
  await pressBtn(page, '.fold-toggle', touchOf(testInfo) ? 'tap' : 'click');
  await expect(page.locator('.free-host .fold-stage')).toHaveAttribute('data-fold', 'flat');
  await settled(page, '.free-host');
  await expect.poll(() => page.locator('.free-host .net-scene').evaluate((el) => new Promise((done) => {
    const a = el.style.transform;
    requestAnimationFrame(() => requestAnimationFrame(() => done(a === el.style.transform)));
  }))).toBe(true);
  const flat = await page.evaluate(() => [...document.querySelectorAll('.free-host .net-face')].map((el) => ({ id: el.dataset.face, r: el.getBoundingClientRect().toJSON() })));
  expect(flat.length).toBe(before.length);
  for (const f of before) {
    const xs = f.pts.map((p) => p[0]);
    const ys = f.pts.map((p) => p[1]);
    const bx = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
    const g = flat.find((x) => x.id === f.id);
    expect(g, f.id).toBeTruthy();
    for (const k of ['left', 'top', 'right', 'bottom']) expect(Math.abs(g.r[k] - bx[k]), `${f.id} ${k}`).toBeLessThanOrEqual(3);
  }
});

for (const sizeName of Object.keys(SIZES)) test(`전개도 완성하기 배치(${sizeName} — 여섯 크기마다 따로): 처음(빈 판) · 카드를 고른 장면(손잡이) · 면을 고른 장면(손잡이) · 다 놓은 장면 · 떨어진 면 · 접은 장면(맞음 · 안 됨 · 까닭 고른 뒤) · 2가지 · 3가지를 찾은 장면 — 세 각기둥(삼각 · 사각 · 육각) — 스크롤 · 판 넘침 0, 버튼 · 손잡이 48px, 판 · 면 · 손잡이가 만들 각기둥 창 · 띠와 겹침 0, 판의 글끼리 겹침 0, 알림이 조작을 가리지 않음`, async ({ page }, testInfo) => {
  const size = SIZES[sizeName];
  test.skip(!sizesFor(testInfo).includes(size), '이 화면 크기는 다른 기기(프로젝트)에서');
  test.setTimeout(600_000); // 보통 1분 안팎, CPU 12배에서 약 6분
  const touch = touchOf(testInfo);
  const how = touch ? 'tap' : 'click';
  const press = (loc) => (touch ? loc.tap() : loc.click());
  {
    await page.setViewportSize(size);
    for (const seed of ['1', '2', '8']) { // 사다리꼴기둥 · 이등변삼각기둥 · 정육각기둥(판이 가장 큰 hex-b)
      await openStage(page, 'prism-free', '', seed);
      const label = `${size.width}×${size.height} 시드 ${seed}`;
      const play = freePlay(seed, page);
      await noScroll(page, `${label} 처음`);
      await expectPanelFits(page, `${label} 처음`);
      expect((await expectMatClear(page, `${label} 처음`)).faces).toBe(0);
      const plan = netPlan(play, 0);
      await press(cardOf(page, plan.steps[0].group));
      expect((await expectMatClear(page, `${label} 카드 고름`)).handle).toBe(1);
      await expectPanelFits(page, `${label} 카드 고름`);
      await press(cardOf(page, plan.steps[0].group));
      await buildPlan(page, play, plan, [how], { upTo: plan.steps.length - 1 });
      // 면을 고른 장면(판의 손잡이)
      const s1 = plan.steps[1];
      const [x1, y1] = toScreen(await boardBox(page, play), centroid(s1.poly));
      if (touch) await page.touchscreen.tap(x1, y1);
      else await page.mouse.click(x1, y1);
      await expect(page.locator('.turn-handle-board')).toBeVisible();
      await settled(page);
      expect((await expectMatClear(page, `${label} 면 고름`)).handle).toBe(1);
      if (touch) await page.touchscreen.tap(x1, y1);
      else await page.mouse.click(x1, y1); // 두 번 누르기 → 돌아간다 → 되돌리기
      await press(page.locator('.tool-undo'));
      await placeStep(page, play, plan.steps.at(-1), how);
      await noScroll(page, `${label} 다 놓음`);
      await expectPanelFits(page, `${label} 다 놓음`);
      await expectMatClear(page, `${label} 다 놓음`);
      await foldNow(page, touch ? 'touch' : 'mouse');
      await expectToastClear(page, `${label} 접음`);
      await noScroll(page, `${label} 접음`);
      await expectPanelFits(page, `${label} 접음`);
      await press(page.locator('.free-new'));
      await expect(tiles(page)).toHaveCount(0);
      await noScroll(page, `${label} 새로 만들기`);
      await expectPanelFits(page, `${label} 새로 만들기`);
      // 2가지째 · 3가지째를 찾은 장면(주문서에 "…찾았어요!" 줄과 버튼 셋 — review-prism-g2 G2-2)
      await buildPlan(page, play, netPlan(play, 1), [how]);
      await expectMatClear(page, `${label} 둘째`);
      await foldNow(page, touch ? 'touch' : 'mouse');
      await expect(page.locator('.free-finish')).toBeVisible();
      await noScroll(page, `${label} 2가지 찾음`);
      await expectPanelFits(page, `${label} 2가지 찾음`);
      await press(page.locator('.free-new'));
      await buildPlan(page, play, netPlan(play, 2), [how]);
      await foldNow(page, touch ? 'touch' : 'mouse');
      await expect(page.locator('.free-finish')).toHaveClass(/btn-primary/);
      await noScroll(page, `${label} 3가지 찾음`);
      await expectPanelFits(page, `${label} 3가지 찾음`);
    }
    // 안 되는 모양: 까닭 고르기 · 고른 뒤, 그리고 떨어진 면
    await openStage(page, 'prism-free', '', '3');
    const play = freePlay('3', page);
    const wrong = twistedPlan(play, (spot, faces) => !L.judgeFreeNet(L.freeSolid(play.solidId), faces, L.rootCardId(L.freeCards(L.freeSolid(play.solidId)))).valid);
    await buildPlan(page, play, wrong, [how]);
    await expectMatClear(page, `${size.width} 안 되는 판`);
    await foldNow(page, touch ? 'touch' : 'mouse');
    await noScroll(page, `${size.width} 까닭 고르기`);
    await expectPanelFits(page, `${size.width} 까닭 고르기`);
    await press(page.locator('.reason-chip').first());
    await noScroll(page, `${size.width} 까닭 고른 뒤`);
    await expectPanelFits(page, `${size.width} 까닭 고른 뒤`);
    await press(page.locator('.free-fix'));
    // 떨어진 면: 마지막 면을 판의 빈 곳으로(누르기 — 면 고르고 판 누르기)
    const last = wrong.steps.at(-1);
    const loose = looseSpot(play, wrong.last, last.poly, wrong.placed.slice(0, -1));
    let box = await boardBox(page, play);
    const [lx, ly] = toScreen(box, centroid(last.poly));
    if (touch) await page.touchscreen.tap(lx, ly);
    else await page.mouse.click(lx, ly);
    await expect(page.locator(`.pf-tile[data-face="${last.card}"]`)).toHaveAttribute('aria-pressed', 'true');
    box = await boardBox(page, play);
    const [sx, sy] = toScreen(box, loose);
    if (touch) await page.touchscreen.tap(sx, sy);
    else await page.mouse.click(sx, sy);
    await expect(page.locator('.free-fold')).toBeDisabled();
    await expect(page.locator('.pf-apart')).toHaveCount(1);
    await noScroll(page, `${size.width} 떨어진 면`);
    await expectPanelFits(page, `${size.width} 떨어진 면`);
    await expectMatClear(page, `${size.width} 떨어진 면`);
  }
});

test('전개도 완성하기: 움직임 줄이기에서는 접기가 바로 끝 장면이고 색종이가 없다. 나간 뒤 오류 없음', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStage(page, 'prism-free');
  const play = freePlay('1', page);
  await buildPlan(page, play, netPlan(play, 0), [touchOf(testInfo) ? 'tap' : 'click']);
  await pressBtn(page, '.free-fold', touchOf(testInfo) ? 'tap' : 'click');
  await expect(page.locator('.free-host .fold-stage')).toHaveAttribute('data-fold', 'done');
  await expect(page.locator('.confetti, .celebrate-piece')).toHaveCount(0);
  await page.getByRole('button', { name: '단계 선택' }).click();
  await expect(page.locator('.stage-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

// ── 2. 도전: 모서리와 꼭짓점 ───────────────────────
const countQuestions = (seed) => makeCountQuestions(COUNT, createRng(`${seed}:prism-count`));
const choiceButton = (page, q) => (q.kind === 'count' ? page.locator(`.pc-answers .answer-btn[data-value="${q.answer}"]`) : page.locator(`.pc-answers .answer-btn[data-rule="${q.answer}"]`));

test('모서리와 꼭짓점(도전 주문서): 다섯 문항을 모두 맞히면 별 3개 · "도전 성공!", 셈 문항은 답한 뒤 무늬 띠로 세어 보이고 알아낸 것 표에 한 줄, 규칙 문항은 매트에 표. 점수 화면 = 저장, 차시 별 합계에는 넣지 않는다', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const touch = touchOf(testInfo);
  await openStage(page, 'prism-count');
  await expect(page.locator('.play-chip')).toHaveText('도전 주문서');
  await expect(page.locator('.timer-toggle')).toBeVisible();
  const qs = countQuestions('1');
  for (const q of qs) {
    // 문항 수는 한 가지(5): 주문서의 칸과 머리의 점 막대가 같다(코디네이터가 시안에서 본 것 ①)
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${q.number} / 5`);
    await expect(page.locator('.meta-progress small')).toHaveText(`문제 ${q.number} / 5`);
    await expect(page.locator('.meta-progress .q-dots i')).toHaveCount(5);
    if (q.kind === 'count') {
      await expect(page.locator('.pc-fact')).toContainText(`한 밑면의 변이 ${q.n}개`);
      await expect(page.locator('.mat .fold-stage')).toBeVisible();
      await expect(page.locator('.pc-board')).toBeHidden();
    } else {
      await expect(page.locator('.pc-board')).toBeVisible();
      await expect(page.locator('.pc-board tbody tr')).toHaveCount(3);
    }
    if (touch) await choiceButton(page, q).tap();
    else await choiceButton(page, q).click();
    await expect(page.locator('.reason')).toContainText('맞아요!');
    if (q.kind === 'count') {
      await expect(page.locator('.mat .edge-band')).toHaveCount(q.what === 'edges' ? 3 * q.n : 2 * q.n);
      await expect(page.locator('.pc-legend')).toBeVisible();
      await expect(page.locator('.pc-legend .pc-key')).toHaveText(q.what === 'edges' ? ['위 밑면', '아래 밑면', '옆으로 선 모서리'] : ['위 밑면', '아래 밑면']);
      await expect(page.locator('.pc-legend')).not.toContainText('null');
      await expect(page.locator('.pc-found tbody tr')).toHaveCount(q.number);
    }
    if (touch) await page.locator('.next-btn').tap();
    else await page.locator('.next-btn').click();
  }
  await expect(page.locator('.result-title')).toHaveText('도전 성공!');
  const xp = await resultXpSum(page);
  expect(xp.tiles + xp.line).toBe(xp.gained);
  expect(await storedXpOf(page)).toBe(xp.gained);
  // 독립 계산: 처음 맞힘 5 × 2 + 연속(3번) +1 + 도전 처음 성공 +10 + 별 3개 +6
  expect(xp.gained).toBe(5 * 2 + 1 + 10 + 6);
  expect(errors).toEqual([]);
});

test('모서리와 꼭짓점: 흔한 실수(옆으로 선 모서리만 · 한 밑면만)를 고르면 그 까닭과 바른 수 · 학습 기록에 tag, 별은 정답률(한 번 틀림 ★2)', async ({ page }) => {
  test.setTimeout(90_000);
  await openStage(page, 'prism-count');
  const qs = countQuestions('1');
  // 흔한 실수 n은 판마다 셈 문항 하나에만 있다(15-29) — 그 문항에서 고른다
  const mustQ = qs.find((q) => q.kind === 'count' && q.choices.some((c) => c.value === q.n));
  expect(qs.filter((q) => q.kind === 'count' && q.choices.some((c) => c.value === q.n))).toHaveLength(1);
  let wrong = 0;
  for (const q of qs) {
    if (q === mustQ) {
      await page.locator(`.pc-answers .answer-btn[data-value="${q.n}"]`).click();
      wrong += 1;
      await expect(page.locator('.reason')).toContainText(q.what === 'edges' ? '옆으로 선 모서리만' : '한 밑면의 꼭짓점만');
      await expect(page.locator('.reason')).toContainText(`${q.answer}개`);
      await expect(choiceButton(page, q)).toHaveClass(/is-answer/);
      await expect(page.locator('.toast')).toHaveCount(1); // 틀린 까닭 알림
      await page.locator('.next-btn').click();
      await expect(page.locator('.toast')).toHaveCount(0); // 다음 문제로 가면 앞 문제의 알림은 지운다
      continue;
    } else await choiceButton(page, q).click();
    await page.locator('.next-btn').click();
  }
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 2개');
  const rec = (await storedLog(page)).find((r) => r.stageId === 'prism-count');
  expect(rec.answers.filter((a) => !a.correct).map((a) => a.tag)).toEqual([mustQ.what === 'edges' ? '모서리의 수' : '꼭짓점의 수']);
});

test('모서리와 꼭짓점 정답 노출 0: 답하기 전 무대에는 띠 · 이름표 · 수가 없고(면은 모두 같은 색 · 글자 없음), 보기 버튼은 같은 모습 — 끌어 돌려도 그대로 (시드 6개)', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  for (const seed of ['1', '2', '3', '4', '5', '6']) {
    await openStage(page, 'prism-count', '', seed);
    const m = await page.evaluate(() => {
      const stage = document.querySelector('.mat .fold-stage');
      return {
        bands: stage.querySelectorAll('.edge-band, .edge-tag').length,
        digits: /\d/.test([...stage.querySelectorAll('.net-face')].map((f) => f.textContent).join('')),
        colors: new Set([...stage.querySelectorAll('.net-face')].map((f) => getComputedStyle(f).getPropertyValue('--face-color'))).size,
        buttons: new Set([...document.querySelectorAll('.pc-answers .answer-btn')].map((b) => `${b.className}|${[...b.attributes].map((a) => a.name).sort()}`)).size,
      };
    });
    expect(m, `시드 ${seed}`).toEqual({ bands: 0, digits: false, colors: 1, buttons: 1 });
    // 끌어서 돌려 본 뒤에도
    const box = await page.locator('.mat .fold-stage').boundingBox();
    if (!touchOf(testInfo)) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 30, { steps: 6 });
      await page.mouse.up();
    }
    await expect(page.locator('.mat .edge-band, .mat .edge-tag')).toHaveCount(0);
  }
});

test('모서리와 꼭짓점 키보드만(크롬북): 무대에서 방향키로 돌리고, Tab으로 보기에 가서 Enter, [다음 문제]도 Enter — 다섯 문항 끝까지', async ({ page }, testInfo) => {
  test.skip(touchOf(testInfo), '키보드는 크롬북에서');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await openStage(page, 'prism-count');
  const qs = countQuestions('1');
  await page.locator('.mat .fold-stage').focus();
  const before = await page.locator('.net-scene').evaluate((el) => el.style.transform);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.locator('.net-scene').evaluate((el) => el.style.transform)).not.toBe(before);
  for (const q of qs) {
    const btn = choiceButton(page, q);
    for (let i = 0; i < 30 && !(await btn.evaluate((el) => el === document.activeElement)); i += 1) await page.keyboard.press('Tab');
    await expect(btn).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.next-btn')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('.result-title')).toHaveText('도전 성공!');
  expect(errors).toEqual([]);
});

test('모서리와 꼭짓점 배치(여섯 크기): 셈 문항(답하기 전 · 답한 뒤) · 규칙 문항(답하기 전 · 답한 뒤) — 스크롤 · 판 넘침 0, 버튼 48px, 알림이 조작을 가리지 않음', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  for (const size of sizesFor(testInfo)) {
    await page.setViewportSize(size);
    await openStage(page, 'prism-count');
    const qs = countQuestions('1');
    for (const q of qs) {
      const label = `${size.width}×${size.height} 문제 ${q.number}`;
      await noScroll(page, `${label} 답하기 전`);
      await expectPanelFits(page, `${label} 답하기 전`);
      // 틀린 답(가장 긴 까닭 쪽지)도 넣어 본다
      // 틀린 답: 셈 문항은 까닭 쪽지가 가장 긴 보기
      const longest = q.kind === 'count' && q.choices.filter((c) => c.value !== q.answer).sort((a, b) => judgeCount(q, b.value).message.length - judgeCount(q, a.value).message.length)[0];
      const wrong = q.kind === 'count' ? page.locator(`.pc-answers .answer-btn[data-value="${longest.value}"]`) : page.locator(`.pc-answers .answer-btn:not([data-rule="${q.answer}"])`).first();
      if (touchOf(testInfo)) await wrong.tap();
      else await wrong.click();
      await expectToastClear(page, `${label} 답함`);
      await noScroll(page, `${label} 답한 뒤`);
      await expectPanelFits(page, `${label} 답한 뒤`);
      if (touchOf(testInfo)) await page.locator('.next-btn').tap();
      else await page.locator('.next-btn').click();
    }
  }
});

// ── 3. 차시 · 도장판 ─────────────────────────────
test('각기둥 차시: 네 단계를 마치면 도전 주문서 "모서리와 꼭짓점"이 열린다 — 전개도 완성하기를 마치면 "이 차시를 마쳤어요!"', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const how = touchOf(testInfo) ? 'tap' : 'click';
  // 앞 세 단계를 마친 기록(별)을 두고 4단계를 한다
  await page.goto(fileUrl(FILE, '?lesson=prism&seed=1&sound=off'));
  await page.evaluate(() => localStorage.setItem('edu:net-workshop:stars', JSON.stringify({ 'prism-parts': 3, 'prism-judge': 3, 'prism-edge': 3 })));
  await page.goto(fileUrl(FILE, '?lesson=prism&seed=1&sound=off'));
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.challenge-card')).toBeDisabled();
  await page.locator('.stage-card').nth(3).click();
  await expect(page.locator('.pf-mboard')).toBeVisible();
  const play = freePlay('1', page);
  for (const k of [0, 1]) {
    await buildPlan(page, play, netPlan(play, k), [how]);
    await foldNow(page, how === 'tap' ? 'touch' : 'mouse');
    if (k === 0) await pressBtn(page, '.free-new', how);
  }
  await pressBtn(page, '.free-finish', how);
  await expect(page.getByText('이 차시를 마쳤어요!')).toBeVisible();
  await page.getByRole('button', { name: '단계 선택' }).click();
  await expect(page.locator('.challenge-card')).toBeEnabled();
  await expect(page.locator('.challenge-card')).toContainText('모서리와 꼭짓점');
});

// ── 4. G1이 남긴 것: 거의 옆으로 선 면 (review-prism-g1 R5) ─────────────
test('밑면과 옆면: 거의 옆으로 서서 가는 띠로 보이는 면을 누르면 고르지 않고 "돌려서 눌러 봐요" 알림 — 돌려 가며 가장 가는 앞면을 찾아 누른다', async ({ page }, testInfo) => {
  test.skip(touchOf(testInfo), '마우스로 크롬북에서');
  test.setTimeout(90_000); // 보통 6초 안팎
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('prism-parts', '', '2'));
  await expect(page.locator('.mat .fold-stage .net-face').first()).toBeAttached();
  await settled(page);
  const box = await page.locator('.mat .fold-stage').boundingBox();
  // 무대의 돌림이 멈출 때까지(끌기 뒤 미끄러짐 포함): 두 그림 틀 동안 같은 모습
  const still = () => page.waitForFunction(() => new Promise((done) => {
    const scene = document.querySelector('.mat .net-scene');
    const before = scene.style.transform;
    requestAnimationFrame(() => requestAnimationFrame(() => done(scene.style.transform === before)));
  }));
  const thinnest = () => page.evaluate(() => [...document.querySelectorAll('.mat .net-face')].map((f) => {
    const r = f.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    return { ratio: Math.min(r.width, r.height) / Math.max(r.width, r.height), front: document.elementFromPoint(x, y)?.closest('.net-face') === f, x, y };
  }).filter((f) => f.front).sort((a, b) => a.ratio - b.ratio)[0]);
  let shown = false;
  for (let step = 0; step < 200 && !shown; step += 1) {
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 42, box.y + 30, { steps: 3 });
    await page.mouse.up();
    await still();
    const thin = await thinnest();
    if (!thin || thin.ratio >= 0.08) continue;
    await page.mouse.click(thin.x, thin.y);
    const picked = await page.locator('.mat .net-face.is-picked').count();
    if (picked) {
      await page.mouse.click(thin.x, thin.y); // 골라졌으면(아직 덜 기운 면) 풀고 더 돌린다
      continue;
    }
    await expect(page.locator('.toast')).toContainText('거의 옆으로 서 있어서 고를 수 없어요');
    shown = true;
  }
  expect(shown, '거의 옆으로 선 면을 눌러 알림을 봄').toBe(true);
  await expect(page.locator('.mat .net-face.is-picked')).toHaveCount(0);
  expect(errors).toEqual([]);
});
