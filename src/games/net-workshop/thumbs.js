/**
 * 작은 그림들 (브라우저, SVG는 createElementNS): 단계 카드 그림(stage.thumb), 처음 화면 그림(heroArt), 도감·노트 칸 그림.
 * 색은 디자인 토큰(var(--face-n) 등)을 style로 준다(SVG 속성에는 var()를 쓸 수 없다). 모두 그림이라 aria-hidden.
 */
import { LABELS, fromCells, hasBlock2x2 } from './fold.js';
import { CUBE_NETS } from './nets-data.js';
import { createNetView } from './view3d.js';

const NS = 'http://www.w3.org/2000/svg';
const INK = 'var(--ink)';

function svgEl(tag, attrs = {}, children = []) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    el.setAttribute(key, String(value));
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

/** 칠하기·선 (style로 줘야 var()가 된다) */
const paint = (fill, stroke = INK, width = 2, extra = '') => `fill:${fill};stroke:${stroke};stroke-width:${width};${extra}`;

function svgRoot(viewBox, cls, children) {
  return svgEl('svg', { viewBox, class: cls, 'aria-hidden': 'true', focusable: 'false' }, children);
}

const square = (x, y, fill, { size = 14, stroke = INK, width = 2, transform = null, extra = '' } = {}) =>
  svgEl('rect', { x, y, width: size, height: size, rx: 1.5, style: paint(fill, stroke, width, extra), transform });

const face = (n) => `var(--face-${n})`;

/** 직사각형 조각 (직육면체 차시의 단계 그림) */
const box = (x, y, width, height, fill, { stroke = INK, width: line = 2, transform = null, extra = '' } = {}) =>
  svgEl('rect', { x, y, width, height, rx: 1.5, style: paint(fill, stroke, line, extra), transform });

