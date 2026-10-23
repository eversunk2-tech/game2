/**
 * 각기둥의 전개도 G2: 4단계 "전개도 완성하기"(prism-free — 시안 B, 사용자 결정 15-26)와 도전 "모서리와 꼭짓점"(prism-count — 15-25 · 15-26).
 * 정답은 게임과 같은 시드 문자열(<seed>:<단계 id>)로 같은 주문 · 문항을 만들어 안다(DOM에 정답을 숨겨 두지 않는다). 전개도 완성하기의 "붙일 카드 · 붙일 변 ·
 * 붙일 자리"는 목표 전개도(같은 시드의 바탕 그림, 그 밖의 띠 꼴)에서 계산한다.
 * 배치 검사에는 글자 폭에 묶인 픽셀 상수를 쓰지 않는다(docs/engine.md 11절). 재기 전에는 움직임이 끝날 때까지 기다린다(common-rules 8절).
 */
import { expect, test } from '@playwright/test';
import { createRng } from '../../src/shared/core/random.js';
import { polyNetKey, prismNetCatalog } from '../../src/games/net-workshop/solids.js';
import { PRISM_STAGES } from '../../src/games/net-workshop/grade6/prism-stages.js';
import * as L from '../../src/games/net-workshop/grade6/prism-free-logic.js';
import { makeCountQuestions } from '../../src/games/net-workshop/grade6/prism-count-logic.js';
import { collectErrors, fileUrl, hasHorizontalScroll, touchFlick } from './helpers.js';

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

/** 그 요소들의 움직임이 끝날 때까지 (끝없이 도는 움직임은 기다리지 않는다) */
const settled = (page, selector = '.screen') => page.waitForFunction((sel) => [...document.querySelectorAll(sel)].every((el) => el.getAnimations({ subtree: true }).every((a) => (
  a.playState !== 'running' || a.animationName === 'turn-hint' || a.effect?.getComputedTiming().iterations === Infinity))), selector);
/** 단계 열기: 화면(나중에 받는 묶음)이 그려지고 움직임이 끝날 때까지 — 판의 면 · 카드(전개도 완성하기) / 무대의 면 · 보기(모서리와 꼭짓점) */
async function openStage(page, id, extra = '', seed = '1') {
  await page.goto(STAGE_URL(id, extra, seed));
  if (id === 'prism-free') {
    await expect(page.locator('.pf-board .pf-face').first()).toBeAttached();
    await expect(page.locator('.pf-card:not([hidden])').first()).toBeVisible();
  } else {
    await expect(page.locator('.mat .fold-stage .net-face').first()).toBeAttached();
    await expect(page.locator('.pc-answers .answer-btn').first()).toBeVisible();
  }
  await settled(page);
}

// ── 전개도 완성하기: 같은 시드로 주문을 만들고 목표 전개도로 가는 붙이기 차례를 계산한다 ─────────────
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
const samePoly = (p, q) => p.length === q.length && p.every((a) => q.some((b) => near(a, b)));
const freePlay = (seed, page) => L.makeFreePlay(FREE, createRng(`${seed}:prism-free`), { portrait: page.viewportSize().width <= 560 });
const asNet = (faces) => ({ faces: faces.map((f, i) => ({ id: `f${i}`, role: f.solid.startsWith('b') ? 'base' : 'side', poly: f.poly })) });

/** 주문 k의 목표 전개도: 1은 바탕 그림, 2부터는 그 밑면을 같은 자리에 둔 다른 모양(앞 주문들과 다른 것) — [{ solid, poly }] */
function targetFor(play, k, used) {
  if (k === 1) {
    used.add(polyNetKey(asNet(play.plan)));
    return play.plan;
  }
  const fs = L.freeSolid(play.solidId);
  const base = play.plan.find((f) => f.solid === 'b0').poly;
  for (const entry of prismNetCatalog(fs.solid)) {
    if (used.has(entry.key)) continue;
    const b0 = entry.net.faces.find((f) => f.solid === 'b0').poly;
    const ang = Math.atan2(base[1][1] - base[0][1], base[1][0] - base[0][0]) - Math.atan2(b0[1][1] - b0[0][1], b0[1][0] - b0[0][0]);
    const [c, s] = [Math.cos(ang), Math.sin(ang)];
    const map = ([x, y]) => [base[0][0] + (x - b0[0][0]) * c - (y - b0[0][1]) * s, base[0][1] + (x - b0[0][0]) * s + (y - b0[0][1]) * c];
    const faces = entry.net.faces.map((f) => ({ solid: f.solid, poly: f.poly.map(map) }));
    if (!samePoly(faces.find((f) => f.solid === 'b0').poly, base)) continue;
    used.add(entry.key);
    return faces;
  }
  throw new Error('목표 전개도를 찾지 못했어요');
}

