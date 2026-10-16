/**
 * 쌓기나무 3·4차시(S2) 브라우저 검사. 기획서: docs/games/net-workshop/spec-grade6.md 2-4·3-4·3-5·5·9·11절, 공통 규칙: common-rules.md
 * 정답은 게임과 같은 시드로 blocks-logic.js를 불러 계산한다(DOM에 정답을 숨겨 두지 않는다).
 * 글자 폭에 기대는 픽셀 상수는 쓰지 않는다(글꼴 흉내 모드 E2E_WIDE_TEXT=font에서도 통과해야 한다).
 * 크기·자리·겹침은 움직임이 끝난 뒤에(calm) 잰다. 몇 초 뒤 사라지는 알림은 띄운 조작 바로 뒤에 본다. 정해 둔 시간으로 기다리지 않는다.
 * 혼자 돌려 3초 넘게 걸리는 검사에는 시간 예산(test.setTimeout)을 적는다(CPU 4배 느리게 한 실행에서 걸린 시간의 3배 이상).
 */
import { expect, test } from '@playwright/test';
import { createRng } from '../../src/shared/core/random.js';
import { count, mapKey, picturedFaces, topView } from '../../src/games/net-workshop/blocks/blocks.js';
import {
  BLOCK_STAGES,
  judgeDrawing,
  judgeThree,
  makeBlockQuestions,
  mirrorCells,
  mirrorMap,
  spotName,
  viewCells,
} from '../../src/games/net-workshop/blocks/blocks-logic.js';
import { collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

const FILE = 'net-workshop.html';
const stageOf = (id) => BLOCK_STAGES.find((s) => s.id === id);
/** 게임과 같은 시드 문자열(<seed>:<단계 id>)로 같은 문항을 만든다 */
const questionsFor = (id, seed = 1) => makeBlockQuestions(stageOf(id), createRng(`${seed}:${id}`));
const open = (page, stageId, { seed = 1, extra = '' } = {}) => page.goto(fileUrl(FILE, `?unlock=all&seed=${seed}&sound=off&stage=${stageId}${extra}`));
const isTouch = (testInfo) => testInfo.project.name === 'tablet';
/** 그 기기의 누르기: 태블릿은 손가락, 크롬북은 마우스 */
const press = (testInfo, locator) => (isTouch(testInfo) ? locator.tap() : locator.click());

const stageEl = (page) => page.locator('.blk-stage');
const cell = (page, x, y) => page.locator(`.blk-cell[data-x="${x}"][data-y="${y}"]`);
const pcell = (page, kind, r, c) => page.locator(`.blk-paint[data-kind="${kind}"] .blk-pcell[data-r="${r}"][data-c="${c}"]`);
const ncell = (page, x, y) => page.locator(`.blk-ncell[data-x="${x}"][data-y="${y}"]`);
const next = (testInfo, page) => press(testInfo, page.locator('.next-btn:not([hidden])'));
const check = (testInfo, page) => press(testInfo, page.locator('.blk-check'));

/** 화면의 움직임이 모두 끝날 때까지 기다린다(끝이 있는 CSS 애니메이션·전환 + 무대의 돌아가는 움직임) — 크기·자리를 재기 전에 */
const calm = (page) => page.waitForFunction(() => {
  const moving = document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity));
  return !moving && !document.querySelector('.blk-stage.is-easing');
});

/** "위에서 본 판"에 적힌 내 쌓기(높이 지도) */
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
/** 모눈에 칠한 칸 [행][열] */
const paintedOf = (page, kind) => page.locator(`.blk-paint[data-kind="${kind}"] .blk-pcell`).evaluateAll((els) => {
  const g = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const el of els) g[Number(el.dataset.r)][Number(el.dataset.c)] = el.getAttribute('aria-selected') === 'true' ? 1 : 0;
  return g;
});
/** 모눈을 그 그림대로 칠한다(누르기) */
async function paint(page, testInfo, kind, cells) {
  const now = await paintedOf(page, kind);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) if (Boolean(now[r][c]) !== Boolean(cells[r][c])) await press(testInfo, pcell(page, kind, r, c));
  expect(await paintedOf(page, kind)).toEqual(cells.map((row) => row.map((v) => (v ? 1 : 0))));
}
/** 수 쓰기 판에 쓴 수 [줄][칸] */
const numbersOf = (page) => page.locator('.blk-ncell[data-x]').evaluateAll((els) => {
  const g = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const el of els) g[Number(el.dataset.y)][Number(el.dataset.x)] = Number(el.textContent || 0);
  return g;
});
/** 칸을 눌러(안 씀 → 1 → 2 → 3 → 1) 그 수를 쓴다 */
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
      .filter(([, b]) => b.getClientRects().length > 0)
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
/** 판이 매트 옆에 있을 때 안쪽에 남은 높이와 글 한 줄의 높이(글자 폭에 기대는 상수는 쓰지 않는다 — 줄 높이는 화면에서 읽는다) */
const panelRoom = (page) => page.evaluate(() => {
  const panel = document.querySelector('.blk-panel');
  const mat = document.querySelector('.blk-mat').getBoundingClientRect();
  const box = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  const fixed = box.left >= mat.right - 1;
  const kids = [...panel.children].filter((c) => c.getClientRects().length > 0 && c.getBoundingClientRect().height > 0);
  const gap = parseFloat(style.rowGap) || 0;
  const bottom = box.bottom - (parseFloat(style.borderBottomWidth) || 0) - (parseFloat(style.paddingBottom) || 0);
  const nextBtn = kids.find((c) => c.classList.contains('next-btn'));
  const above = kids.filter((c) => c !== nextBtn);
  const last = above.length ? Math.max(...above.map((c) => c.getBoundingClientRect().bottom)) : box.top;
  const spare = nextBtn ? nextBtn.getBoundingClientRect().top - last - gap : bottom - last;
  const squeezed = kids.map((c) => c.scrollHeight - c.getBoundingClientRect().height).filter((d) => d > 1.5).reduce((t, d) => t + d, 0);
  const text = panel.querySelector('.note-text') ?? panel.querySelector('.q-prompt');
  const line = parseFloat(getComputedStyle(text).lineHeight) || parseFloat(getComputedStyle(text).fontSize) * 1.5;
  return { fixed, spare: Math.floor(spare - squeezed), line: Math.ceil(line) };
});
/** 매트 위의 조작 칸들(방향 버튼·위에서 본 판·칠하기 상자·수 쓰기 판·조작판·그림 카드·도구 띠·이름표)이 서로 겹치지 않는다 */
async function expectNoOverlap(page, label = '') {
  const hits = await page.evaluate(() => {
    const parts = [...document.querySelectorAll('.blk-mat > .blk-dirs, .blk-mat > .blk-padbox, .blk-mat > .view-pad, .blk-mat > .blk-card, .blk-mat > .blk-key, .blk-mat > .blk-tools, .blk-mat > .blk-tag')]
      .filter((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0 && el.childElementCount > 0);
    const out = [];
    for (let i = 0; i < parts.length; i += 1) {
      for (let j = i + 1; j < parts.length; j += 1) {
        const a = parts[i].getBoundingClientRect();
        const b = parts[j].getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 0.5 && h > 0.5) out.push(`${parts[i].className.split(' ')[0]} × ${parts[j].className.split(' ').slice(0, 2).join('.')} ${Math.round(w)}×${Math.round(h)}`);
      }
    }
    return out;
  });
  expect(hits, label).toEqual([]);
}
/** 지금 보이는 알림(토스트)이 매트·판의 버튼과 겹치지 않는다 — 알림은 몇 초 뒤 사라지므로 띄운 조작 바로 뒤에 부른다 */
async function expectToastClear(page, label = '') {
  await expect(page.locator('.toast')).toBeVisible();
  await calm(page);
  const hits = await page.evaluate(() => {
    const t = document.querySelector('.toast').getBoundingClientRect();
    const out = [];
    for (const el of document.querySelectorAll('.topbar button, .play-header button, .blk-mat button, .blk-panel button')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || el.closest('[hidden]')) continue;
      const w = Math.min(t.right, b.right) - Math.max(t.left, b.left);
      const h = Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top);
      if (w > 0 && h > 0) out.push(`${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 12)} ${Math.round(w)}×${Math.round(h)}`);
    }
    return out;
  });
  expect(hits, label).toEqual([]);
}
/** 결과 화면: "오늘의 솜씨" 칸 점수 합, 단계 완료·별 점수 줄의 합, "이번에 모은 솜씨 점수", 저장된 점수 */
const resultXp = (page) => page.evaluate(() => {
  const sum = (texts) => texts.flatMap((t) => t.match(/\+\d+/g) ?? []).reduce((total, x) => total + Number(x), 0);
  return {
    tiles: sum([...document.querySelectorAll('.behavior .b-xp')].map((el) => el.textContent)),
    line: sum([document.querySelector('.xp-line').textContent]),
    gained: Number(document.querySelector('.rank-card .xp-gain').textContent.replace(/\D/g, '')),
    saved: JSON.parse(localStorage.getItem('edu:net-workshop:rewards') ?? '{}').xp ?? 0,
  };
});
/** 화면 읽기 알림과 상태 글 전부 */
const liveText = (page) => page.evaluate(() => [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')].map((el) => el.textContent.trim()).filter(Boolean).join(' | '));
/** 무대에 그려진 다각형의 점(그림이 그대로인지 볼 값) */
const shapePoints = (page) => page.evaluate(() => [...document.querySelectorAll('.blk-stage polygon')].map((p) => p.getAttribute('points')).join('|'));
/** 답하기 전 화면에서 무대를 끌고, 휠을 굴리고, 키를 눌러 본다 */
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
/** 무대에 그려진 쌓기나무(면의 data-x·y·z)로 읽은 높이 지도 */
const drawnMap = (page) => page.evaluate(() => {
  const map = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const f of document.querySelectorAll('.blk-stage .blk-face')) {
    const { x, y, z } = f.dataset;
    map[Number(y)][Number(x)] = Math.max(map[Number(y)][Number(x)], Number(z) + 1);
  }
  return map;
});

// ── 문항 하나 풀기 (차시 흐름·배치 검사가 함께 쓴다) ────────
async function solveFlip(page, testInfo, q) {
  await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected}"]`));
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
}
async function solveDraw(page, testInfo, q) {
  for (const kind of q.kinds) await paint(page, testInfo, kind, q.views[kind]);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
}
async function solveThree(page, testInfo, q) {
  await padBuild(page, testInfo, q.target);
  await check(testInfo, page);
  await expect(page.locator('.blk-guess')).toBeVisible();
  await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected}"]`));
  if (q.many) {
    const other = q.fills.find((g) => count(g) !== count(q.target));
    await expect(page.locator('.blk-check')).toBeVisible();
    await padBuild(page, testInfo, other);
    await check(testInfo, page);
  }
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
}
async function solveWrite(page, testInfo, q) {
  await writeByPress(page, testInfo, q.target);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
}
async function solveFromNum(page, testInfo, q) {
  await padBuild(page, testInfo, q.target);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
}
async function solveNumViews(page, testInfo, q) {
  if (q.kind === 'paint') {
    await paint(page, testInfo, q.kinds[0], q.views[q.kinds[0]]);
    await check(testInfo, page);
  } else await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected}"]`));
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
}

