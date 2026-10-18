/**
 * 쌓기나무 "자유 쌓기" (spec-grade6.md 15-18·15-19, plan-rotate-free.md 5절). 넓은 판에 마음대로 쌓고 돌려 보며 혼자 탐구한다.
 * 점수·별·도장·학습 기록 없음(맞고 틀림이 없는 공간). 이 기기에 하나 자동 저장(판 크기마다 열쇠 하나 — 결정 5), 다시 들어오면 이어서.
 *
 * 판(결정 4): 크롬북·태블릿 14×14칸·10층, 휴대폰(화면의 짧은 변 600px 미만) 6×6칸·6층 — 들어갈 때 한 번 정한다(도중에 창을 바꿔도 그대로).
 * 처음 크기: 처음 보기(교과서 방향)에서 판과 3층 높이가 무대에 꽉 차게(block-view.js homeUnitFor). [작게 보기]로 전체.
 *
 * 화면 배치(결정 7 — 사용자 요청 "오른쪽의 패널을 작게 … 세로로 한줄로 … 넓은 보드판은 처음엔 보이지 않다가 선택하면 펼쳐지게"):
 *   왼쪽 재단 매트 = 무대가 매트를 꽉 채운다 + [위][앞][옆](왼쪽 위) + 보기 조작판(오른쪽 위) + 펼치는 칸(왼쪽, [위][앞][옆] 아래 —
 *     차시의 "위에서 본 판"과 같은 자리). 펼치면 판이 남는 자리 쪽(오른쪽)으로 비킨다(크기는 그대로).
 *   오른쪽 좁은 세로 띠 = 개수 → [쌓기][빼기] → [되돌리기][모두 치우기] → 위에서 본 판의 네 쪽(판 모양대로 2×2: 앞이 아래)
 *     → [층별로 벌려 보기] → [위·앞·옆 모양] → [색].
 *   좁은 화면(1000px 이하 — 태블릿 세로·휴대폰): 매트가 위, 띠는 매트 아래 가로 줄. 태블릿 세로는 매트가 남는 높이를 다 쓰고 펼치는 칸은 매트 왼쪽 아래
 *     (판이 위로 비킨다), 휴대폰은 펼치는 칸이 매트 안 흐름에(조작판 아래).
 *   펼친 동안 판은 칸을 피해 비키되, 펼친 쪽(7×7)은 늘 칸 옆에 다 보이게 한다(placeBoard).
 */
import { createStorage } from '../../../shared/core/storage.js';
import { icon } from '../../../shared/ui/icons.js';
import { count, emptyMap, frontView, sideView, topView } from './blocks.js';
import { createBlockTools } from './block-pad.js';
import { createBlockView, createViewControls, svgEl } from './block-view.js';

/** 판 크기 (결정 4): 넓은 판 = 알지오매스와 같은 14×14칸(높이 10층은 Plan이 고름), 휴대폰 = 6×6칸·6층 */
export const FREE_BOARDS = Object.freeze({
  wide: Object.freeze({ cols: 14, rows: 14, maxH: 10, quarter: 7 }),
  phone: Object.freeze({ cols: 6, rows: 6, maxH: 6, quarter: 0 }),
});
/** 처음 보기 맞춤의 높이: 판과 3층 높이가 무대에 꽉 차게(결정 4) */
const FIT_H = 3;
/** 화면의 짧은 변이 600px 미만이면 휴대폰 판 */
export const boardFor = (width, height) => (Math.min(width, height) < 600 ? FREE_BOARDS.phone : FREE_BOARDS.wide);
/** 저장 열쇠: 판 크기마다 하나 */
export const freeKey = (board) => `free-${board.cols}x${board.rows}`;

/** 색 고르기(결정 6): 색 이름을 함께 쓴다(색만으로 구분하지 않는다) */
export const FREE_COLORS = Object.freeze([
  { token: '--face-1', name: '노랑' },
  { token: '--face-2', name: '파랑' },
  { token: '--face-3', name: '초록' },
  { token: '--face-4', name: '분홍' },
  { token: '--face-5', name: '보라' },
]);