// ── 단계 카드 그림 (76×57, viewBox 80×60) ─────────────
const STAGE_THUMBS = {
  /** 판별: 십자 전개도 + ✓ 도장 */
  judge: () => [
    square(18, 6, face(1)), square(4, 20, face(2)), square(18, 20, face(3)), square(32, 20, face(4)), square(46, 20, face(5)), square(18, 34, face(6)),
    svgEl('circle', { cx: 66, cy: 44, r: 10, style: paint('var(--paper)') }),
    svgEl('path', { d: 'M61 44l4 4 7-8', style: 'fill:none;stroke:var(--correct);stroke-width:3;stroke-linecap:round;stroke-linejoin:round' }),
  ],
  /** 마주 보는 면: ★ 면과 반대쪽 면을 잇는 점선 */
  opposite: () => [
    square(4, 20, face(2)), square(18, 20, 'var(--butter)'),
    svgEl('path', { d: 'M25 23.2l1.5 3.1 3.4.5-2.5 2.4.6 3.4-3-1.6-3 1.6.6-3.4-2.5-2.4 3.4-.5z', style: 'fill:var(--ink);stroke:none' }),
    square(32, 20, face(3)), square(46, 20, face(4), { stroke: 'var(--primary)', width: 3.5 }), square(18, 6, face(5)), square(18, 34, face(6)),
    svgEl('path', { d: 'M25 50q14 10 28 0', style: 'fill:none;stroke:var(--primary);stroke-width:2.2;stroke-dasharray:3 3' }),
  ],
  /** 면 붙이기: 빈 자리(+)와 붙일 면 카드 */
  complete: () => [
    square(18, 6, face(1)), square(4, 20, face(2)), square(18, 20, face(3)), square(32, 20, face(4)),
    square(46, 20, 'var(--primary-soft)', { stroke: 'var(--primary)', extra: 'stroke-dasharray:3 2' }),
    svgEl('path', { d: 'M53 23.5v7M49.5 27h7', style: 'fill:none;stroke:var(--primary);stroke-width:2;stroke-linecap:round' }),
    square(60, 38, face(6), { transform: 'rotate(12 67 45)' }),
  ],
  /** 내 맘대로 전개도: 재단 매트 위에 놓는 중인 조각 */
  free: () => [
    svgEl('rect', { x: 2, y: 4, width: 76, height: 52, rx: 6, style: paint('var(--mat)') }),
    svgEl('path', { d: 'M16 4v52M30 4v52M44 4v52M58 4v52M2 18h76M2 32h76M2 46h76', style: 'fill:none;stroke:rgb(255 255 255 / 28%);stroke-width:1' }),
    square(16, 18, face(1)), square(30, 18, face(2)), square(30, 32, face(3)),
    square(54, 8, face(6), { transform: 'rotate(-10 61 15)' }),
  ],
  // ── 직육면체의 전개도 차시 (크기가 다른 직사각형 면) ──
  /** 만나는 선분: 같은 무늬로 표시한 두 변 */
  edge: () => [
    box(8, 22, 20, 14, face(2)), box(28, 22, 12, 14, face(3)), box(40, 22, 20, 14, face(4)), box(60, 22, 12, 14, face(5)), box(8, 10, 20, 12, face(1)), box(40, 36, 20, 12, face(6)),
    svgEl('path', { d: 'M8 10h20M40 22h20', style: 'fill:none;stroke:var(--primary);stroke-width:4.5' }),
  ],
  /** 알맞은 면 고르기: 빈 자리(+)와 크기가 다른 카드 두 장 */
  face: () => [
    box(6, 24, 18, 14, face(2)), box(24, 24, 12, 14, face(3)), box(36, 24, 18, 14, face(4)), box(6, 12, 18, 12, face(1)),
    box(36, 38, 18, 10, 'var(--primary-soft)', { stroke: 'var(--primary)', extra: 'stroke-dasharray:3 2' }),
    svgEl('path', { d: 'M45 39.5v7M41.5 43h7', style: 'fill:none;stroke:var(--primary);stroke-width:2;stroke-linecap:round' }),
    box(58, 8, 16, 11, face(6)), box(60, 26, 12, 17, face(6)),
  ],
  /** 길이까지 살펴요: 길이 눈금이 붙은 전개도 + ✓ 도장 */
  cjudge: () => [
    box(6, 20, 18, 14, face(2)), box(24, 20, 12, 14, face(3)), box(36, 20, 18, 14, face(4)), box(6, 8, 18, 12, face(1)), box(36, 34, 18, 12, face(6)),
    svgEl('path', { d: 'M6 4.5h18M6 2.5v4M24 2.5v4M15 2.5v4', style: 'fill:none;stroke:var(--ink);stroke-width:1.6' }),
    svgEl('circle', { cx: 66, cy: 44, r: 10, style: paint('var(--paper)') }),
    svgEl('path', { d: 'M61 44l4 4 7-8', style: 'fill:none;stroke:var(--correct);stroke-width:3;stroke-linecap:round;stroke-linejoin:round' }),
  ],
  /** 내 맘대로 직육면체 전개도: 재단 매트 위에 놓는 중인 직사각형 조각 */
  cfree: () => [
    svgEl('rect', { x: 2, y: 4, width: 76, height: 52, rx: 6, style: paint('var(--mat)') }),
    svgEl('path', { d: 'M12 4v52M22 4v52M32 4v52M42 4v52M52 4v52M62 4v52M72 4v52M2 14h76M2 24h76M2 34h76M2 44h76', style: 'fill:none;stroke:rgb(255 255 255 / 28%);stroke-width:1' }),
    box(12, 24, 30, 20, face(1)), box(42, 24, 10, 20, face(3)), box(12, 14, 30, 10, face(5)),
    box(54, 8, 20, 10, face(6), { transform: 'rotate(-10 64 13)' }),
  ],
};

/** 단계 카드 오른쪽 위 그림 (stage.thumb) */
export function stageThumb(kind) {
  const make = STAGE_THUMBS[kind];
  return make ? () => svgRoot('0 0 80 60', `stage-art stage-art-${kind}`, make()) : undefined;
}

// ── 도감·노트 칸 그림 ───────────────────────
/** 칸 모양을 정사각형 그림에 가운데 맞춰 그린다. 전개도는 색종이 색, 안 되는 모양은 살구색 + 2×2 가운데에 ● */
export function miniNet(cells, { invalid = false, cls = 'mini-net' } = {}) {
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const hgt = Math.max(...cells.map((c) => c[1])) + 1;
  const size = Math.max(w, hgt);
  const ox = (size - w) / 2;
  const oy = (size - hgt) / 2;
  const parts = cells.map(([x, y], i) => svgEl('rect', {
    x: x + ox, y: y + oy, width: 1, height: 1, rx: 0.08,
    style: paint(invalid ? 'var(--wrong-bg)' : face((i % 6) + 1), INK, 0.12),
  }));
  if (invalid && hasBlock2x2(cells)) {
    const taken = new Set(cells.map(([x, y]) => `${x},${y}`));
    const corner = cells.find(([x, y]) => [[x + 1, y], [x, y + 1], [x + 1, y + 1]].every(([a, b]) => taken.has(`${a},${b}`)));
    parts.push(svgEl('circle', { cx: corner[0] + 1 + ox, cy: corner[1] + 1 + oy, r: 0.22, style: 'fill:var(--wrong);stroke:none' }));
  }
  return svgRoot(`-0.3 -0.3 ${size + 0.6} ${size + 0.6}`, cls, parts);
}

