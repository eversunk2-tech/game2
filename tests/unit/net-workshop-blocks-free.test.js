import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { MAX_H, emptyMap, place, setHeight, targetOf } from '../../src/games/net-workshop/blocks/blocks.js';
import { HOME_MARGIN, homeApartFit, homeUnitFor, sceneShapes } from '../../src/games/net-workshop/blocks/block-view.js';
import { homeTurn, poseOf } from '../../src/games/net-workshop/blocks/turn-view.js';
import { FREE_BOARDS, FREE_COLORS, QUARTERS, boardFor, freeKey, quarterAt, quarterBox, readSaved, toSaved } from '../../src/games/net-workshop/blocks/play-free-build.js';
import { BLOCK_FREE_STAGES, BLOCK_STAGES } from '../../src/games/net-workshop/blocks/blocks-stages.js';

// ── F1 자유 쌓기 (spec-grade6 15-18·15-19, plan-rotate-free 5절): 판 크기·저장·네 쪽·높이 한도·처음 보기 맞춤 ──
// 기대값은 기획서 문장으로 따로 센 것(독립 계산)과 견준다

test('자유 단계: 쌓기나무 영역의 자유 단계 하나(free: true, 차시 없음) — 차시의 단계 목록에는 들지 않는다', () => {
  assert.equal(BLOCK_FREE_STAGES.length, 1);
  const [free] = BLOCK_FREE_STAGES;
  assert.deepEqual({ id: free.id, area: free.area, kind: free.kind, free: free.free, lesson: free.lesson ?? null, title: free.title },
    { id: 'blocks-free', area: 'blocks', kind: 'free', free: true, lesson: null, title: '자유 쌓기' });
  assert.match(free.goal, /요\.$/);
  assert.ok(!BLOCK_STAGES.some((s) => s.id === free.id || s.free));
});

test('판 크기(결정 4): 화면의 짧은 변이 600px 미만이면 휴대폰 6×6칸·6층, 아니면 14×14칸·10층. 저장 열쇠는 판 크기마다', () => {
  assert.deepEqual(FREE_BOARDS.wide, { cols: 14, rows: 14, maxH: 10, quarter: 7 });
  assert.deepEqual(FREE_BOARDS.phone, { cols: 6, rows: 6, maxH: 6, quarter: 0 });
  const cases = [[1366, 768, 'wide'], [1366, 680, 'wide'], [1024, 768, 'wide'], [820, 1180, 'wide'], [600, 600, 'wide'], [390, 844, 'phone'], [844, 390, 'phone'], [599, 1200, 'phone'], [1200, 599, 'phone']];
  for (const [w, h, name] of cases) assert.equal(boardFor(w, h), FREE_BOARDS[name], `${w}×${h}`);
  assert.equal(freeKey(FREE_BOARDS.wide), 'free-14x14');
  assert.equal(freeKey(FREE_BOARDS.phone), 'free-6x6');
});

test('저장(결정 5): 높이 + 쌓기나무마다 색을 저장하고 그대로 읽는다(무작위 판 300개 — 14×14·10층, 6×6·6층). 14×14·10층을 다 채워도 수 KB', () => {
  const rng = createRng('free-save');
  for (const board of [FREE_BOARDS.wide, FREE_BOARDS.phone]) {
    for (let n = 0; n < 150; n += 1) {
      const map = emptyMap(board.cols, board.rows).map((row) => row.map(() => (rng.next() < 0.4 ? rng.int(1, board.maxH) : 0)));
      const cubes = map.map((row) => row.map((v) => Array.from({ length: v }, () => rng.pick(FREE_COLORS).token)));
      const raw = JSON.parse(JSON.stringify(toSaved(map, cubes))); // 저장소를 거친 모양(JSON)
      assert.deepEqual(readSaved(raw, board), { map, cubes });
    }
  }
  const full = emptyMap(14, 14).map((row) => row.map(() => 10));
  const fullCubes = full.map((row) => row.map(() => Array.from({ length: 10 }, (_, z) => FREE_COLORS[z % 5].token)));
  const bytes = JSON.stringify(toSaved(full, fullCubes)).length;
  assert.ok(bytes < 4000, `${bytes}바이트`);
});

