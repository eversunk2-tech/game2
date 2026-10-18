/**
 * 쌓기나무 5차시(층별로 나타내기)·도전(더 붙여서 만들기)·쌓기나무 도장 셋(S3) 브라우저 검사.
 * 기획서: docs/games/net-workshop/spec-grade6.md 2-4·3·4·5·8·9절, 공통 규칙: common-rules.md
 * 정답은 게임과 같은 시드로 blocks-logic.js를 불러 계산한다(DOM에 정답을 숨겨 두지 않는다).
 * 글자 폭에 기대는 픽셀 상수는 쓰지 않는다(글꼴 흉내 모드 E2E_WIDE_TEXT=font에서도 통과해야 한다).
 * 크기·자리·겹침은 움직임이 끝난 뒤에(calm) 잰다. 몇 초 뒤 사라지는 알림은 띄운 조작 바로 뒤에 본다. 정해 둔 시간으로 기다리지 않는다.
 * 혼자 돌려 3초 넘게 걸리는 검사에는 시간 예산(test.setTimeout)을 적는다(CPU 4배 느리게 한 실행에서 걸린 시간의 3배 이상).
 */
import { expect, test } from '@playwright/test';
import { createRng } from '../../src/shared/core/random.js';
import { boardShifts, count, mapKey, within } from '../../src/games/net-workshop/blocks/blocks.js';
import { BLOCK_HOW_TO, BLOCK_LESSONS, BLOCK_STAGES, makeBlockQuestions, mirrorMap, spotName } from '../../src/games/net-workshop/blocks/blocks-logic.js';
import { collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

const FILE = 'net-workshop.html';
const stageOf = (id) => BLOCK_STAGES.find((s) => s.id === id);
/** 게임과 같은 시드 문자열(<seed>:<단계 id>)로 같은 문항을 만든다 */
const questionsFor = (id, seed = 1) => makeBlockQuestions(stageOf(id), createRng(`${seed}:${id}`));
const open = async (page, stageId, { seed = 1, extra = '' } = {}) => {
  await page.goto(fileUrl(FILE, `?unlock=all&seed=${seed}&sound=off&stage=${stageId}${extra}`));
  await page.locator('.play-area > *').first().waitFor({ state: 'attached' });
};
const isTouch = (testInfo) => testInfo.project.name === 'tablet';
const press = (testInfo, locator) => (isTouch(testInfo) ? locator.tap() : locator.click());

const stageEl = (page) => page.locator('.blk-stage');
const cell = (page, x, y) => page.locator(`.blk-cell[data-x="${x}"][data-y="${y}"]`);
const pcell = (page, name, r, c) => page.locator(`.blk-paint[data-kind="${name}"] .blk-pcell[data-r="${r}"][data-c="${c}"]`);
const ncell = (page, x, y) => page.locator(`.blk-ncell[data-x="${x}"][data-y="${y}"]`);
const option = (page, i) => page.locator(`.blk-add-option[data-answer="${i}"]`);
const next = (testInfo, page) => press(testInfo, page.locator('.next-btn:not([hidden])'));
const check = (testInfo, page) => press(testInfo, page.locator('.blk-check'));

/** 화면의 움직임이 모두 끝날 때까지 기다린다(끝이 있는 CSS 애니메이션·전환 + 무대의 돌아가는 움직임) — 크기·자리를 재기 전에 */
const calm = (page) => page.waitForFunction(() => {
  const moving = document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity));
  return !moving && !document.querySelector('.blk-stage.is-easing');
});
/** "위에서 본 판"에 적힌 내 쌓기 */
const padMap = (page) => page.evaluate(() => {
  const map = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const c of document.querySelectorAll('.blk-cell')) map[Number(c.dataset.y)][Number(c.dataset.x)] = Number(c.textContent || 0);
  return map;
});
/** "위에서 본 판"을 눌러 그 높이 지도를 쌓는다 (지금 판이 비어 있지 않으면 먼저 치운다) */
async function padBuild(page, testInfo, map) {
  if (await page.locator('.blk-clear').isEnabled()) await press(testInfo, page.locator('.blk-clear'));
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) for (let k = 0; k < map[y][x]; k += 1) await press(testInfo, cell(page, x, y));
  expect(await padMap(page)).toEqual(map);
}
/** 지금 판에서 더하기만 해서 그 높이 지도로 */
async function padGrow(page, testInfo, map) {
  const now = await padMap(page);
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) for (let k = now[y][x]; k < map[y][x]; k += 1) await press(testInfo, cell(page, x, y));
  expect(await padMap(page)).toEqual(map);
}
const paintedOf = (page, name) => page.locator(`.blk-paint[data-kind="${name}"] .blk-pcell`).evaluateAll((els) => {
  const g = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const el of els) g[Number(el.dataset.r)][Number(el.dataset.c)] = el.getAttribute('aria-selected') === 'true' ? 1 : 0;
  return g;
});
async function paint(page, testInfo, name, cells) {
  const now = await paintedOf(page, name);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) if (Boolean(now[r][c]) !== Boolean(cells[r][c])) await press(testInfo, pcell(page, name, r, c));
  expect(await paintedOf(page, name)).toEqual(cells.map((row) => row.map((v) => (v ? 1 : 0))));
}
const numbersOf = (page) => page.locator('.blk-ncell[data-x]').evaluateAll((els) => {
  const g = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const el of els) g[Number(el.dataset.y)][Number(el.dataset.x)] = Number(el.textContent || 0);
  return g;
});
async function writeByPress(page, testInfo, numbers) {
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (!numbers[y][x]) continue;
      const now = (await numbersOf(page))[y][x];
      const presses = now === 0 ? numbers[y][x] : (numbers[y][x] - now + 3) % 3;
      for (let k = 0; k < presses; k += 1) await press(testInfo, ncell(page, x, y));
    }
  }
  expect(await numbersOf(page)).toEqual(numbers);
}
/** 만들 수 있는 첫 보기를, 판에 놓인 처음 모양(q.base) 자리에서 붙이기만 해서 만든 높이 지도 */
const builtAnswer = (q, k = 0) => boardShifts(q.options[q.answers[k] - 1].map).find((s) => within(q.base, s));

