import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  boundaryEdges,
  cellKey,
  checkNet,
  completionSlots,
  cubeSlots,
  emptyNeighbors,
  foldNet,
  fromCells,
  hasBlock2x2,
  matchingEdge,
  missingSlots,
  oppositeFace,
  polyominoes,
  shapeKey,
  solidStats,
  transformCells,
} from '../../src/games/net-workshop/fold.js';
import {
  applyPoint,
  convexIntersectionArea,
  cross,
  rotationAbout,
} from '../../src/games/net-workshop/geometry.js';
import { CUBE_NETS, FACE_COUNT_NETS, INVALID_HEXOMINOES } from '../../src/games/net-workshop/nets-data.js';
import { displayNet, stuckTOf, viewDirection } from '../../src/games/net-workshop/view3d.js';

const types = (net) => checkNet(net).problems.map((p) => p.type);
const close = (a, b, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) <= eps);

/**
 * 정육면체 감싸기 — fold.js(행렬·경첩)를 쓰지 않는 독립 계산.
 * 첫 칸을 한 면에 놓고, 이웃 칸으로 갈 때마다 모서리를 넘어 그쪽 면으로 간다.
 * 칸마다 놓인 면의 바깥 법선을 'x,y,z' 문자열로 돌려준다. 6칸이 서로 다른 6면을 덮으면 전개도다.
 */
function wrap(cells) {
  const key = ([x, y]) => `${x},${y}`;
  const index = new Map(cells.map((c, i) => [key(c), i]));
  const neg = (v) => v.map((a) => -a);
  const frames = new Array(cells.length);
  frames[0] = { n: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0] }; // n: 바깥 법선, x·y: 종이의 오른쪽·아래쪽
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.shift();
    const { n, x, y } = frames[i];
    const moves = [
      [[1, 0], { n: x, x: neg(n), y }],
      [[-1, 0], { n: neg(x), x: n, y }],
      [[0, 1], { n: y, x, y: neg(n) }],
      [[0, -1], { n: neg(y), x, y: n }],
    ];
    for (const [[dx, dy], frame] of moves) {
      const j = index.get(key([cells[i][0] + dx, cells[i][1] + dy]));
      if (j === undefined || frames[j]) continue;
      frames[j] = frame;
      queue.push(j);
    }
  }
  return frames.map((f) => f.n.map((v) => v + 0).join(','));
}
const wrapsCube = (cells) => cells.length === 6 && new Set(wrap(cells)).size === 6;
const negKey = (k) => k.split(',').map((v) => -Number(v) + 0).join(',');

test('기하: 축 회전과 볼록 다각형 겹친 넓이', () => {
  // x축 둘레로 90° 돌리면 (0, 1, 0) → (0, 0, 1)
  assert.ok(close(applyPoint(rotationAbout([0, 0, 0], [1, 0, 0], Math.PI / 2), [0, 1, 0]), [0, 0, 1]));
  // 축이 원점을 지나지 않아도 축 위의 점은 그대로
  assert.ok(close(applyPoint(rotationAbout([1, 0, 0], [0, 1, 0], 1.2), [1, 5, 0]), [1, 5, 0]));
  const square = (x, y) => [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
  assert.equal(convexIntersectionArea(square(0, 0), square(0, 0)), 1);
  assert.ok(Math.abs(convexIntersectionArea(square(0, 0), square(0.5, 0)) - 0.5) < 1e-9);
  assert.equal(convexIntersectionArea(square(0, 0), square(1, 0)), 0); // 변만 닿음
  assert.equal(convexIntersectionArea(square(0, 0), square(3, 3)), 0);
});

test('폴리오미노 나열: 1, 1, 2, 5, 12, 35, 108 (알려진 값)', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => polyominoes(n).length), [1, 1, 2, 5, 12, 35, 108]);
});

