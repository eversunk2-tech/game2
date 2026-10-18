/**
 * 각기둥의 전개도 차시(?lesson=prism — Build G1): 밑면과 옆면 → 각기둥이 될까? → 맞닿는 선분.
 * 정답은 게임과 같은 시드 문자열(<seed>:<단계 id>)로 같은 문항을 만들어 안다(DOM에 정답을 숨겨 두지 않는다).
 * 배치 검사에는 글자 폭에 묶인 픽셀 상수를 쓰지 않는다(docs/engine.md 11절). 재기 전에는 움직임이 끝날 때까지 기다린다(common-rules 8절).
 */
import { expect, test } from '@playwright/test';
import { createRng } from '../../src/shared/core/random.js';
import { PRISM_HOW_TO, PRISM_LESSONS, PRISM_STAGES } from '../../src/games/net-workshop/grade6/prism-stages.js';
import { makePrismQuestions, prismReasonOf } from '../../src/games/net-workshop/grade6/prism-logic.js';
import { collectErrors, fileUrl, hasHorizontalScroll, touchFlick } from './helpers.js';

const FILE = 'net-workshop.html';
const questionsFor = (stageId, seed = '1') => makePrismQuestions(PRISM_STAGES.find((s) => s.id === stageId), createRng(`${seed}:${stageId}`));
const STAGE_URL = (id, extra = '', seed = '1') => fileUrl(FILE, `?unlock=all&seed=${seed}&sound=off&stage=${id}${extra}`);
const foldStage = (page) => page.locator('.fold-stage');
const folded = (page) => expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
const flat = (page) => expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
const storedXpOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards'))?.xp ?? 0);
const SIZES = {
  chromebook: { width: 1366, height: 768 }, low: { width: 1366, height: 680 }, small: { width: 1024, height: 768 }, narrow: { width: 960, height: 768 },
  tablet: { width: 820, height: 1180 }, phone: { width: 390, height: 844 },
};
const sizesFor = (testInfo) => (testInfo.project.name === 'chromebook' ? [SIZES.chromebook, SIZES.low, SIZES.small, SIZES.narrow] : [SIZES.tablet, SIZES.phone]);

/** 결과 화면 → 단계 선택 → 처음 화면 → 학습 기록 */
async function openReport(page) {
  await page.getByRole('button', { name: '단계 선택' }).click();
  await page.getByRole('button', { name: '처음 화면' }).click();
  await page.getByRole('button', { name: '학습 기록' }).click();
  await expect(page.getByRole('heading', { name: '학습 기록' })).toBeVisible();
}

/** 그 요소들의 움직임(튀기기·흔들기·알림·화면 들어오기)이 끝날 때까지 — 끝없이 도는 움직임과 [↻] 강조는 기다리지 않는다 */
const settled = (page, selector = '.screen') => page.waitForFunction((sel) => [...document.querySelectorAll(sel)].every((el) => el.getAnimations({ subtree: true }).every((a) => (
  a.playState !== 'running' || a.animationName === 'turn-hint' || a.effect?.getComputedTiming().iterations === Infinity))), selector);

async function noScroll(page, label = '') {
  await settled(page);
  const m = await page.evaluate(() => ({ over: document.documentElement.scrollHeight - window.innerHeight }));
  if (page.viewportSize().width > 560) expect(m.over, `${label} 세로 넘침`).toBeLessThanOrEqual(0); // 휴대폰은 세로 스크롤을 허용한다(가로만 0)
  expect(await hasHorizontalScroll(page), `${label} 가로 스크롤`).toBe(false);
}

/** 오른쪽 판(작업 지시서) 안쪽이 넘치지 않고, 판 안의 보이는 버튼이 잘리지 않으며 48px 이상이다 */
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
      buttons: buttons.length,
    };
  });
  expect({ over: m.over, small: m.small, cut: m.cut }, label).toEqual({ over: 0, small: [], cut: [] });
  expect(m.buttons, label).toBeGreaterThan(0);
}

/** 무대 아래쪽 조작 띠·조작판의 보이는 버튼이 48px 이상이고 매트 밖으로 잘리지 않는다 */
async function expectMatTools(page, label = '') {
  const m = await page.evaluate(() => {
    const mat = document.querySelector('.mat').getBoundingClientRect();
    return [...document.querySelectorAll('.mat-tools button, .view-pad button')].filter((b) => b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden').map((b) => {
      const r = b.getBoundingClientRect();
      return { name: b.getAttribute('aria-label') ?? b.textContent.trim(), small: r.width < 48 || r.height < 48, out: r.left < mat.left - 1 || r.right > mat.right + 1 || r.top < mat.top - 1 || r.bottom > mat.bottom + 1 };
    }).filter((b) => b.small || b.out);
  });
  expect(m, label).toEqual([]);
}

/** 지금 보이는 알림(토스트)이 조작과 겹치지 않는다 (알림이 들어오는 움직임이 끝난 순간에, 한 번의 평가 안에서) */
async function expectToastClear(page, label = '', { required = true } = {}) {
  let handle;
  try {
    handle = await page.waitForFunction((must) => {
      const toast = document.querySelector('.toast');
      if (!toast) return must ? null : { hits: [], shown: false };
      const controls = '.topbar button, .play-header button, .answer-btn, .edge-opt, .parts-check, .fold-toggle, .btn-icon, .fold-range, .hint-btn, .next-btn, '
        + '.reason-chip, .reason-skip, .mat-tools button, .view-pad button, .edge-band.is-c';
      const shown = [...document.querySelectorAll(controls)].filter((el) => el.getBoundingClientRect().width > 0 && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden');
      const moving = (el) => el.getAnimations({ subtree: true }).some((a) => a.playState === 'running' && a.animationName !== 'turn-hint' && a.effect?.getComputedTiming().iterations !== Infinity);
      if ([toast, ...shown].some(moving)) return null;
      const t = toast.getBoundingClientRect();
      const hits = [];
      for (const el of shown) {
        const b = el.getBoundingClientRect();
        const w = Math.min(t.right, b.right) - Math.max(t.left, b.left);
        const h = Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top);
        if (w > 0 && h > 0) hits.push(`${el.className} ${Math.round(w)}×${Math.round(h)}`);
      }
      return { hits, shown: true };
    }, required, { timeout: 15_000 });
  } catch (error) {
    throw new Error(`${label}: 알림이 보이지 않아요(뜨지 않았거나 재기 전에 사라졌어요) — ${error.message.split('\n')[0]}`);
  }
  expect((await handle.jsonValue()).hits, label).toEqual([]);
}