async function noScroll(page, label = '') {
  const over = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(over, `세로 스크롤 ${label}`).toBeLessThanOrEqual(0);
  expect(await hasHorizontalScroll(page), `가로 스크롤 ${label}`).toBe(false);
}
/** 작업 지시서 안쪽이 넘치지 않고, 매트·판의 보이는 버튼이 잘리지 않으며 48px 이상이다 */
async function expectFits(page, label = '') {
  const m = await page.evaluate(() => {
    const panel = document.querySelector('.blk-panel');
    const mat = document.querySelector('.blk-mat');
    const inside = (host, b) => {
      const h = host.getBoundingClientRect();
      const r = b.getBoundingClientRect();
      return Math.round(Math.max(0, r.bottom - h.bottom, h.top - r.top, r.right - h.right, h.left - r.left));
    };
    const buttons = [...panel.querySelectorAll('button')].map((b) => [panel, b]).concat([...mat.querySelectorAll('button')].map((b) => [mat, b]))
      .filter(([, b]) => b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden')
      .map(([host, b]) => {
        const r = b.getBoundingClientRect();
        return { name: (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 14), w: Math.round(r.width), h: Math.round(r.height), cut: inside(host, b) };
      });
    return {
      over: panel.scrollHeight - panel.clientHeight,
      small: buttons.filter((b) => b.h < 48 || b.w < 48).map((b) => `${b.name} ${b.w}×${b.h}`),
      cut: buttons.filter((b) => b.cut > 0).map((b) => `${b.name} ${b.cut}px`),
      buttons: buttons.length,
    };
  });
  expect({ over: m.over, small: m.small, cut: m.cut }, label).toEqual({ over: 0, small: [], cut: [] });
  expect(m.buttons, label).toBeGreaterThan(0);
}
/** 매트 위의 조작 칸들이 서로 겹치지 않는다 */
async function expectNoOverlap(page, label = '') {
  const hits = await page.evaluate(() => {
    const parts = [...document.querySelectorAll('.blk-mat > .blk-dirs, .blk-mat > .blk-padbox, .blk-mat > .view-pad, .blk-mat > .blk-card, .blk-mat > .blk-key, .blk-mat > .blk-tools, .blk-mat > .blk-tag')]
      .filter((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0 && el.childElementCount > 0)
      .map((el) => {
        // 쌓기 도구 띠는 보이는 버튼이 차지한 자리만(예상하기 전에는 자리만 두고 비워 둔다)
        if (!el.classList.contains('blk-tools')) return [el, el.getBoundingClientRect()];
        const kids = [...el.children].filter((k) => k.getClientRects().length > 0 && getComputedStyle(k).visibility !== 'hidden').map((k) => k.getBoundingClientRect());
        if (!kids.length) return null;
        return [el, { left: Math.min(...kids.map((r) => r.left)), right: Math.max(...kids.map((r) => r.right)), top: Math.min(...kids.map((r) => r.top)), bottom: Math.max(...kids.map((r) => r.bottom)) }];
      })
      .filter(Boolean);
    const out = [];
    for (let i = 0; i < parts.length; i += 1) {
      for (let j = i + 1; j < parts.length; j += 1) {
        const a = parts[i][1];
        const b = parts[j][1];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 0.5 && h > 0.5) out.push(`${parts[i][0].className.split(' ')[0]} × ${parts[j][0].className.split(' ').slice(0, 2).join('.')} ${Math.round(w)}×${Math.round(h)}`);
      }
    }
    return out;
  });
  expect(hits, label).toEqual([]);
}
/** 지금 보이는 알림(토스트)이 매트·판의 버튼과 겹치지 않는다 — 띄운 조작 바로 뒤에 부른다 */
async function expectToastClear(page, label = '') {
  await expect(page.locator('.toast')).toBeVisible();
  await calm(page);
  const hits = await page.evaluate(() => {
    const t = document.querySelector('.toast').getBoundingClientRect();
    const out = [];
    for (const el of document.querySelectorAll('.topbar button, .play-header button, .blk-mat button, .blk-panel button')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden') continue;
      const w = Math.min(t.right, b.right) - Math.max(t.left, b.left);
      const h = Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top);
      if (w > 0 && h > 0) out.push(`${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 12)} ${Math.round(w)}×${Math.round(h)}`);
    }
    return out;
  });
  expect(hits, label).toEqual([]);
}
const resultXp = (page) => page.evaluate(() => {
  const sum = (texts) => texts.flatMap((t) => t.match(/\+\d+/g) ?? []).reduce((total, x) => total + Number(x), 0);
  return {
    tiles: sum([...document.querySelectorAll('.behavior .b-xp')].map((el) => el.textContent)),
    line: sum([document.querySelector('.xp-line').textContent]),
    gained: Number(document.querySelector('.rank-card .xp-gain').textContent.replace(/\D/g, '')),
    saved: JSON.parse(localStorage.getItem('edu:net-workshop:rewards') ?? '{}').xp ?? 0,
  };
});
const liveText = (page) => page.evaluate(() => [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')].map((el) => el.textContent.trim()).filter(Boolean).join(' | '));
const shapePoints = (page) => page.evaluate(() => [...document.querySelectorAll('.blk-stage polygon')].map((p) => p.getAttribute('points')).join('|'));
async function pokeStage(page) {
  const box = await stageEl(page).boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 40, { steps: 6 });
  await page.mouse.up();
  await page.mouse.wheel(0, -300);
  await stageEl(page).focus().catch(() => {});
  for (const key of ['ArrowLeft', 'ArrowUp', '+', '1', '2', '3', '0']) await page.keyboard.press(key);
}

// ── 문항 하나 풀기 ────────────────────────
async function solveLayerDraw(page, testInfo, q) {
  await paint(page, testInfo, 'layer2', q.layers[1]);
  await paint(page, testInfo, 'layer3', q.layers[2]);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
}
async function solveLayerBuild(page, testInfo, q) {
  await padBuild(page, testInfo, q.target);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
}
async function solveLayerViews(page, testInfo, q) {
  if (q.kind === 'paint') {
    await paint(page, testInfo, q.kinds[0], q.views[q.kinds[0]]);
    await check(testInfo, page);
  } else await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected}"]`));
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
}
async function solveAdd(page, testInfo, q) {
  for (const i of q.answers) await press(testInfo, option(page, i));
  await press(testInfo, page.locator('.blk-add-submit'));
  await expect(page.locator('.reason')).toContainText('맞아요!');
  const built = builtAnswer(q);
  await padGrow(page, testInfo, built);
  await check(testInfo, page);
  await expect(page.locator('.blk-ncell[data-x]').first()).toBeVisible();
  await writeByPress(page, testInfo, built);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
}

// ── 차시 흐름 ─────────────────────────────
test('5차시(?lesson=blocks-layer): 층별 모양 그리기 → 층별 모양을 보고 쌓기 → 층별 모양만 보고 알아내기를 마치면 도전 주문서 "더 붙여서 만들기"가 열리고, 도전 성공까지', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?lesson=blocks-layer&stage=blocks-layer-draw&seed=1&sound=off'));
  await expect(page.locator('.order-kind')).toHaveText('기록 주문');
  for (const q of questionsFor('blocks-layer-draw')) await solveLayerDraw(page, testInfo, q);
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.getByText('3번 중 3번 맞힘')).toBeVisible();
  // 처음에 맞힘 2 × 3 + 연속 3 +1, 단계 완료 5 + 별 6
  expect(await resultXp(page)).toEqual({ tiles: 7, line: 11, gained: 18, saved: 18 });

  await page.getByRole('button', { name: '다음 단계' }).click();
  await expect(page.locator('.order-kind')).toHaveText('설계 주문');
  for (const q of questionsFor('blocks-layer-build')) await solveLayerBuild(page, testInfo, q);
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  expect(await resultXp(page)).toEqual({ tiles: 7, line: 11, gained: 18, saved: 36 });
  // 층층이 쌓기: 첫 [확인하기]에 세 번 맞혔다
  await expect(page.locator('.new-badge-list li')).toContainText([/층층이 쌓기/]);

  await page.getByRole('button', { name: '다음 단계' }).click();
  await expect(page.locator('.order-kind')).toHaveText('추리 주문');
  for (const q of questionsFor('blocks-layer-views')) await solveLayerViews(page, testInfo, q);
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  expect(await resultXp(page)).toEqual({ tiles: 7, line: 11, gained: 18, saved: 54 });

  // 도전 주문서: 차시의 세 단계를 마쳐 열렸다 — 별 합계(9)에 넣지 않는다
  await page.goto(fileUrl(FILE, '?lesson=blocks-layer&seed=1&sound=off'));
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.stage-path .stage-card .stage-title')).toHaveText(['층별 모양 그리기', '층별 모양을 보고 쌓기', '층별 모양만 보고 알아내기']);
  const challenge = page.locator('.challenge-card');
  await expect(challenge).toHaveCount(1);
  await expect(challenge.locator('.stage-title')).toHaveText('더 붙여서 만들기');
  await expect(challenge).toBeEnabled();
  await expect(page.getByText('모은 별 9 / 9')).toBeVisible();
  await challenge.click();
  await expect(page.locator('.order-kind')).toHaveText('증축 주문');
  await expect(page.getByRole('button', { name: '시간 재기' })).toBeVisible();
  for (const q of questionsFor('blocks-add')) await solveAdd(page, testInfo, q);
  await expect(page.getByRole('heading', { name: '도전 성공!' })).toBeVisible();
  await expect(page.locator('.cert-eyebrow')).toHaveText('도전 주문서 · 더 붙여서 만들기');
  await expect(page.getByText('9번 중 9번 맞힘')).toBeVisible();
  // 답 9개 처음에 맞힘(18 + 연속 3) + 도전 성공 10 + 별 6
  expect(await resultXp(page)).toEqual({ tiles: 21, line: 16, gained: 37, saved: 91 });
  await expect(page.locator('.xp-line')).toContainText('도전 성공 +10');
  await expect(page.locator('.result-stats')).not.toContainText('걸린 시간'); // 시간 재기를 켜지 않았다
  expect(errors).toEqual([]);
});

