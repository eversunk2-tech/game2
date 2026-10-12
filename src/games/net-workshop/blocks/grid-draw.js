/**
 * 쌓기나무 차시의 2D 그림 (SVG, 브라우저). 기획서: spec-grade6.md 3-1·3-4절
 * - 위에서 본 모양(2차시): 교과서 58~59쪽처럼 입체 그림과 같은 방향으로 비스듬히 놓은 판에 쌓인 자리를 칠한다. "앞"·"옆" 글자가 붙는다.
 * - 둘레에서 본 모습(1차시): 세로줄 3 × 층 3 모눈에 가장 가까운 조형물의 색과 무늬.
 * - 위에서 내려다본 배치 그림(1차시): 3×3 모눈(앞줄이 아래)과 보는 쪽 화살표.
 * 색은 디자인 토큰을 style로 준다. 색만으로 구분하지 않는다(무늬·글자). 그림마다 글로 읽히는 이름(aria-label)이 있다.
 * S2(3·4차시)에서 모눈 칠하기·수 올리고 내리기가 여기에 더해진다.
 */
import { COLS, MAX_H, ROWS } from './blocks.js';
import { POSES, markPath, projectPoint, svgEl } from './block-view.js';

const pointsOf = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
const text = (cls, x, y, value) => svgEl('text', { class: cls, x: x.toFixed(1), y: y.toFixed(1) }, document.createTextNode(String(value)));

/**
 * 위에서 본 모양(비스듬히 놓은 판). top[줄][칸] = 1 · 0
 * hint: { x, y, value } 그 자리에 수를 적는다(힌트) · diff: 다르다고 표시할 자리 [[x, y]]
 */
export function createFloorPlan({ top, unit = 30, hint = null, diff = [] }) {
  const pose = POSES.home;
  const w = Math.ceil(unit * 4.24 + 56);
  const h = Math.ceil(unit * 2.45 + 30);
  // 판의 가운데(1.5, 1.5, 0)가 틀의 가운데 위쪽에 오게 한다 (projectPoint는 판 전체의 가운데(1.5, 1.5, 1.5)를 기준으로 한다)
  const [, baseY] = projectPoint(pose, unit, 0, 0, [COLS / 2, ROWS / 2, 0]);
  const at = (p) => projectPoint(pose, unit, w / 2, unit * 1.22 + 6 - baseY, p);
  const on = [];
  top.forEach((row, y) => row.forEach((v, x) => {
    if (v) on.push(`${y + 1}줄 ${x + 1}칸`);
  }));
  const svg = svgEl('svg', {
    class: 'blk-plan',
    viewBox: `0 0 ${w} ${h}`,
    role: 'img',
    'aria-label': `위에서 본 모양. 쌓인 자리는 ${on.join(', ')}이에요. 줄은 앞줄부터, 칸은 왼쪽부터 세요.`,
    focusable: 'false',
  });
  const diffSet = new Set(diff.map(([x, y]) => `${x},${y}`));
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    for (let x = 0; x < COLS; x += 1) {
      const corners = [[x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0]].map(at);
      const cls = `blk-plan-cell${top[y][x] ? ' is-on' : ''}${diffSet.has(`${x},${y}`) ? ' is-diff' : ''}`;
      svg.append(svgEl('polygon', { class: cls, points: pointsOf(corners) }));
      const c = at([x + 0.5, y + 0.5, 0]);
      if (diffSet.has(`${x},${y}`)) svg.append(text('blk-x', c[0], c[1], '✗'));
      else if (hint && hint.x === x && hint.y === y) svg.append(text('blk-plan-num', c[0], c[1], hint.value));
    }
  }
  const front = at([COLS / 2, -0.75, 0]);
  const side = at([COLS + 0.75, ROWS / 2, 0]);
  svg.append(text('blk-plan-label', front[0], front[1], '앞'), text('blk-plan-label', side[0], side[1], '옆'));
  return svg;
}

