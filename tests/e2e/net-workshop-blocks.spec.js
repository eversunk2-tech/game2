/**
 * 쌓기나무 영역(S1: 1·2차시) 브라우저 검사. 기획서: docs/games/net-workshop/spec-grade6.md 3·5·11절, 공통 규칙: common-rules.md
 * 정답은 게임과 같은 시드로 blocks-logic.js를 불러 계산한다(DOM에 정답을 숨겨 두지 않는다).
 * 글자 폭에 기대는 픽셀 상수는 쓰지 않는다(글꼴 흉내 모드 E2E_WIDE_TEXT=font에서도 통과해야 한다).
 */
import { expect, test } from '@playwright/test';
import { createRng } from '../../src/shared/core/random.js';
import { count, hiddenCells, picturedFaces, frontView, sideView, topView, targetOf, OPPOSITE } from '../../src/games/net-workshop/blocks/blocks.js';
import { BLOCK_STAGES, DIR_LETTERS, judgeLook, makeBlockQuestions, mirrorMap, spotName } from '../../src/games/net-workshop/blocks/blocks-logic.js';
import { POSES, depthOf, poseOfRoll, poseWord, projectPoint, sceneShapes } from '../../src/games/net-workshop/blocks/block-view.js';
import { homeView, stepView } from '../../src/games/net-workshop/orbit.js';
import { collectErrors, expectNoFling, fileUrl, hasHorizontalScroll, touchFlick, touchGestures } from './helpers.js';

const FILE = 'net-workshop.html';
const stageOf = (id) => BLOCK_STAGES.find((s) => s.id === id);
/** 게임과 같은 시드 문자열(<seed>:<단계 id>)로 같은 문항을 만든다 */
const questionsFor = (id, seed = 1) => makeBlockQuestions(stageOf(id), createRng(`${seed}:${id}`));
const open = (page, stageId, { seed = 1, extra = '' } = {}) => page.goto(fileUrl(FILE, `?unlock=all&seed=${seed}&sound=off&stage=${stageId}${extra}`));
const isTouch = (testInfo) => testInfo.project.name === 'tablet';
/** 그 기기의 누르기: 태블릿은 손가락, 크롬북은 마우스 */
const press = (testInfo, locator) => (isTouch(testInfo) ? locator.tap() : locator.click());
const VIEW_OF = { front: 'front', right: 'side', back: 'back', left: 'left' };

const stageEl = (page) => page.locator('.blk-stage');
const cell = (page, x, y) => page.locator(`.blk-cell[data-x="${x}"][data-y="${y}"]`);
const tile = (page, x, y) => page.locator(`.blk-tile[data-x="${x}"][data-y="${y}"]`);
const face = (page, x, y, z, name) => page.locator(`.blk-face[data-x="${x}"][data-y="${y}"][data-z="${z}"][data-face="${name}"]`);

/** "위에서 본 판"에 적힌 내 쌓기(높이 지도) */
const padMap = (page) => page.evaluate(() => {
  const map = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const c of document.querySelectorAll('.blk-cell')) map[Number(c.dataset.y)][Number(c.dataset.x)] = Number(c.textContent || 0);
  return map;
});
/** 무대에 그려진 쌓기나무(면의 data-x·y·z)로 읽은 높이 지도 */
const drawnMap = (page) => page.evaluate(() => {
  const map = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const f of document.querySelectorAll('.blk-stage .blk-face')) {
    const { x, y, z } = f.dataset;
    map[Number(y)][Number(x)] = Math.max(map[Number(y)][Number(x)], Number(z) + 1);
  }
  return map;
});
const stageCount = (page) => stageEl(page).getAttribute('data-count').then(Number);

/** 도형(다각형)의 가운데 화면 자리 */
async function centerOf(locator) {
  const box = await locator.first().boundingBox();
  return [box.x + box.width / 2, box.y + box.height / 2];
}
/** 그 자리의 맨 위 요소가 그 도형인지 확인하고 가운데 자리를 돌려준다(다른 쌓기나무에 가려진 곳을 누르는 검사를 막는다) */
async function clearCenter(page, locator) {
  const [x, y] = await centerOf(locator);
  const same = await locator.first().evaluate((el, [px, py]) => document.elementFromPoint(px, py) === el, [x, y]);
  expect(same, '누르려는 면이 그 자리의 맨 위에 있어야 한다').toBe(true);
  return [x, y];
}

/** "위에서 본 판"을 눌러 그 높이 지도를 쌓는다 (지금 판이 비어 있다고 본다) */
async function padBuild(page, testInfo, map) {
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) for (let k = 0; k < map[y][x]; k += 1) await press(testInfo, cell(page, x, y));
  expect(await padMap(page)).toEqual(map);
}
async function clearBoard(page, testInfo) {
  if (await page.locator('.blk-clear').isEnabled()) await press(testInfo, page.locator('.blk-clear'));
  expect(await stageCount(page)).toBe(0);
}

/** 돌아가는 움직임(0.2초)이 끝날 때까지 기다린다 — 시간으로 기다리지 않는다(느린 CI에서도 흔들리지 않게) */
const settled = (page) => expect(stageEl(page)).not.toHaveClass(/is-easing/);

/** 지금 쌓기(map)에 한 개를 더 쌓아도 여전히 그림과 다른 자리를 찾아 그 칸을 눌러 쌓는다 → 새 높이 지도 */
async function addWrongBlock(page, testInfo, q, map) {
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (map[y][x] >= 3) continue;
      const next = map.map((row) => [...row]);
      next[y][x] += 1;
      if (judgeLook(q, next).correct) continue;
      await press(testInfo, cell(page, x, y));
      expect(await padMap(page)).toEqual(next);
      return next;
    }
  }
  throw new Error('틀린 채로 하나 더 쌓을 자리가 없다');
}

/** 판을 3×3×3으로 꽉 채운다(키보드로) */
async function fillAll(page) {
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      await cell(page, x, y).focus();
      await page.keyboard.press('3');
    }
  }
  expect(await stageCount(page)).toBe(27);
}

/** 쌓기나무가 무대 밖으로 나갔거나 매트의 조작 칸(방향 버튼·위에서 본 판·조작판·그림 카드) 밑으로 들어갔으면 그 이름들 */
const blocksOutside = (page) => page.evaluate(() => {
  const stage = document.querySelector('.blk-stage').getBoundingClientRect();
  const blocks = [...document.querySelectorAll('.blk-stage .blk-face')].map((p) => p.getBoundingClientRect());
  const box = { left: Math.min(...blocks.map((b) => b.left)), right: Math.max(...blocks.map((b) => b.right)), top: Math.min(...blocks.map((b) => b.top)), bottom: Math.max(...blocks.map((b) => b.bottom)) };
  const out = [];
  if (box.left < stage.left || box.right > stage.right || box.top < stage.top || box.bottom > stage.bottom) out.push('무대 밖');
  for (const el of document.querySelectorAll('.blk-mat > .blk-dirs, .blk-mat > .blk-padbox, .blk-mat > .view-pad, .blk-mat > .blk-card')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && Math.min(box.right, r.right) - Math.max(box.left, r.left) > 0 && Math.min(box.bottom, r.bottom) - Math.max(box.top, r.top) > 0) out.push(el.className.split(' ')[0]);
  }
  return out;
});