/** 목표(target)를 만드는 붙이기 차례 [{ group, edge(카드의 붙일 변), slot(붙일 자리 data-slot) }] — 화면의 판과 같은 규칙(묶음의 맨 앞 카드)으로 */
function planMoves(play, k, target, start = L.givenFaces(play, k)) {
  const cards = L.freeCards(L.freeSolid(play.solidId));
  const placed = start.map((f) => ({ ...f }));
  const want = target.filter((f) => !placed.some((p) => p.solid === f.solid));
  const moves = [];
  for (let guard = 0; guard < 60 && want.length > 0; guard += 1) {
    for (const f of [...want]) {
      const hit = placed.map((p) => ({ p, e: p.poly.findIndex((a, i) => {
        const b = p.poly[(i + 1) % p.poly.length];
        return f.poly.some((c, j) => near(c, b) && near(f.poly[(j + 1) % f.poly.length], a));
      }) })).find((x) => x.e >= 0);
      if (!hit) continue;
      const { p, e } = hit;
      const group = cards.find((c) => c.solid === f.solid).group;
      const card = cards.find((c) => c.group === group && !placed.some((q) => q.id === c.id));
      const edge = L.attachEdges(card).find((kk) => samePoly(L.attachPoly(card.poly, kk, [p.poly[e], p.poly[(e + 1) % p.poly.length]]), f.poly));
      moves.push({ group, edge, slot: `${p.id}:${e}` });
      placed.push({ id: card.id, solid: f.solid, poly: L.attachPoly(card.poly, edge, [p.poly[e], p.poly[(e + 1) % p.poly.length]]) });
      want.splice(want.indexOf(f), 1);
      break;
    }
  }
  if (want.length > 0) throw new Error('붙이기 차례를 만들지 못했어요');
  return moves;
}

/** 붙이기 하나: 카드 고르기 → 붙일 변 맞추기 → 붙일 자리 (how: mouse | touch | keyboard | drag) */
async function attach(page, m, how = 'mouse') {
  const card = page.locator(`.pf-card[data-group="${m.group}"]`);
  const pressCard = async () => {
    if (how === 'touch') await card.tap();
    else if (how === 'keyboard') {
      await card.focus();
      await page.keyboard.press('Enter');
    } else await card.click();
  };
  if (how === 'drag') {
    // 끌어서 놓기(손가락): 붙일 변은 고른 상태에서 맞추고, 고르기를 푼 뒤 카드를 붙일 자리로 끈다
    await card.tap();
    for (let i = 0; i < 8 && (await card.getAttribute('data-edge')) !== String(m.edge); i += 1) await page.locator('.tool-turn').tap();
    await card.tap();
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    const from = await card.boundingBox();
    const to = await page.locator(`.pf-slot[data-slot="${m.slot}"]`).boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await touchFlick(cdp, [from.x + from.width / 2, from.y + from.height / 2], [to.x + to.width / 2, to.y + to.height / 2], { steps: 16, stepMs: 16 });
    await cdp.detach();
    return;
  }
  await pressCard();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  for (let i = 0; i < 8 && (await card.getAttribute('data-edge')) !== String(m.edge); i += 1) {
    if (how === 'keyboard') await page.keyboard.press('r');
    else if (how === 'touch') await page.locator('.tool-turn').tap();
    else await page.locator('.tool-turn').click();
  }
  await expect(card).toHaveAttribute('data-edge', String(m.edge));
  const slot = page.locator(`.pf-slot[data-slot="${m.slot}"]`);
  if (how === 'keyboard') {
    // 카드에서 Enter → 첫 붙일 자리에 초점이 와 있다. 그 자리로 초점을 옮겨 Enter
    await expect(page.locator('.pf-slot:focus')).toHaveCount(1);
    await slot.focus();
    await page.keyboard.press('Enter');
  } else if (how === 'touch') await slot.tap();
  else await slot.click();
}

