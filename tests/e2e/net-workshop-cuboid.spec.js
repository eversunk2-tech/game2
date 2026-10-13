/**
 * 직육면체의 전개도 차시(?lesson=cuboid): 만나는 선분 → 알맞은 면 고르기 → 길이까지 살펴요 → 내 맘대로 직육면체 전개도.
 * 정답은 게임과 같은 시드 문자열(<seed>:<단계 id>)로 같은 문항을 만들어 안다(DOM에 정답을 숨겨 두지 않는다).
 * 배치 검사에는 글자 폭에 묶인 픽셀 상수를 쓰지 않는다(docs/engine.md 11절).
 */
import { expect, test } from '@playwright/test';
import { createRng } from '../../src/shared/core/random.js';
import { faceRect, transformNet } from '../../src/games/net-workshop/fold.js';
import {
  CUBOID_BOARDS,
  FREE_CARDS,
  SLOT_DEPTH,
  centerOnBoard,
  cuboidHintNet,
  cuboidReasonOf,
  freeNets,
} from '../../src/games/net-workshop/cuboid-logic.js';
import { STAGES, makeQuestions } from '../../src/games/net-workshop/logic.js';
import { collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

const FILE = 'net-workshop.html';
const CUBOID_STAGES = STAGES.filter((s) => s.lesson === 'cuboid');
const questionsFor = (stageId, seed = '1') => makeQuestions(STAGES.find((s) => s.id === stageId), createRng(`${seed}:${stageId}`));
const STAGE_URL = (id, extra = '', seed = '1') => fileUrl(FILE, `?unlock=all&seed=${seed}&sound=off&stage=${id}${extra}`);
const foldStage = (page) => page.locator('.fold-stage');
const folded = (page) => expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
const storedXpOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards'))?.xp ?? 0);
/** 결과 화면 → 단계 선택 → 처음 화면 → 학습 기록 */
async function openReport(page) {
  await page.getByRole('button', { name: '단계 선택' }).click();
  await page.getByRole('button', { name: '처음 화면' }).click();
  await page.getByRole('button', { name: '학습 기록' }).click();
  await expect(page.getByRole('heading', { name: '학습 기록' })).toBeVisible();
}
const SIZES = { chromebook: { width: 1366, height: 768 }, low: { width: 1366, height: 680 }, tablet: { width: 820, height: 1180 }, phone: { width: 390, height: 844 } };
const sizesFor = (testInfo) => (testInfo.project.name === 'chromebook' ? [SIZES.chromebook, SIZES.low] : [SIZES.tablet, SIZES.phone]);

/**
 * 재기 전에 그 요소들(과 그 안)의 움직임이 끝날 때까지 기다린다: 고른 답의 튀기기(pop 0.35초)·흔들기(shake 0.4초), 버튼에 올린 포인터를 떼면
 * 들뜸이 가라앉는 전환(0.12초), 알림·화면이 들어오는 움직임, 판의 면이 내려앉는 움직임. 움직임 도중에 재면 크기·자리가 조금 달라
 * 느린 기기(GitHub CI)에서만 실패한다. 끝없이 도는 움직임과 자리·크기를 바꾸지 않는 강조([↻]의 turn-hint — 3.6초)는 기다리지 않는다
 */
const settled = (page, selector = '.screen') => page.waitForFunction((sel) => [...document.querySelectorAll(sel)].every((el) => el.getAnimations({ subtree: true }).every((a) => (
  a.playState !== 'running' || a.animationName === 'turn-hint' || a.effect?.getComputedTiming().iterations === Infinity))), selector);

async function noScroll(page, label = '') {
  await settled(page);
  const m = await page.evaluate(() => ({ over: document.documentElement.scrollHeight - window.innerHeight }));
  // 휴대폰은 세로 스크롤을 허용한다(가로만 0)
  if (page.viewportSize().width > 560) expect(m.over, `${label} 세로 넘침`).toBeLessThanOrEqual(0);
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

/**
 * 지금 보이는 알림(토스트)이 조작(답 버튼·보기·카드·빈 자리·접기 도구·보기 조작판·판의 버튼)과 겹치지 않는다.
 * 알림이 들어오는 움직임(0.2초)과 조작의 움직임(고른 답의 튀기기 등)이 끝난 순간에, 기다리기와 재기를 한 번의 평가 안에서 한다 —
 * 알림은 몇 초(1.5초 + 글자당 0.08초) 뒤에 사라지므로 따로 기다렸다 재면 느린 기기에서는 그 사이에 없어진다.
 * required: 알림을 띄운 조작 바로 뒤에는 true(알림이 꼭 보여야 한다). 그 뒤의 장면(접기가 끝난 뒤 · 다른 것을 더 누른 뒤)은 false —
 *   알림이 아직 남아 있을 때만 겹침을 본다(느린 기기에서는 이미 사라졌을 수 있고, 그러면 가릴 것이 없다)
 */
async function expectToastClear(page, label = '', { required = true } = {}) {
  let handle;
  try {
    handle = await page.waitForFunction((must) => {
      const toast = document.querySelector('.toast');
      if (!toast) return must ? null : { hits: [], shown: false };
      const controls = '.topbar button, .play-header button, .answer-btn, .edge-opt, .size-card, .net-slot, .fold-toggle, .btn-icon, .fold-range, .hint-btn, .next-btn, '
        + '.rect-card, .free-fold, .reason-chip, .reason-skip, .mat-tools button, .view-pad button, .free-buttons button';
      const shown = [...document.querySelectorAll(controls)].filter((el) => el.getBoundingClientRect().width > 0 && !el.closest('[hidden]'));
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

/**
 * 알림(토스트)에 뜬 글을 적어 둔다. 알림은 몇 초(1.5초 + 글자당 0.08초) 뒤에 사라지는 잠깐의 상태라, 누른 뒤에 그 글을 바로 읽으려 하면
 * 검사 쪽이 느려질 때(아주 바쁜 컴퓨터) 놓칠 수 있다 — 누르기 전에 지켜보기 시작해 뜬 글을 적어 두고, 나중에 견준다
 */
async function watchToasts(page) {
  await page.evaluate(() => {
    if (window.toastLog) return;
    window.toastLog = [];
    const note = () => {
      for (const toast of document.querySelectorAll('.toast')) {
        const text = `${toast.className} ${toast.textContent}`;
        if (window.toastLog.at(-1) !== text) window.toastLog.push(text);
      }
    };
    new MutationObserver(note).observe(document.body, { childList: true, subtree: true });
  });
}
/** watchToasts로 지켜본 알림 가운데 그 종류(info · correct · wrong)의 글에 text가 들어 있다 */
const expectToasted = (page, type, text) => expect.poll(() => page.evaluate((cls) => window.toastLog.filter((t) => t.includes(cls)).join('\n'), `toast-${type}`)).toContain(text);
/** 무대의 data-fold가 지나가는 값을 적어 둔다(window.foldLog). 잠깐만 보이는 장면(반 접힘)을 누른 뒤에 바로 보려 하지 않고, 지나간 값을 본다 */
async function watchFold(page) {
  await page.evaluate(() => {
    const el = document.querySelector('.fold-stage');
    window.foldLog = [];
    new MutationObserver(() => {
      const name = el.querySelector('.net-vname');
      window.foldLog.push({ fold: el.dataset.fold, names: name ? getComputedStyle(name).opacity : null });
    }).observe(el, { attributes: true, attributeFilter: ['data-fold'] });
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

/** 판별 문항에 바르게 답한다(안 되는 전개도는 바른 까닭 칩까지) */
async function answerJudge(page, q) {
  await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
  if (!q.valid) {
    await expect(page.locator('.reason-pick')).toBeVisible();
    await page.locator(`.reason-chip[data-reason="${cuboidReasonOf(q.problems)}"]`).click();
  }
  await expect(page.locator('.reason')).toContainText('맞아요!');
}
const pickEdge = (page, index) => page.locator(`.edge-opt[data-seg="${index}"]`).click();
const cardOf = (page, q, kind) => page.locator(`.size-card[data-card="${q.cards.find((c) => c.kind === kind).id}"]`);
async function placeCard(page, q, kind) {
  await cardOf(page, q, kind).click();
  await page.locator('.net-slot').click();
  await folded(page);
}

// ── 놓는 판(1 cm 칸) 도우미 ─────────────────────────────
const cellOf = (page, [x, y]) => page.locator(`.rect-board .cell[data-cell="${x},${y}"]`);
const tileOf = (page, label) => page.locator(`.rect-tile[data-label="${label}"]`);
const tileRect = (page, label) => tileOf(page, label).evaluate((el) => ['x', 'y', 'w', 'h'].map((k) => Number(el.style.getPropertyValue(`--${k}`))));
/** 직사각형마다 크기가 맞는 면 카드를 차례로 붙인다(가 나: 3 × 2 · 다 라: 3 × 1 · 마 바: 2 × 1) */
function withCards(rects) {
  const left = FREE_CARDS.map((c) => ({ ...c }));
  return rects.map((r) => {
    const i = left.findIndex((c) => (c.w === r.w && c.h === r.h) || (c.w === r.h && c.h === r.w));
    const [card] = left.splice(i, 1);
    return { ...r, label: card.label };
  });
}
/** 전개도 번호를 판 가운데에 놓은 모습(k번째 돌리기·뒤집기) */
const netRects = (id, board = CUBOID_BOARDS.wide, k = 0) => withCards(centerOnBoard(transformNet(freeNets().find((n) => n.id === id).net, k), board));
const boardOf = (page) => (page.viewportSize().width <= 560 ? CUBOID_BOARDS.phone : CUBOID_BOARDS.wide);
/**
 * 면을 그 자리에 놓는다: 카드를 고르고 → 왼쪽 위가 될 칸을 누르고 → 방향이 다르면 면을 두 번 눌러 돌린다.
 * (새 카드는 누른 칸을 왼쪽 위로, 그대로 안 들어가면 돌려서 놓인다. 돌리기는 왼쪽 위를 그대로 둔다)
 */
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
async function foldIt(page, pick = null) {
  await page.locator('.free-fold').click();
  await folded(page);
  if (pick === 'skip') await page.locator('.reason-skip').click();
  else if (pick) await page.locator(`.reason-chip[data-reason="${pick}"]`).click();
}
async function fresh(page) {
  if (await page.locator('.reason-skip').isVisible()) await page.locator('.reason-skip').click();
  if (await page.locator('.free-new').isVisible()) await page.locator('.free-new').click();
  else if (await page.locator('.rect-tile').count() > 0) await page.locator('.tool-clear').click();
  await expect(page.locator('.rect-tile')).toHaveCount(0);
}
// 안 되는 배치 (12칸 × 8줄 판 위): 옆면 네 장(가 다 나 라)을 한 줄로 놓고 작은 면 두 장을 붙인다
const STRIP = [{ label: '가', x: 3, y: 2, w: 2, h: 3 }, { label: '다', x: 5, y: 2, w: 1, h: 3 }, { label: '나', x: 6, y: 2, w: 2, h: 3 }, { label: '라', x: 8, y: 2, w: 1, h: 3 }];
const TOP = { label: '마', x: 3, y: 1, w: 2, h: 1 };
const BAD = {
  overlap: [...STRIP, TOP, { label: '바', x: 6, y: 1, w: 2, h: 1 }], // 작은 면 두 장이 같은 쪽
  length: [...STRIP, TOP, { label: '바', x: 6, y: 5, w: 1, h: 2 }], // 바 면을 돌려 붙임: 1 cm인 변이 2 cm인 변에
  apart: [...STRIP, TOP, { label: '바', x: 10, y: 6, w: 2, h: 1 }],
  // 다른 면의 변 한가운데에 꼭짓점이 놓여 한 점을 둘러쌈
  tee: [{ label: '가', x: 2, y: 2, w: 3, h: 2 }, { label: '마', x: 2, y: 4, w: 2, h: 1 }, { label: '다', x: 4, y: 4, w: 1, h: 3 }, { label: '나', x: 5, y: 2, w: 3, h: 2 }, { label: '라', x: 5, y: 4, w: 3, h: 1 }, { label: '바', x: 8, y: 2, w: 2, h: 1 }],
};
const VALID_STRIP = [...STRIP, TOP, { label: '바', x: 3, y: 5, w: 2, h: 1 }]; // 옆면 한 줄 + 위·아래: 전개도

// ── 차시와 단계 지도 ─────────────────────────────
test('?lesson=cuboid: 그 차시 4단계만 보이고 첫 단계만 열림(도전 주문서·도감 칩 없음), 만나는 선분 5문항을 끝까지 하면 다음 단계가 열린다', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?lesson=cuboid&seed=1&sound=off'));
  await expect(page.locator('.eyebrow')).toHaveText('직육면체의 전개도');
  // 내 공방 카드: 이 차시에는 도감이 없다 — 정육면체 차시의 "도감 0 / 11"을 보이지 않는다 (별 · 도장만)
  await expect(page.locator('.workshop-meta .chip')).toHaveCount(2);
  await expect(page.locator('.workshop-meta')).not.toContainText('도감');
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.lesson-group h3')).toHaveText(['직육면체의 전개도']);
  const cards = page.locator('.stage-path .stage-card');
  await expect(cards).toHaveCount(4);
  await expect(page.locator('.challenge-card')).toHaveCount(0);
  await expect(cards.locator('.stage-title')).toHaveText(['만나는 선분', '알맞은 면 고르기', '길이까지 살펴요', '내 맘대로 직육면체 전개도']);
  await expect(cards.nth(0)).toBeEnabled();
  for (const i of [1, 2, 3]) await expect(cards.nth(i)).toBeDisabled();
  await expect(page.locator('.stage-path .stage-thumb svg')).toHaveCount(4);
  // 도감 칩이 화면 어디에도 없다: 찾은 전개도 모음은 보이지 않는 모음이고(가지 수는 단계 화면에서), 다른 차시(정육면체)의 도감·노트는 이 화면에 넣지 않는다
  await expect(page.locator('.collection-chip')).toHaveCount(0);
  await expect(page.locator('.head-chips')).toHaveText('모은 별 0 / 12'); // 이 차시의 일반 4단계 × 별 3개

  await cards.first().click();
  await expect(page.locator('.order-kind')).toHaveText('짝 찾기 주문');
  const questions = questionsFor('cuboid-edge');
  for (const [i, q] of questions.entries()) {
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${i + 1} / 5`);
    await expect(page.locator('.q-prompt')).toHaveText(`접었을 때 선분 ${q.segments[q.target].name}과 만나는 선분은 어느 것일까요?`);
    await expect(page.locator('.edge-opt')).toHaveText(q.options.map((o) => `선분 ${o.name}`));
    await expect(page.locator('.net-vname')).toHaveText(q.vertices.map((v) => v.name));
    await pickEdge(page, q.answer);
    await expect(page.locator('.reason')).toContainText('맞아요!');
    await folded(page);
    await expect(page.locator('.stage-badge')).toHaveText('직육면체가 됐어요');
    await page.locator('.next-btn').click();
  }
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.getByText('5번 중 5번 맞힘')).toBeVisible();
  await page.getByRole('button', { name: '단계 선택' }).click();
  await expect(cards.nth(1)).toBeEnabled();
  await expect(cards.nth(2)).toBeDisabled();
  expect(errors).toEqual([]);
});

test('단계 지도: 직육면체 차시는 정육면체 차시 다음에 보이고 첫 단계가 처음부터 열려 있다. 정육면체 차시의 카드·도감 칩은 그대로다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await page.getByRole('button', { name: '시작하기' }).click();
  // 두 차시의 묶음만 본다(data-lesson) — 다른 차시가 더해져도 이 검사가 달라지지 않게 전체 차시 목록·전체 별 수에 기대지 않는다
  const cube = page.locator('.lesson-group[data-lesson="cube"]');
  const cuboid = page.locator('.lesson-group[data-lesson="cuboid"]');
  await expect(cube.locator('h3')).toHaveText('정육면체의 전개도');
  await expect(cuboid.locator('h3')).toHaveText('직육면체의 전개도');
  // 직육면체 차시는 정육면체 차시 다음에 온다(두 묶음의 앞뒤)
  expect(await page.evaluate(() => {
    const [a, b] = ['cube', 'cuboid'].map((id) => document.querySelector(`.lesson-group[data-lesson="${id}"]`));
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await expect(cube.locator('.stage-card')).toHaveCount(6);
  await expect(cube.locator('.collection-chip')).toHaveText(['도감 0 / 11', '노트 0 / 24']);
  await expect(cuboid.locator('.stage-card')).toHaveCount(4);
  await expect(cuboid.locator('.collection-chip')).toHaveCount(0);
  await expect(cuboid.locator('.stage-card').nth(0)).toBeEnabled();
  await expect(cuboid.locator('.stage-card').nth(1)).toBeDisabled();
  // 모은 별: 모든 차시의 일반 단계 × 3 (두 차시만 있으면 24) — 숫자는 고정하지 않는다
  const starTotal = (await page.locator('.star-total').textContent()).match(/^모은 별 0 \/ (\d+)$/);
  expect(Number(starTotal?.[1])).toBeGreaterThanOrEqual(24);
  expect(Number(starTotal[1]) % 3).toBe(0);
  await cuboid.locator('.stage-card').first().click();
  await expect(page.getByRole('heading', { name: '만나는 선분' })).toBeVisible();
  await expect(page.locator('.play-chip')).toHaveText('1단계');
  expect(errors).toEqual([]);
});

// ── 1단계: 만나는 선분 ─────────────────────────────
test('만나는 선분: 바로 옆 선분을 고르면 까닭(가까이 있다고 만나는 것은 아니에요)과 [반만 접어 보기], 다시 눌러도 다시 기록하지 않는다. 맞히면 두 선분이 같은 무늬 띠로 한 모서리에서 만난다', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-edge'));
  const [q] = questionsFor('cuboid-edge');
  const near = q.options.find((o) => o.kind === 'near');
  // 답하기 전: 물음의 선분에만 띠(이름표 없음), 접기는 잠김, 꼭짓점 이름 14개
  await expect(page.locator('.edge-band')).toHaveCount(1);
  await expect(page.locator('.edge-band.is-q')).toHaveCount(1);
  await expect(page.locator('.edge-tag')).toHaveCount(0);
  await expect(page.locator('.fold-toggle')).toBeDisabled();
  await expect(page.locator('.net-vname')).toHaveCount(14);
  await pickEdge(page, near.index);
  await expect(page.locator('.reason')).toContainText('바로 옆에 있지만');
  await expect(page.locator('.reason')).toContainText('가까이 있다고 만나는 것은 아니에요');
  await expect(page.locator(`.edge-opt[data-seg="${near.index}"]`)).toHaveClass(/is-wrong/);
  await expect(page.locator('.hint-btn')).toBeVisible();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
  await expect(page.locator('.edge-band')).toHaveCount(1); // 틀려도 정답 선분은 표시하지 않는다
  await watchToasts(page);
  await pickEdge(page, near.index); // 이미 골라 본 보기
  await expectToasted(page, 'info', '이미 골라 본 선분');
  // 힌트: 반만 접었다가 편다. "반 접힘"은 1.4초 동안만 보이는 장면이라, 지나간 상태를 적어 두고 다 펴진 뒤에 본다
  await watchFold(page);
  await page.locator('.hint-btn').click();
  await page.waitForFunction(() => window.foldLog.some((x) => x.fold === 'half') && document.querySelector('.fold-stage').dataset.fold === 'flat');
  const peek = await page.evaluate(() => window.foldLog);
  const passed = peek.map((x) => x.fold);
  expect(passed.indexOf('folding')).toBeGreaterThanOrEqual(0);
  expect(passed.indexOf('half')).toBeGreaterThan(passed.indexOf('folding')); // 접는 움직임 → 반 접힘 → (펴는 움직임) → 펼침
  expect(passed.at(-1)).toBe('flat');
  expect(peek.find((x) => x.fold === 'half').names).toBe('0'); // 접혀 있는 동안 꼭짓점 이름은 숨는다
  await pickEdge(page, q.answer);
  await folded(page);
  await expect(page.locator('.edge-band.is-a')).toHaveCount(2);
  expect((await page.locator('.edge-tag').allTextContents()).sort()).toEqual([q.segments[q.target].name, q.segments[q.answer].name].sort());
  // 접힌 뒤 두 띠가 한 모서리에서 만난다: 두 띠의 화면 자리가 서로 닿아 있다
  const gap = await page.evaluate(() => {
    const [a, b] = [...document.querySelectorAll('.edge-band.is-a')].map((el) => el.getBoundingClientRect());
    return Math.max(Math.max(a.left, b.left) - Math.min(a.right, b.right), Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  });
  expect(gap).toBeLessThan(6);
  await expect(page.locator('.edge-opt[disabled]')).toHaveCount(4);
  // 학습 기록: 틀린 시도 1번(tag 만나는 선분) + 맞힘
  for (const x of questionsFor('cuboid-edge').slice(1)) {
    await page.locator('.next-btn').click();
    await pickEdge(page, x.answer);
  }
  await page.locator('.next-btn').click();
  await expect(page.getByText('6번 중 5번 맞힘')).toBeVisible();
  await openReport(page);
  await expect(page.locator('.mistakes')).toContainText('만나는 선분 (1번)');
  expect(errors).toEqual([]);
});

test('만나는 선분 정답 노출 0: 답하기 전 화면은 정답과 무관하게 한 가지 모습 — 띠는 물음의 선분 하나, 무대 변환·그늘·보기 버튼의 모습이 같고, 1 cm의 크기가 문항마다 같다 (시드 8개 × 5문항)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '화면 전체를 견주는 검사는 크롬북 화면에서 한 번');
  test.setTimeout(120_000);
  const looks = new Set();
  const units = new Set();
  for (let seed = 1; seed <= 8; seed += 1) {
    await page.goto(STAGE_URL('cuboid-edge', '', String(seed)));
    for (const q of questionsFor('cuboid-edge', String(seed))) {
      await expect(page.locator('.q-counter')).toHaveText(`문제 ${q.number} / 5`);
      const look = await page.evaluate(() => {
        const stage = document.querySelector('.fold-stage');
        const scene = stage.querySelector('.net-scene');
        return {
          unit: scene.style.getPropertyValue('--unit'),
          look: JSON.stringify({
            scene: scene.style.transform,
            stage: stage.className,
            fold: stage.dataset.fold,
            badge: [stage.querySelector('.stage-badge').hidden, stage.querySelector('.stage-badge').textContent],
            faces: [...stage.querySelectorAll('.net-face')].map((f) => [f.className, f.style.getPropertyValue('--shade'), [...f.attributes].map((a) => a.name).sort().join(), f.querySelector('.face-label').textContent]),
            bands: [...stage.querySelectorAll('.edge-band')].map((b) => b.className),
            tags: stage.querySelectorAll('.edge-tag').length,
            names: stage.querySelectorAll('.net-vname').length,
            options: [...document.querySelectorAll('.edge-opt')].map((b) => [b.className, b.disabled, [...b.attributes].map((a) => a.name).sort().join()]),
            tools: [document.querySelector('.fold-toggle').disabled, document.querySelector('.fold-range').disabled, document.querySelector('.view-pad').className],
          }),
        };
      });
      looks.add(look.look);
      units.add(look.unit);
      // 물음의 띠는 물음의 선분이 놓인 면에 있다(정답 선분이 놓인 면이 아니다)
      await expect(page.locator(`.net-face[data-face="${q.segments[q.target].face}"] .edge-band`)).toHaveCount(1);
      await pickEdge(page, q.answer);
      await page.locator('.next-btn').click();
    }
  }
  expect(looks.size).toBe(1);
  expect(units.size).toBe(1);
});

// ── 2단계: 알맞은 면 고르기 ───────────────────────────
test('알맞은 면 고르기: 길이 하나만 다른 카드 → 접어서 길이가 다른 두 선분을 같은 무늬와 길이 이름표로, [펴고 다시 하기] → 크기가 다른 면 → 알맞은 카드. 학습 기록에 tag 두 가지', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-face'));
  const questions = questionsFor('cuboid-face');
  const [q] = questions;
  await expect(page.locator('.q-prompt')).toHaveText(`빈 자리(+)에 붙일 ${q.missingLabel} 면은 어느 카드일까요?`);
  await expect(page.locator('.net-face')).toHaveCount(5);
  await expect(page.locator('.net-slot')).toHaveCount(1);
  await expect(page.locator('.size-card')).toHaveCount(3);
  await expect(page.locator('.face-len')).toHaveCount(10); // 면마다 가로·세로 길이

  await placeCard(page, q, 'length');
  await expect(page.locator('.reason')).toContainText('맞닿는 모서리는 길이가 같아야 해요');
  await expect(page.locator('.stage-badge')).toHaveText('직육면체가 안 돼요');
  await expect(page.locator('.edge-band.is-a')).toHaveCount(2);
  const tags = await page.locator('.edge-tag').allTextContents();
  expect(tags.length).toBe(2);
  expect(tags[0]).not.toBe(tags[1]); // 두 선분의 길이가 다르다
  for (const t of tags) expect(t).toMatch(/^\d cm$/);
  await page.getByRole('button', { name: '펴고 다시 하기' }).click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
  await expect(cardOf(page, q, 'length')).toHaveClass(/is-tried/);
  await expect(page.locator('.edge-band')).toHaveCount(0);
  await watchToasts(page);
  await cardOf(page, q, 'length').click();
  await page.locator('.net-slot').click();
  await expectToasted(page, 'info', '이미 붙여 본 카드');

  await placeCard(page, q, 'pair');
  await expect(page.locator('.reason')).toContainText(`빠진 면은 ${q.oppositeLabel} 면과 마주 봐요. 마주 보는 면은 모양과 크기가 같아요.`);
  await page.getByRole('button', { name: '펴고 다시 하기' }).click();
  await placeCard(page, q, 'answer');
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await expect(page.locator('.stage-badge')).toHaveText('직육면체가 됐어요');
  await expect(page.locator('.net-face.is-placed')).toHaveCount(1);
  for (const x of questions.slice(1)) {
    await page.locator('.next-btn').click();
    await placeCard(page, x, 'answer');
  }
  await page.locator('.next-btn').click();
  await expect(page.getByText('6번 중 4번 맞힘')).toBeVisible();
  await openReport(page);
  await expect(page.locator('.mistakes')).toContainText('맞닿는 모서리 길이 (1번)');
  await expect(page.locator('.mistakes')).toContainText('마주 보는 면은 합동 (1번)');
  expect(errors).toEqual([]);
});

test('알맞은 면 고르기 정답 노출 0: 빈 자리 표시는 빠진 면의 크기와 무관하게 같은 깊이(2 cm)이고 48px 이상, 카드 세 장은 같은 색·같은 축척, 1 cm의 크기가 문항마다 같다 (시드 6개 × 4문항)', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const units = new Set();
  const answerAt = new Set();
  for (let seed = 1; seed <= (testInfo.project.name === 'chromebook' ? 6 : 2); seed += 1) {
    await page.goto(STAGE_URL('cuboid-face', '', String(seed)));
    for (const q of questionsFor('cuboid-face', String(seed))) {
      await expect(page.locator('.q-counter')).toHaveText(`문제 ${q.number} / 4`);
      const m = await page.evaluate(() => {
        const unit = parseFloat(document.querySelector('.net-scene').style.getPropertyValue('--unit'));
        const slot = document.querySelector('.net-slot').getBoundingClientRect();
        const cards = [...document.querySelectorAll('.size-card')];
        return {
          unit,
          slot: [slot.width / unit, slot.height / unit].map((v) => Math.round(v * 100) / 100),
          slotPx: Math.min(slot.width, slot.height),
          colors: new Set(cards.map((c) => getComputedStyle(c.querySelector('.size-rect')).backgroundColor)).size,
          scale: new Set(cards.map((c) => {
            const r = c.querySelector('.size-rect').getBoundingClientRect();
            const [w, h] = c.getAttribute('aria-label').match(/\d+/g).map(Number);
            return `${(r.width / w).toFixed(2)} ${(r.height / h).toFixed(2)}`;
          })).size,
          classes: cards.map((c) => c.className).join('|'),
        };
      });
      units.add(m.unit);
      const edge = Math.max(q.slot.rect.w, q.slot.rect.h) === SLOT_DEPTH ? SLOT_DEPTH : (q.slot.rect.w === SLOT_DEPTH ? q.slot.rect.h : q.slot.rect.w);
      expect(m.slot.slice().sort(), q.itemId).toEqual([SLOT_DEPTH, edge].sort()); // 깊이 2 cm × 붙는 변의 길이
      expect(m.slotPx, q.itemId).toBeGreaterThanOrEqual(48);
      expect([m.colors, m.scale], q.itemId).toEqual([1, 1]);
      expect(m.classes).toBe('size-card dnd-item|size-card dnd-item|size-card dnd-item');
      answerAt.add(q.cards.findIndex((c) => c.kind === 'answer'));
      await placeCard(page, q, 'answer');
      await page.locator('.next-btn').click();
    }
  }
  expect(units.size).toBe(1);
  if (testInfo.project.name === 'chromebook') expect(answerAt.size).toBe(3); // 알맞은 카드의 자리는 섞인다
});

test('알맞은 면 고르기 키보드만: Tab으로 카드를 고르면 빈 자리로 초점이 가고 Enter로 붙인다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-face'));
  const [q] = questionsFor('cuboid-face');
  await cardOf(page, q, 'answer').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.net-slot')).toBeFocused();
  await page.keyboard.press('Enter');
  await folded(page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await expect(page.locator('.next-btn')).toBeFocused();
  expect(errors).toEqual([]);
});

test('알맞은 면 고르기 터치(태블릿): 카드를 빈 자리로 끌어 놓으면 접힌다. 끄는 카드는 놓을 때까지 보인다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', '터치 끌기는 태블릿 화면에서 확인');
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-face'));
  const [q] = questionsFor('cuboid-face');
  const from = await cardOf(page, q, 'answer').boundingBox();
  const to = await page.locator('.net-slot').boundingBox();
  const [fx, fy] = [from.x + from.width / 2, from.y + from.height / 2];
  const [tx, ty] = [to.x + to.width / 2, to.y + to.height / 2];
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', fx, fy);
  for (let i = 1; i <= 12; i += 1) await touch('touchMove', fx + ((tx - fx) * i) / 12, fy + ((ty - fy) * i) / 12);
  await expect(page.locator('.dnd-ghost')).toHaveCount(1); // 끄는 동안 카드의 복제가 보인다
  await touch('touchEnd');
  await folded(page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await expect(page.locator('.dnd-ghost')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// ── 3단계: 길이까지 살펴요 ───────────────────────────
test('길이까지 살펴요: 5문항을 모두 맞히고 안 되는 전개도 3개의 까닭(겹침 · 붙은 변의 길이 · 마주 보는 면의 크기)까지 고르면 결과에 설명 맞힘 3번', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-judge'));
  await expect(page.locator('.order-kind')).toHaveText('검사 주문');
  const questions = questionsFor('cuboid-judge');
  for (const q of questions) {
    await expect(page.locator('.q-prompt')).toHaveText('접으면 직육면체가 될까요?');
    await expect(page.locator('.face-len')).toHaveCount(12);
    await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
    if (!q.valid) {
      // 까닭을 고르기 전에는 접히지 않고 까닭 표시도 없다
      await expect(page.locator('.reason-chip')).toHaveText(['면이 겹쳐요', '붙은 두 변의 길이가 달라요', '마주 보는 면의 크기가 달라요']);
      await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
      await expect(page.locator('.reason')).toHaveCount(0);
      await expect(page.locator('.edge-band, .is-overlap, .net-ghost')).toHaveCount(0);
      await expect(page.locator('.stage-badge')).toBeHidden();
      await page.locator(`.reason-chip[data-reason="${q.intended}"]`).click();
      await expect(page.locator('.reason-pick-result')).toContainText('맞아요! 설명 +2');
    }
    await folded(page);
    await expect(page.locator('.stage-badge')).toHaveText(q.valid ? '직육면체가 됐어요' : '직육면체가 안 돼요');
    if (q.intended === 'overlap') await expect(page.locator('.net-face.is-overlap')).toHaveCount(2);
    if (q.intended === 'length' || q.intended === 'pair') {
      await expect(page.locator('.edge-band.is-a')).toHaveCount(2);
      const lengths = await page.locator('.edge-tag').allTextContents();
      expect(lengths[0]).not.toBe(lengths[1]);
    }
    if (q.valid) await expect(page.locator('.edge-band')).toHaveCount(0);
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

test('길이까지 살펴요: 안 되는 전개도에 "돼요"를 고르면 까닭과 표시를 보여 주고 학습 기록에 tag(면이 겹침 · 맞닿는 모서리 길이 · 마주 보는 면은 합동)가 남는다. 되는 전개도에 "안 돼요"는 여러 가지 전개도', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-judge'));
  for (const q of questionsFor('cuboid-judge')) {
    await page.locator(`.answer-btn:not([data-answer="${q.expected}"])`).click();
    await folded(page);
    await expect(page.locator('.reason.is-wrong')).toBeVisible();
    await expect(page.locator('.reason-pick')).toHaveCount(0); // 틀리면 까닭 고르기 없이 바로 까닭
    if (q.intended === 'length') await expect(page.locator('.reason')).toContainText('붙은 두 변의 길이가');
    if (q.intended === 'pair') await expect(page.locator('.reason')).toContainText(`면은 마주 보는 ${q.opposite} 면과 크기가 달라요`);
    if (q.intended === 'overlap') await expect(page.locator('.reason')).toContainText('같은 자리에 겹쳐요');
    await page.locator('.next-btn').click();
  }
  await expect(page.getByText('5번 중 0번 맞힘')).toBeVisible();
  await openReport(page);
  for (const tag of ['면이 겹침 (1번)', '맞닿는 모서리 길이 (1번)', '마주 보는 면은 합동 (1번)', '여러 가지 전개도 (2번)']) await expect(page.locator('.mistakes')).toContainText(tag);
  expect(errors).toEqual([]);
});

test('길이까지 살펴요 정답 노출 0: 답하기 전 화면은 되는 전개도와 안 되는 전개도가 같은 모습 — 1 cm의 크기, 면 6장, 길이 이름표 12개(면의 크기 그대로), 클래스·속성·그늘·무대 변환·조작 띠 (시드 6개 × 5문항)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '화면 전체를 견주는 검사는 크롬북 화면에서 한 번');
  test.setTimeout(120_000);
  const looks = new Map(); // 모습 → 그 모습으로 나온 문항의 종류
  for (let seed = 1; seed <= 6; seed += 1) {
    await page.goto(STAGE_URL('cuboid-judge', '', String(seed)));
    for (const q of questionsFor('cuboid-judge', String(seed))) {
      await expect(page.locator('.q-counter')).toHaveText(`문제 ${q.number} / 5`);
      const m = await page.evaluate(() => {
        const stage = document.querySelector('.fold-stage');
        const scene = stage.querySelector('.net-scene');
        const unit = parseFloat(scene.style.getPropertyValue('--unit'));
        const faces = [...stage.querySelectorAll('.net-face')];
        return {
          // 길이 이름표가 면의 실제 크기와 같다(면마다 같은 규칙)
          labelsOk: faces.every((f) => {
            const b = f.getBoundingClientRect();
            return f.querySelector('.face-len.is-w').textContent === `${Math.round(b.width / unit)} cm` && f.querySelector('.face-len.is-h').textContent === `${Math.round(b.height / unit)} cm`;
          }),
          look: JSON.stringify({
            unit,
            scene: scene.style.transform,
            stage: stage.className,
            fold: stage.dataset.fold,
            badge: [stage.querySelector('.stage-badge').hidden, stage.querySelector('.stage-badge').textContent],
            faces: faces.map((f) => [f.className, f.style.getPropertyValue('--shade'), [...f.attributes].map((a) => a.name).sort().join(), f.children.length]),
            labels: faces.map((f) => f.dataset.label).sort().join(''),
            extra: stage.querySelectorAll('.edge-band, .edge-tag, .net-ghost, .net-dot, .net-vname, .net-slot').length,
            // 답 버튼: 앞 문항에서 누른 버튼에 남은 튀기기·흔들기 클래스(fx-…)는 뺀다(앞 문항의 내 답이지 이 문항의 답이 아니다)
            answer: [...document.querySelectorAll('.answer-btn')].map((b) => [b.className.replace(/\s*fx-\S+/g, ''), b.disabled, b.getAttribute('aria-pressed')]),
            tools: [document.querySelector('.fold-toggle').disabled, document.querySelector('.fold-range').disabled, document.querySelector('.view-pad').className, document.querySelector('.fold-tools').className],
            panel: document.querySelector('.net-panel').innerText.replace(/문제 \d/, '문제 n'), // 보이는 글자만
          }),
        };
      });
      expect(m.labelsOk, q.itemId).toBe(true);
      const kinds = looks.get(m.look) ?? new Set();
      kinds.add(q.intended ?? 'valid');
      looks.set(m.look, kinds);
      await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
      if (!q.valid) await page.locator('.reason-skip').click();
      await page.locator('.next-btn').click();
    }
  }
  expect(looks.size).toBe(1); // 30문항이 모두 한 가지 모습
  expect([...looks.values()][0]).toEqual(new Set(['valid', 'overlap', 'length', 'pair']));
});

// ── 4단계: 내 맘대로 직육면체 전개도 ─────────────────────
test('내 맘대로 직육면체 전개도: 면 6장을 놓고 [접어 보기] → 새 전개도(+7), 한 면을 옮겨 둘째(끝낼 수 있음, 별 2개 안내), 셋째 → 결과에 별 3개 · 찾은 전개도 3가지 · 33점, 화면 = 저장', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  await expect(page.locator('.order-kind')).toHaveText('설계 주문');
  await expect(page.locator('.q-counter')).toHaveText('찾은 전개도 0가지');
  await expect(page.locator('.rect-card')).toHaveCount(6);
  await expect(page.locator('.free-fold')).toBeDisabled();
  await expect(page.locator('.free-note')).toHaveText('면 6장을 모두 놓으면 접어 볼 수 있어요.');
  // 접기 전에 될지 묻지 않는다: 예상 버튼·말이 없다
  await expect(page.locator('.play-area')).not.toContainText(/예상|예측|될 거예요/);
  const board = boardOf(page);
  const shift = board.cols === 12 ? 0 : -2; // 휴대폰 판(10칸)은 두 칸 왼쪽에
  const move = (rects) => rects.map((r) => ({ ...r, x: r.x + shift }));
  await buildNet(page, move(VALID_STRIP));
  await expect(page.locator('.mat-status')).toContainText('6 / 6');
  await expect(page.locator('.free-fold')).toBeEnabled();
  await foldIt(page);
  await expect(page.locator('.stage-badge')).toHaveText('직육면체가 됐어요');
  await expect(page.locator('.reason')).toContainText('새 전개도 발견');
  await expect(page.locator('.bonus-note')).toHaveText('새 발견 +5 · 만들기 성공 +2');
  await expect(page.locator('.found-stamp')).toContainText('1가지째');
  await expect(page.locator('.q-counter')).toHaveText('찾은 전개도 1가지');
  await expect(page.locator('.found-slot.is-found.is-new')).toHaveCount(1);
  await expect(page.locator('.found-count')).toHaveText('지금까지 1가지');
  await expect(page.locator('.rank-chip small')).toHaveText('7점');
  expect(await storedXpOf(page)).toBe(7); // 접은 그 자리에서 저장된다
  await expect(page.locator('.free-finish')).toHaveCount(0); // 한 가지로는 끝낼 수 없다

  // 펴서 고치기: 바 면을 나 면 아래로 옮기면 다른 전개도
  await page.locator('.free-fix').click();
  await expect(page.locator('.rect-tile')).toHaveCount(6);
  await tileOf(page, '바').click();
  await cellOf(page, [6 + shift, 5]).click({ position: { x: 4, y: 4 } });
  await foldIt(page);
  await expect(page.locator('.goal-done')).toHaveText('전개도 2가지를 찾았어요! 한 가지 더 찾으면 별 3개예요.');
  await expect(page.locator('.free-buttons button')).toHaveText(['펴서 고치기', '새로 만들기', '결과 보기']);
  await expect(page.locator('.rank-chip small')).toHaveText('14점');
  // 같은 모양을 다시 접으면(뒤집어 놓아도) 기록·점수 없음
  await page.locator('.free-fix').click();
  await tileOf(page, '마').click();
  await cellOf(page, [6 + shift, 1]).click({ position: { x: 4, y: 4 } });
  await tileOf(page, '바').click();
  await cellOf(page, [3 + shift, 5]).click({ position: { x: 4, y: 4 } });
  await foldIt(page);
  await expect(page.locator('.reason')).toContainText('이번에 이미 접어 본 모양이에요');
  await expect(page.locator('.rank-chip small')).toHaveText('14점');
  // 셋째: 마 면을 다 면 위로 (1 cm인 변끼리)
  await page.locator('.free-fix').click();
  // 다른 면에 붙은 채로는 돌릴 자리가 없다: 그대로 두고 알린다 → 빈 곳으로 옮긴 다음 두 번 눌러 돌린다
  await watchToasts(page);
  await tileOf(page, '마').click();
  await tileOf(page, '마').click();
  expect((await tileRect(page, '마')).slice(2)).toEqual([2, 1]);
  await expectToasted(page, 'info', '돌릴 자리가 모자라요');
  await tileOf(page, '마').click();
  await cellOf(page, [9 + shift, 6]).click({ position: { x: 4, y: 4 } });
  await tileOf(page, '마').click();
  await tileOf(page, '마').click(); // 두 번 누르면 돈다: 2 × 1 → 1 × 2
  expect((await tileRect(page, '마')).slice(2)).toEqual([1, 2]);
  await page.mouse.move(0, 0);
  const from = await tileOf(page, '마').boundingBox();
  const to = await cellOf(page, [5 + shift, 0]).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + 6);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 6, { steps: 6 });
  await expect(page.locator('.rect-preview')).toBeVisible(); // 끄는 동안 놓일 자리를 미리 보인다
  await page.mouse.up();
  expect(await tileRect(page, '마')).toEqual([5 + shift, 0, 1, 2]);
  await foldIt(page);
  await expect(page.locator('.goal-done')).toHaveText('서로 다른 전개도 3가지를 찾았어요! 별 3개예요.');
  await expect(page.locator('.free-buttons button')).toHaveText(['결과 보기', '펴서 고치기', '새로 만들기']);
  await expect(page.locator('.found-slot.is-found')).toHaveCount(3);
  await page.locator('.free-finish').click();
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  const stats = await page.locator('.result-stats').textContent();
  expect(stats).toContain('찾은 전개도3가지');
  expect(stats).toContain('접어 본 모양3가지');
  expect(stats).not.toMatch(/정답률|맞힘|%/);
  await expect(page.locator('.screen-result')).not.toContainText(/정답률|번 중 \d+번 맞힘|예상|예측/);
  const xp = await resultXpSum(page);
  expect([xp.tiles, xp.line, xp.gained]).toEqual([22, 11, 33]); // 전개도 3 × (2 + 5) + 연속 1 · 단계 완료 5 + 별 3개 6
  expect(await storedXpOf(page)).toBe(33);
  await expect(page.locator('.rank-chip small')).toHaveText('33점');
  expect(errors).toEqual([]);
});

test('내 맘대로 직육면체 전개도: 2가지만 찾고 끝내면 별 2개와 "서로 다른 전개도 3가지를 찾으면 별 3개!", 다시 해서 같은 전개도를 만들면 0점(전에 찾은 전개도), 새로 고쳐도 찾은 가지 수와 점수가 남는다', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  const board = boardOf(page);
  const A = netRects('123-10', board);
  const B = netRects('123-25', board);
  await buildNet(page, A);
  await foldIt(page);
  await fresh(page);
  await buildNet(page, B);
  await foldIt(page);
  await page.locator('.free-finish').click();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 2개');
  await expect(page.locator('.screen-result')).toContainText('서로 다른 전개도 3가지를 찾으면 별 3개!');
  const first = await resultXpSum(page);
  expect([first.tiles, first.line, first.gained]).toEqual([14, 9, 23]);
  expect(await storedXpOf(page)).toBe(23);
  // 새로 고친 뒤: 찾은 가지 수가 남고, 같은 전개도(돌려서)는 0점
  await page.goto(STAGE_URL('cuboid-free'));
  await expect(page.locator('.found-count')).toHaveText('지금까지 2가지');
  await expect(page.locator('.found-slot.is-found')).toHaveCount(0); // 이번 판에 찾은 것은 아직 없다
  await buildNet(page, netRects('123-10', board, 6));
  await foldIt(page);
  await expect(page.locator('.reason')).toContainText('전에 찾은 전개도와 같은 모양이에요');
  await expect(page.locator('.bonus-note')).toHaveText('전에 찾은 전개도라 점수는 없어요.');
  await expect(page.locator('.meta-xp b')).toHaveText('+0');
  await expect(page.locator('.found-stamp')).toBeHidden();
  expect(await storedXpOf(page)).toBe(23);
  // 판 중간에 나가도 처음 찾은 전개도의 점수는 남는다
  await fresh(page);
  await buildNet(page, netRects('123-40', board));
  await foldIt(page);
  expect(await storedXpOf(page)).toBe(30);
  await page.getByRole('button', { name: '← 단계 선택' }).click();
  await expect(page.locator('.rank-chip small')).toHaveText('30점');
  await page.locator('.stage-card', { hasText: '내 맘대로 직육면체 전개도' }).click();
  await expect(page.locator('.found-count')).toHaveText('지금까지 3가지');
  await buildNet(page, netRects('123-40', board, 2));
  await foldIt(page);
  await expect(page.locator('.meta-xp b')).toHaveText('+0');
  expect(await storedXpOf(page)).toBe(30);
  // 학습 기록·결과 복사·도감 화면에는 이 모음이 보이지 않는다(정육면체 차시의 도감 칩 그대로). 기록을 지우면 찾은 전개도도 지워진다
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off'));
  await page.getByRole('button', { name: '학습 기록' }).click();
  await expect(page.locator('.btn-collection')).toContainText('도감 0 / '); // 도감 수에 찾은 직육면체 전개도(3가지)가 들어가지 않는다
  await expect(page.locator('.btn-collection')).not.toContainText(/직육면체|54/);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copied = text; } } });
  });
  await watchToasts(page);
  await page.getByRole('button', { name: '결과 복사' }).click();
  await expectToasted(page, 'info', '결과를 복사했어요');
  const copied = await page.evaluate(() => window.copied.split('\n').at(-1));
  expect(copied).toMatch(/^칭호: 견습생\(30점\) · 도장 \d+개 · 도감 0\//);
  expect(copied).not.toMatch(/직육면체|54/);
  await page.locator('.btn-collection').click();
  await expect(page.locator('[data-collection="cube-nets"]')).toHaveCount(1);
  await expect(page.locator('[data-collection="cuboid-nets"]')).toHaveCount(0);
  await page.getByRole('button', { name: '학습 기록' }).click();
  await page.getByRole('button', { name: '기록 모두 지우기' }).click();
  await page.getByRole('button', { name: '한 번 더 누르면 지워져요' }).click();
  await page.goto(STAGE_URL('cuboid-free'));
  await expect(page.locator('.found-count')).toHaveText('지금까지 0가지');
  await buildNet(page, A);
  await foldIt(page);
  await expect(page.locator('.bonus-note')).toHaveText('새 발견 +5 · 만들기 성공 +2');
  expect(errors).toEqual([]);
});

test('내 맘대로 직육면체 전개도 점수: 탭 두 개를 섞어 써도 저장되는 것은 늘 한 탭의 점수와 찾은 전개도 한 쌍이라, 한 전개도의 점수를 두 번 받지 못한다', async ({ page, context }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  const storedNets = (p) => p.evaluate(() => Object.keys((JSON.parse(localStorage.getItem('edu:net-workshop:collections')) ?? {})['cuboid-nets'] ?? {}).sort());
  /** [접어 보기]를 누른다. 점수·등록·저장은 누르는 순간 정해지므로 접는 장면이 끝나기를 기다리지 않는다(뒤에 있는 탭은 장면 그리기를 멈춘다) */
  const foldNow = async (p) => {
    await p.bringToFront();
    await p.locator('.free-fold').click();
    await expect(p.locator('.free-result')).toBeVisible();
  };
  const again = async (p) => {
    await p.locator('.free-new').click();
    await expect(p.locator('.rect-tile')).toHaveCount(0);
  };
  const board = boardOf(page);
  const [X, Y, Z] = ['123-10', '123-25', '123-40'].map((id) => netRects(id, board));
  const tabA = page;
  const tabB = await context.newPage();
  await tabA.goto(STAGE_URL('cuboid-free'));
  await tabB.goto(STAGE_URL('cuboid-free')); // 두 탭 모두 빈 기록에서 시작
  // 같은 전개도를 두 탭에서: 둘 다 +7로 보이지만 저장은 7점
  await tabA.bringToFront();
  await buildNet(tabA, X);
  await foldNow(tabA);
  await tabB.bringToFront();
  await buildNet(tabB, X);
  await foldNow(tabB);
  await expect(tabB.locator('.meta-xp b')).toHaveText('+7');
  expect(await storedXpOf(tabA)).toBe(7);
  expect(await storedNets(tabA)).toEqual(['123-10']);
  // A가 둘째 전개도를 찾고(14점), 이어서 B가 다른 전개도를 찾는다: 저장값은 B의 한 쌍(14점, B가 찾은 두 가지)
  await tabA.bringToFront();
  await again(tabA);
  await buildNet(tabA, Y);
  await foldNow(tabA);
  expect(await storedXpOf(tabA)).toBe(14);
  expect(await storedNets(tabA)).toEqual(['123-10', '123-25']);
  await tabB.bringToFront();
  await again(tabB);
  await buildNet(tabB, Z);
  await foldNow(tabB);
  expect(await storedXpOf(tabB)).toBe(14);
  expect(await storedNets(tabB)).toEqual(['123-10', '123-40']); // 점수만 A, 찾은 전개도만 B로 엇갈리지 않는다
  // 새 탭: 저장된 전개도는 0점, 빠진 전개도(Y)만 점수 → 세 전개도 모두 한 번씩만 받는다
  const tabC = await context.newPage();
  await tabC.goto(STAGE_URL('cuboid-free'));
  await expect(tabC.locator('.rank-chip small')).toHaveText('14점');
  await expect(tabC.locator('.found-count')).toHaveText('지금까지 2가지');
  for (const [rects, gain] of [[X, '+0'], [Z, '+0'], [Y, '+7']]) {
    if (await tabC.locator('.free-new').isVisible()) await again(tabC);
    await buildNet(tabC, rects);
    await foldNow(tabC);
    await expect(tabC.locator('.meta-xp b')).toHaveText(gain);
  }
  expect(await storedXpOf(tabC)).toBe(21);
  expect(await storedNets(tabC)).toEqual(['123-10', '123-25', '123-40']);
  expect(errors).toEqual([]);
});

/** 까닭을 고르는 동안 정답 까닭이 화면·DOM 어디에도 없다 (까닭 칩 자신은 빼고) */
async function expectNoReasonShown(page) {
  await expect(page.locator('.reason-pick')).toBeVisible();
  await expect(page.locator('.reason-chip')).toHaveCount(3);
  // 화면 읽기 알림은 조금 뒤(30ms)에 들어간다: 그 글이 들어온 뒤에 본다 — 알림 글에도 까닭 낱말이 없어야 한다
  await expect(page.locator('.sr-only[aria-live]').first()).not.toHaveText('');
  const found = await page.evaluate(() => {
    const words = /겹|둘러|달라|어긋|비어|꼭짓점|한 점|≠|모서리/;
    const pick = document.querySelector('.reason-pick');
    const stage = document.querySelector('.fold-stage');
    const badge = stage.querySelector('.stage-badge');
    const out = [];
    if (!badge.hidden || badge.textContent !== '') out.push(`이름표: ${badge.textContent}`);
    for (const el of stage.querySelectorAll('.is-overlap, .net-ghost, .net-dot, .edge-band, .edge-tag')) out.push(`표시: ${el.className}`);
    for (const el of stage.querySelectorAll('.face-mark')) if (el.textContent !== '') out.push(`면 글자: ${el.textContent}`);
    if (/marks-/.test(stage.className)) out.push(`무대 클래스: ${stage.className}`);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (pick.contains(node) || node.parentElement.closest('script, style')) continue;
      if (words.test(node.textContent)) out.push(`글자(${node.parentElement.className}): ${node.textContent.trim().slice(0, 40)}`);
    }
    for (const el of document.body.querySelectorAll('*')) {
      if (pick.contains(el)) continue;
      for (const attr of el.attributes) {
        const checked = attr.name === 'aria-label' || attr.name === 'title' || attr.name === 'class' || attr.name.startsWith('data-');
        if (checked && /겹|둘러|달라|어긋|비어|꼭짓점|한 점|overlap|vertex|blocked|ghost|is-a\b/.test(attr.value)) out.push(`속성(${el.className}): ${attr.name}=${attr.value.slice(0, 40)}`);
      }
    }
    return out;
  });
  expect(found).toEqual([]);
}

test('내 맘대로 직육면체 전개도 까닭 고르기: 안 되는 모양(겹침 · 붙은 변의 길이 · 한 점을 둘러쌈)을 접으면 고르기 전에는 까닭이 화면·속성 어디에도 없고, 고른 뒤에 표시와 까닭 문장이 나온다. 점수는 없다. 떨어진 면이 있으면 접지 않는다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '화면 전체를 견주는 검사는 크롬북 화면에서 한 번 (다른 크기의 배치는 아래 검사)');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  // 떨어진 면: 접지 않고 기록하지 않는다
  await buildNet(page, BAD.apart);
  await expect(page.locator('.free-fold')).toBeDisabled();
  await expect(page.locator('.free-note')).toHaveText('떨어진 면이 있어요. 전개도는 한 장으로 이어져 있어야 접을 수 있어요.');
  await expect(tileOf(page, '바')).toHaveClass(/is-apart/);
  await expect(page.locator('.rect-tile.is-apart')).toHaveCount(1);
  await page.locator('.tool-clear').click();

  // 겹침: 고르기 전에는 표시 없음 → 맞는 까닭
  await buildNet(page, BAD.overlap);
  await foldIt(page);
  await expect(page.locator('.reason')).toContainText('접어 보니 직육면체가 안 돼요. 왜 그런지 골라 볼까요?');
  await expect(page.locator('.reason-chip')).toHaveText(['면이 겹쳐요', '만나는 모서리가 꼭 맞지 않아요', '면이 한 점을 둘러싸요']);
  await expectNoReasonShown(page);
  // 고르는 동안 돌려 보고 키워 봐도 표시는 없다
  await page.locator('.view-right').click();
  await page.locator('.view-in').click();
  await expectNoReasonShown(page);
  await page.locator('.reason-chip[data-reason="overlap"]').click();
  await expect(page.locator('.reason-pick-result')).toHaveText('내 까닭 "면이 겹쳐요" 맞아요!'); // 점수 글자가 없다
  await expect(page.locator('.stage-badge')).toContainText('직육면체가 안 돼요');
  await expect(page.locator('.net-face.is-overlap')).toHaveCount(2);
  await expect(page.locator('.reason')).toContainText('마 면과 바 면이 같은 자리에 겹쳐요');
  await expect(page.locator('.meta-xp b')).toHaveText('+0');
  expect(await storedXpOf(page)).toBe(0);

  // 붙은 변의 길이: 틀린 까닭을 골라도 바른 까닭과 표시가 나온다
  await fresh(page);
  await buildNet(page, BAD.length);
  await foldIt(page);
  await expectNoReasonShown(page);
  await page.locator('.reason-chip[data-reason="vertex"]').click();
  await expect(page.locator('.reason-pick-result')).toContainText('바른 까닭은 "만나는 모서리가 꼭 맞지 않아요"예요.');
  await expect(page.locator('.reason')).toContainText('붙은 두 변의 길이가 2 cm와 1 cm로 달라요');
  await expect(page.locator('.edge-band.is-a')).toHaveCount(2);
  expect((await page.locator('.edge-tag').allTextContents()).sort()).toEqual(['1 cm', '2 cm']);

  // 한 점을 둘러쌈: 넘어가도 표시가 나온다
  await fresh(page);
  await buildNet(page, BAD.tee);
  await foldIt(page);
  await expectNoReasonShown(page);
  await page.locator('.reason-skip').click();
  await expect(page.locator('.stage-badge')).toHaveText('면이 한 점을 둘러싸 접을 수 없어요');
  await expect(page.locator('.net-dot')).toHaveCount(2); // 면이 빈틈없이 둘러싼 점 두 곳(한 변 한가운데의 꼭짓점 · 네 면이 모인 꼭짓점)
  await expect(page.locator('.reason')).toContainText('면이 한 점을 빈틈없이 둘러싸면 접을 수 없어요');
  await expect(page.locator('.meta-xp b')).toHaveText('+0');
  // 안 되는 모양을 연달아 접으면 힌트가 켜진다(글 → 그림자)
  await page.locator('.free-fix').click();
  await expect(page.locator('.tool-hint')).toBeVisible();
  await page.locator('.tool-hint').click();
  await expect(page.locator('.hint-sticky')).toContainText('길이가 3 cm인 변끼리');
  await page.locator('.tool-hint').click();
  await expect(page.locator('.rect-shadow')).toHaveCount(6);
  expect(await storedXpOf(page)).toBe(0); // 안 되는 모양에는 점수가 없다
  expect(errors).toEqual([]);
});

test('내 맘대로 직육면체 전개도 키보드만: Tab으로 판에 들어가 방향키·Enter로 놓고 R로 돌리고, 들어 옮기기 · Delete · Ctrl+Z, Tab으로 [접어 보기]', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  const press = async (key, n = 1) => {
    for (let i = 0; i < n; i += 1) await page.keyboard.press(key);
  };
  await page.locator('.rect-board .cell[tabindex="0"]').focus(); // 판에는 칸 하나만 Tab에 걸린다 (처음: 4칸, 3줄)
  await expect(page.locator('.rect-board .cell[tabindex="0"]')).toHaveAttribute('data-cell', '4,3');
  const goTo = async ([x, y]) => {
    const [cx, cy] = (await page.locator('.rect-board .cell[tabindex="0"]').getAttribute('data-cell')).split(',').map(Number);
    await press(x > cx ? 'ArrowRight' : 'ArrowLeft', Math.abs(x - cx));
    await press(y > cy ? 'ArrowDown' : 'ArrowUp', Math.abs(y - cy));
  };
  // 카드는 가 나 다 라 마 바 순서로 놓인다: 놓고(Enter) 방향이 다르면 R
  for (const r of [VALID_STRIP[0], VALID_STRIP[2], VALID_STRIP[1], VALID_STRIP[3], VALID_STRIP[4], VALID_STRIP[5]]) {
    await goTo([r.x, r.y]);
    await page.keyboard.press('Enter');
    if ((await tileRect(page, r.label))[2] !== r.w) await page.keyboard.press('r');
    expect(await tileRect(page, r.label)).toEqual([r.x, r.y, r.w, r.h]);
  }
  // 들어 옮기기: 바 면에서 Enter(들기) → 오른쪽 3칸 → Enter(놓기)
  await page.keyboard.press('Enter');
  await expect(tileOf(page, '바')).toHaveClass(/is-held/);
  await expect(page.locator('.rect-preview')).toBeVisible();
  await press('ArrowRight', 3);
  await page.keyboard.press('Enter');
  expect(await tileRect(page, '바')).toEqual([6, 5, 2, 1]);
  await page.keyboard.press('Control+z');
  expect(await tileRect(page, '바')).toEqual([3, 5, 2, 1]);
  await goTo([3, 5]);
  await page.keyboard.press('Delete');
  await expect(page.locator('.rect-tile')).toHaveCount(5);
  await page.keyboard.press('Enter'); // 남은 카드(바)를 다시 놓는다
  await expect(page.locator('.rect-tile')).toHaveCount(6);
  // 다른 면이 있는 곳으로는 옮기지 못한다
  await page.keyboard.press('Enter');
  await press('ArrowUp', 2);
  await page.keyboard.press('Enter');
  expect(await tileRect(page, '바')).toEqual([3, 5, 2, 1]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.rect-tile.is-held')).toHaveCount(0);
  await page.locator('.free-fold').focus();
  await page.keyboard.press('Enter');
  await folded(page);
  await expect(page.locator('.reason')).toContainText('새 전개도 발견');
  await expect(page.locator('.free-fix')).toBeFocused();
  expect(errors).toEqual([]);
});

test('내 맘대로 직육면체 전개도 터치(태블릿): 카드를 판으로 끌어 놓기, 놓인 면을 집은 자리 그대로 끌어 옮기기, 두 번 눌러 돌리기, 카드 칸으로 끌어 빼기. 끈 바로 뒤의 누르기가 먹힌다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', '터치 끌기는 태블릿 화면에서 확인');
  const errors = collectErrors(page);
  await page.goto(STAGE_URL('cuboid-free'));
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const drag = async (from, to, check = null) => {
    await touch('touchStart', from[0], from[1]);
    for (let i = 1; i <= 10; i += 1) await touch('touchMove', from[0] + ((to[0] - from[0]) * i) / 10, from[1] + ((to[1] - from[1]) * i) / 10);
    if (check) await check();
    await touch('touchEnd');
  };
  const mid = (b) => [b.x + b.width / 2, b.y + b.height / 2];
  // 카드(가: 3 × 2)를 판의 (5, 3) 칸으로: 카드의 가운데가 그 칸에 온다 → 왼쪽 위 (4, 3)
  await drag(mid(await page.locator('.rect-card[data-label="가"]').boundingBox()), mid(await cellOf(page, [5, 3]).boundingBox()), async () => {
    await expect(page.locator('.dnd-ghost')).toHaveCount(1);
    await expect(page.locator('.rect-preview')).toBeVisible();
  });
  expect(await tileRect(page, '가')).toEqual([4, 3, 3, 2]);
  await expect(page.locator('.rect-preview')).toBeHidden();
  // 놓인 면을 끌어 옮긴다: 집은 칸(왼쪽 위 칸)이 놓는 칸에 온다
  const cell = await cellOf(page, [0, 0]).boundingBox();
  const tile = await tileOf(page, '가').boundingBox();
  await drag([tile.x + cell.width / 2, tile.y + cell.height / 2], mid(await cellOf(page, [1, 1]).boundingBox()));
  expect(await tileRect(page, '가')).toEqual([1, 1, 3, 2]);
  // 끈 바로 뒤의 첫 누르기: 빈 칸을 누르면 다음 카드(나)가 놓인다
  await cellOf(page, [6, 4]).tap({ position: { x: 5, y: 5 } });
  expect(await tileRect(page, '나')).toEqual([6, 4, 3, 2]);
  // 두 번 누르면 돈다
  await tileOf(page, '나').tap();
  await tileOf(page, '나').tap();
  expect(await tileRect(page, '나')).toEqual([6, 4, 2, 3]);
  await expect(page.locator('.rect-tile.is-selected')).toHaveCount(0);
  // [돌리기]는 방금 놓거나 돌린 면을 돌린다
  await page.locator('.tool-turn').tap();
  expect(await tileRect(page, '나')).toEqual([6, 4, 3, 2]);
  // 카드 칸으로 끌어 빼기
  await drag(mid(await tileOf(page, '가').boundingBox()), mid(await page.locator('.rect-tray').boundingBox()));
  await expect(page.locator('.rect-tile')).toHaveCount(1);
  await expect(page.locator('.rect-card[data-label="가"]')).not.toHaveClass(/is-used/);
  // 다른 면 위에는 놓을 수 없다: 끌던 것은 제자리로 돌아간다
  await drag(mid(await page.locator('.rect-card[data-label="가"]').boundingBox()), mid(await tileOf(page, '나').boundingBox()));
  await expect(page.locator('.rect-tile')).toHaveCount(1);
  await expect(page.locator('.dnd-ghost')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// ── 화면 배치 ─────────────────────────────
test('배치(네 크기): 세 단계의 모든 장면(답하기 전 · 틀림 · 까닭 고르기 · 맞힘)에서 스크롤과 판 안쪽 넘침이 없고 버튼이 잘리지 않으며(48px 이상), 알림이 조작을 가리지 않는다', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  for (const size of sizesFor(testInfo)) {
    await page.setViewportSize(size);
    const at = (label) => `${size.width}×${size.height} ${label}`;
    /**
     * 휴대폰은 화면이 세로로 길어 내려 본 채로 답할 수 있다. 엔진은 알림을 띄우는 순간의 매트 자리 바로 밑에 고정해 두는데,
     * 내려 본 채로 답하면 판이 짧아지며 화면이 당겨져(문서 높이가 줄어든다) 알림이 잠깐 조작 띠 위에 놓일 수 있다 — 엔진의 알림 자리 계산이
     * 그렇다(정육면체 차시의 면 붙이기도 같다). 그래서 휴대폰에서는 내려 보지 않은 화면(scrollY = 0)에서만 겹침을 본다
     */
    const check = async (label) => {
      await noScroll(page, at(label));
      if (size.width > 900) await expectPanelFits(page, at(label));
    };
    /**
     * 알림이 조작을 가리지 않는다. 알림을 띄운 조작(답하기) 바로 뒤에는 꼭 보고(required), 접기가 끝난 뒤·까닭을 고른 뒤의 장면에서는
     * 알림이 아직 남아 있을 때만 본다 — 알림은 몇 초 뒤 사라져, 느린 기기에서는 접기가 끝나기 전에 없어진다
     */
    const checkToast = async (label, required = true) => {
      if (size.width > 560 || await page.evaluate(() => window.scrollY === 0)) await expectToastClear(page, at(label), { required });
    };
    // 만나는 선분
    await page.goto(STAGE_URL('cuboid-edge'));
    let [q] = questionsFor('cuboid-edge');
    await check('만나는 선분: 답하기 전');
    await pickEdge(page, q.options.find((o) => o.kind === 'near').index);
    await checkToast('만나는 선분: 틀림');
    await check('만나는 선분: 틀림(힌트 버튼)');
    await pickEdge(page, q.answer);
    await checkToast('만나는 선분: 맞힘');
    await folded(page);
    await check('만나는 선분: 맞힘');
    await checkToast('만나는 선분: 맞힘(접힌 뒤)', false);
    // 알맞은 면 고르기
    await page.goto(STAGE_URL('cuboid-face'));
    [q] = questionsFor('cuboid-face');
    await check('알맞은 면: 답하기 전');
    for (const kind of ['length', 'pair', 'answer']) {
      await cardOf(page, q, kind).click();
      await page.locator('.net-slot').click();
      await checkToast(`알맞은 면: 카드를 붙임(${kind})`);
      await folded(page);
      await check(kind === 'answer' ? '알맞은 면: 맞힘' : `알맞은 면: 틀린 카드(${kind})`);
      await checkToast(`알맞은 면: 접힌 뒤(${kind})`, false);
      if (kind === 'answer') break;
      await page.getByRole('button', { name: '펴고 다시 하기' }).click();
      await check(`알맞은 면: 펴고 다시(${kind})`);
    }
    // 길이까지 살펴요: 다섯 문항 — 무효는 번갈아 맞히고(까닭 고르기 · 틀린 까닭) 틀린다
    await page.goto(STAGE_URL('cuboid-judge'));
    for (const [i, x] of questionsFor('cuboid-judge').entries()) {
      await check(`길이까지 ${i + 1}: 답하기 전`);
      if (x.valid || i % 2 === 0) {
        await page.locator(`.answer-btn[data-answer="${x.expected}"]`).click();
        await checkToast(`길이까지 ${i + 1}: 맞힘`);
        if (!x.valid) {
          await check(`길이까지 ${i + 1}: 까닭 고르기`);
          await page.locator(`.reason-chip:not([data-reason="${x.intended}"])`).first().click(); // 틀린 까닭: 글이 가장 길다
          await checkToast(`길이까지 ${i + 1}: 까닭을 고른 뒤`, false);
        }
      } else {
        await page.locator(`.answer-btn:not([data-answer="${x.expected}"])`).click();
        await checkToast(`길이까지 ${i + 1}: 틀림`);
      }
      await folded(page);
      await check(`길이까지 ${i + 1}: 접힘(${x.intended ?? '되는 전개도'})`);
      await checkToast(`길이까지 ${i + 1}: 접힌 뒤`, false);
      await page.locator('.next-btn').click();
    }
    await expect(page.locator('.screen-result')).toBeVisible();
    await page.keyboard.press('Escape');
    await noScroll(page, at('길이까지: 결과'));
  }
  expect(errors).toEqual([]);
});

test('내 맘대로 직육면체 전개도 배치(네 크기): 놓는 판 · 접은 장면 · 까닭 고르기 · 끝낼 수 있는 장면 모두 스크롤과 판 안쪽 넘침이 없고 버튼이 잘리지 않으며, 1 cm 칸은 48px 이상(휴대폰 제외), 판 → 무대 어긋남 0px', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  for (const size of sizesFor(testInfo)) {
    await page.setViewportSize(size);
    const phone = size.width <= 560;
    const board = phone ? CUBOID_BOARDS.phone : CUBOID_BOARDS.wide;
    const at = (label) => `${size.width}×${size.height} ${label}`;
    const check = async (label) => {
      await noScroll(page, at(label));
      await expectPanelFits(page, at(label));
    };
    /** [접어 보기]를 누른 같은 차례에: 판의 면 가운데 ↔ 무대의 면 가운데의 가장 큰 어긋남(px) */
    const foldDrift = async () => {
      // 방금 고르거나 돌린 면이 제자리로 내려앉는 움직임(0.15초)이 끝난 뒤의 자리를 잰다
      await page.waitForFunction(() => [...document.querySelectorAll('.rect-tile')].every((t) => t.getAnimations().every((a) => a.playState === 'finished')));
      return foldDriftNow();
    };
    const foldDriftNow = () => page.evaluate(() => {
      // 문서 기준 자리: 휴대폰에서는 접는 순간 매트가 보이게 화면이 올라갈 수 있다
      const center = (el) => {
        const b = el.getBoundingClientRect();
        return [b.left + b.width / 2 + window.scrollX, b.top + b.height / 2 + window.scrollY];
      };
      const tiles = [...document.querySelectorAll('.rect-tile')].map((t) => ({ label: t.dataset.label, at: center(t) }));
      document.querySelector('.free-fold').click();
      const faces = [...document.querySelectorAll('.fold-stage .net-face')].map((f) => ({ label: f.dataset.label, at: center(f) }));
      return Math.round(Math.max(...tiles.map((t) => {
        const f = faces.find((x) => x.label === t.label);
        return f ? Math.hypot(f.at[0] - t.at[0], f.at[1] - t.at[1]) : 999;
      })) * 100) / 100;
    });
    await page.goto(STAGE_URL('cuboid-free'));
    await page.evaluate(() => localStorage.clear());
    await page.goto(STAGE_URL('cuboid-free'));
    await check('놓는 판(빈 판)');
    const cell = await cellOf(page, [0, 0]).boundingBox();
    if (!phone) expect(Math.min(cell.width, cell.height), at('1 cm 칸')).toBeGreaterThanOrEqual(48);
    // 판과 도구 띠가 매트 안에 들어온다
    const inside = await page.evaluate(() => {
      const mat = document.querySelector('.mat').getBoundingClientRect();
      const b = document.querySelector('.rect-board').getBoundingClientRect();
      const tools = document.querySelector('.edit-tools').getBoundingClientRect();
      return { board: b.left >= mat.left && b.right <= mat.right && b.top >= mat.top && b.bottom <= tools.top + 1, buttons: [...document.querySelectorAll('.edit-tools button')].filter((x) => x.getClientRects().length > 0).every((x) => x.getBoundingClientRect().height >= 48) };
    });
    expect(inside, at('판과 도구 띠')).toEqual({ board: true, buttons: true });
    // 안 되는 모양 → 까닭 고르기 → 틀린 까닭
    const bad = phone ? BAD.overlap.map((r) => ({ ...r, x: r.x - 2 })) : BAD.overlap;
    await buildNet(page, bad);
    await check('6장을 놓음');
    expect(await foldDrift(), at('판 → 무대(안 되는 모양)')).toBe(0);
    // 알림이 조작을 가리지 않는다: [접어 보기] 바로 뒤에 본다(알림은 몇 초 뒤 사라져, 느린 기기에서는 접기가 끝나기 전에 없어진다)
    await expectToastClear(page, at('까닭 고르기'));
    await folded(page);
    await check('까닭 고르기');
    await expectToastClear(page, at('까닭 고르기(접힌 뒤)'), { required: false });
    await page.locator('.reason-chip[data-reason="vertex"]').click();
    await check('틀린 까닭을 고른 뒤');
    // 전개도 세 가지: 첫째 · 끝낼 수 있는 장면(둘째) · 별 3개(셋째)
    for (const [i, id] of ['123-10', '123-25', '123-40'].entries()) {
      await fresh(page);
      await buildNet(page, netRects(id, board));
      expect(await foldDrift(), at(`판 → 무대(전개도 ${i + 1})`)).toBe(0);
      await expectToastClear(page, at(`전개도 ${i + 1}`));
      await folded(page);
      await check(`전개도 ${i + 1}을 접음`);
      await expectToastClear(page, at(`전개도 ${i + 1}(접힌 뒤)`), { required: false });
      // 보기 조작판이 도장·이름표와 겹치지 않는다
      const clash = await page.evaluate(() => {
        const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
        const hit = (a, b) => a && b && a.width > 0 && b.width > 0 && Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
        const pad = [...document.querySelectorAll('.view-pad button')].filter((b) => b.getClientRects().length > 0).map((b) => b.getBoundingClientRect());
        return pad.some((b) => hit(b, box('.found-stamp')) || hit(b, box('.stage-badge')));
      });
      expect(clash, at(`조작판과 도장·이름표(전개도 ${i + 1})`)).toBe(false);
    }
    await page.locator('.free-fix').click();
    await check('끝낼 수 있는 놓는 판([결과 보기])');
    await expect(page.locator('.tool-finish')).toBeVisible();
    await page.locator('.tool-finish').click();
    await expect(page.locator('.screen-result')).toBeVisible();
    await page.keyboard.press('Escape');
    await noScroll(page, at('결과'));
  }
  expect(errors).toEqual([]);
});

test('머리 높이는 판을 하는 동안 바뀌지 않는다(네 크기 × 네 단계): 연달아 맞혀 "연속 2"가 생기는 순간과 틀려서 사라지는 순간에 머리·제목·목표·매트의 화면 자리가 0px 움직인다', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  const spot = () => page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el || el.getClientRects().length === 0) return null;
      const b = el.getBoundingClientRect();
      return [b.left + window.scrollX, b.top + window.scrollY, b.width, b.height].map((v) => Math.round(v * 100) / 100);
    };
    return { header: rect('.play-header'), back: rect('.btn-back'), title: rect('.play-title'), goal: rect('.play-goal'), mat: rect('.mat') };
  });
  const streak = page.locator('.meta-streak');
  for (const size of sizesFor(testInfo)) {
    const phone = size.width <= 560;
    for (const stage of CUBOID_STAGES) {
      const at = `${size.width}×${size.height} ${stage.id}`;
      await page.setViewportSize(size);
      await page.goto(STAGE_URL(stage.id));
      await page.evaluate(() => localStorage.clear());
      await page.goto(STAGE_URL(stage.id));
      await page.waitForFunction(() => document.querySelector('.screen-play').getAnimations().every((a) => a.playState === 'finished'));
      const start = await spot();
      const same = async (label) => expect(await spot(), `${at} ${label}`).toEqual(start);
      const streakIs = async (n, label) => {
        if (n >= 2 && !phone) await expect(streak, `${at} ${label}`).toHaveText(`연속 ${n}`);
        else await expect(streak, `${at} ${label}`).toBeHidden();
      };
      if (stage.kind === 'cfree') {
        const board = phone ? CUBOID_BOARDS.phone : CUBOID_BOARDS.wide;
        for (const [i, id] of ['123-10', '123-25'].entries()) {
          if (i > 0) await fresh(page);
          await buildNet(page, netRects(id, board));
          await same(`${i + 1}번째: 6장을 놓음`);
          await foldIt(page);
          await streakIs(i + 1, `${i + 1}번째 전개도`);
          await same(`${i + 1}번째 전개도를 접음`);
        }
        await fresh(page);
        await buildNet(page, phone ? BAD.overlap.map((r) => ({ ...r, x: r.x - 2 })) : BAD.overlap);
        await foldIt(page);
        await streakIs(0, '안 되는 모양');
        await same('안 되는 모양(연속 칸이 사라짐)');
        continue;
      }
      const questions = questionsFor(stage.id);
      const right = {
        edge: (q) => pickEdge(page, q.answer),
        face: (q) => placeCard(page, q, 'answer'),
        cjudge: (q) => answerJudge(page, q),
      }[stage.kind];
      const wrong = {
        edge: (q) => pickEdge(page, q.options.find((o) => o.kind === 'near').index),
        face: (q) => placeCard(page, q, 'length'),
        cjudge: (q) => page.locator(`.answer-btn:not([data-answer="${q.expected}"])`).click(),
      }[stage.kind];
      await right(questions[0]);
      await streakIs(1, '첫 문제를 맞힘');
      await same('첫 문제를 맞힘');
      await page.locator('.next-btn').click();
      await same('둘째 문제');
      await right(questions[1]);
      await streakIs(2, '둘째 문제를 맞힘');
      await same('연속 칸이 생김');
      await page.locator('.next-btn').click();
      await wrong(questions[2]);
      await streakIs(0, '셋째 문제를 틀림');
      await same('연속 칸이 사라짐');
    }
  }
  expect(errors).toEqual([]);
});

test('머리가 두 줄이 되어도(글자가 넓은 기기) 크롬북 화면이 넘치지 않는다: 1366×768·1366×680 × 네 단계에서 목표 글이 한 줄 더 늘면 매트가 그만큼 낮아지고, 그 높이로 해 봐도 세로 스크롤과 판 안쪽 넘침이 없다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '작업대가 화면 높이에 맞춰지는 넓은 화면에서 확인');
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  const look = () => page.evaluate(() => {
    const header = document.querySelector('.play-header').getBoundingClientRect();
    const mat = document.querySelector('.mat').getBoundingClientRect();
    const goal = document.querySelector('.play-goal');
    return {
      header: header.height,
      matTop: mat.top,
      matBottom: mat.bottom,
      panelBottom: document.querySelector('.net-panel').getBoundingClientRect().bottom,
      goalLines: Math.round(goal.getBoundingClientRect().height / parseFloat(getComputedStyle(goal).lineHeight)),
    };
  });
  for (const size of [SIZES.chromebook, SIZES.low]) {
    for (const stage of CUBOID_STAGES) {
      const at = `${size.width}×${size.height} ${stage.id}`;
      await page.setViewportSize(size);
      await page.goto(STAGE_URL(stage.id));
      await page.evaluate(() => localStorage.clear());
      await page.goto(STAGE_URL(stage.id));
      await page.waitForFunction(() => document.querySelector('.screen-play').getAnimations().every((a) => a.playState === 'finished'));
      const one = await look();
      await noScroll(page, at);
      // 목표 글을 한 줄 더 늘린다: 가장 긴 줄의 60%로 좁힌다 — 글자가 넓은 글꼴에서 줄이 넘어갈 때와 같은 모습이다
      await page.evaluate(() => {
        const goal = document.querySelector('.play-goal');
        const range = document.createRange();
        range.selectNodeContents(goal);
        const width = Math.max(...[...range.getClientRects()].map((r) => r.right)) - goal.getBoundingClientRect().left;
        goal.style.maxWidth = `${Math.ceil(width * 0.6)}px`;
      });
      await page.waitForFunction(() => {
        const header = document.querySelector('.play-header').getBoundingClientRect().height;
        const told = parseFloat(getComputedStyle(document.querySelector('.play-area')).getPropertyValue('--play-header-h'));
        return Math.abs(told - header) < 0.1;
      });
      const two = await look();
      const grown = two.header - one.header;
      expect(two.goalLines, at).toBeGreaterThan(one.goalLines);
      expect(grown, `${at}: 머리가 한 줄만큼 높아졌다`).toBeGreaterThan(15);
      expect(Math.abs(two.matTop - (one.matTop + grown)), `${at}: 매트 위`).toBeLessThan(0.5);
      expect(Math.abs(two.matBottom - one.matBottom), `${at}: 매트 아래 끝`).toBeLessThan(0.5);
      expect(Math.abs(two.panelBottom - one.panelBottom), `${at}: 작업 지시서 아래 끝`).toBeLessThan(0.5);
      await noScroll(page, at);
      // 그 높이로 한 번 해 본다: 글이 가장 긴 장면도 넘치지 않는다
      const [q] = questionsFor(stage.id);
      if (stage.kind === 'edge') {
        await pickEdge(page, q.options.find((o) => o.kind === 'near').index);
        await expectPanelFits(page, `${at} 틀림`);
        await pickEdge(page, q.answer);
      } else if (stage.kind === 'face') {
        await placeCard(page, q, 'pair');
        await expectPanelFits(page, `${at} 틀린 카드`);
      } else if (stage.kind === 'cjudge') {
        const bad = questionsFor(stage.id).findIndex((x) => !x.valid);
        for (const x of questionsFor(stage.id).slice(0, bad)) {
          await answerJudge(page, x);
          await page.locator('.next-btn').click();
        }
        const x = questionsFor(stage.id)[bad];
        await page.locator(`.answer-btn[data-answer="${x.expected}"]`).click();
        await page.locator(`.reason-chip:not([data-reason="${x.intended}"])`).first().click();
        await expectPanelFits(page, `${at} 틀린 까닭`);
      } else {
        await expectPanelFits(page, `${at} 놓는 판`);
        await buildNet(page, BAD.length);
        await foldIt(page, 'vertex');
        await expectPanelFits(page, `${at} 직육면체가 안 됨`);
        await fresh(page);
        await buildNet(page, VALID_STRIP);
        await foldIt(page);
        await expectPanelFits(page, `${at} 접힘`);
      }
      await noScroll(page, at);
      expect((await look()).header, `${at}: 판 도중에도 머리 높이는 그대로`).toBeCloseTo(two.header, 1);
    }
  }
  expect(errors).toEqual([]);
});

// ── 접은 직육면체 보기 ─────────────────────────────
test('접은 직육면체 보기: 답하기 전에는 조작판이 없고, 답한 뒤 끌어서 돌리고 0.5~2배. 처음 배율에서는 어느 쪽으로 돌려도 입체가 무대 밖으로 잘리지 않는다(자동 맞춤). 펴면 처음 모습', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '마우스 끌기는 크롬북 화면에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  for (const size of [SIZES.chromebook, SIZES.low]) {
    await page.setViewportSize(size);
    await page.goto(STAGE_URL('cuboid-judge'));
    const questions = questionsFor('cuboid-judge');
    const first = questions.findIndex((q) => q.valid);
    for (const q of questions.slice(0, first)) {
      await answerJudge(page, q);
      await page.locator('.next-btn').click();
    }
    await expect(page.locator('.view-pad')).toBeHidden();
    await expect(page.locator('.band-turn')).toHaveCount(2);
    await expect(foldStage(page)).not.toHaveClass(/can-view/);
    const flat = await page.locator('.net-scene').evaluate((el) => el.style.transform);
    expect(flat).toBe('scale3d(1, 1, 1) rotateX(0deg) rotateZ(0deg)');
    await answerJudge(page, questions[first]);
    await folded(page);
    await expect(page.locator('.view-pad')).toBeVisible();
    await expect(foldStage(page)).toHaveClass(/can-view/);
    /** 입체의 모든 면 꼭짓점이 무대 안에 있나: 무대 밖으로 나간 가장 큰 거리(px) */
    const outside = () => page.evaluate(() => {
      const stage = document.querySelector('.fold-stage').getBoundingClientRect();
      let worst = 0;
      for (const f of document.querySelectorAll('.net-face')) {
        const b = f.getBoundingClientRect();
        worst = Math.max(worst, stage.left - b.left, b.right - stage.right, stage.top - b.top, b.bottom - stage.bottom);
      }
      return Math.round(worst);
    });
    expect(await outside(), `${size.height} 처음 보기`).toBeLessThanOrEqual(0);
    const box = await foldStage(page).boundingBox();
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    // 끌어서 여러 방향으로(가로 · 세로 · 대각선) 돌려도 처음 배율에서는 잘리지 않는다
    for (const [dx, dy] of [[90, 0], [0, 90], [70, 70], [-120, 40], [30, -160], [200, 200]]) {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + dx, cy + dy, { steps: 5 });
      await page.mouse.up();
      expect(await outside(), `${size.height} 끌기 ${dx},${dy}`).toBeLessThanOrEqual(0);
    }
    const turned = await page.locator('.net-scene').evaluate((el) => el.style.transform);
    expect(turned).toContain('rotate3d(');
    // 크게 세 번이면 2배(꺼짐), 처음 보기로
    for (let i = 0; i < 3; i += 1) await page.locator('.view-in').click();
    await expect(page.locator('.view-in')).toBeDisabled();
    await page.locator('.view-home').click();
    await expect(page.locator('.view-home')).toBeDisabled();
    // 펴면 늘 위에서 본 처음 크기
    await page.locator('.fold-toggle').click();
    await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
    await expect.poll(() => page.locator('.net-scene').evaluate((el) => el.style.transform)).toBe(flat);
    await noScroll(page, `${size.height}`);
  }
  expect(errors).toEqual([]);
});

test.describe('직육면체 차시 (움직임 줄이기)', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('접기는 펼침 → 반 접힘 → 다 접힘 장면으로 끝나고, 새 전개도를 찾아도 색종이 0개. 나간 뒤 남는 것이 없다', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await page.goto(STAGE_URL('cuboid-judge'));
    const [q] = questionsFor('cuboid-judge');
    // "반 접힘"은 0.55초 동안만 보이는 장면이다. 누른 뒤에 그 상태를 바로 보려 하면 검사 쪽이 느릴 때(아주 바쁜 컴퓨터) "다 접힘"을 받는다 —
    // 누르기 전부터 data-fold가 지나간 값을 적어 두고, 다 접힌 뒤에 "반 접힘을 거쳐 다 접혔고 접는 움직임(folding)은 없었다"를 본다
    await watchFold(page);
    await page.locator(`.answer-btn:not([data-answer="${q.expected}"])`).click();
    await folded(page);
    const passed = (await page.evaluate(() => window.foldLog)).map((x) => x.fold);
    expect(passed).toContain('half');
    expect(passed).not.toContain('folding');
    expect(passed.indexOf('half')).toBeLessThan(passed.lastIndexOf('done'));
    await page.goto(STAGE_URL('cuboid-free'));
    const board = boardOf(page);
    await buildNet(page, netRects('123-10', board));
    await foldIt(page);
    await expect(page.locator('.found-stamp')).toBeVisible();
    await expect(page.locator('.confetti-piece')).toHaveCount(0);
    await page.getByRole('button', { name: '← 단계 선택' }).click();
    await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
    await page.mouse.move(200, 300);
    await page.mouse.move(260, 340);
    await page.keyboard.press('Control+z');
    expect(errors).toEqual([]);
  });
});

// ── 검토 반영 (review-cuboid M2-1 · M2-2 · M2-3 · M2-5 · M2-6)과 점수 상한 (사용자 결정 2026-10-11) ─────────────────────────────
/**
 * 무대의 글자 요소(띠 이름표 · "✗ 겹쳐요" · 길이 글자 · 면 이름)와 면의 화면 위 네 꼭짓점을 잰다.
 * 요소 안에 크기 없는 점 넷을 잠깐 넣어 그 자리를 읽는다 — 접힌(3D) 면 위의 글자도 기울어진 그대로의 사각형이 나온다.
 * → [{ kind: 'face' | 'tag' | 'mark' | 'len' | 'label', face(면 id), text, quad: [[x, y] × 4], angle(글자가 누운 각도, °), mirrored }]
 * 보이지 않는(visibility: hidden) 글자와 빈 글자는 뺀다. 띠 이름표의 방향은 글자를 담은 안쪽 span으로 잰다(종이 안쪽이 보이는 면에서는 그 span만 뒤집는다)
 */
const stageTexts = (page) => page.evaluate(() => {
  const quadOf = (el) => {
    const cs = getComputedStyle(el);
    const before = el.style.position;
    if (cs.position === 'static') el.style.position = 'relative';
    const [w, h] = [el.offsetWidth, el.offsetHeight];
    const [bw, bh] = [parseFloat(cs.borderLeftWidth) || 0, parseFloat(cs.borderTopWidth) || 0];
    const dots = [[-bw, -bh], [w - bw, -bh], [w - bw, h - bh], [-bw, h - bh]].map(([x, y]) => {
      const dot = document.createElement('i');
      dot.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:0;height:0;`;
      el.append(dot);
      return dot;
    });
    const quad = dots.map((dot) => {
      const b = dot.getBoundingClientRect();
      return [b.left, b.top];
    });
    for (const dot of dots) dot.remove();
    el.style.position = before;
    return quad;
  };
  const out = [];
  const add = (el, kind, face) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || !el.textContent.trim()) return;
    const quad = quadOf(el);
    const inner = kind === 'tag' ? quadOf(el.querySelector('span')) : quad;
    const ux = [inner[1][0] - inner[0][0], inner[1][1] - inner[0][1]];
    const uy = [inner[3][0] - inner[0][0], inner[3][1] - inner[0][1]];
    out.push({ kind, face, text: el.textContent.trim(), quad, angle: Math.round(Math.atan2(ux[1], ux[0]) * 180 / Math.PI), mirrored: ux[0] * uy[1] - ux[1] * uy[0] < 0 });
  };
  for (const f of document.querySelectorAll('.fold-stage .net-face')) {
    const id = f.dataset.face;
    out.push({ kind: 'face', face: id, text: f.dataset.label, quad: quadOf(f), angle: 0, mirrored: false });
    for (const tag of f.querySelectorAll('.edge-tag')) add(tag, 'tag', id);
    add(f.querySelector('.face-mark'), 'mark', id);
    for (const len of f.querySelectorAll('.face-len')) add(len, 'len', id);
    add(f.querySelector('.face-label'), 'label', id);
  }
  return out;
});
/** 두 볼록 사각형이 포개진 넓이(px²) — 다각형 자르기 */
function overlapArea(subject, clipper) {
  const signed = (p) => p.reduce((sum, a, i) => sum + a[0] * p[(i + 1) % p.length][1] - a[1] * p[(i + 1) % p.length][0], 0) / 2;
  const cl = signed(clipper) > 0 ? clipper : clipper.slice().reverse();
  let out = subject;
  for (let i = 0; i < cl.length && out.length > 0; i += 1) {
    const [a, b] = [cl[i], cl[(i + 1) % cl.length]];
    const inside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
    const cut = (p, q) => {
      const [d1, d2] = [[q[0] - p[0], q[1] - p[1]], [b[0] - a[0], b[1] - a[1]]];
      const t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / (d1[0] * d2[1] - d1[1] * d2[0]);
      return [p[0] + t * d1[0], p[1] + t * d1[1]];
    };
    const next = [];
    out.forEach((p, j) => {
      const q = out[(j + 1) % out.length];
      if (inside(p)) {
        next.push(p);
        if (!inside(q)) next.push(cut(p, q));
      } else if (inside(q)) next.push(cut(p, q));
    });
    out = next;
  }
  return out.length >= 3 ? Math.abs(signed(out)) : 0;
}
/**
 * 지금 장면의 표시를 잰다: 읽어야 하는 표시(띠 이름표 · "✗ 겹쳐요")는 거울상이 아니고 거꾸로 서지 않으며(처음 시점에서는 60° 안으로 바로 선다),
 * 같은 면의 길이 글자와 포개지지 않는다. 처음 시점에서는 띠 이름표가 면 이름과도 포개지지 않는다. → { tags, marks }
 */
async function expectMarksReadable(page, label, { first = true } = {}) {
  const list = await stageTexts(page);
  const signs = list.filter((m) => m.kind === 'tag' || m.kind === 'mark');
  for (const m of signs) {
    expect(m.mirrored, `${label}: ${m.text} 거울상`).toBe(false);
    expect(Math.abs(m.angle), `${label}: ${m.text} 누운 각도 ${m.angle}°`).toBeLessThan(first ? 60 : 90);
    for (const other of list.filter((x) => x.face === m.face && (x.kind === 'len' || (first && m.kind === 'tag' && x.kind === 'label')))) {
      expect(overlapArea(m.quad, other.quad), `${label}: ${m.kind} "${m.text}" × ${other.kind} "${other.text}" 포개짐(px²)`).toBeLessThanOrEqual(0.5);
    }
    if (first && m.kind === 'mark') {
      // "✗ 겹쳐요" 띠는 제 면 안에 있다(긴 면을 돌려 세워도 밖으로 나가지 않는다)
      const face = list.find((x) => x.kind === 'face' && x.face === m.face);
      const whole = overlapArea(m.quad, m.quad);
      expect(whole - overlapArea(m.quad, face.quad), `${label}: "${m.text}" 면 밖(px²)`).toBeLessThanOrEqual(Math.max(4, whole * 0.04));
    }
  }
  return { tags: signs.filter((m) => m.kind === 'tag').length, marks: signs.filter((m) => m.kind === 'mark').length };
}
/** 조작판으로 몇 가지 자세를 돌려 보며 표시를 잰다 (끌기와 같은 보기 값을 바꾼다) */
async function expectMarksReadableTurned(page, label) {
  for (const [i, button] of ['view-right', 'view-up', 'view-up', 'view-left', 'view-down', 'view-down', 'view-left', 'view-left'].entries()) {
    await page.locator(`.view-pad .${button}`).click();
    if (i % 2 === 1) await expectMarksReadable(page, `${label} · 돌림 ${i + 1}`, { first: false });
  }
}

test('접은 장면의 표시: 띠 이름표(선분 이름 · 길이)는 화면에서 바로 서고(거울상 0 · 거꾸로 0), "✗ 겹쳐요"와 띠 이름표가 길이 글자와 포개지지 않는다 — 처음 시점과 돌려 본 자세, 판별 · 알맞은 면 · 만나는 선분', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  const seen = { tags: 0, marks: 0 };
  const count = (r) => {
    seen.tags += r.tags;
    seen.marks += r.marks;
  };
  for (const seed of ['1', '5']) {
    // 판별: 틀리게 답하면 까닭 고르기 없이 바로 접어서 보여 준다(되는 전개도는 표시가 없어 접기를 기다리지 않고 넘어간다)
    await page.goto(`${STAGE_URL('cuboid-judge', '', seed)}&fx=low`);
    for (const [i, q] of questionsFor('cuboid-judge', seed).entries()) {
      const at = `판별 시드 ${seed} ${i + 1}번(${q.intended ?? '됨'})`;
      // 답하기 전(펼친 전개도): 띠·이름표가 없다 — 길이 글자는 면마다 둘씩 모두 보인다
      expect((await stageTexts(page)).filter((m) => m.kind === 'len').length, at).toBe(12);
      await expect(page.locator('.edge-tag, .edge-band')).toHaveCount(0);
      await page.locator(`.answer-btn[data-answer="${q.expected === 'yes' ? 'no' : 'yes'}"]`).click();
      if (!q.valid) {
        await folded(page);
        const r = await expectMarksReadable(page, at);
        count(r);
        if (q.intended === 'overlap') {
          expect(r.marks, at).toBeGreaterThanOrEqual(2);
          // "✗ 겹쳐요"가 켜진 면의 길이 글자는 숨는다
          const shown = await page.locator('.net-face.is-overlap .face-len').evaluateAll((els) => els.map((el) => getComputedStyle(el).visibility));
          expect(shown.length, at).toBeGreaterThanOrEqual(4);
          expect(new Set(shown), at).toEqual(new Set(['hidden']));
        } else {
          expect(r.tags, at).toBe(2);
          // 띠 이름표가 붙은 변과 같은 쪽 길이 글자는 숨는다(그 길이는 이름표가 말한다) — 이름표의 글자 = 숨은 길이 글자
          const hidden = await page.locator('.net-face').evaluateAll((faces) => faces.flatMap((f) => [...f.querySelectorAll('.edge-tag')].map((tag) => {
            const len = f.querySelector(f.classList.contains('has-tag-w') ? '.face-len.is-w' : '.face-len.is-h');
            return { tag: tag.textContent, len: len.textContent, visibility: getComputedStyle(len).visibility };
          })));
          for (const h of hidden) expect([h.len, h.visibility], at).toEqual([h.tag, 'hidden']);
        }
        await expectMarksReadableTurned(page, at);
      }
      await page.locator('.next-btn').click();
    }
    // 알맞은 면: 틀린 카드 두 장(길이 하나만 다른 면 · 크기가 다른 면)
    await page.goto(`${STAGE_URL('cuboid-face', '', seed)}&fx=low`);
    const fq = questionsFor('cuboid-face', seed)[0];
    for (const kind of ['length', 'pair']) {
      await placeCard(page, fq, kind);
      const at = `알맞은 면 시드 ${seed} ${kind}`;
      count(await expectMarksReadable(page, at));
      if (kind === 'length') await expectMarksReadableTurned(page, at);
      await page.getByRole('button', { name: '펴고 다시 하기' }).click();
    }
    // 만나는 선분: 맞힌 뒤 두 선분의 이름표
    await page.goto(`${STAGE_URL('cuboid-edge', '', seed)}&fx=low`);
    for (const [i, q] of questionsFor('cuboid-edge', seed).slice(0, 2).entries()) {
      const at = `만나는 선분 시드 ${seed} ${i + 1}번`;
      await expect(page.locator('.edge-tag')).toHaveCount(0); // 답하기 전: 물음의 띠 하나뿐, 이름표 없음
      await pickEdge(page, q.answer);
      await folded(page);
      const r = await expectMarksReadable(page, at);
      expect(r.tags, at).toBe(2);
      count(r);
      expect((await page.locator('.edge-tag').allTextContents()).sort(), at).toEqual([q.segments[q.target].name, q.segments[q.answer].name].sort());
      if (i === 0) await expectMarksReadableTurned(page, at);
      await page.locator('.next-btn').click();
    }
  }
  expect(seen.tags).toBe(2 * (4 + 4 + 4)); // 시드마다: 판별 길이형·크기형 2개씩, 알맞은 면 2개씩 × 2, 만나는 선분 2개씩 × 2
  expect(seen.marks).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});

test('접은 장면의 표시(내 맘대로 직육면체 전개도): 안 되는 모양의 까닭을 고른 뒤 "✗ 겹쳐요"는 제 면 안에서 바로 서고, 길이가 다른 두 변의 이름표도 바로 선다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '놓는 판 12 × 8에서 본다');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(`${STAGE_URL('cuboid-free')}&fx=low`);
  await buildNet(page, BAD.overlap);
  await foldIt(page, 'overlap');
  const overlap = await expectMarksReadable(page, '겹침');
  expect(overlap.marks).toBeGreaterThanOrEqual(2);
  await expectMarksReadableTurned(page, '겹침');
  await fresh(page);
  await buildNet(page, BAD.length);
  await foldIt(page, 'length');
  const length = await expectMarksReadable(page, '길이');
  expect(length.tags).toBe(2);
  expect((await page.locator('.edge-tag').allTextContents()).sort()).toEqual(['1 cm', '2 cm']);
  await expectMarksReadableTurned(page, '길이');
  expect(errors).toEqual([]);
});

test('길이까지 살펴요의 크기형 까닭 문장: 문장이 말한 두 면은 접은 화면에서 실제로 마주 보고(법선이 반대) 크기가 다르다 — 시드 8개 (검토에서 틀렸던 시드 1 · 18 · 20 포함)', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  let checked = 0;
  for (const seed of ['1', '18', '20', '3', '4', '6', '7', '9']) {
    const questions = questionsFor('cuboid-judge', seed);
    await page.goto(`${STAGE_URL('cuboid-judge', '', seed)}&fx=low`);
    for (const [i, q] of questions.entries()) {
      await page.locator(`.answer-btn[data-answer="${q.expected === 'yes' ? 'no' : 'yes'}"]`).click();
      if (q.intended === 'pair') {
        await folded(page); // 다른 문항은 접기를 기다리지 않고 넘어간다
        const said = (await page.locator('.reason .note-text, .reason').first().innerText()).match(/(.) 면은 마주 보는 (.) 면과 크기가 달라요/);
        expect(said, `시드 ${seed} ${i + 1}번 까닭 문장`).not.toBeNull();
        expect([said[1], said[2]], `시드 ${seed} ${i + 1}번`).toEqual([q.changed, q.opposite]);
        // 화면의 두 면: 면의 법선(면 변환 행렬의 z축)이 서로 반대이고, 적힌 크기(가로 × 세로)가 다르다
        const faces = await page.locator('.net-face').evaluateAll((els, names) => names.map((name) => {
          const el = els.find((x) => x.dataset.label === name);
          const m = new DOMMatrixReadOnly(el.style.transform);
          const n = [m.m31, m.m32, m.m33];
          const len = Math.hypot(...n);
          return { normal: n.map((v) => v / len), size: [Number(el.style.getPropertyValue('--fw')), Number(el.style.getPropertyValue('--fh'))].sort((a, b) => a - b).join('×') };
        }), [said[1], said[2]]);
        const dot = faces[0].normal.reduce((sum, v, k) => sum + v * faces[1].normal[k], 0);
        expect(dot, `시드 ${seed} ${i + 1}번: ${said[1]} · ${said[2]} 면의 법선`).toBeLessThan(-0.999);
        expect(faces[0].size, `시드 ${seed} ${i + 1}번: 두 면의 크기`).not.toBe(faces[1].size);
        checked += 1;
      }
      await page.locator('.next-btn').click();
    }
  }
  expect(checked).toBe(8);
  expect(errors).toEqual([]);
});

test('한 차시만 열었을 때의 도감 칩: ?lesson=cube는 지금까지처럼 내 공방 카드에 "도감 0 / 11", 차시 머리에 도감·노트 칩. 차시를 고르지 않은 화면도 그대로다 (?lesson=cuboid는 위 검사)', async ({ page }) => {
  await page.goto(fileUrl(FILE, '?lesson=cube&seed=1&sound=off'));
  await expect(page.locator('.workshop-meta .chip')).toHaveText(['별 0 / 12', '도감 0 / 11', '도장 0 / 12']);
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.head-chips .collection-chip')).toHaveCount(0);
  await expect(page.locator('.lesson-group[data-lesson="cube"] .collection-chip')).toHaveText(['도감 0 / 11', '노트 0 / 24']);
  await expect(page.locator('.lesson-group')).toHaveCount(1);
  // 차시를 고르지 않은 화면: 정육면체 차시의 도감은 그 차시 머리에, 내 공방 카드에는 도감 칩이 그대로 있다
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(page.locator('.workshop-meta')).toContainText('도감 0 / ');
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.lesson-group[data-lesson="cube"] .collection-chip')).toHaveText(['도감 0 / 11', '노트 0 / 24']);
  await expect(page.locator('.lesson-group[data-lesson="cuboid"] .collection-chip')).toHaveCount(0);
});

/** 이 기기에서 찾은 직육면체 전개도를 저장소에 적어 둔다(점수는 그대로) — 여러 가지를 찾아 둔 기기에서 시작하려고 */
async function seedFoundNets(page, ids) {
  await page.evaluate((list) => {
    const key = 'edu:net-workshop:collections';
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}') ?? {};
    saved['cuboid-nets'] = Object.fromEntries(list.map((id, i) => [id, { at: 1000 + i, stage: 'cuboid-free' }]));
    localStorage.setItem(key, JSON.stringify(saved));
  }, ids);
}
const storedNetCount = (page) => page.evaluate(() => Object.keys((JSON.parse(localStorage.getItem('edu:net-workshop:collections')) ?? {})['cuboid-nets'] ?? {}).length);

