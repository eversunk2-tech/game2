/**
 * 쌓기나무 차시의 2D 그림 (SVG, 브라우저). 기획서: spec-grade6.md 3-1·3-4절
 * - 위에서 본 모양(2차시): 교과서 58~59쪽처럼 입체 그림과 같은 방향으로 비스듬히 놓은 판에 쌓인 자리를 칠한다. "앞"·"옆" 글자가 붙는다.
 * - 둘레에서 본 모습(1차시): 세로줄 3 × 층 3 모눈에 가장 가까운 조형물의 색과 무늬.
 * - 위에서 내려다본 배치 그림(1차시): 3×3 모눈(앞줄이 아래)과 보는 쪽 화살표.
 * 색은 디자인 토큰을 style로 준다. 색만으로 구분하지 않는다(무늬·글자). 그림마다 글로 읽히는 이름(aria-label)이 있다.
 * S2(3·4차시): 반듯한 모눈의 그림(위·앞·옆에서 본 모양, 수를 쓴 위에서 본 모양 — 교과서 60~65쪽의 표기: 위에서 본 모양은 아래에 "앞",
 *   오른쪽에 "옆"), 모눈 칠하기(createPaintGrid), 수 쓰기(createNumberGrid). 누르는 칸은 모두 48px.
 */
import { josa } from '../../../shared/core/korean.js';
import { icon } from '../../../shared/ui/icons.js';
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

// ── S2: 반듯한 모눈 그림 (위·앞·옆에서 본 모양, 수를 쓴 위에서 본 모양) ──────────
/** 칸에 ✗(다른 칸): 칸 테두리를 벽돌색 점선으로 하고 가운데에 ✗ — 색만으로 알리지 않는다 */
function diffMark(svg, x, y, size) {
  svg.append(
    svgEl('rect', { class: 'blk-grid-diff', x: x + 2, y: y + 2, width: size - 4, height: size - 4, rx: 2 }),
    text('blk-x blk-grid-x', x + size / 2, y + size / 2, '✗'),
  );
}

/**
 * 반듯한 모눈 그림 한 장(SVG): 3×3 칸.
 * kind: 'top'(위에서 본 모양 — 앞줄이 아래, 아래에 "앞"·오른쪽에 "옆") · 그 밖(앞·옆·뒤·왼쪽에서 본 모양 — 1층이 아래, 아래에 바닥 선)
 * cells: 칸 [행][열](위 = [줄][칸], 앞·옆 = [층][세로줄]) · numbers: 위에서 본 모양의 자리마다 수(수를 쓴 그림 — cells 대신)
 * diff: ✗ 표시할 칸 [{ r, c }] · hint: { r, c, text } 그 칸에 글자(힌트) · mark: { r, c } 그 칸에 굵은 점선 테두리(힌트) · label: 글 이름(화면 읽기)
 * 크기는 문항과 무관하게 한 가지(칸 크기 cell)다.
 */