// ── 차시 흐름 ─────────────────────────────
// 처음 화면·[시작하기]·단계 지도는 거치지 않는다(영역 화면이 생기면 바뀐다): 차시의 첫 단계 주소로 바로 들어가 [다음 단계]로 잇는다
test('3차시(?lesson=blocks-three): 앞과 뒤, 오른쪽과 왼쪽 → 위, 앞, 옆에서 본 모양 그리기 → 위, 앞, 옆을 보고 쌓기 를 처음부터 끝까지', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?lesson=blocks-three&stage=blocks-flip&seed=1&sound=off'));
  await expect(page.locator('.order-kind')).toHaveText('관찰 주문');
  for (const q of questionsFor('blocks-flip')) await solveFlip(page, testInfo, q);
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  // 처음에 맞힘 2 × 3 + 연속 3 +1, 단계 완료 5 + 별 6
  expect(await resultXp(page)).toEqual({ tiles: 7, line: 11, gained: 18, saved: 18 });

  await page.getByRole('button', { name: '다음 단계' }).click();
  await expect(page.locator('.order-kind')).toHaveText('기록 주문');
  for (const q of questionsFor('blocks-draw')) await solveDraw(page, testInfo, q);
  await expect(page.getByText('3번 중 3번 맞힘')).toBeVisible();
  expect(await resultXp(page)).toEqual({ tiles: 7, line: 11, gained: 18, saved: 36 });

  await page.getByRole('button', { name: '다음 단계' }).click();
  await expect(page.locator('.order-kind')).toHaveText('설계 주문');
  for (const q of questionsFor('blocks-build')) await solveThree(page, testInfo, q);
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  // 답 7개(쌓기 3 · 예상 3 · 다른 개수로 쌓기 1) 모두 처음에 맞힘: 14 + 연속 2
  await expect(page.getByText('7번 중 7번 맞힘')).toBeVisible();
  expect(await resultXp(page)).toEqual({ tiles: 16, line: 11, gained: 27, saved: 63 });
  expect(errors).toEqual([]);
});

test('4차시(?lesson=blocks-number): 자리마다 몇 개? → 수를 보고 쌓기 → 수만 보고 알아내기 를 처음부터 끝까지', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?lesson=blocks-number&stage=blocks-write&seed=1&sound=off'));
  await expect(page.locator('.order-kind')).toHaveText('기록 주문');
  for (const q of questionsFor('blocks-write')) await solveWrite(page, testInfo, q);
  await expect(page.getByText('3번 중 3번 맞힘')).toBeVisible();
  expect(await resultXp(page)).toEqual({ tiles: 7, line: 11, gained: 18, saved: 18 });

  await page.getByRole('button', { name: '다음 단계' }).click();
  await expect(page.locator('.order-kind')).toHaveText('설계 주문');
  for (const q of questionsFor('blocks-fromnum')) await solveFromNum(page, testInfo, q);
  await expect(page.getByText('2번 중 2번 맞힘')).toBeVisible();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  expect(await resultXp(page)).toEqual({ tiles: 4, line: 11, gained: 15, saved: 33 });

  await page.getByRole('button', { name: '다음 단계' }).click();
  await expect(page.locator('.order-kind')).toHaveText('추리 주문');
  for (const q of questionsFor('blocks-numviews')) await solveNumViews(page, testInfo, q);
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  expect(await resultXp(page)).toEqual({ tiles: 7, line: 11, gained: 18, saved: 51 });
  expect(errors).toEqual([]);
});

// ── 정답 노출 ─────────────────────────────
test('정답 노출 0 (앞과 뒤 · 그리기): 답하기 전에는 멈춘 그림(보이는 면만, 자리 값 없음)이고 돌릴 수 없다. 문항이 달라도 화면의 틀이 같고, 정답 자리는 여러 곳', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(180_000); // CPU 4배 느리게 한 실행에서 40초
  const errors = collectErrors(page);
  const frames = new Set();
  const spots = new Set();
  for (const id of ['blocks-flip', 'blocks-draw']) {
    for (const seed of [1, 2, 3]) {
      await open(page, id, { seed });
      for (const q of questionsFor(id, seed)) {
        const stage = stageEl(page);
        await expect(stage).toHaveClass(/is-frozen/);
        expect(await page.locator('.blk-stage .blk-face').count()).toBe(picturedFaces(q.target).length);
        expect(await page.locator('.blk-stage .blk-tile, .blk-stage [data-kind], .blk-stage [data-x], .blk-stage .blk-chip:not(.blk-edge), .blk-stage .blk-over').count()).toBe(0);
        // 판은 없어도 가장자리 글자(앞·옆 / 앞·오른쪽·뒤·왼쪽)와 화살표는 있다 — 자리는 아래 틀(frames)에 넣어 문항마다 같은지 본다
        expect(await page.locator('.blk-stage .blk-edge').allTextContents()).toEqual(id === 'blocks-flip' ? ['뒤', '왼쪽', '앞', '오른쪽'] : ['앞', '옆']);
        expect(await stage.evaluate((el) => [el.dataset.count ?? null, el.dataset.facing ?? null, el.getAttribute('tabindex')])).toEqual([null, null, '-1']);
        await expect(page.locator('.blk-dirs')).toBeHidden();
        await expect(page.locator('.view-pad')).toBeHidden();
        const before = await shapePoints(page);
        await pokeStage(page);
        expect(await shapePoints(page)).toBe(before);
        await expect(page.locator('.is-diff, .blk-x, .reason')).toHaveCount(0);
        await expect.poll(() => liveText(page)).not.toMatch(/\d층|맞|틀/);
        if (id === 'blocks-flip') {
          // 보기 셋은 문항이 만든 차례 그대로이고, 정답의 자리는 문항마다 다르다(분포는 단위 검사가 시드 1,000개로 고정)
          const shown = await page.locator('.blk-choice').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.querySelector('svg').getAttribute('aria-label')));
          expect(shown.length).toBe(3);
          spots.add(q.expected);
        } else {
          // 그리는 모눈은 비어 있다
          for (const kind of q.kinds) expect((await paintedOf(page, kind)).flat().every((v) => v === 0)).toBe(true);
        }
        frames.add(await page.evaluate((stageId) => JSON.stringify({
          stageId,
          unit: document.querySelector('.blk-stage').style.getPropertyValue('--blk-unit'),
          stage: document.querySelector('.blk-stage').className,
          tagIcon: document.querySelector('.blk-tag svg')?.getAttribute('class'),
          choices: [...document.querySelectorAll('.blk-choice')].map((b) => `${b.className}|${b.disabled}`),
          label: document.querySelector('.blk-stage').getAttribute('aria-label'),
          edges: [...document.querySelectorAll('.blk-stage .blk-edge')].map((g) => `${g.textContent}@${g.getAttribute('transform')}`),
          arrows: [...document.querySelectorAll('.blk-stage .blk-arrow')].map((a) => a.getAttribute('points')),
        }), id));
        if (id === 'blocks-flip') await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected}"]`));
        else {
          for (const kind of q.kinds) await paint(page, testInfo, kind, q.views[kind]);
          await check(testInfo, page);
        }
        // 답한 뒤: 입체가 되어 돌려 볼 수 있다(판이 나타나고, 그려진 쌓기나무 = 문항). 차례로 도는 것이 끝난 뒤(마지막 방향)에 처음 보기로
        await expect(stage).not.toHaveClass(/is-frozen/);
        await expect(page.locator('.view-pad')).toBeVisible();
        await expect(page.locator('.blk-dirs')).toBeVisible();
        await expect(stage).toHaveAttribute('data-facing', id === 'blocks-flip' ? q.ask : q.kinds.at(-1), { timeout: 6000 });
        await calm(page);
        await press(testInfo, page.locator('.view-home'));
        await calm(page);
        expect(await drawnMap(page)).toEqual(q.target);
        await next(testInfo, page);
      }
    }
  }
  expect([...spots].sort()).toEqual([1, 2, 3]);
  // 문항마다 바뀌는 것(모양·글)을 빼면 답하기 전의 화면 틀은 단계마다 한 가지
  expect(frames.size).toBe(2);
  expect(errors).toEqual([]);
});