test('단계 지도: 쌓기나무 영역에 5차시가 4차시 뒤에 보이고(차시 칩·시간·단원), 도전 주문서는 세 단계를 마치기 전에는 잠겨 있다. 영역 카드는 "차시 5개", 놀이 방법에 층별 모양·도전 줄', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=blocks'));
  await expect(page.getByRole('tab', { name: '쌓기나무' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.lesson-group h3')).toHaveText(BLOCK_LESSONS.map((l) => l.title));
  const group = page.locator('.lesson-group[data-lesson="blocks-layer"]');
  await expect(group.locator('.lesson-no')).toHaveText('5차시');
  await expect(group.locator('.lesson-note')).toHaveText('6학년 2학기 · 공간과 입체');
  await expect(group.locator('.lesson-chips .chip').filter({ hasText: /^약/ })).toHaveText('약 9분');
  await expect(group.locator('.stage-path .stage-card .stage-title')).toHaveText(['층별 모양 그리기', '층별 모양을 보고 쌓기', '층별 모양만 보고 알아내기']);
  await expect(group.locator('.stage-path .stage-thumb svg')).toHaveCount(3);
  await expect(group.locator('.stage-path .stage-card').nth(0)).toBeEnabled();
  await expect(group.locator('.stage-path .stage-card').nth(1)).toBeDisabled();
  await expect(group.locator('.challenge-card')).toBeDisabled();
  await expect(group.locator('.challenge-card')).toContainText('차시를 마치면 열려요');
  await expect(group.locator('.challenge-card')).toContainText('더 붙여서 만들 수 있는 모양을 모두 찾아요.');
  // 별 합계: 다섯 차시 × 세 단계 × 별 3(도전은 빼고)
  await expect(page.locator('.star-total')).toHaveText(`모은 별 0 / ${BLOCK_STAGES.filter((s) => !s.challenge).length * 3}`);
  expect(BLOCK_STAGES.filter((s) => !s.challenge).length).toBe(15);
  // 놀이 방법: 영역의 줄 그대로(끝 두 줄은 쌓기·돌려 보기)
  await page.getByRole('button', { name: '놀이 방법' }).click();
  const lines = await page.locator('.howto-list li').evaluateAll((els) => els.map((el) => el.lastElementChild.textContent));
  expect(lines).toEqual(BLOCK_HOW_TO);
  expect(await hasHorizontalScroll(page)).toBe(false);
  // 학년 화면의 영역 카드: 차시 5개
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&grade=6'));
  await expect(page.locator('.area-card[data-area="blocks"]')).toHaveAccessibleName(/^쌓기나무, 6학년 2학기 · 공간과 입체, 차시 5개, 모은 별 0 \/ 45/);
  // ?lesson=blocks-layer: 그 차시만, 칩은 "쌓기나무 5차시"
  await page.goto(fileUrl(FILE, '?lesson=blocks-layer&seed=1&sound=off'));
  await expect(page.locator('.eyebrow')).toHaveText('층별로 나타내기');
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.lesson-no')).toHaveText(['쌓기나무 5차시']);
  expect(errors).toEqual([]);
});

// ── 정답 노출 ─────────────────────────────
test('정답 노출 0 (층별 모양 그리기): 돌려 볼 수 있지만 답하기 전에는 면에 자리 값(높이)·층 색·층 숫자·층별로 벌려 보기가 없다. 문항이 달라도 화면의 틀이 같다. [확인하기] 뒤에 층별로 벌어진다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const frames = new Set();
  for (const seed of [1, 2, 3]) {
    await open(page, 'blocks-layer-draw', { seed });
    for (const q of questionsFor('blocks-layer-draw', seed)) {
      const stage = stageEl(page);
      await expect(stage).toHaveClass(/can-view/);
      await expect(stage).not.toHaveClass(/is-frozen|is-layered|is-apart/);
      await expect(page.locator('.view-pad')).toBeVisible();
      await expect(page.locator('.blk-dirs')).toBeVisible();
      const bare = async () => {
        expect(await page.locator('.blk-stage [data-x], .blk-stage [data-z], .blk-stage .blk-face-num, .blk-stage .blk-layer, .blk-stage .blk-over').count()).toBe(0);
        expect(await stage.getAttribute('data-count')).toBeNull();
      };
      await bare();
      await expect(page.locator('.blk-apart')).toBeHidden();
      // 돌려 보고 위에서 보아도 높이는 실리지 않는다
      await pokeStage(page); // 끌고·굴리고·방향키·1 2 3, 끝은 0(처음 보기로)
      await calm(page);
      await bare();
      await expect(page.locator('.is-diff, .blk-x, .reason')).toHaveCount(0);
      expect(await liveText(page)).not.toMatch(/\d층에|맞|틀/);
      // 1층 모양(주어진 그림)과 빈 모눈 둘
      await expect(page.locator('.blk-floor-fig .blk-grid-pic')).toHaveAttribute('aria-label', /^1층 모양: 쌓인 자리는 /);
      for (const name of ['layer2', 'layer3']) expect((await paintedOf(page, name)).flat().every((v) => v === 0)).toBe(true);
      frames.add(await page.evaluate(() => JSON.stringify({
        unit: document.querySelector('.blk-stage').style.getPropertyValue('--blk-unit'),
        stage: document.querySelector('.blk-stage').className,
        label: document.querySelector('.blk-stage').getAttribute('aria-label'),
        boxes: [...document.querySelectorAll('.blk-mat > .blk-padbox')].map((b) => `${b.className}|${b.hidden}|${b.querySelector('.blk-paint')?.dataset.kind}`),
        band: [...document.querySelectorAll('.blk-mat > .blk-tools > *')].map((b) => `${b.className}|${b.hidden}`),
      })));
      // 답하면: 층마다 다른 색과 층 숫자로 층별로 벌어지고, 자리 값이 실린다
      await paint(page, testInfo, 'layer2', q.layers[1]);
      await paint(page, testInfo, 'layer3', q.layers[2]);
      await check(testInfo, page);
      await expect(stage).toHaveClass(/is-layered/);
      await expect(stage).toHaveClass(/is-apart/);
      await calm(page);
      expect(await page.locator('.blk-stage .blk-face-num').count()).toBeGreaterThanOrEqual(count(q.target) - 2);
      expect(await page.locator('.blk-stage [data-x]').count()).toBeGreaterThan(0);
      await expect(page.locator('.blk-apart')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.blk-stage .blk-over.is-ok')).toHaveCount(q.layers[1].flat().filter(Boolean).length + q.layers[2].flat().filter(Boolean).length);
      await next(testInfo, page);
    }
  }
  expect(frames.size).toBe(1);
  expect(errors).toEqual([]);
});

test('정답 노출 0 (층별 모양만 보고 · 층별 모양을 보고 쌓기): 답하기 전에는 입체가 없고(층별 모양 셋만), 쌓는 단계는 [확인하기] 전에 견준 표시가 없다', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-layer-views');
  for (const q of questionsFor('blocks-layer-views')) {
    await expect(stageEl(page)).toHaveCount(0);
    await expect(page.locator('.view-pad')).toBeHidden();
    await expect(page.locator('.blk-mat > .blk-card')).toBeHidden();
    const pics = page.locator('.blk-layer-plan .blk-grid-pic');
    await expect(pics).toHaveCount(3);
    expect(await pics.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label').split(':')[0]))).toEqual(['1층 모양', '2층 모양', '3층 모양']);
    expect(await liveText(page)).not.toMatch(/맞|틀|모두 \d+개/);
    await solveLayerViews(page, testInfo, q);
  }
  await expect(page.locator('.result-title')).toBeVisible();
  await open(page, 'blocks-layer-build');
  const [q] = questionsFor('blocks-layer-build');
  const given = () => page.evaluate(() => [...document.querySelectorAll('.blk-given svg')].map((s) => s.outerHTML).join(''));
  const start = await given();
  await padBuild(page, testInfo, mirrorMap(q.target));
  await expect(page.locator('.is-diff, .blk-x, .blk-grid-diff, .blk-over, .reason, .blk-face-num, .blk-hint:visible')).toHaveCount(0);
  expect(await given()).toBe(start);
  expect(await liveText(page)).not.toMatch(/맞|틀|달라|같아/);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('뒤집혔어요');
  await expect(page.locator('.blk-grid-diff').first()).toBeVisible();
  // 고치기 시작하면 표시가 사라진다
  await press(testInfo, page.locator('.blk-clear'));
  await expect(page.locator('.blk-grid-diff')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('정답 노출 0 (더 붙여서 만들기): 예상하기 전에는 처음 모양이 멈춘 그림(판·자리 값 없음)이고 내 판(위에서 본 판·쌓기 도구)과 판정 글이 없다. 문항이 달라도 화면의 틀이 같고, 만들 수 있는 보기의 자리는 여러 곳', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const frames = new Set();
  const spots = new Set();
  const sizes = new Set();
  for (const seed of [1, 2, 3]) {
    await open(page, 'blocks-add', { seed });
    for (const q of questionsFor('blocks-add', seed)) {
      const stage = stageEl(page);
      await expect(stage).toHaveClass(/is-frozen/);
      expect(await page.locator('.blk-stage .blk-tile, .blk-stage [data-x], .blk-stage .blk-face-num').count()).toBe(0);
      await expect(page.locator('.blk-stage .blk-edge')).toHaveText(['앞', '옆']);
      await expect(page.locator('.blk-mat > .blk-padbox')).toBeHidden();
      await expect(page.locator('.blk-dirs')).toBeHidden();
      await expect(page.locator('.view-pad')).toBeHidden();
      expect(await page.locator('.blk-tools > *').evaluateAll((els) => els.filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden').length)).toBe(0);
      const before = await shapePoints(page);
      await pokeStage(page);
      expect(await shapePoints(page)).toBe(before);
      await expect(page.locator('.blk-verdict, .blk-face.is-added, .reason')).toHaveCount(0);
      const opts = page.locator('.blk-add-option');
      await expect(opts).toHaveCount(4);
      expect(await opts.evaluateAll((els) => els.map((el) => el.getAttribute('aria-pressed')))).toEqual(['false', 'false', 'false', 'false']);
      // 보기 그림의 이름은 번호뿐(판정을 싣지 않는다)
      expect(await opts.locator('.blk-picture').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual(['1번 모양 그림', '2번 모양 그림', '3번 모양 그림', '4번 모양 그림']);
      expect(await liveText(page)).not.toMatch(/돼요|맞|틀/);
      for (const i of q.answers) spots.add(i);
      sizes.add(q.answers.length);
      frames.add(await page.evaluate(() => JSON.stringify({
        stage: document.querySelector('.blk-stage').className,
        label: document.querySelector('.blk-stage').getAttribute('aria-label'),
        edges: [...document.querySelectorAll('.blk-stage .blk-edge')].map((g) => `${g.textContent}@${g.getAttribute('transform')}`),
        options: [...document.querySelectorAll('.blk-add-option')].map((b) => `${b.className}|${b.disabled}|${b.querySelector('.blk-picture').getAttribute('viewBox')}`),
        submit: document.querySelector('.blk-add-submit').hidden,
      })));
      await solveAdd(page, testInfo, q);
    }
  }
  expect(frames.size).toBe(1);
  expect([...spots].sort()).toEqual([1, 2, 3, 4]);
  expect(sizes.size).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

// ── 틀린 답·힌트·별 ──────────────────────────
test('층별 모양 그리기: 틀린 [확인하기]도 기록되고(고치지 않고 또 누르면 다시 세지 않는다) 벌어진 층에 내 그림을 겹쳐 ✗, 두 번 틀리면 힌트. 아래층이 빈 자리에 칠하면 "위층은 아래층 위에"', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-layer-draw');
  const [q1, q2, q3] = questionsFor('blocks-layer-draw');
  // 빈 모눈: 기록하지 않고 안내만
  await check(testInfo, page);
  await expect(page.locator('.toast')).toContainText('2층 모양을 먼저 칠해요.');
  await expect(page.locator('.reason')).toHaveCount(0);
  await expect(stageEl(page)).not.toHaveClass(/is-layered/);
  // 2층에 1층 모양을 칠함 → 그 층까지 쌓인 자리만
  await paint(page, testInfo, 'layer2', q1.layers[0]);
  await paint(page, testInfo, 'layer3', q1.layers[2]);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('2층 모양에는 2층까지 쌓인 자리만 칠해요.');
  await expect(stageEl(page)).toHaveClass(/is-apart/);
  await calm(page);
  const extra = q1.layers[0].flat().filter(Boolean).length - q1.layers[1].flat().filter(Boolean).length;
  await expect(page.locator('.blk-stage .blk-over.is-extra')).toHaveCount(extra);
  await expect(page.locator('.blk-stage .blk-over-chip')).toHaveText('여기가 달라요');
  await expect(page.locator('.blk-paint[data-kind="layer2"] .blk-pcell.is-diff')).toHaveCount(extra);
  await expect(page.locator('.blk-hint')).toBeHidden();
  for (let i = 0; i < 2; i += 1) {
    await check(testInfo, page);
    await expect(page.locator('.toast')).toContainText('이미 확인한');
  }
  await expect(page.locator('.blk-hint')).toBeHidden();
  // 고치면 표시가 사라진다 → 3층 모양을 1층 바깥(아래층이 빈 자리)에 칠해 두 번째로 틀림 → 힌트
  const empty1 = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((i) => !q1.layers[0][Math.floor(i / 3)][i % 3]);
  await paint(page, testInfo, 'layer2', q1.layers[1]);
  await expect(page.locator('.blk-pcell.is-diff, .blk-stage .blk-over')).toHaveCount(0);
  const floating = q1.layers[2].map((row) => [...row]);
  floating[Math.floor(empty1 / 3)][empty1 % 3] = 1;
  await paint(page, testInfo, 'layer3', floating);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('아래층이 비어 있으면 위층에 놓을 수 없어요.');
  await expect(page.locator('.blk-hint')).toBeVisible();
  await press(testInfo, page.locator('.blk-hint'));
  await expect(page.locator('.blk-hint-text')).toContainText(spotName(empty1 % 3, Math.floor(empty1 / 3)));
  await paint(page, testInfo, 'layer3', q1.layers[2]);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await expect(page.locator('.blk-paint .blk-pcell').first()).toBeDisabled();
  // 맞힌 뒤: 쌓기나무를 누르면 그 자리의 개수 · [다시 모으기]
  await press(testInfo, page.locator('.blk-apart'));
  await expect(stageEl(page)).not.toHaveClass(/is-apart/);
  await next(testInfo, page);
  await solveLayerDraw(page, testInfo, q2);
  await solveLayerDraw(page, testInfo, q3);
  // 3문항을 맞힐 때까지: 두 번 틀려 5번 중 3번(60%) → ★1 — 정답률 그대로
  await expect(page.getByText('5번 중 3번 맞힘')).toBeVisible();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 1개');
  expect(errors).toEqual([]);
});

test('층별 모양을 보고 쌓기: 틀리면 다른 층 그림에 ✗(같은 층은 ✓), 두 번 틀리면 힌트(그 자리 표시), 맞히면 내 쌓기가 층별로 벌어진다', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-layer-build');
  const [q] = questionsFor('blocks-layer-build');
  // 1층만 맞게(위층은 빼고): 1층 그림에 ✓, 2·3층 그림에 ✗
  await padBuild(page, testInfo, q.target.map((row) => row.map((v) => (v ? 1 : 0))));
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('1층은 맞아요.');
  await expect(page.locator('.blk-view-fig').nth(0)).toContainText('✓');
  await expect(page.locator('.blk-view-fig').nth(1).locator('.blk-grid-diff').first()).toBeVisible();
  await check(testInfo, page);
  await expect(page.locator('.toast')).toContainText('이미 확인한');
  await expect(page.locator('.blk-hint')).toBeHidden();
  await padBuild(page, testInfo, mirrorMap(q.target));
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('왼쪽과 오른쪽이 뒤집혔어요.');
  await press(testInfo, page.locator('.blk-hint'));
  await expect(page.locator('.blk-hint-text')).toContainText('자리에는 쌓기나무가');
  await expect(page.locator('.blk-grid-mark')).toHaveCount(3);
  await padBuild(page, testInfo, q.target);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요! 층별 모양대로 쌓았어요.');
  await expect(stageEl(page)).toHaveClass(/is-apart/);
  await expect(stageEl(page)).toHaveClass(/is-layered/);
  await expect(page.locator('.blk-check')).toBeHidden();
  expect(errors).toEqual([]);
});

test('층별 모양만 보고 알아내기: 개수를 틀리면 입체가 나타나 층별로 벌어지고(층마다 몇 개), 칠하기를 틀리면 그 방향에서 내 그림을 겹친다. 별은 틀린 횟수로(한 번 틀림 → ★2)', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-layer-views');
  const [cnt, front, side] = questionsFor('blocks-layer-views');
  const [c1] = cnt.layers.map((g) => g.flat().filter(Boolean).length);
  const wrong = cnt.options.includes(c1) ? c1 : cnt.options.find((v) => v !== cnt.expected);
  await press(testInfo, page.locator(`.blk-choice[data-answer="${wrong}"]`));
  await expect(page.locator('.reason')).toContainText(`모두 ${cnt.expected}개예요.`);
  if (wrong === c1) await expect(page.locator('.reason')).toContainText('1층 모양만 세면');
  await expect(stageEl(page)).toHaveClass(/is-apart/);
  await expect(page.locator('.blk-stage .blk-layer')).toHaveCount(3);
  await expect(page.locator('.blk-mat > .blk-card .blk-layer-strip')).toBeVisible();
  await expect(page.locator(`.blk-choice[data-answer="${cnt.expected}"]`)).toHaveClass(/is-answer/);
  await next(testInfo, page);
  // 칠하기: 앞과 옆을 바꿔 칠함 → 입체가 나타나 바꾼 쪽에서 본 뒤 바른 쪽으로
  await paint(page, testInfo, 'front', front.views.side);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('층별 모양의 아래쪽이 앞이에요.');
  await expect(stageEl(page)).toHaveAttribute('data-facing', 'front', { timeout: 5000 });
  await paint(page, testInfo, 'front', front.views.front);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
  await solveLayerViews(page, testInfo, side);
  await expect(page.locator('.result-title')).toBeVisible();
  // 답 넷 가운데 둘 틀림 → 틀린 횟수 기준 ★1 · 별 기준 안내
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 1개');
  await expect(page.locator('.star-hint')).toHaveText('한 번만 틀리면 별 2개, 한 번도 틀리지 않으면 별 3개!');
  // 개수 고르기만 한 번 틀림 → ★2 (정답률이면 67%로 ★1)
  await open(page, 'blocks-layer-views', { seed: 2 });
  const qs2 = questionsFor('blocks-layer-views', 2);
  await press(testInfo, page.locator(`.blk-choice[data-answer="${qs2[0].options.find((v) => v !== qs2[0].expected)}"]`));
  await next(testInfo, page);
  await solveLayerViews(page, testInfo, qs2[1]);
  await solveLayerViews(page, testInfo, qs2[2]);
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 2개');
  await expect(page.locator('.star-hint')).toHaveText('한 번도 틀리지 않으면 별 3개!');
  expect(errors).toEqual([]);
});

test('더 붙여서 만들기: 예상이 틀리면 만들 수 있는 보기와 까닭, 붙인 쌓기나무 점선. 내 판에서 처음 모양 그대로·보기에 없는 모양은 기록하지 않고, 틀린 만들기는 기록(고치지 않고 또 누르면 다시 세지 않는다)·힌트. 만든 모양에 수 쓰기', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-add');
  const [q] = questionsFor('blocks-add');
  // 아무것도 고르지 않고 [다 골랐어요]: 안내만
  await press(testInfo, page.locator('.blk-add-submit'));
  await expect(page.locator('.toast')).toContainText('먼저 골라요');
  // 모두 고름(넷) → 틀림: 만들 수 없는 보기의 까닭
  for (const i of [1, 2, 3, 4]) await press(testInfo, option(page, i));
  await expect(option(page, 1)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => liveText(page)).toContain('4번을 골랐어요.');
  await press(testInfo, page.locator('.blk-add-submit'));
  await expect(page.locator('.reason')).toContainText(`만들 수 있는 모양은 ${q.answers.map((i) => `${i}번`).join(', ')}이에요.`);
  await expect(page.locator('.blk-verdict')).toHaveText(q.options.map((o) => (o.role === 'answer' ? '돼요' : '안 돼요')));
  expect(await page.locator('.blk-add-option .blk-face.is-added').count()).toBeGreaterThan(0);
  await expect(page.locator('.blk-add-submit')).toBeHidden();
  // 내 판이 열렸다(처음 모양이 놓여 있다)
  await expect(stageEl(page)).not.toHaveClass(/is-frozen/);
  expect(await padMap(page)).toEqual(q.base);
  await check(testInfo, page);
  await expect(page.locator('.toast')).toContainText(`쌓기나무를 ${q.n}개 더 붙여 봐요.`);
  // 하나 더 많이 붙임 → 틀림(기록) · 또 눌러도 다시 세지 않는다
  const built = builtAnswer(q);
  const over = built.map((row) => [...row]);
  const spot = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((i) => over[Math.floor(i / 3)][i % 3] > 0 && over[Math.floor(i / 3)][i % 3] < 3);
  over[Math.floor(spot / 3)][spot % 3] += 1;
  await padGrow(page, testInfo, over);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText(`쌓기나무를 ${q.n}개만 붙여요.`);
  await check(testInfo, page);
  await expect(page.locator('.toast')).toContainText('이미 확인한');
  await expect(page.locator('.blk-hint')).toBeHidden();
  // 처음 모양의 쌓기나무를 하나 뺌 → 두 번째로 틀림 → 힌트(붙일 자리 표시)
  await press(testInfo, page.locator('.blk-undo'));
  const less = q.base.map((row) => [...row]);
  const top = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((i) => less[Math.floor(i / 3)][i % 3] > 0);
  less[Math.floor(top / 3)][top % 3] -= 1;
  await padBuild(page, testInfo, less);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('그대로 두고');
  await press(testInfo, page.locator('.blk-hint'));
  await expect(page.locator('.blk-hint-text')).toContainText(`${q.answers[0]}번 모양은`);
  await expect(page.locator('.blk-cell.is-goal')).toHaveCount(1);
  // 만들 수 있는 보기를 만든다 → 그 보기에 "만든 모양", 수 쓰기 판이 위에서 본 판 자리에
  await padBuild(page, testInfo, q.base);
  await padGrow(page, testInfo, built);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText(`${q.answers[0]}번 모양을 만들었어요.`);
  await expect(option(page, q.answers[0]).locator('.blk-verdict')).toHaveText('만든 모양');
  await expect(page.locator('.blk-mat > .blk-padbox:not(.blk-numbox)')).toBeHidden();
  await expect(page.locator('.blk-numbox')).toBeVisible();
  expect(await page.locator('.blk-stage [data-x]').count()).toBe(0); // 수를 쓰는 동안 면에 자리 값이 없다
  // 수를 틀리게 → 그 자리에 ✗ · 맞게 → 아래부터 세어 보인다
  await writeByPress(page, testInfo, built.map((row) => row.map((v) => (v ? (v % 3) + 1 : 0))));
  await check(testInfo, page);
  await expect(page.locator('.blk-ncell.is-diff').first()).toBeVisible();
  await writeByPress(page, testInfo, built);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText(`모두 ${count(built)}개예요.`);
  await expect(page.locator('.next-btn')).toBeFocused();
  expect(errors).toEqual([]);
});

// ── 도장 셋 ───────────────────────────────
test('쌓기나무 도장 셋: 도장판 16칸에 받는 방법이 보이고(숨은 도장 없음), 지난 학습 기록으로 조건을 채운 학생은 다음에 단계를 마칠 때 한 번만 받는다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&intro=0'));
  // 사이트에 이미 있는 2·3차시에서 쌓은 기록: 모두 몇 개일까?를 4문항 모두 처음에 맞힌 판 둘(숨겨진 문항 4번) · 위, 앞, 옆을 보고 쌓기를 첫 [확인하기]에 세 번
  await page.evaluate(() => {
    localStorage.clear();
    const set = (k, v) => localStorage.setItem(`edu:net-workshop:${k}`, JSON.stringify(v));
    const ans = (itemId, correct) => ({ itemId, correct, tag: null, given: null, expected: null, atMs: 1000 });
    const rec = (stageId, stageTitle, answers) => ({ stageId, stageTitle, startedAt: 1760000000000, durationMs: 60000, attempts: answers.length, correct: answers.filter((a) => a.correct).length, accuracy: 1, stars: 3, cleared: true, answers });
    set('stars', { 'blocks-count': 3, 'blocks-build': 3 });
    set('rewards', { v: 1, xp: 60, badges: { 'first-step': { at: 1760000000000 } }, counters: { bounce: 0, retryFix: 0, explain: 0, inspect: 0, discover: 0 }, best: {}, rank: '솜씨꾼' });
    set('log', [
      rec('blocks-count', '모두 몇 개일까?', [1, 2, 3, 4].map((i) => ans(`blocks-count:${i}`, true))),
      rec('blocks-count', '모두 몇 개일까?', [1, 2, 3, 4].map((i) => ans(`blocks-count:${i}`, true))),
      rec('blocks-build', '위, 앞, 옆을 보고 쌓기', [1, 2, 3].flatMap((i) => [ans(`blocks-build:${i}:build`, true), ans(`blocks-build:${i}:guess`, true)])),
    ]);
  });
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&intro=0'));
  await page.getByRole('button', { name: '학습 기록' }).click();
  await expect(page.locator('.badge-item')).toHaveCount(16);
  await expect(page.locator('.badge-item[data-badge="blocks-hidden-finder"]')).toContainText('숨겨진 쌓기나무가 있는 개수 문제를 처음에 3번 맞혀요');
  await expect(page.locator('.badge-item[data-badge="blocks-three-eyes"]')).toContainText('위, 앞, 옆을 보고 쌓기를 첫 [확인하기]에 3번 맞혀요');
  await expect(page.locator('.badge-item[data-badge="blocks-layer-builder"]')).toContainText('층별 모양을 보고 쌓기를 첫 [확인하기]에 3번 맞혀요');
  for (const id of ['blocks-hidden-finder', 'blocks-three-eyes', 'blocks-layer-builder']) await expect(page.locator(`.badge-item[data-badge="${id}"]`)).not.toHaveClass(/is-earned/);
  // 다음에 마치는 단계(어느 단계든 — 여기서는 층별 모양만 보고 알아내기)에서 지난 기록으로 채운 둘을 받는다
  await open(page, 'blocks-layer-views');
  for (const q of questionsFor('blocks-layer-views')) await solveLayerViews(page, testInfo, q);
  await expect(page.locator('.new-badge-list li')).toContainText([/숨겨진 쌓기나무 찾기/, /세 방향의 눈/]);
  await expect(page.locator('.new-badge-list li')).not.toContainText([/층층이 쌓기/]);
  // 한 번만: 다시 마쳐도 새 도장으로 또 나오지 않는다
  await open(page, 'blocks-layer-views', { seed: 2 });
  for (const q of questionsFor('blocks-layer-views', 2)) await solveLayerViews(page, testInfo, q);
  await expect(page.locator('.result-title')).toBeVisible();
  await expect(page.locator('.new-badge-list li')).toHaveCount(0);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&intro=0'));
  await page.getByRole('button', { name: '학습 기록' }).click();
  for (const id of ['blocks-hidden-finder', 'blocks-three-eyes']) await expect(page.locator(`.badge-item[data-badge="${id}"]`)).toHaveClass(/is-earned/);
  expect(errors).toEqual([]);
});

// ── 키보드만 ────────────────────────────
test('키보드만: 층별 모양 칠하기(방향키 + Space) · 쌓기(위에서 본 판의 방향키 + 숫자) · 개수 고르기(Enter) · 더 붙여서 만들기(보기 Space, 판 숫자, 수 쓰기 숫자)로 5차시와 도전을 끝까지', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '키보드는 크롬북에서');
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  /** 모눈(그 이름)의 첫 칸에서 시작해 행마다 오른쪽으로 → 위로 돌며 칠한다 */
  const keyPaint = async (name, target) => {
    await page.locator(`.blk-paint[data-kind="${name}"] .blk-pcell[tabindex="0"]`).focus();
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        if (target[r][c]) await page.keyboard.press('Space');
        if (c < 2) await page.keyboard.press('ArrowRight');
      }
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      if (r < 2) await page.keyboard.press('ArrowUp');
    }
    expect(await paintedOf(page, name)).toEqual(target);
  };
  /** 위에서 본 판: 첫 칸(1줄 1칸)에서 시작해 자리마다 숫자 키로 높이를 맞춘다 */
  const keyBuild = async (target) => {
    await page.locator('.blk-cell[tabindex="0"]').focus();
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        await page.keyboard.press(String(target[y][x]));
        if (x < 2) await page.keyboard.press('ArrowRight');
      }
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      if (y < 2) await page.keyboard.press('ArrowUp');
    }
    expect(await padMap(page)).toEqual(target);
  };
  const keyCheck = async () => {
    await page.locator('.blk-check').focus();
    await page.keyboard.press('Enter');
  };
  await open(page, 'blocks-layer-draw');
  for (const q of questionsFor('blocks-layer-draw')) {
    await keyPaint('layer2', q.layers[1]);
    await keyPaint('layer3', q.layers[2]);
    await keyCheck();
    await expect(page.locator('.reason')).toContainText('맞아요!');
    await expect(page.locator('.next-btn')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await open(page, 'blocks-layer-build');
  for (const q of questionsFor('blocks-layer-build')) {
    await keyBuild(q.target);
    await keyCheck();
    await expect(page.locator('.reason')).toContainText('맞아요!');
    await expect(page.locator('.next-btn')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await open(page, 'blocks-layer-views');
  for (const q of questionsFor('blocks-layer-views')) {
    if (q.kind === 'count') {
      await page.locator(`.blk-choice[data-answer="${q.expected}"]`).focus();
      await page.keyboard.press('Enter');
    } else {
      await keyPaint(q.kinds[0], q.views[q.kinds[0]]);
      await keyCheck();
    }
    await expect(page.locator('.reason')).toContainText('맞아요!');
    await expect(page.locator('.next-btn')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  await open(page, 'blocks-add');
  for (const q of questionsFor('blocks-add')) {
    for (const i of q.answers) {
      await option(page, i).focus();
      await page.keyboard.press('Space');
    }
    await page.locator('.blk-add-submit').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.reason')).toContainText('맞아요!');
    // 예상한 뒤 초점은 위에서 본 판으로 간다
    await expect(page.locator('.blk-cell[tabindex="0"]')).toBeFocused();
    const built = builtAnswer(q);
    await keyBuild(built);
    await keyCheck();
    await expect(page.locator('.blk-ncell[tabindex="0"]')).toBeFocused();
    const spots = [];
    built.forEach((row, y) => row.forEach((v, x) => {
      if (v) spots.push([x, y]);
    }));
    for (const [x, y] of spots) {
      await ncell(page, x, y).focus();
      await page.keyboard.press(String(built[y][x]));
    }
    await keyCheck();
    await expect(page.locator('.reason')).toContainText('맞아요!');
    await expect(page.locator('.next-btn')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('heading', { name: '도전 성공!' })).toBeVisible();
  expect(errors).toEqual([]);
});

// ── 배치 ────────────────────────────────
const SIZES = [
  { name: '크롬북 1366×768', width: 1366, height: 768, project: 'chromebook' },
  { name: '크롬북 1366×680', width: 1366, height: 680, project: 'chromebook' },
  { name: '태블릿 820×1180', width: 820, height: 1180, project: 'tablet' },
  { name: '가로 태블릿 1024×768', width: 1024, height: 768, project: 'chromebook' },
  { name: '낮은 가로 화면 960×768', width: 960, height: 768, project: 'chromebook' },
];

for (const size of SIZES) {
  test(`배치(${size.name}): 5차시 세 단계와 도전의 모든 장면에 세로·가로 스크롤이 없고, 판 안쪽이 넘치지 않으며, 매트와 머리가 움직이지 않는다`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== size.project, `${size.project}에서 확인`);
    test.setTimeout(360_000);
    const errors = collectErrors(page);
    await page.setViewportSize({ width: size.width, height: size.height });
    const frame = () => page.evaluate(() => {
      const r = (sel) => {
        const b = document.querySelector(sel).getBoundingClientRect();
        return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10).join(',');
      };
      return `${r('.play-header')}|${r('.blk-mat')}`;
    });
    let first = null;
    const scene = async (label) => {
      await calm(page);
      await noScroll(page, label);
      await expectFits(page, label);
      await expectNoOverlap(page, label);
      const now = await frame();
      if (first == null) first = now;
      expect(now, label).toBe(first);
    };
    const begin = async (id) => {
      await open(page, id);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
      first = null;
      await scene(`${id} 처음`);
    };
    // 층별 모양 그리기: 첫 문항 틀림(2층에 1층 모양) → 힌트 → 맞힘, 셋째 틀림 → 맞힘
    await begin('blocks-layer-draw');
    for (const [i, q] of questionsFor('blocks-layer-draw').entries()) {
      if (i !== 1) {
        await paint(page, testInfo, 'layer2', q.layers[0]);
        await paint(page, testInfo, 'layer3', q.layers[1]);
        await check(testInfo, page);
        if (i === 0) await expectToastClear(page, 'layer-draw 틀린 알림');
        await scene(`layer-draw ${i + 1} 틀림`);
        if (i === 0) {
          await paint(page, testInfo, 'layer3', [[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
          await check(testInfo, page);
          await press(testInfo, page.locator('.blk-hint'));
          await scene('layer-draw 힌트');
        }
      }
      await paint(page, testInfo, 'layer2', q.layers[1]);
      await paint(page, testInfo, 'layer3', q.layers[2]);
      await check(testInfo, page);
      await scene(`layer-draw ${i + 1} 맞힘`);
      await next(testInfo, page);
      if (i < 2) await scene(`layer-draw ${i + 2} 처음`);
    }
    await noScroll(page, 'layer-draw 결과');
    // 층별 모양을 보고 쌓기: 틀림 → 힌트 → 맞힘
    await begin('blocks-layer-build');
    for (const [i, q] of questionsFor('blocks-layer-build').entries()) {
      if (i === 0) {
        await padBuild(page, testInfo, mirrorMap(q.target));
        await check(testInfo, page);
        await expectToastClear(page, 'layer-build 틀린 알림');
        await scene('layer-build 틀림');
        await padBuild(page, testInfo, [[1, 0, 0], [0, 0, 0], [0, 0, 0]]);
        await check(testInfo, page);
        await press(testInfo, page.locator('.blk-hint'));
        await scene('layer-build 힌트');
      }
      await padBuild(page, testInfo, q.target);
      await check(testInfo, page);
      await scene(`layer-build ${i + 1} 맞힘`);
      await next(testInfo, page);
      if (i < 2) await scene(`layer-build ${i + 2} 처음`);
    }
    await noScroll(page, 'layer-build 결과');
    // 층별 모양만 보고: 개수 틀림, 칠하기 틀림 → 맞힘
    await begin('blocks-layer-views');
    for (const [i, q] of questionsFor('blocks-layer-views').entries()) {
      if (q.kind === 'count') {
        await press(testInfo, page.locator(`.blk-choice[data-answer="${q.options.find((v) => v !== q.expected)}"]`));
        await expectToastClear(page, 'layer-views 틀린 알림');
        await scene('layer-views 개수 틀림');
      } else {
        const kind = q.kinds[0];
        await paint(page, testInfo, kind, q.views[kind === 'front' ? 'side' : 'front']);
        await check(testInfo, page);
        await scene(`layer-views ${kind} 틀림`);
        await paint(page, testInfo, kind, q.views[kind]);
        await check(testInfo, page);
        await scene(`layer-views ${kind} 맞힘`);
      }
      await next(testInfo, page);
      if (i < 2) await scene(`layer-views ${i + 2} 처음`);
    }
    await noScroll(page, 'layer-views 결과');
    // 더 붙여서 만들기: 첫 문항은 넷 모두 골라 틀림 → 만들기 틀림 → 만듦 → 수 틀림 → 맞힘
    await begin('blocks-add');
    for (const [i, q] of questionsFor('blocks-add').entries()) {
      for (const k of i === 0 ? [1, 2, 3, 4] : q.answers) await press(testInfo, option(page, k));
      await scene(`add ${i + 1} 고르는 중`);
      await press(testInfo, page.locator('.blk-add-submit'));
      if (i === 0) await expectToastClear(page, 'add 틀린 알림');
      await scene(`add ${i + 1} 예상 뒤`);
      const built = builtAnswer(q);
      if (i === 0) {
        const over = built.map((row) => [...row]);
        const spot = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((s) => over[Math.floor(s / 3)][s % 3] > 0 && over[Math.floor(s / 3)][s % 3] < 3);
        over[Math.floor(spot / 3)][spot % 3] += 1;
        await padGrow(page, testInfo, over);
        await check(testInfo, page);
        await scene('add 만들기 틀림');
        await padBuild(page, testInfo, built);
      } else await padGrow(page, testInfo, built);
      await check(testInfo, page);
      await scene(`add ${i + 1} 만듦`);
      if (i === 0) {
        await writeByPress(page, testInfo, built.map((row) => row.map((v) => (v ? (v % 3) + 1 : 0))));
        await check(testInfo, page);
        await scene('add 수 틀림');
      }
      await writeByPress(page, testInfo, built);
      await check(testInfo, page);
      await scene(`add ${i + 1} 수 맞힘`);
      await next(testInfo, page);
      if (i < 2) await scene(`add ${i + 2} 처음`);
    }
    await noScroll(page, 'add 결과');
    expect(errors).toEqual([]);
  });
}

test('휴대폰(390×844): 5차시·도전 화면에 가로 스크롤이 없고, 칠하기 칸·판 칸·보기·[확인하기]가 48px이다. 층별 모양만 보고 알아내기를 손가락으로 끝까지', async ({ page }, testInfo) => {
  test.skip(!isTouch(testInfo), '터치 기기에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['blocks-layer-draw', 'blocks-layer-build', 'blocks-layer-views', 'blocks-add']) {
    await open(page, id);
    await calm(page);
    expect(await hasHorizontalScroll(page), id).toBe(false);
    const small = await page.evaluate(() => [...document.querySelectorAll('.blk-pcell, .blk-ncell[data-x], .blk-cell, .blk-choice, .blk-check, .blk-add-submit, .blk-dir')]
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width < 47.5 || r.height < 47.5).length);
    expect(small, id).toBe(0);
  }
  await open(page, 'blocks-layer-views');
  for (const q of questionsFor('blocks-layer-views')) await solveLayerViews(page, testInfo, q);
  await expect(page.locator('.result-title')).toBeVisible();
  expect(await hasHorizontalScroll(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('폭 901~1000px 낮은 화면의 수만 보고 알아내기(4차시): 답한 뒤 수를 쓴 그림 카드가 [확인하기] 띠에 가리지 않는다 (review-blocks-s2 S2b-2)', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  for (const [w, h] of [[960, 768], [960, 680], [1000, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await open(page, 'blocks-numviews');
    for (const q of questionsFor('blocks-numviews')) {
      if (q.kind === 'paint') {
        const kind = q.kinds[0];
        await paint(page, testInfo, kind, q.views[kind === 'front' ? 'side' : 'front']);
        await check(testInfo, page);
      } else await press(testInfo, page.locator(`.blk-choice[data-answer="${(q.expected % 4) + 1}"]`));
      await expect(page.locator('.reason')).toBeVisible();
      await calm(page);
      const m = await page.evaluate(() => {
        const card = document.querySelector('.blk-mat > .blk-card').getBoundingClientRect();
        const mat = document.querySelector('.blk-mat').getBoundingClientRect();
        const kids = [...document.querySelectorAll('.blk-mat > .blk-tools > *')].filter((el) => el.getClientRects().length > 0).map((el) => el.getBoundingClientRect());
        const bandTop = Math.min(...kids.map((r) => r.top));
        return { gap: Math.floor(bandTop - card.bottom), inside: card.bottom <= mat.bottom && card.top >= mat.top && card.left >= mat.left };
      });
      expect(m.gap, `${w}×${h}`).toBeGreaterThanOrEqual(0);
      expect(m.inside, `${w}×${h}`).toBe(true);
      await expectNoOverlap(page, `${w}×${h}`);
      if (q.kind === 'paint') {
        await paint(page, testInfo, q.kinds[0], q.views[q.kinds[0]]);
        await check(testInfo, page);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await next(testInfo, page);
    }
  }
  expect(errors).toEqual([]);
});

// ── 접근성·정리 ───────────────────────────
test('접근성: 층 모양 모눈·층별 모양 그림·보기 고르기의 이름과 알림, 움직임 줄이기에서는 바로 벌어진다, 단계를 나가면 남는 것이 없다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-layer-draw', { extra: '&fx=low' });
  const [q] = questionsFor('blocks-layer-draw');
  await expect(page.locator('.blk-paint[data-kind="layer2"] .blk-pgrid')).toHaveAttribute('aria-label', /^2층 모양 모눈\. 방향키로 칸을 옮기고, Space나 Enter로 칠하거나 지워요\./);
  await expect(pcell(page, 'layer3', 0, 1)).toHaveAttribute('aria-label', '1줄 2칸, 빈칸');
  await pcell(page, 'layer3', 0, 1).click();
  await expect(pcell(page, 'layer3', 0, 1)).toHaveAttribute('aria-label', '1줄 2칸, 칠함');
  await expect.poll(() => liveText(page)).toContain('1줄 2칸을 칠했어요.');
  await pcell(page, 'layer3', 0, 1).click();
  await paint(page, testInfo, 'layer2', q.layers[1]);
  await paint(page, testInfo, 'layer3', q.layers[2]);
  await check(testInfo, page);
  // 움직임 줄이기(?fx=low): 돌아가는 움직임 없이 바로 층별로 벌어진 처음 보기
  await expect(stageEl(page)).toHaveClass(/is-apart/);
  await expect(stageEl(page)).not.toHaveClass(/is-easing/);
  await expect(stageEl(page)).toHaveAttribute('data-facing', 'home');
  // 층별 모양 그림의 글 이름
  await open(page, 'blocks-layer-build');
  const labels = await page.locator('.blk-views .blk-grid-pic').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(labels.map((l) => l.split(':')[0])).toEqual(['1층 모양', '2층 모양', '3층 모양']);
  expect(labels[0]).toMatch(/^1층 모양: 쌓인 자리는 \d줄 \d칸/);
  // 보기 고르기: 누르면 aria-pressed와 알림, 답한 뒤 그림 이름에 판정
  await open(page, 'blocks-add');
  const [a] = questionsFor('blocks-add');
  await option(page, 2).click();
  await expect(option(page, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => liveText(page)).toContain('2번을 골랐어요.');
  await option(page, 2).click();
  await expect(option(page, 2)).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => liveText(page)).toContain('2번을 뺐어요.');
  for (const i of a.answers) await option(page, i).click();
  await page.locator('.blk-add-submit').click();
  await expect(option(page, a.answers[0]).locator('.blk-picture')).toHaveAttribute('aria-label', `${a.answers[0]}번 모양 그림. 만들 수 있어요`);
  // 만든 모양을 세는 도중에 단계를 나간다: 타이머가 남지 않는다(나간 뒤 오류 없음)
  const built = builtAnswer(a);
  await padGrow(page, testInfo, built);
  await check(testInfo, page);
  await writeByPress(page, testInfo, built);
  await page.locator('.blk-check').click();
  await page.evaluate(() => document.querySelector('.btn-back').click());
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('.blk-stage, .blk-panel').length)).toBe(0);
  expect(errors).toEqual([]);
});

test('점수: 별 3개를 받은 5차시 단계를 다시 해도 점수가 쌓이지 않는다', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  const playOnce = async () => {
    await open(page, 'blocks-layer-build');
    for (const q of questionsFor('blocks-layer-build')) await solveLayerBuild(page, testInfo, q);
    await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
    return resultXp(page);
  };
  expect(await playOnce()).toEqual({ tiles: 7, line: 11, gained: 18, saved: 18 });
  expect(await playOnce()).toEqual({ tiles: 0, line: 0, gained: 0, saved: 18 });
  await expect(page.locator('.practice-note')).toContainText('별 3개를 받은 단계라 연습 점수는 없어요.');
  expect(mapKey([[0, 0, 0], [0, 0, 0], [0, 0, 0]])).toBe('000/000/000');
  expect(errors).toEqual([]);
});