/** 화면 읽기 알림과 상태 글(aria-live·role=status) 전부 */
const liveText = (page) => page.evaluate(() => [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')].map((el) => el.textContent.trim()).filter(Boolean).join(' | '));

async function noScroll(page, label = '') {
  const m = await page.evaluate(() => ({ over: document.documentElement.scrollHeight - window.innerHeight }));
  expect(m.over, `세로 스크롤 ${label}`).toBeLessThanOrEqual(0);
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
    const buttons = [...panel.querySelectorAll('button').values()].map((b) => [panel, b]).concat([...mat.querySelectorAll('button')].map((b) => [mat, b]))
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

/**
 * 작업 지시서의 세로 여유: 판이 매트 옆에 있을 때(높이가 정해진 판) 안쪽에 남은 높이와 글 한 줄의 높이.
 * [다음 문제] 버튼은 판 맨 아래에 붙으므로(margin-top: auto) 그 위의 빈 자리를 잰다. 글자 폭에 기대는 상수는 쓰지 않는다(줄 높이는 화면에서 읽는다)
 */
const panelRoom = (page) => page.evaluate(() => {
  const panel = document.querySelector('.blk-panel');
  const mat = document.querySelector('.blk-mat').getBoundingClientRect();
  const box = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  const fixed = box.left >= mat.right - 1; // 판이 매트 오른쪽에 있다
  const kids = [...panel.children].filter((c) => c.getClientRects().length > 0 && c.getBoundingClientRect().height > 0);
  const gap = parseFloat(style.rowGap) || 0;
  const bottom = box.bottom - (parseFloat(style.borderBottomWidth) || 0) - (parseFloat(style.paddingBottom) || 0);
  const next = kids.find((c) => c.classList.contains('next-btn'));
  const above = kids.filter((c) => c !== next);
  const last = above.length ? Math.max(...above.map((c) => c.getBoundingClientRect().bottom)) : box.top;
  const spare = next ? next.getBoundingClientRect().top - last - gap : bottom - last;
  // 눌려서 줄어든 칸이 있으면 그만큼은 여유가 아니다
  const squeezed = kids.map((c) => c.scrollHeight - c.getBoundingClientRect().height).filter((d) => d > 1.5).reduce((t, d) => t + d, 0);
  const text = panel.querySelector('.note-text') ?? panel.querySelector('.q-prompt');
  const line = parseFloat(getComputedStyle(text).lineHeight) || parseFloat(getComputedStyle(text).fontSize) * 1.5;
  return { fixed, spare: Math.floor(spare - squeezed), line: Math.ceil(line) };
});

/** 매트 위의 조작 칸들(방향 버튼·위에서 본 판·조작판·그림 카드·이름표·도구 띠)이 서로 겹치지 않는다 */
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

/** 지금 보이는 알림(토스트)이 매트·판의 버튼과 겹치지 않는다 */
async function expectToastClear(page, label = '') {
  await expect(page.locator('.toast')).toBeVisible();
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

/** 결과 화면: "오늘의 솜씨" 칸 점수 합, 단계 완료·별 점수 줄의 합, "이번에 모은 솜씨 점수" */
const resultXp = (page) => page.evaluate(() => {
  const sum = (texts) => texts.flatMap((t) => t.match(/\+\d+/g) ?? []).reduce((total, x) => total + Number(x), 0);
  return {
    tiles: sum([...document.querySelectorAll('.behavior .b-xp')].map((el) => el.textContent)),
    line: sum([document.querySelector('.xp-line').textContent]),
    gained: Number(document.querySelector('.rank-card .xp-gain').textContent.replace(/\D/g, '')),
    saved: JSON.parse(localStorage.getItem('edu:net-workshop:rewards') ?? '{}').xp ?? 0,
  };
});

/** 답하기 전 화면에서 무대를 끌고, 휠을 굴리고, 키를 눌러 본다 → 그림(다각형의 점)이 그대로인지 볼 값 */
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

// ── 단계 지도와 차시 흐름 ─────────────────────
test('단계 지도: 쌓기나무 두 차시가 정육면체 차시 뒤에 보이고, ?lesson=으로 그 차시만 들어간다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await page.getByRole('button', { name: '시작하기' }).click();
  const titles = await page.locator('.lesson-group h3').allTextContents();
  expect(titles[0]).toBe('정육면체의 전개도');
  expect(titles.slice(-2)).toEqual(['어느 방향에서 보았을까', '만든 모양과 위에서 본 모양']);
  for (const [lesson, names] of [
    ['blocks-look', ['쌓기 놀이터', '어느 방향에서 보았을까?', '이쪽에서 보면?']],
    ['blocks-top', ['똑같이 만들기', '모두 몇 개일까?', '숨겨진 쌓기나무']],
  ]) {
    const group = page.locator(`.lesson-group[data-lesson="${lesson}"]`);
    await expect(group.locator('.stage-path .stage-card .stage-title')).toHaveText(names);
    await expect(group.locator('.challenge-card')).toHaveCount(0);
    await expect(group.locator('.stage-thumb svg')).toHaveCount(3);
    // 차시마다 첫 단계만 열려 있다
    await expect(group.locator('.stage-card').nth(0)).toBeEnabled();
    await expect(group.locator('.stage-card').nth(1)).toBeDisabled();
    await expect(group.locator('.stage-card').nth(2)).toBeDisabled();
  }
  // 차시 칩·시간 칩·단원: 전개도 차시는 자동 번호("n차시")와 게임의 시간(약 10분) 그대로이고 단원 글이 없다.
  // 쌓기나무 차시는 "쌓기나무 1차시"·"쌓기나무 2차시", 제 시간(약 6분·약 8분), 단원 이름이 보인다
  const heads = await page.locator('.lesson-group').evaluateAll((groups) => groups.map((g) => ({
    id: g.dataset.lesson,
    no: g.querySelector('.lesson-no').textContent,
    note: g.querySelector('.lesson-note')?.textContent ?? null,
    time: [...g.querySelectorAll('.lesson-chips .chip')].map((c) => c.textContent.trim()).filter((t) => t.startsWith('약')),
  })));
  const cubeHeads = heads.filter((head) => !head.id.startsWith('blocks-'));
  expect(cubeHeads.length).toBeGreaterThan(0);
  for (const [i, head] of cubeHeads.entries()) expect({ no: head.no, note: head.note, time: head.time }).toEqual({ no: `${i + 1}차시`, note: null, time: ['약 10분'] });
  expect(heads.filter((head) => head.id.startsWith('blocks-'))).toEqual([
    { id: 'blocks-look', no: '쌓기나무 1차시', note: '6학년 2학기 · 공간과 입체', time: ['약 6분'] },
    { id: 'blocks-top', no: '쌓기나무 2차시', note: '6학년 2학기 · 공간과 입체', time: ['약 8분'] },
  ]);
  expect(await hasHorizontalScroll(page)).toBe(false);
  // 차시 머리(칩·제목·단원·시간)가 묶음 밖으로 나가지 않는다
  expect(await page.locator('.lesson-group').evaluateAll((groups) => groups.map((g) => {
    const box = g.getBoundingClientRect();
    return [...g.querySelectorAll('.lesson-head > *')].filter((el) => el.getBoundingClientRect().right > box.right + 0.5 || el.getBoundingClientRect().left < box.left - 0.5).length;
  }))).toEqual(heads.map(() => 0));
  // 놀이 방법: 전개도 줄 뒤에 쌓기나무 줄(쌓기·빼기, 돌려 보기)이 있다
  await page.getByRole('button', { name: '처음 화면' }).click();
  await page.getByRole('button', { name: '놀이 방법' }).click();
  const howTo = await page.locator('.howto-list li').allTextContents();
  expect(howTo.slice(-2).map((t) => t.replace(/^\d+/, ''))).toEqual([
    '쌓기나무 차시에서는 판을 짧게 누르면 쌓이고, [빼기]를 누른 다음 누르면 빠져요. "위에서 본 판"의 칸을 눌러도 돼요.',
    '쌓기나무는 끌어서 여러 방향으로 돌려 보고, [위] [앞] [옆]을 누르면 그 방향에서 본 모양이 돼요.',
  ]);
  expect(howTo.slice(0, -2).join(' ')).not.toContain('쌓기나무');
  await page.goto(fileUrl(FILE, '?lesson=blocks-top&seed=1&sound=off'));
  await expect(page.locator('.eyebrow')).toHaveText('만든 모양과 위에서 본 모양');
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.lesson-group h3')).toHaveText(['만든 모양과 위에서 본 모양']);
  await expect(page.locator('.lesson-no')).toHaveText(['쌓기나무 2차시']); // 그 차시만 들어가도 "1차시"가 되지 않는다
  await expect(page.locator('.stage-card')).toHaveCount(3);
  await expect(page.getByText('모은 별 0 / 9')).toBeVisible();
  expect(errors).toEqual([]);
});

/** 고르는 문항 하나를 맞히고 다음으로 */
async function answerAndNext(page, testInfo, value) {
  await press(testInfo, page.locator(`.blk-choice[data-answer="${value}"]`));
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await press(testInfo, page.locator('.next-btn:not([hidden])'));
}

test('1차시(?lesson=blocks-look): 쌓기 놀이터 → 어느 방향에서 보았을까? → 이쪽에서 보면? 을 처음부터 끝까지', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?lesson=blocks-look&seed=1&sound=off'));
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.locator('.stage-card').first().click();

  // 쌓기 놀이터: 주문 셋(쌓기 → 빼기 → [앞]), 채점 없음
  await expect(page.locator('.order-kind')).toHaveText('연습 주문');
  const [{ spot: [gx, gy] }] = questionsFor('blocks-play');
  await expect(page.locator('.blk-task.is-now')).toContainText(`노란 자리(${spotName(gx, gy)})에 2층으로 쌓아요.`);
  await expect(page.locator('.blk-tile.is-goal')).toHaveCount(1);
  await expect(cell(page, gx, gy)).toHaveClass(/is-goal/);
  await expect(page.locator('.blk-finish')).toBeHidden();
  // 작업 지시서의 번호는 머리의 번호와 같이 올라간다
  await expect(page.locator('.q-counter')).toHaveText('주문 1 / 3');
  await expect(page.locator('.meta-progress')).toContainText('주문 1 / 3');
  await press(testInfo, cell(page, gx, gy));
  await expect(page.locator('.blk-task.is-done')).toHaveCount(0);
  await press(testInfo, cell(page, gx, gy));
  await expect(page.locator('.blk-task.is-done')).toHaveCount(1);
  await expect(page.locator('.blk-tile.is-goal')).toHaveCount(0);
  await expect(page.locator('.q-counter')).toHaveText('주문 2 / 3');
  await expect(page.locator('.meta-progress')).toContainText('주문 2 / 3');
  await press(testInfo, page.locator('.blk-mode[data-mode="remove"]'));
  await press(testInfo, cell(page, gx, gy));
  await expect(page.locator('.blk-task.is-done')).toHaveCount(2);
  await expect(page.locator('.q-counter')).toHaveText('주문 3 / 3');
  await press(testInfo, page.locator('.blk-dir[data-dir="front"]'));
  await expect(page.locator('.blk-task.is-done')).toHaveCount(3);
  await expect(page.locator('.meta-progress')).toContainText('주문 3 / 3');
  await expect(page.locator('.q-counter')).toHaveText('주문 3 / 3');
  await press(testInfo, page.locator('.blk-finish'));
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.getByText('해 본 주문')).toBeVisible();
  // 채점이 없으니 정답률·"다시 살펴볼 점"이 없고, 단계 완료 +5와 별 3개 +6만 받는다
  await expect(page.getByText('정답률')).toHaveCount(0);
  const playXp = await resultXp(page);
  expect(playXp).toEqual({ tiles: 0, line: 11, gained: 11, saved: 11 });

  await page.getByRole('button', { name: '다음 단계' }).click();
  await expect(page.locator('.order-kind')).toHaveText('관찰 주문');
  const where = questionsFor('blocks-where');
  for (const [i, q] of where.entries()) {
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${i + 1} / 4`);
    await answerAndNext(page, testInfo, q.dir);
  }
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.getByText('4번 중 4번 맞힘')).toBeVisible();
  // 화면에 보이는 점수 = 저장되는 점수: 칸 합(8 + 연속 1) + 줄(5 + 6) = 모은 점수 = 저장된 점수의 차
  const whereXp = await resultXp(page);
  expect(whereXp).toEqual({ tiles: 9, line: 11, gained: 20, saved: 31 });

  await page.getByRole('button', { name: '다음 단계' }).click();
  const scene = questionsFor('blocks-scene');
  for (const q of scene) await answerAndNext(page, testInfo, q.expected);
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  // 별은 틀린 횟수로 정한다: 한 번도 틀리지 않아 별 3개
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  await expect(page.locator('.star-hint')).toHaveText('별 3개를 모두 받았어요!');
  expect(await resultXp(page)).toEqual({ tiles: 7, line: 11, gained: 18, saved: 49 });
  expect(errors).toEqual([]);
});

/** blocks-copy 문항 하나: 판으로 쌓고 확인. 다른 쌓기를 보여 주면 "무엇을 더 알면"에 답한다 */
async function solveCopy(page, testInfo, q) {
  await padBuild(page, testInfo, q.target);
  await press(testInfo, page.locator('.blk-check'));
  await expect(page.locator('.reason')).toContainText('맞아요!');
  if (q.alt) {
    await expect(page.locator('.reason-pick')).toBeVisible();
    await expect(page.locator('.next-btn')).toBeHidden();
    await press(testInfo, page.locator('.reason-chip[data-clue="top"]'));
    await expect(page.locator('.reason-pick-result')).toContainText('설명 +2');
  }
  await press(testInfo, page.locator('.next-btn:not([hidden])'));
}

/** blocks-hidden 문항 하나: 쌓기 → 예상 → (여러 가지면) 다른 개수로 한 번 더 */
async function solveHidden(page, testInfo, q) {
  await padBuild(page, testInfo, q.target);
  await press(testInfo, page.locator('.blk-check'));
  await expect(page.locator('.blk-guess')).toBeVisible();
  await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected}"]`));
  if (q.many) {
    const [x, y] = q.spot;
    await expect(page.locator('.blk-check')).toBeVisible();
    await press(testInfo, cell(page, x, y)); // 가려진 자리에 하나 더
    await press(testInfo, page.locator('.blk-check'));
  }
  await expect(page.locator('.reason')).toContainText('맞아요!');
  await press(testInfo, page.locator('.next-btn:not([hidden])'));
}

test('2차시(?lesson=blocks-top): 똑같이 만들기 → 모두 몇 개일까? → 숨겨진 쌓기나무 를 처음부터 끝까지', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?lesson=blocks-top&seed=1&sound=off'));
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.locator('.stage-card').first().click();
  await expect(page.locator('.order-kind')).toHaveText('따라 쌓기 주문');
  for (const q of questionsFor('blocks-copy')) await solveCopy(page, testInfo, q);
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.getByText('2번 중 2번 맞힘')).toBeVisible();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  // 처음에 맞힘 2 × 2 + 설명 2 = 6, 단계 완료 5 + 별 6
  expect(await resultXp(page)).toEqual({ tiles: 6, line: 11, gained: 17, saved: 17 });

  await page.getByRole('button', { name: '다음 단계' }).click();
  await expect(page.locator('.order-kind')).toHaveText('셈 주문');
  for (const q of questionsFor('blocks-count')) await answerAndNext(page, testInfo, q.expected);
  await expect(page.getByText('4번 중 4번 맞힘')).toBeVisible();
  expect(await resultXp(page)).toEqual({ tiles: 9, line: 11, gained: 20, saved: 37 });

  await page.getByRole('button', { name: '다음 단계' }).click();
  await expect(page.locator('.order-kind')).toHaveText('탐정 주문');
  for (const q of questionsFor('blocks-hidden')) await solveHidden(page, testInfo, q);
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  // 답 5개(쌓기 2 · 예상 2 · 다른 개수로 쌓기 1) 모두 처음에 맞힘: 10 + 연속 1
  await expect(page.getByText('5번 중 5번 맞힘')).toBeVisible();
  expect(await resultXp(page)).toEqual({ tiles: 11, line: 11, gained: 22, saved: 59 });
  expect(errors).toEqual([]);
});

// ── 쌓기·빼기·돌리기: 조작 수단마다 ───────────────
const copyTarget = () => questionsFor('blocks-copy')[0].target;

test('마우스만: 판의 자리·윗면을 눌러 쌓고, 오른쪽 누르기로 빼고, 끌어서 돌리고, 휠로 키워서 [확인하기]까지', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '마우스는 크롬북에서');
  const errors = collectErrors(page);
  await open(page, 'blocks-copy');
  const target = copyTarget();
  // 눈에서 먼 자리부터 쌓는다(가까운 쌓기나무가 먼 자리를 가리지 않게)
  const spots = [];
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) if (target[y][x] > 0) spots.push([x, y]);
  spots.sort((a, b) => (a[0] - a[1]) - (b[0] - b[1]));
  for (const [x, y] of spots) {
    await page.mouse.click(...await clearCenter(page, tile(page, x, y)));
    for (let z = 1; z < target[y][x]; z += 1) await page.mouse.click(...await clearCenter(page, face(page, x, y, z - 1, 'top')));
  }
  expect(await padMap(page)).toEqual(target);
  expect(await drawnMap(page)).toEqual(target);
  // 하나 더 쌓았다가 오른쪽 누르기로 뺀다(브라우저 메뉴는 뜨지 않는다)
  const [tx, ty] = spots.at(-1);
  await page.mouse.click(...await clearCenter(page, face(page, tx, ty, target[ty][tx] - 1, 'top')));
  expect(await stageCount(page)).toBe(count(target) + 1);
  const menu = page.evaluate(() => new Promise((resolve) => {
    document.addEventListener('contextmenu', (event) => resolve(event.defaultPrevented), { once: true });
  }));
  await page.mouse.click(...await clearCenter(page, face(page, tx, ty, target[ty][tx], 'top')), { button: 'right' });
  expect(await menu).toBe(true);
  expect(await padMap(page)).toEqual(target);
  // 끌어서 돌리기(쌓이지 않는다) · 휠로 크게
  const before = await shapePoints(page);
  const box = await stageEl(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height - 60, { steps: 6 });
  await expect(stageEl(page)).toHaveClass(/is-turning/);
  await page.mouse.up();
  await expect(stageEl(page)).not.toHaveClass(/is-turning/);
  expect(await shapePoints(page)).not.toBe(before);
  expect(await padMap(page)).toEqual(target);
  await page.mouse.wheel(0, -400);
  await expect(page.locator('.view-home')).toBeEnabled();
  await page.locator('.view-home').click();
  await expect(page.locator('.view-home')).toBeDisabled();
  await page.locator('.blk-check').click();
  await expect(page.locator('.reason')).toContainText('맞아요!');
  expect(errors).toEqual([]);
});

test('터치만: 짧게 눌러 쌓고(누르는 동안 점선 쌓기나무), [빼기]로 빼고, 한 손가락으로 돌리고, 두 손가락으로 키워서 [확인하기]까지', async ({ page }, testInfo) => {
  test.skip(!isTouch(testInfo), '터치는 태블릿에서');
  const errors = collectErrors(page);
  await open(page, 'blocks-copy');
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const target = copyTarget();
  const spots = [];
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) if (target[y][x] > 0) spots.push([x, y]);
  spots.sort((a, b) => (a[0] - a[1]) - (b[0] - b[1]));
  // 첫 자리: 누르는 동안 놓일 곳이 점선 쌓기나무로 보이고(아직 놓이지 않았다), 떼면 놓인다
  const [fx, fy] = spots[0];
  const first = await clearCenter(page, tile(page, fx, fy));
  await touch('touchStart', [first]);
  await expect(page.locator('.blk-ghost-face')).toHaveCount(3);
  expect(await page.locator('.blk-ghost').evaluate((g) => [g.dataset.x, g.dataset.y, g.dataset.z].map(Number))).toEqual([fx, fy, 0]);
  expect(await stageCount(page)).toBe(0);
  await touch('touchEnd', []);
  await expect(page.locator('.blk-ghost-face')).toHaveCount(0);
  expect(await stageCount(page)).toBe(1);
  for (const [x, y] of spots) {
    if (!(x === fx && y === fy)) await page.touchscreen.tap(...await clearCenter(page, tile(page, x, y)));
    for (let z = 1; z < target[y][x]; z += 1) await page.touchscreen.tap(...await clearCenter(page, face(page, x, y, z - 1, 'top')));
  }
  expect(await padMap(page)).toEqual(target);
  // 하나 더 쌓았다가 [빼기] 상태에서 눌러 뺀다
  const [tx, ty] = spots.at(-1);
  await page.touchscreen.tap(...await clearCenter(page, face(page, tx, ty, target[ty][tx] - 1, 'top')));
  expect(await stageCount(page)).toBe(count(target) + 1);
  await page.locator('.blk-mode[data-mode="remove"]').tap();
  await expect(stageEl(page)).toHaveClass(/is-remove/);
  await page.touchscreen.tap(...await clearCenter(page, face(page, tx, ty, target[ty][tx], 'top')));
  expect(await padMap(page)).toEqual(target);
  await page.locator('.blk-mode[data-mode="add"]').tap();
  // 한 손가락으로 끌어 돌린다(쌓이지 않는다) · 두 손가락을 벌려 키운다(브라우저 확대는 그대로 1배)
  const before = await shapePoints(page);
  const box = await stageEl(page).boundingBox();
  const cx = box.x + box.width / 2;
  const by = box.y + box.height - 24;
  await touch('touchStart', [[cx, by]]);
  for (let i = 1; i <= 6; i += 1) await touch('touchMove', [[cx + i * 14, by - i * 4]]);
  await touch('touchEnd', []);
  expect(await shapePoints(page)).not.toBe(before);
  expect(await padMap(page)).toEqual(target);
  await touch('touchStart', [[cx - 30, by]]);
  await touch('touchStart', [[cx - 30, by], [cx + 30, by]]);
  for (let i = 1; i <= 6; i += 1) await touch('touchMove', [[cx - 30 - i * 8, by], [cx + 30 + i * 8, by]]);
  await touch('touchEnd', []);
  await expect(page.locator('.view-in')).toBeDisabled(); // 2배까지 커졌다
  expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1);
  expect(await padMap(page)).toEqual(target);
  await page.locator('.view-home').tap();
  await page.locator('.blk-check').tap();
  await expect(page.locator('.reason')).toContainText('맞아요!');
  expect(errors).toEqual([]);
});