test('그림의 "앞"·"옆" 표시 (review-blocks-s2 S2-1): 그리기의 답하기 전 그림에는 앞(왼쪽 아래)·옆(오른쪽 아래) 글자와 화살표가 보이고, 수만 보고 고르는 보기 그림에도 늘 같은 자리에 있다', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  // 그리기 1번 문항, 답하기 전: 무대 안에 "앞"·"옆"이 보이고, 앞은 쌓기나무 그림의 왼쪽 아래, 옆은 오른쪽 아래
  await open(page, 'blocks-draw');
  await expect(stageEl(page)).toHaveClass(/is-frozen/);
  const front = page.locator('.blk-stage .blk-edge-front');
  const side = page.locator('.blk-stage .blk-edge-right');
  await expect(front).toBeVisible();
  await expect(side).toBeVisible();
  await expect(front).toHaveText('앞');
  await expect(side).toHaveText('옆');
  await expect(page.locator('.blk-stage .blk-arrow')).toHaveCount(2);
  await expect(stageEl(page)).toHaveAttribute('aria-label', /왼쪽 아래가 앞, 오른쪽 아래가 옆이에요\.$/);
  const box = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const faces = [...document.querySelectorAll('.blk-stage .blk-face')].map(r);
    const shape = { left: Math.min(...faces.map((f) => f.left)), right: Math.max(...faces.map((f) => f.right)), top: Math.min(...faces.map((f) => f.top)), bottom: Math.max(...faces.map((f) => f.bottom)) };
    const mid = (b) => [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
    return { shape, front: mid(r(document.querySelector('.blk-stage .blk-edge-front'))), side: mid(r(document.querySelector('.blk-stage .blk-edge-right'))) };
  });
  const cx = (box.shape.left + box.shape.right) / 2;
  const cy = (box.shape.top + box.shape.bottom) / 2;
  expect(box.front[0]).toBeLessThan(cx);
  expect(box.front[1]).toBeGreaterThan(cy);
  expect(box.side[0]).toBeGreaterThan(cx);
  expect(box.side[1]).toBeGreaterThan(cy);
  // 답하면 판이 나타나고 글자는 판 가장자리에 그대로 있다
  const [q] = questionsFor('blocks-draw');
  for (const kind of q.kinds) await paint(page, testInfo, kind, q.views[kind]);
  await check(testInfo, page);
  await expect(page.locator('.blk-stage .blk-tile')).toHaveCount(9);
  await expect(page.locator('.blk-stage .blk-edge')).toHaveCount(2);
  // 수만 보고 고르기: 보기 넷의 그림마다 앞·옆이 틀의 같은 자리에 있다(시드가 달라도 같다 — 쌓은 모양과 무관)
  const spots = new Set();
  for (const seed of [1, 2, 3]) {
    await open(page, 'blocks-numviews', { seed });
    for (const q2 of questionsFor('blocks-numviews', seed)) {
      if (q2.kind === 'pick') {
        const marks = await page.locator('.blk-option .blk-picture').evaluateAll((svgs) => svgs.map((svg) => JSON.stringify({
          viewBox: svg.getAttribute('viewBox'),
          edges: [...svg.querySelectorAll('.blk-edge')].map((g) => `${g.textContent}@${g.getAttribute('transform')}`),
          arrows: [...svg.querySelectorAll('.blk-arrow')].map((a) => a.getAttribute('points')),
        })));
        expect(marks).toHaveLength(4);
        for (const m of marks) {
          expect(JSON.parse(m).edges.map((e) => e.split('@')[0])).toEqual(['앞', '옆']);
          spots.add(m);
        }
        await expect(page.locator('.blk-option .blk-edge-front').first()).toBeVisible();
      }
      await solveNumViews(page, testInfo, q2);
    }
  }
  expect(spots.size).toBe(1);
  expect(errors).toEqual([]);
});

test('정답 노출 0 (수 쓰기 · 수만 보고): 수 쓰기는 돌려 볼 수 있지만 무대에 높이(자리 값·개수)가 없고, 수만 보고 하는 문항은 답하기 전에 입체가 없다', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  // 수 쓰기: 늘 돌려 볼 수 있다(돌려 보며 세는 것이 과제). 면에 자리 값이 없고 무대에 개수가 없다
  await open(page, 'blocks-write');
  const [w] = questionsFor('blocks-write');
  await expect(stageEl(page)).toHaveClass(/can-view/);
  await expect(page.locator('.view-pad')).toBeVisible();
  expect(await page.locator('.blk-stage [data-x], .blk-stage [data-z]').count()).toBe(0);
  expect(await stageEl(page).getAttribute('data-count')).toBeNull();
  expect(await page.locator('.blk-ncell[data-x]').count()).toBe(count(topView(w.target)));
  expect(await page.locator('.blk-ncell[data-x]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')).filter((t) => !t.endsWith('아직 안 씀')))).toEqual([]);
  await press(testInfo, page.locator('.blk-dir[data-dir="front"]'));
  await calm(page);
  expect(await page.locator('.blk-stage [data-x]').count()).toBe(0);
  // 맞힌 뒤에는 쌓기나무를 누르면 그 자리의 수가 뜬다(자리 값이 생긴다)
  await writeByPress(page, testInfo, w.target);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  expect(await page.locator('.blk-stage [data-x]').count()).toBeGreaterThan(0);
  // 수만 보고: 답하기 전 무대 요소 0, 수를 쓴 그림만 있다
  await open(page, 'blocks-numviews');
  for (const q of questionsFor('blocks-numviews')) {
    await expect(stageEl(page)).toHaveCount(0);
    await expect(page.locator('.view-pad')).toBeHidden();
    await expect(page.locator('.blk-plan-card .blk-grid-num')).toHaveCount(count(topView(q.target)));
    await solveNumViews(page, testInfo, q);
  }
  await expect(page.locator('.result-title')).toBeVisible();
  expect(errors).toEqual([]);
});

test('정답 노출 0 (쌓는 단계 · 수 쓰기 · 칠하기): [확인하기] 전에는 견준 표시(✗·겹친 그림·다른 칸)가 어디에도 없고, 알림은 내가 한 일만 말한다', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  for (const id of ['blocks-build', 'blocks-fromnum']) {
    await open(page, id);
    const [q] = questionsFor(id);
    const given = () => page.evaluate(() => [...document.querySelectorAll('.blk-card svg, .blk-given svg')].map((s) => s.outerHTML).join(''));
    const start = await given();
    const wrong = mirrorMap(q.target);
    await padBuild(page, testInfo, wrong);
    await expect(page.locator('.is-diff, .blk-x, .blk-grid-diff, .blk-over, .reason, .blk-hint:visible')).toHaveCount(0);
    expect(await given()).toBe(start);
    expect(await liveText(page)).not.toMatch(/맞|틀|달라|같아/);
    await check(testInfo, page);
    await expect(page.locator('.reason')).toContainText('달라요');
    await expect(page.locator('.blk-grid-diff').first()).toBeVisible();
    // 고치기 시작하면(하나 더 쌓으면) 표시가 사라진다
    const spot = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]].find(([x, y]) => wrong[y][x] < 3);
    await press(testInfo, cell(page, spot[0], spot[1]));
    await expect(page.locator('.blk-grid-diff, .blk-over')).toHaveCount(0);
  }
  for (const id of ['blocks-draw', 'blocks-write']) {
    await open(page, id);
    const [q] = questionsFor(id);
    if (id === 'blocks-draw') await paint(page, testInfo, q.kinds[0], mirrorCells(q.views[q.kinds[0]]));
    else await writeByPress(page, testInfo, q.target.map((row) => row.map((v) => (v ? 1 : 0))));
    await expect(page.locator('.is-diff, .blk-over, .reason')).toHaveCount(0);
    expect(await liveText(page)).not.toMatch(/맞|틀|달라|같아/);
  }
  expect(errors).toEqual([]);
});