/** 위에서 본 판의 네 쪽(14×14 → 7×7 넷). 버튼은 판 모양대로 놓는다: 뒤 두 쪽이 위, 앞 두 쪽이 아래 */
const QUARTERS = Object.freeze([
  { id: 'lb', name: '왼쪽 뒤', short: ['왼쪽', '뒤'], x: 0, y: 1 },
  { id: 'rb', name: '오른쪽 뒤', short: ['오른쪽', '뒤'], x: 1, y: 1 },
  { id: 'lf', name: '왼쪽 앞', short: ['왼쪽', '앞'], x: 0, y: 0 },
  { id: 'rf', name: '오른쪽 앞', short: ['오른쪽', '앞'], x: 1, y: 0 },
]);

// ── 저장 (순수) ──────────────────────────
/** 저장 값 → { map, cubes } (모양이 맞지 않으면 null — 빈 판으로 시작) */
export function readSaved(raw, board) {
  if (!raw || raw.v !== 1 || !Array.isArray(raw.h) || raw.h.length !== board.rows) return null;
  const map = emptyMap(board.cols, board.rows);
  const cubes = map.map((row) => row.map(() => []));
  for (let y = 0; y < board.rows; y += 1) {
    const row = raw.h[y];
    if (!Array.isArray(row) || row.length !== board.cols) return null;
    for (let x = 0; x < board.cols; x += 1) {
      const v = row[x];
      if (!Number.isInteger(v) || v < 0 || v > board.maxH) return null;
      map[y][x] = v;
      const digits = String(raw.c?.[y]?.[x] ?? '');
      for (let z = 0; z < v; z += 1) cubes[y][x].push(FREE_COLORS[Number(digits[z]) - 1]?.token ?? FREE_COLORS[0].token);
    }
  }
  return { map, cubes };
}
/** { map, cubes } → 저장 값 (14×14·10층을 다 채워도 수 KB) */
export function toSaved(map, cubes) {
  const digit = (token) => String(Math.max(1, FREE_COLORS.findIndex((c) => c.token === token) + 1));
  return { v: 1, h: map.map((row) => [...row]), c: cubes.map((row) => row.map((list) => list.map(digit).join(''))) };
}

// ── 위·앞·옆에서 본 모양 (작은 모눈 그림) ──────────
function flatPicture({ cells, cols, rows, cell, label, ground }) {
  const pad = 2;
  const w = cols * cell + pad * 2;
  const hh = rows * cell + pad * 2 + (ground ? 3 : 0);
  const svg = svgEl('svg', { class: 'blk-free-flat', width: w, height: hh, viewBox: `0 0 ${w} ${hh}`, role: 'img', 'aria-label': label, focusable: 'false' });
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      svg.append(svgEl('rect', { class: `blk-grid-cell${cells(r, c) ? ' is-on' : ''}`, x: pad + c * cell, y: pad + (rows - 1 - r) * cell, width: cell, height: cell }));
    }
  }
  if (ground) svg.append(svgEl('path', { class: 'blk-flat-ground', d: `M1 ${pad + rows * cell + 1.5}H${cols * cell + pad * 2 - 1}` }));
  return svg;
}