test('헥소미노 35개 중 정육면체로 접히는 것은 11개이고, CUBE_NETS와 같다', () => {
  const hexominoes = polyominoes(6);
  const foldable = hexominoes.filter((cells) => checkNet(fromCells(cells)).ok);
  assert.equal(foldable.length, 11);
  assert.deepEqual(new Set(foldable.map(shapeKey)), new Set(CUBE_NETS.map((n) => shapeKey(n.cells))));
});

test('감싸기(독립 계산)와 checkNet이 헥소미노 35개 모두에서 같은 판정', () => {
  for (const cells of polyominoes(6)) assert.equal(checkNet(fromCells(cells)).ok, wrapsCube(cells), JSON.stringify(cells));
});

test('oppositeFace = 감싸기에서 법선이 반대인 면 (11가지 × 8방향 × 모든 바닥 면 × 모든 면)', () => {
  let compared = 0;
  for (const n of CUBE_NETS) {
    for (let k = 0; k < 8; k += 1) {
      const cells = transformCells(n.cells, k);
      const normals = wrap(cells);
      const base = fromCells(cells);
      for (const root of base.faces) {
        const net = { ...base, root: root.id };
        normals.forEach((normal, i) => {
          const expected = `f${normals.indexOf(negKey(normal))}`;
          assert.equal(oppositeFace(net, `f${i}`), expected, `${n.name} k=${k} root=${root.id} f${i}`);
          compared += 1;
        });
      }
    }
  }
  assert.equal(compared, 11 * 8 * 6 * 6);
});

test('completionSlots = 감싸기 판정 (펜토미노 12개 × 8방향의 빈 이웃 자리 전부)', () => {
  const pentominoes = polyominoes(5);
  assert.equal(pentominoes.length, 12);
  let compared = 0;
  for (const shape of pentominoes) {
    for (let k = 0; k < 8; k += 1) {
      const cells = transformCells(shape, k);
      const slots = completionSlots(cells);
      assert.deepEqual(slots.map((s) => s.key).sort(), emptyNeighbors(cells).map(cellKey).sort());
      for (const s of slots) {
        assert.equal(s.ok, wrapsCube([...cells, s.cell]), `${JSON.stringify(cells)} + ${s.key}`);
        compared += 1;
      }
    }
  }
  assert.ok(compared > 900, `${compared}`);
});

test('화면 바닥 면 고르기(displayNet): 빈 자리("비어요")는 바닥에 두지 않는다', () => {
  const nets = [
    ...INVALID_HEXOMINOES.filter((n) => n.shape !== 'block'),
    ...FACE_COUNT_NETS.filter((n) => n.faces === 5),
  ];
  for (const n of nets) {
    for (let k = 0; k < 8; k += 1) {
      const base = fromCells(transformCells(n.cells, k));
      const { net, turn } = displayNet(base);
      assert.equal(checkNet(net).ok, false);
      const missing = missingSlots(net);
      assert.ok(missing.length > 0, `${n.name} k=${k}`);
      for (const s of missing) assert.ok(s.normal[2] > -0.99, `${n.name} k=${k}: 빈 자리가 바닥`);
      assert.ok([0, 90, 180, 270].includes(turn));
    }
  }
  // 유효 전개도는 그대로 (처음 고른 바닥 면, 더 돌리지 않음)
  const valid = fromCells(CUBE_NETS[3].cells);
  const shown = displayNet(valid);
  assert.equal(shown.net, valid);
  assert.equal(shown.turn, 0);
});

