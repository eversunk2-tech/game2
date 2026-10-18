/**
 * R1 쌓기나무 판의 돌림판식 돌리기 — 브라우저 검사. 기획서: spec-grade6.md 15-18·15-19, plan-rotate-free.md 4절·6절(R1 검사 ②③④)
 * - 끄는 동안·놓은 뒤·버튼과 [위][앞][옆]으로 도는 움직임 도중에도 화면에서 쌓기나무의 세로 모서리가 곧다(앞·뒤·왼쪽·오른쪽 면 <polygon>의
 *   세로 변 두 점의 x가 같고, 위 끝이 아래 끝보다 위에 있다). 판 밑에서 보는 일(판 칸의 is-under)이 없다.
 * - 화면의 다각형 = 기획서 규칙(가로 1px = 판 0.5°, 세로 1px = 높이 0.5°, 0°~90°에서 멈춤, 8px 문턱)으로 따라 계산한 자세의 투영.
 *   자세는 게임과 같은 turn-view.js의 값으로 계산한다(다른 쌓기나무 검사가 orbit.js 값으로 하던 것과 같은 방식).
 * - 버튼은 판 45°·높이 15° 눈금, 방향키는 판 15°·높이 15° 눈금, 높이가 한도에 닿으면 그 버튼이 꺼진다(점선).
 * 정해진 시간으로 기다리지 않는다(움직임이 끝난 것은 .is-easing이 사라진 것으로, 그리기는 화면 프레임 두 번으로 본다).
 */
import { expect, test } from '@playwright/test';
import { POSES, projectPoint, sceneShapes } from '../../src/games/net-workshop/blocks/block-view.js';
import { dragTurn, homeTurn, poseOf, snapTurn, stepTurn } from '../../src/games/net-workshop/blocks/turn-view.js';
import { collectErrors, fileUrl } from './helpers.js';

const FILE = 'net-workshop.html';
const open = async (page, stageId, extra = '') => {
  await page.goto(fileUrl(FILE, `?unlock=all&seed=1&sound=off&stage=${stageId}${extra}`));
  await page.locator('.play-area > *').first().waitFor({ state: 'attached' });
};
const isTouch = (testInfo) => testInfo.project.name === 'tablet';
const press = (testInfo, locator) => (isTouch(testInfo) ? locator.tap() : locator.click());
const stageEl = (page) => page.locator('.blk-stage');
const cell = (page, x, y) => page.locator(`.blk-cell[data-x="${x}"][data-y="${y}"]`);
const settled = (page) => expect(stageEl(page)).not.toHaveClass(/is-easing/);
/** 화면이 두 번 다시 그려질 때까지(무대는 다음 화면 프레임에 그린다) */
const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** 쌓기 놀이터에 이 모양을 쌓는다("위에서 본 판"으로) */
const MAP = [[2, 1, 0], [3, 0, 1], [1, 2, 3]];
async function build(page, testInfo) {
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) for (let k = 0; k < MAP[y][x]; k += 1) await press(testInfo, cell(page, x, y));
  await expect(stageEl(page)).toHaveAttribute('data-count', String(MAP.flat().reduce((a, b) => a + b, 0)));
}

/**
 * 무대에서 읽은 것: 앞·뒤·왼쪽·오른쪽 면의 세로 변이 곧은가(x가 같고 위 끝이 위에), 판 밑에서 보는 칸의 수,
 * 그리고 면·판 칸의 점(무대 안 좌표)과 그 자리 값. 무대 크기·쌓기나무 한 변도
 */