test('키보드만: "위에서 본 판"에서 방향키·Enter·Backspace·숫자로 쌓고 빼고, 무대에서 방향키·1 2 3·+ − 0으로 돌려 보고, Ctrl+Z로 되돌려 [확인하기]까지', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, 'blocks-copy');
  const target = copyTarget();
  const grid = page.locator('.blk-pad-grid');
  await expect(grid).toHaveAttribute('role', 'grid');
  await cell(page, 0, 0).focus();
  // 방향키로 자리를 옮긴다(판의 위쪽 = 뒷줄). 판 밖으로는 나가지 않는다
  await page.keyboard.press('ArrowLeft');
  await expect(cell(page, 0, 0)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 1, 0)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(cell(page, 1, 1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 1, 0)).toBeFocused();
  // Enter·Space = 1개 쌓기([빼기] 상태여도), Backspace·Delete = 1개 빼기, 3층이 차면 알림
  await page.locator('.blk-mode[data-mode="remove"]').click();
  await cell(page, 1, 0).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press(' ');
  await expect(cell(page, 1, 0)).toHaveText('2');
  await expect(cell(page, 1, 0)).toHaveAttribute('aria-label', '1줄 2칸, 쌓기나무 2개');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(cell(page, 1, 0)).toHaveText('3');
  await expect(page.locator('.toast')).toContainText('3층까지 쌓을 수 있어요');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await expect(cell(page, 1, 0)).toHaveText('1');
  // Ctrl+Z로 하나씩 끝까지 되돌린다
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Control+z');
  expect(await padMap(page)).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  await expect(page.locator('.blk-undo')).toBeDisabled();
  // 숫자 키: 그 자리를 그 높이로
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      await cell(page, x, y).focus();
      await page.keyboard.press(String(target[y][x]));
    }
  }
  expect(await padMap(page)).toEqual(target);
  expect(await drawnMap(page)).toEqual(target);
  // 무대: 방향키로 돌리고, 1 2 3으로 위·앞·옆, + − 로 크게 작게, 0으로 처음 보기
  const start = await shapePoints(page);
  await stageEl(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => shapePoints(page)).not.toBe(start);
  await expect(stageEl(page)).not.toHaveClass(/is-easing/);
  const turned = await shapePoints(page);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => shapePoints(page)).not.toBe(turned);
  for (const [key, facing] of [['1', 'top'], ['2', 'front'], ['3', 'side']]) {
    await page.keyboard.press(key);
    await expect(stageEl(page)).toHaveAttribute('data-facing', facing);
  }
  await page.keyboard.press('+');
  await expect(page.locator('.view-home')).toBeEnabled();
  await page.keyboard.press('-');
  await page.keyboard.press('0');
  await expect(page.locator('.view-home')).toBeDisabled();
  await expect.poll(() => shapePoints(page)).toBe(start);
  expect(await padMap(page)).toEqual(target); // 돌리는 키로는 쌓이지 않는다
  await page.locator('.blk-check').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.reason')).toContainText('맞아요!');
  expect(errors).toEqual([]);
});

test('버튼만: "위에서 본 판"·[쌓기][빼기]·[되돌리기]·[모두 치우기]·조작판·[위][앞][옆]으로 끝까지 (끌지 않는다)', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await open(page, 'blocks-copy');
  const target = copyTarget();
  await expect(page.locator('.blk-mode[data-mode="add"]')).toHaveAttribute('aria-pressed', 'true');
  await padBuild(page, testInfo, mirrorMap(target));
  await press(testInfo, page.locator('.blk-clear'));
  expect(await stageCount(page)).toBe(0);
  await press(testInfo, page.locator('.blk-undo')); // 모두 치우기도 되돌릴 수 있다
  expect(await padMap(page)).toEqual(mirrorMap(target));
  await press(testInfo, page.locator('.blk-clear'));
  await padBuild(page, testInfo, target);
  // [빼기] 상태: 판의 칸을 누르면 그 자리의 맨 위가 빠진다. 빈 자리는 알림만
  await press(testInfo, cell(page, 0, 0));
  const extra = target[0][0] + 1;
  await expect(cell(page, 0, 0)).toHaveText(String(extra));
  await press(testInfo, page.locator('.blk-mode[data-mode="remove"]'));
  await expect(page.locator('.blk-mode[data-mode="remove"]')).toHaveAttribute('aria-pressed', 'true');
  await press(testInfo, cell(page, 0, 0));
  expect(await padMap(page)).toEqual(target);
  await press(testInfo, page.locator('.blk-mode[data-mode="add"]'));
  // 조작판 일곱 개와 방향 버튼 셋
  const start = await shapePoints(page);
  for (const name of ['.view-left', '.view-up', '.view-right', '.view-down', '.view-in', '.view-out']) {
    const before = await shapePoints(page);
    await press(testInfo, page.locator(name));
    await expect.poll(() => shapePoints(page), name).not.toBe(before);
  }
  // 2배로 키워도(쌓기나무가 조작 칸 밑으로 들어간다) 매트의 버튼은 하나도 가려지지 않는다
  while (await page.locator('.view-in').isEnabled()) await press(testInfo, page.locator('.view-in'));
  await expect(page.locator('.view-out')).toBeEnabled();
  await expect(stageEl(page)).not.toHaveClass(/is-easing/);
  const covered = await page.evaluate(() => [...document.querySelectorAll('.blk-mat button')].filter((b) => b.getClientRects().length > 0).filter((b) => {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !(top === b || b.contains(top));
  }).map((b) => (b.getAttribute('aria-label') || b.textContent).trim()));
  expect(covered).toEqual([]);
  await press(testInfo, page.locator('.view-home'));
  await expect.poll(() => shapePoints(page)).toBe(start);
  for (const dir of ['top', 'front', 'side']) {
    await press(testInfo, page.locator(`.blk-dir[data-dir="${dir}"]`));
    await expect(stageEl(page)).toHaveAttribute('data-facing', dir);
  }
  expect(await padMap(page)).toEqual(target);
  await press(testInfo, page.locator('.blk-check'));
  await expect(page.locator('.reason')).toContainText('맞아요!');
  // 맞힌 뒤에는 쌓기 도구가 잠긴다
  await expect(cell(page, 0, 0)).toBeDisabled();
  await expect(page.locator('.blk-mode[data-mode="add"]')).toBeDisabled();
  expect(errors).toEqual([]);
});

// ── 누르기와 끌기 ─────────────────────────
test('누르기와 끌기(마우스): 3px 움직이고 떼면 1개 놓이고, 100px 끌면 놓이지 않고 돌아가며, 끌다가 [확인하기] 위에서 떼도 확인되지 않는다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '마우스는 크롬북에서');
  const errors = collectErrors(page);
  await open(page, 'blocks-copy');
  const [x, y] = await clearCenter(page, tile(page, 1, 1));
  // 8px 문턱 안: 누르기
  for (const [dx, dy, placed] of [[3, 0, 1], [5, 5, 2], [0, 8, 3]]) {
    const [px, py] = placed === 1 ? [x, y] : await clearCenter(page, face(page, 1, 1, placed - 2, 'top'));
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px + dx, py + dy, { steps: 2 });
    await page.mouse.up();
    expect(await stageCount(page), `${dx},${dy}`).toBe(placed);
  }
  await page.locator('.blk-undo').click();
  expect(await stageCount(page)).toBe(2);
  // 문턱을 넘으면 끌기: 면 위에서 시작해도 놓이지 않고(점선 쌓기나무도 사라진다) 보기가 바뀐다
  for (const [dx, dy] of [[9, 0], [100, 0], [0, -60], [70, 70]]) {
    const before = await shapePoints(page);
    const [px, py] = await clearCenter(page, face(page, 1, 1, 1, 'top'));
    await page.mouse.move(px, py);
    await expect(page.locator('.blk-ghost-face')).toHaveCount(3);
    await page.mouse.down();
    await page.mouse.move(px + dx, py + dy, { steps: 5 });
    await expect(page.locator('.blk-ghost-face')).toHaveCount(0);
    await page.mouse.up();
    expect(await stageCount(page), `${dx},${dy}`).toBe(2);
    expect(await shapePoints(page), `${dx},${dy}`).not.toBe(before);
    await page.keyboard.press('Escape');
    await page.locator('.view-home').click();
    await expect(page.locator('.view-home')).toBeDisabled();
  }
  // 끌다가 [확인하기] 위에서 뗀다: 확인되지 않는다(답 기록 0). 그다음 누르기는 바로 먹힌다
  const [sx, sy] = await clearCenter(page, face(page, 1, 1, 1, 'top'));
  const check = await centerOf(page.locator('.blk-check'));
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(check[0], check[1], { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.reason')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  expect(await stageCount(page)).toBe(2);
  await page.locator('.view-home').click();
  await page.mouse.click(...await clearCenter(page, face(page, 1, 1, 1, 'top')));
  expect(await stageCount(page)).toBe(3);
  await page.locator('.blk-check').click();
  await expect(page.locator('.reason')).toBeVisible();
  expect(errors).toEqual([]);
});

test('누르기와 끌기(터치): 떨리는 탭은 놓이고, 끌면 돌아가기만 하며, 휙 돌린 바로 뒤의 탭이 먹힌다(브라우저의 관성 스크롤 0)', async ({ page, browser }, testInfo) => {
  test.skip(!isTouch(testInfo), '터치는 태블릿에서');
  const errors = collectErrors(page);
  await open(page, 'blocks-copy');
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const [x, y] = await clearCenter(page, tile(page, 1, 1));
  await touch('touchStart', [[x, y]]);
  await touch('touchMove', [[x + 4, y + 3]]);
  await touch('touchEnd', []);
  expect(await stageCount(page)).toBe(1);
  // 면 위에서 시작해 끈다: 누르는 동안 보이던 점선 쌓기나무가 사라지고, 놓이지 않고, 보기가 바뀐다
  for (const [dx, dy] of [[12, 0], [90, 20], [0, 70]]) {
    const before = await shapePoints(page);
    const [px, py] = await clearCenter(page, face(page, 1, 1, 0, 'top'));
    await touch('touchStart', [[px, py]]);
    await expect(page.locator('.blk-ghost-face')).toHaveCount(3);
    for (let i = 1; i <= 5; i += 1) await touch('touchMove', [[px + (dx * i) / 5, py + (dy * i) / 5]]);
    await expect(page.locator('.blk-ghost-face')).toHaveCount(0);
    await touch('touchEnd', []);
    expect(await stageCount(page), `${dx},${dy}`).toBe(1);
    expect(await shapePoints(page), `${dx},${dy}`).not.toBe(before);
    await page.locator('.view-home').tap();
    await expect(page.locator('.view-home')).toBeDisabled();
  }
  // 무대는 화면 쓸기를 받지 않는다(쌓는 단계의 무대는 늘 touch-action: none)
  expect(await stageEl(page).evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
  // 휙 돌린 바로 뒤(틈 없이)의 탭: 판의 칸이 눌려야 한다. 브라우저가 관성 스크롤을 시작하면 안 된다
  const box = await stageEl(page).boundingBox();
  const from = [box.x + box.width / 2 - 40, box.y + box.height - 30];
  const padCell = await centerOf(cell(page, 2, 2));
  const seen = await touchGestures(browser, page, async () => {
    for (let round = 0; round < 3; round += 1) {
      const release = await touchFlick(cdp, from, [from[0] + 160, from[1] - 20], { release: false });
      await release();
      await page.touchscreen.tap(...padCell);
    }
  });
  await expect(cell(page, 2, 2)).toHaveText('3');
  expectNoFling(expect, testInfo, seen);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(errors).toEqual([]);
});

// ── 놓이는 곳 ────────────────────────────
test('놓이는 곳: 윗면·옆면·바닥·판 밖·3층 — 점선 쌓기나무의 자리 = 실제 놓인 자리 = blocks.js의 계산', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '마우스로 미리 보기를 확인한다(크롬북)');
  const errors = collectErrors(page);
  await open(page, 'blocks-play');
  // 바탕 쌓기: (1,1)에 2층, (0,1)에 1층
  for (const key of [[1, 1], [1, 1], [0, 1]]) await cell(page, key[0], key[1]).click();
  const check = async (locator, hit, expected) => {
    const map = await padMap(page);
    const want = targetOf(map, hit, 'add');
    expect(want).toEqual(expected);
    const [px, py] = await clearCenter(page, locator);
    await page.mouse.move(px, py);
    if (want.error) {
      await expect(page.locator('.blk-ghost-face')).toHaveCount(0);
      await page.mouse.click(px, py);
      expect(await padMap(page)).toEqual(map);
      await expect(page.locator('.toast')).toContainText(want.error === 'full' ? '3층까지 쌓을 수 있어요' : '판 밖에는 놓을 수 없어요');
      return;
    }
    // 누르기 전에 놓일 곳이 점선 쌓기나무로 보인다
    await expect(page.locator('.blk-ghost-face')).toHaveCount(3);
    expect(await page.locator('.blk-ghost').evaluate((g) => ({ x: Number(g.dataset.x), y: Number(g.dataset.y), z: Number(g.dataset.z) }))).toEqual(want);
    await page.mouse.click(px, py);
    const after = await padMap(page);
    expect(after[want.y][want.x]).toBe(want.z + 1);
    expect(count(after)).toBe(count(map) + 1);
    expect(await drawnMap(page)).toEqual(after);
  };
  // 판의 빈 자리 → 그 자리의 바닥
  await check(tile(page, 2, 0), { kind: 'tile', x: 2, y: 0 }, { x: 2, y: 0, z: 0 });
  // 윗면 → 그 쌓기나무 위
  await check(face(page, 1, 1, 1, 'top'), { kind: 'face', x: 1, y: 1, z: 1, face: 'top' }, { x: 1, y: 1, z: 2 });
  // 3층이 찬 윗면 → 안내
  await check(face(page, 1, 1, 2, 'top'), { kind: 'face', x: 1, y: 1, z: 2, face: 'top' }, { error: 'full', x: 1, y: 1 });
  // 옆면(앞쪽 면) → 그 면 쪽 이웃 자리. 3층의 앞면을 눌러도 빈 이웃 자리의 바닥에 내려앉는다
  await check(face(page, 1, 1, 2, 'front'), { kind: 'face', x: 1, y: 1, z: 2, face: 'front' }, { x: 1, y: 0, z: 0 });
  // 옆면(오른쪽 면) → 쌓여 있는 이웃 자리면 그 맨 위
  await page.locator('.blk-undo').click();
  await cell(page, 2, 1).click();
  await check(face(page, 1, 1, 2, 'right'), { kind: 'face', x: 1, y: 1, z: 2, face: 'right' }, { x: 2, y: 1, z: 1 });
  // 판 밖을 향한 옆면 → 안내
  await check(face(page, 2, 0, 0, 'front'), { kind: 'face', x: 2, y: 0, z: 0, face: 'front' }, { error: 'outside', x: 2, y: -1 });
  await check(face(page, 2, 0, 0, 'right'), { kind: 'face', x: 2, y: 0, z: 0, face: 'right' }, { error: 'outside', x: 3, y: 0 });
  // [빼기] 상태: 어느 면을 누르든 그 자리의 맨 위가 빠지고, 미리 보기는 빠질 쌓기나무를 가리킨다
  await page.locator('.blk-mode[data-mode="remove"]').click();
  const before = await padMap(page);
  const [px, py] = await clearCenter(page, face(page, 1, 1, 1, 'front'));
  await page.mouse.move(px, py);
  await expect(page.locator('.blk-ghost-face.is-remove')).toHaveCount(3);
  expect(await page.locator('.blk-ghost').evaluate((g) => [g.dataset.x, g.dataset.y, g.dataset.z].map(Number))).toEqual([1, 1, 2]);
  await page.mouse.click(px, py);
  expect((await padMap(page))[1][1]).toBe(before[1][1] - 1);
  // 화면 읽기 알림: 자리와 모두 몇 개
  await page.locator('.blk-mode[data-mode="add"]').click();
  await cell(page, 0, 0).click();
  await expect.poll(() => liveText(page)).toContain(`1줄 1칸에 쌓았어요. 모두 ${count(await padMap(page))}개`);
  expect(errors).toEqual([]);
});