/** 알림을 지켜본다: 뜬 알림마다 종류·글·뜬 때·사라진 때(페이지 안 시각)를 window.toastLog에 적는다 */
async function watchToasts(page) {
  await page.evaluate(() => {
    window.toastLog = [];
    if (window.toastSeen) return;
    window.toastSeen = new Map();
    new MutationObserver(() => {
      const now = performance.now();
      for (const toast of document.querySelectorAll('.toast')) {
        if (window.toastSeen.has(toast)) continue;
        const entry = { type: toast.className.match(/toast-(\w+)/)?.[1] ?? '', text: toast.textContent, shownAt: now, goneAt: null };
        window.toastSeen.set(toast, entry);
        window.toastLog.push(entry);
      }
      for (const [toast, entry] of window.toastSeen) if (entry.goneAt === null && !toast.isConnected) entry.goneAt = now;
    }).observe(document.body, { childList: true, subtree: true });
  });
}
async function expectToasted(page, type, text) {
  await expect.poll(() => page.evaluate((kind) => window.toastLog.filter((x) => x.type === kind).map((x) => x.text).join('\n'), type)).toContain(text);
}
/** data-fold가 지나간 값과 그때의 페이지 안 시각 (window.foldLog) */
async function watchFold(page) {
  await page.evaluate(() => {
    window.foldLog = [];
    const el = document.querySelector('.fold-stage');
    if (window.foldWatched === el) return;
    window.foldWatched = el;
    new MutationObserver(() => window.foldLog.push({ fold: el.dataset.fold, at: performance.now() })).observe(el, { attributes: true, attributeFilter: ['data-fold'] });
  });
}
/** 결과 화면: "오늘의 솜씨" 칸 점수 합 + 단계 완료·별 점수 줄 = "이번에 모은 솜씨 점수" (화면 = 저장) */
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

// ── 밑면과 옆면: 입체의 면 누르기 ─────────────────────
/**
 * 그 면을 누를 수 있는 화면의 점: 면의 종이(.face-paper)를 감싸는 상자 안에서, 그 점과 둘레 7px이 모두 그 면인(맨 앞) 곳 가운데 가장 안쪽.
 * 브라우저의 판정으로 고르지만 앱은 직접 계산(pickFace)으로 판정한다 — 둘이 같아야 누른 면이 골라진다(검사가 둘을 함께 본다)
 */