async function buildOrder(page, play, k, used, how = 'mouse', { stopBeforeLast = false } = {}) {
  const moves = planMoves(play, k, targetFor(play, k, used));
  const count = stopBeforeLast ? moves.length - 1 : moves.length;
  for (let i = 0; i < count; i += 1) await attach(page, moves[i], i === 0 && how === 'drag-first' ? 'drag' : how === 'drag-first' ? 'touch' : how);
  return moves;
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
};

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
 * 매트 위: 붙일 자리 단추는 48px 이상 · 서로 겹치지 않고 · 매트 안이며, 만들 각기둥 창 · 안내 띠 · 조작 띠와 겹치지 않는다.
 * 놓인 면(판의 다각형)도 창 · 안내 띠 · 조작 띠와 겹치지 않는다(사용자 결정 15-26 — 창이 판을 가리지 않게)
 */
async function expectMatClear(page, label = '') {
  const m = await page.evaluate(() => {
    const rect = (el) => el.getBoundingClientRect();
    const vis = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
    const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const mat = rect(document.querySelector('.mat'));
    const blocks = [...document.querySelectorAll('.pf-pic.is-mat, .mat .board-legend, .mat .edit-tools .btn, .mat .edit-tools .mat-status')].filter(vis).map((el) => ({ name: el.className.split(' ')[0], r: rect(el) }));
    const slots = [...document.querySelectorAll('.pf-slot')].filter(vis).map((el) => ({ key: el.dataset.slot, r: rect(el) }));
    const faces = [...document.querySelectorAll('.pf-face')].map((el) => ({ key: el.dataset.face, r: rect(el) }));
    const out = [];
    for (const s of slots) {
      if (s.r.width < 47.5 || s.r.height < 47.5) out.push(`작은 자리 ${s.key}`);
      if (s.r.left < mat.left - 0.5 || s.r.right > mat.right + 0.5 || s.r.top < mat.top - 0.5 || s.r.bottom > mat.bottom + 0.5) out.push(`매트 밖 ${s.key}`);
      for (const b of blocks) if (hit(s.r, b.r)) out.push(`자리 ${s.key} × ${b.name}`);
    }
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        const a = slots[i].r;
        const b = slots[j].r;
        if (Math.hypot(a.left + a.width / 2 - b.left - b.width / 2, a.top + a.height / 2 - b.top - b.height / 2) < 47.5) out.push(`자리끼리 ${slots[i].key} ${slots[j].key}`);
      }
    }
    // 면: 다각형의 실제 꼭짓점으로(감싸는 상자로 재면 비스듬한 면이 넓게 잡힌다) — 창 · 띠와 넓이로 겹치나
    const svg = document.querySelector('.pf-svg');
    const sr = svg ? rect(svg) : null;
    for (const f of faces) {
      const pts = document.querySelector(`.pf-face[data-face="${f.key}"]`).getAttribute('points').split(' ').map((p) => p.split(',').map(Number)).map(([x, y]) => [x + sr.left, y + sr.top]);
      for (const b of blocks) {
        const inside = pts.some(([x, y]) => x > b.r.left + 0.5 && x < b.r.right - 0.5 && y > b.r.top + 0.5 && y < b.r.bottom - 0.5);
        if (inside) out.push(`면 ${f.key} × ${b.name}`);
      }
      if (pts.some(([x, y]) => x < mat.left || x > mat.right || y < mat.top || y > mat.bottom)) out.push(`면 매트 밖 ${f.key}`);
    }
    // 안내 띠끼리 겹치지 않고(좁은 화면에서 두 줄이 되어도), 조작 띠의 "붙인 면 n / m"이 잘리지 않는다
    const legends = [...document.querySelectorAll('.mat .board-legend')].filter(vis).map(rect);
    if (legends.length === 2 && hit(legends[0], legends[1])) out.push('안내 띠끼리');
    const status = document.querySelector('.mat .edit-tools .mat-status');
    if (vis(status) && status.scrollWidth > status.clientWidth + 1) out.push(`상태 글 잘림 ${status.textContent}`);
    // 판의 글(빈 모서리의 길이 · 면 이름)끼리 겹치지 않는다 — 돌린 길이 글은 돌린 직사각형으로 견준다(나눔축 검사)
    const boxes = [...document.querySelectorAll('.pf-len, .pf-face-label')].map((el) => {
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
    return { out, slots: slots.length };
  });
  expect(m.out, label).toEqual([]);
  return m.slots;
}
/** 지금 보이는 알림이 조작과 겹치지 않는다 */
async function expectToastClear(page, label = '') {
  const handle = await page.waitForFunction(() => {
    const toast = document.querySelector('.toast');
    if (!toast) return { hits: [] };
    const controls = '.play-header button, .answer-btn, .free-fold, .free-buttons button, .reason-chip, .reason-skip, .mat-tools button, .view-pad button, .pf-slot, .pf-card, .next-btn';
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
test('전개도 완성하기(마우스 · 손가락): 주문 ① 완성 → 접어 보기(예상 없이) → 새 전개도 → 다른 모양으로 주문 ② → 2가지면 [결과 보기](보통 버튼) → 한 가지 더 → 별 3개. 점수는 화면 = 저장 = 독립 계산, 도장 "기둥 설계사"', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  const how = touchOf(testInfo) ? 'touch' : 'mouse';
  await openStage(page, 'prism-free');
  const play = freePlay('1', page);
  const used = new Set();
  await expect(page.locator('.order-kind')).toHaveText('설계 주문');
  await expect(page.locator('.pf-step')).toContainText('주문 ①');
  await expect(page.locator('.pf-pic')).toBeVisible();
  await expect(page.locator('.pf-pic .box-tag').first()).toBeVisible();
  // 예상 버튼이 없다 — 확인 버튼은 [접어 보기] 하나(15-2)
  await expect(page.getByRole('button', { name: /될 거예요|안 될 거예요/ })).toHaveCount(0);
  await expect(page.locator('.free-fold')).toBeDisabled();
  await buildOrder(page, play, 1, used, how);
  await foldNow(page, how);
  await expect(page.locator('.stage-badge')).toContainText(`${L.freeSolid(play.solidId).name.slice(0, 2)}`);
  await expect(page.locator('.reason')).toContainText('새 전개도 발견');
  await expect(page.locator('.found-stamp')).toBeVisible();
  await expect(page.locator('.free-next')).toHaveText(/다른 모양으로 한 번 더/);
  await expect(page.locator('.free-finish')).toHaveCount(0); // 1가지로는 끝낼 수 없다
  if (how === 'touch') await page.locator('.free-next').tap();
  else await page.locator('.free-next').click();
  await expect(page.locator('.pf-step')).toContainText('주문 ②');
  await expect(page.locator('.pf-face')).toHaveCount(1); // 밑면 하나만 놓여 있다
  await buildOrder(page, play, 2, used, how);
  await foldNow(page, how);
  // 2가지: [결과 보기]는 보통 버튼, "한 가지 더 찾기"가 주 버튼(spec 16-15)
  await expect(page.locator('.free-finish')).toBeVisible();
  await expect(page.locator('.free-finish')).not.toHaveClass(/btn-primary/);
  await expect(page.locator('.free-next')).toHaveClass(/btn-primary/);
  await expect(page.locator('.goal-done')).toContainText('한 가지 더 찾으면 별 3개');
  if (how === 'touch') await page.locator('.free-next').tap();
  else await page.locator('.free-next').click();
  await buildOrder(page, play, 3, used, how);
  await foldNow(page, how);
  await expect(page.locator('.free-finish')).toHaveClass(/btn-primary/);
  await expect(page.locator('.found-slot.is-found')).toHaveCount(3);
  if (how === 'touch') await page.locator('.free-finish').tap();
  else await page.locator('.free-finish').click();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  await expect(page.getByText('찾은 전개도', { exact: true })).toBeVisible();
  const xp = await resultXpSum(page);
  expect(xp.tiles + xp.line).toBe(xp.gained);
  // 독립 계산(docs/engine.md 10절 점수 표): 처음 만든 전개도 3가지 × (등록 +5 + 만들기 성공 +2) + 연속 3번 +1 + 단계 완료 +5 + 별 3개 +6
  expect(xp.gained).toBe(3 * 7 + 1 + 5 + 6);
  expect(await storedXpOf(page)).toBe(xp.gained);
  await expect(page.locator('.new-badge-list li')).toContainText([/기둥 설계사/]);
  const log = await storedLog(page);
  const rec = log.find((r) => r.stageId === 'prism-free');
  expect(rec.answers.map((a) => a.correct)).toEqual([true, true, true]);
  expect(new Set(rec.answers.map((a) => a.itemId.split(':')[2])).size).toBe(3);
  expect(errors).toEqual([]);
});

test('전개도 완성하기: 다시 하는 판에서 이미 찾은 전개도는 점수가 없고(같은 칸), 같은 판에서 같은 모양을 두 번 접으면 기록도 없다', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await openStage(page, 'prism-free');
  const play = freePlay('1', page);
  await buildOrder(page, play, 1, new Set());
  await foldNow(page);
  const after1 = await storedXpOf(page);
  expect(after1).toBe(7); // 등록 +5 · 만들기 성공 +2 — 그 자리에서 바로 저장
  // 같은 판: 주문 ②에서 주문 ①과 같은 모양(바탕 그림)을 다시 만든다 → "이미 접어 본 모양", 기록 · 점수 없음
  await page.locator('.free-next').click();
  const again = planMoves(play, 2, play.plan);
  for (const m of again) await attach(page, m);
  await foldNow(page);
  await expect(page.locator('.reason')).toContainText('이미 접어 본 모양');
  await expect(page.locator('.free-fix')).toBeVisible();
  expect(await storedXpOf(page)).toBe(after1);
  // 새 판: 같은 전개도 → 전에 찾은 전개도(점수 없음)
  await openStage(page, 'prism-free');
  await buildOrder(page, play, 1, new Set());
  await foldNow(page);
  await expect(page.locator('.reason')).toContainText('전에 찾은 전개도');
  await expect(page.locator('.bonus-slot')).toContainText('점수는 없어요');
  expect(await storedXpOf(page)).toBe(after1);
  expect(errors).toEqual([]);
});

test('전개도 완성하기: 안 되는 모양을 접으면 "왜 안 될까요?"(고르기 전에는 까닭 글 · 표시 없음) → 고르면 까닭과 표시, 별은 깎이지 않는다. [펴서 고치기]는 놓은 그대로, [처음부터]는 처음 놓인 면만', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await openStage(page, 'prism-free', '', '3');
  const play = freePlay('3', page);
  // 목표 전개도에서 밑면 하나를 그 옆의 다른 옆면 자리(같은 쪽)로 옮겨 붙인다: 두 밑면이 같은 쪽 → 겹쳐요
  const moves = planMoves(play, 1, targetFor(play, 1, new Set()));
  const fs = L.freeSolid(play.solidId);
  const cards = L.freeCards(fs);
  // 마지막 카드(아무것)를 판의 다른 빈 모서리에 붙여 안 되는 모양을 만든다 — 놓인 면과 겹치지 않는 첫 자리
  for (const m of moves.slice(0, -1)) await attach(page, m);
  const last = moves.at(-1);
  const slots = await page.locator('.pf-slot').evaluateAll((els) => els.map((el) => el.dataset.slot));
  await page.locator(`.pf-card[data-group="${last.group}"]`).click();
  let wrongDone = false;
  for (const key of slots) {
    if (key === last.slot) continue;
    await page.locator(`.pf-slot[data-slot="${key}"]`).click();
    if ((await page.locator('.pf-face').count()) === cards.length) {
      wrongDone = true;
      break;
    }
    await page.locator(`.pf-card[data-group="${last.group}"]`).click();
  }
  expect(wrongDone).toBe(true);
  await foldNow(page);
  await expect(page.locator('.reason-pick')).toBeVisible();
  // 고르기 전: 무대에 까닭 띠 · 이름표 없음, 쪽지에 까닭 문장 없음
  await expect(page.locator('.free-host .edge-band, .free-host .edge-tag')).toHaveCount(0);
  await expect(page.locator('.reason')).toContainText('왜 그런지 골라 볼까요?');
  const xpBefore = await storedXpOf(page);
  await page.locator('.reason-chip').first().click();
  await expect(page.locator('.reason')).toContainText('까닭');
  await expect(page.locator('.stage-badge')).toContainText('각기둥이 안 돼요');
  expect(await storedXpOf(page)).toBe(xpBefore); // 안 되는 모양은 점수 없음(별 · 점수가 깎이지도 않는다)
  // [펴서 고치기]: 놓은 그대로 판으로
  await page.locator('.free-fix').click();
  await expect(page.locator('.pf-face')).toHaveCount(cards.length);
  await expect(page.locator('.free-fold')).toBeEnabled();
  await foldNow(page);
  await expect(page.locator('.reason')).toContainText('이미 접어 본 모양'); // 같은 안 되는 모양은 다시 기록하지 않는다
  await page.locator('.free-new').click();
  await expect(page.locator('.pf-face')).toHaveCount(play.given1.length);
  const log = (await storedLog(page)).find((r) => r.stageId === 'prism-free');
  expect(log ?? null).toBe(null); // 판을 마치기 전에는 학습 기록이 남지 않는다
  expect(errors).toEqual([]);
});