// ── 주사위 눈 (도전 주문서 "주사위 주문") ─────────────
// 눈의 자리(100 × 100 칸 안): 왼쪽 위·오른쪽 아래 대각선부터 채우는 보통 주사위 모양
const PIP_AT = { tl: [27, 27], tr: [73, 27], ml: [27, 50], mm: [50, 50], mr: [73, 50], bl: [27, 73], br: [73, 73] };
const PIP_LAYOUT = {
  1: ['mm'],
  2: ['tl', 'br'],
  3: ['tl', 'mm', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'mm', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};

/**
 * 주사위 눈 그림(점 무늬). 색이 아니라 점의 수와 자리로 구분한다. 그림이라 aria-hidden — 이름("주사위 눈 3")은 면·카드가 갖는다.
 * 끄는 동안의 복제(엔진 끌어다 놓기)에도 그대로 옮겨지게 가상 요소가 아니라 실제 SVG 요소로 그린다.
 */
export function pipFace(label) {
  const spots = PIP_LAYOUT[Number(label)] ?? [];
  return svgRoot('0 0 100 100', 'pips', spots.map((key) => svgEl('circle', {
    cx: PIP_AT[key][0], cy: PIP_AT[key][1], r: 10, style: `fill:${INK};stroke:none`,
  })));
}

/** 만든 주사위의 작은 그림: 전개도 모양의 칸마다 눈의 수(숫자) */
export function miniDice(cells, labels, { cls = 'mini-net mini-dice' } = {}) {
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const hgt = Math.max(...cells.map((c) => c[1])) + 1;
  const size = Math.max(w, hgt);
  const ox = (size - w) / 2;
  const oy = (size - hgt) / 2;
  const parts = cells.flatMap(([x, y], i) => {
    const text = svgEl('text', {
      x: x + ox + 0.5, y: y + oy + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      style: `fill:${INK};font-size:0.66px;font-weight:800`,
    });
    text.textContent = String(labels[i] ?? '');
    return [svgEl('rect', { x: x + ox, y: y + oy, width: 1, height: 1, rx: 0.08, style: paint('var(--paper)', INK, 0.12) }), text];
  });
  return svgRoot(`-0.3 -0.3 ${size + 0.6} ${size + 0.6}`, cls, parts);
}

// ── 처음 화면 그림 ─────────────────────────
/** 재단 매트 위에 반쯤 접힌 십자 전개도(실제 접기 계산·3D 무대, 정지) + "먼저 예측하고 접어서 확인!" 쪽지 */
export function heroArt(h) {
  const view = createNetView({ h, still: true });
  const cross = CUBE_NETS.find((n) => n.name === '1-4-1e').cells;
  view.setNet(fromCells(cross, { labels: LABELS }));
  view.setT(0.42);
  view.rotate(-30);
  return h('div', { class: 'hero-net' },
    view.el,
    h('p', { class: 'hero-sticky' }, '먼저 예측하고', h('br'), '접어서 확인!'),
  );
}

// ── 직육면체 전개도의 작은 그림 ("내 맘대로 직육면체 전개도"의 찾은 전개도 칸) ─────────────
/** 직사각형 면들 [{ x, y, w, h }]을 정사각형 그림에 가운데 맞춰 그린다. 크기가 같은 면(짝)은 같은 색 */
export function miniRects(rects, { cls = 'mini-net' } = {}) {
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const w = Math.max(...rects.map((r) => r.x + r.w)) - minX;
  const hgt = Math.max(...rects.map((r) => r.y + r.h)) - minY;
  const size = Math.max(w, hgt);
  const kinds = [...new Set(rects.map((r) => [Math.min(r.w, r.h), Math.max(r.w, r.h)].join('x')))].sort();
  const parts = rects.map((r) => svgEl('rect', {
    x: r.x - minX + (size - w) / 2, y: r.y - minY + (size - hgt) / 2, width: r.w, height: r.h, rx: 0.08,
    style: paint(face(kinds.indexOf([Math.min(r.w, r.h), Math.max(r.w, r.h)].join('x')) * 2 + 1), INK, 0.14),
  }));
  return svgRoot(`-0.3 -0.3 ${size + 0.6} ${size + 0.6}`, cls, parts);
}

// ── 영역 카드·탭 그림 (처음 화면의 영역 카드 64×64, 단계 지도의 영역 탭 42×34) ─────────────
/** 쌓기나무 하나의 보이는 세 면(윗면·앞면·옆면)을 비스듬한 평행 투영으로. 앞면·옆면은 잉크를 옅게 덮어 그늘(쌓기나무 무대와 같은 차례: 윗면 밝게 · 앞 · 옆 어둡게) */
function isoCubes(cubes, { edge = 14, fill = face(1) } = {}) {
  const a = edge * Math.cos(Math.PI / 6);
  const b = edge / 2;
  const at = (x, y, z) => [(x - y) * a, (x + y) * b - z * edge];
  const pts = (list) => list.map(([x, y, z]) => at(x, y, z).map((v) => v.toFixed(2)).join(',')).join(' ');
  const parts = [];
  // 뒤에서 앞으로(x + y + z가 작은 것부터) 그린다
  for (const [x, y, z] of [...cubes].sort((p, q) => p[0] + p[1] + p[2] - (q[0] + q[1] + q[2]))) {
    const faces = [
      { shade: 0, list: [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]] }, // 윗면
      { shade: 0.12, list: [[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]] }, // 앞면
      { shade: 0.26, list: [[x + 1, y, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x + 1, y, z + 1]] }, // 옆면
    ];
    for (const f of faces) {
      parts.push(svgEl('polygon', { points: pts(f.list), style: paint(fill, INK, 2, 'stroke-linejoin:round') }));
      if (f.shade) parts.push(svgEl('polygon', { points: pts(f.list), style: `fill:rgb(15 20 40 / ${Math.round(f.shade * 100)}%);stroke:${INK};stroke-width:2;stroke-linejoin:round` }));
    }
  }
  const all = cubes.flatMap(([x, y, z]) => [at(x, y, z), at(x + 1, y + 1, z), at(x + 1, y, z), at(x, y + 1, z), at(x, y, z + 1), at(x + 1, y, z + 1), at(x, y + 1, z + 1), at(x + 1, y + 1, z + 1)]);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const box = { x: Math.min(...xs) - 3, y: Math.min(...ys) - 3, w: Math.max(...xs) - Math.min(...xs) + 6, h: Math.max(...ys) - Math.min(...ys) + 6 };
  return { viewBox: `${box.x.toFixed(2)} ${box.y.toFixed(2)} ${box.w.toFixed(2)} ${box.h.toFixed(2)}`, parts };
}