async function facePoint(page, id) {
  return page.evaluate((faceId) => {
    const el = document.querySelector(`.net-face[data-face="${faceId}"] .face-paper`);
    const r = el.getBoundingClientRect();
    let best = null;
    for (let i = 1; i < 14; i += 1) {
      for (let j = 1; j < 14; j += 1) {
        const x = r.left + (r.width * i) / 14;
        const y = r.top + (r.height * j) / 14;
        if (![[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7]].every(([dx, dy]) => document.elementFromPoint(x + dx, y + dy) === el)) continue;
        const d = Math.hypot(i - 7, j - 7);
        if (!best || d < best.d) best = { x, y, d };
      }
    }
    return best;
  }, id);
}
/** 그 면이 보일 때까지 조작판으로 돌린다(오른쪽으로 11번 = 330°, 그래도 없으면 아래쪽으로 한 번 더 기울여 다시) → 누를 점 */
async function showFace(page, id, { touch = false } = {}) {
  for (let k = 0; k < 60; k += 1) {
    // 휴대폰은 판이 매트 아래에 있어 화면이 내려가 있을 수 있다: 무대가 화면 밖에 걸치면 매트를 화면 위쪽에 맞춘다(화면 밖의 점은 누를 수 없다)
    await page.evaluate(() => {
      const r = document.querySelector('.fold-stage').getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) document.querySelector('.mat').scrollIntoView({ block: 'start' });
    });
    const p = await facePoint(page, id);
    if (p) return p;
    const button = page.locator('.view-pad').getByRole('button', { name: k % 12 === 11 ? '아래쪽으로 돌려 보기' : '오른쪽으로 돌려 보기' });
    if (touch) await button.tap();
    else await button.click();
  }
  await page.screenshot({ path: test.info().outputPath('show-face-fail.png') });
  throw new Error(`${id} 면을 보이게 돌리지 못했어요 (${JSON.stringify(page.viewportSize())})`);
}
async function tapFace(page, id, { touch = false } = {}) {
  const p = await showFace(page, id, { touch });
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
/** 두 밑면을 고르고 [확인] */
async function answerParts(page, q, { touch = false } = {}) {
  for (const id of q.bases) await tapFace(page, id, { touch });
  await expect(page.locator('.net-face.is-picked')).toHaveCount(2);
  if (touch) await page.locator('.parts-check').tap();
  else await page.locator('.parts-check').click();
  await expect(page.locator('.reason')).toContainText('맞아요!');
}

// ── 차시와 단계 지도 ─────────────────────────────
test('?lesson=prism: 세 단계(밑면과 옆면 · 각기둥이 될까? · 맞닿는 선분)가 보이고 첫 단계만 열림. 밑면과 옆면을 마우스로 끝까지 하면 결과와 다음 단계', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?lesson=prism&seed=1&sound=off'));
  await expect(page.locator('.eyebrow')).toHaveText('각기둥의 전개도');
  // 한 차시 주소의 놀이 방법은 그 차시가 든 영역(각기둥)의 줄
  await page.getByRole('button', { name: '놀이 방법' }).click();
  expect(await page.locator('.howto-list li').evaluateAll((els) => els.map((el) => el.lastElementChild.textContent))).toEqual(PRISM_HOW_TO);
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.lesson-group h3')).toHaveText(['각기둥의 전개도']);
  await expect(page.locator('.lesson-note')).toHaveText('6학년 1학기 · 각기둥과 각뿔');
  await expect(page.locator('.lesson-chips .chip')).toHaveText([`약 ${PRISM_LESSONS[0].minutes}분`]);
  await expect(page.locator('.stage-card h3, .stage-card .stage-title').first()).toBeVisible();
  const cards = page.locator('.stage-card');
  await expect(cards).toHaveCount(3);
  for (const [i, s] of PRISM_STAGES.entries()) await expect(cards.nth(i)).toContainText(s.title);
  await expect(cards.nth(0)).toBeEnabled();
  await expect(cards.nth(1)).toBeDisabled();
  await expect(cards.nth(2)).toBeDisabled();
  await expect(page.locator('.stage-card .stage-art')).toHaveCount(3);
  await cards.nth(0).click();
  await expect(page.locator('.order-kind')).toHaveText('살펴보기 주문');
  for (const q of questionsFor('prism-parts')) {
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${q.number} / 3`);
    await answerParts(page, q);
    await expect(page.locator('.parts-name')).toHaveText(`${q.name} · 옆면 ${q.sides}개`);
    await flat(page); // 맞히면 펼쳐진다
    await expect(page.locator('.net-face.is-base .face-label')).toHaveText(['○', '○']);
    await expect(page.locator('.net-face.is-side .face-label')).toHaveCount(q.sides);
    await page.locator('.next-btn').click();
  }
  await expect(page.getByText('3번 중 3번 맞힘')).toBeVisible();
  const xp = await resultXpSum(page);
  expect(xp.tiles + xp.line).toBe(xp.gained);
  expect(xp.gained).toBe(18); // 맞힘 3 × 2 + 연속 1 + 단계 완료 5 + 별 3개 6 (단위 검사의 독립 계산과 같다)
  expect(await storedXpOf(page)).toBe(18);
  await page.getByRole('button', { name: '단계 선택' }).click();
  await expect(page.locator('.stage-card').nth(1)).toBeEnabled();
  expect(errors).toEqual([]);
});

test('6학년 영역: "각기둥의 전개도" 카드가 열려 있고(준비 중 아님), 누르면 그 영역의 단계 지도 — 영역 탭은 각기둥 · 쌓기나무, 모은 별 0 / 9', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&grade=6'));
  const card = page.locator('.area-card[data-area="prism"]');
  await expect(card).toBeEnabled();
  await expect(card).toHaveAccessibleName('각기둥의 전개도, 6학년 1학기 · 각기둥과 각뿔, 차시 1개, 모은 별 0 / 9, 여기부터');
  await card.click();
  await expect(page.locator('.area-tab[data-area="prism"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tablist', { name: '영역' }).getByRole('tab')).toHaveText(['각기둥의 전개도', '쌓기나무']);
  await expect(page.locator('.star-total')).toHaveText('모은 별 0 / 9');
  await expect(page.locator('.lesson-no')).toHaveCount(0); // 차시가 하나뿐인 영역은 칩 없음
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=prism'));
  await expect(page.locator('.area-tab[data-area="prism"]')).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

// ── 1단계: 밑면과 옆면 ───────────────────────────
test('밑면과 옆면: 눕힌 각기둥의 바닥 면을 고르면 까닭(바닥에 닿은 면이라고 밑면인 것은 아니에요)과 ✗, 같은 두 면을 다시 [확인]하면 기록하지 않는다. 8px 넘게 끌면 돌기만 하고 고르지 않는다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '마우스 끌기는 크롬북 화면에서');
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  const seed = ['1', '2', '3', '4', '5', '6'].find((x) => questionsFor('prism-parts', x)[0].lying);
  await page.goto(STAGE_URL('prism-parts', '', seed));
  const [q] = questionsFor('prism-parts', seed);
  // 답하기 전: 입체가 접힌 채, 조작판이 보이고(돌려 볼 수 있다), 접기는 잠김
  await folded(page);
  await expect(page.locator('.view-pad')).toBeVisible();
  await expect(page.locator('.fold-toggle')).toBeDisabled();
  await expect(page.locator('.parts-check')).toBeDisabled();
  await expect(page.locator('.fold-note')).toHaveText('맞힌 뒤에 펼쳐 볼 수 있어요.');
  // 끌기 100px: 보기만 바뀌고 고른 면이 없다
  const p = await showFace(page, q.ground);
  const before = await page.locator('.net-scene').evaluate((el) => el.style.transform);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 50, p.y + 10, { steps: 5 });
  await page.mouse.move(p.x + 100, p.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.net-face.is-picked')).toHaveCount(0);
  expect(await page.locator('.net-scene').evaluate((el) => el.style.transform)).not.toBe(before);
  // 3px 움직이고 떼면 누르기(고름) — 같은 면을 다시 누르면 풀린다
  const p2 = await showFace(page, q.ground);
  await page.mouse.move(p2.x, p2.y);
  await page.mouse.down();
  await page.mouse.move(p2.x + 3, p2.y + 1);
  await page.mouse.up();
  await expect(page.locator(`.net-face[data-face="${q.ground}"]`)).toHaveClass(/is-picked/);
  await expect(page.locator('.parts-count')).toHaveText('고른 면 1 / 2');
  await tapFace(page, q.ground);
  await expect(page.locator('.net-face.is-picked')).toHaveCount(0);
  // 바닥 면 + 밑면 하나 → 틀림
  await tapFace(page, q.ground);
  await tapFace(page, q.bases[0]);
  await page.locator('.parts-check').click();
  await expect(page.locator('.reason.is-wrong')).toContainText('바닥에 닿은 면이라고 밑면인 것은 아니에요.');
  await expect(page.locator('.net-face.is-missed')).toHaveCount(2);
  await expect(page.locator('.net-face.is-missed .face-mark')).toHaveText(['✗', '✗']);
  await expect(page.locator('.net-face.is-picked')).toHaveCount(0);
  await folded(page); // 틀려도 펼치지 않는다
  // 같은 두 면을 다시 [확인]: 안내만, 기록하지 않음
  await watchToasts(page);
  await tapFace(page, q.ground);
  await tapFace(page, q.bases[0]);
  await page.locator('.parts-check').click();
  await expectToasted(page, 'info', '이미 골라 본 두 면이에요');
  for (const id of [q.ground, q.bases[0]]) await tapFace(page, id); // 풀기
  await answerParts(page, q);
  await flat(page);
  for (const x of questionsFor('prism-parts', seed).slice(1)) {
    await page.locator('.next-btn').click();
    await answerParts(page, x);
  }
  await page.locator('.next-btn').click();
  await expect(page.getByText('4번 중 3번 맞힘')).toBeVisible();
  await openReport(page);
  await expect(page.locator('.mistakes')).toContainText('밑면은 바닥 면 (1번)');
  expect(errors).toEqual([]);
});

test('밑면과 옆면 키보드만: Tab으로 면에 가서 Enter로 고르고, [확인]도 키보드로. 방향키로 돌리기. 세 문항 끝까지', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('prism-parts'));
  /** Tab을 눌러 조건에 맞는 요소에 초점이 갈 때까지 */
  async function tabTo(selector, n = 40) {
    for (let i = 0; i < n; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate((sel) => document.activeElement?.matches(sel), selector)) return;
    }
    throw new Error(`${selector}에 Tab으로 가지 못했어요`);
  }
  for (const q of questionsFor('prism-parts')) {
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${q.number} / 3`);
    await page.locator('.fold-stage').focus();
    const before = await page.locator('.net-scene').evaluate((el) => el.style.transform);
    await page.keyboard.press('ArrowRight'); // 무대에서 방향키 = 돌리기
    await page.keyboard.press('ArrowUp');
    expect(await page.locator('.net-scene').evaluate((el) => el.style.transform)).not.toBe(before);
    for (const id of q.bases) {
      await page.locator('.fold-stage').focus();
      await tabTo(`.net-face[data-face="${id}"]`);
      await page.keyboard.press('Enter');
      await expect(page.locator(`.net-face[data-face="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    }
    await tabTo('.parts-check');
    await page.keyboard.press('Enter');
    await expect(page.locator('.reason')).toContainText('맞아요!');
    await expect(page.locator('.next-btn')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(page.getByText('3번 중 3번 맞힘')).toBeVisible();
  expect(errors).toEqual([]);
});

test('밑면과 옆면 터치(태블릿): 한 손가락으로 끌면 돌고, 짧게 누르면 고른다. 세 문항 끝까지', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', '터치는 태블릿 화면에서');
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('prism-parts'));
  const cdp = await page.context().newCDPSession(page);
  for (const q of questionsFor('prism-parts')) {
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${q.number} / 3`);
    const box = await foldStage(page).boundingBox();
    const before = await page.locator('.net-scene').evaluate((el) => el.style.transform);
    await touchFlick(cdp, [box.x + box.width / 2, box.y + box.height / 2], [box.x + box.width / 2 + 90, box.y + box.height / 2 + 30]);
    await expect.poll(() => page.locator('.net-scene').evaluate((el) => el.style.transform)).not.toBe(before);
    await expect(page.locator('.net-face.is-picked')).toHaveCount(0); // 끈 것은 누르기가 아니다
    await answerParts(page, q, { touch: true });
    await page.locator('.next-btn').tap();
  }
  await expect(page.getByText('3번 중 3번 맞힘')).toBeVisible();
  expect(errors).toEqual([]);
});

test('밑면과 옆면 정답 노출 0: 답하기 전 면은 모두 같은 색·같은 글자(없음)·같은 속성 이름·"n번 면"(DOM 차례)이고, 밑면이 놓이는 DOM 차례는 문항마다 다르다. 돌려 봐도 그대로 (시드 6개 × 3문항)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '화면 전체를 견주는 검사는 크롬북 화면에서 한 번');
  test.setTimeout(150_000);
  const looks = new Set();
  const basePositions = new Set();
  for (let seed = 1; seed <= 6; seed += 1) {
    await page.goto(STAGE_URL('prism-parts', '', String(seed)));
    for (const q of questionsFor('prism-parts', String(seed))) {
      await expect(page.locator('.q-counter')).toHaveText(`문제 ${q.number} / 3`);
      for (const turn of [0, 1]) {
        if (turn) {
          await page.locator('.view-pad').getByRole('button', { name: '오른쪽으로 돌려 보기' }).click();
          await page.locator('.view-pad').getByRole('button', { name: '아래쪽으로 돌려 보기' }).click();
        }
        const look = await page.evaluate(() => {
          const faces = [...document.querySelectorAll('.net-face')];
          return JSON.stringify({
            faces: [...new Set(faces.map((f) => [f.className.replace(/\s*is-back/, ''), [...f.attributes].map((a) => a.name).sort().join(), f.style.getPropertyValue('--face-color'),
              f.querySelector('.face-label').textContent, f.querySelector('.face-mark').textContent, f.getAttribute('aria-pressed')].join('|')))],
            names: faces.every((f, i) => f.getAttribute('aria-label') === `${i + 1}번 면`),
            labels: faces.every((f, i) => f.dataset.face === `f${i}`),
            badge: document.querySelector('.stage-badge').hidden,
            extra: document.querySelectorAll('.edge-band, .edge-tag, .net-ghost, .net-dot, .is-overlap').length,
            count: document.querySelector('.parts-count').textContent,
            check: document.querySelector('.parts-check').disabled,
            tools: [document.querySelector('.fold-toggle').disabled, document.querySelector('.fold-range').disabled, document.querySelector('.view-pad').className],
          });
        });
        looks.add(look);
      }
      basePositions.add(q.bases.map((id) => Number(id.slice(1))).join(','));
      await answerParts(page, q);
      await page.locator('.next-btn').click();
    }
  }
  expect(looks.size).toBe(1);
  expect(basePositions.size).toBeGreaterThan(8); // 18문항에서 밑면의 DOM 자리가 여러 가지
});

