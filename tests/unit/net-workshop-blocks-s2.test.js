/**
 * 쌓기나무 3·4차시(S2) 검사: 2D 그림(위·앞·옆), 문제 만들기·채점·까닭 문장·힌트, 보기의 자리와 값의 꼴, 별·점수.
 * 판정은 저장소의 함수를 쓰지 않고 기획서(spec-grade6.md 2-4·4·6-3·6-4절)의 문장만 보고 짠 독립 계산(쌓기나무 칸의 집합, 옮겨 겹치기)과
 * 3×3칸·3층의 높이 지도 262,144개 전부 또는 시드 수백~1,000개로 견준다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { createPlayReward, stageXp } from '../../src/shared/core/rewards.js';
import { starsFromAccuracy } from '../../src/shared/core/progress.js';
import { count, fillsOf, isConnectedTop, lookKey, mapKey, maxFill, minCount, toCorner } from '../../src/games/net-workshop/blocks/blocks.js';
import {
  BLOCK_STAGES,
  BLOCK_TAGS,
  FLIP_ASK,
  alignCells,
  arrangementsOf,
  columnsToCells,
  describeView,
  drawHint,
  flipKindOf,
  judgeDrawing,
  judgeFlip,
  judgeNumPick,
  judgeNumberBuild,
  judgeNumbers,
  judgeThree,
  judgeThreeGuess,
  judgeThreeOther,
  judgeView,
  makeBlockQuestions,
  mirrorCells,
  mirrorMap,
  normalizeView,
  numberBuildHint,
  sameView,
  shiftCells,
  spotName,
  starsByWrong,
  sumSentence,
  swapMap,
  threeHint,
  threeViews,
  turnMap,
  viewCells,
  viewDiff,
  viewKey,
} from '../../src/games/net-workshop/blocks/blocks-logic.js';

const stage = (id) => BLOCK_STAGES.find((s) => s.id === id);
const questions = (id, seed) => makeBlockQuestions(stage(id), createRng(`${seed}:${id}`));
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

// ── 독립 계산 ─────────────────────────────
const R = [0, 1, 2];
/** 높이 지도 → 칸의 집합 v[x][y][z] (뜬 쌓기나무 없음: 그 자리의 높이까지 찬다) */
function voxels(h) {
  const v = R.map(() => R.map(() => [false, false, false]));
  R.forEach((y) => R.forEach((x) => {
    for (let z = 0; z < h[y][x]; z += 1) v[x][y][z] = true;
  }));
  return v;
}
const has = (v, x, y, z) => x >= 0 && x <= 2 && y >= 0 && y <= 2 && z >= 0 && z <= 2 && v[x][y][z];
/** 그쪽에서 볼 때 왼쪽부터 세로줄마다 가장 높은 층(쌓기나무가 있는 가장 높은 z + 1) — 앞: 세로줄 = x, 뒤: x를 거꾸로, 옆(오른쪽): y, 왼쪽: y를 거꾸로 */
function indepHeights(h, dir) {
  const v = voxels(h);
  const line = (i) => {
    let top = 0;
    for (const a of R) {
      const [x, y] = dir === 'front' ? [i, a] : dir === 'back' ? [2 - i, a] : dir === 'side' ? [a, i] : [a, 2 - i];
      for (const z of R) if (v[x][y][z]) top = Math.max(top, z + 1);
    }
    return top;
  };
  return R.map(line);
}
/**
 * 교과서 방향의 그림(눈이 앞·오른쪽·위 = (1, −1, 1) 쪽)에서 한 조각도 보이지 않는 쌓기나무: 보이는 세 면(위·앞·오른쪽)을 삼각 조각 둘씩으로 나눠
 * 조각의 무게중심에서 눈 쪽으로 광선을 쏘아 다른 쌓기나무에 막히는지 본다(광선은 칸의 경계를 t가 1/3의 배수일 때만 지나므로 그 사이를 본다)
 */