test('전개도 완성하기 키보드만(크롬북): Tab으로 카드 → Enter(첫 붙일 자리로 초점) → R로 붙일 변 → 붙일 자리 Enter · Esc로 그만두기 · Ctrl+Z 되돌리기 · [접어 보기] · 다음 주문까지', async ({ page }, testInfo) => {
  test.skip(touchOf(testInfo), '키보드는 크롬북에서');
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await openStage(page, 'prism-free', '', '2');
  const play = freePlay('2', page);
  const moves = planMoves(play, 1, targetFor(play, 1, new Set()));
  // Esc: 고르기를 그만두면 카드로 초점이 돌아간다
  const first = page.locator(`.pf-card[data-group="${moves[0].group}"]`);
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.pf-slot:focus')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await attach(page, moves[0], 'keyboard');
  await expect(page.locator('.pf-face')).toHaveCount(play.given1.length + 1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.pf-face')).toHaveCount(play.given1.length);
  for (const m of moves) await attach(page, m, 'keyboard');
  await foldNow(page, 'keyboard');
  await expect(page.locator('.free-next')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.pf-step')).toContainText('주문 ②');
  expect(errors).toEqual([]);
});

test('전개도 완성하기 손가락 끌기(태블릿): 카드를 붙일 자리로 끌어 놓으면 붙는다 — 끄는 동안 카드의 복제가 보이고 붙일 자리가 나타난다', async ({ page }, testInfo) => {
  test.skip(!touchOf(testInfo), '손가락 끌기는 태블릿에서');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openStage(page, 'prism-free');
  const play = freePlay('1', page);
  const moves = planMoves(play, 1, targetFor(play, 1, new Set()));
  await attach(page, moves[0], 'drag');
  await expect(page.locator('.pf-face')).toHaveCount(play.given1.length + 1);
  for (const m of moves.slice(1)) await attach(page, m, 'touch');
  await foldNow(page, 'touch');
  await expect(page.locator('.reason')).toContainText('새 전개도 발견');
  expect(errors).toEqual([]);
});

test('전개도 완성하기 정답 노출 0: 붙일 자리는 모두 같은 모습(클래스 · 크기 · 속성 이름 · 그림)이고, 접기 전 판 · 무대에 결과(이름표 · 겹침 · 비어요)가 없다 — 맞는 자리와 틀린 자리가 같다 (시드 6개)', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  for (const seed of ['1', '2', '3', '4', '5', '6']) {
    await openStage(page, 'prism-free', '', seed);
    const play = freePlay(seed, page);
    const moves = planMoves(play, 1, targetFor(play, 1, new Set()));
    await attach(page, moves[0], touchOf(testInfo) ? 'touch' : 'mouse');
    const card = page.locator('.pf-card:not([hidden]):not([disabled])').first();
    if (touchOf(testInfo)) await card.tap();
    else await card.click();
    const sig = await page.locator('.pf-slot').evaluateAll((els) => els.map((el) => ({
      cls: el.className,
      attrs: [...el.attributes].map((a) => a.name).sort().join(','),
      inner: el.innerHTML,
      w: Math.round(el.getBoundingClientRect().width),
      h: Math.round(el.getBoundingClientRect().height),
      vis: getComputedStyle(el).visibility,
    })));
    expect(sig.length).toBeGreaterThan(2);
    expect(new Set(sig.map((s) => JSON.stringify(s))).size, `시드 ${seed}`).toBe(1);
    // 맞는 자리(다음 붙이기)도 그 모습 그대로
    const right = moves[1]?.slot;
    if (right) await expect(page.locator(`.pf-slot[data-slot="${right}"]`)).toHaveCount(1);
    await expect(page.locator('.free-host .fold-stage')).toBeHidden();
    await expect(page.locator('.free-host .stage-badge')).toBeHidden();
    await expect(page.locator('.free-host .is-overlap, .free-host .slot-ghost, .free-host .edge-tag')).toHaveCount(0);
  }
});

test('전개도 완성하기: 판에서 무대로 이어 접을 때 펼친 모습이 판과 같은 자리 · 같은 크기다(어긋남 0px)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openStage(page, 'prism-free');
  const play = freePlay('1', page);
  const moves = planMoves(play, 1, targetFor(play, 1, new Set()));
  for (const m of moves) await attach(page, m);
  const before = await page.evaluate(() => {
    const svg = document.querySelector('.pf-svg').getBoundingClientRect();
    return [...document.querySelectorAll('.pf-face')].map((el) => ({ id: el.dataset.face, pts: el.getAttribute('points').split(' ').map((p) => p.split(',').map(Number)).map(([x, y]) => [x + svg.left, y + svg.top]) }));
  });
  // 접은 뒤 [펴기]로 다 펴면(접는 정도 0) 펼친 모습은 처음 모습 — 판과 같은 자리 · 같은 1 cm 크기여야 한다(접기 시작 장면과 같은 자리)
  await page.locator('.free-fold').click();
  await expect(page.locator('.free-host .fold-stage')).toHaveAttribute('data-fold', 'done');
  await page.locator('.fold-toggle').click();
  await expect(page.locator('.free-host .fold-stage')).toHaveAttribute('data-fold', 'flat');
  await settled(page, '.free-host');
  await expect.poll(() => page.locator('.free-host .net-scene').evaluate((el) => new Promise((done) => {
    const a = el.style.transform;
    requestAnimationFrame(() => requestAnimationFrame(() => done(a === el.style.transform)));
  }))).toBe(true);
  await page.evaluate(() => {
    window.__flat = [...document.querySelectorAll('.free-host .net-face')].map((el) => ({ id: el.dataset.face, r: el.getBoundingClientRect().toJSON() }));
  });
  const flat = await page.evaluate(() => window.__flat);
  expect(flat?.length ?? 0).toBe(before.length);
  for (const f of before) {
    const xs = f.pts.map((p) => p[0]);
    const ys = f.pts.map((p) => p[1]);
    const box = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
    const g = flat.find((x) => x.id === f.id);
    expect(g, f.id).toBeTruthy();
    for (const k of ['left', 'top', 'right', 'bottom']) expect(Math.abs(g.r[k] - box[k]), `${f.id} ${k}`).toBeLessThanOrEqual(3);
  }
});