test('2×2 덩어리 장면: 모든 면이 보는 쪽을 향하고(법선), 가운데가 다른 면에 가려지지 않는다(위치)', () => {
  // 정사영으로 화면에 옮긴 볼록 다각형 안에 점이 있나 (변 위는 빼고)
  const inside = (p, poly) => {
    let sign = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (Math.abs(c) < 1e-9) return false;
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
    return true;
  };
  let scenes = 0;
  for (const n of INVALID_HEXOMINOES.filter((x) => x.shape === 'block')) {
    for (let k = 0; k < 8; k += 1) {
      const { net, turn, tilt } = displayNet(fromCells(transformCells(n.cells, k)));
      const folded = foldNet(net, 1, { tOf: stuckTOf(net) });
      const view = (v) => viewDirection(v, turn, tilt); // 화면 좌표: z가 클수록 보는 사람 쪽
      const faces = folded.faces.map((f) => ({ id: f.id, normal: view(f.normal), points: f.points.map(view), center: view(f.center) }));
      for (const f of faces) {
        assert.ok(f.normal[2] > 0.25, `${n.name} k=${k} ${f.id}: 법선 z=${f.normal[2].toFixed(2)}`);
        for (const g of faces) {
          if (g === f || Math.abs(g.normal[2]) < 1e-6 || !inside(f.center, g.points)) continue;
          const [px, py, pz] = g.points[0];
          const depth = pz - (g.normal[0] * (f.center[0] - px) + g.normal[1] * (f.center[1] - py)) / g.normal[2];
          assert.ok(depth <= f.center[2] + 1e-6, `${n.name} k=${k}: ${f.id}가 ${g.id} 뒤에 가려짐`);
        }
      }
      scenes += 1;
    }
  }
  assert.equal(scenes, 8 * 8);
});

test('2×2 덩어리 장면(재검토 2 R3): 덩어리 양쪽에 접힌 면도 넓게 보인다 — 가장 덜 보이는 면도 법선 z ≥ 0.5 (펼친 넓이의 절반쯤)', () => {
  let worstOfAll = 1;
  for (const n of INVALID_HEXOMINOES.filter((x) => x.shape === 'block')) {
    for (let k = 0; k < 8; k += 1) {
      const { net, turn, tilt } = displayNet(fromCells(transformCells(n.cells, k)));
      const folded = foldNet(net, 1, { tOf: stuckTOf(net) });
      const worst = Math.min(...folded.faces.map((f) => viewDirection(f.normal, turn, tilt)[2]));
      assert.ok(worst >= 0.5, `${n.name} k=${k}: ${worst.toFixed(3)}`);
      worstOfAll = Math.min(worstOfAll, worst);
      // 덩어리 밖의 면은 접히다 멈춘다(펼친 면과 같은 평면이 아님) — 멈추는 장면이 보인다. block-g(3×2)는 모두 덩어리
      if (n.name !== 'block-g') assert.ok(folded.faces.some((f) => Math.abs(f.normal[2] - 1) > 0.3), `${n.name} k=${k}`);
    }
  }
  assert.ok(worstOfAll < 0.6); // 기준을 너무 느슨하게 재지 않았는지
});

test('displayNet focus: 마주 보는 두 면(★·정답)은 위·바닥이 아닌 옆면에 둔다', () => {
  for (const n of CUBE_NETS) {
    for (let k = 0; k < 8; k += 1) {
      const base = fromCells(transformCells(n.cells, k));
      for (const star of base.faces) {
        const answer = oppositeFace(base, star.id);
        const { net } = displayNet(base, { focus: [star.id, answer] });
        const folded = foldNet(net, 1);
        for (const id of [star.id, answer]) {
          assert.ok(Math.abs(folded.faces.find((f) => f.id === id).normal[2]) < 0.01, `${n.name} k=${k} ${star.id}`);
        }
      }
    }
  }
});

test('CUBE_NETS 11개는 서로 다르고 모두 접히며, 줄 모양 분류가 맞다', () => {
  assert.equal(CUBE_NETS.length, 11);
  assert.equal(new Set(CUBE_NETS.map((n) => shapeKey(n.cells))).size, 11);
  assert.equal(new Set(CUBE_NETS.map((n) => n.name)).size, 11);
  for (const n of CUBE_NETS) assert.deepEqual(checkNet(fromCells(n.cells)), { ok: true, problems: [] }, n.name);
  const count = (family) => CUBE_NETS.filter((n) => n.family === family).length;
  assert.deepEqual([count('1-4-1'), count('2-3-1'), count('2-2-2'), count('3-3')], [6, 3, 1, 1]);
});