const readStage = (page) => page.evaluate(() => {
  const stage = document.querySelector('.blk-stage');
  const box = stage.getBoundingClientRect();
  const parse = (el) => el.getAttribute('points').trim().split(/\s+/).map((p) => p.split(',').map(Number));
  const bent = [];
  for (const el of stage.querySelectorAll('.blk-shapes polygon.blk-front, .blk-shapes polygon.blk-back, .blk-shapes polygon.blk-left, .blk-shapes polygon.blk-right')) {
    const p = parse(el);
    // 면의 꼭짓점: [아래 왼쪽, 아래 오른쪽, 위 오른쪽, 위 왼쪽] — 세로 변은 0–3, 1–2
    if (p[0][0] !== p[3][0] || p[1][0] !== p[2][0] || p[3][1] > p[0][1] || p[2][1] > p[1][1]) bent.push(`${el.getAttribute('class')} ${el.getAttribute('points')}`);
  }
  const shapes = [...stage.querySelectorAll('.blk-shapes polygon[data-kind]')].map((el) => ({ key: el.dataset.kind === 'tile' ? `t${el.dataset.x},${el.dataset.y}` : `f${el.dataset.x},${el.dataset.y},${el.dataset.z},${el.dataset.face}`, pts: parse(el) }));
  return {
    w: box.width,
    h: box.height,
    unit: parseFloat(stage.style.getPropertyValue('--blk-unit')),
    bent,
    sides: stage.querySelectorAll('.blk-shapes polygon.blk-front, .blk-shapes polygon.blk-back, .blk-shapes polygon.blk-left, .blk-shapes polygon.blk-right').length,
    under: stage.querySelectorAll('.blk-tile.is-under').length,
    shapes,
  };
});

/** 화면의 다각형이 그 보기(view)의 투영과 같은가 → 가장 큰 차이(px)와 짝이 없는 것 */
function compare(read, view) {
  const pose = poseOf(view);
  const want = new Map(sceneShapes(MAP, pose).map((s) => [s.kind === 'tile' ? `t${s.x},${s.y}` : `f${s.x},${s.y},${s.z},${s.face}`, s.pts.map((p) => projectPoint(pose, read.unit * view.zoom, read.w / 2, read.h / 2, p))]));
  let gap = 0;
  const odd = [];
  for (const s of read.shapes) {
    const pts = want.get(s.key);
    if (!pts) {
      odd.push(`그리지 않을 것 ${s.key}`);
      continue;
    }
    want.delete(s.key);
    s.pts.forEach((p, i) => {
      gap = Math.max(gap, Math.abs(p[0] - pts[i][0]), Math.abs(p[1] - pts[i][1]));
    });
  }
  for (const key of want.keys()) odd.push(`빠진 것 ${key}`);
  return { gap: Math.round(gap * 100) / 100, odd };
}