export function playFreeBuild(stage, ctx) {
  const { h } = ctx;
  const board = boardFor(globalThis.innerWidth ?? 1366, globalThis.innerHeight ?? 768);
  const { cols, rows, maxH } = board;
  const storage = createStorage('net-workshop');
  const view = createBlockView({ h, cols, rows, maxH, fit: 'home', fitH: FIT_H });
  const controls = createViewControls({ ctx, view });
  const tools = createBlockTools({ ctx, view, cols, rows, maxH, colorful: true, title: '위에서 본 판' });

  // ── 오른쪽 좁은 띠 ──
  const countText = h('b', null, '0');
  const countBox = h('p', { class: 'blk-free-count', 'aria-live': 'off' }, h('small', null, '쌓기나무'), h('span', null, countText, '개'));
  const stripButton = (cls, iconName, text, onclick, attrs = {}) => h('button', {
    type: 'button',
    class: `btn blk-sbtn ${cls}`,
    ...attrs,
    onclick: () => {
      ctx.sfx.play('click');
      onclick();
    },
  }, iconName ? h('span', { class: 'btn-ico', 'aria-hidden': 'true' }, icon(iconName)) : null, h('span', { class: 'blk-sbtn-text' }, text));

  // 펼치는 칸(왼쪽): 위에서 본 판의 한 쪽 · 위·앞·옆 모양 가운데 하나
  const slot = h('div', { class: 'blk-free-slot', hidden: true });
  let open = null; // 펼친 것: 쪽 id · 'all'(6×6 판 전체) · 'views'
  const quarterButtons = new Map();

  const quarterIcon = (q) => {
    const svg = svgEl('svg', { class: 'blk-quad-icon', viewBox: '0 0 22 22', 'aria-hidden': 'true', focusable: 'false' });
    for (const yy of [1, 0]) for (const xx of [0, 1]) svg.append(svgEl('rect', { x: 2 + xx * 9.5, y: 2 + (1 - yy) * 9.5, width: 8.5, height: 8.5, rx: 1.5, class: xx === q.x && yy === q.y ? 'is-on' : '' }));
    return svg;
  };
  let quarterBox = null;
  let padButton = null;
  if (board.quarter) {
    quarterBox = h('div', { class: 'blk-free-quads', role: 'group', 'aria-label': '위에서 본 판 펼치기 (판을 네 쪽으로 나눔, 앞이 아래)' },
      QUARTERS.map((q) => {
        const b = h('button', {
          type: 'button',
          class: 'btn blk-quad',
          dataset: { quarter: q.id },
          'aria-expanded': 'false',
          'aria-label': `위에서 본 판 ${q.name} 펼치기`,
          title: `위에서 본 판 ${q.name}`,
          onclick: () => {
            ctx.sfx.play('click');
            toggle(q.id);
          },
        }, quarterIcon(q), h('span', { class: 'blk-quad-text' }, q.short[0], h('br'), q.short[1]));
        quarterButtons.set(q.id, b);
        return b;
      }));
  } else {
    padButton = stripButton('blk-free-pad', 'grid', '위에서 본 판', () => toggle('all'), { 'aria-expanded': 'false' });
  }

  const apartButton = stripButton('blk-free-apart', 'layers', '층별로 벌려 보기', () => setApart(!view.isApart()), { 'aria-pressed': 'false' });
  const viewsButton = stripButton('blk-free-views', 'viewfront', '위·앞·옆 모양', () => toggle('views'), { 'aria-expanded': 'false' });
  let paint = FREE_COLORS[0];
  const swatch = h('span', { class: 'blk-free-swatch', 'aria-hidden': 'true' });
  const colorName = h('span', null, '');
  const colorButton = h('button', {
    type: 'button',
    class: 'btn blk-sbtn blk-free-color',
    'aria-expanded': 'false',
    onclick: () => {
      ctx.sfx.play('click');
      setColorsOpen(colorPop.hidden);
    },
  }, swatch, h('span', { class: 'blk-sbtn-text' }, '색 ', colorName));
  const colorPop = h('div', { class: 'blk-free-colors', hidden: true, role: 'group', 'aria-label': '쌓기나무 색 고르기' },
    FREE_COLORS.map((c) => h('button', {
      type: 'button',
      class: 'btn blk-color',
      dataset: { token: c.token },
      'aria-pressed': 'false',
      onclick: () => {
        ctx.sfx.play('click');
        setPaint(c);
        setColorsOpen(false);
        colorButton.focus({ preventScroll: true });
      },
    }, h('span', { class: 'blk-free-swatch', style: { background: `var(${c.token})` }, 'aria-hidden': 'true' }), h('span', null, c.name))));

  const { add, remove, undo, clear } = tools.buttons;
  const strip = h('aside', { class: 'blk-free-strip', 'aria-label': '자유 쌓기 도구' },
    countBox,
    h('div', { class: 'blk-free-modes', role: 'group', 'aria-label': '무대와 판을 누르면 할 일' }, add, remove),
    undo,
    clear,
    quarterBox ?? padButton,
    apartButton,
    viewsButton,
    colorButton);
  const mat = h('div', { class: 'mat blk-mat blk-free-mat' }, view.el, controls.dirs, controls.pad, slot, colorPop);
  ctx.el.append(h('div', { class: 'workbench blk-bench blk-free' }, mat, strip));
  ctx.feedback.anchor?.(mat, { lift: 16, narrow: 'below' });
  // 휴대폰(560px 이하 — 무대가 매트 안 흐름에 놓인다)에서 무대의 높이를 판에 맞춘다: 처음 보기 맞춤이 너비로 정해지게(block-view.js homeUnitFor와 같은 비)
  const R6 = 1 / Math.sqrt(6);
  mat.style.setProperty('--free-ratio', `${((cols + rows) * Math.SQRT1_2 + 0.6).toFixed(3)} / ${((cols + rows) * R6 + 3 * 2 * R6 + 0.8).toFixed(3)}`);

  // ── 위·앞·옆 모양 ──
  const viewsBox = h('div', { class: 'blk-free-viewsbox' });
  function drawViews() {
    const map = tools.getMap();
    const top = topView(map);
    const front = frontView(map);
    const side = sideView(map);
    const cell = cols > 8 ? 8 : 18;
    const fig = (caption, svg) => h('figure', { class: 'blk-figure blk-free-fig' }, svg, h('figcaption', null, caption));
    viewsBox.replaceChildren(
      fig('위', flatPicture({ cells: (r, c) => top[r][c], cols, rows, cell, label: '위에서 본 모양' })),
      fig('앞', flatPicture({ cells: (r, c) => front[c] > r, cols, rows: maxH, cell, label: '앞에서 본 모양', ground: true })),
      fig('옆', flatPicture({ cells: (r, c) => side[c] > r, cols: rows, rows: maxH, cell, label: '옆에서 본 모양', ground: true })),
    );
  }

  // ── 펼치기 · 접기 ──
  function quarterBoxOf(id) {
    const q = QUARTERS.find((item) => item.id === id);
    const n = board.quarter;
    return { x0: q.x * n, y0: q.y * n, w: n, h: n, name: q.name };
  }
  /** 무대의 표시: 벌렸을 때 층별 개수, 펼친 쪽의 칸(벌리지 않았을 때 — 판에 옅은 파랑) */
  function syncMarks() {
    const q = open && open !== 'views' && open !== 'all' && !view.isApart() ? quarterBoxOf(open) : null;
    view.setMarks({ layers: view.isApart(), region: q ? { x0: q.x0, y0: q.y0, x1: q.x0 + q.w - 1, y1: q.y0 + q.h - 1 } : null });
  }
  function syncButtons() {
    for (const [id, b] of quarterButtons) b.setAttribute('aria-expanded', String(open === id));
    padButton?.setAttribute('aria-expanded', String(open === 'all'));
    viewsButton.setAttribute('aria-expanded', String(open === 'views'));
  }
  /**
   * 펼친 칸을 피해 판을 남는 자리 쪽으로 비킨다(크기는 그대로). 칸이 무대 왼쪽 위에 있으면(가로 배치) 오른쪽으로, 아래에 있으면(태블릿 세로) 위로.
   * 판 전체는 무대 밖으로 밀어내지 않을 만큼만 비키고, 펼친 쪽(7×7)은 그보다 더 비켜서라도 칸 옆에 다 보이게 한다(나머지 판 끝이 무대 밖으로 조금 나갈 수 있다).
   * 펼친 동안 돌리거나 크게 해도 비킨 거리는 그대로다(판이 저절로 움직이지 않게). 쪽을 바꾸거나 벌리거나 창 크기가 바뀌면 다시 잰다.
   */
  function placeBoard() {
    const { w, h: sh } = view.getSize();
    const box = slot.getBoundingClientRect();
    if (!open || slot.hidden || !w || box.width === 0 || getComputedStyle(slot).position !== 'absolute') {
      view.setShift(0, 0);
      return;
    }
    const stage = view.el.getBoundingClientRect();
    const pad = { x0: box.left - stage.left, x1: box.right - stage.left, y0: box.top - stage.top, y1: box.bottom - stage.top };
    const square = (x0, y0, x1, y1, z) => [[x0, y0, z], [x1, y0, z], [x0, y1, z], [x1, y1, z]];
    const q = open !== 'views' && open !== 'all' ? quarterBoxOf(open) : null;
    const parts = [[0, 0, cols, rows], ...(q ? [[q.x0, q.y0, q.x0 + q.w, q.y0 + q.h]] : [])];
    const below = pad.y0 > sh / 2; // 칸이 무대 아래쪽(태블릿 세로)
    let move = 0;
    for (const [x0, y0, x1, y1] of parts) {
      const base = view.boxOf(square(x0, y0, x1, y1, 0));
      const top = view.boxOf(square(x0, y0, x1, y1, FIT_H)).y0; // 맞춤 높이(3층)까지
      const apartOf = below ? base.x1 <= pad.x0 || base.x0 >= pad.x1 : base.y1 <= pad.y0 || base.y0 >= pad.y1;
      if (apartOf) continue; // 칸과 겹치지 않는다
      const need = below ? base.y1 + 8 - pad.y0 : pad.x1 + 8 - base.x0;
      const room = below ? top - 6 : w - 6 - base.x1;
      move = Math.max(move, Math.min(need, room)); // 판 전체: 무대 안에 남을 만큼만 · 펼친 쪽: 그 쪽이 무대 안에 남을 만큼까지
    }
    view.setShift(below ? 0 : Math.max(0, move), below ? -Math.max(0, move) : 0);
  }
  function toggle(id) {
    open = open === id ? null : id;
    setColorsOpen(false);
    if (!open) {
      slot.hidden = true;
      slot.replaceChildren();
    } else if (open === 'views') {
      drawViews();
      slot.replaceChildren(h('div', { class: 'blk-padbox blk-free-viewspanel' }, h('p', { class: 'blk-pad-title' }, '위·앞·옆에서 본 모양'), viewsBox));
      slot.hidden = false;
    } else {
      if (board.quarter) {
        const q = quarterBoxOf(open);
        tools.setWindow({ x0: q.x0, y0: q.y0, w: q.w, h: q.h }, { onEdge: (x, y) => openQuarterAt(x, y) });
        tools.setTitle(`위에서 본 판 · ${q.name}`);
      }
      slot.replaceChildren(tools.pad);
      slot.hidden = false;
    }
    syncMarks();
    syncButtons();
    placeBoard();
  }
  /** 방향키로 쪽 밖의 칸으로 가면 그 칸이 든 쪽을 펼친다 */
  function openQuarterAt(x, y) {
    const n = board.quarter;
    const q = QUARTERS.find((item) => item.x === Math.floor(x / n) && item.y === Math.floor(y / n));
    if (q && open !== q.id) toggle(q.id);
  }

  function setApart(value) {
    view.setApart(value);
    syncMarks();
    placeBoard(); // 벌리면 판이 작아진다 — 펼친 칸을 피하는 거리를 다시 잰다
    apartButton.setAttribute('aria-pressed', String(value));
    apartButton.querySelector('.blk-sbtn-text').textContent = value ? '다시 모으기' : '층별로 벌려 보기';
    ctx.feedback.announce(value ? '층별로 벌렸어요.' : '다시 모았어요.');
  }

  function setPaint(c) {
    paint = c;
    tools.setPaint(c.token);
    swatch.style.background = `var(${c.token})`;
    colorName.textContent = c.name;
    colorButton.setAttribute('aria-label', `쌓기나무 색 고르기, 지금 ${c.name}`);
    for (const b of colorPop.children) b.setAttribute('aria-pressed', String(b.dataset.token === c.token));
  }
  function setColorsOpen(value) {
    colorPop.hidden = !value;
    colorButton.setAttribute('aria-expanded', String(value));
  }

  function save() {
    storage.set(freeKey(board), toSaved(tools.getMap(), tools.getCubes()));
  }
  function showCount() {
    countText.textContent = String(count(tools.getMap()));
  }
  tools.onChange(() => {
    showCount();
    save();
    if (open === 'views') drawViews();
    if (view.isApart()) syncMarks();
  });

  const saved = readSaved(storage.get(freeKey(board)), board);
  tools.load(saved?.map ?? emptyMap(cols, rows), saved?.cubes ?? null);
  tools.lock(false);
  setPaint(paint);
  view.setViewEnabled(true);
  view.setLabel(`자유 쌓기 무대. 판은 ${cols}칸 ${rows}줄이고 ${maxH}층까지 쌓을 수 있어요. 옆으로 끌면 판이 돌고, 위아래로 끌면 내려다보는 높이가 바뀌어요.`);
  controls.lock(false);
  showCount();
  const onResize = () => placeBoard();
  globalThis.addEventListener('resize', onResize);

  return () => {
    globalThis.removeEventListener('resize', onResize);
    tools.destroy();
    controls.destroy();
    view.destroy();
  };
}
