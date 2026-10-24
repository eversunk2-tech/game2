/**
 * 자석 판 (전개도 완성하기 prism-free — spec-grade6 15-30 · 15-31 "B 자석처럼 붙기"): 직육면체 "내 맘대로 직육면체 전개도"(free-board.js
 * createRectBoard)와 같은 조작을 칸 없는 판에서 한다.
 *   - 놓기: 카드를 판으로 끌기 · 카드 누르고 판 누르기. 면을 끌어 옮기기 · 면 누르고 판 누르기. 빼기: 면을 카드 칸으로 끌기 · 면 누르고 카드 칸 누르기
 *   - 자석: 놓은 자리 가까이(면이 1 cm 안만 움직이고, 방향이 15° 안) 놓인 면의 빈 모서리가 있으면 그 모서리에 맞닿게 붙는다 — 길이가 달라도
 *     붙는다(15-31 덧붙임 — 가운데 · 양 끝 가운데 덜 움직이는 맞춤). 맞는 자리인지 · 길이가 맞는지와 상관없이 같은 모습 · 소리 · 안내로 붙는다
 *     (접어 보고 안다 — 정답을 알려 주지 않는다). 가까운 모서리가 없으면 놓은 자리에 그대로.
 *     놓인 면과 펼친 그림에서 겹치거나 판 밖이면 놓이지 않는다(제자리 + 주문서 안내 줄).
 *   - 돌리기 30°씩: 고른 면 · 카드의 ↻ 손잡이(잡고 돌리기 — 놓으면 가까운 30°로 · 누르기만 하면 30°), 고른 면 한 번 더 누르기, [돌리기], R 키,
 *     끄는 중에 R · 마우스 오른쪽 버튼 · 다른 손가락으로 톡. 돌린 면도 가까운 모서리가 있으면(길이가 달라도) 그 방향으로 맞춰 붙는다.
 *     놓인 면을 한 번 눌러 돌릴 때 그 각에 놓을 수 없으면(붙은 면은 30°만 돌려도 이웃 면에 걸린다) 30°씩 더 돌려 놓을 수 있는 첫 모습으로.
 *   - 키보드: 카드에서 Enter → 판에 그 카드가 들림(빈 판이면 가운데, 놓인 면이 있으면 자석 자리 하나) → ←→로 자석 자리 바꾸기 · ↑↓로 다음 모서리 ·
 *     R로 붙는 변 바꾸기(빈 판에서는 30° 돌리기 · 방향키로 옮기기) · Enter로 놓기 · Esc로 그만두기. 판에서(들린 것 없이) 방향키로 놓인 면 고르기 · Enter로 들기(옮기기) ·
 *     R 돌리기 · Delete 빼기 · Ctrl+Z 되돌리기.
 * 끄는 동안 · 들고 있는 동안에는 놓일 모양을 점선으로 미리 보인다(놓을 수 없으면 벽돌색).
 */
import { josa } from '../../../shared/core/korean.js';
import { enableDragDrop } from '../../../shared/ui/drag-drop.js';
import { icon } from '../../../shared/ui/icons.js';
import { LABELS } from '../fold.js';
import { centroid } from '../geometry.js';
import {
  TURN_STEP,
  canPlace,
  cardName,
  edgeLengthOf,
  freeEdges,
  magnetSpots,
  placeBoardLabels,
  posePoly,
  rootCardId,
  settlePoly,
  turnPoly,
} from './prism-free-logic.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  return el;
};
const cm = (v) => `${Math.round(v * 100) / 100} cm`;
export const faceFill = (label) => `var(--face-${(Math.max(0, LABELS.indexOf(label)) % 8) + 1})`;
const CARD_ART = 42; // 카드 그림에서 가장 긴 카드의 지름(px)
const HANDLE = 48; // 돌리기 손잡이(px)
const TURN_START = 8; // 손잡이를 이만큼(px) 움직여야 잡고 돌리기 — 그 전에 떼면 누르기(30°)
const MAX_UNDO = 60;
const KEY_STEP = 0.5; // 빈 판에서 키보드로 옮기는 거리(cm)
const pointsAttr = (pts) => pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');

