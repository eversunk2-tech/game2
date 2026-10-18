/**
 * 각기둥의 입체·전개도·접기 판정 (solids.js · fold.js의 각기둥 부분). 기획서: spec-grade6.md 6-2·6-3·11절.
 * 판정은 저장소의 fold.js를 쓰지 않는 독립 계산(net-workshop-prism-indep.js의 fold3d·verdict — 기획서 문장만 보고 짰다)과 견준다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkNet, congruentPolygons, findHinges, foldNet, fromCells, hingeAngle, isRectangle, matchingEdge, missingSlots, pickFace, solidStats, spanningTrees } from '../../src/games/net-workshop/fold.js';
import { cuboidNets } from '../../src/games/net-workshop/cuboid-logic.js';
import { CUBE_NETS } from '../../src/games/net-workshop/nets-data.js';
import {
  BASES,
  REGULAR_KINDS,
  flatOk,
  isoTrapezoid,
  loneTree,
  polyNetKey,
  prismNet,
  prismNetCatalog,
  prismSolid,
  regularPolygon,
  stripTree,
  treeForm,
  triangleBySides,
} from '../../src/games/net-workshop/solids.js';
import { createRng } from '../../src/shared/core/random.js';
import { E, edgesOfPoly, fold3d, foldAngle, rotate, v, verdict } from './net-workshop-prism-indep.js';

// ── 입체 ─────────────────────────────────
test('밑면: 정다각형 · 세 변으로 만든 삼각형 · 등변사다리꼴이 반시계 방향이고 변의 길이가 맞다', () => {
  for (const [poly, lengths] of [
    [regularPolygon(5, 2), [2, 2, 2, 2, 2]],
    [triangleBySides([4, 2, 3]), [4, 2, 3]],
    [isoTrapezoid(5, 3, 2), [5, 2, 3, 2]],
  ]) {
    const area = poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0) / 2;
    assert.ok(area > 0);
    poly.forEach((p, i) => assert.ok(Math.abs(Math.hypot(poly[(i + 1) % poly.length][0] - p[0], poly[(i + 1) % poly.length][1] - p[1]) - lengths[i]) < 1e-6));
  }
  // 나오는 밑면(spec-grade6 2-2절): 삼각형 둘 · 사다리꼴 · 직사각형 · 정오각형 · 정육각형
  assert.deepEqual([...new Set(BASES.map((b) => b.kind))], ['tri-eq', 'tri-sc', 'trap', 'rect', 'pent', 'hex']);
  for (const b of BASES.filter((x) => x.kind === 'tri-sc')) assert.equal(new Set(b.lengths).size, 3, b.id); // 세 변의 길이가 모두 다르다
  for (const b of BASES.filter((x) => REGULAR_KINDS.includes(x.kind))) assert.equal(new Set(b.lengths).size, 1, b.id);
});

test('입체의 접는 각도: 밑면-옆면 90°, 옆면-옆면은 밑면의 그 꼭짓점의 바깥각(정n각형이면 360° ÷ n) — 독립 계산과 같다', () => {
  for (const b of BASES) {
    const solid = prismSolid({ base: b.poly, height: 3 });
    for (const [key, angle] of Object.entries(solid.folds)) {
      const [a, c] = key.split('|');
      assert.ok(Math.abs(angle - foldAngle(b.poly, a, c)) < 1e-9, `${b.id} ${key}`);
    }
    if (REGULAR_KINDS.includes(b.kind)) {
      for (let i = 0; i < b.n; i += 1) assert.ok(Math.abs(solid.folds[[`s${i}`, `s${(i + 1) % b.n}`].sort().join('|')] - (2 * Math.PI) / b.n) < 1e-9);
    }
    assert.equal(Object.keys(solid.folds).length, 3 * b.n); // 모서리 수 3n
  }
});

test('띠 꼴 전개도는 밑면 종류마다 각기둥이 되고(checkNet ok · 독립 판정 ok), 접은 입체는 면 n + 2 · 모서리 3n · 꼭짓점 2n (V − E + F = 2)', () => {
  for (const b of BASES) {
    for (const height of [3, 4]) {
      const solid = prismSolid({ base: b.poly, height });
      for (let cut = 0; cut < b.n; cut += 1) {
        for (const top of [0, b.n - 1]) {
          const net = prismNet(solid, stripTree(solid, { cut, top, bottom: (top + 1) % b.n }));
          assert.equal(treeForm(solid, stripTree(solid, { cut, top, bottom: 0 })), 'strip');
          assert.ok(checkNet(net).ok, `${b.id} ${height} ${cut} ${top}`);
          assert.ok(verdict(net, b.poly).ok, `독립 ${b.id} ${height} ${cut} ${top}`);
          const { V, E: edges, F } = solidStats(foldNet(net, 1));
          assert.deepEqual([F, edges, V], [b.n + 2, 3 * b.n, 2 * b.n], b.id);
          assert.equal(V - edges + F, 2);
          assert.deepEqual(missingSlots(net), []);
        }
      }
    }
  }
});

test('신장 트리를 모두 펼쳐(펼친 그림에서 면이 겹치지 않는 것) 다시 접으면 모두 각기둥이 된다 — checkNet과 독립 판정이 같다 (삼각기둥 · 사각기둥 · 오각기둥)', () => {
  let checked = 0;
  for (const id of ['tri-eq-2', 'tri-sc-234', 'trap-4222', 'rect-23', 'pent-2']) {
    const b = BASES.find((x) => x.id === id);
    const solid = prismSolid({ base: b.poly, height: 3 });
    for (const tree of spanningTrees(solid)) {
      const net = prismNet(solid, tree);
      if (!flatOk(net)) continue;
      assert.ok(checkNet(net).ok, `${id} ${JSON.stringify(tree.map((e) => [e.a, e.b]))}`);
      assert.ok(verdict(net, b.poly).ok, id);
      checked += 1;
    }
  }
  assert.ok(checked > 1000, `${checked}`);
});

test('서로 다른 전개도의 수(돌리기·뒤집기로 같은 것은 하나): 정삼각기둥 9가지(알려진 값) · 직육면체로 견주면 54 · 29 · 정육면체 11 — 나열해 고정', () => {
  const count = (base, height) => prismNetCatalog(prismSolid({ base, height })).length;
  assert.equal(count(regularPolygon(3, 2), 3), 9);
  assert.equal(count(regularPolygon(3, 3), 4), 9);
  // 면의 종류를 넣지 않은 열쇠는 직육면체 차시의 54가지 · 29가지 · 정육면체 11가지와 같다(다른 계산 — cuboidNets · nets-data)
  const keysOf = (base, height) => {
    const solid = prismSolid({ base, height });
    const keys = new Set();
    for (const tree of spanningTrees(solid)) {
      const net = prismNet(solid, tree);
      if (flatOk(net)) keys.add(polyNetKey(net, { roles: false }));
    }
    return keys.size;
  };
  const rect = (a, b) => [[0, 0], [a, 0], [a, b], [0, b]];
  assert.equal(keysOf(rect(3, 2), 4), cuboidNets([2, 3, 4]).length);
  assert.equal(keysOf(rect(3, 2), 4), 54);
  assert.equal(keysOf(rect(3, 2), 3), 29);
  assert.equal(keysOf(rect(2, 2), 2), CUBE_NETS.length);
  // 그 밖의 밑면(회귀 기준): 각기둥의 전개도는 밑면과 옆면을 구별해 센다
  const fixed = Object.fromEntries(['tri-sc-234', 'trap-4222', 'rect-23', 'pent-2'].map((id) => [id, count(BASES.find((x) => x.id === id).poly, 3)]));
  assert.deepEqual(fixed, { 'tri-sc-234': 43, 'trap-4222': 104, 'rect-23': 54, 'pent-2': 99 });
});

test('낯선 꼴(옆면 하나가 밑면에만 붙은 꼴) 트리도 접으면 각기둥이 된다', () => {
  let made = 0;
  for (const b of BASES) {
    const solid = prismSolid({ base: b.poly, height: 3 });
    for (let lone = 0; lone < b.n; lone += 1) {
      for (const via of ['b0', 'b1']) {
        for (let link = 0; link < b.n; link += 1) {
          const tree = loneTree(solid, { lone, via, link, other: (lone + 1) % b.n });
          if (!tree) continue;
          assert.equal(treeForm(solid, tree), 'lone');
          const net = prismNet(solid, tree);
          if (!flatOk(net)) continue;
          assert.ok(checkNet(net).ok, b.id);
          assert.ok(verdict(net, b.poly).ok, b.id);
          made += 1;
        }
      }
    }
  }
  assert.ok(made > 50, `${made}`);
});

test('경첩 각도: 정육면체·직육면체 전개도는 지금처럼 늘 90°, 각기둥은 입체에서 이웃이 아닌 두 면을 이으면 접을 수 없는 경첩(wrong-hinge)', () => {
  const cube = fromCells(CUBE_NETS[0].cells);
  for (const hg of findHinges(cube)) assert.equal(hingeAngle(cube, hg), Math.PI / 2);
  const cuboid = cuboidNets([2, 3, 4])[0].net;
  for (const hg of findHinges(cuboid)) assert.equal(hingeAngle(cuboid, hg), Math.PI / 2);
  const solid = prismSolid({ base: regularPolygon(5, 2), height: 3 });
  const net = prismNet(solid, stripTree(solid, { cut: 0, top: 2, bottom: 2 }));
  // 위 밑면을 아래 밑면이라 부르면(b1 → b0) 경첩은 그대로 맞지만, 옆면 둘을 서로 이웃이 아닌 면이라 하면 접을 수 없다
  const odd = { ...net, faces: net.faces.map((f) => (f.solid === 's1' ? { ...f, solid: 's3' } : f)) };
  assert.ok(checkNet(odd).problems.some((p) => p.type === 'wrong-hinge'));
});

test('면 검사: 직사각형 · 합동(돌리기·뒤집기) — 각기둥의 두 밑면은 서로 뒤집힌 모습으로 펼쳐진다', () => {
  assert.equal(isRectangle([[0, 0], [3, 0], [3, 2], [0, 2]]), true);
  assert.equal(isRectangle([[0, 0], [3, 0], [3.5, 2], [0.5, 2]]), false);
  assert.equal(isRectangle([[0, 0], [3, 0], [0, 2]]), false);
  const tri = triangleBySides([4, 2, 3]);
  const mirrored = tri.map(([x, y]) => [x, -y]);
  assert.equal(congruentPolygons(tri, mirrored), true);
  assert.equal(congruentPolygons(tri, triangleBySides([4, 3, 2])), true); // 같은 세 변 → 합동(뒤집힌 모양)
  assert.equal(congruentPolygons(tri, triangleBySides([4, 2, 3.5])), false);
  const solid = prismSolid({ base: tri, height: 3 });
  const net = prismNet(solid, stripTree(solid, { cut: 1, top: 0, bottom: 2 }));
  const [b0, b1] = net.faces.filter((f) => f.role === 'base');
  assert.equal(congruentPolygons(b0.poly, b1.poly), true);
});

test('맞닿는 선분(matchingEdge): 되는 전개도의 테두리 선분은 모두 짝이 하나뿐이고 서로를 가리키며, 독립으로 접은 입체에서도 같은 자리에서 만난다', () => {
  for (const b of BASES) {
    const solid = prismSolid({ base: b.poly, height: 3 });
    const nets = [prismNet(solid, stripTree(solid, { cut: 1 % b.n, top: 0, bottom: 2 % b.n }))];
    const lone = loneTree(solid, { lone: 0, via: 'b0', link: 1, other: 2 % b.n });
    if (lone && flatOk(prismNet(solid, lone))) nets.push(prismNet(solid, lone));
    for (const net of nets) {
      const folded = fold3d(net, b.poly);
      const hinges = findHinges(net);
      for (const [fi, f] of net.faces.entries()) {
        f.poly.forEach((_, e) => {
          if (hinges.some((hg) => (hg.a === f.id && hg.ea === e) || (hg.b === f.id && hg.eb === e))) return;
          const m = matchingEdge(net, f.id, e);
          assert.ok(m, `${b.id} ${f.id}:${e}`);
          assert.deepEqual(matchingEdge(net, m.face, m.edge), { face: f.id, edge: e });
          // 독립으로 접은 입체에서 두 변이 끝과 끝이 같다
          const mi = net.faces.findIndex((x) => x.id === m.face);
          const [p, q] = edgesOfPoly(folded[fi])[e];
          const [r, s] = edgesOfPoly(folded[mi])[m.edge];
          assert.ok((v.len(v.sub(p, s)) < E && v.len(v.sub(q, r)) < E) || (v.len(v.sub(p, r)) < E && v.len(v.sub(q, s)) < E), `${b.id} ${f.id}:${e}`);
        });
      }
    }
  }
});

test('pickFace(입체 상태의 면 누르기): 무작위 보기 2,000개에서 광선-삼각형 계산(독립)과 같은 면을 고른다 — 거의 옆으로 선 면은 누를 수 없다', () => {
  const rng = createRng('pick');
  const MIN = 0.12;
  let same = 0;
  let hits = 0;
  for (let k = 0; k < 2000; k += 1) {
    const b = BASES[k % BASES.length];
    const solid = prismSolid({ base: b.poly, height: 2 + rng.int(1, 4) });
    // 무작위 자세: 세 축 둘레로 돌리고 무대 크기만큼 키워 화면 가운데에 둔다
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const turns = axes.map((ax) => [ax, rng.next() * 2 * Math.PI]);
    const mid = solid.faces.flatMap((f) => f.points).reduce((s, p) => v.add(s, p), [0, 0, 0]).map((x) => x / solid.faces.flatMap((f) => f.points).length);
    const px = 30 + rng.next() * 30;
    const place = (p) => turns.reduce((q, [ax, t]) => rotate(q, [0, 0, 0], ax, t), v.mul(v.sub(p, mid), px));
    const faces = solid.faces.map((f) => ({ id: f.id, points: f.points.map(place) }));
    const eye = [0, -40, 1100];
    const point = [(rng.next() - 0.5) * 300, (rng.next() - 0.5) * 300];
    // 독립: 면을 부채꼴 삼각형으로 나눠 묄러-트럼보어 광선-삼각형 교차 → 가장 가까운 면(면이 눈 쪽 빛살과 이루는 각이 너무 비스듬하면 건너뜀)
    const dir = v.unit(v.sub([point[0], point[1], 0], eye));
    let best = null;
    for (const f of faces) {
      const n = v.unit(v.cross(v.sub(f.points[1], f.points[0]), v.sub(f.points[2], f.points[0])));
      if (Math.abs(v.dot(n, dir)) < MIN) continue;
      for (let t = 1; t + 1 < f.points.length; t += 1) {
        const [a, bb, c] = [f.points[0], f.points[t], f.points[t + 1]];
        const e1 = v.sub(bb, a);
        const e2 = v.sub(c, a);
        const pv = v.cross(dir, e2);
        const det = v.dot(e1, pv);
        if (Math.abs(det) < 1e-12) continue;
        const tv = v.sub(eye, a);
        const u = v.dot(tv, pv) / det;
        const qv = v.cross(tv, e1);
        const w = v.dot(dir, qv) / det;
        const dist = v.dot(e2, qv) / det;
        if (u < -1e-9 || w < -1e-9 || u + w > 1 + 1e-9 || dist <= 0) continue;
        if (!best || dist < best.dist - 1e-9) best = { id: f.id, dist };
      }
    }
    const got = pickFace(faces, point, { eye, minFacing: MIN });
    if (got === (best?.id ?? null)) same += 1;
    if (got) hits += 1;
  }
  assert.equal(same, 2000);
  assert.ok(hits > 500, `${hits}`); // 빈 곳을 누른 경우만 있는 검사가 아니다
});