test('저장 값이 판과 맞지 않으면 빈 판으로 시작한다(다른 판 크기·옛 모양·높이 한도 밖·소수·망가진 값). 색이 없거나 모르는 색은 첫 색(노랑)', () => {
  const wide = FREE_BOARDS.wide;
  const phone = FREE_BOARDS.phone;
  const six = toSaved(emptyMap(6, 6), emptyMap(6, 6).map((row) => row.map(() => [])));
  assert.equal(readSaved(six, wide), null); // 6×6 저장 값은 14×14 판에 쓰지 않는다(판 크기마다 열쇠도 따로)
  assert.ok(readSaved(six, phone));
  for (const raw of [null, undefined, 3, 'x', {}, { v: 2, h: six.h, c: six.c }, { v: 1, h: 'x' }, { v: 1, h: [[1]] }]) assert.equal(readSaved(raw, phone), null, JSON.stringify(raw));
  const bad = (value) => {
    const h = emptyMap(6, 6);
    h[2][3] = value;
    return readSaved({ v: 1, h, c: [] }, phone);
  };
  assert.equal(bad(7), null); // 휴대폰 판은 6층까지
  assert.equal(bad(-1), null);
  assert.equal(bad(1.5), null);
  assert.equal(bad('2'), null);
  const ok = bad(3);
  assert.deepEqual(ok.cubes[2][3], ['--face-1', '--face-1', '--face-1']);
  const h = emptyMap(6, 6);
  h[0][0] = 2;
  assert.deepEqual(readSaved({ v: 1, h, c: [['39']] }, phone).cubes[0][0], ['--face-3', '--face-1']); // 9는 모르는 색
});

test('위에서 본 판의 네 쪽(결정 8): 14×14의 모든 칸이 꼭 한 쪽(7×7)에 들고, 고르는 차례는 왼쪽 앞·오른쪽 앞·왼쪽 뒤·오른쪽 뒤(앞 = 줄 0쪽)', () => {
  assert.deepEqual(QUARTERS.map((q) => q.name), ['왼쪽 앞', '오른쪽 앞', '왼쪽 뒤', '오른쪽 뒤']);
  const seen = new Map();
  for (const q of QUARTERS) {
    const box = quarterBox(q.id, 7);
    assert.deepEqual([box.w, box.h], [7, 7]);
    // 독립: 왼쪽 = 칸 0~6, 오른쪽 = 7~13 · 앞 = 줄 0~6, 뒤 = 7~13
    assert.equal(box.x0, q.name.startsWith('왼쪽') ? 0 : 7);
    assert.equal(box.y0, q.name.endsWith('앞') ? 0 : 7);
    for (let y = box.y0; y < box.y0 + 7; y += 1) for (let x = box.x0; x < box.x0 + 7; x += 1) seen.set(`${x},${y}`, (seen.get(`${x},${y}`) ?? 0) + 1);
  }
  assert.equal(seen.size, 196);
  assert.ok([...seen.values()].every((n) => n === 1));
  for (let y = 0; y < 14; y += 1) for (let x = 0; x < 14; x += 1) {
    const box = quarterBox(quarterAt(x, y, 7).id, 7);
    assert.ok(x >= box.x0 && x < box.x0 + 7 && y >= box.y0 && y < box.y0 + 7, `${x},${y}`);
  }
});