// ── 2단계: 각기둥이 될까? ─────────────────────────
test('각기둥이 될까?: 5문항을 모두 맞히고 안 되는 전개도 3개의 까닭까지 고르면 결과에 설명 맞힘 3번, 되는 전개도는 접힌 뒤 이름("오각기둥이 됐어요")', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('prism-judge'));
  await expect(page.locator('.order-kind')).toHaveText('검사 주문');
  for (const q of questionsFor('prism-judge')) {
    await expect(page.locator('.q-prompt')).toHaveText('접으면 각기둥이 될까요?');
    await expect(page.locator('.net-face')).toHaveCount(q.net.faces.length);
    // 접는 선은 점선, 자른 곳은 실선
    await expect(page.locator('.poly-line.is-fold')).toHaveCount(q.net.faces.length - 1);
    await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
    if (!q.valid) {
      await expect(page.locator('.reason-chip')).toHaveText(['면의 수가 달라요', '옆면이 직사각형이 아니에요', '면이 겹쳐요', '맞닿는 선분의 길이가 달라요']);
      // 까닭을 고르기 전에는 접히지 않고 까닭 표시도 없다
      await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
      await expect(page.locator('.reason')).toHaveCount(0);
      await expect(page.locator('.edge-band, .is-overlap, .net-ghost, .is-bent')).toHaveCount(0);
      await expect(page.locator('.stage-badge')).toBeHidden();
      await page.locator(`.reason-chip[data-reason="${prismReasonOf(q.problems)}"]`).click();
      await expect(page.locator('.reason-pick-result')).toContainText('맞아요! 설명 +2');
    }
    await folded(page);
    await expect(page.locator('.stage-badge .badge-main')).toHaveText(q.valid ? `${q.net.name}이 됐어요` : '각기둥이 안 돼요');
    if (q.intended === 'same') {
      await expect(page.locator('.net-face.is-overlap')).toHaveCount(2);
      await expect(page.locator('.net-ghost')).toHaveCount(1);
    }
    if (q.intended === 'length') {
      await expect(page.locator('.edge-band.is-a')).toHaveCount(2);
      const lengths = await page.locator('.edge-tag').allTextContents();
      expect(lengths[0]).not.toBe(lengths[1]);
    }
    if (q.intended === 'shape') await expect(page.locator('.net-face.is-bent .face-mark')).toHaveText('직사각형이 아니에요');
    if (q.intended === 'count') await expect(page.locator('.net-face.is-overlap, .net-ghost')).not.toHaveCount(0);
    if (q.valid) await expect(page.locator('.edge-band, .net-ghost, .is-overlap')).toHaveCount(0);
    await page.locator('.next-btn').click();
  }
  await expect(page.getByText('5번 중 5번 맞힘')).toBeVisible();
  await expect(page.locator('.behavior', { hasText: '설명 맞힘' })).toContainText('3번');
  const xp = await resultXpSum(page);
  expect(xp.tiles + xp.line).toBe(xp.gained);
  expect(xp.gained).toBe(28); // 맞힘 5 × 2 + 연속 1 + 설명 3 × 2 + 단계 완료 5 + 별 3개 6
  expect(await storedXpOf(page)).toBe(28);
  expect(errors).toEqual([]);
});

