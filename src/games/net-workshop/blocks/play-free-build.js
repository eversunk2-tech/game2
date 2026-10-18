/**
 * 쌓기나무 "자유 쌓기" (spec-grade6.md 15-18·15-19, plan-rotate-free.md 5절). 넓은 판에 마음대로 쌓고 돌려 보며 혼자 탐구한다.
 * 점수·별·도장·학습 기록 없음(맞고 틀림이 없는 공간 — 엔진의 자유 단계 free: true). 이 기기에 하나 자동 저장(판 크기마다 열쇠 하나 — 결정 5), 다시 들어오면 이어서.
 *
 * 판(결정 4): 크롬북·태블릿 14×14칸·10층, 휴대폰(화면의 짧은 변 600px 미만) 6×6칸·6층 — 들어갈 때 한 번 정한다(도중에 창을 바꿔도 그대로).
 * 처음 크기: 처음 보기(교과서 방향)에서 판과 3층 높이가 무대에 꽉 차게(block-view.js homeUnitFor). [작게 보기]로 전체.
 *
 * 화면 배치(결정 7 — 사용자 요청 "오른쪽의 패널을 작게 … 세로로 한줄로 … 넓은 보드판은 처음엔 보이지 않다가 선택하면 펼쳐지게"):
 *   왼쪽 재단 매트 = 무대가 매트를 꽉 채운다 + [위][앞][옆](왼쪽 위) + 보기 조작판(오른쪽 위) + 펼치는 칸(왼쪽, [위][앞][옆] 아래 —
 *     차시의 "위에서 본 판"과 같은 자리).
 *   오른쪽 좁은 세로 띠 = 개수 → [쌓기][빼기] → [되돌리기] → [모두 치우기] → [위에서 본 판] → [층별로 벌려 보기] → [위·앞·옆 모양] → [색].
 *   [위에서 본 판](결정 8 "버튼 하나로 묶기"): 누르면 펼치고 다시 누르면 접는다. 판은 앞쪽이 아래로 오게 놓인 모습이고, 넓은 판(14×14)도
 *     네 쪽으로 나누지 않고 작은 칸(약 24px)으로 한눈에 다 보인다(덧붙임 2 — 사용자 "한칸의 크기를 작게 해서 … 한눈에 다 보이게". 펼친 판의 크기는 그대로,
 *     칸이 48px보다 작은 것은 이 판만의 예외). 휴대폰 6×6은 48px 칸.
 *   펼친 동안 판은 칸을 피해 남는 자리 쪽으로 비키고(크기는 그대로, 무대 밖으로 밀어내지 않을 만큼 — placeBoard), 그래서 가려지거나 무대 밖으로 나간 곳은
 *     판 옮기기로 본다(결정 9 "펼쳐서 가려진 부분은 화면을 옆으로 이동해서 볼 수 있도록"): 무대 가장자리의 [◀][▶](태블릿 세로는 [▲][▼]) ·
 *     두 손가락으로 함께 끌기 · Shift+방향키. 돌기의 중심은 그대로 판 가운데이고, 접으면 처음 자리로 돌아온다.
 *   좁은 화면(1000px 이하 — 태블릿 세로·휴대폰): 매트가 위, 띠는 매트 아래 가로 줄(태블릿은 매트가 남는 높이를 다 쓴다). 펼치는 칸의 자리는 폭이 아니라
 *     매트 모양으로(F1b): 세로가 긴 매트는 매트 왼쪽 아래(판이 위로 비킨다), 가로가 긴 매트는 크롬북처럼 왼쪽 위. 휴대폰은 펼치는 칸이 매트 안 흐름에
 *     (조작판 아래 — 판이 비키지 않는다).
 */
import { icon } from '../../../shared/ui/icons.js';
import { count, emptyMap, frontView, sideView, topView } from './blocks.js';
import { createBlockTools } from './block-pad.js';
import { createBlockView, createViewControls, prefersReducedMotion, svgEl } from './block-view.js';