// ── 틀린 답·힌트·별 ──────────────────────────
test('앞과 뒤: 틀리면 까닭(좌우로 뒤집혀요)과 함께 주어진 쪽에서 반대쪽으로 돌아가고, 다섯 방향 버튼으로 돌려 본다. 별은 틀린 횟수로', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-flip');
  const qs = questionsFor('blocks-flip');
  for (const [i, q] of qs.entries()) {
    const wrong = q.options.findIndex((o) => o.role !== 'answer') + 1;
    // 잠깐만 보이는 상태(주어진 쪽을 본 모습)를 놓치지 않게, 무대가 본 방향을 모두 적어 둔다
    await stageEl(page).evaluate((el) => {
      window.__facings = [];
      window.__facingObserver?.disconnect();
      window.__facingObserver = new MutationObserver(() => {
        if (el.dataset.facing && window.__facings.at(-1) !== el.dataset.facing) window.__facings.push(el.dataset.facing);
      });
      window.__facingObserver.observe(el, { attributes: true, attributeFilter: ['data-facing'] });
    });
    await press(testInfo, page.locator(`.blk-choice[data-answer="${i === 0 ? wrong : q.expected}"]`));
    if (i === 0) {
      await expect(page.locator('.reason')).toContainText('좌우로 뒤집혀요.');
      await expect(page.locator('.reason')).toContainText('옆은 오른쪽이에요.');
      await expect(page.locator(`.blk-choice[data-answer="${q.expected}"]`)).toHaveClass(/is-answer/);
    }
    // 주어진 쪽에서 본 뒤 반대쪽으로 돈다
    await expect(stageEl(page)).toHaveAttribute('data-facing', q.ask === 'back' ? 'back' : 'left', { timeout: 5000 });
    expect(await page.evaluate(() => window.__facings)).toEqual([q.given, q.ask]);
    // 방향 버튼 다섯: 위·앞·뒤·오른쪽·왼쪽
    expect(await page.locator('.blk-dir').evaluateAll((els) => els.map((el) => el.textContent.trim()))).toEqual(['위', '앞', '뒤', '오른쪽', '왼쪽']);
    await press(testInfo, page.locator('.blk-dir[data-dir="side"]'));
    await expect(stageEl(page)).toHaveAttribute('data-facing', 'side');
    await next(testInfo, page);
  }
  await expect(page.locator('.result-title')).toBeVisible();
  // 3문항 가운데 하나 틀림: 정답률 67%(정답률 기준이면 ★1)이지만 틀린 횟수 기준으로 ★2
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 2개');
  await expect(page.locator('.star-hint')).toHaveText('한 번도 틀리지 않으면 별 3개!');
  expect(errors).toEqual([]);
});

test('그리기: 틀린 [확인하기]도 기록되고(고치지 않고 또 누르면 다시 세지 않는다) 입체가 그 방향으로 돌아 내 그림을 겹쳐 보인다. 다르게 두 번 틀리면 힌트', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-draw');
  const [q1, q2, q3] = questionsFor('blocks-draw');
  const kind = q1.kinds[0];
  // 빈 모눈으로 확인: 기록하지 않고 알림만
  await check(testInfo, page);
  await expect(page.locator('.toast')).toContainText('먼저 칠해요.');
  await expect(page.locator('.reason')).toHaveCount(0);
  await expect(stageEl(page)).toHaveClass(/is-frozen/);
  // 좌우로 뒤집어 칠한다 → 틀림
  const mirrored = mirrorCells(q1.views[kind]);
  await paint(page, testInfo, kind, mirrored);
  await check(testInfo, page);
  const r = judgeDrawing(q1, { [kind]: mirrored });
  await expect(page.locator('.reason')).toContainText('뒤집혔어요');
  // 입체가 풀리고 그 방향으로 돌아 겹친 그림에 다른 칸 ✗
  await expect(stageEl(page)).not.toHaveClass(/is-frozen/);
  await expect(stageEl(page)).toHaveAttribute('data-facing', kind);
  await calm(page);
  expect(await page.locator('.blk-stage .blk-over.is-extra').count()).toBe(r.diff[kind].filter((d) => d.state === 'extra').length);
  expect(await page.locator('.blk-stage .blk-over.is-missing').count()).toBe(r.diff[kind].filter((d) => d.state === 'missing').length);
  await expect(page.locator('.blk-stage .blk-over-chip')).toHaveText('여기가 달라요');
  expect(await page.locator('.blk-pcell.is-diff').count()).toBe(r.diff[kind].length);
  await expect(page.locator('.blk-hint')).toBeHidden();
  // 고치지 않고 또 누름: 세지 않는다
  for (let i = 0; i < 2; i += 1) {
    await check(testInfo, page);
    await expect(page.locator('.toast')).toContainText('이미 확인한');
  }
  await expect(page.locator('.blk-hint')).toBeHidden();
  // 다른 틀린 그림으로 두 번째 틀림 → 힌트
  await press(testInfo, pcell(page, kind, 2, 2));
  await expect(page.locator('.blk-pcell.is-diff, .blk-stage .blk-over')).toHaveCount(0);
  const second = await paintedOf(page, kind);
  if (judgeDrawing(q1, { [kind]: second }).correct) await press(testInfo, pcell(page, kind, 2, 1));
  await check(testInfo, page);
  await expect(page.locator('.blk-hint')).toBeVisible();
  await press(testInfo, page.locator('.blk-hint'));
  await expect(page.locator('.blk-hint-text')).toContainText('세로줄은');
  // 맞게 고친다 → 별은 정답률 기준(3문항을 맞힐 때까지: 두 번 틀리면 5번 중 3번 = 60% → ★1)
  await paint(page, testInfo, kind, q1.views[kind]);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await expect(page.locator('.blk-pcell').first()).toBeDisabled();
  await next(testInfo, page);
  await solveDraw(page, testInfo, q2);
  // 위·앞·옆 셋: 위에서 본 모양은 매트 왼쪽, 앞은 작업 지시서에. 옆은 판이 매트 옆에 있는 크롬북에서는 매트 오른쪽("옆" 쪽),
  // 판이 매트 아래로 가는 태블릿 세로에서는 작업 지시서에 (review-blocks-s2 S2-3 — 1001~1279px에서 판을 1·2차시처럼 좁힌다)
  await expect(page.locator('.blk-mat .blk-paint[data-kind="top"]')).toBeVisible();
  await expect(page.locator('.blk-panel .blk-paint[data-kind="front"]')).toBeVisible();
  if (isTouch(testInfo)) await expect(page.locator('.blk-panel .blk-paint[data-kind="side"]')).toBeVisible();
  else {
    await expect(page.locator('.blk-mat .blk-paintbox.is-side .blk-paint[data-kind="side"]')).toBeVisible();
    // 옆 모눈 상자는 매트 오른쪽 — 무대 가운데보다 오른쪽, 위 모눈 상자는 왼쪽
    const [topBox, sideBox, stageBox] = await Promise.all(['.blk-paintbox:not(.is-side)', '.blk-paintbox.is-side', '.blk-stage'].map((sel) => page.locator(sel).boundingBox()));
    expect(sideBox.x).toBeGreaterThan(stageBox.x + stageBox.width / 2);
    expect(topBox.x + topBox.width).toBeLessThan(stageBox.x + stageBox.width / 2);
  }
  // 앞과 옆을 바꿔 칠하면 "앞과 옆"
  await paint(page, testInfo, 'top', q3.views.top);
  await paint(page, testInfo, 'front', q3.views.side);
  await paint(page, testInfo, 'side', q3.views.front);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('앞, 옆에서 본 모양에 다른 칸이 있어요.');
  await paint(page, testInfo, 'front', q3.views.front);
  await paint(page, testInfo, 'side', q3.views.side);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  // 맞히면 위 → 앞 → 옆으로 차례로 돈다(끝은 옆)
  await expect(stageEl(page)).toHaveAttribute('data-facing', 'side', { timeout: 6000 });
  await next(testInfo, page);
  await expect(page.locator('.result-title')).toBeVisible();
  await expect(page.getByText('6번 중 3번 맞힘')).toBeVisible();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 1개');
  expect(errors).toEqual([]);
});