// ── [위][앞][옆]과 처음 보기 ─────────────────
/** 무대의 면(그 방향)들의 화면 네모를 모눈 자리로 읽는다: [[가로 칸, 세로 칸], …] (왼쪽 아래가 [0, 0]) */
async function gridOf(page, faceName) {
  return page.evaluate((name) => {
    const stage = document.querySelector('.blk-stage');
    const unit = parseFloat(stage.style.getPropertyValue('--blk-unit'));
    const boxes = [...stage.querySelectorAll(`.blk-${name}`)].map((p) => p.getBoundingClientRect());
    const others = [...stage.querySelectorAll('.blk-face')].filter((p) => !p.classList.contains(`blk-${name}`)).length;
    if (boxes.length === 0) return { cells: [], others, square: true };
    const left = Math.min(...boxes.map((b) => b.left));
    const bottom = Math.max(...boxes.map((b) => b.bottom));
    // 테두리 굵기만큼 큰 네모: 한 변은 쌓기나무 한 변과 같다(±3px)
    const square = boxes.every((b) => Math.abs(b.width - unit) <= 3 && Math.abs(b.height - unit) <= 3);
    const cells = [...new Set(boxes.map((b) => `${Math.round((b.left - left) / unit)},${Math.round((bottom - b.bottom) / unit)}`))].sort();
    return { cells, others, square };
  }, faceName);
}
const cellsOfHeights = (heights) => heights.flatMap((h, i) => Array.from({ length: h }, (_, z) => `${i},${z}`)).sort();
/** 가장 왼쪽·아래 칸이 [0, 0]이 되게 옮긴 것(빈 줄은 화면에서 알 수 없다) */
const shifted = (cells) => {
  if (cells.length === 0) return [];
  const pts = cells.map((c) => c.split(',').map(Number));
  const minX = Math.min(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  return pts.map(([x, y]) => `${x - minX},${y - minY}`).sort();
};

for (const mode of ['보통', '움직임 줄이기']) {
  test(`[위][앞][옆](${mode}): 누르면 화면의 쌓기나무가 2D 그림과 같은 모눈의 네모들이 되고, [옆]은 오른쪽에서 본 모습이다`, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    if (mode !== '보통') await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'blocks-play');
    const map = [[2, 1, 0], [0, 3, 0], [0, 1, 1]];
    await padBuild(page, testInfo, map);
    const stage = stageEl(page);
    // 처음 보기: 판의 "앞" 글자는 왼쪽 아래, "옆" 글자는 오른쪽 아래 (교과서 입체 그림의 방향)
    const edges = await page.evaluate(() => {
      const box = document.querySelector('.blk-stage').getBoundingClientRect();
      const at = (cls) => {
        const r = document.querySelector(`.blk-stage ${cls}`).getBoundingClientRect();
        return [r.left + r.width / 2 - (box.left + box.width / 2), r.top + r.height / 2 - (box.top + box.height / 2)];
      };
      return { front: at('.blk-edge-front'), side: at('.blk-edge-right'), texts: [...document.querySelectorAll('.blk-stage .blk-edge text')].map((t) => t.textContent) };
    });
    expect(edges.texts.sort()).toEqual(['앞', '옆']);
    expect(edges.front[0]).toBeLessThan(-20);
    expect(edges.front[1]).toBeGreaterThan(20);
    expect(edges.side[0]).toBeGreaterThan(20);
    expect(edges.side[1]).toBeGreaterThan(20);

    await press(testInfo, page.locator('.blk-dir[data-dir="front"]'));
    if (mode !== '보통') expect(await gridOf(page, 'front')).toMatchObject({ others: 0 }); // 움직임 없이 바로
    await expect.poll(() => gridOf(page, 'front').then((g) => g.others)).toBe(0);
    const front = await gridOf(page, 'front');
    expect(front.square).toBe(true);
    expect(front.cells).toEqual(shifted(cellsOfHeights(frontView(map)))); // 왼쪽부터 칸 0·1·2
    await expect.poll(() => liveText(page)).toContain('앞에서 본 모습이에요.');

    await press(testInfo, page.locator('.blk-dir[data-dir="side"]'));
    await expect.poll(() => gridOf(page, 'right').then((g) => g.others)).toBe(0);
    const side = await gridOf(page, 'right');
    expect(side.square).toBe(true);
    expect(side.cells).toEqual(shifted(cellsOfHeights(sideView(map)))); // 왼쪽부터 앞줄 → 뒷줄 = 오른쪽에서 본 모습
    expect(sideView(map)).not.toEqual([...sideView(map)].reverse()); // 좌우가 다른 모양으로 확인했다
    await expect.poll(() => liveText(page)).toContain('옆에서 본 모습이에요.');

    await press(testInfo, page.locator('.blk-dir[data-dir="top"]'));
    await expect.poll(() => gridOf(page, 'top').then((g) => g.others)).toBe(0);
    const top = await gridOf(page, 'top');
    expect(top.square).toBe(true);
    const topCells = topView(map).flatMap((row, y) => row.map((on, x) => (on ? `${x},${y}` : null))).filter(Boolean).sort();
    expect(top.cells).toEqual(shifted(topCells)); // 앞줄이 아래
    await expect(stage).toHaveAttribute('data-facing', 'top');
    expect(errors).toEqual([]);
  });
}

// ── 그리기: 누른 곳이 가리키는 면 ────────────────
/** 사각형의 어느 변에서든 margin 안쪽으로 가까운가 */
const nearEdge = (quad, p, margin) => quad.some((a, i) => {
  const b = quad[(i + 1) % 4];
  const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * (b[0] - a[0])), p[1] - (a[1] + t * (b[1] - a[1]))) < margin;
});

/** 볼록 사각형 안에 있는가(가장자리에서 margin 넘게 안쪽) */
function insideQuad(quad, p, margin) {
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) return false;
    const cross = ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / len;
    if (Math.abs(cross) < margin) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

test('누른 곳이 가리키는 쌓기나무·면이 광선 계산과 같다 (보기 14가지 × 모든 면의 가운데와 무대 위 표본 점)', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-play');
  const map = [[3, 1, 2], [0, 2, 0], [1, 0, 3]];
  await padBuild(page, testInfo, map);
  await stageEl(page).focus();
  const info = await page.evaluate(() => {
    const stage = document.querySelector('.blk-stage');
    const box = stage.getBoundingClientRect();
    return { unit: parseFloat(stage.style.getPropertyValue('--blk-unit')), cx: box.left + box.width / 2, cy: box.top + box.height / 2, w: box.width, h: box.height };
  });
  // 보기: 처음 보기에서 방향키로 한 단계씩(게임과 같은 orbit.js 값으로 자세를 따라 계산한다) + [위][앞][옆]
  let view = homeView();
  const views = [{ keys: [], pose: poseOfRoll(view.roll) }];
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowDown', 'ArrowDown']) {
    view = stepView(view, key.replace('Arrow', '').toLowerCase(), key === 'ArrowLeft' || key === 'ArrowRight' ? 15 : 15);
    views.push({ keys: [key], pose: poseOfRoll(view.roll) });
  }
  for (const [key, name] of [['1', 'top'], ['2', 'front'], ['3', 'side']]) views.push({ keys: [key], pose: POSES[name] });
  const rng = createRng('pick');
  let checked = 0;
  for (const v of views) {
    for (const key of v.keys) await page.keyboard.press(key);
    await settled(page); // 돌아가는 움직임(0.2초)이 끝난 뒤
    const shapes = sceneShapes(map, v.pose);
    const quads = shapes.map((s) => s.pts.map((p) => projectPoint(v.pose, info.unit, info.cx, info.cy, p)));
    const depthAt = (i, p) => {
      const q = quads[i];
      const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1]];
      const e2 = [q[3][0] - q[0][0], q[3][1] - q[0][1]];
      const det = e1[0] * e2[1] - e1[1] * e2[0];
      const a = ((p[0] - q[0][0]) * e2[1] - (p[1] - q[0][1]) * e2[0]) / det;
      const b = (e1[0] * (p[1] - q[0][1]) - e1[1] * (p[0] - q[0][0])) / det;
      const d0 = depthOf(v.pose, shapes[i].pts[0]);
      return d0 + a * (depthOf(v.pose, shapes[i].pts[1]) - d0) + b * (depthOf(v.pose, shapes[i].pts[3]) - d0);
    };
    const points = quads.map((q) => [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2]);
    for (let i = 0; i < 60; i += 1) points.push([info.cx + (rng.next() - 0.5) * info.unit * 5, info.cy + (rng.next() - 0.5) * info.unit * 5]);
    // 어느 도형의 가장자리에서든 3px 안(테두리 굵기)인 점은 건너뛴다 — 두 면의 경계에서는 어느 쪽이 눌려도 맞다
    const wanted = [];
    for (const p of points) {
      if (quads.some((q) => nearEdge(q, p, 3))) continue;
      let best = null;
      quads.forEach((q, i) => {
        if (!insideQuad(q, p, 0)) return;
        const depth = depthAt(i, p);
        // 같은 평면에 겹쳐 놓인 것(아래에서 볼 때 판과 1층의 아랫면)은 나중에 그린 것(판)이 눌린다
        if (!best || depth > best.depth - 1e-6) best = { i, depth };
      });
      const s = best ? shapes[best.i] : null;
      wanted.push({ p, want: s ? (s.kind === 'tile' ? `tile ${s.x},${s.y}` : `face ${s.x},${s.y},${s.z},${s.face}`) : 'none' });
    }
    const got = await page.evaluate((list) => list.map(({ p }) => {
      const el = document.elementFromPoint(p[0], p[1]);
      const d = el?.closest?.('.blk-stage [data-kind]')?.dataset;
      if (!d) return 'none';
      return d.kind === 'tile' ? `tile ${d.x},${d.y}` : `face ${d.x},${d.y},${d.z},${d.face}`;
    }), wanted);
    wanted.forEach((w, i) => {
      // 무대 밖(조작 칸 밑)의 점은 무대의 요소가 아니다
      if (got[i] === 'none' && w.want !== 'none') {
        const inStage = Math.abs(w.p[0] - info.cx) < info.w / 2 - 200 && Math.abs(w.p[1] - info.cy) < info.h / 2;
        if (!inStage) return;
      }
      expect(got[i], `보기 ${views.indexOf(v)} 점 ${w.p.map(Math.round)}`).toBe(w.want);
      checked += 1;
    });
  }
  expect(checked).toBeGreaterThan(400);
  expect(errors).toEqual([]);
});