test('각기둥이 될까?: 반대로 답하면 까닭과 표시, 학습 기록에 tag(옆면 수 = 밑면 변 수 · 두 밑면의 위치 · 맞닿는 모서리 길이 또는 옆면은 직사각형 · 여러 가지 전개도 2번)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('prism-judge'));
  const qs = questionsFor('prism-judge');
  for (const q of qs) {
    await page.locator(`.answer-btn:not([data-answer="${q.expected}"])`).click();
    await folded(page);
    await expect(page.locator('.reason.is-wrong')).toBeVisible();
    await expect(page.locator('.reason-pick')).toHaveCount(0);
    if (q.intended === 'count') await expect(page.locator('.reason')).toContainText('옆면도');
    if (q.intended === 'same') await expect(page.locator('.reason')).toContainText('같은 쪽에 붙어 있어요');
    if (q.intended === 'shape') await expect(page.locator('.reason')).toContainText('직사각형이 아니에요');
    if (q.intended === 'length') await expect(page.locator('.reason')).toContainText('맞닿는 선분은 길이가 같아야 해요');
    if (q.valid) await expect(page.locator('.reason')).toContainText('이 전개도도 접으면');
    await page.locator('.next-btn').click();
  }
  await expect(page.getByText('5번 중 0번 맞힘')).toBeVisible();
  await openReport(page);
  const fourth = qs.some((q) => q.intended === 'length') ? '맞닿는 모서리 길이 (1번)' : '옆면은 직사각형 (1번)';
  for (const tag of ['옆면 수 = 밑면 변 수 (1번)', '두 밑면의 위치 (1번)', fourth, '여러 가지 전개도 (2번)']) await expect(page.locator('.mistakes')).toContainText(tag);
  expect(errors).toEqual([]);
});