test('위, 앞, 옆을 보고 쌓기: 틀리면 다른 그림에 ✗와 무대에 주어진 그림을 겹치고, 예상 뒤 여러 가지인 문항은 다른 개수로 한 번 더(같은 쌓기·같은 개수는 기록하지 않는다)', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-build');
  const qs = questionsFor('blocks-build');
  for (const [i, q] of qs.entries()) {
    if (i === 0) {
      const wrong = mirrorMap(q.target);
      const r = judgeThree(q, wrong);
      if (!r.correct) {
        await padBuild(page, testInfo, wrong);
        await check(testInfo, page);
        await expect(page.locator('.reason')).toContainText('세 그림과 견줘 보면 달라요.');
        const marked = r.diff.top.length + r.diff.front.length + r.diff.side.length;
        expect(await page.locator('.blk-views .blk-grid-diff').count()).toBe(marked);
        // 내 쌓기와 같은 그림은 이름표 옆에 ✓, 다른 그림은 칸에 ✗ (review-blocks-s2 S2-7)
        const figs = await page.locator('.blk-views .blk-view-fig').evaluateAll((els) => els.map((f) => ({ check: Boolean(f.querySelector('figcaption .blk-same')), x: f.querySelectorAll('.blk-grid-diff').length })));
        expect(figs.map((f) => f.check)).toEqual(['top', 'front', 'side'].map((k) => r.diff[k].length === 0));
        expect(figs.map((f) => f.x)).toEqual(['top', 'front', 'side'].map((k) => r.diff[k].length));
        expect(figs.some((f) => f.check)).toBe(true);
        await expect(stageEl(page)).toHaveAttribute('data-facing', /^(top|front|side)$/);
        await calm(page);
        expect(await page.locator('.blk-stage .blk-over').count()).toBeGreaterThan(0);
        await check(testInfo, page);
        await expect(page.locator('.toast')).toContainText('이미 확인한');
      }
    }
    await padBuild(page, testInfo, q.target);
    await check(testInfo, page);
    await expect(page.locator('.blk-guess')).toBeVisible();
    // 예상하는 동안 쌓기가 잠긴다(돌려 보기는 된다)
    await expect(cell(page, 0, 0)).toBeDisabled();
    await expect(stageEl(page)).toHaveClass(/can-view/);
    await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected}"]`));
    if (q.many) {
      await expect(page.locator('.reason')).toContainText('개수가 다른 쌓기가 있어요.');
      // 같은 쌓기 그대로: 기록하지 않고 알림만
      await check(testInfo, page);
      await expect(page.locator('.toast')).toContainText('이미 한 쌓기예요.');
      const same = q.fills.find((g) => mapKey(g) !== mapKey(q.target) && count(g) === count(q.target));
      if (same) {
        await padBuild(page, testInfo, same);
        await check(testInfo, page);
        await expect(page.locator('.toast')).toContainText('개수가');
      }
      const other = q.fills.find((g) => count(g) !== count(q.target));
      await padBuild(page, testInfo, other);
      await check(testInfo, page);
      await expect(page.locator('.reason')).toContainText(`쌓기나무 ${count(q.target)}개로 만든 것도, ${count(other)}개로 만든 것도`);
      await expect(page.locator('.blk-stage .blk-hid')).toHaveText('달라진 자리');
    } else await expect(page.locator('.reason')).toContainText('하나뿐이라 개수도 하나로 정해져요.');
    await next(testInfo, page);
  }
  await expect(page.locator('.result-title')).toBeVisible();
  // 기록: 틀림 1 + 맞힘 7(같은 쌓기·같은 개수는 세지 않았다)
  await expect(page.getByText(/8번 중 7번 맞힘|7번 중 7번 맞힘/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('자리마다 몇 개?: 칸을 눌러 수를 올리고(1 → 2 → 3 → 1) [내리기][올리기]로 고친다. 틀리면 그 자리에 ✗, 맞히면 자리마다 아래부터 세어 모두 몇 개인지', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-write', { extra: '&fx=low' });
  const [q] = questionsFor('blocks-write');
  const spots = [];
  q.top.forEach((row, y) => row.forEach((on, x) => {
    if (on) spots.push([x, y]);
  }));
  // 빈 칸이 있으면 기록하지 않는다
  await check(testInfo, page);
  await expect(page.locator('.toast')).toContainText('모든 자리에 수를 써요.');
  // 누를 때마다 하나씩 올라가고 3 다음은 1
  const [x0, y0] = spots[0];
  for (const want of [1, 2, 3, 1]) {
    await press(testInfo, ncell(page, x0, y0));
    await expect(ncell(page, x0, y0)).toHaveText(String(want));
  }
  await expect(ncell(page, x0, y0)).toHaveClass(/is-chosen/);
  await press(testInfo, page.locator('.blk-nstep[data-step="1"]'));
  await expect(ncell(page, x0, y0)).toHaveText('2');
  await press(testInfo, page.locator('.blk-nstep[data-step="-1"]'));
  await press(testInfo, page.locator('.blk-nstep[data-step="-1"]'));
  await expect(ncell(page, x0, y0)).toHaveText('1'); // 1 아래로는 내려가지 않는다
  // 모두 1로 쓰고 확인 → 1보다 높은 자리에 ✗
  await writeByPress(page, testInfo, q.target.map((row) => row.map((v) => (v ? 1 : 0))));
  await check(testInfo, page);
  const wrong = spots.filter(([x, y]) => q.target[y][x] > 1);
  await expect(page.locator('.blk-ncell.is-diff')).toHaveCount(wrong.length);
  await expect(page.locator('.reason')).toContainText('이 수는 그 자리에 쌓인 쌓기나무의 개수예요.');
  await check(testInfo, page);
  await expect(page.locator('.toast')).toContainText('이미 확인한');
  // 맞게 고친다 → 자리마다 센 수가 무대에 뜨고(움직임 줄이기라 바로) 모두 몇 개
  await writeByPress(page, testInfo, q.target);
  await expect(page.locator('.blk-ncell.is-diff')).toHaveCount(0);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText(`모두 ${count(q.target)}개예요.`);
  await expect(stageEl(page)).toHaveAttribute('data-counted', String(count(q.target)));
  const tallies = await page.locator('.blk-stage .blk-tally').allTextContents();
  expect(tallies.map(Number).reduce((a, b) => a + b, 0)).toBe(count(q.target));
  // 쌓기나무를 누르면 그 자리의 수
  const top = page.locator('.blk-stage .blk-face.blk-top').last();
  const [sx, sy] = await top.evaluate((el) => [Number(el.dataset.x), Number(el.dataset.y)]);
  await press(testInfo, top);
  await expect(page.locator('.toast')).toContainText(`${spotName(sx, sy)} 자리는 ${q.target[sy][sx]}개예요.`);
  expect(errors).toEqual([]);
});

test('수를 보고 쌓기: 틀리면 수를 쓴 그림의 그 자리에 ✗, 두 번 틀리면 힌트(그 자리 표시). 별은 틀린 횟수로', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-fromnum');
  const [q1, q2] = questionsFor('blocks-fromnum');
  const flat = q1.target.map((row) => row.map((v) => (v ? 1 : 0)));
  await padBuild(page, testInfo, flat);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('수는 그 자리에 쌓인 쌓기나무의 개수예요.');
  expect(await page.locator('.blk-card .blk-grid-diff').count()).toBe(q1.target.flat().filter((v) => v > 1).length);
  await expect(page.locator('.blk-hint')).toBeHidden();
  await padBuild(page, testInfo, mirrorMap(q1.target));
  await check(testInfo, page);
  await expect(page.locator('.blk-hint')).toBeVisible();
  await press(testInfo, page.locator('.blk-hint'));
  await expect(page.locator('.blk-hint-text')).toContainText('자리의 수는');
  await expect(page.locator('.blk-card .blk-grid-mark')).toHaveCount(1);
  await padBuild(page, testInfo, q1.target);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
  await solveFromNum(page, testInfo, q2);
  await expect(page.locator('.result-title')).toBeVisible();
  // 두 번 틀림: 정답률 4번 중 2번 = 50%, 틀린 횟수 기준 ★1
  await expect(page.getByText('4번 중 2번 맞힘')).toBeVisible();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 1개');
  await expect(page.locator('.star-hint')).toHaveText('한 번만 틀리면 별 2개, 한 번도 틀리지 않으면 별 3개!');
  expect(errors).toEqual([]);
});

test('수만 보고 알아내기: 칠하기를 틀리면 입체가 나타나 그 방향에서 내 그림을 겹쳐 보이고, 고르기는 한 번 답한다. 별은 틀린 횟수로(두 번 틀림 → ★1)', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-numviews');
  const [front, side, pick] = questionsFor('blocks-numviews');
  await expect(stageEl(page)).toHaveCount(0);
  await solveNumViews(page, testInfo, front);
  await expect(stageEl(page)).toHaveCount(0);
  // 옆: 앞에서 본 모양을 칠하면 "앞과 옆"
  await paint(page, testInfo, 'side', side.views.front);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('그린 것은 앞에서 본 모양이에요.');
  await expect(stageEl(page)).toHaveCount(1);
  await expect(stageEl(page)).toHaveAttribute('data-facing', 'side', { timeout: 5000 });
  await expect(page.locator('.blk-card .blk-grid-num')).toHaveCount(count(topView(side.target)));
  await paint(page, testInfo, 'side', side.views.side);
  await check(testInfo, page);
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await next(testInfo, page);
  // 고르기: 일부러 틀린 보기
  await expect(stageEl(page)).toHaveCount(0);
  await expect(page.locator('.blk-pictures .blk-choice')).toHaveCount(4);
  const wrong = pick.options.findIndex((o) => o.role !== 'answer') + 1;
  await press(testInfo, page.locator(`.blk-choice[data-answer="${wrong}"]`));
  await expect(page.locator('.reason')).toBeVisible();
  await expect(page.locator(`.blk-choice[data-answer="${pick.expected}"]`)).toHaveClass(/is-answer/);
  await expect(page.locator('.blk-pictures')).toHaveClass(/is-answered/);
  await calm(page);
  expect(await drawnMap(page)).toEqual(pick.target);
  await next(testInfo, page);
  await expect(page.locator('.result-title')).toBeVisible();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 1개');
  expect(errors).toEqual([]);
});