test('접히지 않는 헥소미노 24개: 빠짐없고, 까닭(겹침 · 2×2 덩어리)이 맞다', () => {
  assert.equal(INVALID_HEXOMINOES.length, 24);
  const keys = new Set(INVALID_HEXOMINOES.map((n) => shapeKey(n.cells)));
  assert.equal(keys.size, 24);
  const all = new Set(polyominoes(6).map(shapeKey));
  for (const key of keys) assert.ok(all.has(key));
  for (const key of CUBE_NETS.map((n) => shapeKey(n.cells))) assert.ok(!keys.has(key));

  for (const n of INVALID_HEXOMINOES) {
    const found = types(fromCells(n.cells));
    assert.ok(found.includes('overlap'), `${n.name}: ${found}`);
    assert.equal(found.includes('vertex-full'), hasBlock2x2(n.cells), n.name);
    assert.equal(n.reason, hasBlock2x2(n.cells) ? 'vertex-full' : 'overlap', n.name);
    assert.equal(n.shape === 'block', hasBlock2x2(n.cells), n.name);
  }
  // 2×2 덩어리가 있는 것은 8개 (계획서 11-3)
  assert.equal(INVALID_HEXOMINOES.filter((n) => n.shape === 'block').length, 8);
});

test('2×2 덩어리 → vertex-full, 5면 → face-count·gap, 7면 → face-count·overlap', () => {
  assert.ok(types(fromCells([[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [3, 1]])).includes('vertex-full'));
  for (const n of FACE_COUNT_NETS) {
    assert.equal(hasBlock2x2(n.cells), false, n.name);
    const found = types(fromCells(n.cells));
    assert.equal(found[0], 'face-count', n.name);
    assert.ok(found.includes(n.faces === 5 ? 'gap' : 'overlap'), `${n.name}: ${found}`);
    assert.ok(!found.includes('vertex-full'), n.name);
    const count = checkNet(fromCells(n.cells)).problems[0];
    assert.deepEqual([count.count, count.expected], [n.faces, 6]);
  }
});

test('돌리거나 뒤집어도 판정이 같다', () => {
  for (const n of [...CUBE_NETS, ...INVALID_HEXOMINOES.slice(0, 6)]) {
    const ok = checkNet(fromCells(n.cells)).ok;
    for (let k = 0; k < 8; k += 1) {
      const moved = transformCells(n.cells, k);
      assert.equal(shapeKey(moved), shapeKey(n.cells));
      assert.equal(checkNet(fromCells(moved)).ok, ok, `${n.name} k=${k}`);
    }
  }
});

test('1-4-1 전개도의 마주 보는 면 3쌍', () => {
  // .나../가다라마/.바.. : 한 줄 4칸에서 가-라, 다-마, 위아래 나-바
  const net = fromCells([[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]], { labels: ['나', '가', '다', '라', '마', '바'] });
  const opposite = (label) => {
    const face = net.faces.find((f) => f.label === label);
    return net.faces.find((f) => f.id === oppositeFace(net, face.id)).label;
  };
  assert.deepEqual(['가', '다', '나', '라', '마', '바'].map(opposite), ['라', '마', '바', '가', '다', '나']);
});

test('주사위 전개도: 마주 보는 눈의 합은 7', () => {
  // 십자 전개도: 가운데 1, 한 줄로 1-4-6, 3-1-4 … 위아래 2·5
  const cells = [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]];
  const net = fromCells(cells, { labels: ['2', '3', '1', '4', '6', '5'] });
  for (const f of net.faces) {
    const other = net.faces.find((g) => g.id === oppositeFace(net, f.id));
    assert.equal(Number(f.label) + Number(other.label), 7, `${f.label}과 ${other.label}`);
  }
});