test('각기둥이 될까? 정답 노출 0: 답하기 전 화면은 되는 전개도와 안 되는 전개도가 같은 모습 — 1 cm의 크기, 면의 클래스·속성·그늘, 무대 변환, 조작 띠, 판의 글자 (시드 8개 × 5문항)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '화면 전체를 견주는 검사는 크롬북 화면에서 한 번');
  test.setTimeout(150_000);
  const looks = new Map();
  for (let seed = 1; seed <= 8; seed += 1) {
    await page.goto(STAGE_URL('prism-judge', '', String(seed)));
    for (const q of questionsFor('prism-judge', String(seed))) {
      await expect(page.locator('.q-counter')).toHaveText(`문제 ${q.number} / 5`);
      const look = await page.evaluate(() => {
        const stage = document.querySelector('.fold-stage');
        const scene = stage.querySelector('.net-scene');
        const faces = [...stage.querySelectorAll('.net-face')];
        return JSON.stringify({
          unit: scene.style.getPropertyValue('--unit'),
          scene: scene.style.transform,
          stage: stage.className,
          fold: stage.dataset.fold,
          badge: [stage.querySelector('.stage-badge').hidden, stage.querySelector('.stage-badge').textContent],
          faces: [...new Set(faces.map((f) => [f.className, f.style.getPropertyValue('--shade'), [...f.attributes].map((a) => a.name).sort().join(), f.querySelector('.face-mark').textContent].join('|')))],
          labels: faces.map((f) => f.dataset.label).join('') === '가나다라마바사아'.slice(0, faces.length),
          extra: stage.querySelectorAll('.edge-band, .edge-tag, .net-ghost, .net-dot, .net-vname, .net-slot, .is-overlap, .is-bent').length,
          answer: [...document.querySelectorAll('.answer-btn')].map((b) => [b.className.replace(/\s*fx-\S+/g, ''), b.disabled, b.getAttribute('aria-pressed')]),
          tools: [document.querySelector('.fold-toggle').disabled, document.querySelector('.fold-range').disabled, document.querySelector('.view-pad').className, document.querySelector('.fold-tools').className],
          panel: document.querySelector('.net-panel').innerText.replace(/문제 \d/, '문제 n'),
        });
      });
      const kinds = looks.get(look) ?? new Set();
      kinds.add(q.valid ? q.form : q.intended);
      looks.set(look, kinds);
      await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
      if (!q.valid) await page.locator('.reason-skip').click();
      await page.locator('.next-btn').click();
    }
  }
  expect(looks.size).toBe(1); // 40문항이 모두 한 가지 모습
  const seen = [...looks.values()][0];
  for (const k of ['strip', 'lone', 'count', 'same']) expect(seen.has(k), k).toBe(true);
  expect(seen.has('length') || seen.has('shape')).toBe(true);
});

// ── 3단계: 맞닿는 선분 ───────────────────────────
test('맞닿는 선분: 전개도의 번호 띠(바로 옆 선분)를 누르면 까닭과 [반만 접어 보기], 다시 눌러도 기록하지 않는다. 힌트 동안에도 접기·돌리기 잠김. 맞히면 두 선분이 같은 무늬로 만난다 (크롬북은 마우스, 태블릿은 손가락)', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('prism-edge'));
  const [q] = questionsFor('prism-edge');
  const near = q.options.find((o) => o.kind === 'near');
  // 답하기 전: 물음의 띠 하나(노랑 줄무늬, 글자 없음) + 보기 띠 넷(번호), 접기는 잠김
  await expect(page.locator('.edge-band.is-q')).toHaveCount(1);
  await expect(page.locator('.edge-band.is-c')).toHaveCount(4);
  expect((await page.locator('.edge-tag.is-c').allTextContents()).sort()).toEqual(['1', '2', '3', '4']);
  await expect(page.locator('.fold-toggle')).toBeDisabled();
  await expect(page.locator('.edge-opt')).toHaveText(['1번', '2번', '3번', '4번']);
  const tap = (loc) => (testInfo.project.name === 'tablet' ? loc.tap() : loc.click());
  await tap(page.locator(`.edge-band[data-mark="${near.number}"]`));
  await expect(page.locator('.reason')).toContainText('바로 옆에 있지만');
  await expect(page.locator(`.edge-opt[data-seg="${near.number}"]`)).toHaveClass(/is-wrong/);
  await expect(page.locator(`.edge-band[data-mark="${near.number}"]`)).toHaveClass(/is-x/);
  await expect(page.locator('.hint-btn')).toBeVisible();
  await flat(page);
  await watchToasts(page);
  await tap(page.locator(`.edge-opt[data-seg="${near.number}"]`));
  await expectToasted(page, 'info', '이미 골라 본 선분');
  // 힌트: 반만 접었다가 편다 — 그동안 접기 막대·조작판은 잠겨 있다
  await watchFold(page);
  await tap(page.locator('.hint-btn'));
  await page.waitForFunction(() => window.foldLog.some((x) => x.fold === 'half'), null, { timeout: 10_000 });
  await expect(page.locator('.fold-toggle')).toBeDisabled();
  await expect(page.locator('.fold-range')).toBeDisabled();
  await expect(page.locator('.view-pad')).toHaveClass(/is-locked/);
  await flat(page);
  const answer = q.options.find((o) => o.index === q.answer);
  await tap(page.locator(`.edge-opt[data-seg="${answer.number}"]`));
  await folded(page);
  await expect(page.locator('.edge-band.is-a')).toHaveCount(2);
  await expect(page.locator('.edge-band.is-c, .edge-band.is-q')).toHaveCount(0);
  // 접힌 뒤 두 띠가 한 모서리에서 만난다: 두 띠의 화면 자리가 서로 닿아 있다
  await expect.poll(() => page.evaluate(() => {
    const [a, b] = [...document.querySelectorAll('.edge-band.is-a')].map((el) => el.getBoundingClientRect());
    return Math.max(Math.max(a.left, b.left) - Math.min(a.right, b.right), Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  })).toBeLessThan(6);
  await expect(page.locator('.edge-opt[disabled]')).toHaveCount(4);
  for (const x of questionsFor('prism-edge').slice(1)) {
    await tap(page.locator('.next-btn'));
    await tap(page.locator(`.edge-band[data-mark="${x.options.find((o) => o.index === x.answer).number}"]`));
    await folded(page);
  }
  await tap(page.locator('.next-btn'));
  await expect(page.getByText('4번 중 3번 맞힘')).toBeVisible();
  await openReport(page);
  await expect(page.locator('.mistakes')).toContainText('만나는 선분 (1번)');
  expect(errors).toEqual([]);
});