test('내 맘대로 직육면체 전개도 점수 상한: 이 기기에서 10번째까지는 새 발견 +5 · 만들기 성공 +2, 11번째부터는 새 전개도마다 +1(안내 문장도 그 점수). 새로 고침 · 나가기를 섞어도 10번째의 경계에서 두 번 받거나 못 받지 않는다. 화면 = 저장', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  const board = boardOf(page);
  const ids = freeNets().filter((n) => centerOnBoard(n.net, board)).map((n) => n.id);
  const [tenth, eleventh, twelfth, thirteenth] = ids.slice(30, 34);
  await page.goto(STAGE_URL('cuboid-free'));
  await seedFoundNets(page, ids.slice(0, 9)); // 아홉 가지를 찾아 둔 기기
  await page.reload();
  await expect(page.locator('.found-count')).toHaveText('지금까지 9가지');
  // 10번째: 지금까지처럼 +7. 무대 도장은 "전개도 10가지!"
  await buildNet(page, netRects(tenth, board));
  await foldIt(page);
  await expect(page.locator('.bonus-note')).toHaveText('새 발견 +5 · 만들기 성공 +2');
  await expect(page.locator('.meta-xp b')).toHaveText('+7');
  await expect(page.locator('.found-stamp')).toContainText('10가지!');
  await expect(page.locator('.found-count')).toHaveText('지금까지 10가지');
  expect([await storedXpOf(page), await storedNetCount(page)]).toEqual([7, 10]);
  // 11번째: 모두 합쳐 +1 (만들기 성공 점수도 연속 점수도 없다). 쪽지가 까닭을 말한다
  await fresh(page);
  await buildNet(page, netRects(eleventh, board));
  await foldIt(page);
  await expect(page.locator('.reason .note-title')).toHaveText('새 전개도 발견');
  await expect(page.locator('.bonus-note')).toHaveText('새 발견 +1 · 10가지를 넘으면 새 전개도마다 1점이에요.');
  await expect(page.locator('.meta-xp b')).toHaveText('+8');
  await expect(page.locator('.found-stamp')).toContainText('11가지째');
  expect([await storedXpOf(page), await storedNetCount(page)]).toEqual([8, 11]);
  await noScroll(page, '11번째 전개도');
  if (page.viewportSize().width > 900) await expectPanelFits(page, '11번째 전개도');
  // 판 중간에 새로 고침: 점수와 가지 수가 남고, 12번째도 +1
  await page.reload();
  await expect(page.locator('.rank-chip small')).toHaveText('8점');
  await expect(page.locator('.found-count')).toHaveText('지금까지 11가지');
  await buildNet(page, netRects(twelfth, board));
  await foldIt(page);
  await expect(page.locator('.bonus-note')).toHaveText('새 발견 +1 · 10가지를 넘으면 새 전개도마다 1점이에요.');
  await expect(page.locator('.meta-xp b')).toHaveText('+1');
  expect([await storedXpOf(page), await storedNetCount(page)]).toEqual([9, 12]);
  // [← 단계 선택]으로 나갔다 들어와 10번째 전개도를 다시 만든다(돌려서): 찾아본 전개도라 0점 — 경계의 전개도로 다시 받지 못한다
  await page.getByRole('button', { name: '← 단계 선택' }).click();
  await page.locator('.stage-card', { hasText: '내 맘대로 직육면체 전개도' }).click();
  await buildNet(page, netRects(tenth, board, 5));
  await foldIt(page);
  await expect(page.locator('.bonus-note')).toHaveText('전에 찾은 전개도라 점수는 없어요.');
  await expect(page.locator('.meta-xp b')).toHaveText('+0');
  expect([await storedXpOf(page), await storedNetCount(page)]).toEqual([9, 12]);
  // 13번째를 찾고(+1) 2가지로 끝낸다: 결과의 칸 점수 합 + 단계 점수 = 모은 점수 = 저장
  await fresh(page);
  await buildNet(page, netRects(thirteenth, board));
  await foldIt(page);
  await expect(page.locator('.meta-xp b')).toHaveText('+1');
  await page.locator('.free-finish').click();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 2개');
  const sum = await resultXpSum(page);
  expect([sum.tiles, sum.line, sum.gained]).toEqual([1, 9, 10]);
  await expect(page.locator('.behavior', { hasText: '지금까지 찾은 전개도' })).toContainText('13가지');
  expect([await storedXpOf(page), await storedNetCount(page)]).toEqual([19, 13]); // 7 + 1 + 1 + 0 + 1 + 단계 완료 5 · 별 2개 4
  expect(errors).toEqual([]);
});