test('전개도 완성하기 배치(여섯 크기): 처음 · 카드를 고른 장면 · 다 붙인 장면 · 접은 장면(맞음 · 안 됨 · 까닭 고른 뒤) · 주문 ② — 스크롤 · 판 넘침 0, 버튼 48px, 붙일 자리끼리 · 만들 각기둥 창 · 띠와 겹침 0, 알림이 조작을 가리지 않음', async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const how = touchOf(testInfo) ? 'touch' : 'mouse';
  for (const size of sizesFor(testInfo)) {
    await page.setViewportSize(size);
    for (const seed of ['1', '3', '5']) {
      await openStage(page, 'prism-free', '', seed);
      const label = `${size.width}×${size.height} 시드 ${seed}`;
      const play = freePlay(seed, page);
      const used = new Set();
      await noScroll(page, `${label} 처음`);
      await expectPanelFits(page, `${label} 처음`);
      const moves = planMoves(play, 1, targetFor(play, 1, used));
      const pressCard = (g) => (how === 'touch' ? page.locator(`.pf-card[data-group="${g}"]`).tap() : page.locator(`.pf-card[data-group="${g}"]`).click());
      await pressCard(moves[0].group);
      expect(await expectMatClear(page, `${label} 고름`)).toBeGreaterThan(0);
      await pressCard(moves[0].group);
      for (const m of moves.slice(0, -1)) await attach(page, m, how);
      await pressCard(moves.at(-1).group);
      await expectMatClear(page, `${label} 하나 남음`);
      await noScroll(page, `${label} 하나 남음`);
      await pressCard(moves.at(-1).group);
      await attach(page, moves.at(-1), how);
      await noScroll(page, `${label} 다 붙임`);
      await expectPanelFits(page, `${label} 다 붙임`);
      await foldNow(page, how);
      await expectToastClear(page, `${label} 접음`);
      await noScroll(page, `${label} 접음`);
      await expectPanelFits(page, `${label} 접음`);
      if (how === 'touch') await page.locator('.free-next').tap();
      else await page.locator('.free-next').click();
      await expect(page.locator('.pf-step')).toContainText('주문 ②');
      const moves2 = planMoves(play, 2, targetFor(play, 2, used));
      await pressCard(moves2[0].group);
      await expectMatClear(page, `${label} 주문 ② 고름`);
      await noScroll(page, `${label} 주문 ②`);
      await expectPanelFits(page, `${label} 주문 ②`);
    }
    // 안 되는 모양: 까닭 고르기 · 고른 뒤
    await openStage(page, 'prism-free', '', '3');
    const play = freePlay('3', page);
    const moves = planMoves(play, 1, targetFor(play, 1, new Set()));
    for (const m of moves.slice(0, -1)) await attach(page, m, how);
    const keys = await page.locator('.pf-slot').evaluateAll((els) => els.map((el) => el.dataset.slot));
    for (const key of keys.filter((k) => k !== moves.at(-1).slot)) {
      await page.locator(`.pf-card[data-group="${moves.at(-1).group}"]`).click();
      await page.locator(`.pf-slot[data-slot="${key}"]`).click();
      if (await page.locator('.free-fold').isEnabled()) break;
    }
    await foldNow(page);
    await noScroll(page, `${size.width} 까닭 고르기`);
    await expectPanelFits(page, `${size.width} 까닭 고르기`);
    await page.locator('.reason-chip').first().click();
    await noScroll(page, `${size.width} 까닭 고른 뒤`);
    await expectPanelFits(page, `${size.width} 까닭 고른 뒤`);
  }
});