// ── 답하기 전에 정답이 드러나지 않는다 ───────────────
test('정답 노출 0 (어느 방향에서 보았을까?): 답하기 전에는 판이 처음 보기로 멈춰 있고 방향 버튼·조작판이 없다. 문항이 달라도 화면의 틀이 같다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  const frames = new Set();
  for (const seed of [1, 2, 3]) {
    await open(page, 'blocks-where', { seed });
    const questions = questionsFor('blocks-where', seed);
    for (const [i, q] of questions.entries()) {
      const stage = stageEl(page);
      await expect(stage).toHaveClass(/is-frozen/);
      await expect(stage).not.toHaveClass(/can-view|can-edit/);
      await expect(page.locator('.blk-dirs')).toBeHidden();
      await expect(page.locator('.view-pad')).toBeHidden();
      // 멈춘 판에는 초점이 머물지 않는다. 이름은 조형물이 놓인 자리만 말한다(어느 쪽에서 본 모습인지는 말하지 않는다)
      expect(await stage.evaluate((el) => [el.dataset.facing ?? null, el.dataset.count ?? null, el.getAttribute('tabindex')])).toEqual([null, null, '-1']);
      expect(await stage.getAttribute('aria-label')).toMatch(/^판 위의 조형물: 노란 탑 3층은 \d줄 \d칸, 파란 기둥 2층은 \d줄 \d칸, 분홍 상자 1층은 \d줄 \d칸\. 화살표 가는 앞줄 쪽, 나는 오른쪽, 다는 뒷줄 쪽, 라는 왼쪽에서 판을 봐요\.$/);
      // 조형물은 가려진 것 없이 모두 그려져 있고(쌓기나무 6개), 자리 값(data-*)이 없다
      expect(await page.locator('.blk-stage .blk-face').count()).toBe(picturedFaces(q.h).length);
      expect(await page.locator('.blk-stage [data-kind], .blk-stage [data-x], .blk-stage [data-face]').count()).toBe(0);
      // 끌기·휠·키에 움직이지 않는다
      const before = await shapePoints(page);
      await pokeStage(page);
      expect(await shapePoints(page)).toBe(before);
      // 화면의 틀(판의 자리, 가·나·다·라 글자의 자리, 답 버튼)은 문항과 무관하게 한 가지
      frames.add(await page.evaluate(() => JSON.stringify({
        tiles: [...document.querySelectorAll('.blk-stage .blk-tile')].map((t) => t.getAttribute('points')),
        edges: [...document.querySelectorAll('.blk-stage .blk-edge')].map((g) => `${g.textContent}@${g.getAttribute('transform')}`).sort(),
        buttons: [...document.querySelectorAll('.blk-choice')].map((b) => `${b.dataset.answer}:${b.textContent}:${b.className}:${b.disabled}`),
        card: document.querySelector('.blk-card figcaption').textContent,
      })));
      // 정답 글자·표시가 답 버튼 밖 어디에도 없다
      const leaks = await page.evaluate((answer) => {
        const out = [];
        for (const el of document.querySelectorAll('.screen-play *')) {
          // 답 버튼과, 답한 뒤에 나타나는 방향 버튼(지금은 숨겨져 있고 문항과 무관하게 늘 같은 넷)은 빼고 본다
          if (el.closest('.blk-choice, .blk-dirs')) continue;
          for (const attr of el.attributes) {
            if (/is-answer|is-chosen|정답/.test(attr.value)) out.push(`${attr.name}=${attr.value}`);
            if ((attr.name.startsWith('data-') || attr.name === 'aria-label' || attr.name === 'title') && new RegExp(`${answer} 쪽|^${answer}$|\\b(front|right|back|left|side)\\b`).test(attr.value)) out.push(`${el.className}: ${attr.name}=${attr.value}`);
          }
        }
        const live = [...document.querySelectorAll('[aria-live], [role="status"]')].map((el) => el.textContent).join(' ');
        if (new RegExp(`${answer} 쪽`).test(live)) out.push(`알림: ${live}`);
        return out;
      }, DIR_LETTERS[q.dir]);
      expect(leaks, `시드 ${seed} 문항 ${i + 1}`).toEqual([]);
      // 답한다: 그 방향으로 돌아가고(조작판·방향 버튼이 나타난다), 그 모습이 그림과 같은 모눈이 된다
      await page.locator(`.blk-choice[data-answer="${q.dir}"]`).click();
      await expect(stage).toHaveAttribute('data-facing', VIEW_OF[q.dir]);
      await expect(stage).toHaveAttribute('tabindex', '0');
      await expect(stage).toHaveAttribute('aria-label', /끌거나 방향키로 돌려 보고/);
      await expect(page.locator('.blk-dirs')).toBeVisible();
      await expect(page.locator('.view-pad')).toBeVisible();
      await expect(page.locator('.blk-dir')).toHaveText(['가', '나', '다', '라']);
      await page.locator('.next-btn').click();
    }
    await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  }
  expect(frames.size).toBe(1);
  expect(errors).toEqual([]);
});

test('틀리면 고른 쪽으로 먼저 돌아간 뒤 바른 쪽으로 돌고, 맞은편을 골랐으면 까닭에 "맞은편"이 나온다. 다음 문항에는 앞 문항의 움직임이 남지 않는다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await open(page, 'blocks-where');
  const [q1, q2] = questionsFor('blocks-where');
  const wrong = OPPOSITE[q1.dir];
  await press(testInfo, page.locator(`.blk-choice[data-answer="${wrong}"]`));
  await expect(stageEl(page)).toHaveAttribute('data-facing', VIEW_OF[wrong]);
  await expect(page.locator('.reason')).toContainText(`맞은편인 ${DIR_LETTERS[q1.dir]} 쪽에서 본 모습이에요.`);
  await expect(page.locator(`.blk-choice[data-answer="${q1.dir}"]`)).toHaveClass(/is-answer/);
  await expect(page.locator(`.blk-choice[data-answer="${wrong}"]`)).toHaveClass(/is-chosen/);
  await expect(page.locator('.bonus-note')).toContainText('다시 일어서기');
  // 바로 다음 문제로 넘어간다: 걸어 둔 "바른 쪽으로 돌기"가 다음 문항의 멈춘 판을 돌리지 않는다
  await press(testInfo, page.locator('.next-btn'));
  const frozen = await shapePoints(page);
  await page.waitForTimeout(1100);
  expect(await shapePoints(page)).toBe(frozen);
  await expect(stageEl(page)).toHaveClass(/is-frozen/);
  // 멈춘 판은 손가락으로 끌어도 돌지 않고, 눌러도 아무것도 놓이지 않는다
  if (isTouch(testInfo)) {
    const cdp = await page.context().newCDPSession(page);
    const box = await stageEl(page).boundingBox();
    await touchFlick(cdp, [box.x + box.width / 2, box.y + box.height / 2], [box.x + box.width / 2 + 140, box.y + box.height / 2 + 30]);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    expect(await shapePoints(page)).toBe(frozen);
    await expect(page.locator('.blk-ghost-face')).toHaveCount(0);
  }
  // 이번에는 틀리고 기다린다: 고른 쪽 → 바른 쪽
  const wrong2 = OPPOSITE[q2.dir];
  await press(testInfo, page.locator(`.blk-choice[data-answer="${wrong2}"]`));
  await expect(stageEl(page)).toHaveAttribute('data-facing', VIEW_OF[wrong2]);
  await expect(stageEl(page)).toHaveAttribute('data-facing', VIEW_OF[q2.dir], { timeout: 3000 });
  expect(errors).toEqual([]);
});

test('정답 노출 0 (이쪽에서 보면?): 답하기 전에는 입체가 없고(무대 요소 0), 답하면 입체가 나타나 그 방향으로 돈다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await open(page, 'blocks-scene');
  const questions = questionsFor('blocks-scene');
  for (const q of questions) {
    await expect(page.locator('.blk-stage')).toHaveCount(0);
    await expect(page.locator('.blk-mat .blk-face')).toHaveCount(0);
    await expect(page.locator('.blk-map')).toBeVisible();
    await expect(page.locator('.blk-option')).toHaveCount(4);
    await expect(page.locator('.blk-dirs, .view-pad')).toHaveCount(2);
    await expect(page.locator('.view-pad')).toBeHidden();
    // 보기 넷은 그림만 다르고 모양·클래스가 같다
    expect(new Set(await page.locator('.blk-option').evaluateAll((els) => els.map((el) => `${el.className}|${el.disabled}`))).size).toBe(1);
    // 보기 그림 넷은 크기가 같고, 답하기 전에는 크게 보인다(크롬북: 2×2, 태블릿: 한 줄에 넷)
    await expect(page.locator('.blk-options')).not.toHaveClass(/is-answered/);
    const before = await page.locator('.blk-option .blk-flat').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    expect(new Set(before).size).toBe(1);
    expect(await page.locator('.blk-option').evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().left))).size)).toBe(isTouch(testInfo) ? 4 : 2);
    await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected}"]`));
    await expect(page.locator('.blk-stage')).toHaveCount(1);
    // 답한 뒤: 보기를 한 줄로 줄여 까닭 쪽지에 자리를 낸다(답한 뒤의 보기는 "이 그림 쪽에서 보기" 버튼이다)
    await expect(page.locator('.blk-options')).toHaveClass(/is-answered/);
    const after = await page.locator('.blk-option .blk-flat').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    expect(new Set(after).size).toBe(1);
    expect(after[0]).toBeLessThan(before[0]);
    expect(before[0] / after[0]).toBeGreaterThan(1.5); // 답하기 전의 그림은 고치기 전의 크기(답한 뒤의 크기)보다 1.5배 넘게 크다
    expect(await page.locator('.blk-option').evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().left))).size)).toBe(4);
    await expect(stageEl(page)).toHaveAttribute('data-facing', VIEW_OF[q.dir]);
    await expect(page.locator('.blk-map')).toBeHidden();
    await expect(page.locator('.view-pad')).toBeVisible();
    expect(await drawnMap(page)).toEqual(q.h);
    // 답한 뒤에는 보기 그림을 누르면 무대가 그 그림 쪽으로 돈다
    const other = q.options.findIndex((o) => o.dir !== q.dir);
    await press(testInfo, page.locator('.blk-option').nth(other));
    await expect(stageEl(page)).toHaveAttribute('data-facing', VIEW_OF[q.options[other].dir]);
    await press(testInfo, page.locator('.next-btn'));
  }
  await expect(page.getByText('3번 중 3번 맞힘')).toBeVisible();
  expect(errors).toEqual([]);
});

test('정답 노출 0 (모두 몇 개일까?): 답하기 전의 그림에는 보이는 면만 있고(숨겨진 쌓기나무는 DOM에도 없다) 돌릴 수 없다. 답하면 입체가 되어 층별로 벌려 볼 수 있다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const frames = new Set();
  const answerSpots = new Set(); // 정답 버튼의 자리(0~3)
  let withHidden = 0;
  for (const seed of [1, 2, 3]) {
    await open(page, 'blocks-count', { seed });
    for (const q of questionsFor('blocks-count', seed)) {
      const stage = stageEl(page);
      await expect(stage).toHaveClass(/is-frozen/);
      // 그림의 면 수 = 교과서 방향에서 한 조각이라도 보이는 면의 수. 판·자리 값·개수·표시가 없다
      const pictured = picturedFaces(q.target);
      expect(await page.locator('.blk-stage .blk-face').count()).toBe(pictured.length);
      expect(await page.locator('.blk-stage .blk-tile, .blk-stage [data-kind], .blk-stage [data-x], .blk-stage .is-hidden-cube, .blk-stage .blk-chip').count()).toBe(0);
      expect(await stage.evaluate((el) => [el.dataset.count ?? null, el.dataset.facing ?? null, el.getAttribute('tabindex'), el.getAttribute('aria-label')]))
        .toEqual([null, null, '-1', '쌓기나무로 만든 모양 그림이에요. 답한 뒤에 돌려 볼 수 있어요.']);
      await expect(page.locator('.blk-dirs')).toBeHidden();
      await expect(page.locator('.view-pad')).toBeHidden();
      await expect(page.locator('.blk-apart')).toBeHidden();
      const before = await shapePoints(page);
      await pokeStage(page);
      expect(await shapePoints(page)).toBe(before);
      // 위에서 본 모양에는 쌓인 자리만 있다(수가 없다). 보기 넷은 작은 수부터
      expect(await page.locator('.blk-plan .is-on').count()).toBe(count(q.top));
      await expect(page.locator('.blk-plan .blk-plan-num')).toHaveCount(0);
      expect(await page.locator('.blk-choice').evaluateAll((els) => els.map((el) => Number(el.dataset.answer)))).toEqual(q.options);
      expect(q.options).toEqual([...q.options].sort((a, b) => a - b));
      answerSpots.add(q.options.indexOf(q.expected));
      // 알림·상태 글에 개수가 없다 (앞 문항의 알림은 새 문항이 시작될 때 지워진다)
      await expect(page.locator('.toast')).toHaveCount(0);
      await expect.poll(() => liveText(page)).not.toMatch(/\d+개|숨/);
      frames.add(await page.evaluate(() => JSON.stringify({
        unit: document.querySelector('.blk-stage').style.getPropertyValue('--blk-unit'),
        tag: document.querySelector('.blk-tag').textContent,
        choices: [...document.querySelectorAll('.blk-choice')].map((b) => `${b.className}|${b.disabled}`),
        stage: document.querySelector('.blk-stage').className,
      })));
      // 답한다
      await page.locator(`.blk-choice[data-answer="${q.expected}"]`).click();
      await expect(stage).not.toHaveClass(/is-frozen/);
      expect(await drawnMap(page)).toEqual(q.target);
      await expect(page.locator('.blk-apart')).toBeVisible();
      await expect(page.locator('.view-pad')).toBeVisible();
      expect(await stageCount(page)).toBe(q.expected);
      if (q.hidden.length > 0) {
        withHidden += 1;
        // 숨어 있던 쌓기나무: 점선 테두리 + "숨어 있었어요", 저절로 층별로 벌어져 층마다 개수가 뜬다
        expect(hiddenCells(q.target)).toEqual(q.hidden);
        await expect(page.locator('.blk-stage .is-hidden-cube').first()).toBeVisible();
        await expect(page.locator('.blk-stage .blk-hid')).toHaveText('숨어 있었어요');
        await expect(stage).toHaveClass(/is-apart/);
        const layers = await page.locator('.blk-stage .blk-layer').allTextContents();
        expect(layers.map((t) => Number(t.match(/(\d+)개/)[1])).reduce((a, b) => a + b, 0)).toBe(q.expected);
      } else {
        await expect(stage).not.toHaveClass(/is-apart/);
        await page.locator('.blk-apart').click();
        await expect(stage).toHaveClass(/is-apart/);
        await expect(page.locator('.blk-apart')).toHaveText('다시 모으기');
      }
      // 쌓기나무를 누르면 그 자리의 개수가 뜬다
      await page.locator('.blk-apart').click();
      await expect(stage).not.toHaveClass(/is-apart/);
      const top = page.locator('.blk-stage .blk-face.blk-top').last();
      const spot = await top.evaluate((el) => [Number(el.dataset.x), Number(el.dataset.y)]);
      await page.mouse.click(...await centerOf(top));
      await expect(page.locator('.toast')).toContainText(`${spotName(spot[0], spot[1])} 자리는 ${q.target[spot[1]][spot[0]]}개예요.`);
      await page.locator('.next-btn').click();
    }
    await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  }
  expect(withHidden).toBe(6);
  // 정답이 늘 같은 자리에 있지 않다: 세 판 열두 문항에 네 자리가 모두 나온다(분포는 단위 검사가 시드 1,000개로 고정)
  expect([...answerSpots].sort()).toEqual([0, 1, 2, 3]);
  expect(frames.size).toBe(1);
  expect(errors).toEqual([]);
});