/** 정수 화면 자리로 4px 안팎씩 나눈 끌기 경로(시작 자리 + 꼭짓점들의 상대 자리) */
function route(start, vertices) {
  const out = [[Math.round(start[0] + vertices[0][0]), Math.round(start[1] + vertices[0][1])]];
  for (let i = 1; i < vertices.length; i += 1) {
    const [x0, y0] = vertices[i - 1];
    const [x1, y1] = vertices[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
    for (let k = 1; k <= n; k += 1) out.push([Math.round(start[0] + x0 + ((x1 - x0) * k) / n), Math.round(start[1] + y0 + ((y1 - y0) * k) / n)]);
  }
  return out;
}

/**
 * 기획서 규칙으로 따라 계산한 보기(무대와 같은 차례): 누른 곳에서 8px 넘게 움직이기 전에는 돌지 않고, 넘은 첫 움직임에서 누른 곳부터 잰 만큼,
 * 그 뒤로는 움직임마다 그만큼 돈다(가로 = 판, 세로 = 높이 — 한도에서 멈춤)
 */
function follow(points, upto = points.length, from = homeTurn()) {
  let view = from;
  const [x0, y0] = points[0];
  let last = null;
  for (const [x, y] of points.slice(1, upto)) {
    if (!last) {
      if (Math.hypot(x - x0, y - y0) <= 8) continue;
      last = [x0, y0];
    }
    view = dragTurn(view, x - last[0], y - last[1]);
    last = [x, y];
  }
  return view;
}

/** 계획 3절·4-4절의 끌기 경로들 + 높이 한도까지 */
const PATHS = [
  ['오른쪽 120px', [[0, 0], [120, 0]]],
  ['오른쪽 240px', [[0, 0], [240, 0]]],
  ['오른쪽 360px', [[0, 0], [360, 0]]],
  ['아래 60px → 오른쪽 200px', [[0, 0], [0, 60], [200, 60]]],
  ['비스듬히 (오른쪽 160, 아래 100)', [[0, 0], [160, 100]]],
  ['지그재그로 오른쪽 320px', Array.from({ length: 9 }, (_, i) => [i * 40, i % 2 ? 40 : 0]).concat([[320, 0]])],
  ['작은 원 한 바퀴', Array.from({ length: 37 }, (_, i) => [Math.round(80 * Math.sin((i / 36) * 2 * Math.PI)), Math.round(80 - 80 * Math.cos((i / 36) * 2 * Math.PI))])],
  ['위로 100px → 오른쪽 200px', [[0, 0], [0, -100], [200, -100]]],
  ['아래로 300px(바로 위에서 멈춤) → 왼쪽 150px', [[0, 0], [0, 150], [-150, 150]]],
];

test('마우스 끌기: 가로는 판 돌리기·세로는 내려다보는 높이 — 끄는 동안과 놓은 뒤 모두 쌓기나무의 세로 모서리가 곧고, 화면 = 규칙대로 계산한 자세', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '마우스는 크롬북에서');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-play');
  await build(page, testInfo);
  const box = await stageEl(page).boundingBox();
  // 시작 자리: 무대 가운데보다 조금 위(원·아래 끌기가 화면 안에 있게)
  const start = [box.x + box.width / 2 - 80, box.y + box.height * 0.35];
  const first = compare(await readStage(page), homeTurn());
  expect(first.odd).toEqual([]);
  expect(first.gap).toBeLessThanOrEqual(0.051); // 처음 보기 = 정해진 자세 그대로(화면의 점은 0.1px 단위로 적는다)
  for (const [name, vertices] of PATHS) {
    const points = route(start, vertices);
    await page.mouse.move(...points[0]);
    await page.mouse.down();
    const half = Math.floor(points.length / 2);
    for (let i = 1; i < points.length; i += 1) {
      await page.mouse.move(...points[i]);
      if (i === half) {
        // 끄는 도중
        await frames(page);
        const mid = await readStage(page);
        expect(mid.bent, `${name} 도중`).toEqual([]);
        expect(mid.under, `${name} 도중`).toBe(0);
        expect(compare(mid, follow(points, i + 1)).gap, `${name} 도중`).toBeLessThanOrEqual(0.15);
      }
    }
    await page.mouse.up();
    await frames(page);
    const read = await readStage(page);
    const view = follow(points);
    expect(read.bent, name).toEqual([]);
    expect(read.under, name).toBe(0);
    expect(read.sides + (view.pitch === 90 ? 1 : 0), `${name}: 옆면이 보인다`).toBeGreaterThan(0);
    const c = compare(read, view);
    expect(c.odd, name).toEqual([]);
    expect(c.gap, `${name}: 판 ${view.yaw}° · 높이 ${view.pitch.toFixed(2)}°`).toBeLessThanOrEqual(0.15);
    expect(view.pitch, name).toBeGreaterThanOrEqual(0);
    expect(view.pitch, name).toBeLessThanOrEqual(90);
    // 처음 보기로 돌아가 다음 경로
    await stageEl(page).focus();
    await page.keyboard.press('0');
    await settled(page);
    await expect(page.locator('.view-home')).toBeDisabled();
  }
  // 높이 한도: 위로 끝까지 끌면 옆에서(수평), 아래로 끝까지 끌면 바로 위에서 멈추고, 그 버튼이 꺼진다
  for (const [dy, button] of [[-400, '.view-down'], [400, '.view-up']]) {
    await page.mouse.move(...start);
    await page.mouse.down();
    for (let k = 1; k <= 20; k += 1) await page.mouse.move(start[0], start[1] + (dy * k) / 20);
    await page.mouse.up();
    await expect(page.locator(button)).toBeDisabled();
    await frames(page);
    const read = await readStage(page);
    expect(compare(read, { ...homeTurn(), pitch: dy < 0 ? 0 : 90 }).gap).toBeLessThanOrEqual(0.15);
    expect(read.under).toBe(0);
    await page.keyboard.press('0');
    await settled(page);
  }
  expect(errors).toEqual([]);
});