test('접으면 맞닿는 변은 짝이 하나이고 서로 짝이다. 경계 변 14개 = 7쌍', () => {
  for (const n of CUBE_NETS) {
    const net = fromCells(n.cells);
    const boundary = boundaryEdges(net);
    assert.equal(boundary.length, 14, n.name);
    const pairs = new Set();
    for (const f of net.faces) {
      for (let e = 0; e < 4; e += 1) {
        const m = matchingEdge(net, f.id, e);
        assert.ok(m, `${n.name} ${f.id}:${e} 짝 없음`);
        assert.notEqual(m.face, f.id);
        assert.deepEqual(matchingEdge(net, m.face, m.edge), { face: f.id, edge: e }, `${n.name} 대칭`);
        if (boundary.some((b) => b.face === f.id && b.edge === e)) pairs.add([`${f.id}:${e}`, `${m.face}:${m.edge}`].sort().join('|'));
      }
    }
    assert.equal(pairs.size, 7, n.name);
  }
});

test('foldNet(t=0)은 펼친 좌표 그대로, 접은 입체는 V − E + F = 2', () => {
  for (const n of CUBE_NETS) {
    const net = fromCells(n.cells);
    const flat = foldNet(net, 0);
    for (const f of flat.faces) {
      const src = net.faces.find((x) => x.id === f.id);
      f.points.forEach((p, i) => assert.ok(close(p, [...src.poly[i], 0]), `${n.name} ${f.id}`));
      assert.ok(close(f.normal, [0, 0, 1]));
    }
    const { V, E, F } = solidStats(foldNet(net, 1));
    assert.deepEqual([V, E, F], [8, 12, 6], n.name);
    assert.equal(V - E + F, 2);
  }
});

test('모든 면이 종이 뒤(-z)로 접혀 글자 쪽이 바깥을 본다', () => {
  for (const n of CUBE_NETS) {
    const net = fromCells(n.cells);
    const folded = foldNet(net, 1);
    const center = folded.faces.reduce((acc, f) => acc.map((v, i) => v + f.center[i] / 6), [0, 0, 0]);
    assert.ok(center[2] < 0, `${n.name}: 입체가 종이 아래에 있어야 함`);
    for (const f of folded.faces) {
      const out = f.center.map((v, i) => v - center[i]);
      assert.ok(out.reduce((s, v, i) => s + v * f.normal[i], 0) > 0.49, `${n.name} ${f.id}: 앞면이 바깥`);
    }
  }
});

test('정육면체 6자리: 빈 자리 없음 / 5면이면 1곳 비어 있음, 자리의 글자 방향이 뒤집히지 않음', () => {
  const valid = fromCells(CUBE_NETS[0].cells);
  assert.equal(missingSlots(valid).length, 0);
  for (const s of cubeSlots(valid)) assert.ok(close(cross(s.u, s.v), s.normal), s.name);
  for (const n of FACE_COUNT_NETS.filter((x) => x.faces === 5)) {
    assert.equal(missingSlots(fromCells(n.cells)).length, 1, n.name);
  }
  // 6면인데 겹치면 한 곳이 빈다
  assert.equal(missingSlots(fromCells(INVALID_HEXOMINOES[1].cells)).length, 1);
});

test('completionSlots: 끝 면 하나를 뺀 자리는 늘 정답이고, 빈 자리를 모두 판정한다', () => {
  for (const n of CUBE_NETS) {
    n.cells.forEach((cell, i) => {
      const rest = n.cells.filter((_, j) => j !== i);
      const neighbors = rest.filter((c) => Math.abs(c[0] - cell[0]) + Math.abs(c[1] - cell[1]) === 1);
      if (neighbors.length !== 1) return; // 끝(잎) 면만
      const slots = completionSlots(rest);
      assert.equal(slots.length, emptyNeighbors(rest).length);
      const removed = slots.find((s) => s.key === cellKey(cell));
      assert.ok(removed?.ok, `${n.name}: 뺀 자리 ${cellKey(cell)}`);
      for (const s of slots) assert.equal(s.ok, checkNet(fromCells([...rest, s.cell])).ok);
    });
  }
});
