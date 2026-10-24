/**
 * 전개도 완성하기(자석 판 — spec-grade6 15-30 · 15-31) 검사 도우미: 목표 모양(목록의 전개도 · 길이가 다르게 붙인 판 …)을 판에 놓는 차례를
 * 화면과 같은 규칙(prism-free-logic.js의 posePoly · settlePoly · magnetSpots — 화면이 쓰는 그 함수)으로 미리 계산한다:
 * 카드를 돌릴 횟수(30°씩), 마우스 · 손가락으로 끌어 놓을 자리(cm), 키보드로 고를 자석 자리 번호. 판정은 하지 않는다
 * (판정의 독립 계산은 net-workshop-prism-free-indep.js — 저장소 코드를 쓰지 않는다).
 */
import * as L from '../../src/games/net-workshop/grade6/prism-free-logic.js';
import { centroid } from '../../src/games/net-workshop/geometry.js';
import { prismNetCatalog } from '../../src/games/net-workshop/solids.js';

const EPS = 1e-4;
const near = (a, b, eps = EPS) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;
/** 꼭짓점 모음이 같은 자리인가(차례와 상관없이) */
export const samePlace = (p, q, eps = EPS) => p.length === q.length && p.every((a) => q.some((b) => near(a, b, eps)));
const turnPt = ([x, y], deg) => {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};
const norm360 = (d) => ((d % 360) + 360) % 360;
const edgeDeg = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** 카드를 몇 도 돌려(뒤집지 않고) 옮기면 poly가 되나 → 0 ≤ deg < 360 | null */
export function faceAngle(card, poly) {
  const n = card.poly.length;
  if (poly.length !== n) return null;
  const c = centroid(poly);
  for (let s = 0; s < n; s += 1) {
    const deg = edgeDeg(poly[s], poly[(s + 1) % n]) - edgeDeg(card.poly[0], card.poly[1]);
    const posed = card.poly.map((p) => {
      const [x, y] = turnPt(p, deg);
      return [x + c[0], y + c[1]];
    });
    if (samePlace(posed, poly)) return norm360(deg);
  }
  return null;
}

/** 두 선분이 한 직선 위에서 길이 > 0만큼 겹치나 */
function touching(p1, p2, q1, q2) {
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const u = [(p2[0] - p1[0]) / len, (p2[1] - p1[1]) / len];
  const off = (q) => Math.abs((q[0] - p1[0]) * u[1] - (q[1] - p1[1]) * u[0]);
  if (off(q1) > EPS || off(q2) > EPS) return false;
  const t = (q) => (q[0] - p1[0]) * u[0] + (q[1] - p1[1]) * u[1];
  return Math.min(len, Math.max(t(q1), t(q2))) - Math.max(0, Math.min(t(q1), t(q2))) > EPS;
}
/** 면 f의 변 가운데 놓인 면(placed)의 변과 맞닿은 첫 변 → { j(f의 변), face(놓인 면 id) } | null */
function touchEdge(f, placed) {
  const n = f.length;
  for (const q of placed) {
    for (let j = 0; j < n; j += 1) {
      for (let e = 0; e < q.poly.length; e += 1) {
        if (touching(f[j], f[(j + 1) % n], q.poly[e], q.poly[(e + 1) % q.poly.length])) return { j, face: q.id };
      }
    }
  }
  return null;
}

const catalogCache = new Map();
/** 그 각기둥의 서로 다른 전개도 목록 → [{ key, faces: [{ solid, poly }] }] (prismNetCatalog — 가짓수 검사는 따로 한다) */
export function catalogNets(solidId) {
  if (!catalogCache.has(solidId)) {
    catalogCache.set(solidId, prismNetCatalog(L.freeSolid(solidId).solid).map((e) => ({ key: e.key, faces: e.net.faces.map((f) => ({ solid: f.solid, poly: f.poly.map((p) => [...p]) })) })));
  }
  return catalogCache.get(solidId);
}

/**
 * 목표 모양(faces: [{ solid, poly }])을 판(play.board)에 들게 돌리고 옮긴다: 첫 면(rootSolid)이 카드를 30°의 배수만큼 돌린 모습이 되게(첫 면은 붙을 곳이
 * 없어 돌린 그대로 놓인다), 첫 면의 가운데가 판 가운데에서 0.5 cm 칸 위(키보드로 옮기는 걸음)에 오게, 모든 면이 판 안에. 들어가는 방향 가운데
 * pick번째(없으면 여유가 가장 큰 것) → { faces, rootSolid, turn(첫 면의 30° 횟수), margin } | null
 */