/** 판 크기 (결정 4): 넓은 판 = 알지오매스와 같은 14×14칸(높이 10층은 Plan이 고름), 휴대폰 = 6×6칸·6층 */
export const FREE_BOARDS = Object.freeze({
  wide: Object.freeze({ cols: 14, rows: 14, maxH: 10, compact: true }),
  phone: Object.freeze({ cols: 6, rows: 6, maxH: 6, compact: false }),
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

/** 판 옮기기 한 번(버튼·Shift+방향키)의 거리: 무대 폭(태블릿 세로는 높이)의 30% · 그 움직임 */
const PAN_PART = 0.3;
const PAN_MS = 180;
/** 펼치는 칸의 위아래 여백(blocks.css .blk-free-slot — top 84px · 아래 12px) · 넓은 판의 칸 크기(px) 처음과 가장 작게 */
const SLOT_EDGE = 96;
const CELL_MAX = 24;
const CELL_MIN = 13;
/** 엔진 알림이 기준 요소 안 아래쪽에 뜨는 폭(shared/ui/feedback.js ANCHOR_MEDIA와 같다 — 늦게 받는 묶음이라 값을 옮겨 적는다) · 좁은 화면 알림에 비워 두는 높이 */
const WIDE_TOAST = '(min-width: 901px)';
const TOAST_ROOM = 80;

// ── 저장 ──────────────────────────
/**
 * 이 기기의 저장소: 엔진의 createStorage와 같은 열쇠 모양(edu:<게임 id>:<열쇠>, JSON). 학습 기록이 아니라 [기록 모두 지우기]는 건드리지 않는다 — 새로는 [모두 치우기].
 * 막힌 기기(사생활 보호 모드 등)에서는 그 판 동안만 남는다. (엔진의 storage.js를 이 늦게 받는 묶음에서 가져오면 빌드가 그 파일을
 * 따로 떼어 처음 화면이 받는 파일이 하나 늘어나 — 모든 게임에 — 여기서는 같은 일을 몇 줄로 한다)
 */
function createFreeStore(gameId) {
  const memory = new Map();
  const full = (key) => `edu:${gameId}:${key}`;
  return {
    get(key) {
      try {
        const raw = globalThis.localStorage.getItem(full(key));
        return raw == null ? memory.get(key) ?? null : JSON.parse(raw);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    set(key, value) {
      memory.set(key, value);
      try {
        globalThis.localStorage.setItem(full(key), JSON.stringify(value));
      } catch {
        // 막힌 저장소: 그 판 동안만(memory)
      }
    },
  };
}

// ── 저장 값 (순수) ──────────────────────────
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
  const storage = createFreeStore(ctx.game?.id ?? 'net-workshop');
  const view = createBlockView({ h, cols, rows, maxH, fit: 'home', fitH: FIT_H });
  const controls = createViewControls({ ctx, view });

  // 위에서 본 판: 넓은 판은 작은 칸으로 14×14 전체를 한눈에(덧붙임 2), 휴대폰 6×6은 48px 칸
  const tools = createBlockTools({ ctx, view, cols, rows, maxH, colorful: true, title: '위에서 본 판', compact: board.compact });

  // ── 오른쪽 좁은 띠 ──
  const countText = h('b', null, '0');
  const countBox = h('p', { class: 'blk-free-count', 'aria-live': 'off' }, h('small', null, '쌓기나무'), h('span', null, countText, '개'));
  const stripButton = (cls, iconName, text, onclick, attrs = {}) => h('button', {
    type: 'button',
    class: `btn blk-sbtn ${cls}`,
    ...attrs,
    onclick: (event) => {
      ctx.sfx.play('click');
      onclick(event);
    },
  }, iconName ? h('span', { class: 'btn-ico', 'aria-hidden': 'true' }, icon(iconName)) : null, h('span', { class: 'blk-sbtn-text' }, text));

  // 펼치는 칸(왼쪽): 위에서 본 판 · 위ㆍ앞ㆍ옆 모양 가운데 하나
  const slot = h('div', { class: 'blk-free-slot', id: 'blk-free-slot', hidden: true });
  let open = null; // 펼친 것: 'pad'(위에서 본 판) · 'views'(위·앞·옆 모양)
  // 키보드로 펼치면(Enter·Space — click의 detail이 0) 초점을 펼친 판의 고른 칸으로(F1-4). 마우스·터치로 펼치면 초점은 버튼에 그대로
  const padButton = stripButton('blk-free-pad', 'grid', '위에서 본 판', (event) => {
    toggle('pad');
    if (open === 'pad' && event?.detail === 0) tools.focusPad();
  }, { 'aria-expanded': 'false', 'aria-controls': 'blk-free-slot' });
  const apartButton = stripButton('blk-free-apart', 'layers', '층별로 벌려 보기', () => setApart(!view.isApart()), { 'aria-pressed': 'false' });
  const viewsButton = stripButton('blk-free-views', 'viewfront', '위ㆍ앞ㆍ옆 모양', () => toggle('views'), { 'aria-expanded': 'false', 'aria-controls': 'blk-free-slot' });
  let paint = FREE_COLORS[0];
  const swatch = h('span', { class: 'blk-free-swatch', 'aria-hidden': 'true' });
  const colorName = h('span', null, '');
  const colorButton = h('button', {
    type: 'button',
    class: 'btn blk-sbtn blk-free-color',
    'aria-expanded': 'false',
    'aria-controls': 'blk-free-colors',
    onclick: (event) => {
      ctx.sfx.play('click');
      const opening = colorPop.hidden;
      setColorsOpen(opening);
      // 키보드로 열면 초점을 지금 색으로(F1-4)
      if (opening && event?.detail === 0) colorPop.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
    },
    // [색] 버튼에서도 Escape로 닫는다(F1-4)
    onkeydown: (event) => {
      if (event.key !== 'Escape' || colorPop.hidden) return;
      event.preventDefault();
      setColorsOpen(false);
    },
  }, swatch, h('span', { class: 'blk-sbtn-text' }, '색 ', colorName));
  const colorPop = h('div', {
    class: 'blk-free-colors',
    id: 'blk-free-colors',
    hidden: true,
    role: 'group',
    'aria-label': '쌓기나무 색 고르기',
    onkeydown: (event) => {
      if (event.key !== 'Escape') return;
      setColorsOpen(false);
      colorButton.focus({ preventScroll: true });
    },
  },
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

  // ── 판 옮기기 버튼 (결정 9): 펼쳐서 판이 가려지거나 무대 밖으로 나간 동안만 보인다. 화살표는 가려진 쪽을 가리킨다("그쪽 보기") ──
  const panButton = (cls) => h('button', {
    type: 'button',
    class: `btn btn-icon blk-free-pan ${cls}`,
    hidden: true,
    onclick: () => {
      ctx.sfx.play('click');
      panBy(cls === 'is-prev' ? -1 : 1, { say: true });
    },
  });
  const panPrev = panButton('is-prev'); // ◀ 판 왼쪽 보기 · ▲ 판 위쪽 보기
  const panNext = panButton('is-next'); // ▶ 판 오른쪽 보기 · ▼ 판 아래쪽 보기

  const { add, remove, undo, clear } = tools.buttons;
  const strip = h('aside', { class: 'blk-free-strip', 'aria-label': '자유 쌓기 도구' },
    countBox,
    h('div', { class: 'blk-free-modes', role: 'group', 'aria-label': '무대와 판을 누르면 할 일' }, add, remove),
    undo,
    clear,
    padButton,
    apartButton,
    viewsButton,
    colorButton);
  const toastMark = h('i', { class: 'blk-free-toastmark', 'aria-hidden': 'true' });
  const mat = h('div', { class: 'mat blk-mat blk-free-mat' }, view.el, controls.dirs, controls.pad, panPrev, panNext, slot, colorPop, toastMark);
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
    const cell = cols > 8 ? 8 : 13; // 휴대폰 6×6: 세 그림이 390px 휴대폰의 매트 한 줄에 들어가게(좁으면 줄바꿈 — blocks.css)
    const fig = (caption, svg) => h('figure', { class: 'blk-figure blk-free-fig' }, svg, h('figcaption', null, caption));
    viewsBox.replaceChildren(
      fig('위', flatPicture({ cells: (r, c) => top[r][c], cols, rows, cell, label: '위에서 본 모양' })),
      fig('앞', flatPicture({ cells: (r, c) => front[c] > r, cols, rows: maxH, cell, label: '앞에서 본 모양', ground: true })),
      fig('옆', flatPicture({ cells: (r, c) => side[c] > r, cols: rows, rows: maxH, cell, label: '옆에서 본 모양', ground: true })),
    );
  }

  // ── 펼치기 · 접기 ──
  /** 무대의 표시: 벌렸을 때 층별 개수 */
  function syncMarks() {
    view.setMarks({ layers: view.isApart() });
  }
  function syncButtons() {
    padButton.setAttribute('aria-expanded', String(open === 'pad'));
    viewsButton.setAttribute('aria-expanded', String(open === 'views'));
  }
  function toggle(id) {
    open = open === id ? null : id;
    setColorsOpen(false);
    if (!open) {
      slot.hidden = true;
      slot.replaceChildren();
    } else if (open === 'views') {
      drawViews();
      slot.replaceChildren(h('div', { class: 'blk-padbox blk-free-viewspanel' }, h('p', { class: 'blk-pad-title' }, '위ㆍ앞ㆍ옆에서 본 모양'), viewsBox));
      slot.hidden = false;
    } else {
      slot.replaceChildren(tools.pad);
      slot.hidden = false;
    }
    syncMarks();
    syncButtons();
    layoutSlot();
    placeBoard();
    placeToast();
  }

  // ── 펼치는 칸의 자리 · 칸 크기 · 알림 자리 (F1b) ──
  /**
   * 펼치는 칸의 자리는 화면 폭이 아니라 매트(무대)의 모양으로 정한다: 가로가 긴 매트는 크롬북처럼 왼쪽 위(판은 옆으로 비키고 옮긴다),
   * 세로가 긴 매트는 세로 태블릿처럼 왼쪽 아래(위아래로). 휴대폰은 칸이 매트 안 흐름에 놓여 상관없다.
   * 낮은 매트(폭 901~1000px 가로 화면 등)에서 14×14 판이 칸 높이를 넘으면 칸을 줄인다(24px부터 — 글자는 12px 아래로 줄이지 않는다)
   */
  function layoutSlot() {
    const { w, h: sh } = view.getSize();
    if (w && sh) mat.classList.toggle('is-tall', sh > w * 0.9);
    slot.style.removeProperty('--free-cell');
    slot.style.removeProperty('--free-cell-font');
    tools.pad.classList.remove('is-low');
    if (!board.compact || open !== 'pad' || slot.hidden || !sh || getComputedStyle(slot).position !== 'absolute') return;
    const room = sh - SLOT_EDGE; // 칸의 max-height(calc(100% − 96px))와 같다
    if (tools.pad.getBoundingClientRect().height <= room) return;
    // 먼저 제목 줄을 감춘다(화면 읽기 이름에는 남는다 — 띠의 [위에서 본 판]이 눌린 모습으로 무엇인지 알린다). 그래도 넘치면 칸을 줄인다
    tools.pad.classList.add('is-low');
    const height = tools.pad.getBoundingClientRect().height;
    if (height <= room) return;
    const cell = Math.max(CELL_MIN, Math.floor(CELL_MAX - (height - room) / rows));
    slot.style.setProperty('--free-cell', `${cell}px`);
    slot.style.setProperty('--free-cell-font', `${Math.max(12, Math.min(13, Math.round(cell * 0.6)))}px`);
  }
  /**
   * 알림 자리(F1-3). 엔진은 넓은 화면(901px 이상)에서 알림을 기준 요소 안 아래쪽에, 좁은 화면에서는 기준 요소 바로 밑에 띄운다.
   * 자유 쌓기는 좁은 화면에서 매트 바로 밑이 띠(버튼)라, 기준을 매트 안의 표시(toastMark)로 한다:
   *   넓은 화면 — 표시 = 매트 아래 끝의 펼친 칸 밖 가로 범위(왼쪽 위에 펼친 칸이 있으면 그 오른쪽) → 알림이 그 범위 안 아래쪽에(펼친 칸·띠를 가리지 않게)
   *   좁은 화면 — 표시 = 무대 아래 끝에서 알림 높이만큼 위 → 알림이 매트 안 아래쪽에
   *   세로가 긴 매트에서 아래에 펼친 칸이 있으면 두 경우 모두 그 칸 위에
   */
  function placeToast() {
    const matBox = mat.getBoundingClientRect();
    const stageBox = view.el.getBoundingClientRect();
    const slotOn = !slot.hidden && getComputedStyle(slot).position === 'absolute';
    const slotBox = slotOn ? slot.getBoundingClientRect() : null;
    const below = slotOn && mat.classList.contains('is-tall');
    let bottom = stageBox.bottom - matBox.top; // 매트 기준 아래 끝
    if (below) bottom = slotBox.top - matBox.top - 8;
    const left = slotOn && !below ? Math.round(slotBox.right - matBox.left + 8) : 0;
    toastMark.style.left = `${left}px`;
    if (globalThis.matchMedia?.(WIDE_TOAST).matches) {
      toastMark.style.top = `${Math.round(bottom)}px`;
      ctx.feedback.anchor?.(toastMark, { lift: below ? 0 : 16, narrow: 'below' });
      return;
    }
    toastMark.style.top = `${Math.max(0, Math.round(bottom - TOAST_ROOM))}px`;
    ctx.feedback.anchor?.(toastMark, { narrow: 'below' });
  }

  // ── 판 비키기 · 옮기기 (결정 9) ──
  // shift: 판을 옮긴 거리(px). axis 'x'(가로 배치 — 칸이 무대 왼쪽, 오른쪽으로 비킨다) · 'y'(태블릿 세로 — 칸이 무대 아래, 위로 비킨다).
  // auto = 펼칠 때 저절로 비킨 거리, [lo, hi] = 학생이 옮길 수 있는 범위(판 한쪽 끝이 무대 끝 ~ 판 다른 끝이 칸 밖), total = 지금 거리
  let shift = { axis: 'x', auto: 0, lo: 0, hi: 0, total: 0, room: null };
  let panRaf = 0;
  const instant = () => prefersReducedMotion() || Boolean(mat.closest('.fx-low'));
  const applyShift = () => view.setShift(shift.axis === 'x' ? shift.total : 0, shift.axis === 'y' ? shift.total : 0);
  const canPan = () => Boolean(open) && shift.room != null && shift.hi - shift.lo > 4;
  const square = (x0, y0, x1, y1, z) => [[x0, y0, z], [x1, y0, z], [x0, y1, z], [x1, y1, z]];
  /** 지금 가장 높이 쌓인 층 수(빈 판이면 0) — 판 옮기기의 위쪽 끝(가장 높은 쌓기나무까지 보이게) */
  const tallest = () => Math.max(0, ...tools.getMap().map((row) => Math.max(0, ...row)));

  /**
   * 펼친 칸을 피해 판을 비킬 거리와 옮길 수 있는 범위를 잰다. keep이면 지금 거리를 그대로 두고 범위만(돌리거나 크게 했을 때 — 판이 저절로 움직이지 않게).
   * 판은 무대 밖으로 밀어내지 않을 만큼만 비킨다 — 그래도 칸에 가린 곳은 판 옮기기로 본다(결정 9).
   */
  function placeBoard({ keep = false } = {}) {
    const { w, h: sh } = view.getSize();
    // keep(돌리기·크게·쌓기 — 끄는 동안 자주 온다)이면 칸의 자리는 지난번 잰 것을 쓴다(화면 배치를 다시 읽지 않는다)
    const reuse = keep && shift.room && shift.room.w === w && shift.room.h === sh;
    const box = reuse ? null : slot.getBoundingClientRect();
    if (!reuse && (!open || slot.hidden || !w || box.width === 0 || getComputedStyle(slot).position !== 'absolute')) {
      cancelAnimationFrame(panRaf);
      panRaf = 0;
      shift = { axis: 'x', auto: 0, lo: 0, hi: 0, total: 0, room: null };
      applyShift();
      syncPan();
      return;
    }
    let pad;
    if (reuse) ({ pad } = shift.room);
    else {
      const stageBox = view.el.getBoundingClientRect();
      pad = { x0: box.left - stageBox.left, x1: box.right - stageBox.left, y0: box.top - stageBox.top, y1: box.bottom - stageBox.top };
    }
    // 칸이 무대 아래쪽(태블릿 세로 — blocks.css가 --free-slot: below로 알린다)이면 판은 위로, 아니면(무대 왼쪽 위) 오른쪽으로 비킨다
    const below = reuse ? shift.axis === 'y' : getComputedStyle(slot).getPropertyValue('--free-slot').trim() === 'below';
    let move = 0;
    {
      const base = view.boxOf(square(0, 0, cols, rows, 0));
      const top = view.boxOf(square(0, 0, cols, rows, FIT_H)).y0;
      const clear = below ? base.x1 <= pad.x0 || base.x0 >= pad.x1 : base.y1 <= pad.y0 || base.y0 >= pad.y1;
      const need = below ? base.y1 + 8 - pad.y0 : pad.x1 + 8 - base.x0;
      const room = below ? top - 6 : w - 6 - base.x1;
      if (!clear) move = Math.max(0, Math.min(need, room)); // 칸과 겹치면 비킨다 — 판을 무대 밖으로 밀어내지 않을 만큼만
    }
    // 옮길 수 있는 범위: 판 전체(바닥 + 가장 높은 쌓기나무)가 칸 밖·무대 안에 다 들어오는 두 끝
    const whole = view.boxOf(square(0, 0, cols, rows, 0));
    const wholeTop = view.boxOf(square(0, 0, cols, rows, tallest())).y0;
    const auto = below ? -Math.max(0, move) : Math.max(0, move);
    const lo = below ? Math.min(auto, -(whole.y1 + 8 - pad.y0)) : Math.min(auto, w - 6 - whole.x1);
    const hi = below ? Math.max(auto, 6 - wholeTop) : Math.max(auto, pad.x1 + 8 - whole.x0);
    const total = keep && shift.room != null && shift.axis === (below ? 'y' : 'x') ? shift.total : auto;
    if (!keep) {
      cancelAnimationFrame(panRaf);
      panRaf = 0;
    }
    shift = { axis: below ? 'y' : 'x', auto, lo, hi, total, room: { pad, w, h: sh } };
    applyShift();
    syncPan();
  }

  /** 판 옮기기 버튼의 자리·이름·꺼짐, 무대의 두 손가락 끌기·Shift+방향키 */
  function syncPan(target = shift.total) {
    const on = canPan();
    panPrev.hidden = !on;
    panNext.hidden = !on;
    view.setPanner(on ? onPan : null);
    if (!on) return;
    const { pad, w, h: sh } = shift.room;
    const x = shift.axis === 'x';
    const set = (button, label, iconName, left, top) => {
      const key = `${label}|${Math.round(left)}|${Math.round(top)}`;
      if (button.dataset.at === key) return; // 끄는 동안 자주 온다: 바뀐 것이 없으면 건드리지 않는다
      button.dataset.at = key;
      button.setAttribute('aria-label', label);
      button.title = label;
      button.replaceChildren(icon(iconName));
      button.style.left = `${Math.round(left)}px`;
      button.style.top = `${Math.round(top)}px`;
    };
    if (x) {
      set(panPrev, '판 왼쪽 보기', 'back', pad.x1 + 8, sh / 2 - 24);
      set(panNext, '판 오른쪽 보기', 'back', w - 12 - 48, sh / 2 - 24);
    } else {
      set(panPrev, '판 위쪽 보기', 'up', w / 2 - 24, 12);
      set(panNext, '판 아래쪽 보기', 'down', pad.x1 + 8, sh - 12 - 48);
    }
    panNext.classList.toggle('is-flip', x); // ▶ = ◀를 좌우로 뒤집은 그림
    setOff(panPrev, target >= shift.hi - 0.5);
    setOff(panNext, target <= shift.lo + 0.5);
  }
  /** 꺼지는 버튼에 초점이 있었으면 다른 쪽 버튼(그것도 꺼지면 무대)으로 */
  function setOff(button, off) {
    if (button.disabled === off) return;
    const focused = off && document.activeElement === button;
    button.disabled = off;
    if (!focused) return;
    const other = button === panPrev ? panNext : panPrev;
    (other.disabled || other.hidden ? view.el : other).focus({ preventScroll: true });
  }
  /** 버튼·Shift+방향키: look −1 = 왼쪽(위쪽) 보기 → 판이 오른쪽(아래)으로, +1 = 오른쪽(아래쪽) 보기 → 판이 왼쪽(위)으로 */
  function panBy(look, { say = false } = {}) {
    if (!canPan()) return;
    const { w, h: sh } = shift.room;
    const step = Math.max(48, Math.round((shift.axis === 'x' ? w : sh) * PAN_PART));
    const from = panRaf ? shift.target ?? shift.total : shift.total; // 움직이는 중에 또 누르면 가던 곳에서 한 번 더
    if (look < 0 ? from >= shift.hi - 0.5 : from <= shift.lo + 0.5) return; // 그쪽 끝(버튼은 꺼져 있다)
    const clamped = look < 0 ? Math.min(shift.hi, from + step) : Math.max(shift.lo, from - step);
    tweenTo(clamped);
    if (say) {
      const side = shift.axis === 'x' ? (look < 0 ? '왼쪽' : '오른쪽') : look < 0 ? '위쪽' : '아래쪽';
      const end = look < 0 ? clamped >= shift.hi - 0.5 : clamped <= shift.lo + 0.5;
      ctx.feedback.announce(`판 ${side}을 보도록 옮겼어요.${end ? ' 끝까지 옮겼어요.' : ''}`);
    }
  }
  function tweenTo(target) {
    cancelAnimationFrame(panRaf);
    panRaf = 0;
    shift.target = target;
    syncPan(target);
    const from = shift.total;
    if (instant() || Math.abs(target - from) < 0.5) {
      shift.total = target;
      applyShift();
      return;
    }
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / PAN_MS);
      shift.total = from + (target - from) * (1 - (1 - p) ** 3);
      applyShift();
      if (p < 1) panRaf = requestAnimationFrame(tick);
      else {
        panRaf = 0;
        shift.total = target;
        applyShift();
      }
    };
    panRaf = requestAnimationFrame(tick);
  }
  /** 무대의 판 옮기기: 두 손가락으로 함께 끌기(손을 따라 판이 움직인다) · Shift+방향키(그쪽 보기) */
  function onPan({ move, look }) {
    if (!canPan()) return;
    if (look) {
      const v = shift.axis === 'x' ? look[0] : look[1];
      if (v) panBy(v, { say: true });
      return;
    }
    cancelAnimationFrame(panRaf);
    panRaf = 0;
    const d = shift.axis === 'x' ? move[0] : move[1];
    const lo = Math.min(shift.lo, shift.total);
    const hi = Math.max(shift.hi, shift.total);
    shift.total = Math.min(hi, Math.max(lo, shift.total + d));
    shift.target = shift.total;
    applyShift();
    syncPan();
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
    if (open) placeBoard({ keep: true }); // 높이가 바뀌면 옮길 수 있는 범위(가장 높은 쌓기나무까지)가 바뀐다
  });
  // 돌리거나 크게 하면 판이 화면에서 차지하는 곳이 바뀐다: 옮길 수 있는 범위만 다시 잰다(판은 저절로 움직이지 않는다)
  const offView = view.on('view', () => {
    if (open) placeBoard({ keep: true });
  });

  const saved = readSaved(storage.get(freeKey(board)), board);
  tools.load(saved?.map ?? emptyMap(cols, rows), saved?.cubes ?? null);
  tools.lock(false);
  setPaint(paint);
  view.setViewEnabled(true);
  view.setLabel(`자유 쌓기 무대. 판은 ${cols}칸 ${rows}줄이고 ${maxH}층까지 쌓을 수 있어요. 옆으로 끌면 판이 돌고, 위아래로 끌면 내려다보는 높이가 바뀌어요.${board.compact ? ' 위에서 본 판을 펼쳐 판이 비키면 Shift와 방향키나 두 손가락으로 판을 옮겨 가려진 곳을 봐요.' : ''}`);
  controls.lock(false);
  showCount();
  // 창 크기가 바뀌면 무대가 먼저 크기를 다시 잰 뒤(block-view의 ResizeObserver) 비킬 거리를 다시 잰다
  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      layoutSlot();
      placeBoard();
      placeToast();
    });
  };
  globalThis.addEventListener('resize', onResize);
  onResize(); // 처음 그린 뒤 매트 모양·알림 자리를 잰다

  return () => {
    globalThis.removeEventListener('resize', onResize);
    cancelAnimationFrame(resizeRaf);
    cancelAnimationFrame(panRaf);
    panRaf = 0;
    offView();
    tools.destroy();
    controls.destroy();
    view.destroy();
  };
}
