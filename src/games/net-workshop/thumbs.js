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