export function fitOnBoard(play, faces, { rootSolid = 'b0', pick = null } = {}) {
  const cards = L.freeCards(L.freeSolid(play.solidId));
  const root = faces.find((f) => f.solid === rootSolid);
  const card = cards.find((c) => c.solid === rootSolid);
  const deg0 = faceAngle(card, root.poly);
  const size = play.board;
  const fits = [];
  for (let m = 0; m < 12; m += 1) {
    const phi = m * 30 - deg0;
    let moved = faces.map((f) => ({ solid: f.solid, poly: f.poly.map((p) => turnPt(p, phi)) }));
    const pts = moved.flatMap((f) => f.poly);
    const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
    const [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
    if (x1 - x0 > size.w || y1 - y0 > size.h) continue;
    let [dx, dy] = [(size.w - (x1 - x0)) / 2 - x0, (size.h - (y1 - y0)) / 2 - y0];
    const rc = centroid(moved.find((f) => f.solid === rootSolid).poly);
    const snap = (v, c) => c + Math.round((v - c) / 0.5) * 0.5;
    dx += snap(rc[0] + dx, size.w / 2) - (rc[0] + dx);
    dy += snap(rc[1] + dy, size.h / 2) - (rc[1] + dy);
    moved = moved.map((f) => ({ solid: f.solid, poly: f.poly.map(([x, y]) => [x + dx, y + dy]) }));
    const all = moved.flatMap((f) => f.poly);
    const margin = Math.min(...all.map(([x, y]) => Math.min(x, y, size.w - x, size.h - y)));
    if (margin < 1e-6) continue;
    fits.push({ faces: moved, rootSolid, turn: m, margin });
  }
  if (fits.length === 0) return null;
  if (pick != null) return fits[pick % fits.length];
  return fits.reduce((a, b) => (b.margin > a.margin + 1e-9 ? b : a));
}

/**
 * 카드를 목표 자리(poly — 놓인 면 placed의 모서리에 맞닿은 자리)에 붙이려면: 카드를 몇 번(30°) 돌려 어디(카드 가운데, cm)에 끌어 놓나.
 * 목표의 가운데(자석이 그 모서리 방향으로 돌리면 목표와 꼭 같다) — 안 되면 카드의 맞닿을 변의 가운데가 목표의 그 변의 가운데에 오는 곳. 화면과 같은 settlePoly로 놓아 보아
 * 목표 자리에 붙는 것만 → { turn, at, poly } | null
 */
export function dropFor(play, card, poly, placed) {
  const size = play.board;
  const deg = faceAngle(card, poly);
  if (deg == null) return null;
  const turn = Math.round(deg / 30) % 12;
  const others = placed.map((p) => ({ id: p.id, poly: p.poly }));
  const c = centroid(poly);
  const exact = card.poly.map((p) => {
    const [x, y] = turnPt(p, deg);
    return [x + c[0], y + c[1]];
  });
  const touch = touchEdge(exact, placed);
  // 목표의 가운데에 놓으면 자석이 면을 그 모서리 방향으로 돌린 모습이 목표와 꼭 같다(움직임 0 — G2r-5의 재는 법). 안 되면 맞닿을 변의 가운데를 맞춘 자리
  const tries = [c];
  if (touch) {
    const n = card.poly.length;
    const [mx, my] = turnPt(mid(card.poly[touch.j], card.poly[(touch.j + 1) % n]), turn * 30);
    const target = mid(exact[touch.j], exact[(touch.j + 1) % n]);
    tries.push([target[0] - mx, target[1] - my]);
  }
  for (const at of tries) {
    const result = L.settlePoly(card, L.posePoly(card, turn * 30, at), others, size);
    if (result && samePlace(result.poly, poly)) return { turn, at, poly: result.poly };
  }
  return null;
}

/** 그 면(card · 지금 모양 poly)을 옮겨 놓으면 어느 면에도 붙지 않고 떨어지는 빈 곳(가운데, cm — 판의 오른쪽 아래부터 0.5 cm 걸음으로 찾음) | null */
export function looseSpot(play, card, poly, others) {
  const size = play.board;
  const c = centroid(poly);
  for (let y = size.h - 1; y >= 1; y -= 0.5) {
    for (let x = size.w - 1; x >= 1; x -= 0.5) {
      const moved = poly.map(([px, py]) => [px - c[0] + x, py - c[1] + y]);
      if (!L.canPlace(moved, others, size)) continue;
      if (L.magnetCandidates(card, moved, others, { size }).length > 0) continue;
      if (L.faceGroups([...others, { id: card.id, poly: moved }]).length < 2) continue;
      return [x, y];
    }
  }
  return null;
}

/**
 * 판 위의 목표 모양(fitOnBoard의 faces — 첫 면부터)을 놓는 차례: 첫 면 → 놓인 면에 맞닿은 면을 차례로(목표의 차례 가운데 먼저 맞닿는 것).
 * 카드는 화면처럼 묶음의 맨 앞 카드. 끄는 자리는 카드의 맞닿을 변의 가운데가 목표의 그 변의 가운데에 오는 곳(자석이 0 cm 옮긴다).
 * 화면과 같은 함수로 놓아 보아 목표와 같은 자리에 놓이는지 확인한다(아니면 오류).
 * → { steps: [{ group, card, turn, at, poly, spot, spots, root, kx, ky }], placed: [{ id, role, label, poly }] }
 *   turn: 놓을 때 카드의 돌림(30° 몇 번 · 0~11) / at: 끌어 놓을 카드의 가운데(cm) / spot: 키보드로 고를 자석 자리 번호(첫 면은 -1)
 *   kx · ky: 첫 면을 키보드로 옮기는 걸음(0.5 cm) 수
 */
export function planBoard(play, fit) {
  const cards = L.freeCards(L.freeSolid(play.solidId));
  const size = play.board;
  const want = [...fit.faces];
  const placed = [];
  const steps = [];
  const take = (f) => {
    const group = cards.find((c) => c.solid === f.solid).group;
    return cards.find((c) => c.group === group && !placed.some((p) => p.id === c.id));
  };
  // 첫 면
  const rootFace = want.find((f) => f.solid === fit.rootSolid);
  want.splice(want.indexOf(rootFace), 1);
  const rootCard = take(rootFace);
  const at0 = centroid(rootFace.poly);
  const pose0 = L.posePoly(rootCard, fit.turn * 30, at0);
  if (!samePlace(pose0, rootFace.poly) || !L.canPlace(pose0, [], size)) throw new Error('첫 면을 놓지 못해요');
  placed.push({ id: rootCard.id, role: rootCard.role, label: rootCard.label, poly: pose0 });
  // 키보드로 놓으면 자석 자리의 모양 그대로 놓인다 — 끌어 놓은 모양과 꼭짓점이 같아도 차례가 다를 수 있어(직사각형을 반대쪽 변으로 붙인 것 등)
  // 다음 자석 자리의 차례가 달라진다. 키보드 차례는 키보드로 놓은 모양들로 따로 센다
  const keyed = [{ id: rootCard.id, poly: pose0 }];
  steps.push({ group: rootCard.group, card: rootCard.id, turn: fit.turn, at: at0, poly: pose0, spot: -1, spots: 0, root: true,
    kx: Math.round((at0[0] - size.w / 2) / 0.5), ky: Math.round((at0[1] - size.h / 2) / 0.5) });
  while (want.length > 0) {
    const f = want.find((g) => touchEdge(g.poly, placed));
    if (!f) throw new Error('맞닿은 면이 없어요(떨어진 모양)');
    want.splice(want.indexOf(f), 1);
    const card = take(f);
    const drop = dropFor(play, card, f.poly, placed);
    if (!drop) throw new Error(`${card.label} 면이 목표 자리에 놓이지 않아요`);
    const spots = L.magnetSpots(card, keyed, size);
    const spot = spots.findIndex((x) => samePlace(x.poly, f.poly));
    keyed.push({ id: card.id, poly: spot >= 0 ? spots[spot].poly : drop.poly });
    placed.push({ id: card.id, role: card.role, label: card.label, poly: drop.poly });
    steps.push({ group: card.group, card: card.id, turn: drop.turn, at: drop.at, poly: drop.poly, spot, spots: spots.length, root: false });
  }
  return { steps, placed };
}

/** 놓인 판(placed — 첫 면부터 놓은 차례, 첫 면은 30°의 배수로 돌린 모습)을 화면에서 끌어 놓아 다시 만드는 차례(planBoard) */
export function planFromPlaced(play, placed) {
  const cards = L.freeCards(L.freeSolid(play.solidId));
  const solidOf = (id) => cards.find((c) => c.id === id).solid;
  const first = cards.find((c) => c.id === placed[0].id);
  const turn = Math.round(faceAngle(first, placed[0].poly) / 30) % 12;
  return planBoard(play, { faces: placed.map((f) => ({ solid: solidOf(f.id), poly: f.poly })), rootSolid: first.solid, turn });
}

/** 카드 묶음마다 돌림이 0에서 시작할 때 차례대로 놓으며 돌리는 횟수(30°씩 — 화면에서 [돌리기]를 누르는 수) */
export function turnCost(steps) {
  const now = new Map();
  let cost = 0;
  for (const s of steps) {
    cost += (s.turn - (now.get(s.group) ?? 0) + 12) % 12;
    now.set(s.group, s.turn);
  }
  return cost;
}

/**
 * 목록의 전개도 하나를 판에 놓는 차례(들어가는 방향이 없으면 null). pick: 들어가는 방향 가운데 몇 번째(없으면 여유가 가장 큰 것),
 * 'fewest'면 카드를 가장 적게 돌리는 방향(화면 검사를 빠르게)
 */
export function planCatalog(play, index, { rootSolid = 'b0', pick = null } = {}) {
  const list = catalogNets(play.solidId);
  const entry = list[index % list.length];
  if (pick === 'fewest') {
    let best = null;
    for (let k = 0; k < 12; k += 1) {
      const fit = fitOnBoard(play, entry.faces, { rootSolid, pick: k });
      if (!fit) return null;
      const plan = planBoard(play, fit);
      const cost = turnCost(plan.steps);
      if (!best || cost < best.cost) best = { cost, plan };
    }
    return { key: entry.key, ...best.plan };
  }
  const fit = fitOnBoard(play, entry.faces, { rootSolid, pick });
  return fit && { key: entry.key, ...planBoard(play, fit) };
}

/**
 * 학생처럼 놓은 판(무작위): 첫 면을 판 가운데쯤, 그다음은 남은 카드 가운데 아무것을 자석 자리 아무 데나(같은 길이 · 다른 길이 · 맞는 · 틀린 모서리 모두 —
 * 화면의 magnetSpots 그대로). free(0~1)만큼은 아무 데도 붙지 않는 빈 곳에 놓는다(떨어진 면). 놓을 곳이 없으면 그 판은 버린다(null)
 * → { placed: [{ id, role, label, poly }], unequal(길이가 다르게 붙인 곳 수) }
 */
export function randomBoard(play, rng, { free = 0 } = {}) {
  const cards = L.freeCards(L.freeSolid(play.solidId));
  const size = play.board;
  const order = rng.shuffle([...cards]);
  const placed = [];
  let unequal = 0;
  for (const card of order) {
    const others = placed.map((p) => ({ id: p.id, poly: p.poly }));
    let poly = null;
    if (placed.length === 0 || rng.next() < free) {
      for (let tries = 0; tries < 40 && !poly; tries += 1) {
        const at = [rng.next() * size.w, rng.next() * size.h];
        const raw = L.posePoly(card, rng.int(0, 11) * 30, at);
        if (L.canPlace(raw, others, size) && L.magnetCandidates(card, raw, others, { size }).length === 0) poly = raw;
      }
      if (!poly && placed.length === 0) return null;
    }
    if (!poly) {
      const spots = L.magnetSpots(card, others, size);
      if (spots.length === 0) return null;
      const s = rng.pick(spots);
      poly = s.poly;
      const lt = L.edgeLengthOf(placed.find((p) => p.id === s.face).poly, s.edge);
      if (Math.abs(L.edgeLengthOf(card.poly, s.cardEdge) - lt) > 1e-6) unequal += 1;
    }
    placed.push({ id: card.id, role: card.role, label: card.label, poly });
  }
  return { placed, unequal };
}