/** 조형물 칸 하나(네모)와 무늬 */
function sculptureCell(svg, x, y, size, info) {
  const rect = svgEl('rect', { class: 'blk-flat-cell is-on', x, y, width: size, height: size, rx: 1.5 });
  rect.style.fill = `var(${info.token})`;
  svg.append(rect);
  if (info.mark && info.mark !== 'plain') {
    svg.append(svgEl('path', { class: `blk-mark blk-mark-${info.mark}`, d: markPath(info.mark, [[x, y + size], [x + size, y + size], [x + size, y], [x, y]]) }));
  }
}

/** 조형물 이름표의 작은 그림(한 칸) */
export function createSwatch(info, size = 18) {
  const svg = svgEl('svg', { class: 'blk-swatch', viewBox: `0 0 ${size + 4} ${size + 4}`, 'aria-hidden': 'true', focusable: 'false' });
  sculptureCell(svg, 2, 2, size, info);
  return svg;
}

/**
 * 둘레의 한 방향에서 본 모습: scene[층][왼쪽부터 세로줄] = 조형물 id 또는 null. look(id) → { token, mark }
 */
export function createScenePicture({ scene, look, label, cell = 30 }) {
  const pad = 6;
  const w = COLS * cell + pad * 2;
  const h = MAX_H * cell + pad * 2 + 4;
  const svg = svgEl('svg', { class: 'blk-flat', viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label, focusable: 'false' });
  for (let z = 0; z < MAX_H; z += 1) {
    for (let i = 0; i < COLS; i += 1) {
      const x = pad + i * cell;
      const y = pad + (MAX_H - 1 - z) * cell;
      const id = scene[z][i];
      if (id) sculptureCell(svg, x, y, cell, look(id));
      else svg.append(svgEl('rect', { class: 'blk-flat-cell', x, y, width: cell, height: cell, rx: 1.5 }));
    }
  }
  svg.append(svgEl('path', { class: 'blk-flat-ground', d: `M2 ${pad + MAX_H * cell + 1}H${w - 2}` }));
  return svg;
}

const ARROW_AT = {
  front: { tail: [1.5, -1.25], tip: [1.5, -0.2] },
  right: { tail: [4.25, 1.5], tip: [3.2, 1.5] },
  back: { tail: [1.5, 4.25], tip: [1.5, 3.2] },
  left: { tail: [-1.25, 1.5], tip: [-0.2, 1.5] },
};

/**
 * 위에서 내려다본 배치 그림: 3×3 모눈(앞줄이 아래), 조형물 자리에 색·무늬, 보는 쪽에 화살표.
 * color[줄][칸] = 조형물 id · look(id) → { token, mark } · dir: 화살표가 놓일 쪽
 */
export function createSceneMap({ color, look, dir, label, cell = 64 }) {
  const room = cell * 1.35;
  const size = COLS * cell + room * 2;
  const svg = svgEl('svg', { class: 'blk-map', viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': label, focusable: 'false' });
  // 모델 (x, y) → 화면: 앞줄(y = 0)이 아래
  const at = ([x, y]) => [room + x * cell, room + (ROWS - y) * cell];
  svg.append(svgEl('rect', { class: 'blk-map-board', x: room, y: room, width: COLS * cell, height: ROWS * cell, rx: 4 }));
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const [sx, sy] = at([x, y + 1]);
      const id = color[y][x];
      if (id) sculptureCell(svg, sx + 3, sy + 3, cell - 6, look(id));
      else svg.append(svgEl('rect', { class: 'blk-flat-cell', x: sx, y: sy, width: cell, height: cell }));
    }
  }
  const arrow = ARROW_AT[dir];
  const tail = at(arrow.tail);
  const tip = at(arrow.tip);
  const ux = Math.sign(tip[0] - tail[0]);
  const uy = Math.sign(tip[1] - tail[1]);
  const head = cell * 0.26;
  svg.append(
    svgEl('path', { class: 'blk-map-arrow', d: `M${tail[0]} ${tail[1]}L${tip[0] - ux * head} ${tip[1] - uy * head}` }),
    svgEl('polygon', {
      class: 'blk-map-head',
      points: pointsOf([tip, [tip[0] - ux * head * 1.5 - uy * head, tip[1] - uy * head * 1.5 - ux * head], [tip[0] - ux * head * 1.5 + uy * head, tip[1] - uy * head * 1.5 + ux * head]]),
    }),
  );
  return svg;
}