test('높이 한도: 차시는 3층 그대로, 자유 쌓기는 10층(휴대폰 6층) — 쌓기·높이 맞추기·놓일 자리', () => {
  assert.equal(MAX_H, 3);
  for (const maxH of [3, 6, 10]) {
    let h = emptyMap(14, 14);
    for (let k = 0; k < maxH; k += 1) h = place(h, { x: 13, y: 13 }, maxH);
    assert.equal(h[13][13], maxH);
    assert.equal(place(h, { x: 13, y: 13 }, maxH), null);
    assert.deepEqual(targetOf(h, { kind: 'tile', x: 13, y: 13 }, 'add', maxH), { error: 'full', x: 13, y: 13 });
    assert.deepEqual(targetOf(h, { kind: 'tile', x: 14, y: 0 }, 'add', maxH), { error: 'outside', x: 14, y: 0 });
    assert.equal(setHeight(emptyMap(14, 14), { x: 0, y: 0 }, maxH, maxH)[0][0], maxH);
    assert.equal(setHeight(emptyMap(14, 14), { x: 0, y: 0 }, maxH + 1, maxH), null);
  }
  // 한도를 주지 않으면 차시의 3층(지금 그대로)
  let h = emptyMap();
  for (let k = 0; k < 3; k += 1) h = place(h, { x: 0, y: 0 });
  assert.equal(place(h, { x: 0, y: 0 }), null);
  assert.equal(setHeight(emptyMap(), { x: 0, y: 0 }, 4), null);
});

test('처음 보기 맞춤(결정 4 "판이 꽉 차게"): 교과서 방향에서 판(칸 × 줄)과 3층 높이가 무대에 들어가는 가장 큰 한 변 — 독립 계산과 같다', () => {
  // 독립: 처음 보기(위에서 35.26° 내려다봄, 판 45° 돌림)에서 판 n×n의 화면 너비 = 2n·cos45°, 높이 = 2n·sin45°·sin(35.26°)… = 2n/√6, 한 층 = 2/√6
  const indep = (w, h, n) => Math.floor(Math.min(h / ((2 * n) / Math.sqrt(6) + 6 / Math.sqrt(6) + HOME_MARGIN.h), w / (2 * n * Math.SQRT1_2 + HOME_MARGIN.w)));
  for (const [w, h] of [[1048, 594], [1048, 536], [832, 594], [776, 877], [334, 300]]) {
    for (const n of [6, 14]) assert.equal(homeUnitFor(w, h, { cols: n, rows: n, fitH: 3 }), Math.max(8, indep(w, h, n)), `${w}×${h} ${n}칸`);
  }
  // 화면의 다섯 크기에서 잰 값(f1-measure — 무대 크기 → 쌓기나무 한 변): 크롬북 40·36px, 가로 태블릿 40px, 세로 태블릿 38px, 휴대폰 6×6 36px
  assert.deepEqual([[1048, 594], [1048, 536], [832, 594], [776, 877]].map(([w, h]) => homeUnitFor(w, h, { cols: 14, rows: 14 })), [40, 36, 40, 38]);
  assert.equal(homeUnitFor(334, 300, { cols: 6, rows: 6 }), 36);
  // 처음 보기의 실제 투영: 판 네 모서리의 화면 너비·높이 = 독립 식
  const pose = poseOf(homeTurn());
  const tiles = sceneShapes(emptyMap(14, 14), pose).filter((s) => s.kind === 'tile');
  assert.equal(tiles.length, 196);
  const xs = [];
  const ys = [];
  for (const t of tiles) for (const p of t.pts) {
    xs.push(pose[0] * p[0] + pose[1] * p[1] + pose[2] * p[2]);
    ys.push(pose[3] * p[0] + pose[4] * p[1] + pose[5] * p[2]);
  }
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 28 * Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - 28 / Math.sqrt(6)) < 1e-9);
  // 층별로 벌릴 때: 쌓은 층까지만 벌려 처음 맞춤 높이 안에(1 이하로만 줄인다)
  assert.equal(homeApartFit({ cols: 14, rows: 14, fitH: 3 }, 1), 1);
  for (let n = 2; n <= 10; n += 1) assert.ok(homeApartFit({ cols: 14, rows: 14, fitH: 3 }, n) <= homeApartFit({ cols: 14, rows: 14, fitH: 3 }, n - 1));
});