// ── 조작 수단마다 ───────────────────────────
test('키보드만: 칠하기(방향키 + Space)·수 쓰기(방향키 + 숫자·+ −)·고르기(Tab + Enter)로 3·4차시의 칠하기·수 쓰기 단계를 끝까지', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '키보드는 크롬북에서');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-draw');
  for (const q of questionsFor('blocks-draw')) {
    for (const kind of q.kinds) {
      // 그 모눈의 첫 칸에 초점을 두고 방향키로 돌며 칠한다
      const grid = page.locator(`.blk-paint[data-kind="${kind}"] .blk-pgrid`);
      await grid.locator('.blk-pcell[tabindex="0"]').focus();
      const target = q.views[kind];
      // 1행 1열(맨 아래 왼쪽)에서 시작: 행마다 오른쪽으로 → 위로
      for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 3; c += 1) {
          if (target[r][c]) await page.keyboard.press('Space');
          if (c < 2) await page.keyboard.press('ArrowRight');
        }
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        if (r < 2) await page.keyboard.press('ArrowUp');
      }
      expect(await paintedOf(page, kind)).toEqual(target);
    }
    await page.locator('.blk-check').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.reason')).toContainText('맞아요!');
    await expect(page.locator('.next-btn')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await open(page, 'blocks-write');
  for (const q of questionsFor('blocks-write')) {
    // Tab으로 수 쓰기 판에 들어가 방향키로 자리를 옮기며 숫자 키로 쓴다
    await page.locator('.blk-ncell[tabindex="0"]').focus();
    const spots = [];
    q.top.forEach((row, y) => row.forEach((on, x) => {
      if (on) spots.push([x, y]);
    }));
    for (const [x, y] of spots) {
      await ncell(page, x, y).focus();
      await page.keyboard.press(String(q.target[y][x]));
    }
    // + − 도 된다(1~3 안에서)
    const [x0, y0] = spots[0];
    await ncell(page, x0, y0).focus();
    for (const key of q.target[y0][x0] === 3 ? ['-', '+'] : ['+', '-']) await page.keyboard.press(key);
    expect(await numbersOf(page)).toEqual(q.target);
    await page.locator('.blk-check').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.reason')).toContainText('맞아요!');
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  // 고르기: Tab으로 보기에 가서 Enter
  await open(page, 'blocks-flip');
  for (const q of questionsFor('blocks-flip')) {
    await page.locator(`.blk-choice[data-answer="${q.expected}"]`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.reason')).toContainText('맞아요!');
    await expect(page.locator('.next-btn')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  expect(errors).toEqual([]);
});

// ── 배치 ────────────────────────────────
const SIZES = [
  { name: '크롬북 1366×768', width: 1366, height: 768, project: 'chromebook' },
  { name: '크롬북 1366×680', width: 1366, height: 680, project: 'chromebook' },
  { name: '태블릿 820×1180', width: 820, height: 1180, project: 'tablet' },
  { name: '가로 태블릿 1024×768', width: 1024, height: 768, project: 'chromebook' },
];

for (const size of SIZES) {
  test(`배치(${size.name}): 3·4차시 여섯 단계의 모든 장면에 세로·가로 스크롤이 없고, 판 안쪽이 넘치지 않으며, 매트와 머리가 움직이지 않는다`, async ({ page }, testInfo) => {
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
      const room = await panelRoom(page);
      if (room.fixed) expect(room.spare, `${label}: 판의 세로 여유 ${room.spare}px < 글 한 줄 ${room.line}px`).toBeGreaterThanOrEqual(room.line);
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
    // 앞과 뒤: 첫 문항은 틀린다
    await begin('blocks-flip');
    for (const [i, q] of questionsFor('blocks-flip').entries()) {
      const wrong = q.options.findIndex((o) => o.role !== 'answer') + 1;
      await press(testInfo, page.locator(`.blk-choice[data-answer="${i === 0 ? wrong : q.expected}"]`));
      await expect(page.locator('.reason')).toBeVisible();
      if (i === 0) await expectToastClear(page, 'flip 틀린 알림');
      await scene(`flip ${i + 1} 답한 뒤`);
      await next(testInfo, page);
      if (i < 2) await scene(`flip ${i + 2}`);
    }
    await noScroll(page, 'flip 결과');
    // 그리기: 첫 문항 틀림 → 힌트 → 맞힘, 셋째(세 장) 틀림 → 맞힘
    await begin('blocks-draw');
    for (const [i, q] of questionsFor('blocks-draw').entries()) {
      if (i !== 1) {
        for (const kind of q.kinds) await paint(page, testInfo, kind, mirrorCells(q.views[kind]));
        if (q.kinds.every((k) => judgeDrawing(q, { [k]: mirrorCells(q.views[k]) }).correct)) await paint(page, testInfo, q.kinds[0], [[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
        await check(testInfo, page);
        if (i === 0) await expectToastClear(page, 'draw 틀린 알림');
        await scene(`draw ${i + 1} 틀림`);
        if (i === 0) {
          await paint(page, testInfo, q.kinds[0], [[1, 0, 0], [0, 0, 0], [0, 0, 0]]);
          await check(testInfo, page);
          await press(testInfo, page.locator('.blk-hint'));
          await scene(`draw ${i + 1} 힌트`);
        }
      }
      for (const kind of q.kinds) await paint(page, testInfo, kind, q.views[kind]);
      await check(testInfo, page);
      await scene(`draw ${i + 1} 맞힘`);
      await next(testInfo, page);
    }
    await noScroll(page, 'draw 결과');
    // 위, 앞, 옆을 보고 쌓기: 틀림 → 힌트 → 맞힘 → 예상 틀림 → (여러 가지) 다른 개수
    await begin('blocks-build');
    for (const [i, q] of questionsFor('blocks-build').entries()) {
      if (i === 0) {
        await padBuild(page, testInfo, [[1, 1, 1], [0, 0, 0], [0, 0, 0]]);
        await check(testInfo, page);
        await expectToastClear(page, 'build 틀린 알림');
        await scene('build 틀림 1');
        await padBuild(page, testInfo, [[1, 1, 0], [0, 0, 0], [0, 0, 0]]);
        await check(testInfo, page);
        await press(testInfo, page.locator('.blk-hint'));
        await scene('build 힌트');
      }
      await padBuild(page, testInfo, q.target);
      await check(testInfo, page);
      await scene(`build ${i + 1} 예상`);
      await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected === 'yes' ? 'no' : 'yes'}"]`));
      await scene(`build ${i + 1} 예상 틀림`);
      if (q.many) {
        await padBuild(page, testInfo, q.fills.find((g) => count(g) !== count(q.target)));
        await check(testInfo, page);
        await scene(`build ${i + 1} 다른 개수`);
      }
      await next(testInfo, page);
    }
    await noScroll(page, 'build 결과');
    // 자리마다 몇 개?: 틀림 → 힌트 → 맞힘
    await begin('blocks-write');
    for (const [i, q] of questionsFor('blocks-write').entries()) {
      if (i === 0) {
        await writeByPress(page, testInfo, q.target.map((row) => row.map((v) => (v ? 1 : 0))));
        await check(testInfo, page);
        await scene('write 틀림');
        await writeByPress(page, testInfo, q.target.map((row) => row.map((v) => (v ? (v % 3) + 1 : 0))));
        await check(testInfo, page);
        await press(testInfo, page.locator('.blk-hint'));
        await scene('write 힌트');
      }
      await writeByPress(page, testInfo, q.target);
      await check(testInfo, page);
      await scene(`write ${i + 1} 맞힘`);
      await next(testInfo, page);
    }
    await noScroll(page, 'write 결과');
    // 수를 보고 쌓기: 틀림 → 힌트 → 맞힘
    await begin('blocks-fromnum');
    for (const [i, q] of questionsFor('blocks-fromnum').entries()) {
      if (i === 0) {
        await padBuild(page, testInfo, mirrorMap(q.target));
        await check(testInfo, page);
        await scene('fromnum 틀림');
        await padBuild(page, testInfo, q.target.map((row) => row.map((v) => (v ? 1 : 0))));
        await check(testInfo, page);
        await press(testInfo, page.locator('.blk-hint'));
        await scene('fromnum 힌트');
      }
      await padBuild(page, testInfo, q.target);
      await check(testInfo, page);
      await scene(`fromnum ${i + 1} 맞힘`);
      await next(testInfo, page);
    }
    await noScroll(page, 'fromnum 결과');
    // 수만 보고 알아내기: 칠하기 틀림 → 맞힘, 고르기 틀림
    await begin('blocks-numviews');
    for (const [i, q] of questionsFor('blocks-numviews').entries()) {
      if (q.kind === 'paint') {
        await paint(page, testInfo, q.kinds[0], q.views[q.kinds[0] === 'front' ? 'side' : 'front']);
        await check(testInfo, page);
        await scene(`numviews ${i + 1} 틀림`);
        await paint(page, testInfo, q.kinds[0], q.views[q.kinds[0]]);
        await check(testInfo, page);
        await scene(`numviews ${i + 1} 맞힘`);
      } else {
        await scene(`numviews ${i + 1} 고르기`);
        await press(testInfo, page.locator(`.blk-choice[data-answer="${(q.expected % 4) + 1}"]`));
        await scene(`numviews ${i + 1} 고른 뒤`);
      }
      await next(testInfo, page);
    }
    await noScroll(page, 'numviews 결과');
    expect(errors).toEqual([]);
  });
}

test('글자가 커져도(110%) 크롬북 1366×680에서 작업 지시서가 넘치지 않는다: 3·4차시의 틀린 답·까닭·쪽지가 함께 나오는 장면들', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(360_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1366, height: 680 });
  const begin = async (id, seed) => {
    await open(page, id, { seed });
    await page.addStyleTag({ content: 'html { font-size: 110% !important; }' });
    await expect.poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeGreaterThan(17);
  };
  const fits = async (label) => {
    await calm(page);
    const m = await page.evaluate(() => {
      const panel = document.querySelector('.blk-panel');
      const cut = [...panel.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0 && b.getBoundingClientRect().bottom > panel.getBoundingClientRect().bottom + 0.5).length;
      return { over: panel.scrollHeight - panel.clientHeight, page: Math.max(0, document.documentElement.scrollHeight - window.innerHeight), cut };
    });
    expect(m, label).toEqual({ over: 0, page: 0, cut: 0 });
  };
  for (const seed of [1, 2]) {
    await begin('blocks-flip', seed);
    for (const [i, q] of questionsFor('blocks-flip', seed).entries()) {
      await press(testInfo, page.locator(`.blk-choice[data-answer="${q.options.findIndex((o) => o.role !== 'answer') + 1}"]`));
      await fits(`flip ${seed} ${i + 1} 틀림`);
      await next(testInfo, page);
    }
    await begin('blocks-draw', seed);
    for (const [i, q] of questionsFor('blocks-draw', seed).entries()) {
      for (const kind of q.kinds) await paint(page, testInfo, kind, [[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
      await check(testInfo, page);
      await fits(`draw ${seed} ${i + 1} 틀림`);
      for (const kind of q.kinds) await paint(page, testInfo, kind, q.views[kind]);
      await check(testInfo, page);
      await fits(`draw ${seed} ${i + 1} 맞힘`);
      await next(testInfo, page);
    }
    await begin('blocks-build', seed);
    for (const [i, q] of questionsFor('blocks-build', seed).entries()) {
      await padBuild(page, testInfo, [[1, 1, 1], [0, 0, 0], [0, 0, 0]]);
      await check(testInfo, page);
      await fits(`build ${seed} ${i + 1} 틀림`);
      await padBuild(page, testInfo, q.target);
      await check(testInfo, page);
      await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected === 'yes' ? 'no' : 'yes'}"]`));
      await fits(`build ${seed} ${i + 1} 예상 틀림`);
      if (q.many) {
        await padBuild(page, testInfo, q.fills.find((g) => count(g) !== count(q.target)));
        await check(testInfo, page);
        await fits(`build ${seed} ${i + 1} 다른 개수`);
      }
      await next(testInfo, page);
    }
    await begin('blocks-numviews', seed);
    for (const [i, q] of questionsFor('blocks-numviews', seed).entries()) {
      if (q.kind === 'paint') {
        await paint(page, testInfo, q.kinds[0], [[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
        await check(testInfo, page);
        await fits(`numviews ${seed} ${i + 1} 틀림`);
        await paint(page, testInfo, q.kinds[0], q.views[q.kinds[0]]);
        await check(testInfo, page);
      } else await press(testInfo, page.locator(`.blk-choice[data-answer="${(q.expected % 4) + 1}"]`));
      await fits(`numviews ${seed} ${i + 1} 답한 뒤`);
      await next(testInfo, page);
    }
  }
  expect(errors).toEqual([]);
});

test('숨겨진 쌓기나무(1·2차시)를 1366×768에서 글자 110%로: 답이 끝난 뒤 위에서 본 모양 그림을 접어 작업 지시서가 넘치지 않는다 (review-blocks S1b-4)', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  for (const seed of [1, 2]) {
    await open(page, 'blocks-hidden', { seed });
    await page.addStyleTag({ content: 'html { font-size: 110% !important; }' });
    for (const q of questionsFor('blocks-hidden', seed)) {
      await padBuild(page, testInfo, q.target);
      await check(testInfo, page);
      await expect(page.locator('.blk-given')).toBeVisible();
      await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected === 'yes' ? 'no' : 'yes'}"]`));
      if (q.many) {
        await press(testInfo, cell(page, q.spot[0], q.spot[1]));
        await check(testInfo, page);
      }
      // 답이 끝났다: 주어진 그림(위에서 본 모양)은 접히고(매트의 카드에는 그림이 그대로) 판은 넘치지 않는다
      await expect(page.locator('.next-btn')).toBeVisible();
      await expect(page.locator('.blk-given')).toBeHidden();
      await expect(page.locator('.blk-card .blk-picture')).toBeVisible();
      await calm(page);
      expect(await page.evaluate(() => {
        const panel = document.querySelector('.blk-panel');
        return [panel.scrollHeight - panel.clientHeight, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)];
      }), `seed ${seed}`).toEqual([0, 0]);
      await next(testInfo, page);
    }
  }
  expect(errors).toEqual([]);
});

test('폭 901~1000px의 낮은 가로 화면(960×768): 판이 아래로 가는 배치에서 매트를 낮춰, 쌓는 동안에는 세로 스크롤이 없다 (review-blocks S1b-3)', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 960, height: 768 });
  for (const id of ['blocks-copy', 'blocks-fromnum', 'blocks-write']) {
    await open(page, id);
    await calm(page);
    await noScroll(page, id);
    // 매트는 440px까지만, 쌓기나무 한 변은 40px 이상(조작 칸 자리를 빼고도)
    const m = await page.evaluate(() => ({ mat: document.querySelector('.blk-mat').getBoundingClientRect().height, unit: parseFloat(document.querySelector('.blk-stage').style.getPropertyValue('--blk-unit')) }));
    expect(m.mat).toBeLessThanOrEqual(440);
    expect(m.unit).toBeGreaterThanOrEqual(40);
    await expectNoOverlap(page, id);
  }
  expect(errors).toEqual([]);
});

test('폭 901~1000px의 낮은 가로 화면(960×768)에서 칠하는 단계: 처음부터 세로 스크롤이 없어 모눈을 칠하고 [확인하기]를 누르는 데 화면을 움직이지 않는다 (review-blocks-s2 S2-3ⓐ)', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 960, height: 768 });
  /** 모눈 칸과 [확인하기]가 모두 화면 안(0~768px)에 있고 48px이다 */
  const allInView = () => page.evaluate(() => {
    const els = [...document.querySelectorAll('.blk-pcell'), document.querySelector('.blk-check')].filter((el) => el && el.getClientRects().length > 0);
    return {
      n: els.length,
      out: els.filter((el) => { const r = el.getBoundingClientRect(); return r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth; }).length,
      small: els.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 48 || r.height < 48; }).length,
    };
  });
  for (const id of ['blocks-draw', 'blocks-numviews']) {
    await open(page, id);
    const qs = questionsFor(id);
    let mat = null;
    for (const [i, q] of qs.entries()) {
      if (q.kind === 'pick') break;
      await calm(page);
      // 매트는 단계 안에서 움직이지 않는다(문항마다 같은 자리·크기)
      mat ??= await page.locator('.blk-mat').boundingBox();
      expect(await page.locator('.blk-mat').boundingBox()).toEqual(mat);
      await noScroll(page, `${id} ${i + 1}`);
      expect(await allInView(), `${id} ${i + 1}`).toEqual({ n: q.kinds.length * 9 + 1, out: 0, small: 0 });
      await expectNoOverlap(page, `${id} ${i + 1}`);
      if (id === 'blocks-draw') expect(parseFloat(await stageEl(page).evaluate((el) => el.style.getPropertyValue('--blk-unit')))).toBeGreaterThanOrEqual(36);
      // 칠하고 확인한다(틀린 칠하기 — 까닭이 나와도 모눈·[확인하기]는 그 자리)
      for (const kind of q.kinds) await paint(page, testInfo, kind, mirrorCells(q.views[kind]));
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await check(testInfo, page);
      await expect(page.locator('.reason')).toBeVisible();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      for (const kind of q.kinds) await paint(page, testInfo, kind, q.views[kind]);
      await check(testInfo, page);
      await expect(page.locator('.reason')).toContainText('맞아요!');
      // 맞힌 뒤에는 까닭 쪽지·[다음 문제]만큼 판이 길어질 수 있다(읽고 넘어가는 장면) — 다음 문항은 맨 위에서
      await page.evaluate(() => window.scrollTo(0, 0));
      await next(testInfo, page);
    }
  }
  expect(errors).toEqual([]);
});