test('정답 노출 0 (쌓는 단계): [확인하기] 전에는 내 쌓기를 그림과 견준 표시가 어디에도 없고, 알림은 내가 한 일만 말한다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  for (const id of ['blocks-copy', 'blocks-hidden']) {
    await open(page, id);
    const [q] = questionsFor(id);
    const given = () => page.evaluate(() => [...document.querySelectorAll('.blk-card svg, .blk-given svg')].map((s) => s.outerHTML).join(''));
    const start = await given();
    // 주어진 그림에는 보이는 면만 있다
    expect(await page.locator('.blk-card .blk-face').count()).toBe(picturedFaces(q.target).length);
    // 틀린 모양을 쌓는 동안: 표시(✗·다른 면)가 없고 주어진 그림이 그대로다
    const wrong = mirrorMap(q.target);
    await padBuild(page, testInfo, wrong);
    await expect(page.locator('.is-diff, .blk-x, .reason, .blk-hint:visible')).toHaveCount(0);
    expect(await given()).toBe(start);
    const said = await liveText(page);
    expect(said).not.toMatch(/맞|틀|달라|같아|숨/);
    // 내 판은 답하기 전에도 돌려 볼 수 있다
    await expect(stageEl(page)).toHaveClass(/can-view/);
    await expect(page.locator('.view-pad')).toBeVisible();
    // [확인하기]: 틀린 시도가 기록되고, 이제 다른 곳이 ✗로 보인다(그림과 같은 쪽으로 돌아간다)
    await press(testInfo, page.locator('.blk-check'));
    await expect(page.locator('.reason')).toContainText('달라요');
    await expect(page.locator('.blk-x').first()).toBeVisible();
    await expect(stageEl(page)).toHaveAttribute('data-facing', 'home');
    await expect(page.locator('.bonus-note')).toContainText('다시 도전');
    // 고치기 시작하면 표시가 사라진다
    await press(testInfo, cell(page, 1, 1));
    await expect(page.locator('.is-diff, .blk-x')).toHaveCount(0);
    expect(await given()).toBe(start);
  }
  expect(errors).toEqual([]);
});

// ── 쌓는 단계의 틀린 시도·힌트·예상 ───────────────
test('똑같이 만들기: 틀린 [확인하기]도 기록되고(고치지 않고 또 누르면 다시 세지 않는다), 다르게 두 번 틀리면 힌트가 열린다. 숨길 수 있는 문항은 다른 개수의 쌓기를 돌려 보여 주고, 별은 틀린 횟수로 정한다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await open(page, 'blocks-copy');
  const [q1, q2] = questionsFor('blocks-copy');
  // 빈 판으로 확인: 기록하지 않고 알림만
  await press(testInfo, page.locator('.blk-check'));
  await expect(page.locator('.toast')).toContainText('쌓기나무를 먼저 쌓아요.');
  await expect(page.locator('.reason')).toHaveCount(0);
  const mirrored = mirrorMap(q1.target);
  await padBuild(page, testInfo, mirrored);
  await press(testInfo, page.locator('.blk-check'));
  await expect(page.locator('.reason')).toContainText('뒤집혔어요');
  await expect(page.locator('.blk-hint')).toBeHidden();
  // 고치지 않고 [확인하기]를 또 누르면(더블클릭 등): 다시 세지 않는다 — 알림만 나오고, 힌트가 열리지 않으며, 다른 곳 표시는 그대로다
  for (let i = 0; i < 2; i += 1) {
    await press(testInfo, page.locator('.blk-check'));
    await expect(page.locator('.toast')).toContainText('이미 확인한 쌓기예요.');
  }
  await expect(page.locator('.blk-hint')).toBeHidden();
  await expect(page.locator('.blk-stage .blk-x, .blk-card .blk-x').first()).toBeVisible();
  await expect(page.locator('.reason')).toContainText('뒤집혔어요');
  // 고쳐서(하나 더 쌓아) 또 틀리면 두 번째 틀림 → 힌트가 열린다
  await addWrongBlock(page, testInfo, q1, mirrored);
  await expect(page.locator('.blk-stage .blk-x, .blk-card .blk-x')).toHaveCount(0);
  await press(testInfo, page.locator('.blk-check'));
  await expect(page.locator('.blk-hint')).toBeVisible();
  await press(testInfo, page.locator('.blk-hint'));
  await expect(page.locator('.blk-hint-text')).toContainText(`보이는 쌓기나무만 세면 ${count(q1.target)}개예요.`);
  await expect(page.locator('.blk-hint')).toBeDisabled();
  // 맞게 고쳐 쌓는다
  await clearBoard(page, testInfo);
  await padBuild(page, testInfo, q1.target);
  await press(testInfo, page.locator('.blk-check'));
  await expect(page.locator('.reason')).toContainText('이 그림은 다른 개수로는 만들 수 없어요.');
  await expect(page.locator('.reason-pick')).toHaveCount(0);
  await press(testInfo, page.locator('.next-btn'));
  // 2번: 숨긴 쌓기(개수가 하나 많은 것)를 내도 맞다 → 개수가 다른 쌓기(보이는 대로 쌓은 것이 아닌 쪽)를 뒤에서 보여 준다
  await padBuild(page, testInfo, q2.alt);
  await press(testInfo, page.locator('.blk-check'));
  await expect(page.locator('.reason')).toContainText(`쌓기나무 ${count(q2.alt)}개로 만든 것도, ${count(q2.target)}개로 만든 것도 그림과 똑같아 보여요.`);
  await expect(page.locator('.blk-tag')).toHaveText(`쌓기나무 ${count(q2.alt)}개로 만든 모양`);
  await expect(stageEl(page)).toHaveAttribute('data-facing', 'behind');
  await expect(page.locator('.blk-stage .is-hidden-cube').first()).toBeVisible();
  await expect(page.locator('.blk-stage .blk-hid')).toHaveText('숨어 있었어요');
  // "무엇을 더 알면": 틀린 것을 골라도 바른 답을 알려 주고 넘어간다(정답률에 넣지 않는다)
  await press(testInfo, page.locator('.reason-chip[data-clue="color"]'));
  await expect(page.locator('.reason-pick-result')).toContainText('위에서 본 모양을 함께 보면');
  await press(testInfo, page.locator('.next-btn'));
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  // 답 4번(틀림 2 + 맞힘 2 — 같은 쌓기를 다시 확인한 두 번은 세지 않았다) → 정답률 50%
  await expect(page.getByText('4번 중 2번 맞힘')).toBeVisible();
  // 별은 틀린 횟수로: 두 번 틀려 별 1개. 안내도 그 기준의 말이다(정답률 기준의 "더 맞히면"이 아니다)
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 1개');
  await expect(page.locator('.star-hint')).toHaveText('한 번만 틀리면 별 2개, 한 번도 틀리지 않으면 별 3개!');
  // 다시 도전해 맞힘 +1, 다음 문항을 처음에 맞힘 +2와 다시 일어서기 +1 = 4, 단계 완료 5 + 별 1개 2
  expect(await resultXp(page)).toEqual({ tiles: 4, line: 7, gained: 11, saved: 11 });
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards') ?? '{}').counters ?? {})).inspect ?? 0).toBe(0);
  expect(errors).toEqual([]);
});

test('숨겨진 쌓기나무: 위에서 본 모양이 다르면 그 자리에 ✗, 예상하는 동안은 쌓기가 잠기고, 같은 쌓기를 또 내면 기록하지 않는다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await open(page, 'blocks-hidden');
  const questions = questionsFor('blocks-hidden');
  const answers = [];
  for (const q of questions) {
    // 앞 문항의 힌트 표시가 남아 있지 않다(쌓기를 고쳐 그림을 다시 그려도)
    await expect(page.locator('.blk-plan .blk-plan-num, .blk-hint-text')).toHaveCount(0);
    // 위에서 본 모양이 다른 쌓기(한 줄 세 칸은 어느 문항의 바닥 모양과도 다르게 고른다)
    const line = [[1, 1, 1], [0, 0, 0], [0, 0, 0]];
    await padBuild(page, testInfo, line);
    await expect(page.locator('.blk-plan .blk-plan-num')).toHaveCount(0);
    await press(testInfo, page.locator('.blk-check'));
    await expect(page.locator('.reason')).toContainText('위에서 본 모양이 달라요.');
    await expect(page.locator('.blk-plan .is-diff').first()).toBeVisible();
    answers.push(false);
    // 고치지 않고 또 누르면 다시 세지 않는다(알림만) — 힌트도 열리지 않는다
    await press(testInfo, page.locator('.blk-check'));
    await expect(page.locator('.toast')).toContainText('이미 확인한 쌓기예요.');
    await expect(page.locator('.blk-hint')).toBeHidden();
    await expect(page.locator('.blk-plan .is-diff').first()).toBeVisible();
    await clearBoard(page, testInfo);
    // 자리는 맞고 높이가 다른 쌓기(모두 1층)
    if (count(q.top) !== count(q.target)) {
      await padBuild(page, testInfo, q.top);
      await press(testInfo, page.locator('.blk-check'));
      await expect(page.locator('.reason')).toContainText('위에서 본 모양은 맞아요.');
      await expect(page.locator('.blk-plan .is-diff')).toHaveCount(0);
      await expect(page.locator('.blk-stage .blk-x, .blk-card .blk-x').first()).toBeVisible();
      answers.push(false);
      // 두 번 틀렸다: 힌트 — 위에서 본 모양의 한 자리에 수
      await press(testInfo, page.locator('.blk-hint'));
      await expect(page.locator('.blk-plan .blk-plan-num')).toHaveCount(1);
      await expect(page.locator('.blk-hint-text')).toContainText('층이에요.');
      await clearBoard(page, testInfo);
    }
    await padBuild(page, testInfo, q.target);
    await press(testInfo, page.locator('.blk-check'));
    answers.push(true);
    // 예상: 쌓기는 잠기고(판의 칸이 꺼진다) 돌려 보기는 된다
    await expect(page.locator('.q-prompt')).toHaveText('다른 개수로도 똑같아 보이게 만들 수 있을까요?');
    await expect(cell(page, 0, 0)).toBeDisabled();
    await expect(page.locator('.blk-check')).toBeHidden();
    await expect(stageEl(page)).toHaveClass(/can-view/);
    await expect(page.locator('.blk-plan .blk-plan-num')).toHaveCount(0);
    const wrongGuess = q.expected === 'yes' ? 'no' : 'yes';
    await press(testInfo, page.locator(`.blk-choice[data-answer="${wrongGuess}"]`));
    answers.push(false);
    if (q.many) {
      await expect(page.locator('.reason')).toContainText(`${spotName(q.spot[0], q.spot[1])} 자리는 다른 쌓기나무에 가려서`);
      await expect(page.locator('.q-prompt')).toHaveText('쌓기나무의 개수를 바꿔서 한 번 더 쌓아 봐요.');
      // 그대로 내면 "이미 한 쌓기" — 기록하지 않는다
      await press(testInfo, page.locator('.blk-check'));
      await expect(page.locator('.toast')).toContainText('이미 한 쌓기예요.');
      // 엉뚱한 자리에 하나 더 쌓아 틀린다. 그대로 또 내면 다시 세지 않고(힌트도 열리지 않는다),
      // 한 층 더 쌓아 다르게 또 틀리면 두 번째 틀림 → 힌트: 위에서 본 모양의 가려진 자리에 ? 표시
      const far = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [x, y])).find(([x, y]) => q.top[y][x] === 0);
      await press(testInfo, cell(page, far[0], far[1]));
      await press(testInfo, page.locator('.blk-check'));
      answers.push(false);
      await press(testInfo, page.locator('.blk-check'));
      await expect(page.locator('.toast')).toContainText('이미 확인한 쌓기예요.');
      await expect(page.locator('.blk-hint')).toBeHidden();
      await press(testInfo, cell(page, far[0], far[1]));
      await press(testInfo, page.locator('.blk-check'));
      answers.push(false);
      await press(testInfo, page.locator('.blk-hint'));
      await expect(page.locator('.blk-plan .blk-plan-num')).toHaveText('?');
      await expect(page.locator('.blk-hint-text')).toContainText(`? 자리(${spotName(q.spot[0], q.spot[1])})는 그림에서 가려져 있어요.`);
      await press(testInfo, page.locator('.blk-undo'));
      await press(testInfo, page.locator('.blk-undo'));
      await press(testInfo, cell(page, q.spot[0], q.spot[1]));
      await press(testInfo, page.locator('.blk-check'));
      answers.push(true);
      await expect(page.locator('.reason')).toContainText('표시한 자리는 그림에서 가려져 있어서');
      await expect(stageEl(page)).toHaveAttribute('data-facing', 'behind');
      await expect(page.locator('.blk-stage .is-hidden-cube').first()).toBeVisible();
    } else {
      await expect(page.locator('.reason')).toContainText('다른 개수로는 만들 수 없어요.');
      await expect(page.locator('.blk-check')).toBeHidden();
    }
    await press(testInfo, page.locator('.next-btn'));
  }
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  const right = answers.filter(Boolean).length;
  await expect(page.getByText(`${answers.length}번 중 ${right}번 맞힘`)).toBeVisible();
  const xp = await resultXp(page);
  expect(xp.tiles + xp.line).toBe(xp.gained);
  expect(xp.saved).toBe(xp.gained);
  // [힌트]는 "다시 보는 눈"(까닭 장면을 돌려 보기) 횟수에 넣지 않는다 — 똑같이 만들기의 힌트와 같다
  const counters = await page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards') ?? '{}').counters ?? {});
  expect(counters.inspect ?? 0).toBe(0);
  expect(errors).toEqual([]);
});