test('점수 상한의 경계에서 탭 두 개: 아홉 가지를 찾아 둔 기기를 두 탭에서 열어 섞어 접어도, 저장된 점수는 늘 저장된 가지 수로 정해진다(10가지 = 7점, 그 뒤 한 가지에 1점) — 10번째 점수를 두 번 받지 못한다', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const board = boardOf(page);
  const ids = freeNets().filter((n) => centerOnBoard(n.net, board)).map((n) => n.id);
  const [X, Y, Z] = ids.slice(40, 43).map((id) => netRects(id, board));
  const foldNow = async (p) => {
    await p.bringToFront();
    await p.locator('.free-fold').click();
    await expect(p.locator('.free-result')).toBeVisible();
  };
  const again = async (p) => {
    await p.locator('.free-new').click();
    await expect(p.locator('.rect-tile')).toHaveCount(0);
  };
  /** 저장된 한 쌍: 가지 수 n(9가지에서 시작, 점수 0)이면 점수는 10번째의 7점 + 그 뒤 한 가지에 1점 */
  const expectPair = async (p, nets, label) => {
    const pair = [await storedNetCount(p), await storedXpOf(p)];
    expect(pair, label).toEqual([nets, nets <= 9 ? 0 : 7 + (nets - 10)]);
  };
  const tabA = page;
  await tabA.goto(STAGE_URL('cuboid-free'));
  await seedFoundNets(tabA, ids.slice(0, 9));
  await tabA.reload();
  const tabB = await context.newPage();
  await tabB.goto(STAGE_URL('cuboid-free')); // 두 탭 모두 아홉 가지에서 시작
  await expect(tabB.locator('.found-count')).toHaveText('지금까지 9가지');
  // A가 10번째(X)를 찾는다: +7
  await tabA.bringToFront();
  await buildNet(tabA, X);
  await foldNow(tabA);
  await expect(tabA.locator('.meta-xp b')).toHaveText('+7');
  await expectPair(tabA, 10, 'A: X');
  // B(아직 아홉 가지로 알고 있다)가 다른 전개도(Y)를 찾는다: B에게도 10번째라 +7로 보이지만, 저장은 B의 한 쌍(10가지 · 7점) — 14점이 되지 않는다
  await tabB.bringToFront();
  await buildNet(tabB, Y);
  await foldNow(tabB);
  await expect(tabB.locator('.meta-xp b')).toHaveText('+7');
  await expectPair(tabB, 10, 'B: Y');
  // A가 하나 더(Z): A에게는 11번째라 +1 → 저장은 A의 한 쌍(11가지 · 8점)
  await tabA.bringToFront();
  await again(tabA);
  await buildNet(tabA, Z);
  await foldNow(tabA);
  await expect(tabA.locator('.meta-xp b')).toHaveText('+8');
  await expect(tabA.locator('.bonus-note')).toContainText('새 발견 +1');
  await expectPair(tabA, 11, 'A: Z');
  // B도 Z를: B에게도 11번째 +1 → 저장은 B의 한 쌍(11가지 · 8점)
  await tabB.bringToFront();
  await again(tabB);
  await buildNet(tabB, Z);
  await foldNow(tabB);
  await expect(tabB.locator('.meta-xp b')).toHaveText('+8');
  await expectPair(tabB, 11, 'B: Z');
  // 새 탭: 저장된 것(B의 한 쌍)에 없는 X는 12번째라 +1뿐이다 — 10번째의 7점을 다시 받지 못한다
  const tabC = await context.newPage();
  await tabC.goto(STAGE_URL('cuboid-free'));
  await expect(tabC.locator('.rank-chip small')).toHaveText('8점');
  await expect(tabC.locator('.found-count')).toHaveText('지금까지 11가지');
  await buildNet(tabC, X);
  await foldNow(tabC);
  await expect(tabC.locator('.meta-xp b')).toHaveText('+1');
  await expectPair(tabC, 12, 'C: X');
  await again(tabC);
  await buildNet(tabC, Y);
  await foldNow(tabC);
  await expect(tabC.locator('.meta-xp b')).toHaveText('+1'); // 저장된 것에 있던 전개도: 0점
  await expectPair(tabC, 12, 'C: Y');
  expect(errors).toEqual([]);
});