test('맞닿는 선분 키보드만: Tab으로 번호 버튼에 가서 Enter, 다음 문제도 키보드로 세 문항 끝까지', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('prism-edge'));
  for (const q of questionsFor('prism-edge')) {
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${q.number} / 3`);
    const answer = q.options.find((o) => o.index === q.answer);
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate((n) => document.activeElement?.matches(`.edge-opt[data-seg="${n}"]`), answer.number)) break;
    }
    await expect(page.locator(`.edge-opt[data-seg="${answer.number}"]`)).toBeFocused();
    await page.keyboard.press('Enter');
    await folded(page);
    await expect(page.locator('.next-btn')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(page.getByText('3번 중 3번 맞힘')).toBeVisible();
  expect(errors).toEqual([]);
});

test('맞닿는 선분 정답 노출 0: 답하기 전 화면은 정답과 무관하게 한 가지 모습 — 띠는 물음 하나 + 보기 넷(번호 1~4), 무대 변환·면의 모습·보기 버튼이 같고, 1 cm의 크기가 문항마다 같다 (시드 8개 × 3문항)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '화면 전체를 견주는 검사는 크롬북 화면에서 한 번');
  test.setTimeout(120_000);
  const looks = new Set();
  for (let seed = 1; seed <= 8; seed += 1) {
    await page.goto(STAGE_URL('prism-edge', '', String(seed)));
    for (const q of questionsFor('prism-edge', String(seed))) {
      await expect(page.locator('.q-counter')).toHaveText(`문제 ${q.number} / 3`);
      looks.add(await page.evaluate(() => {
        const stage = document.querySelector('.fold-stage');
        const scene = stage.querySelector('.net-scene');
        return JSON.stringify({
          unit: scene.style.getPropertyValue('--unit'),
          scene: scene.style.transform,
          stage: stage.className,
          fold: stage.dataset.fold,
          // 번호 이름표가 붙은 면의 표시(has-tag-w · has-tag-h — 보기 넷의 자리)는 빼고 견준다: 보기 넷 모두에 같은 규칙이라 정답을 가리키지 않는다
          faces: [...new Set([...stage.querySelectorAll('.net-face')].map((f) => [f.className.replace(/\s*has-tag-[wh]/g, ''), f.style.getPropertyValue('--shade'), [...f.attributes].map((a) => a.name).sort().join(), f.querySelector('.face-label').textContent].join('|')))],
          tagged: [...stage.querySelectorAll('.net-face.has-tag-w, .net-face.has-tag-h')].every((f) => f.querySelector('.edge-tag')),
          bands: [...stage.querySelectorAll('.edge-band')].map((b) => b.className.replace(/\s+/g, ' ')).sort(),
          tags: [...stage.querySelectorAll('.edge-tag')].map((b) => [b.className, b.textContent]).sort(),
          options: [...document.querySelectorAll('.edge-opt')].map((b) => [b.className, b.disabled, b.textContent]),
          tools: [document.querySelector('.fold-toggle').disabled, document.querySelector('.fold-range').disabled, document.querySelector('.view-pad').className],
          panel: document.querySelector('.net-panel').innerText.replace(/문제 \d/, '문제 n'),
        });
      }));
      await page.locator(`.edge-opt[data-seg="${q.options.find((o) => o.index === q.answer).number}"]`).click();
      await page.locator('.next-btn').click();
    }
  }
  expect(looks.size).toBe(1);
});

// ── 배치 · 움직임 ───────────────────────────────
test('배치(여섯 크기): 세 단계의 장면(답하기 전 · 틀림 · 까닭 고르기 · 맞힘)에서 스크롤과 판 안쪽 넘침이 없고 버튼이 잘리지 않으며(48px 이상), 알림이 조작을 가리지 않는다', async ({ page }, testInfo) => {
  test.setTimeout(400_000);
  const errors = collectErrors(page);
  const touch = testInfo.project.name === 'tablet';
  const press = (loc) => (touch ? loc.tap() : loc.click());
  for (const size of sizesFor(testInfo)) {
    await page.setViewportSize(size);
    const tag = `${size.width}×${size.height}`;
    // 밑면과 옆면
    await page.goto(STAGE_URL('prism-parts'));
    const [pq] = questionsFor('prism-parts');
    await folded(page);
    await noScroll(page, `${tag} 밑면 답하기 전`);
    await expectPanelFits(page, `${tag} 밑면 답하기 전`);
    await expectMatTools(page, `${tag} 밑면 답하기 전`);
    const side = pq.net.faces.find((f) => f.role === 'side').id;
    await tapFace(page, pq.bases[0], { touch });
    await tapFace(page, side, { touch });
    await press(page.locator('.parts-check'));
    await expectToastClear(page, `${tag} 밑면 틀림`);
    await noScroll(page, `${tag} 밑면 틀림`);
    await expectPanelFits(page, `${tag} 밑면 틀림`);
    await press(page.locator('.view-pad').getByRole('button', { name: '처음 보기로' })).catch(() => {});
    await answerParts(page, pq, { touch });
    await expectToastClear(page, `${tag} 밑면 맞힘`);
    await flat(page);
    await noScroll(page, `${tag} 밑면 맞힘(펼침)`);
    await expectPanelFits(page, `${tag} 밑면 맞힘(펼침)`);
    await expectMatTools(page, `${tag} 밑면 맞힘(펼침)`);
    // 각기둥이 될까?
    await page.goto(STAGE_URL('prism-judge'));
    const jqs = questionsFor('prism-judge');
    await noScroll(page, `${tag} 판별 답하기 전`);
    await expectPanelFits(page, `${tag} 판별 답하기 전`);
    await expectMatTools(page, `${tag} 판별 답하기 전`);
    for (const q of jqs) {
      await press(page.locator(`.answer-btn[data-answer="${q.expected}"]`));
      await expectToastClear(page, `${tag} 판별 ${q.number} 답함`);
      if (!q.valid) {
        await noScroll(page, `${tag} 판별 ${q.number} 까닭 고르기`);
        await expectPanelFits(page, `${tag} 판별 ${q.number} 까닭 고르기`);
        await press(page.locator(`.reason-chip[data-reason="${prismReasonOf(q.problems)}"]`));
      }
      await folded(page);
      await noScroll(page, `${tag} 판별 ${q.number} 접힘`);
      await expectPanelFits(page, `${tag} 판별 ${q.number} 접힘`);
      await expectMatTools(page, `${tag} 판별 ${q.number} 접힘`);
      await press(page.locator('.next-btn'));
    }
    // 판별의 틀림 장면(첫 문항)
    await page.goto(STAGE_URL('prism-judge'));
    await press(page.locator(`.answer-btn:not([data-answer="${jqs[0].expected}"])`));
    await expectToastClear(page, `${tag} 판별 틀림`);
    await folded(page);
    await noScroll(page, `${tag} 판별 틀림`);
    await expectPanelFits(page, `${tag} 판별 틀림`);
    // 맞닿는 선분
    await page.goto(STAGE_URL('prism-edge'));
    const [eq] = questionsFor('prism-edge');
    await noScroll(page, `${tag} 선분 답하기 전`);
    await expectPanelFits(page, `${tag} 선분 답하기 전`);
    await expectMatTools(page, `${tag} 선분 답하기 전`);
    await press(page.locator(`.edge-opt[data-seg="${eq.options.find((o) => o.kind === 'near').number}"]`));
    await expectToastClear(page, `${tag} 선분 틀림`);
    await noScroll(page, `${tag} 선분 틀림`);
    await expectPanelFits(page, `${tag} 선분 틀림`);
    await press(page.locator(`.edge-opt[data-seg="${eq.options.find((o) => o.index === eq.answer).number}"]`));
    await expectToastClear(page, `${tag} 선분 맞힘`);
    await folded(page);
    await noScroll(page, `${tag} 선분 맞힘`);
    await expectPanelFits(page, `${tag} 선분 맞힘`);
    await expectMatTools(page, `${tag} 선분 맞힘`);
  }
  expect(errors).toEqual([]);
});

test.describe('각기둥 차시 (움직임 줄이기)', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('밑면을 맞히면 바로 펼친 모습, 판별의 접기는 펼침 → 반 접힘 → 다 접힘 장면. 나간 뒤 오류 없음', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.goto(STAGE_URL('prism-parts'));
    const [q] = questionsFor('prism-parts');
    await watchFold(page);
    await answerParts(page, q);
    await flat(page);
    expect(await page.evaluate(() => window.foldLog.map((x) => x.fold))).not.toContain('folding');
    await page.goto(STAGE_URL('prism-judge'));
    const [jq] = questionsFor('prism-judge');
    await watchFold(page);
    await page.locator(`.answer-btn[data-answer="${jq.expected}"]`).click();
    if (!jq.valid) await page.locator('.reason-skip').click();
    await folded(page);
    const passed = await page.evaluate(() => window.foldLog.map((x) => x.fold));
    expect(passed).toContain('half');
    expect(passed).not.toContain('folding');
    expect(await page.locator('.confetti, .confetti-piece').count()).toBe(0);
    await page.getByRole('button', { name: '← 단계 선택' }).click();
    await expect(page.locator('.stage-card').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test('?fx=low: 색종이 없이 밑면을 맞히면 펼쳐지고(접기는 배우는 장면이라 다른 차시처럼 그대로 움직인다), 판의 처음 모습 잇기는 바로', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('prism-parts', '&fx=low'));
  const [q] = questionsFor('prism-parts');
  await answerParts(page, q, { touch: testInfo.project.name === 'tablet' });
  await flat(page);
  expect(await page.locator('.confetti, .confetti-piece').count()).toBe(0);
  await expect(foldStage(page)).not.toHaveClass(/is-easing/);
  expect(errors).toEqual([]);
});