const TRI = [
  [[0, 0, 1], [1, 0, 1], [0, 1, 1]], [[1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1]], [[0, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 0], [1, 1, 0], [1, 0, 1]], [[1, 1, 0], [1, 1, 1], [1, 0, 1]],
];
function indepHidden(h) {
  const v = voxels(h);
  const out = [];
  R.forEach((y) => R.forEach((x) => {
    for (let z = 0; z < h[y][x]; z += 1) {
      const seen = TRI.some((tri) => {
        const cx = x + (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
        const cy = y + (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const cz = z + (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
        for (let k = 0; k < 10; k += 1) {
          const t = 1 / 6 + k / 3;
          if (has(v, Math.floor(cx + t), Math.floor(cy - t), Math.floor(cz + t))) return false;
        }
        return true;
      });
      if (!seen) out.push([x, y, z]);
    }
  }));
  return out;
}
/** 그림 칸: 위 = 쌓기나무가 있는 자리, 앞·옆 = [층][세로줄] */
function indepCells(h, dir) {
  if (dir === 'top') return R.map((y) => R.map((x) => (h[y][x] > 0 ? 1 : 0)));
  const hs = indepHeights(h, dir);
  return R.map((z) => R.map((i) => (hs[i] > z ? 1 : 0)));
}
/** 두 그림이 옮겨서 겹치는가: 앞·옆은 왼쪽·오른쪽으로만, 위는 모든 방향으로 옮겨 본다(칸이 판 밖으로 나가면 안 된다) */
function indepSameShape(a, b, dir) {
  const on = (g) => {
    const out = [];
    R.forEach((r) => R.forEach((c) => {
      if (g[r][c]) out.push([r, c]);
    }));
    return out;
  };
  const A = on(a);
  const B = new Set(on(b).map(([r, c]) => `${r},${c}`));
  if (A.length !== B.size) return false;
  if (A.length === 0) return true;
  for (let dr = -2; dr <= 2; dr += 1) {
    if (dir !== 'top' && dr !== 0) continue;
    for (let dc = -2; dc <= 2; dc += 1) if (A.every(([r, c]) => B.has(`${r + dr},${c + dc}`))) return true;
  }
  return false;
}
const reverse = (v) => [...v].reverse();
const mirror = (g) => g.map((row) => reverse(row));
/** 옮겨서 겹치는 두 높이 지도인가(통째로 옮기기) */
function indepSameMapShifted(a, b) {
  const cellsA = [];
  R.forEach((y) => R.forEach((x) => {
    if (a[y][x]) cellsA.push([x, y, a[y][x]]);
  }));
  const nB = R.reduce((s, y) => s + R.filter((x) => b[y][x]).length, 0);
  if (cellsA.length !== nB) return false;
  for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (cellsA.every(([x, y, v]) => b[y + dy]?.[x + dx] === v)) return true;
  return false;
}
const ALL = [];
for (let n = 0; n < 4 ** 9; n += 1) {
  const h = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let v = n;
  for (let i = 0; i < 9; i += 1) {
    h[Math.floor(i / 3)][i % 3] = v & 3;
    v >>= 2;
  }
  ALL.push(h);
}
const GRIDS = Array.from({ length: 512 }, (_, n) => R.map((r) => R.map((c) => (n >> (r * 3 + c)) & 1)));

// ── 2D 그림 ─────────────────────────────
test('2D 그림: 위·앞·옆·뒤·왼쪽에서 본 모양의 칸이 높이 지도 262,144개 전부에서 칸의 집합으로 따로 계산한 값과 같다', () => {
  for (const h of ALL) {
    for (const dir of ['top', 'front', 'side', 'back', 'left']) assert.deepEqual(viewCells(h, dir), indepCells(h, dir), `${mapKey(h)} ${dir}`);
  }
  // 뒤 = 앞을 좌우로 뒤집은 것, 왼쪽 = 옆을 좌우로 뒤집은 것 (교과서 60쪽)
  for (let i = 0; i < ALL.length; i += 17) {
    assert.deepEqual(viewCells(ALL[i], 'back'), mirror(viewCells(ALL[i], 'front')));
    assert.deepEqual(viewCells(ALL[i], 'left'), mirror(viewCells(ALL[i], 'side')));
  }
  assert.deepEqual(columnsToCells([2, 0, 3]), [[1, 0, 1], [1, 0, 1], [0, 0, 1]]);
  assert.equal(describeView(viewCells([[2, 3, 1], [0, 0, 0], [0, 0, 0]], 'front'), 'front'), '앞에서 본 모양: 왼쪽부터 2층, 3층, 1층');
  assert.equal(describeView(viewCells([[1, 1, 0], [0, 0, 0], [0, 2, 0]], 'top'), 'top'), '위에서 본 모양: 쌓인 자리는 1줄 1칸, 1줄 2칸, 3줄 2칸');
});

test('그린 그림 견주기: 옮겨서 겹치면 같은 그림(앞·옆은 옆으로만, 위는 어느 쪽으로든) — 그림 512 × 512쌍 전부를 독립 계산과 견준다', () => {
  for (const dir of ['top', 'front']) {
    for (const a of GRIDS) {
      for (const b of GRIDS) {
        const same = indepSameShape(a, b, dir);
        assert.equal(sameView(a, b, dir), same);
        // 다른 칸: 같은 그림이면 없고, 다르면 있다. 다른 칸을 고치면(내 그림의 자리에서) 목표와 같아진다
        if (a.flat().some(Boolean) && b.flat().some(Boolean)) {
          const diff = viewDiff(a, b, dir);
          assert.equal(diff.length === 0, same, `${a} ${b}`);
          const fixed = a.map((row) => [...row]);
          for (const d of diff) fixed[d.r][d.c] = d.state === 'missing' ? 1 : 0;
          assert.ok(sameView(fixed, b, dir), `${a} ${b} ${dir}`);
        }
      }
    }
  }
  // 옮기기·맞추기
  assert.deepEqual(shiftCells([[0, 1, 1], [0, 0, 0], [0, 0, 0]], -1), [[1, 1, 0], [0, 0, 0], [0, 0, 0]]);
  assert.deepEqual(normalizeView([[0, 0, 0], [0, 0, 1], [0, 0, 1]], 'top'), [[1, 0, 0], [1, 0, 0], [0, 0, 0]]);
  assert.deepEqual(normalizeView([[0, 0, 0], [0, 0, 1], [0, 0, 1]], 'front'), [[0, 0, 0], [1, 0, 0], [1, 0, 0]]); // 앞·옆은 아래로 옮기지 않는다
  assert.deepEqual(alignCells([[1, 0, 0], [0, 0, 0], [0, 0, 0]], [[0, 0, 1], [0, 0, 0], [0, 0, 0]], 'front'), [[0, 0, 1], [0, 0, 0], [0, 0, 0]]);
  assert.equal(viewKey(GRIDS[0], 'top'), mapKey(GRIDS[0]));
});

/** 그리기 문항의 판정(독립 계산): 같은 그림이면 맞음 */
const indepDrawCorrect = (q, kind, mine) => indepSameShape(mine, indepCells(q.target, kind), kind);

test('blocks-draw 문제 만들기 (시드 300개): 앞 1 · 옆 1 · 위·앞·옆 1, 숨겨진 쌓기나무가 없고(그림만 보고 그릴 수 있다) 앞과 옆의 그림이 다르다', () => {
  let trapsFront = 0;
  for (const seed of SEEDS) {
    const qs = questions('blocks-draw', seed);
    assert.deepEqual(qs.map((q) => q.kinds), [['front'], ['side'], ['top', 'front', 'side']]);
    assert.equal(new Set(qs.map((q) => mapKey(q.target))).size, 3);
    for (const q of qs) {
      assert.ok(isConnectedTop(q.target));
      assert.ok(q.total >= 5 && q.total <= 9 && q.total === count(q.target));
      assert.ok(Math.max(...q.target.flat()) >= 2);
      // 숨겨진 쌓기나무 없음(교과서 방향의 그림에서 쌓기나무마다 한 조각이라도 보인다 — 광선으로 따로 계산)
      assert.deepEqual(indepHidden(q.target), [], `${seed} ${mapKey(q.target)}`);
      assert.ok(!indepSameShape(indepCells(q.target, 'front'), indepCells(q.target, 'side'), 'front'));
      for (const kind of ['top', 'front', 'side']) assert.deepEqual(q.views[kind], indepCells(q.target, kind));
      if (q.kinds.length === 1) {
        const [kind] = q.kinds;
        const cells = indepCells(q.target, kind);
        assert.ok(!indepSameShape(cells, mirror(cells), kind), '좌우로 뒤집어 그리면 틀린 답이 된다');
        // 뒤집은 그림이 다른 쪽(앞 ↔ 옆) 그림과 같지 않다 — 뒤집어 그린 학생은 늘 "좌우 뒤집힘" 까닭을 만난다 (review-blocks-s2 S2-4)
        assert.ok(!indepSameShape(mirror(cells), indepCells(q.target, kind === 'front' ? 'side' : 'front'), kind), `${seed} ${kind} 뒤집은 그림 = 다른 쪽`);
        assert.equal(judgeView(q, kind, mirror(cells)).tag, BLOCK_TAGS.mirror);
        // 가장 가까운 쌓기나무보다 뒤(안쪽)의 쌓기나무가 높은 세로줄이 있다 — "가장 높은 층"을 만난다
        const lines = R.map((i) => R.map((k) => (kind === 'front' ? q.target[k][i] : q.target[i][2 - k])));
        assert.ok(lines.some((line) => {
          const near = line.find((n) => n > 0);
          return near !== undefined && near < Math.max(...line);
        }), `${seed} ${kind}`);
        if (kind === 'front') trapsFront += 1;
      }
    }
  }
  assert.equal(trapsFront, 300);
});

test('blocks-draw · blocks-numviews 채점: 무작위 그림 3,000장이 독립 계산과 같고, tag는 앞과 옆 → 좌우 뒤집힘 → 가장 높은 층(위는 바닥에 닿은 면)', () => {
  const rng = createRng('draw-judge');
  let checked = 0;
  const seen = { over: 0, under: 0 };
  for (const seed of SEEDS.slice(0, 100)) {
    for (const q of [...questions('blocks-draw', seed), ...questions('blocks-numviews', seed).filter((x) => x.kind === 'paint')]) {
      for (const kind of q.kinds) {
        const target = q.views[kind];
        // 맞는 그림: 그대로 · 판 위의 다른 자리
        assert.equal(judgeView(q, kind, target).correct, true);
        for (let dc = -2; dc <= 2; dc += 1) {
          const moved = shiftCells(target, dc);
          if (moved.flat().filter(Boolean).length === target.flat().filter(Boolean).length) assert.equal(judgeView(q, kind, moved).correct, true);
        }
        // 무작위 그림 10장
        for (let n = 0; n < 10; n += 1) {
          const g = GRIDS[rng.int(1, 511)];
          const r = judgeView(q, kind, g);
          assert.equal(r.correct, indepDrawCorrect(q, kind, g));
          if (!r.correct) assert.ok(Object.values(BLOCK_TAGS).includes(r.tag));
          checked += 1;
        }
        assert.equal(judgeView(q, kind, GRIDS[0]).empty, true);
        // 오개념 그림의 tag
        if (kind !== 'top') {
          const other = q.views[kind === 'front' ? 'side' : 'front'];
          if (!indepSameShape(other, target, kind)) assert.equal(judgeView(q, kind, other).tag, BLOCK_TAGS.frontSide);
          if (!indepSameShape(mirror(target), target, kind) && !indepSameShape(mirror(target), other, kind)) assert.equal(judgeView(q, kind, mirror(target)).tag, BLOCK_TAGS.mirror);
        } else if (!indepSameShape(mirror(target), target, 'top')) assert.equal(judgeView(q, 'top', mirror(target)).tag, BLOCK_TAGS.mirror);
      }
      // "가장 높은 층" 까닭은 덜 칠했는지·더 칠했는지에 따라 (review-blocks-s2 S2-5 ①): 9칸 모두 칠함 → 더 칠함
      for (const kind of q.kinds.filter((k) => k !== 'top')) {
        const full = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
        const over = judgeView(q, kind, full);
        const from = q.itemId.startsWith('blocks-numviews') ? 'numbers' : 'picture';
        const overNote = judgeView(q, kind, full, { from });
        if (over.tag === BLOCK_TAGS.tallest) {
          assert.ok(over.diff.every((d) => d.state === 'extra'));
          assert.equal(over.note, `${kind === 'front' ? '앞' : '옆'}에서 본 모양은 세로줄마다 가장 높은 층까지만 칠해요.`);
          assert.match(overNote.note, from === 'numbers' ? /가장 큰 수만큼만 보여요\./ : /가장 높은 층까지만 칠해요\.$/);
          seen.over += 1;
        }
        // 맨 아래 층만(덜 칠함): 뒤(안쪽)의 높은 쌓기나무도 보인다
        const low = q.views[kind].map((row, z) => row.map((v) => (z === 0 ? v : 0)));
        const under = judgeView(q, kind, low);
        if (!under.correct && under.tag === BLOCK_TAGS.tallest) {
          assert.ok(under.diff.every((d) => d.state === 'missing'));
          assert.match(under.note, /(뒤|안쪽)에 있는 높은 쌓기나무도 보여요\.$/);
          seen.under += 1;
        }
      }
      // 여러 장을 한 번에: 모두 맞아야 맞음, 앞·옆을 바꿔 그리면 앞과 옆
      const right = Object.fromEntries(q.kinds.map((k) => [k, q.views[k]]));
      assert.equal(judgeDrawing(q, right).correct, true);
      if (q.kinds.length === 3) {
        const swapped = { ...right, front: q.views.side, side: q.views.front };
        const r = judgeDrawing(q, swapped);
        assert.equal(r.correct, false);
        assert.equal(r.tag, BLOCK_TAGS.frontSide);
        assert.deepEqual(r.wrongKinds, ['front', 'side']);
        assert.match(r.message, /^앞, 옆에서 본 모양에 다른 칸이 있어요\. /);
        assert.equal(judgeDrawing(q, { ...right, top: GRIDS[0] }).empty, true);
      }
    }
  }
  assert.ok(checked > 3000);
  assert.ok(seen.over > 200 && seen.under > 100, JSON.stringify(seen));
});

test('그리기 힌트: 처음으로 다른 그림의 세로줄 하나(위는 자리 수만), 맞은 그림은 건너뛴다', () => {
  for (const seed of SEEDS.slice(0, 60)) {
    for (const q of questions('blocks-draw', seed)) {
      const blank = Object.fromEntries(q.kinds.map((k) => [k, GRIDS[0]]));
      const text = drawHint(q, blank);
      if (q.kinds[0] === 'top') assert.match(text, /^위에서 본 모양에는 쌓인 자리가 \d곳이에요\.$/);
      else assert.match(text, /^(앞|옆)에서 본 모양에서 왼쪽 끝부터 [1-3]번째 세로줄은 [1-3]층까지 보여요\.$/);
      const right = Object.fromEntries(q.kinds.map((k) => [k, q.views[k]]));
      assert.equal(drawHint(q, right), '위, 앞, 옆에서 본 모양을 다시 살펴봐요.');
    }
    for (const q of questions('blocks-numviews', seed).filter((x) => x.kind === 'paint')) {
      assert.match(drawHint(q, { [q.kinds[0]]: GRIDS[0] }, { from: 'numbers' }), /^수를 쓴 그림에서 (왼쪽부터 [1-3]번째 세로줄|[1-3]줄\(앞줄부터\))의 가장 큰 수는 [1-3](이에요|예요)\. (앞|옆)에서 본 모양에서는 그만큼 보여요\.$/);
    }
  }
});

// ── 앞과 뒤, 오른쪽과 왼쪽 ─────────────────
test('blocks-flip 문제 만들기 (시드 1,000개): 반대쪽 모양이 독립 계산과 같고, 보기 셋은 주어진 그림의 높이를 줄 세운 서로 다른 것, 숨겨진 쌓기나무가 없다', () => {
  const givens = { front: 0, side: 0 };
  for (let seed = 1; seed <= 1000; seed += 1) {
    const qs = questions('blocks-flip', seed);
    assert.equal(qs.length, 3);
    assert.ok(qs.some((q) => q.given === 'front') && qs.some((q) => q.given === 'side'), `${seed}`);
    assert.equal(new Set(qs.map((q) => mapKey(q.target))).size, 3);
    for (const q of qs) {
      givens[q.given] += 1;
      assert.equal(q.ask, FLIP_ASK[q.given]);
      assert.deepEqual(q.view, indepHeights(q.target, q.given));
      assert.ok(q.view.every((n) => n > 0) && new Set(q.view).size > 1, `${seed} ${q.view}`);
      assert.ok(isConnectedTop(q.target) && count(q.target) >= 4 && count(q.target) <= 9);
      if (seed <= 300) assert.deepEqual(indepHidden(q.target), []);
      assert.equal(q.kind, flipKindOf(q.view));
      // 보기: 셋, 서로 다르고, 주어진 높이를 줄 세운 것. 정답 = 반대쪽에서 본 모양(독립 계산)
      assert.equal(q.options.length, 3);
      assert.equal(new Set(q.options.map((o) => o.heights.join())).size, 3);
      for (const o of q.options) assert.deepEqual([...o.heights].sort(), [...q.view].sort());
      assert.deepEqual(q.options[q.expected - 1].heights, indepHeights(q.target, q.ask));
      assert.equal(q.options.filter((o) => o.role === 'answer').length, 1);
      // 좌우가 같은 그림이면 정답이 주어진 그림과 같고 나머지 둘은 서로 뒤집은 짝. 아니면 묶음(set)대로:
      // same = "주어진 그림 그대로"(오개념) + 다른 줄 세움 · pair = 서로 뒤집은 짝 둘 · apart = 짝이 아닌 둘 (review-blocks-s2 S2-2)
      const same = q.options.filter((o) => o.heights.join() === q.view.join());
      const rest = q.options.filter((o) => o.role !== 'answer').map((o) => o.heights);
      const paired = rest[0].join() === reverse(rest[1]).join();
      if (q.kind === 'pal') {
        assert.equal(q.set, 'pal');
        assert.equal(same[0].role, 'answer');
        assert.ok(paired);
      } else if (q.set === 'same') {
        assert.equal(same.length, 1);
        assert.equal(same[0].role, 'same');
      } else {
        assert.equal(q.kind, 'dist');
        assert.equal(same.length, 0);
        assert.equal(paired, q.set === 'pair', `${q.set} ${rest}`);
      }
      if (q.kind === 'rep') assert.equal(q.set, 'same');
      for (let c = 1; c <= 3; c += 1) {
        const r = judgeFlip(q, c);
        assert.equal(r.correct, c === q.expected);
        assert.equal(r.tag, r.correct ? null : BLOCK_TAGS.mirror);
        assert.match(r.message, /좌우로 뒤집혀요\..*앞과 옆만 알면 돼요\. 옆은 오른쪽이에요\.$/);
      }
    }
  }
  assert.ok(givens.front > 1300 && givens.side > 1300, JSON.stringify(givens));
  assert.deepEqual(arrangementsOf([1, 1, 2]).map((a) => a.join('')).sort(), ['112', '121', '211']);
});

test('blocks-flip 보기의 자리와 꼴 (시드 1,000개 · 3,000문항): 정답 자리가 고르고, 그림을 견주지 않고 보기의 꼴만 보는 규칙은 찍기(1/3)에서 ±10%p 안', () => {
  const rng = createRng('flip-rules');
  const pos = [0, 0, 0];
  const rules = {
    sameAsGiven: 0, notSameAsGiven: 0, mirrorPair: 0, notInPair: 0, palindrome: 0, notPalindrome: 0, oddMiddle: 0, shareMiddle: 0, sameNumbers: 0, tallMiddle: 0,
    // review-blocks-s2 S2-2의 두 규칙과, 꼴 두 가지를 함께 보는 규칙
    palElsePair: 0, notGivenNotPal: 0, palAndGiven: 0, pairNotPal: 0, apartNotPal: 0,
  };
  const kinds = { pal: 0, rep: 0, dist: 0 };
  let withSame = 0;
  let n = 0;
  const key = (v) => v.join();
  for (let seed = 1; seed <= 1000; seed += 1) {
    for (const q of questions('blocks-flip', seed)) {
      n += 1;
      kinds[q.kind] += 1;
      const o = q.options.map((x) => x.heights);
      const ans = q.expected - 1;
      pos[ans] += 1;
      // 규칙이 고른 보기들 가운데 무작위로 하나(골라 낸 것이 없으면 셋 가운데) — 맞힐 확률의 기대값
      const chance = (picked) => {
        const list = picked.length ? picked : [0, 1, 2];
        return list.includes(ans) ? 1 / list.length : 0;
      };
      const all = [0, 1, 2];
      const paired = all.filter((i) => all.some((j) => j !== i && key(o[j]) === key(reverse(o[i]))));
      const pals = all.filter((i) => key(o[i]) === key(reverse(o[i])));
      const mids = o.map((v) => v[1]);
      rules.sameAsGiven += chance(all.filter((i) => key(o[i]) === key(q.view)));
      rules.notSameAsGiven += chance(all.filter((i) => key(o[i]) !== key(q.view)));
      rules.mirrorPair += chance(paired);
      rules.notInPair += chance(all.filter((i) => !paired.includes(i)));
      rules.palindrome += chance(pals);
      rules.notPalindrome += chance(all.filter((i) => !pals.includes(i)));
      rules.oddMiddle += chance(all.filter((i) => mids.filter((m) => m === mids[i]).length === 1));
      rules.shareMiddle += chance(all.filter((i) => mids.filter((m) => m === mids[i]).length > 1));
      rules.sameNumbers += chance(all.filter((i) => key(o[i]) !== key(q.view) && key([...o[i]].sort()) === key([...q.view].sort())));
      rules.tallMiddle += chance(all.filter((i) => o[i][1] > o[i][0] && o[i][1] > o[i][2]));
      const same = all.filter((i) => key(o[i]) === key(q.view));
      rules.palElsePair += chance(pals.length ? pals : paired);
      rules.notGivenNotPal += chance(all.filter((i) => !same.includes(i) && !pals.includes(i)));
      rules.palAndGiven += chance(all.filter((i) => pals.includes(i) && same.includes(i)));
      rules.pairNotPal += chance(all.filter((i) => paired.includes(i) && !pals.includes(i)));
      rules.apartNotPal += chance(all.filter((i) => !paired.includes(i) && !pals.includes(i)));
      if (q.options.some((x) => x.role === 'same')) withSame += 1;
    }
  }
  assert.equal(n, 3000);
  for (const p of pos) assert.ok(p / n > 0.25 && p / n < 0.42, `정답 자리 ${pos}`);
  for (const [name, v] of Object.entries(rules)) assert.ok(v / n > 0.2333 && v / n < 0.4333, `${name} ${(v / n).toFixed(3)}`);
  // 꼴의 비율: 판마다 한 문항은 "주어진 그림 그대로" 보기가 든 문항(15-8), 나머지 둘은 주머니 19개(좌우가 같은 그림 3 · 그대로 2 · 짝 3 · 짝 아님 11)에서
  // → 좌우가 같은 그림 2/3 × 3/19 ≈ 10.5% · "그대로" 보기가 든 문항 1/3 + 2/3 × 2/19 ≈ 40.4% (전에는 29% — review-blocks-s2 S2b-1)
  assert.ok(kinds.pal / n > 0.08 && kinds.pal / n < 0.14, JSON.stringify(kinds));
  assert.ok(withSame / n > 0.36 && withSame / n < 0.45, `${withSame}`);
  assert.ok(rng);
});

// ── 위, 앞, 옆을 보고 쌓기 ──────────────────
/** 세 그림(위·앞·옆)이 같은 높이 지도 묶음(독립 계산) — 한 번만 계산한다 */
const threeKey = (h) => `${indepCells(h, 'top').flat().join('')}|${indepHeights(h, 'front').join('')}|${indepHeights(h, 'side').join('')}`;
let THREE = null;
function threeGroups() {
  if (THREE) return THREE;
  THREE = new Map();
  ALL.forEach((h, i) => {
    const k = threeKey(h);
    const g = THREE.get(k);
    if (g) g.push(i);
    else THREE.set(k, [i]);
  });
  return THREE;
}

test('세 그림(위·앞·옆)에 맞는 쌓기: 묶음 52,612개 전부에서 "하나로 정해진다" ⟺ maxFill의 개수 = minCount, 문제 후보 가운데 12,636개(기획서 6-4절)', () => {
  const groups = threeGroups();
  assert.equal(groups.size, 52612);
  let fixedCandidates = 0;
  for (const list of groups.values()) {
    const h = ALL[list[0]];
    const views = threeViews(h);
    const one = list.length === 1;
    assert.equal(count(maxFill(views)) === minCount(views), one, mapKey(h));
    assert.equal(fillsOf(views).length, list.length);
    for (const i of list) if (count(ALL[i]) >= 5 && count(ALL[i]) <= 12 && isConnectedTop(ALL[i]) && one) fixedCandidates += 1;
  }
  assert.equal(fixedCandidates, 12636);
});

test('blocks-build 문제 만들기 (시드 300개): 2문항은 쌓기가 하나로 정해지고 1문항은 여러 가지(2~4가지, 개수 2~3가지), 차례는 섞인다', () => {
  const manyAt = [0, 0, 0];
  for (const seed of SEEDS) {
    const qs = questions('blocks-build', seed);
    assert.deepEqual(qs.map((q) => q.many).filter(Boolean).length, 1);
    manyAt[qs.findIndex((q) => q.many)] += 1;
    assert.equal(new Set(qs.map((q) => mapKey(toCorner(q.target)))).size, 3);
    for (const q of qs) {
      assert.ok(isConnectedTop(q.target) && count(q.target) >= 5 && count(q.target) <= 10);
      // 세 그림에 맞는 쌓기 전부(독립 계산: 262,144개 가운데 세 그림이 같은 것)
      const same = threeGroups().get(threeKey(q.target)).map((j) => ALL[j]);
      assert.deepEqual(q.fills.map(mapKey).sort(), same.map(mapKey).sort());
      assert.deepEqual(q.counts, [...new Set(same.map(count))].sort((a, b) => a - b));
      if (q.many) assert.ok(same.length >= 2 && same.length <= 4 && q.counts.length >= 2 && q.counts.length <= 3);
      else assert.equal(same.length, 1);
      assert.equal(q.expected, q.many ? 'yes' : 'no');
    }
  }
  for (const n of manyAt) assert.ok(n > 60 && n < 140, `여러 가지 문항의 자리 ${manyAt}`);
});

test('blocks-build 채점: 세 그림이 같으면 맞음(통째로 옮겨도), 무작위 쌓기 30개씩 독립 계산과 같다. 예상·다른 개수로 한 번 더·힌트', () => {
  for (const seed of SEEDS.slice(0, 80)) {
    for (const q of questions('blocks-build', seed)) {
      const indep = (mine) => {
        const a = toCorner(mine);
        const b = toCorner(q.target);
        return count(mine) > 0 && ['top', 'front', 'side'].every((d) => indepCells(a, d).flat().join() === indepCells(b, d).flat().join());
      };
      for (const g of q.fills) assert.equal(judgeThree(q, g).correct, true);
      assert.equal(judgeThree(q, toCorner(q.target)).correct, true);
      const rng = createRng(`three:${seed}`);
      for (let n = 0; n < 30; n += 1) {
        const mine = ALL[rng.int(1, ALL.length - 1)];
        const r = judgeThree(q, mine);
        assert.equal(r.correct, indep(mine));
        if (!r.correct) {
          assert.ok(Object.values(BLOCK_TAGS).includes(r.tag));
          // 다른 칸 표시: 세 그림 가운데 다른 것에만 있다
          for (const d of ['top', 'front', 'side']) {
            const same = indepSameShape(indepCells(mine, d), indepCells(q.target, d), d);
            assert.equal(r.diff[d].length === 0, same, `${d}`);
          }
        }
      }
      assert.equal(judgeThree(q, mirrorMap(q.target)).correct || judgeThree(q, mirrorMap(q.target)).tag === BLOCK_TAGS.mirror || judgeThree(q, mirrorMap(q.target)).tag === BLOCK_TAGS.frontSide, true);
      assert.equal(judgeThree(q, [[0, 0, 0], [0, 0, 0], [0, 0, 0]]).empty, true);
      // 예상
      for (const answer of ['yes', 'no']) {
        const r = judgeThreeGuess(q, answer);
        assert.equal(r.correct, answer === q.expected);
        assert.equal(r.tag, r.correct ? null : BLOCK_TAGS.manyCounts);
      }
      // 힌트: 위에서 본 모양의 자리 하나와 높이 — 세 그림에 맞는 쌓기 모두에서 그 높이다
      const hint = threeHint(q, [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
      for (const g of q.fills) assert.equal(g[hint.y][hint.x], hint.value);
      assert.ok(hint.text.includes(spotName(hint.x, hint.y)));
      if (!q.many) continue;
      const [first] = q.fills;
      assert.equal(judgeThreeOther(q, first, first).status, 'same');
      assert.equal(judgeThreeOther(q, toCorner(first), first).status, 'same');
      for (const g of q.fills.slice(1)) {
        const r = judgeThreeOther(q, g, first);
        assert.equal(r.status, count(g) === count(first) ? 'sameCount' : 'ok');
      }
      assert.ok(q.fills.some((g) => judgeThreeOther(q, g, first).status === 'ok'));
      assert.equal(judgeThreeOther(q, [[3, 3, 3], [3, 3, 3], [3, 3, 3]], first).status, 'wrong');
    }
  }
});

// ── 자리마다 몇 개? · 수를 보고 쌓기 ───────────────
test('blocks-write · blocks-fromnum 문제 만들기와 채점 (시드 300개): 쓴 수가 자리마다 쌓인 개수와 같으면 맞음, 수만큼 쌓으면 맞음(통째로 옮겨도)', () => {
  for (const seed of SEEDS) {
    const write = questions('blocks-write', seed);
    assert.equal(write.length, 3);
    write.forEach((q, i) => {
      assert.ok(isConnectedTop(q.target) && q.total >= 6 && q.total <= 10);
      assert.deepEqual(q.top, indepCells(q.target, 'top'));
      // 1번은 처음 보기에서 모든 쌓기나무가 보이고, 2·3번은 숨겨진 쌓기나무가 있다(돌려 봐야 센다)
      assert.equal(indepHidden(q.target).length > 0, i > 0, `${seed} ${i}`);
      if (i === 0) assert.ok(Math.max(...q.target.flat()) >= 2);
      else assert.ok(Math.max(...q.target.flat()) === 3);
      const r = judgeNumbers(q, q.target);
      assert.equal(r.correct, true);
      assert.equal(r.message, `맞아요! ${sumSentence(q.target)}`);
      // 하나라도 다르면 틀림, 다른 자리 = ✗ 자리
      const rng = createRng(`write:${seed}:${i}`);
      for (let n = 0; n < 20; n += 1) {
        const numbers = q.target.map((row) => row.map((v) => (v ? rng.int(1, 3) : 0)));
        const rr = judgeNumbers(q, numbers);
        const wrong = [];
        R.forEach((y) => R.forEach((x) => {
          if (q.target[y][x] && numbers[y][x] !== q.target[y][x]) wrong.push([x, y]);
        }));
        assert.equal(rr.correct, wrong.length === 0);
        assert.deepEqual(rr.wrong, wrong);
        if (!rr.correct) assert.equal(rr.tag, BLOCK_TAGS.numberMeaning);
      }
      assert.equal(judgeNumbers(q, q.target.map((row) => row.map(() => 0))).empty, true);
    });
    const fromnum = questions('blocks-fromnum', seed);
    assert.equal(fromnum.length, 2);
    for (const q of fromnum) {
      assert.ok(isConnectedTop(q.target));
      assert.equal(judgeNumberBuild(q, q.target).correct, true);
      assert.equal(judgeNumberBuild(q, toCorner(q.target)).correct, true);
      const rng = createRng(`fromnum:${seed}`);
      for (let n = 0; n < 20; n += 1) {
        const mine = ALL[rng.int(1, ALL.length - 1)];
        assert.equal(judgeNumberBuild(q, mine).correct, indepSameMapShifted(mine, q.target));
      }
      // 좌우 뒤집기 · 앞과 옆 바꾸기 · 높이만 다름 · 자리가 다름
      assert.equal(judgeNumberBuild(q, mirrorMap(q.target)).tag, BLOCK_TAGS.mirror);
      assert.equal(judgeNumberBuild(q, swapMap(q.target)).tag, BLOCK_TAGS.frontSide);
      const flat = q.target.map((row) => row.map((v) => (v ? 1 : 0)));
      assert.equal(judgeNumberBuild(q, flat).tag, BLOCK_TAGS.numberMeaning);
      assert.ok(judgeNumberBuild(q, flat).wrong.length > 0);
      const hint = numberBuildHint(q, flat);
      assert.equal(q.target[hint.y][hint.x], hint.value);
      assert.ok(hint.value >= 2 && hint.text.startsWith(spotName(hint.x, hint.y)));
    }
  }
  assert.equal(sumSentence([[1, 2, 0], [0, 3, 0], [0, 0, 0]]), '1 + 2 + 3 = 6, 모두 6개예요.');
});

test('수 쓰기의 정답: 높이 지도 262,144개 전부에서 "자리마다 쌓인 개수"를 쓰면 맞고, 한 자리만 달라도 틀린다(칸의 집합으로 따로 센 값과 견줌)', () => {
  for (let i = 0; i < ALL.length; i += 1) {
    const h = ALL[i];
    if (count(h) === 0) continue;
    const v = voxels(h);
    // 독립 계산: 자리마다 쌓기나무의 수 = 그 자리의 칸 수
    const numbers = R.map((y) => R.map((x) => R.filter((z) => v[x][y][z]).length));
    const q = { top: indepCells(h, 'top'), target: h, expected: mapKey(h) };
    assert.equal(judgeNumbers(q, numbers).correct, true);
    if (i % 5 !== 0) continue;
    for (const [x, y] of R.flatMap((yy) => R.map((xx) => [xx, yy])).filter(([xx, yy]) => h[yy][xx] > 0)) {
      const other = numbers.map((row) => [...row]);
      other[y][x] = (other[y][x] % 3) + 1;
      const r = judgeNumbers(q, other);
      assert.equal(r.correct, false);
      assert.deepEqual(r.wrong, [[x, y]]);
    }
  }
});

// ── 수만 보고 알아내기 ────────────────────
test('blocks-numviews (시드 1,000개): 칠하기 둘(앞 · 옆)과 고르기 하나. 고르기의 보기 넷은 그림이 서로 다르고, 자리와 개수로는 정답을 가릴 수 없다', () => {
  const pos = [0, 0, 0, 0];
  const rules = { most: 0, fewest: 0, middle: 0 };
  for (let seed = 1; seed <= 1000; seed += 1) {
    const [front, side, pick] = questions('blocks-numviews', seed);
    assert.deepEqual([front.kind, front.kinds, side.kind, side.kinds, pick.kind], ['paint', ['front'], 'paint', ['side'], 'pick']);
    for (const q of [front, side]) {
      for (const k of ['top', 'front', 'side']) assert.deepEqual(q.views[k], indepCells(q.target, k));
      // 뒤집은 그림 ≠ 다른 쪽 그림 (review-blocks-s2 S2-4): 뒤집어 칠하면 늘 "좌우 뒤집힘"
      const [kind] = q.kinds;
      const cells = indepCells(q.target, kind);
      assert.ok(!indepSameShape(mirror(cells), indepCells(q.target, kind === 'front' ? 'side' : 'front'), kind), `${seed} ${kind}`);
      assert.equal(judgeView(q, kind, mirror(cells), { from: 'numbers' }).tag, BLOCK_TAGS.mirror);
    }
    assert.equal(pick.options.length, 4);
    assert.equal(new Set(pick.options.map((o) => lookKey(o.map))).size, 4);
    assert.equal(mapKey(pick.options[pick.expected - 1].map), mapKey(pick.target));
    // 그림에서 좌우를 뒤집은 쌓기(turnMap): 앞에서 본 모양 = 옆에서 본 모양을 좌우로 뒤집은 것, 옆 = 앞을 뒤집은 것 (독립 계산)
    for (const o of pick.options) {
      if (o.role === 'turn') {
        assert.deepEqual(indepHeights(o.map, 'front'), reverse(indepHeights(pick.target, 'side')));
        assert.deepEqual(indepHeights(o.map, 'side'), reverse(indepHeights(pick.target, 'front')));
      }
      if (o.role === 'other') {
        const [x, y] = o.spot;
        let diff = 0;
        R.forEach((yy) => R.forEach((xx) => {
          if (o.map[yy][xx] !== pick.target[yy][xx]) diff += 1;
        }));
        assert.equal(diff, 1);
        assert.equal(o.map[y][x] - pick.target[y][x], o.delta);
      }
    }
    const ans = pick.expected - 1;
    pos[ans] += 1;
    const counts = pick.options.map((o) => count(o.map));
    const share = (sel) => (sel.includes(ans) ? 1 / sel.length : 0);
    rules.most += share([0, 1, 2, 3].filter((i) => counts[i] === Math.max(...counts)));
    rules.fewest += share([0, 1, 2, 3].filter((i) => counts[i] === Math.min(...counts)));
    const sorted = [...counts].sort((a, b) => a - b);
    rules.middle += share([0, 1, 2, 3].filter((i) => counts[i] === sorted[1] || counts[i] === sorted[2]));
    for (let c = 1; c <= 4; c += 1) {
      const r = judgeNumPick(pick, c);
      assert.equal(r.correct, c === pick.expected);
      const o = pick.options[c - 1];
      assert.equal(r.tag, r.correct ? null : o.role === 'other' ? BLOCK_TAGS.numberMeaning : BLOCK_TAGS.frontSide);
      // 앞과 옆이 바뀌고 한 자리도 다른 보기: 그 자리를 말한다 (review-blocks-s2 S2-5 ②)
      if (o.role === 'turn') assert.equal(r.message, '고른 그림은 앞과 옆이 바뀐 모양이에요. 수를 쓴 그림의 아래쪽이 앞, 오른쪽이 옆이에요.');
      if (o.role === 'turn-other') assert.equal(r.message, `고른 그림은 앞과 옆이 바뀌었고, ${o.spot[1] + 1}줄 ${o.spot[0] + 1}칸 자리의 수도 달라요. 수를 쓴 그림의 아래쪽이 앞, 오른쪽이 옆이에요.`);
    }
  }
  for (const p of pos) assert.ok(p / 1000 > 0.15 && p / 1000 < 0.35, `정답 자리 ${pos}`);
  for (const [name, v] of Object.entries(rules)) assert.ok(v / 1000 > 0.15 && v / 1000 < 0.35, `${name} ${v}`);
  // turnMap은 두 번 하면 처음으로 돌아온다
  for (let i = 0; i < ALL.length; i += 97) assert.deepEqual(turnMap(turnMap(ALL[i])), ALL[i]);
});

test('화면 문장(S2): 비지 않고, 조사가 맞고, "만든 모양"을 쓴다', () => {
  const texts = BLOCK_STAGES.filter((s) => ['flip', 'draw', 'build', 'write', 'fromnum', 'numviews'].includes(s.kind)).flatMap((s) => [s.title, s.goal, s.order]);
  for (const seed of SEEDS.slice(0, 50)) {
    for (const q of questions('blocks-flip', seed)) for (const c of [1, 2, 3]) texts.push(judgeFlip(q, c).message);
    for (const q of questions('blocks-draw', seed)) {
      texts.push(judgeDrawing(q, Object.fromEntries(q.kinds.map((k) => [k, q.views[k]]))).message);
      texts.push(judgeDrawing(q, Object.fromEntries(q.kinds.map((k) => [k, mirrorCells(q.views[k])]))).message);
      texts.push(drawHint(q, Object.fromEntries(q.kinds.map((k) => [k, GRIDS[1]]))));
    }
    for (const q of questions('blocks-build', seed)) {
      texts.push(judgeThree(q, q.target).message, judgeThree(q, mirrorMap(q.target)).message, judgeThree(q, [[1, 0, 0], [0, 0, 0], [0, 0, 0]]).message);
      texts.push(judgeThreeGuess(q, 'yes').message, judgeThreeGuess(q, 'no').message, threeHint(q, q.target).text);
      if (q.many) for (const g of q.fills) texts.push(judgeThreeOther(q, g, q.fills[0]).message);
    }
    for (const q of questions('blocks-write', seed)) texts.push(judgeNumbers(q, q.target).message, judgeNumbers(q, q.top).message);
    for (const q of questions('blocks-fromnum', seed)) texts.push(judgeNumberBuild(q, q.target).message, judgeNumberBuild(q, mirrorMap(q.target)).message, numberBuildHint(q, q.target.map((row) => row.map((v) => (v ? 1 : 0)))).text);
    for (const q of questions('blocks-numviews', seed)) {
      if (q.kind === 'pick') for (const c of [1, 2, 3, 4]) texts.push(judgeNumPick(q, c).message);
      else texts.push(judgeDrawing(q, { [q.kinds[0]]: mirrorCells(q.views[q.kinds[0]]) }, { from: 'numbers' }).message);
    }
  }
  for (const t of texts) {
    assert.ok(typeof t === 'string' && t.trim().length > 0);
    assert.doesNotMatch(t, /쌓은 모양|undefined|null|NaN|\[object/, t);
    assert.doesNotMatch(t, /칸를|칸는 |층를|줄를|개를 쌓아요\.?$|1라고|2이라고|3라고|1예요|2이에요|3예요/, t);
  }
});

// ── 별과 점수 ──────────────────────────
/** 독립 계산(docs/engine.md 10절의 점수 표만 보고): 처음 시도에 맞힘 +2 · 틀린 뒤 다시 맞힘 +1 · 다시 일어서기 +1 · 연속 3의 배수마다 +1 */
function indepScore(steps) {
  const tried = new Map();
  let xp = 0;
  let streak = 0;
  let fell = false;
  for (const s of steps) {
    const isNew = !tried.has(s.itemId);
    if (!s.correct) {
      streak = 0;
      if (isNew) {
        fell = true;
        tried.set(s.itemId, false);
      }
      continue;
    }
    if (isNew) {
      xp += 2;
      streak += 1;
      if (streak % 3 === 0) xp += 1;
      if (fell) xp += 1;
      fell = false;
    } else if (tried.get(s.itemId) === false) xp += 1;
    tried.set(s.itemId, true);
  }
  return xp;
}
const enginePlay = (steps, startStars = 0) => {
  const play = createPlayReward({ startStars });
  for (const s of steps) play.answer({ itemId: s.itemId, correct: s.correct });
  return play;
};

/** S2 단계 한 판의 답 순서(무작위): p = 한 번의 시도가 맞을 확률 */
function randomPlay(id, rng, p) {
  const s = stage(id);
  const steps = [];
  const once = (itemId) => steps.push({ itemId, correct: rng.next() < p });
  const untilRight = (itemId) => {
    for (;;) {
      const correct = rng.next() < p;
      steps.push({ itemId, correct });
      if (correct) return;
    }
  };
  for (let i = 1; i <= s.count; i += 1) {
    const item = `${id}:${i}`;
    if (s.kind === 'flip') once(item);
    else if (s.kind === 'numviews') (i === 3 ? once : untilRight)(item);
    else if (s.kind === 'build') {
      untilRight(`${item}:build`);
      once(`${item}:guess`);
      if (i === 1) untilRight(`${item}:other`);
    } else untilRight(item);
  }
  return steps;
}
const S2_IDS = ['blocks-flip', 'blocks-draw', 'blocks-build', 'blocks-write', 'blocks-fromnum', 'blocks-numviews'];

test('점수(S2): 답 순서 6,000판에서 엔진의 점수 = 독립 계산, 모두 맞힌 판보다 많이 받는 길 0, 별 3개 단계를 다시 하면 0', () => {
  const rng = createRng('s2-score');
  for (let n = 0; n < 6000; n += 1) {
    const id = S2_IDS[n % S2_IDS.length];
    const steps = randomPlay(id, rng, [0.3, 0.6, 0.85, 1][n % 4]);
    const play = enginePlay(steps);
    assert.equal(play.xp(), indepScore(steps), `${id} ${JSON.stringify(steps)}`);
    assert.ok(play.xp() <= indepScore(randomPlay(id, createRng(`perfect:${n}`), 1)));
    assert.equal(enginePlay(steps, 3).xp(), 0);
  }
});

test('별(S2): 틀린 횟수로 정하는 단계는 flip·fromnum·numviews — 모든 답 순서를 나열하면 ★1·★2·★3이 모두 나오고, 틀려서 더 받는 길이 없다. 나머지는 정답률로도 ★2가 나온다', () => {
  assert.deepEqual(BLOCK_STAGES.filter((s) => S2_IDS.includes(s.id) && s.starsBy === 'wrong').map((s) => s.id), ['blocks-flip', 'blocks-fromnum', 'blocks-numviews']);
  /** 답 순서 나열: 문항마다 "한 번 답함"(맞음·틀림) 또는 "맞힐 때까지"(틀림 0~3번 뒤 맞음) */
  const enumerate = (plan) => {
    let out = [[]];
    plan.forEach(([itemId, kind]) => {
      const ways = kind === 'once'
        ? [[{ itemId, correct: true }], [{ itemId, correct: false }]]
        : [0, 1, 2, 3].map((w) => [...Array.from({ length: w }, () => ({ itemId, correct: false })), { itemId, correct: true }]);
      out = out.flatMap((prefix) => ways.map((w) => [...prefix, ...w]));
    });
    return out;
  };
  const plans = {
    'blocks-flip': [1, 2, 3].map((i) => [`blocks-flip:${i}`, 'once']),
    'blocks-fromnum': [1, 2].map((i) => [`blocks-fromnum:${i}`, 'retry']),
    'blocks-numviews': [['blocks-numviews:1', 'retry'], ['blocks-numviews:2', 'retry'], ['blocks-numviews:3', 'once']],
    'blocks-draw': [1, 2, 3].map((i) => [`blocks-draw:${i}`, 'retry']),
    'blocks-write': [1, 2, 3].map((i) => [`blocks-write:${i}`, 'retry']),
  };
  for (const [id, plan] of Object.entries(plans)) {
    const byWrong = stage(id).starsBy === 'wrong';
    const results = enumerate(plan).map((steps) => {
      const wrong = steps.filter((s) => !s.correct).length;
      const stars = byWrong ? starsByWrong(wrong) : starsFromAccuracy(steps.filter((s) => s.correct).length / steps.length);
      return { wrong, stars, total: indepScore(steps) + stageXp({ prevStars: 0, stars, cleared: true }).total, engine: enginePlay(steps).xp() + stageXp({ prevStars: 0, stars, cleared: true }).total };
    });
    assert.deepEqual([...new Set(results.map((r) => r.stars))].sort(), [1, 2, 3], id);
    for (const r of results) {
      assert.equal(r.engine, r.total, id);
      // 한 번 틀리면 ★2 (틀린 횟수 기준이든 정답률이든) — 정답률로 바로 ★1이 되는 단계는 틀린 횟수 기준을 쓴다
      if (r.wrong === 1) assert.equal(r.stars, 2, `${id} 한 번 틀림`);
      if (r.wrong === 0) assert.equal(r.stars, 3);
    }
    const best = Math.max(...results.filter((r) => r.wrong === 0).map((r) => r.total));
    for (const r of results) if (r.wrong > 0) assert.ok(r.total < best, `${id} ${JSON.stringify(r)}`);
  }
  // 정답률 기준이면 ★2가 나오지 않는 까닭: flip 3문항 중 하나 틀림 67%, fromnum 3번 중 2번 67%, numviews 고르기를 틀리면 67%
  assert.equal(starsFromAccuracy(2 / 3), 1);
  // build는 답이 7개 이상이라 한 번 틀려도 정답률 86% 이상(★2)
  assert.equal(starsFromAccuracy(6 / 7), 2);
});

test('차시 점수(S2): 모두 처음에 맞히는 학생이 받는 점수(칭호 기준 0·40·100·180·300과 견줄 값)', () => {
  const lessonXp = (lesson) => BLOCK_STAGES.filter((s) => s.lesson === lesson).reduce((sum, s) => {
    const steps = randomPlay(s.id, createRng('all-correct'), 1);
    return sum + indepScore(steps) + stageXp({ prevStars: 0, stars: 3, cleared: true }).total;
  }, 0);
  // 3차시: 반대쪽 3문항(6 + 연속 1 + 11) + 그리기 3문항(6 + 1 + 11) + 위·앞·옆을 보고 쌓기 답 7개(14 + 2 + 11) = 63
  // 4차시: 수 쓰기 3문항(6 + 1 + 11) + 수를 보고 쌓기 2문항(4 + 11) + 수만 보고 3문항(6 + 1 + 11) = 51
  assert.deepEqual([lessonXp('blocks-three'), lessonXp('blocks-number')], [63, 51]);
});