test('폭 1001~1279px(1024×768): 3·4차시도 판의 폭과 쌓기나무 크기가 1·2차시와 같다 (review-blocks-s2 S2-3ⓑ)', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  const measure = () => page.evaluate(() => ({ panel: Math.round(document.querySelector('.blk-panel').getBoundingClientRect().width), unit: document.querySelector('.blk-stage')?.style.getPropertyValue('--blk-unit') ?? null }));
  await open(page, 'blocks-copy');
  await calm(page);
  const s1 = await measure();
  expect(parseFloat(s1.unit)).toBeGreaterThanOrEqual(46);
  for (const id of ['blocks-flip', 'blocks-draw', 'blocks-build', 'blocks-write', 'blocks-fromnum', 'blocks-numviews']) {
    await open(page, id);
    await calm(page);
    const m = await measure();
    expect(m.panel, id).toBe(s1.panel);
    if (id !== 'blocks-numviews') expect(m.unit, id).toBe(s1.unit);
    await noScroll(page, id);
    await expectFits(page, id);
    await expectNoOverlap(page, id);
  }
  expect(errors).toEqual([]);
});

test('낮은 화면(1366×680)에서 답하기 전 그림의 이름표가 쌓기나무를 가리지 않는다: 뒷줄이 3층인 모양 (review-blocks-s2 S2-6)', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1366, height: 680 });
  /** 이름표 상자 안에 들어온 쌓기나무 면의 깊이(px): 면(다각형)마다 이름표 안의 점이 다각형 안에 있는지 본다 */
  const covered = () => page.evaluate(() => {
    const t = document.querySelector('.blk-mat .blk-tag').getBoundingClientRect();
    const ctm = document.querySelector('.blk-stage svg').getScreenCTM();
    let depth = 0;
    for (const p of document.querySelectorAll('.blk-stage .blk-face')) {
      const pts = p.getAttribute('points').trim().split(/\s+/).map((xy) => xy.split(',').map(Number)).map(([x, y]) => [ctm.a * x + ctm.e, ctm.d * y + ctm.f]);
      const inside = (x, y) => {
        let c = false;
        for (let a = 0, b = pts.length - 1; a < pts.length; b = a, a += 1) {
          if ((pts[a][1] > y) !== (pts[b][1] > y) && x < ((pts[b][0] - pts[a][0]) * (y - pts[a][1])) / (pts[b][1] - pts[a][1]) + pts[a][0]) c = !c;
        }
        return c;
      };
      for (let y = Math.ceil(t.top); y < t.bottom; y += 1) for (let x = Math.ceil(t.left); x < t.right; x += 2) if (inside(x, y)) depth = Math.max(depth, t.bottom - y);
    }
    return Math.round(depth);
  });
  // 시드 5: 앞과 뒤 2번 · 그리기 1·2번이 뒷줄 3층(가운데 위의 이름표가 윗면을 9px 가리던 장면)
  let tall = 0;
  for (const id of ['blocks-flip', 'blocks-draw']) {
    await open(page, id, { seed: 5 });
    for (const [i, q] of questionsFor(id, 5).entries()) {
      await expect(stageEl(page)).toHaveClass(/is-frozen/);
      await expect(page.locator('.blk-mat .blk-tag')).toBeVisible();
      await calm(page);
      expect(await covered(), `${id} ${i + 1}`).toBe(0);
      if (q.target.some((row, y) => y === 2 && row.some((v) => v === 3))) tall += 1;
      await expectNoOverlap(page, `${id} ${i + 1}`);
      if (id === 'blocks-flip') await solveFlip(page, testInfo, q);
      else await solveDraw(page, testInfo, q);
    }
  }
  expect(tall).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('휴대폰(390×844): 3·4차시 화면에 가로 스크롤이 없고, 칠하기 칸·수 쓰기 칸이 48px이며 [확인하기]가 한 화면에 들어온다', async ({ page }, testInfo) => {
  test.skip(!isTouch(testInfo), '터치 기기에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['blocks-flip', 'blocks-draw', 'blocks-build', 'blocks-write', 'blocks-fromnum', 'blocks-numviews']) {
    await open(page, id);
    await calm(page);
    expect(await hasHorizontalScroll(page), id).toBe(false);
    const small = await page.evaluate(() => [...document.querySelectorAll('.blk-pcell, .blk-ncell[data-x], .blk-cell, .blk-choice, .blk-check, .blk-nstep')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width < 47.5 || r.height < 47.5).length);
    expect(small, id).toBe(0);
  }
  // 수 쓰기를 끝까지(손가락)
  await open(page, 'blocks-write');
  await solveWrite(page, testInfo, questionsFor('blocks-write')[0]);
  expect(await hasHorizontalScroll(page)).toBe(false);
  expect(errors).toEqual([]);
});