test('별(틀린 횟수 기준): 이쪽에서 보면?·똑같이 만들기에서 한 번 틀리면 별 2개, 두 번 틀리면 별 1개이고, 결과 화면의 안내도 그 기준이다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  const stars = (n) => expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', `별 3개 중 ${n}개`);
  const fresh = () => page.evaluate(() => localStorage.clear());
  /** 화면의 점수 = 저장된 점수이고, 단계 완료 5 + 별마다 2 */
  const expectXp = async (starCount) => {
    const xp = await resultXp(page);
    expect(xp.line).toBe(5 + 2 * starCount);
    expect(xp.tiles + xp.line).toBe(xp.gained);
    expect(xp.saved).toBe(xp.gained);
    return xp;
  };
  // 이쪽에서 보면?(3문항): 앞의 n문항을 틀린다
  const playScene = async (wrongCount) => {
    await open(page, 'blocks-scene');
    for (const [i, q] of questionsFor('blocks-scene').entries()) {
      await press(testInfo, page.locator(`.blk-choice[data-answer="${i < wrongCount ? (q.expected % 4) + 1 : q.expected}"]`));
      await expect(page.locator('.reason')).toBeVisible();
      await press(testInfo, page.locator('.next-btn:not([hidden])'));
    }
    await expect(page.locator('.result-title')).toBeVisible();
  };
  // 하나 틀림: 정답률은 67%(정답률 기준이면 별 1개)지만 별 2개
  await playScene(1);
  await stars(2);
  await expect(page.getByText('3번 중 2번 맞힘')).toBeVisible();
  await expect(page.locator('.star-hint')).toHaveText('한 번도 틀리지 않으면 별 3개!');
  // 틀림 0 + 처음에 맞힘 2와 다시 일어서기 1 + 처음에 맞힘 2 = 5
  expect((await expectXp(2)).tiles).toBe(5);
  await fresh();
  // 둘 틀림: 별 1개
  await playScene(2);
  await stars(1);
  await expect(page.getByText('3번 중 1번 맞힘')).toBeVisible();
  await expect(page.locator('.star-hint')).toHaveText('한 번만 틀리면 별 2개, 한 번도 틀리지 않으면 별 3개!');
  await expectXp(1);
  // 일어날 수 없는 것을 말하는 안내(정답률 기준의 "…더 맞히면 별 n개!")가 없다
  await expect(page.getByText(/더 맞히면/)).toHaveCount(0);
  await fresh();
  // 똑같이 만들기(2문항): 한 번 틀린 [확인하기] 뒤에 고쳐 맞힌다 → 정답률 67%지만 별 2개
  await open(page, 'blocks-copy');
  const [c1, c2] = questionsFor('blocks-copy');
  await padBuild(page, testInfo, mirrorMap(c1.target));
  await press(testInfo, page.locator('.blk-check'));
  await expect(page.locator('.reason')).toContainText('뒤집혔어요');
  await clearBoard(page, testInfo);
  await solveCopy(page, testInfo, c1);
  await solveCopy(page, testInfo, c2);
  await expect(page.locator('.result-title')).toBeVisible();
  await stars(2);
  await expect(page.getByText('3번 중 2번 맞힘')).toBeVisible();
  await expect(page.locator('.star-hint')).toHaveText('한 번도 틀리지 않으면 별 3개!');
  await expect(page.getByText(/더 맞히면/)).toHaveCount(0);
  await expectXp(2);
  // 숨겨진 쌓기나무는 그대로 정답률 기준이다: 한 번 틀리면(6번 중 5번 = 83%) 별 2개이고 안내는 "더 맞히면"
  await fresh();
  await open(page, 'blocks-hidden');
  const hidden = questionsFor('blocks-hidden');
  await padBuild(page, testInfo, [[1, 1, 1], [0, 0, 0], [0, 0, 0]]);
  await press(testInfo, page.locator('.blk-check'));
  await expect(page.locator('.reason')).toContainText('위에서 본 모양이 달라요.');
  await clearBoard(page, testInfo);
  for (const q of hidden) await solveHidden(page, testInfo, q);
  await expect(page.locator('.result-title')).toBeVisible();
  await expect(page.getByText('6번 중 5번 맞힘')).toBeVisible();
  await stars(2);
  await expect(page.locator('.star-hint')).toHaveText('한 번만 더 맞히면 별 3개!');
  expect(errors).toEqual([]);
});

test('돌려 보기 알림(화면 읽기): 조작판 버튼·방향키로 돌려 보는 구간("비스듬히 위에서 본 모습" 등)이 바뀌면 알려 준다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await open(page, 'blocks-copy');
  let view = homeView();
  let word = poseWord(poseOfRoll(view.roll));
  const said = [];
  /** 한 번 돌리고, 구간이 바뀌었으면 그 말이 화면 읽기 알림에 나오는지 본다 */
  const turn = async (dir, degrees, act) => {
    view = stepView(view, dir, degrees);
    await act();
    const now = poseWord(poseOfRoll(view.roll));
    if (now !== word) {
      await expect.poll(() => liveText(page), `${dir} → ${now}`).toContain(now);
      said.push(now);
    }
    word = now;
  };
  // 조작판 버튼: 아래로 눕히고(앞에서 → 비스듬히 아래에서), 옆으로 돌리고(옆에서), 다시 위로 올린다(비스듬히 위에서)
  const button = (name) => () => press(testInfo, page.locator(name));
  for (let i = 0; i < 4; i += 1) await turn('down', 15, button('.view-down'));
  for (let i = 0; i < 3; i += 1) await turn('right', 30, button('.view-right'));
  for (let i = 0; i < 7; i += 1) await turn('up', 15, button('.view-up'));
  expect(new Set(said).size).toBeGreaterThanOrEqual(3);
  expect(said).toContain('앞에서 본 모습이에요.');
  // 방향키(크롬북): 같은 방식으로 알린다
  if (!isTouch(testInfo)) {
    const before = said.length;
    await stageEl(page).focus();
    const key = (name) => () => page.keyboard.press(name);
    for (let i = 0; i < 7; i += 1) await turn('down', 15, key('ArrowDown'));
    for (let i = 0; i < 12; i += 1) await turn('left', 15, key('ArrowLeft'));
    expect(said.length - before).toBeGreaterThanOrEqual(3);
  }
  // 알림은 방향의 말뿐이다(쌓기의 맞고 틀림·개수를 말하지 않는다)
  for (const text of said) expect(text).toMatch(/에서 본 모습이에요\.$/);
  expect(errors).toEqual([]);
});

test('조형물의 무늬: 파란 기둥은 빗금 두 줄(층 경계처럼 보이는 가로줄이 아니다), 분홍 상자는 마름모 — 판 그림·보기 그림·입체에 모두 있다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await open(page, 'blocks-scene');
  const [q] = questionsFor('blocks-scene');
  // 답하기 전: 판 그림(위에서 본 자리)과 보기 그림 넷
  await expect(page.locator('.blk-map .blk-mark-slash').first()).toBeVisible();
  await expect(page.locator('.blk-map .blk-mark-dot').first()).toBeVisible();
  expect(await page.locator('.blk-option .blk-mark-slash').count()).toBeGreaterThan(0);
  await expect(page.locator('.blk-mark-stripe, [class*="stripe"]')).toHaveCount(0);
  // 빗금은 비스듬한 선이다: 무늬의 선분마다 가로·세로로 모두 움직인다(가로줄·세로줄이 아니다)
  const slanted = (selector) => page.locator(selector).evaluateAll((els) => els.flatMap((el) => {
    const nums = el.getAttribute('d').match(/-?\d+(\.\d+)?/g).map(Number);
    const out = [];
    for (let i = 0; i + 3 < nums.length; i += 4) out.push(Math.abs(nums[i + 2] - nums[i]) > 0.5 && Math.abs(nums[i + 3] - nums[i + 1]) > 0.5);
    return out;
  }));
  const flat = await slanted('.blk-option .blk-mark-slash, .blk-map .blk-mark-slash');
  expect(flat.length).toBeGreaterThanOrEqual(4); // 무늬 하나에 선분 둘
  expect(flat.every(Boolean)).toBe(true);
  await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected}"]`));
  // 답한 뒤: 입체의 파란 기둥 면에도 빗금이 있다(그 방향에서 똑바로 본 모습)
  await expect(stageEl(page)).toHaveAttribute('data-facing', VIEW_OF[q.dir]);
  await settled(page);
  const solid = await slanted('.blk-stage .blk-mark-slash');
  expect(solid.length).toBeGreaterThanOrEqual(2);
  expect(solid.every(Boolean)).toBe(true);
  await expect(page.locator('.blk-mark-stripe, [class*="stripe"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('점수: 별 3개를 받은 단계를 다시 해도 점수가 쌓이지 않고, 놀이터도 두 번째에는 0점이다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  const playOnce = async () => {
    await open(page, 'blocks-where');
    for (const q of questionsFor('blocks-where')) await answerAndNext(page, testInfo, q.dir);
    await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
    return resultXp(page);
  };
  expect(await playOnce()).toEqual({ tiles: 9, line: 11, gained: 20, saved: 20 });
  expect(await playOnce()).toEqual({ tiles: 0, line: 0, gained: 0, saved: 20 });
  await expect(page.locator('.practice-note')).toContainText('별 3개를 받은 단계라 연습 점수는 없어요.');
  const playground = async () => {
    await open(page, 'blocks-play');
    const [{ spot: [x, y] }] = questionsFor('blocks-play');
    await press(testInfo, cell(page, x, y));
    await press(testInfo, cell(page, x, y));
    await press(testInfo, page.locator('.blk-mode[data-mode="remove"]'));
    await press(testInfo, cell(page, x, y));
    await press(testInfo, page.locator('.blk-dir[data-dir="front"]'));
    await press(testInfo, page.locator('.blk-finish'));
    await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
    return resultXp(page);
  };
  expect(await playground()).toEqual({ tiles: 0, line: 11, gained: 11, saved: 31 });
  expect(await playground()).toEqual({ tiles: 0, line: 0, gained: 0, saved: 31 });
  // 학습 기록: 놀이터는 답 기록이 없다
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:log') ?? '[]'));
  expect(JSON.stringify(records)).not.toContain('"itemId":"blocks-play');
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
  test(`배치(${size.name}): 여섯 단계의 모든 장면에 세로·가로 스크롤이 없고, 판 안쪽이 넘치지 않으며, 매트와 머리가 움직이지 않는다`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== size.project, `${size.project}에서 확인`);
    test.setTimeout(180_000);
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
      await noScroll(page, label);
      await expectFits(page, label);
      await expectNoOverlap(page, label);
      // 판이 매트 옆에 있는 크기(높이가 정해진 판): 글자가 넓은 기기에서 글이 한 줄 늘어도 넘치지 않을 만큼 남아 있다
      const room = await panelRoom(page);
      if (room.fixed) expect(room.spare, `${label}: 판의 세로 여유 ${room.spare}px < 글 한 줄 ${room.line}px`).toBeGreaterThanOrEqual(room.line);
      // 플레이 도중 머리와 매트는 1px도 움직이지 않는다
      const now = await frame();
      if (first == null) first = now;
      expect(now, label).toBe(first);
    };
    const begin = async (id) => {
      await open(page, id);
      // 화면이 들어오는 움직임이 끝난 뒤의 자리를 기준으로 삼는다
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
      first = null;
      await scene(`${id} 처음`);
    };

    // 쌓기 놀이터
    await begin('blocks-play');
    const [{ spot: [gx, gy] }] = questionsFor('blocks-play');
    await press(testInfo, cell(page, gx, gy));
    await press(testInfo, cell(page, gx, gy));
    await scene('놀이터 주문 1');
    await press(testInfo, page.locator('.blk-mode[data-mode="remove"]'));
    await press(testInfo, cell(page, gx, gy));
    await press(testInfo, page.locator('.blk-dir[data-dir="front"]'));
    await scene('놀이터 주문 3');
    await press(testInfo, page.locator('.blk-finish'));
    await noScroll(page, '놀이터 결과');

    // 고르는 단계: 첫 문항은 틀리고(까닭 + 보너스 쪽지가 가장 길다) 나머지는 맞힌다
    for (const id of ['blocks-where', 'blocks-scene', 'blocks-count']) {
      await begin(id);
      for (const [i, q] of questionsFor(id).entries()) {
        const right = id === 'blocks-where' ? q.dir : q.expected;
        const wrong = id === 'blocks-where' ? OPPOSITE[q.dir] : id === 'blocks-scene' ? (q.expected % 4) + 1 : q.options.find((n) => n !== q.expected);
        await press(testInfo, page.locator(`.blk-choice[data-answer="${i === 0 ? wrong : right}"]`));
        await expect(page.locator('.reason')).toBeVisible();
        await scene(`${id} 문항 ${i + 1} 답한 뒤`);
        if (i === 0) await expectToastClear(page, `${id} 틀린 알림`);
        await press(testInfo, page.locator('.next-btn'));
        if (i + 1 < stageOf(id).count) await scene(`${id} 문항 ${i + 2}`);
      }
      await noScroll(page, `${id} 결과`);
    }

    // 똑같이 만들기: 틀림 두 번 → 힌트 → 맞힘 → 다른 쌓기와 "무엇을 더 알면"
    await begin('blocks-copy');
    const [c1, c2] = questionsFor('blocks-copy');
    await padBuild(page, testInfo, mirrorMap(c1.target));
    await press(testInfo, page.locator('.blk-check'));
    await scene('copy 틀림 1');
    await expectToastClear(page, 'copy 틀린 알림');
    await press(testInfo, page.locator('.blk-check'));
    await scene('copy 같은 쌓기를 또 확인');
    await addWrongBlock(page, testInfo, c1, mirrorMap(c1.target));
    await press(testInfo, page.locator('.blk-check'));
    await scene('copy 틀림 2(힌트 버튼)');
    await press(testInfo, page.locator('.blk-hint'));
    await scene('copy 힌트');
    await clearBoard(page, testInfo);
    await padBuild(page, testInfo, c1.target);
    await press(testInfo, page.locator('.blk-check'));
    await scene('copy 1번 맞힘');
    await press(testInfo, page.locator('.next-btn'));
    await padBuild(page, testInfo, c2.target);
    await press(testInfo, page.locator('.blk-check'));
    await expect(page.locator('.reason-pick')).toBeVisible();
    await scene('copy 2번 맞힘 + 고르기');
    await expect(stageEl(page)).toHaveAttribute('data-facing', 'behind', { timeout: 3000 });
    await scene('copy 다른 쌓기');
    await press(testInfo, page.locator('.reason-chip[data-clue="color"]'));
    await scene('copy 고른 뒤');
    await press(testInfo, page.locator('.next-btn'));
    await noScroll(page, 'copy 결과');

    // 숨겨진 쌓기나무: 틀림(자리) → 틀림(높이) → 힌트 → 맞힘 → 예상 틀림 → 이미 한 쌓기 → 다른 개수
    await begin('blocks-hidden');
    for (const q of questionsFor('blocks-hidden')) {
      await padBuild(page, testInfo, [[1, 1, 1], [0, 0, 0], [0, 0, 0]]);
      await press(testInfo, page.locator('.blk-check'));
      await scene('hidden 틀림(자리)');
      await clearBoard(page, testInfo);
      if (count(q.top) !== count(q.target)) {
        await padBuild(page, testInfo, q.top);
        await press(testInfo, page.locator('.blk-check'));
        await scene('hidden 틀림(높이)');
        await press(testInfo, page.locator('.blk-hint'));
        await scene('hidden 힌트');
        await clearBoard(page, testInfo);
      }
      await padBuild(page, testInfo, q.target);
      await press(testInfo, page.locator('.blk-check'));
      await scene('hidden 예상');
      await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected === 'yes' ? 'no' : 'yes'}"]`));
      await scene(`hidden 예상 틀림(${q.many ? '여러 가지' : '하나뿐'})`);
      if (q.many) {
        await press(testInfo, cell(page, q.spot[0], q.spot[1]));
        await press(testInfo, page.locator('.blk-check'));
        await scene('hidden 다른 개수');
      }
      await press(testInfo, page.locator('.next-btn'));
    }
    await noScroll(page, 'hidden 결과');
    expect(errors).toEqual([]);
  });
}