test('전개도 완성하기: 움직임 줄이기에서는 접기가 바로 끝 장면이고 색종이가 없다. 나간 뒤 오류 없음', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStage(page, 'prism-free');
  const play = freePlay('1', page);
  for (const m of planMoves(play, 1, targetFor(play, 1, new Set()))) await attach(page, m);
  await page.locator('.free-fold').click();
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
  let wrong = 0;
  for (const q of qs) {
    if (q.kind === 'count' && wrong === 0) {
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
  expect(rec.answers.filter((a) => !a.correct).map((a) => a.tag)).toEqual([qs.find((q) => q.kind === 'count').what === 'edges' ? '모서리의 수' : '꼭짓점의 수']);
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
      const wrong = q.kind === 'count' ? page.locator(`.pc-answers .answer-btn[data-value="${q.n}"]`) : page.locator(`.pc-answers .answer-btn:not([data-rule="${q.answer}"])`).first();
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
test('각기둥 차시: 네 단계를 마치면 도전 주문서 "모서리와 꼭짓점"이 열린다 — 전개도 완성하기를 마치면 "이 차시를 마쳤어요!"', async ({ page }) => {
  test.setTimeout(120_000);
  // 앞 세 단계를 마친 기록(별)을 두고 4단계를 한다
  await page.goto(fileUrl(FILE, '?lesson=prism&seed=1&sound=off'));
  await page.evaluate(() => localStorage.setItem('edu:net-workshop:stars', JSON.stringify({ 'prism-parts': 3, 'prism-judge': 3, 'prism-edge': 3 })));
  await page.goto(fileUrl(FILE, '?lesson=prism&seed=1&sound=off'));
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.challenge-card')).toBeDisabled();
  await page.locator('.stage-card').nth(3).click();
  const play = freePlay('1', page);
  const used = new Set();
  for (const k of [1, 2]) {
    for (const m of planMoves(play, k, targetFor(play, k, used))) await attach(page, m);
    await foldNow(page);
    if (k === 1) await page.locator('.free-next').click();
  }
  await page.locator('.free-finish').click();
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