test('터치 한 손가락 끌기: 마우스와 같은 규칙 — 판이 기울지 않고, 화면 = 규칙대로 계산한 자세. 두 손가락 벌리기는 크기만 바꾼다', async ({ page }, testInfo) => {
  test.skip(!isTouch(testInfo), '터치는 태블릿에서');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-play');
  await build(page, testInfo);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const box = await stageEl(page).boundingBox();
  const start = [box.x + box.width / 2 - 60, box.y + box.height * 0.4];
  for (const [name, vertices] of [PATHS[0], PATHS[3], PATHS[4], PATHS[6], PATHS[7]]) {
    const points = route(start, vertices);
    await touch('touchStart', [points[0]]);
    for (let i = 1; i < points.length; i += 1) await touch('touchMove', [points[i]]);
    await touch('touchEnd', []);
    await frames(page);
    const read = await readStage(page);
    expect(read.bent, name).toEqual([]);
    expect(read.under, name).toBe(0);
    const c = compare(read, follow(points));
    expect(c.odd, name).toEqual([]);
    expect(c.gap, name).toBeLessThanOrEqual(0.15);
    await page.locator('.view-home').tap();
    await settled(page);
    await expect(page.locator('.view-home')).toBeDisabled();
  }
  // 오른쪽으로 120px 끈 뒤 두 손가락을 벌린다: 판의 방향은 그대로, 크기만 커진다
  const points = route(start, PATHS[0][1]);
  await touch('touchStart', [points[0]]);
  for (let i = 1; i < points.length; i += 1) await touch('touchMove', [points[i]]);
  await touch('touchEnd', []);
  const [cx, cy] = [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)];
  await touch('touchStart', [[cx - 30, cy]]);
  await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
  for (let i = 1; i <= 6; i += 1) await touch('touchMove', [[cx - 30 - i * 8, cy], [cx + 30 + i * 8, cy]]);
  await touch('touchEnd', []);
  await expect(page.locator('.view-in')).toBeDisabled(); // 2배까지 커졌다
  await frames(page);
  const read = await readStage(page);
  expect(read.bent).toEqual([]);
  expect(compare(read, { ...follow(points), zoom: 2 }).gap).toBeLessThanOrEqual(0.15);
  expect(errors).toEqual([]);
});

test('조작판·방향키는 눈금에 멈춘다: 판은 버튼 45°·방향키 15°, 높이는 15° — 수평·바로 위에 닿으면 그 버튼이 꺼지고(점선) 키는 그대로다', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, 'blocks-play');
  await build(page, testInfo);
  let view = homeTurn();
  const expectView = async (label) => {
    await settled(page);
    await frames(page);
    const read = await readStage(page);
    expect(read.bent, label).toEqual([]);
    const c = compare(read, view);
    expect(c.odd, label).toEqual([]);
    expect(c.gap, label).toBeLessThanOrEqual(0.15);
  };
  const button = async (name, dir) => {
    await press(testInfo, page.locator(name));
    view = stepTurn(view, dir);
    await expectView(`${name} → 판 ${view.yaw}° · 높이 ${view.pitch.toFixed(2)}°`);
  };
  // 수평까지 내린다: 35.26° → 30 → 15 → 0, [아래쪽으로]가 꺼진다
  for (let i = 0; i < 3; i += 1) await button('.view-down', 'down');
  expect(view.pitch).toBe(0);
  await expect(page.locator('.view-down')).toBeDisabled();
  expect(await page.locator('.view-down').evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed');
  await expect(page.locator('.view-up')).toBeEnabled();
  // 판 돌리기는 45° 눈금이라 앞·비스듬히·옆·…에 딱 멈추고, 여덟 번이면 한 바퀴
  for (let i = 0; i < 8; i += 1) await button('.view-right', 'right');
  expect(view.yaw).toBe(45);
  await button('.view-left', 'left');
  expect(view.yaw).toBe(0); // 수평에서 판 0° = [앞]과 같은 모습
  expect(compare(await readStage(page), { ...homeTurn(), ...snapTurn(view, 'front') }).gap).toBeLessThanOrEqual(0.15);
  // 바로 위까지 올린다: 0 → 15 → … → 90, [위쪽으로]가 꺼진다
  for (let i = 0; i < 6; i += 1) await button('.view-up', 'up');
  expect(view.pitch).toBe(90);
  await expect(page.locator('.view-up')).toBeDisabled();
  await expect(page.locator('.view-down')).toBeEnabled();
  // 방향키(크롬북): 판 15°·높이 15°. 한도에서 ↑를 더 눌러도 그대로이고 [위]의 표시(data-facing)가 남는다
  if (!isTouch(testInfo)) {
    await stageEl(page).focus();
    await page.keyboard.press('1');
    view = snapTurn(view, 'top');
    await expectView('[1] 위');
    await expect(stageEl(page)).toHaveAttribute('data-facing', 'top');
    await page.keyboard.press('ArrowUp');
    await expectView('위에서 ↑');
    await expect(stageEl(page)).toHaveAttribute('data-facing', 'top');
    for (const [key, dir] of [['ArrowDown', 'down'], ['ArrowLeft', 'left'], ['ArrowLeft', 'left'], ['ArrowRight', 'right'], ['ArrowDown', 'down']]) {
      await page.keyboard.press(key);
      view = stepTurn(view, dir, 15);
      await expectView(key);
    }
    expect(view).toEqual({ yaw: 345, pitch: 60, zoom: 1 });
    await page.keyboard.press('2');
    view = snapTurn(view, 'front');
    await expectView('[2] 앞');
    await page.keyboard.press('ArrowDown'); // 수평에서 ↓: 그대로
    await expectView('앞에서 ↓');
    await expect(stageEl(page)).toHaveAttribute('data-facing', 'front');
    await expect(page.locator('.view-down')).toBeDisabled();
  }
  expect(errors).toEqual([]);
});