test('글자가 커져도(110%) 크롬북 1366×680에서 작업 지시서가 넘치지 않는다: 틀린 답의 까닭·보너스 쪽지·[다음 문제]가 함께 나오는 장면들', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1366, height: 680 });
  const begin = async (id, seed) => {
    await open(page, id, { seed });
    await page.addStyleTag({ content: 'html { font-size: 110% !important; }' });
    await expect.poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeGreaterThan(17);
  };
  const fits = async (label) => {
    const m = await page.evaluate(() => {
      const panel = document.querySelector('.blk-panel');
      const cut = [...panel.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0 && b.getBoundingClientRect().bottom > panel.getBoundingClientRect().bottom + 0.5).length;
      return { over: panel.scrollHeight - panel.clientHeight, page: Math.max(0, document.documentElement.scrollHeight - window.innerHeight), cut };
    });
    expect(m, label).toEqual({ over: 0, page: 0, cut: 0 });
  };
  for (const seed of [1, 2]) {
    // 숨겨진 쌓기나무: 틀린 쌓기(자리·높이) → 힌트 → 맞힘 → 예상 틀림("하나뿐"은 까닭 + 다시 일어서기 쪽지 + [다음 문제]) → 다른 개수
    await begin('blocks-hidden', seed);
    for (const q of questionsFor('blocks-hidden', seed)) {
      await padBuild(page, testInfo, [[1, 1, 1], [0, 0, 0], [0, 0, 0]]);
      await press(testInfo, page.locator('.blk-check'));
      await fits(`hidden ${seed} 틀림(자리)`);
      await clearBoard(page, testInfo);
      if (count(q.top) !== count(q.target)) {
        await padBuild(page, testInfo, q.top);
        await press(testInfo, page.locator('.blk-check'));
        await fits(`hidden ${seed} 틀림(높이)`);
        await press(testInfo, page.locator('.blk-hint'));
        await fits(`hidden ${seed} 힌트`);
        await clearBoard(page, testInfo);
      }
      await padBuild(page, testInfo, q.target);
      await press(testInfo, page.locator('.blk-check'));
      await fits(`hidden ${seed} 예상`);
      await press(testInfo, page.locator(`.blk-choice[data-answer="${q.expected === 'yes' ? 'no' : 'yes'}"]`));
      await fits(`hidden ${seed} 예상 틀림(${q.many ? '여러 가지' : '하나뿐'})`);
      if (q.many) {
        await press(testInfo, cell(page, q.spot[0], q.spot[1]));
        await press(testInfo, page.locator('.blk-check'));
        await fits(`hidden ${seed} 다른 개수`);
      }
      await press(testInfo, page.locator('.next-btn'));
    }
    // 똑같이 만들기: 틀림 → 맞힘 → (숨길 수 있는 문항) 까닭 + "무엇을 더 알면" 고르기
    await begin('blocks-copy', seed);
    for (const [i, q] of questionsFor('blocks-copy', seed).entries()) {
      const wrong = mirrorMap(q.target);
      if (!judgeLook(q, wrong).correct) {
        await padBuild(page, testInfo, wrong);
        await press(testInfo, page.locator('.blk-check'));
        await expect(page.locator('.reason')).toContainText('달라요');
        await fits(`copy ${seed} ${i + 1}번 틀림`);
        await clearBoard(page, testInfo);
      }
      await padBuild(page, testInfo, q.target);
      await press(testInfo, page.locator('.blk-check'));
      await expect(page.locator('.reason')).toContainText('맞아요!');
      await fits(`copy ${seed} ${i + 1}번 맞힘`);
      if (q.alt) {
        await expect(page.locator('.reason-pick')).toBeVisible();
        await fits(`copy ${seed} 고르기`);
        await press(testInfo, page.locator('.reason-chip[data-clue="color"]'));
        await fits(`copy ${seed} 고른 뒤`);
      }
      await press(testInfo, page.locator('.next-btn:not([hidden])'));
    }
    // 고르는 단계: 문항마다 틀린 답(까닭 + 다시 일어서기 쪽지 + [다음 문제])
    for (const id of ['blocks-where', 'blocks-scene', 'blocks-count']) {
      await begin(id, seed);
      for (const [i, q] of questionsFor(id, seed).entries()) {
        await fits(`${id} ${seed} 문항 ${i + 1}`);
        const wrong = id === 'blocks-where' ? OPPOSITE[q.dir] : id === 'blocks-scene' ? (q.expected % 4) + 1 : q.options.find((n) => n !== q.expected);
        await press(testInfo, page.locator(`.blk-choice[data-answer="${wrong}"]`));
        await expect(page.locator('.reason')).toBeVisible();
        await fits(`${id} ${seed} 문항 ${i + 1} 틀린 뒤`);
        await press(testInfo, page.locator('.next-btn'));
      }
    }
  }
  expect(errors).toEqual([]);
});

test('꽉 찬 3×3×3도 어느 쪽으로 돌려도 무대 안에 있고, 양옆의 조작 칸과 겹치지 않는다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  for (const height of isTouch(testInfo) ? [1180] : [768, 680]) {
    await page.setViewportSize({ width: isTouch(testInfo) ? 820 : 1366, height });
    await open(page, 'blocks-copy');
    await fillAll(page);
    await stageEl(page).focus();
    expect(await blocksOutside(page), `처음 보기 ${height}`).toEqual([]);
    // 가로로 한 바퀴(15° × 24), 사이사이 세로로도 돌린다
    for (let i = 0; i < 24; i += 1) {
      await page.keyboard.press('ArrowRight');
      if (i % 4 === 0) await page.keyboard.press('ArrowUp');
      if (i % 3 === 0) {
        await settled(page);
        expect(await blocksOutside(page), `${height} ${i}번째`).toEqual([]);
      }
    }
    for (const key of ['1', '2', '3']) {
      await page.keyboard.press(key);
      await settled(page);
      expect(await blocksOutside(page), `${height} [${key}]`).toEqual([]);
    }
  }
  expect(errors).toEqual([]);
});

test('폭 900~1100px(가로로 든 태블릿 1024×768 등): 꽉 찬 3×3×3이 조작 칸 밑으로 들어가지 않고, 매트의 조작 칸끼리 겹치지 않으며, 버튼이 매트 밖으로 나가지 않는다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  const units = [];
  for (let width = 900; width <= 1100; width += 20) {
    await page.setViewportSize({ width, height: 768 });
    await open(page, 'blocks-hidden');
    await fillAll(page);
    await stageEl(page).focus();
    await settled(page);
    expect(await blocksOutside(page), `${width}px 처음 보기`).toEqual([]);
    // 가로로 한 바퀴(30° × 12), 사이사이 세로로도 돌린다
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      if (i % 3 === 0) await page.keyboard.press('ArrowUp');
      await settled(page);
      expect(await blocksOutside(page), `${width}px ${i}번째`).toEqual([]);
    }
    for (const key of ['1', '2', '3']) {
      await page.keyboard.press(key);
      await settled(page);
      expect(await blocksOutside(page), `${width}px [${key}]`).toEqual([]);
    }
    await expectNoOverlap(page, `${width}px`);
    await expectFits(page, `${width}px`);
    expect(await hasHorizontalScroll(page), `${width}px 가로 스크롤`).toBe(false);
    units.push(await stageEl(page).evaluate((el) => parseFloat(el.style.getPropertyValue('--blk-unit'))));
  }
  // 조작 칸 자리를 빼고도 쌓기나무 한 칸이 누를 만한 크기다(글자 폭과 무관한 값: 매트 폭에서 조작 칸 210px씩을 뺀 자리로 정한다)
  expect(units.length).toBe(11);
  for (const unit of units) expect(unit).toBeGreaterThanOrEqual(40);
  expect(errors).toEqual([]);
});

test('휴대폰(390×844): 가로 스크롤이 없고, 쌓는 동안 무대·위에서 본 판·그림·쌓기 도구가 한 화면에 보이며, 무대 밖에서는 화면이 내려간다', async ({ page }, testInfo) => {
  test.skip(!isTouch(testInfo), '터치 기기에서 확인');
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['blocks-play', 'blocks-where', 'blocks-scene', 'blocks-copy', 'blocks-count', 'blocks-hidden']) {
    await open(page, id);
    expect(await hasHorizontalScroll(page), id).toBe(false);
  }
  await open(page, 'blocks-copy');
  const seen = await page.evaluate(() => ['.blk-stage', '.blk-padbox', '.blk-card', '.blk-tools .blk-check', '.blk-mode'].map((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
  }));
  expect(seen).toEqual([true, true, true, true, true]);
  // 무대는 화면의 절반보다 낮다
  const stage = await stageEl(page).boundingBox();
  expect(stage.height).toBeLessThanOrEqual(844 / 2);
  await padBuild(page, testInfo, copyTarget());
  await page.locator('.blk-check').tap();
  await expect(page.locator('.reason')).toContainText('맞아요!');
  expect(await hasHorizontalScroll(page)).toBe(false);
  // 무대 밖(작업 지시서)에서 쓸면 화면이 내려간다. 무대 위에서 쓸면 내려가지 않고 돌아간다
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const before = await shapePoints(page);
  await touchFlick(cdp, [stage.x + stage.width / 2, stage.y + stage.height - 30], [stage.x + stage.width / 2, stage.y + 30]);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await shapePoints(page)).not.toBe(before);
  const header = await page.locator('.play-header-text').boundingBox();
  await touchFlick(cdp, [header.x + 40, header.y + header.height + 500], [header.x + 40, header.y + 100], { steps: 20, stepMs: 16 });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

// ── 접근성·정리 ───────────────────────────
test('접근성: 무대와 판의 이름, 그림의 글 이름(높이는 읽어 주지 않는다), 초점 표시, 단계를 나가면 남는 것이 없다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  const errors = collectErrors(page);
  await open(page, 'blocks-hidden');
  const [q] = questionsFor('blocks-hidden');
  await expect(stageEl(page)).toHaveAttribute('aria-label', /끌거나 방향키로 돌려 보고/);
  await expect(page.locator('.blk-pad-grid')).toHaveAttribute('aria-label', /방향키로 자리를 옮기고/);
  await expect(page.locator('.blk-svg')).toHaveAttribute('aria-hidden', 'true');
  // 주어진 그림: 멈춘 입체 그림은 높이를 말하지 않고, 위에서 본 모양은 쌓인 자리만 말한다
  const pictureName = await page.locator('.blk-card .blk-picture').getAttribute('aria-label');
  expect(pictureName).toBe('쌓기나무로 만든 모양 그림');
  const planName = await page.locator('.blk-plan').getAttribute('aria-label');
  expect(planName).toMatch(/^위에서 본 모양\. 쌓인 자리는 /);
  expect(planName).not.toMatch(/층|개/);
  expect((planName.match(/\d줄 \d칸/g) ?? []).length).toBe(count(q.top));
  // 조작 버튼의 이름
  await expect(page.locator('.view-pad button')).toHaveCount(7);
  expect(await page.locator('.view-pad button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual([
    '왼쪽으로 돌려 보기', '오른쪽으로 돌려 보기', '위쪽으로 돌려 보기', '아래쪽으로 돌려 보기', '작게 보기', '크게 보기', '처음 보기로',
  ]);
  expect(await page.locator('.blk-dir').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual(['위에서 보기', '앞에서 보기', '옆에서 보기']);
  // Tab 순서: 무대 → [위][앞][옆] → 위에서 본 판(한 칸) → 조작판 → 쌓기 도구 → 확인하기
  await page.locator('.btn-back').focus();
  const order = [];
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => {
      const el = document.activeElement;
      return el.classList.contains('blk-stage') ? 'stage' : el.classList.contains('blk-dir') ? 'dir' : el.classList.contains('blk-cell') ? 'cell'
        : el.closest('.view-pad') ? 'pad' : el.classList.contains('blk-mode') ? 'mode' : el.classList.contains('blk-check') ? 'check' : el.className;
    }));
    if (order.at(-1) === 'check') break;
  }
  expect(order.filter((x, i) => x !== order[i - 1])).toEqual(['stage', 'dir', 'cell', 'pad', 'mode', 'check']);
  expect(order.filter((x) => x === 'cell').length).toBe(1); // 판은 한 번에 지나가고, 안에서는 방향키로 옮긴다
  // 초점 표시가 보인다
  await cell(page, 0, 0).focus();
  await page.keyboard.press('ArrowRight');
  expect(await cell(page, 1, 0).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await stageEl(page).focus();
  await page.keyboard.press('ArrowRight');
  expect(await stageEl(page).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  // 끄는 도중에 단계를 나간다: 리스너·타이머가 남지 않는다(나간 뒤의 움직임·키에 오류가 없다)
  const box = await stageEl(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height - 40, { steps: 3 });
  await page.evaluate(() => document.querySelector('.btn-back').click());
  await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
  await page.mouse.move(box.x + 200, box.y + 100, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1200);
  expect(errors).toEqual([]);
});

test('?fx=low: 돌아가는 움직임 없이 바로 그 방향이 된다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await open(page, 'blocks-play', { extra: '&fx=low' });
  await padBuild(page, testInfo, [[1, 2, 0], [0, 0, 0], [0, 0, 0]]);
  await press(testInfo, page.locator('.blk-dir[data-dir="front"]'));
  expect((await gridOf(page, 'front')).others).toBe(0);
  await press(testInfo, page.locator('.view-home'));
  expect(await page.locator('.blk-stage .blk-top').count()).toBe(2);
  await expect(stageEl(page)).not.toHaveClass(/is-easing/);
  expect(errors).toEqual([]);
});