// ── 접근성·정리 ───────────────────────────
test('접근성: 모눈·수 쓰기 판의 이름과 칸 이름, 주어진 그림의 글 이름, 알림(칠한 칸·쓴 수), 단계를 나가면 남는 것이 없다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-draw');
  const [q] = questionsFor('blocks-draw');
  const kind = q.kinds[0];
  await expect(page.locator(`.blk-paint[data-kind="${kind}"] .blk-pgrid`)).toHaveAttribute('aria-label', /모눈\. 방향키로 칸을 옮기고, Space나 Enter로 칠하거나 지워요\./);
  await expect(pcell(page, kind, 0, 1)).toHaveAttribute('aria-label', '왼쪽에서 2번째 세로줄 1층, 빈칸');
  await pcell(page, kind, 0, 1).click();
  await expect(pcell(page, kind, 0, 1)).toHaveAttribute('aria-label', '왼쪽에서 2번째 세로줄 1층, 칠함');
  await expect.poll(() => liveText(page)).toContain('왼쪽에서 2번째 세로줄 1층을 칠했어요.');
  // 초점 표시
  await pcell(page, kind, 0, 1).focus();
  await page.keyboard.press('ArrowRight');
  expect(await pcell(page, kind, 0, 2).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  // 수 쓰기 판
  await open(page, 'blocks-write');
  const [w] = questionsFor('blocks-write');
  await expect(page.locator('.blk-ngrid')).toHaveAttribute('aria-label', /방향키로 자리를 옮기고, 숫자 1부터 3이나 \+ 와 - 로 수를 써요\./);
  const [x, y] = (() => {
    for (let yy = 0; yy < 3; yy += 1) for (let xx = 0; xx < 3; xx += 1) if (w.top[yy][xx]) return [xx, yy];
    return [0, 0];
  })();
  await ncell(page, x, y).focus();
  await page.keyboard.press('2');
  await expect(ncell(page, x, y)).toHaveAttribute('aria-label', `${spotName(x, y)}, 2개`);
  await expect.poll(() => liveText(page)).toContain(`${spotName(x, y)}에 2를 썼어요.`);
  // 주어진 그림의 글 이름: 수를 쓴 그림 · 위·앞·옆 그림
  await open(page, 'blocks-fromnum');
  await expect(page.locator('.blk-card .blk-grid-pic')).toHaveAttribute('aria-label', /^수를 쓴 위에서 본 모양: \d줄 \d칸 \d/);
  await open(page, 'blocks-build');
  const labels = await page.locator('.blk-views .blk-grid-pic').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(labels[0]).toMatch(/^위에서 본 모양: 쌓인 자리는 /);
  expect(labels[1]).toMatch(/^앞에서 본 모양: 왼쪽부터 /);
  expect(labels[2]).toMatch(/^옆에서 본 모양: 왼쪽부터 /);
  // 세는 도중에 단계를 나간다: 타이머가 남지 않는다(나간 뒤 오류 없음)
  await open(page, 'blocks-write');
  await writeByPress(page, testInfo, w.target);
  await page.locator('.blk-check').click();
  await page.evaluate(() => document.querySelector('.btn-back').click());
  // 단계에서 나갔다(나간 뒤의 화면은 영역 화면이 생기면 바뀌므로 무대가 없어진 것만 본다)
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('.blk-stage, .blk-panel').length)).toBe(0);
  expect(errors).toEqual([]);
});

test('점수: 별 3개를 받은 3·4차시 단계를 다시 해도 점수가 쌓이지 않는다', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  const playOnce = async () => {
    await open(page, 'blocks-write');
    for (const q of questionsFor('blocks-write')) await solveWrite(page, testInfo, q);
    await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
    return resultXp(page);
  };
  expect(await playOnce()).toEqual({ tiles: 7, line: 11, gained: 18, saved: 18 });
  expect(await playOnce()).toEqual({ tiles: 0, line: 0, gained: 0, saved: 18 });
  await expect(page.locator('.practice-note')).toContainText('별 3개를 받은 단계라 연습 점수는 없어요.');
  expect(errors).toEqual([]);
});