test('[위][앞][옆]·처음 보기로 도는 움직임(0.2초)의 모든 화면 프레임에서 쌓기나무의 세로 모서리가 곧다 — 판이 제자리에서 돈다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  const errors = collectErrors(page);
  await open(page, 'blocks-play');
  await build(page, testInfo);
  // 판을 뒤쪽이 보이게 돌려 두고(오른쪽 버튼 셋 → 판 180°), [옆] → [앞] → [위] → 처음 보기로 — 도는 동안 프레임마다 잰다
  for (let i = 0; i < 3; i += 1) await page.locator('.view-right').click();
  await settled(page);
  for (const target of ['.blk-dir[data-dir="side"]', '.blk-dir[data-dir="front"]', '.blk-dir[data-dir="top"]', '.view-home']) {
    const seen = await page.evaluate((selector) => new Promise((resolve) => {
      const stage = document.querySelector('.blk-stage');
      const out = { frames: 0, bent: 0, under: 0 };
      const look = () => {
        for (const el of stage.querySelectorAll('.blk-shapes polygon.blk-front, .blk-shapes polygon.blk-back, .blk-shapes polygon.blk-left, .blk-shapes polygon.blk-right')) {
          const p = el.getAttribute('points').trim().split(/\s+/).map((s) => s.split(',').map(Number));
          if (p[0][0] !== p[3][0] || p[1][0] !== p[2][0] || p[3][1] > p[0][1] || p[2][1] > p[1][1]) out.bent += 1;
        }
        out.under += stage.querySelectorAll('.blk-tile.is-under').length;
      };
      document.querySelector(selector).click();
      const tick = () => {
        out.frames += 1;
        look();
        if (stage.classList.contains('is-easing')) requestAnimationFrame(tick);
        else resolve(out);
      };
      requestAnimationFrame(tick);
    }), target);
    expect(seen.bent, target).toBe(0);
    expect(seen.under, target).toBe(0);
    expect(seen.frames, target).toBeGreaterThanOrEqual(2);
  }
  // 다 돈 뒤 처음 보기 = 정해진 자세 그대로(화면의 점은 0.1px 단위로 적는다)
  const home = compare(await readStage(page), homeTurn());
  expect(home.odd).toEqual([]);
  expect(home.gap).toBeLessThanOrEqual(0.051);
  // [위]·[앞]·[옆]의 화면도 정해진 자세 그대로(움직임 줄이기와 같은 끝 모습)
  for (const name of ['top', 'front', 'side']) {
    await page.locator(`.blk-dir[data-dir="${name}"]`).click();
    await settled(page);
    await frames(page);
    const c = compare(await readStage(page), snapTurn(homeTurn(), name));
    expect(c.odd, name).toEqual([]);
    expect(c.gap, name).toBeLessThanOrEqual(0.051);
    expect(poseOf(snapTurn(homeTurn(), name))).toEqual(POSES[name]);
  }
  expect(errors).toEqual([]);
});