test('힌트 그림자는 이 기기에서 아직 찾지 않은 전개도다: 가장 작은 전개도를 찾아 둔 기기에서는 그다음 전개도의 자리가 점선으로 보인다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '놓는 판 12 × 8에서 본다');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  const board = boardOf(page);
  const first = cuboidHintNet(new Set(), board);
  const next = cuboidHintNet(new Set(), board, new Set([first.id]));
  expect(next.id).not.toBe(first.id);
  await page.goto(STAGE_URL('cuboid-free'));
  await seedFoundNets(page, [first.id]);
  await page.reload();
  await expect(page.locator('.found-count')).toHaveText('지금까지 1가지');
  // 안 되는 모양을 연달아 2번 접으면 힌트가 켜진다(글 → 그림자)
  await buildNet(page, BAD.overlap);
  await foldIt(page, 'skip');
  await fresh(page);
  await buildNet(page, BAD.length);
  await foldIt(page, 'skip');
  await fresh(page);
  await page.locator('.tool-hint').click();
  await page.locator('.tool-hint').click();
  const shadow = await page.locator('.rect-shadow').evaluateAll((els) => els.map((el) => ['x', 'y', 'w', 'h'].map((k) => Number(el.style.getPropertyValue(`--${k}`))).join(',')).sort());
  const want = (net) => centerOnBoard(net.net, board).map((r) => [r.x, r.y, r.w, r.h].join(',')).sort();
  expect(shadow).toEqual(want(next));
  expect(shadow).not.toEqual(want(first));
  expect(errors).toEqual([]);
});