export function createGridPicture({ kind, cells = null, numbers = null, cell = 26, diff = [], hint = null, mark = null, label = '' }) {
  const top = kind === 'top';
  const pad = 4;
  const side = top ? 20 : 4; // 오른쪽 "옆" 글자 자리
  const foot = top ? 20 : 8; // 아래 "앞" 글자 자리 · 바닥 선
  const w = COLS * cell + pad + side;
  const h = (top ? ROWS : MAX_H) * cell + pad + foot;
  // 크기는 칸 크기로 정한 그대로(width·height) — 쓰는 곳이 CSS로 바꿀 수 있다. 글자 크기도 칸에 맞춘다
  const svg = svgEl('svg', { class: `blk-grid-pic${top ? ' is-top' : ''}${numbers ? ' is-numbers' : ''}`, viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img', 'aria-label': label, focusable: 'false' });
  svg.style.setProperty('--cell-font', `${Math.round(cell * 0.6)}px`);
  const rows = top ? ROWS : MAX_H;
  const diffSet = new Set(diff.map((d) => `${d.r},${d.c}`));
  for (let r = rows - 1; r >= 0; r -= 1) {
    for (let c = 0; c < COLS; c += 1) {
      const x = pad + c * cell;
      const y = pad + (rows - 1 - r) * cell;
      const n = numbers ? numbers[r][c] : 0;
      const on = numbers ? n > 0 : Boolean(cells?.[r]?.[c]);
      svg.append(svgEl('rect', { class: `blk-grid-cell${on ? ' is-on' : ''}`, x, y, width: cell, height: cell }));
      if (numbers && n > 0) svg.append(text('blk-grid-num', x + cell / 2, y + cell / 2, n));
      if (diffSet.has(`${r},${c}`)) diffMark(svg, x, y, cell);
      else if (hint && hint.r === r && hint.c === c) svg.append(text('blk-grid-num blk-grid-hint', x + cell / 2, y + cell / 2, hint.text));
      if (mark && mark.r === r && mark.c === c) svg.append(svgEl('rect', { class: 'blk-grid-mark', x: x + 3, y: y + 3, width: cell - 6, height: cell - 6, rx: 3 }));
    }
  }
  if (top) {
    svg.append(
      text('blk-plan-label', pad + (COLS * cell) / 2, pad + rows * cell + foot / 2 + 1, '앞'),
      text('blk-plan-label', pad + COLS * cell + side / 2 + 1, pad + (rows * cell) / 2, '옆'),
    );
  } else svg.append(svgEl('path', { class: 'blk-flat-ground', d: `M1 ${pad + rows * cell + 2}H${pad + COLS * cell + 3}` }));
  return svg;
}

/** 수를 쓴 위에서 본 모양의 글 이름: "수를 쓴 위에서 본 모양: 1줄 1칸 2, 1줄 2칸 1, …" (줄은 앞줄부터, 칸은 왼쪽부터) */
export function describeNumbers(map) {
  const parts = [];
  map.forEach((row, y) => row.forEach((n, x) => {
    if (n > 0) parts.push(`${y + 1}줄 ${x + 1}칸 ${n}`);
  }));
  return `수를 쓴 위에서 본 모양: ${parts.join(', ')}. 줄은 앞줄부터, 칸은 왼쪽부터 세요.`;
}

// ── S2: 모눈 칠하기 ─────────────────────────
const PAINT_LABEL = { top: '위에서 본 모양', front: '앞에서 본 모양', side: '옆에서 본 모양' };
const emptyCells = () => Array.from({ length: 3 }, () => [0, 0, 0]);

/** 칸의 말: 위 "2줄 3칸" · 앞·옆 "왼쪽에서 2번째 세로줄 1층" */
const cellWord = (kind, r, c) => (kind === 'top' ? `${r + 1}줄 ${c + 1}칸` : `왼쪽에서 ${c + 1}번째 세로줄 ${r + 1}층`);

/**
 * 모눈 칠하기: 칸을 누르면 칠하고, 다시 누르면 지운다(마우스·터치). 키보드: 방향키로 칸을 옮기고 Space·Enter로 칠하기·지우기,
 * Backspace·Delete로 지우기. 칸은 48px 버튼이고 칠한 칸은 색 + 안쪽 그림자(색만으로 구분하지 않는다) + 이름("칠함").
 * kind: 'top' · 'front' · 'side' — 위는 앞줄이 아래(아래 "앞", 오른쪽 "옆"), 앞·옆은 1층이 아래(바닥 선).
 * → { el, kind, get(), set(cells), lock(bool), showDiff([{ r, c, state }]), clearDiff(), onChange(fn), focus() }
 */
export function createPaintGrid({ ctx, kind, title = PAINT_LABEL[kind] }) {
  const { h } = ctx;
  let cells = emptyCells();
  let locked = false;
  let focusAt = [0, 0]; // [행, 열]
  const listeners = new Set();
  const rows = kind === 'top' ? ROWS : MAX_H;
  const buttons = [];
  const rowEls = [];
  for (let r = rows - 1; r >= 0; r -= 1) {
    const row = [];
    for (let c = 0; c < COLS; c += 1) {
      const b = h('button', { type: 'button', class: 'blk-pcell', role: 'gridcell', tabindex: '-1', dataset: { r, c }, onclick: () => press(r, c) });
      buttons.push({ r, c, el: b });
      row.push(b);
    }
    rowEls.push(h('div', { class: 'blk-pgrid-row', role: 'row' }, row));
  }
  const grid = h('div', {
    class: 'blk-pgrid',
    role: 'grid',
    'aria-label': `${title} 모눈. 방향키로 칸을 옮기고, Space나 Enter로 칠하거나 지워요.`,
  }, rowEls);
  const parts = [h('p', { class: 'blk-paint-title' }, title), grid];
  if (kind === 'top') parts.push(h('span', { class: 'blk-paint-side', 'aria-hidden': 'true' }, '옆'), h('span', { class: 'blk-paint-front', 'aria-hidden': 'true' }, '앞'));
  else parts.push(h('span', { class: 'blk-paint-ground', 'aria-hidden': 'true' }));
  const el = h('div', { class: `blk-paint is-${kind}`, dataset: { kind } }, parts);
  const at = (r, c) => buttons.find((b) => b.r === r && b.c === c).el;

  function paint() {
    for (const { r, c, el: b } of buttons) {
      const on = Boolean(cells[r][c]);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
      b.setAttribute('aria-label', `${cellWord(kind, r, c)}, ${on ? '칠함' : '빈칸'}`);
      b.setAttribute('tabindex', r === focusAt[0] && c === focusAt[1] ? '0' : '-1');
      b.disabled = locked;
    }
  }
  function clearDiff() {
    for (const { el: b } of buttons) b.classList.remove('is-diff', 'is-extra', 'is-missing');
  }
  function toggle(r, c, value = !cells[r][c]) {
    if (locked || Boolean(cells[r][c]) === value) return;
    cells = cells.map((row) => [...row]);
    cells[r][c] = value ? 1 : 0;
    clearDiff();
    paint();
    ctx.sfx.play('click');
    ctx.feedback.announce(`${cellWord(kind, r, c)}을 ${value ? '칠했어요' : '지웠어요'}.`);
    for (const fn of listeners) fn({ kind, cells: get() });
  }
  function press(r, c) {
    focusAt = [r, c];
    toggle(r, c);
  }
  function move(dr, dc) {
    focusAt = [Math.max(0, Math.min(rows - 1, focusAt[0] + dr)), Math.max(0, Math.min(COLS - 1, focusAt[1] + dc))];
    paint();
    at(...focusAt).focus({ preventScroll: true });
  }
  grid.addEventListener('keydown', (event) => {
    const hit = buttons.find((b) => b.el === event.target);
    if (!hit || event.ctrlKey || event.metaKey || event.altKey) return;
    focusAt = [hit.r, hit.c];
    const { key } = event;
    if (key === 'ArrowLeft') move(0, -1);
    else if (key === 'ArrowRight') move(0, 1);
    else if (key === 'ArrowUp') move(1, 0); // 위쪽 = 위층(앞·옆) · 뒷줄(위)
    else if (key === 'ArrowDown') move(-1, 0);
    else if (key === ' ' || key === 'Enter') toggle(hit.r, hit.c);
    else if (key === 'Backspace' || key === 'Delete') toggle(hit.r, hit.c, false);
    else return;
    event.preventDefault();
  });
  grid.addEventListener('focusin', (event) => {
    const hit = buttons.find((b) => b.el === event.target);
    if (hit) focusAt = [hit.r, hit.c];
  });

  const get = () => cells.map((row) => [...row]);
  paint();
  return {
    el,
    kind,
    get,
    set(next = emptyCells()) {
      cells = next.map((row) => row.map((v) => (v ? 1 : 0)));
      focusAt = [0, 0];
      clearDiff();
      paint();
    },
    lock(value) {
      locked = Boolean(value);
      paint();
    },
    /** 다른 칸에 ✗: extra(더 칠함 — 빗금) · missing(덜 칠함 — 점선 테두리) */
    showDiff(list) {
      clearDiff();
      for (const d of list) at(d.r, d.c).classList.add('is-diff', d.state === 'extra' ? 'is-extra' : 'is-missing');
    },
    clearDiff,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    focus() {
      at(...focusAt).focus({ preventScroll: true });
    },
  };
}

// ── S2: 위에서 본 모양에 수 쓰기 ─────────────────
/**
 * 수 쓰기: 위에서 본 모양의 쌓인 자리(top)에만 수를 쓴다. 칸(48px)을 누르면 그 칸을 고르고 수가 하나씩 올라간다(안 씀 → 1 → 2 → 3 → 1).
 * [내리기] [올리기]는 고른 칸의 수를 하나씩 내리고 올린다(1~3). 키보드: 방향키로 자리 이동(쌓인 자리만), 숫자 1~3은 그 수로,
 * + − 는 올리기·내리기, Space·Enter는 누르기와 같고 Backspace·Delete·0은 지우기.
 * → { el, get() → [줄][칸](안 쓴 자리 0), lock, showWrong([[x, y]]), clearWrong, onChange, focus }
 */
export function createNumberGrid({ ctx, top, title = '위에서 본 모양에 수 쓰기' }) {
  const { h } = ctx;
  let numbers = top.map((row) => row.map(() => 0));
  let locked = false;
  let focusAt = null; // [칸, 줄]
  const listeners = new Set();
  const spots = [];
  const rowEls = [];
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    const row = [];
    for (let x = 0; x < COLS; x += 1) {
      if (top[y][x]) {
        const b = h('button', { type: 'button', class: 'blk-ncell', role: 'gridcell', tabindex: '-1', dataset: { x, y }, onclick: () => press(x, y) }, h('span', { class: 'blk-ncell-n' }));
        spots.push({ x, y, el: b });
        row.push(b);
      } else row.push(h('span', { class: 'blk-ncell is-off', role: 'gridcell', 'aria-label': `${y + 1}줄 ${x + 1}칸, 쌓인 자리가 아니에요` }));
    }
    rowEls.push(h('div', { class: 'blk-pad-row', role: 'row' }, row));
  }
  focusAt = spots.length ? [spots[0].x, spots[0].y] : null;
  const grid = h('div', { class: 'blk-pad-grid blk-ngrid', role: 'grid', 'aria-label': `${title}. 방향키로 자리를 옮기고, 숫자 1부터 3이나 + 와 - 로 수를 써요.` }, rowEls);
  const stepButton = (dir, label, name) => h('button', { type: 'button', class: 'btn btn-small blk-nstep', dataset: { step: dir }, 'aria-label': `고른 자리의 수 ${label}`, title: `고른 자리의 수 ${label}`, onclick: () => step(dir) }, icon(name), h('span', null, label));
  const down = stepButton(-1, '내리기', 'down');
  const up = stepButton(1, '올리기', 'up');
  const el = h('div', { class: 'blk-padbox blk-numbox' },
    h('p', { class: 'blk-pad-title' }, title),
    grid,
    h('span', { class: 'blk-pad-side', 'aria-hidden': 'true' }, '옆'),
    h('span', { class: 'blk-pad-front', 'aria-hidden': 'true' }, '앞'),
    h('div', { class: 'blk-nsteps', role: 'group', 'aria-label': '수 올리고 내리기' }, down, up));
  const spotAt = (x, y) => spots.find((s) => s.x === x && s.y === y);

  function paint() {
    for (const s of spots) {
      const n = numbers[s.y][s.x];
      s.el.firstChild.textContent = n > 0 ? String(n) : '';
      const chosen = focusAt && focusAt[0] === s.x && focusAt[1] === s.y;
      s.el.classList.toggle('is-on', n > 0);
      s.el.classList.toggle('is-chosen', Boolean(chosen));
      s.el.setAttribute('aria-selected', String(Boolean(chosen)));
      s.el.setAttribute('aria-label', `${s.y + 1}줄 ${s.x + 1}칸, ${n > 0 ? `${n}개` : '아직 안 씀'}`);
      s.el.setAttribute('tabindex', chosen ? '0' : '-1');
      s.el.disabled = locked;
    }
    down.disabled = locked || !focusAt;
    up.disabled = locked || !focusAt;
  }
  function clearWrong() {
    for (const s of spots) s.el.classList.remove('is-diff');
  }
  function setValue(x, y, value) {
    if (locked || numbers[y][x] === value) return;
    numbers = numbers.map((row) => [...row]);
    numbers[y][x] = value;
    clearWrong();
    paint();
    ctx.sfx.play('click');
    ctx.feedback.announce(value > 0 ? `${y + 1}줄 ${x + 1}칸에 ${josa(value, '을/를')} 썼어요.` : `${y + 1}줄 ${x + 1}칸의 수를 지웠어요.`);
    for (const fn of listeners) fn({ numbers: get() });
  }
  function press(x, y) {
    focusAt = [x, y];
    const n = numbers[y][x];
    setValue(x, y, n >= MAX_H ? 1 : n + 1);
    paint();
  }
  function step(dir) {
    if (!focusAt || locked) return;
    const [x, y] = focusAt;
    const n = numbers[y][x];
    setValue(x, y, Math.max(1, Math.min(MAX_H, n + dir)));
    paint();
  }
  /** 쌓인 자리 가운데 그 방향으로 가장 가까운 자리로 */
  function move(dx, dy) {
    if (!focusAt) return;
    const [x, y] = focusAt;
    const ahead = spots.filter((s) => (dx ? Math.sign(s.x - x) === dx : Math.sign(s.y - y) === dy));
    if (ahead.length === 0) return;
    const best = ahead.reduce((p, q) => {
      const d = (s) => (dx ? Math.abs(s.x - x) * 10 + Math.abs(s.y - y) : Math.abs(s.y - y) * 10 + Math.abs(s.x - x));
      return d(q) < d(p) ? q : p;
    });
    focusAt = [best.x, best.y];
    paint();
    best.el.focus({ preventScroll: true });
  }
  grid.addEventListener('keydown', (event) => {
    const hit = spots.find((s) => s.el === event.target);
    if (!hit || event.ctrlKey || event.metaKey || event.altKey) return;
    focusAt = [hit.x, hit.y];
    const { key } = event;
    if (key === 'ArrowLeft') move(-1, 0);
    else if (key === 'ArrowRight') move(1, 0);
    else if (key === 'ArrowUp') move(0, 1); // 판의 위쪽 = 뒷줄
    else if (key === 'ArrowDown') move(0, -1);
    else if (/^[1-3]$/.test(key)) setValue(hit.x, hit.y, Number(key));
    else if (key === '+' || key === '=') step(1);
    else if (key === '-' || key === '_') step(-1);
    else if (key === ' ' || key === 'Enter') press(hit.x, hit.y);
    else if (key === 'Backspace' || key === 'Delete' || key === '0') setValue(hit.x, hit.y, 0);
    else return;
    event.preventDefault();
    paint();
  });
  grid.addEventListener('focusin', (event) => {
    const hit = spots.find((s) => s.el === event.target);
    if (hit) {
      focusAt = [hit.x, hit.y];
      paint();
    }
  });

  const get = () => numbers.map((row) => [...row]);
  paint();
  return {
    el,
    get,
    lock(value) {
      locked = Boolean(value);
      paint();
    },
    /** 다른 자리에 ✗ */
    showWrong(list) {
      clearWrong();
      for (const [x, y] of list) spotAt(x, y)?.el.classList.add('is-diff');
    },
    clearWrong,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    focus() {
      if (focusAt) spotAt(...focusAt).el.focus({ preventScroll: true });
    },
  };
}