const AREA_ARTS = {
  /** 5학년 전개도: 색종이 면 6장의 십자 전개도(정육면체) + 옆에 직육면체 조각 한 장 */
  net5: () => ({
    viewBox: '0 0 64 64',
    parts: [
      square(15, 7, face(1), { size: 13 }), square(2, 20, face(2), { size: 13 }), square(15, 20, face(3), { size: 13 }),
      square(28, 20, face(4), { size: 13 }), square(41, 20, face(5), { size: 13 }), square(15, 33, face(6), { size: 13 }),
      box(36, 41, 24, 15, face(7), { transform: 'rotate(-8 48 48)' }),
    ],
  }),
  /** 6학년 전개도: 삼각기둥의 전개도(옆면 셋 + 밑면 둘) */
  net6: () => ({
    viewBox: '0 0 64 64',
    parts: [
      box(4, 20, 18, 24, face(2)), box(22, 20, 18, 24, face(3)), box(40, 20, 18, 24, face(4)),
      svgEl('polygon', { points: '22,20 40,20 31,4.4', style: paint(face(1), INK, 2, 'stroke-linejoin:round') }),
      svgEl('polygon', { points: '22,44 40,44 31,59.6', style: paint(face(6), INK, 2, 'stroke-linejoin:round') }),
    ],
  }),
  /** 쌓기나무: 쌓기나무 네 개(바닥 셋 + 위에 하나) */
  blocks: () => isoCubes([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]),
};

/** 영역 카드·탭 그림 (영역 정의의 art). 없는 이름이면 undefined */
export function areaArt(kind) {
  const make = AREA_ARTS[kind];
  return make ? () => {
    const { viewBox, parts } = make();
    return svgRoot(viewBox, `area-art-svg area-art-${kind}`, parts);
  } : undefined;
}