/** 카드 그림: 카드를 deg° 돌린 모습(놓으면 이 모습으로 놓인다) */
function cardArt(card, deg, k) {
  const pts = turnPoly(card.poly, deg, [0, 0]);
  const xs = pts.map((v) => v[0]);
  const ys = pts.map((v) => v[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const pad = 3;
  const svg = svgEl('svg', {
    class: 'pf-card-art',
    width: ((Math.max(...xs) - x0) * k + 2 * pad).toFixed(1),
    height: ((Math.max(...ys) - y0) * k + 2 * pad).toFixed(1),
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const shape = svgEl('polygon', { points: pointsAttr(pts.map(([x, y]) => [(x - x0) * k + pad, (y - y0) * k + pad])), class: 'pf-card-face' });
  shape.style.fill = faceFill(card.label);
  svg.append(shape);
  return svg;
}

/**
 * @param {object} p
 * @param {object} p.ctx          단계 ctx (h · feedback · sfx)
 * @param {HTMLElement} p.root    끌어다 놓기의 뿌리(작업대 — 판과 카드 칸을 함께 품는다. .has-selection · .is-dragging-any가 붙는다)
 * @param {HTMLElement} p.host    판을 그릴 곳(.free-host — 무대와 같은 자리)
 * @param {Array} p.cards         면 카드 한 벌 (prism-free-logic.js freeCards)
 * @param {{w:number,h:number}} p.size  판의 크기(cm)
 * @param {Function} p.area       판으로 쓸 곳 () => { left, top, width, height } (host 기준 px)
 * @param {Function} [p.onChange] 놓인 면이 바뀌면 (message)
 * @param {Function} [p.onRefuse] 놓이지 않을 때 (text)
 */
export function createMagnetBoard({ ctx, root, host, cards, size, area, onChange = null, onRefuse = null }) {
  const { h } = ctx;
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const groups = [...new Set(cards.map((c) => c.group))];
  const maxDim = Math.max(...cards.map((c) => Math.max(...c.poly.map((p) => Math.hypot(p[0], p[1]))) * 2));
  const artK = CARD_ART / maxDim;
  let placed = new Map(); // 카드 id → 모양(cm)
  let turns = new Map(groups.map((g) => [g, 0])); // 카드 칸 카드의 돌림(30° 몇 번)
  const history = [];
  let view = { unit: 20, origin: [0, 0], W: 0, H: 0 };
  let enabled = true;
  let last = null; // 마지막으로 놓거나 옮긴 면 ([돌리기]가 가리키는 면)
  let held = null; // 키보드로 든 것: { kind: 'card' | 'tile', id, spots, index, at, deg }
  let focusId = null; // 키보드로 고른 놓인 면
  let press = null; // { kind, id, pointer, x, y, grab([cm, cm]), dragged }
  let dragTurns = 0;
  let lastPoint = null;
  let tapPoint = null;
  let justDropped = false;
  let ghostHome = null;
  let turning = null; // 손잡이로 돌리는 중
  let detached = new Set(); // 떨어진 면(가장 큰 덩어리 밖 — 직육면체 자유 배치처럼 점선 테두리와 "떨어짐")

  // ── DOM ─────────────────────────────
  const tileLayer = h('div', { class: 'pf-tiles' });
  const frame = h('div', { class: 'pf-mboard-frame dnd-target', dataset: { board: '1' } }, tileLayer);
  const overlay = svgEl('svg', { class: 'pf-overlay', 'aria-hidden': 'true', focusable: 'false' });
  const marks = h('div', { class: 'pf-marks', 'aria-hidden': 'true' });
  const makeHandle = (where) => h('button', { type: 'button', class: `turn-handle pf-turn-handle turn-handle-${where}`, hidden: true, dataset: { where }, 'aria-label': '30° 돌리기' }, icon('rotr'));
  const boardHandle = makeHandle('board');
  const trayHandle = makeHandle('tray');
  const boardEl = h('div', {
    class: 'pf-mboard',
    role: 'group',
    tabindex: '0',
    'aria-roledescription': '전개도 놓는 판',
    'aria-label': '전개도 놓는 판. Enter로 카드 칸 맨 앞 카드를 들고(카드에서 Enter도 돼요), 방향키로 자리를 고르고 Enter로 놓아요. 놓인 면은 방향키로 골라요. R 키는 돌리기, Delete는 빼기예요.',
  }, frame, overlay, marks, boardHandle);
  host.prepend(boardEl);

  const tileEls = new Map();
  const cardEls = new Map(groups.map((g) => [g, h('button', { type: 'button', class: 'tray-card pf-card dnd-item', dataset: { group: g }, 'aria-pressed': 'false' })]));
  const trayEl = h('div', { class: 'tray-cards pf-cards dnd-target', dataset: { tray: '1' }, 'aria-label': '면 카드 칸' }, [...cardEls.values()], trayHandle);

  // ── 상태 ────────────────────────────
  const remainingIn = (g) => cards.filter((c) => c.group === g && !placed.has(c.id));
  const others = (id) => [...placed].filter(([k]) => k !== id).map(([k, poly]) => ({ id: k, poly }));
  const asFaces = () => cards.filter((c) => placed.has(c.id)).map((c) => ({ id: c.id, role: c.role, label: c.label, poly: placed.get(c.id).map((p) => [...p]) }));
  const selectedTile = () => frame.querySelector('.pf-tile.is-selected')?.dataset.face ?? null;
  const selectedGroup = () => {
    const g = trayEl.querySelector('.pf-card.is-selected')?.dataset.group ?? null;
    return g && remainingIn(g).length > 0 ? g : null;
  };
  const dragging = () => Boolean(press?.dragged && root.classList.contains('is-dragging-any'));
  const nameOf = (id) => `${cardById.get(id).label} 면`;
  const labelOfFace = (id) => cardById.get(id)?.label ?? '';

  function snapshot() {
    return { placed: new Map([...placed].map(([k, v]) => [k, v.map((p) => [...p])])), turns: new Map(turns) };
  }
  function emit(message) {
    if (onChange) onChange(message);
    else if (message) ctx.feedback.announce(message);
  }
  function refuse(text) {
    ctx.sfx.play('click');
    if (onRefuse) onRefuse(text);
    else ctx.feedback.announce(text);
  }
  function commit(next, message, id) {
    history.push(snapshot());
    if (history.length > MAX_UNDO) history.shift();
    placed = next;
    if (id) last = placed.has(id) ? id : last;
    if (last && !placed.has(last)) last = null;
    ctx.sfx.play('click');
    render();
    emit(message);
  }
  
  /** 모양 poly(cm)로 그 카드를 놓거나 옮긴다 — 자석으로 정하고 놓을 수 없으면 제자리 */
  function settle(id, poly, verb) {
    const card = cardById.get(id);
    const result = settlePoly(card, poly, others(id), size);
    if (!result) {
      refuse(`그 자리에는 놓을 수 없어요. 다른 면과 겹치거나 판 밖이에요.`);
      render();
      return false;
    }
    const next = new Map(placed);
    next.set(id, result.poly);
    const where = result.snap ? `, ${labelOfFace(result.snap.face)} 면의 모서리에 붙었어요` : '';
    commit(next, `${josa(nameOf(id), '을/를')} ${verb}${where}.`, id);
    return true;
  }
  /** 카드 묶음 g의 맨 앞 카드를 가운데 at(cm)에, 카드 칸에서 돌려 둔 대로(+ 끄는 중에 돌린 만큼) 놓는다 */
  function placeCard(g, at, extraTurns = 0) {
    if (!enabled) return false;
    const card = remainingIn(g)[0];
    if (!card) return false;
    const deg = ((turns.get(g) + extraTurns) % 12) * TURN_STEP;
    return settle(card.id, posePoly(card, deg, at), '놓았어요');
  }
  /** 놓인 면을 가운데 at(cm)으로 옮긴다(끄는 중에 돌렸으면 돌린 대로) */
  function moveFace(id, at, extraTurns = 0) {
    if (!enabled || !placed.has(id)) return false;
    const now = placed.get(id);
    const c = centroid(now);
    const turned = extraTurns ? turnPoly(now, extraTurns * TURN_STEP, c) : now;
    return settle(id, turned.map(([x, y]) => [x - c[0] + at[0], y - c[1] + at[1]]), '옮겼어요');
  }
  /** 카드 칸 맨 앞 카드(남은 것 가운데 첫 묶음) */
  const frontGroup = () => groups.find((g) => remainingIn(g).length > 0) ?? null;
  /** 빈 판 누르기: 카드 칸 맨 앞 카드를 그 자리를 가운데로, 카드 칸에서 돌려 둔 대로 놓는다(직육면체의 빈 칸 누르기와 같은 뜻 — G2r-2) */
  function placeNext(at) {
    const g = frontGroup();
    if (!g) {
      ctx.feedback.announce(`면 ${cards.length}장을 모두 놓았어요. 옮기려면 놓인 면을 끌거나 눌러 골라요.`);
      return false;
    }
    return placeCard(g, at);
  }
  function removeFace(id) {
    if (!enabled || !placed.has(id)) return false;
    const next = new Map(placed);
    next.delete(id);
    if (focusId === id) focusId = null;
    commit(next, `${josa(nameOf(id), '을/를')} 카드 칸으로 뺐어요.`, null);
    return true;
  }
  /**
   * 놓인 면을 30° × k 돌린다(가운데를 축으로) — 가까운 모서리가 있으면 그 방향으로 맞춰 붙는다(길이가 달라도).
   * 한 번 누르기([돌리기] · R · 두 번 누르기)는 그 각에 놓을 수 없으면(붙은 면은 30°만 돌려도 이웃 면에 걸린다) 같은 쪽으로 30°씩 더 돌려
   * 놓을 수 있는 첫 모습으로 — 누를 때마다 다른 모습이 된다. 손잡이로 돌린 각(exact)은 그 각만
   */
  function rotateFace(id, k = 1, { exact = false } = {}) {
    if (!enabled || !placed.has(id) || k % 12 === 0) return false;
    const card = cardById.get(id);
    const steps = exact ? [k] : Array.from({ length: 11 }, (_, i) => k * (i + 1)).filter((t) => t % 12 !== 0);
    for (const t of steps) {
      const result = settlePoly(card, turnPoly(placed.get(id), t * TURN_STEP), others(id), size);
      if (!result) continue;
      const next = new Map(placed);
      next.set(id, result.poly);
      commit(next, `${josa(nameOf(id), '을/를')} 돌렸어요${result.snap ? `. ${labelOfFace(result.snap.face)} 면의 모서리에 붙었어요` : ''}.`, id);
      return true;
    }
    refuse('돌리면 다른 면과 겹치거나 판 밖이라 돌릴 수 없어요. 조금 옮긴 뒤 돌려 봐요.');
    return false;
  }
  function turnCard(g, k = 1) {
    if (!enabled || !g || remainingIn(g).length === 0) return false;
    turns.set(g, (((turns.get(g) + k) % 12) + 12) % 12);
    ctx.sfx.play('click');
    renderCards();
    placeHandles();
    ctx.feedback.announce(`${remainingIn(g)[0].label} 면 카드를 돌렸어요. ${turns.get(g) * TURN_STEP}°.`);
    return true;
  }
  /** [돌리기] · R: 든 것 → 고른 면 · 카드 → 키보드로 고른 면 → 마지막에 놓은 면 */
  function rotate() {
    if (!enabled) return false;
    if (held) return heldTurn();
    const tile = selectedTile();
    if (tile) return rotateFace(tile);
    const g = selectedGroup();
    if (g) return turnCard(g);
    const id = focusId ?? last;
    return id ? rotateFace(id) : false;
  }
  function clearAll() {
    if (!enabled || placed.size === 0) return;
    held = null;
    focusId = null;
    commit(new Map(), '놓은 면을 모두 카드 칸으로 뺐어요.', null);
  }
  function undo() {
    if (!enabled || history.length === 0) return false;
    const prev = history.pop();
    placed = prev.placed;
    turns = prev.turns;
    held = null;
    if (focusId && !placed.has(focusId)) focusId = null;
    ctx.sfx.play('click');
    render();
    emit('하나 되돌렸어요.');
    return true;
  }

  // ── 판의 크기 · 그리기 ──────────────────
  function fit() {
    const box = area();
    const unit = Math.max(4, Math.min(box.width / size.w, box.height / size.h));
    const W = size.w * unit;
    const H = size.h * unit;
    view = { unit, origin: [box.left + (box.width - W) / 2, box.top + (box.height - H) / 2], W, H };
    Object.assign(boardEl.style, { left: `${view.origin[0]}px`, top: `${view.origin[1]}px`, width: `${W}px`, height: `${H}px` });
    overlay.setAttribute('width', String(W));
    overlay.setAttribute('height', String(H));
  }
  const px = ([x, y]) => [x * view.unit, y * view.unit];
  /** 화면 점(client px) → 판의 cm */
  function toCm(clientX, clientY) {
    const r = frame.getBoundingClientRect();
    return [(clientX - r.left) / view.unit, (clientY - r.top) / view.unit];
  }

  function renderCards() {
    for (const [g, el] of cardEls) {
      const left = remainingIn(g);
      const top = left[0] ?? cards.find((c) => c.group === g);
      const used = left.length === 0;
      el.classList.toggle('dnd-item', !used && enabled);
      el.classList.toggle('is-used', used);
      el.disabled = used || !enabled;
      if (used && el.classList.contains('is-selected')) dnd.clearSelection();
      el.style.setProperty('--face-color', faceFill(top.label));
      el.dataset.turn = String(turns.get(g));
      const sizeText = top.role === 'side' ? `${top.w}×${top.h} cm` : '밑면';
      el.replaceChildren(...[
        h('span', { class: 'pf-card-label', 'aria-hidden': 'true' }, top.label),
        cardArt(top, turns.get(g) * TURN_STEP, artK),
        h('span', { class: 'size-text', 'aria-hidden': 'true' }, sizeText),
        left.length > 1 ? h('span', { class: 'pf-card-count', 'aria-hidden': 'true' }, `×${left.length}`) : null,
        used ? icon('check', { class: 'used-check' }) : null,
      ].filter(Boolean));
      el.setAttribute('aria-label', used ? `${top.label} 면 카드, 놓았어요` : `${cardName(top)}${left.length > 1 ? `, 같은 카드 ${left.length}장` : ''}${turns.get(g) ? `, ${turns.get(g) * TURN_STEP}° 돌림` : ''}`);
    }
  }

  function render() {
    fit();
    // 놓인 면: 면마다 끌 수 있는 조각(둘레 상자 + clip-path로 모양만 누를 수 있게)
    for (const [id, el] of tileEls) {
      if (!placed.has(id)) {
        el.remove();
        tileEls.delete(id);
      }
    }
    for (const c of cards) {
      if (!placed.has(c.id)) continue;
      const pts = placed.get(c.id).map(px);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const local = pts.map(([x, y]) => [x - x0, y - y0]);
      let el = tileEls.get(c.id);
      if (!el) {
        el = h('div', { class: 'pf-tile dnd-item', dataset: { face: c.id }, 'aria-pressed': 'false', role: 'button' });
        tileEls.set(c.id, el);
        tileLayer.append(el);
      }
      el.classList.toggle('dnd-item', enabled);
      el.classList.toggle('is-key', c.id === focusId && !held);
      el.classList.toggle('is-held', held?.kind === 'tile' && held.id === c.id);
      Object.assign(el.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px`, clipPath: `polygon(${local.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(', ')})` });
      el.setAttribute('aria-label', `${cardName(c)}, 놓인 면`);
      const svg = svgEl('svg', { width: (x1 - x0).toFixed(2), height: (y1 - y0).toFixed(2), 'aria-hidden': 'true', focusable: 'false' });
      const shape = svgEl('polygon', { points: pointsAttr(local), class: 'pf-face', 'data-face': c.id });
      shape.style.fill = faceFill(c.label);
      svg.append(shape);
      el.replaceChildren(svg);
    }
    // 변: 맞닿은 곳(경첩)은 점선 — 한 번만, 빈 모서리(자르는 곳)는 실선
    overlay.replaceChildren();
    const faces = asFaces();
    const free = freeEdges(faces);
    const isFree = (id, i) => free.some((e) => e.face === id && e.edge === i);
    const drawn = [];
    for (const f of faces) {
      f.poly.forEach((p, i) => {
        const q = f.poly[(i + 1) % f.poly.length];
        const [a, b] = [px(p), px(q)];
        const open = isFree(f.id, i);
        if (!open && drawn.some(([c, d]) => (Math.hypot(c[0] - b[0], c[1] - b[1]) < 0.5 && Math.hypot(d[0] - a[0], d[1] - a[1]) < 0.5) || (Math.hypot(c[0] - a[0], c[1] - a[1]) < 0.5 && Math.hypot(d[0] - b[0], d[1] - b[1]) < 0.5))) return;
        drawn.push([a, b]);
        overlay.append(svgEl('line', { x1: a[0].toFixed(2), y1: a[1].toFixed(2), x2: b[0].toFixed(2), y2: b[1].toFixed(2), class: open ? 'pf-cut' : 'pf-fold' }));
      });
    }
    // 떨어진 면: 점선 테두리
    for (const f of faces) if (detached.has(f.id)) overlay.append(svgEl('polygon', { points: pointsAttr(f.poly.map(px)), class: 'pf-apart' }));
    // 고른 면 · 키보드로 고른 면의 테두리
    const sel = selectedTile() ?? (held ? null : focusId);
    if (sel && placed.has(sel)) overlay.append(svgEl('polygon', { points: pointsAttr(placed.get(sel).map(px)), class: `pf-outline${sel === focusId && !selectedTile() ? ' is-key' : ''}` }));
    renderLabels(faces, free);
    if (held) showHeld();
    renderCards();
    placeHandles();
    const names = faces.map((f) => `${f.label} 면`).join(', ');
    boardEl.setAttribute('aria-description', faces.length ? `놓인 면 ${faces.length}장: ${names}` : '빈 판');
  }

  /** 면 이름과 빈 모서리의 길이 — 서로 겹치지 않고 면 안에 드는 자리에(placeBoardLabels) */
  function renderLabels(faces, free) {
    marks.replaceChildren();
    // 떨어진 면의 이름에는 "떨어짐"을 붙인다(들지 않으면 이름만 — 점선 테두리는 늘 있다)
    const nameEls = faces.map((f) => ({
      id: f.id,
      variants: [...(detached.has(f.id) ? ['apart', 'apart-small'] : []), 'name', 'name-small'].map((variant) => ({
        variant,
        el: h('span', { class: `pf-face-label${variant.endsWith('small') ? ' is-small' : ''}` }, f.label, variant.startsWith('apart') ? h('span', { class: 'pf-apart-tag' }, '떨어짐') : null),
      })),
    }));
    const lenEls = free.map((e) => {
      const value = edgeLengthOf(faces.find((f) => f.id === e.face).poly, e.edge);
      const texts = [cm(value), String(Math.round(value * 100) / 100)].map((text) => ({ text, el: h('span', { class: 'pf-len' }, text) }));
      return { key: `${e.face}:${e.edge}`, face: e.face, p: px(e.p), q: px(e.q), open: true, texts };
    });
    const trial = [...nameEls.flatMap((n) => n.variants), ...lenEls.flatMap((l) => l.texts)];
    for (const v of trial) {
      v.el.style.visibility = 'hidden';
      marks.append(v.el);
    }
    const sizeOf = (el, guess) => (el.offsetWidth > 0 ? { w: el.offsetWidth, h: el.offsetHeight } : guess);
    const spots = placeBoardLabels(faces.map((f) => ({
      id: f.id,
      poly: f.poly.map(px),
      lens: lenEls.filter((l) => l.face === f.id).map((l) => ({ key: l.key, p: l.p, q: l.q, open: l.open, texts: l.texts.map((t) => ({ text: t.text, ...sizeOf(t.el, { w: t.text.length * 7.2 + 8, h: 16 }) })) })),
      names: nameEls.find((n) => n.id === f.id).variants.map((v) => ({ variant: v.variant, ...sizeOf(v.el, { w: v.variant.endsWith('small') ? 16 : 22, h: v.variant.endsWith('small') ? 17 : 22 }) })),
    })));
    for (const l of lenEls) {
      const s = spots.lens.get(l.key);
      for (const t of l.texts) {
        if (!s || t.text !== s.text) t.el.remove();
        else Object.assign(t.el.style, { visibility: '', left: `${s.x}px`, top: `${s.y}px`, transform: `translate(-50%, -50%) rotate(${s.deg}deg)` });
      }
    }
    for (const n of nameEls) {
      const s = spots.names.get(n.id);
      for (const v of n.variants) {
        if (!s || v.variant !== s.variant) v.el.remove();
        else Object.assign(v.el.style, { visibility: '', left: `${s.x}px`, top: `${s.y}px` });
      }
      // 떨어진 면인데 "떨어짐"이 면 안에 들지 않으면(작은 면): 직육면체처럼 면 아래(판 아래 끝이면 위)에 단다(review-prism-g2r G2r-6)
      if (detached.has(n.id) && !s?.variant.startsWith('apart')) {
        const pts = faces.find((f) => f.id === n.id).poly.map(px);
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const tag = h('span', { class: 'pf-apart-tag is-outside' }, '떨어짐');
        marks.append(tag);
        const [tw, th] = [tag.offsetWidth || 44, tag.offsetHeight || 18];
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        let top = Math.max(...ys) + 3;
        if (top + th > view.H) top = Math.min(...ys) - 3 - th;
        Object.assign(tag.style, { left: `${Math.max(0, Math.min(view.W - tw, cx - tw / 2)).toFixed(1)}px`, top: `${Math.max(0, top).toFixed(1)}px` });
      }
    }
  }

  // ── 미리 보기 (끄는 중 · 키보드로 든 것) ──────────
  let previewEl = null;
  function showPreview(poly, ok) {
    hidePreview();
    previewEl = svgEl('polygon', { points: pointsAttr(poly.map(px)), class: `pf-preview${ok ? '' : ' is-bad'}` });
    overlay.append(previewEl);
  }
  function hidePreview() {
    previewEl?.remove();
    previewEl = null;
  }
  /** 끄는 중의 모양: 놓인 면은 집은 자리 그대로, 카드는 가운데가 포인터에 */
  function dragPoly(clientX, clientY) {
    if (!press) return null;
    const at = toCm(clientX, clientY);
    if (press.kind === 'tile') {
      const now = placed.get(press.id);
      if (!now) return null;
      const c = centroid(now);
      const center = [at[0] - press.grab[0], at[1] - press.grab[1]];
      const turned = dragTurns ? turnPoly(now, dragTurns * TURN_STEP, c) : now;
      return { id: press.id, poly: turned.map(([x, y]) => [x - c[0] + center[0], y - c[1] + center[1]]) };
    }
    const card = remainingIn(press.id)[0];
    if (!card) return null;
    return { id: card.id, poly: posePoly(card, ((turns.get(press.id) + dragTurns) % 12) * TURN_STEP, at) };
  }
  function showDragPreview(clientX, clientY) {
    const r = frame.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
      hidePreview();
      return;
    }
    const d = dragPoly(clientX, clientY);
    if (!d) return;
    const result = settlePoly(cardById.get(d.id), d.poly, others(d.id), size);
    showPreview(result ? result.poly : d.poly, Boolean(result));
  }

  // ── 마우스 · 터치: 엔진 끌어다 놓기 + 판 누르기 + 고른 면 다시 누르기(돌리기) ─────
  const dnd = enableDragDrop({
    root,
    itemSelector: '.pf-tile.dnd-item, .pf-card.dnd-item',
    targetSelector: '.pf-mboard-frame, .pf-cards',
    onDrop(itemEl, targetEl) {
      justDropped = true;
      setTimeout(() => {
        justDropped = false;
      }, 0);
      const isTile = itemEl.classList.contains('pf-tile');
      const key = isTile ? itemEl.dataset.face : itemEl.dataset.group;
      const dragged = Boolean(press?.dragged && press.id === key);
      const extra = dragged ? dragTurns : 0;
      dragTurns = 0;
      hidePreview();
      if (targetEl.dataset.tray) {
        if (isTile) return removeFace(key);
        render();
        return false;
      }
      const point = dragged ? lastPoint : tapPoint;
      if (!point) return false;
      const at = toCm(point[0], point[1]);
      if (isTile) {
        const center = dragged ? [at[0] - press.grab[0], at[1] - press.grab[1]] : at;
        return moveFace(key, center, extra);
      }
      return placeCard(key, at, extra);
    },
  });

  function onPressCapture(event) {
    if (dragging() && event.pointerId !== press.pointer) return; // 끄는 중 다른 손가락(돌리기)
    justDropped = false;
    dragTurns = 0;
    if (event.target instanceof Element && frame.contains(event.target)) tapPoint = [event.clientX, event.clientY];
    const el = event.target instanceof Element ? event.target.closest('.pf-tile, .pf-card') : null;
    press = null;
    if (!el || !root.contains(el)) return;
    if (el.classList.contains('pf-tile')) {
      const id = el.dataset.face;
      const c = centroid(placed.get(id));
      const at = toCm(event.clientX, event.clientY);
      press = { kind: 'tile', id, pointer: event.pointerId, x: event.clientX, y: event.clientY, grab: [at[0] - c[0], at[1] - c[1]], dragged: false };
    } else press = { kind: 'card', id: el.dataset.group, pointer: event.pointerId, x: event.clientX, y: event.clientY, grab: [0, 0], dragged: false };
  }
  root.addEventListener('pointerdown', onPressCapture, true);

  function onClickCapture(event) {
    if (!enabled || justDropped) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.turn-handle')) return;
    // 고른 면을 한 번 더 누르면 30° 돌리고 내려놓는다(면 두 번 누르기)
    const tile = target?.closest('.pf-tile');
    if (tile && frame.contains(tile) && tile.classList.contains('is-selected')) {
      event.stopPropagation();
      dnd.clearSelection();
      rotateFace(tile.dataset.face);
      return;
    }
    // 고른 것 없이 빈 판을 누르면(직육면체의 빈 칸 누르기처럼 — G2r-2): 카드 칸 맨 앞 카드가 그 자리에 놓인다(가까운 모서리면 자석).
    // 키보드로 든 것이 있으면 그것을 그 자리에(끌어 놓기와 같이 놓은 그대로 자석). 고른 카드 · 면을 놓는 것은 끌기 엔진(onDrop)이 한다
    if (target && frame.contains(target) && !tile && !root.classList.contains('has-selection')) {
      event.stopPropagation();
      focusId = null;
      const at = toCm(event.clientX, event.clientY);
      if (held) {
        const h0 = held;
        held = null;
        hidePreview();
        if (h0.kind === 'card') placeCard(h0.key, at, ((h0.deg / TURN_STEP - turns.get(h0.key)) % 12 + 12) % 12);
        else moveFace(h0.id, at, (h0.deg / TURN_STEP) % 12);
        return;
      }
      placeNext(at);
    }
  }
  root.addEventListener('click', onClickCapture, true);

  function onMove(event) {
    if (!enabled || turning) return;
    if (press && event.pointerId === press.pointer && !press.dragged && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8) press.dragged = true;
    if (dragging() && event.pointerId === press.pointer) {
      lastPoint = [event.clientX, event.clientY];
      showDragPreview(event.clientX, event.clientY);
    }
  }
  window.addEventListener('pointermove', onMove);
  const onRelease = (event) => {
    if (press && event.pointerId !== press.pointer && dragging()) return;
    if (press && event.pointerId === press.pointer) restoreGhost();
    if (!held) hidePreview();
  };
  window.addEventListener('pointerup', onRelease);
  window.addEventListener('pointercancel', onRelease);

  // ── 끄는 중 돌리기: R · 마우스 오른쪽 버튼 · 다른 손가락으로 톡 (직육면체와 같은 손짓) ─────
  const ghostEl = () => [...document.querySelectorAll('body > .dnd-ghost')].filter((g) => !g.classList.contains('is-returning')).at(-1) ?? null;
  function turnGhost() {
    const ghost = ghostEl();
    const art = ghost?.querySelector('svg');
    if (!art) return;
    if (!ghostHome) ghostHome = { art, transform: art.style.transform, origin: art.style.transformOrigin };
    art.style.transformOrigin = '50% 50%';
    art.style.transform = `rotate(${dragTurns * TURN_STEP}deg)`;
  }
  function restoreGhost() {
    if (!ghostHome) return;
    if (ghostHome.art.isConnected) {
      ghostHome.art.style.transform = ghostHome.transform;
      ghostHome.art.style.transformOrigin = ghostHome.origin;
    }
    ghostHome = null;
  }
  function turnWhileDragging() {
    if (!enabled || !dragging()) return false;
    dragTurns = (dragTurns + 1) % 12;
    turnGhost();
    if (lastPoint) showDragPreview(lastPoint[0], lastPoint[1]);
    ctx.sfx.play('click');
    ctx.feedback.announce(`끄는 면을 돌렸어요. ${dragTurns * TURN_STEP}°.`);
    return true;
  }
  function onKeyTurn(event) {
    if (!dragging() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== 'r' && event.key !== 'R' && event.key !== 'ㄱ') return;
    event.preventDefault();
    event.stopPropagation();
    turnWhileDragging();
  }
  window.addEventListener('keydown', onKeyTurn, true);
  let menuUntil = 0;
  /** 끄는 중에 누른 오른쪽 버튼: 한 번 누름에 한 번(마우스 이벤트만 센다 — 30°씩이라 빠르게 여러 번 눌러도 하나도 빠뜨리지 않게) */
  function rightPress(event) {
    if (!dragging()) return;
    event.preventDefault?.();
    menuUntil = performance.now() + 1500; // 오른쪽 버튼을 뗄 때 뜨는 메뉴도 막는다
    turnWhileDragging();
  }
  const onMouseDown = (event) => {
    if (event.button === 2) rightPress(event);
  };
  const onContextMenu = (event) => {
    if (dragging() || performance.now() < menuUntil) event.preventDefault();
  };
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('contextmenu', onContextMenu, true);
  const tapIds = new Set();
  function onOtherPointer(event) {
    if (event.pointerType !== 'touch' || !dragging() || event.pointerId === press.pointer) return;
    event.preventDefault();
    tapIds.add(event.pointerId);
    turnWhileDragging();
  }
  window.addEventListener('pointerdown', onOtherPointer, true);
  function onOtherClick(event) {
    if (!tapIds.has(event.pointerId) && !dragging()) return;
    tapIds.delete(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }
  window.addEventListener('click', onOtherClick, true);
  const forgetTap = (event) => {
    if (!tapIds.has(event.pointerId)) return;
    setTimeout(() => tapIds.delete(event.pointerId), 400);
  };
  window.addEventListener('pointerup', forgetTap, true);

  let afterTimer = null;
  const onClickAfter = () => {
    placeHandles();
    clearTimeout(afterTimer);
    afterTimer = setTimeout(() => {
      render();
      emit(null);
    }, 0);
  };
  root.addEventListener('click', onClickAfter);

  // ── 돌리기 손잡이 ─────────────────────────
  function handleTarget() {
    if (!enabled || root.classList.contains('is-dragging-any')) return null;
    const tile = selectedTile();
    if (tile && placed.has(tile)) return { where: 'board', id: tile };
    const g = selectedGroup();
    return g ? { where: 'tray', id: g } : null;
  }
  function placeHandles() {
    const target = turning ? { where: turning.where, id: turning.id } : handleTarget();
    for (const handle of [boardHandle, trayHandle]) {
      const on = Boolean(target && target.where === handle.dataset.where);
      handle.hidden = !on;
      if (!on || turning) continue;
      if (handle === boardHandle) {
        // 면의 꼭짓점 가운데 판의 가운데에서 가장 먼 쪽 바깥(판 안으로 당김)
        const pts = placed.get(target.id).map(px);
        const c = centroid(pts);
        const far = pts.reduce((best, p) => (Math.hypot(p[0] - c[0], p[1] - c[1]) - p[1] * 0.05 > Math.hypot(best[0] - c[0], best[1] - c[1]) - best[1] * 0.05 ? p : best), pts[0]);
        const d = [far[0] - c[0], far[1] - c[1]];
        const len = Math.hypot(...d) || 1;
        const x = far[0] + (d[0] / len) * 26 - HANDLE / 2;
        const y = far[1] + (d[1] / len) * 26 - HANDLE / 2;
        handle.style.left = `${Math.max(0, Math.min(view.W - HANDLE, x))}px`;
        handle.style.top = `${Math.max(0, Math.min(view.H - HANDLE, y))}px`;
      } else {
        const card = cardEls.get(target.id);
        const tb = trayEl.getBoundingClientRect();
        const cb = card.getBoundingClientRect();
        handle.style.left = `${Math.max(0, Math.min(tb.width - HANDLE, cb.right - tb.left - HANDLE * 0.7))}px`;
        handle.style.top = `${Math.max(0, cb.top - tb.top - HANDLE * 0.3)}px`;
      }
    }
  }
  // 잡고 돌리기(마우스 · 터치): 직육면체 자유 배치(free-board.js)와 같은 짜임 — 창에서 움직임을 따라가고, 누른 동안의 touchmove는 막아(화면이 쓸리거나
  // 관성 스크롤이 돌지 않게) 뗀 뒤 첫 누르기가 먹히게. 누르기만 하면 뒤따르는 click이 30° 돌린다
  let swallowHandleClick = false;
  function onHandleDown(event) {
    const handle = event.currentTarget;
    if (!enabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const target = handleTarget();
    if (!target || target.where !== handle.dataset.where) return;
    swallowHandleClick = false;
    event.stopPropagation(); // 끌기 엔진 · 판이 이 누르기를 면 고르기 · 끌기로 받지 않게
    let el;
    let cx;
    let cy;
    if (target.where === 'board') {
      el = tileEls.get(target.id);
      const c = centroid(placed.get(target.id));
      const r = frame.getBoundingClientRect();
      [cx, cy] = [r.left + c[0] * view.unit, r.top + c[1] * view.unit];
      const t = el.getBoundingClientRect();
      el.style.transformOrigin = `${(cx - t.left).toFixed(2)}px ${(cy - t.top).toFixed(2)}px`;
    } else {
      el = cardEls.get(target.id).querySelector('.pf-card-art');
      const b = el.getBoundingClientRect();
      [cx, cy] = [b.left + b.width / 2, b.top + b.height / 2];
    }
    turning = {
      ...target, pointer: event.pointerId, x0: event.clientX, y0: event.clientY, cx, cy, a0: Math.atan2(event.clientY - cy, event.clientX - cx),
      active: false, deg: 0, el, handle, hx: handle.offsetLeft + HANDLE / 2, hy: handle.offsetTop + HANDLE / 2,
    };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // 포인터를 잡지 못해도 창의 움직임으로 따라간다
    }
    window.addEventListener('pointermove', onHandleMove);
    window.addEventListener('pointerup', onHandleUp);
    window.addEventListener('pointercancel', onHandleCancel);
    window.addEventListener('touchmove', onHandleTouch, { passive: false });
  }
  function onHandleTouch(event) {
    if (turning && event.cancelable) event.preventDefault();
  }
  function onHandleMove(event) {
    if (!turning || event.pointerId !== turning.pointer) return;
    if (!turning.active) {
      if (Math.hypot(event.clientX - turning.x0, event.clientY - turning.y0) < TURN_START) return;
      turning.active = true;
      root.classList.add('is-turning-face');
      if (turning.where === 'board') boardEl.classList.add('is-turning'); // 도는 면의 테두리 · 판의 글은 잠깐 숨긴다(놓으면 다시)
    }
    event.preventDefault();
    let deg = ((Math.atan2(event.clientY - turning.cy, event.clientX - turning.cx) - turning.a0) * 180) / Math.PI;
    deg = ((deg % 360) + 540) % 360 - 180;
    turning.deg = deg;
    turning.el.style.rotate = `${deg.toFixed(2)}deg`;
    if (turning.where === 'board') {
      // 놓으면 가까운 30°로 맞춰진다 — 그 모습(붙을 모서리가 있으면 붙은 모습)을 점선으로, 놓을 수 없으면 벽돌색
      const k = Math.round(deg / TURN_STEP);
      const now = placed.get(turning.id);
      const result = k % 12 === 0 ? { poly: now } : settlePoly(cardById.get(turning.id), turnPoly(now, k * TURN_STEP), others(turning.id), size);
      showPreview(result ? result.poly : turnPoly(now, k * TURN_STEP), Boolean(result));
    }
    // 손잡이도 면의 가운데를 축으로 따라 돈다
    const box = turning.handle.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const [hx, hy] = [box.left + turning.hx - turning.cx, box.top + turning.hy - turning.cy];
    const rad = (deg * Math.PI) / 180;
    const [rx, ry] = [hx * Math.cos(rad) - hy * Math.sin(rad), hx * Math.sin(rad) + hy * Math.cos(rad)];
    turning.handle.style.left = `${turning.cx + rx - box.left - HANDLE / 2}px`;
    turning.handle.style.top = `${turning.cy + ry - box.top - HANDLE / 2}px`;
  }
  function endTurning() {
    window.removeEventListener('pointermove', onHandleMove);
    window.removeEventListener('pointerup', onHandleUp);
    window.removeEventListener('pointercancel', onHandleCancel);
    window.removeEventListener('touchmove', onHandleTouch);
    root.classList.remove('is-turning-face');
    boardEl.classList.remove('is-turning');
    const t = turning;
    turning = null;
    if (t) {
      t.el.style.rotate = '';
      t.el.style.transformOrigin = '';
    }
    hidePreview();
    return t;
  }
  function onHandleUp(event) {
    if (!turning || event.pointerId !== turning.pointer) return;
    const t = endTurning();
    if (!t.active) {
      placeHandles();
      return; // 누르기만 했다: 뒤따르는 click이 30° 돌린다
    }
    swallowHandleClick = true; // 돌린 뒤 따라오는 click은 한 번 막는다(새로 누르면 풀린다)
    setTimeout(() => {
      swallowHandleClick = false;
    }, 0);
    const k = Math.round(t.deg / TURN_STEP);
    if (t.where === 'board') {
      if (k % 12 !== 0) rotateFace(t.id, k, { exact: true });
      else render();
    } else if (k % 12 !== 0) turnCard(t.id, k);
    else renderCards();
    placeHandles();
  }
  function onHandleCancel(event) {
    if (!turning || event.pointerId !== turning.pointer) return;
    endTurning();
    render();
  }
  function onHandleClick(event) {
    event.stopPropagation(); // 판 · 카드 칸(놓을 곳)이 이 누르기를 받지 않게
    event.preventDefault();
    if (swallowHandleClick) {
      swallowHandleClick = false;
      return;
    }
    const target = handleTarget();
    if (!target || target.where !== event.currentTarget.dataset.where) return;
    if (target.where === 'board') rotateFace(target.id, 1);
    else turnCard(target.id, 1);
  }
  function onHandleKey(event) {
    const target = handleTarget();
    if (!target || target.where !== event.currentTarget.dataset.where) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      const k = event.key === 'ArrowLeft' ? -1 : 1;
      if (target.where === 'board') rotateFace(target.id, k);
      else turnCard(target.id, k);
    } else if (event.key === 'Escape') {
      // 고르기를 풀고 초점을 그 면(판) · 카드로 돌려보낸다
      event.preventDefault();
      event.stopPropagation();
      dnd.clearSelection();
      if (target.where === 'tray') {
        render();
        cardEls.get(target.id).focus({ preventScroll: true });
      } else {
        focusId = target.id;
        render();
        boardEl.focus({ preventScroll: true });
      }
    }
  }
  for (const handle of [boardHandle, trayHandle]) {
    handle.addEventListener('pointerdown', onHandleDown);
    handle.addEventListener('keydown', onHandleKey);
    handle.addEventListener('click', onHandleClick);
  }

  // ── 키보드 ───────────────────────────
  const centerAt = () => [size.w / 2, size.h / 2];
  /** 키보드로 들기: 카드(묶음의 맨 앞) 또는 놓인 면. 놓인 다른 면이 있으면 자석 자리를 고르고, 없으면 판 가운데 */
  function startHold(kind, key) {
    if (!enabled) return;
    const id = kind === 'card' ? remainingIn(key)[0]?.id : key;
    if (!id) return;
    const card = cardById.get(id);
    const rest = others(id);
    const spots = rest.length ? magnetSpots(card, rest, size) : [];
    const deg = kind === 'card' ? turns.get(key) * TURN_STEP : 0;
    held = { kind, key, id, spots, index: 0, at: kind === 'tile' ? centroid(placed.get(id)) : centerAt(), deg, base: kind === 'tile' ? placed.get(id) : null };
    focusId = kind === 'tile' ? id : focusId;
    dnd.clearSelection();
    render();
    boardEl.focus({ preventScroll: true });
    ctx.feedback.announce(`${josa(nameOf(id), '을/를')} 들었어요. ${heldText()}`);
  }
  /** 들고 있는 것의 지금 모양: 자석 자리(있으면) 또는 자유 자리 */
  function heldPoly() {
    if (!held) return null;
    if (held.spots.length) return held.spots[held.index].poly;
    const card = cardById.get(held.id);
    if (held.kind === 'tile') {
      const c = centroid(held.base);
      const turned = held.deg ? turnPoly(held.base, held.deg, c) : held.base;
      return turned.map(([x, y]) => [x - c[0] + held.at[0], y - c[1] + held.at[1]]);
    }
    return posePoly(card, held.deg, held.at);
  }
  function heldText() {
    if (!held) return '';
    if (held.spots.length) {
      const s = held.spots[held.index];
      return `붙일 자리 ${held.index + 1} / ${held.spots.length}: ${labelOfFace(s.face)} 면의 모서리. 좌우 방향키로 자리, 위아래로 다른 모서리, R로 돌리기, Enter로 놓아요.`;
    }
    return '방향키로 옮기고 R로 돌리고 Enter로 놓아요.';
  }
  function showHeld() {
    const poly = heldPoly();
    if (!poly) return;
    const ok = held.spots.length ? true : canPlace(poly, others(held.id), size);
    showPreview(poly, ok);
  }
  function heldTurn() {
    if (!held) return false;
    if (held.spots.length) {
      // 같은 모서리에 다른 변으로 붙는 자리(돌린 모습)로
      const now = held.spots[held.index];
      const same = held.spots.map((s, i) => ({ s, i })).filter(({ s }) => s.face === now.face && s.edge === now.edge);
      if (same.length < 2) {
        ctx.feedback.announce('이 모서리에는 다른 방향으로 붙지 않아요.');
        return false;
      }
      const pos = same.findIndex(({ i }) => i === held.index);
      held.index = same[(pos + 1) % same.length].i;
    } else held.deg = (held.deg + TURN_STEP) % 360;
    ctx.sfx.play('click');
    render();
    ctx.feedback.announce(`돌렸어요. ${heldText()}`);
    return true;
  }
  function dropHeld() {
    if (!held) return;
    const h0 = held;
    const poly = heldPoly();
    held = null;
    hidePreview();
    const ok = h0.spots.length ? (() => {
      const next = new Map(placed);
      next.set(h0.id, poly);
      commit(next, `${josa(nameOf(h0.id), '을/를')} ${h0.kind === 'card' ? '놓았어요' : '옮겼어요'}, ${labelOfFace(h0.spots[h0.index].face)} 면의 모서리에 붙었어요.`, h0.id);
      return true;
    })() : settle(h0.id, poly, h0.kind === 'card' ? '놓았어요' : '옮겼어요');
    if (!ok) {
      held = h0;
      render();
      return;
    }
    if (h0.kind === 'card') turns.set(h0.key, turns.get(h0.key));
    focusId = h0.id;
    render();
    boardEl.focus({ preventScroll: true });
  }
  function cancelHeld() {
    if (!held) return;
    const h0 = held;
    held = null;
    hidePreview();
    render();
    if (h0.kind === 'card') cardEls.get(h0.key)?.focus({ preventScroll: true });
    ctx.feedback.announce('그만두었어요.');
  }
  function onBoardKey(event) {
    if (!enabled) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return; // Ctrl+Z(되돌리기)는 단계 화면이 받는다
    const key = event.key;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (held) {
      if (arrows[key]) {
        event.preventDefault();
        if (held.spots.length) {
          const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
          if (key === 'ArrowLeft' || key === 'ArrowRight') held.index = (held.index + step + held.spots.length) % held.spots.length;
          else {
            // ↑↓: 다른 모서리의 첫 자리로
            const edgeKey = (s) => `${s.face}:${s.edge}`;
            const keys = [...new Set(held.spots.map(edgeKey))];
            const now = keys.indexOf(edgeKey(held.spots[held.index]));
            const next = keys[(now + step + keys.length) % keys.length];
            held.index = held.spots.findIndex((s) => edgeKey(s) === next);
          }
        } else {
          const [dx, dy] = arrows[key];
          held.at = [Math.max(0, Math.min(size.w, held.at[0] + dx * KEY_STEP)), Math.max(0, Math.min(size.h, held.at[1] + dy * KEY_STEP))];
        }
        render();
        ctx.feedback.announce(heldText());
      } else if (key === 'r' || key === 'R' || key === 'ㄱ') {
        event.preventDefault();
        heldTurn();
      } else if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        dropHeld();
      } else if (key === 'Escape') {
        event.preventDefault();
        cancelHeld();
      }
      return;
    }
    const ids = cards.map((c) => c.id).filter((id) => placed.has(id));
    if (arrows[key] && ids.length) {
      event.preventDefault();
      const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
      const i = focusId ? ids.indexOf(focusId) : -1;
      focusId = ids[(i + step + ids.length) % ids.length];
      render();
      ctx.feedback.announce(`${cardName(cardById.get(focusId))}. Enter로 들고, R로 돌리고, Delete로 빼요.`);
    } else if ((key === 'Enter' || key === ' ') && focusId && placed.has(focusId)) {
      event.preventDefault();
      startHold('tile', focusId);
    } else if (key === 'Enter' || key === ' ') {
      // 고른 면 없이 판에서 Enter: 카드 칸 맨 앞 카드를 든다(직육면체 판의 빈 칸 Enter처럼 — 들고 나서 자리를 골라 Enter로 놓는다)
      event.preventDefault();
      const g = frontGroup();
      if (g) startHold('card', g);
      else placeNext(null);
    } else if ((key === 'Delete' || key === 'Backspace') && focusId) {
      event.preventDefault();
      removeFace(focusId);
    } else if (key === 'r' || key === 'R' || key === 'ㄱ') {
      event.preventDefault();
      rotate();
    } else if (key === 'Escape' && focusId) {
      focusId = null;
      render();
    }
  }
  boardEl.addEventListener('keydown', onBoardKey);
  // 카드에서 Enter · Space: 판에 그 카드를 든다(끌기 엔진의 "고르기" 대신)
  function onCardKey(event) {
    const el = event.target instanceof Element ? event.target.closest('.pf-card') : null;
    if (!el || !enabled || el.disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      startHold('card', el.dataset.group);
    } else if (event.key === 'r' || event.key === 'R' || event.key === 'ㄱ') {
      event.preventDefault();
      turnCard(el.dataset.group);
    }
  }
  trayEl.addEventListener('keydown', onCardKey);
  // 판 밖을 누르거나 초점이 판을 떠나면 들고 있던 것을 내려놓지 않고 그만둔다
  boardEl.addEventListener('focusout', (event) => {
    if (held && !boardEl.contains(event.relatedTarget)) {
      held = null;
      hidePreview();
      render();
    }
  });

  const resizer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => render()) : null;
  resizer?.observe(host);

  render();

  return {
    el: boardEl,
    trayEl,
    faces: asFaces,
    rootId: () => rootCardId(cards),
    count: () => ({ placed: placed.size, total: cards.length }),
    canUndo: () => history.length > 0,
    canRotate: () => Boolean(held || selectedTile() || selectedGroup() || focusId || last),
    hasSelection: () => Boolean(selectedTile() || selectedGroup()),
    undo,
    clearAll,
    rotate,
    render,
    refit: render,
    /** 판에서 무대로 이어 접을 때: 1 cm의 크기와 (0, 0) cm의 자리(host 기준 px) */
    layout: () => ({ unit: view.unit, origin: [...view.origin] }),
    setEnabled(value) {
      enabled = value;
      held = null;
      if (!value) dnd.clearSelection();
      render();
    },
    clearSelection: () => dnd.clearSelection(),
    /** 떨어진 면(id들)을 점선 테두리 · "떨어짐"으로 */
    markDetached(ids) {
      const next = new Set(ids);
      if (next.size === detached.size && [...next].every((id) => detached.has(id))) return;
      detached = next;
      render();
    },
    focus: () => boardEl.focus({ preventScroll: true }),
    focusCards() {
      trayEl.querySelector('.pf-card:not([disabled])')?.focus({ preventScroll: true });
    },
    /** 검사용: 지금 놓인 면의 모양(cm) */
    placedPolys: () => new Map([...placed].map(([k, v]) => [k, v.map((p) => [...p])])),
    destroy() {
      if (turning) endTurning();
      resizer?.disconnect();
      clearTimeout(afterTimer);
      dnd.destroy();
      root.removeEventListener('pointerdown', onPressCapture, true);
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('click', onClickAfter);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('pointercancel', onRelease);
      window.removeEventListener('keydown', onKeyTurn, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('pointerdown', onOtherPointer, true);
      window.removeEventListener('click', onOtherClick, true);
      window.removeEventListener('pointerup', forgetTap, true);
    },
  };
}
