/**
 * 모서리에 붙이는 판 (전개도 완성하기 prism-free — spec 16-2의 "모서리에 붙이기", spec-grade6 2-2절 "전개도 그리기를 화면에서").
 * 면 카드를 고르면(누르기 · Enter) 놓인 면의 빈 모서리마다 48px "붙일 자리"(+)가 생기고, 누르면 카드의 "붙일 변"이 그 모서리 바깥쪽에 붙는다.
 * 카드를 끌어 붙일 자리에 놓아도 붙는다(엔진 enableDragDrop — 끄는 동안 카드의 복제가 보인다). [붙일 변 바꾸기] · R 키로 카드의 어느 변을 붙일지 바꾼다.
 * 붙일 자리는 모두 같은 모습이다 — 어느 모서리가 맞는지(길이 · 자리)를 모습 · 차례 · 속성으로 알려 주지 않는다(common-rules 2절).
 * 키보드: 카드에서 Enter → 첫 붙일 자리로 초점, 방향키로 자리 옮기기, Enter로 붙이기, Esc로 그만두기. Ctrl+Z 되돌리기.
 * 판의 크기: 주문을 시작할 때 바탕 그림(다 놓은 띠 꼴)이 들어가는 1 cm 크기로 그리고, 놓은 면이 판 밖으로 나가려 할 때만 작게 다시 맞춘다
 * (prism-free-logic.js nextBoardView). 펼친 그림에서 놓인 면과 겹치는 자리에는 붙지 않는다.
 */
import { enableDragDrop } from '../../../shared/ui/drag-drop.js';
import { icon } from '../../../shared/ui/icons.js';
import { LABELS } from '../fold.js';
import { centroid } from '../geometry.js';
import {
  SLOT_SIZE,
  attachEdges,
  attachPoly,
  cardName,
  edgeLengthOf,
  freeEdges,
  nextBoardView,
  openEdges,
  overlapsPlaced,
  placeSlots,
} from './prism-free-logic.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  return el;
};
const cm = (v) => `${Math.round(v * 100) / 100} cm`;
export const faceFill = (label) => `var(--face-${(Math.max(0, LABELS.indexOf(label)) % 8) + 1})`;
/** 카드 그림의 크기(px): 가장 긴 카드의 긴 쪽 */
const CARD_ART = 40;
/** 붙일 자리 단추를 변에서 이만큼(px) 넘게 밀어 놓았으면 변까지 이은 점선을 그린다 */
const LINK_AFTER = SLOT_SIZE / 2 + 8;

/** 카드 그림: 붙일 변이 아래로 오게 돌려 그리고 그 변을 굵게 (돌리면 그림도 돈다) */
function cardArt(card, edge, k) {
  const n = card.poly.length;
  const [p, q] = [card.poly[edge], card.poly[(edge + 1) % n]];
  // 붙일 변이 아래(+y)에서 가로가 되게: 그 변을 오른쪽 → 왼쪽으로 놓으면 면이 위쪽(바깥에서 본 반시계)
  const turn = Math.PI - Math.atan2(q[1] - p[1], q[0] - p[0]);
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const pts = card.poly.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  const xs = pts.map((v) => v[0]);
  const ys = pts.map((v) => v[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const [w, h] = [Math.max(...xs) - x0, Math.max(...ys) - y0];
  const pad = 4;
  const svg = svgEl('svg', { class: 'pf-card-art', width: (w * k + 2 * pad).toFixed(1), height: (h * k + 2 * pad).toFixed(1), 'aria-hidden': 'true', focusable: 'false' });
  const at = ([x, y]) => [(x - x0) * k + pad, (y - y0) * k + pad];
  const shape = svgEl('polygon', { points: pts.map((v) => at(v).map((z) => z.toFixed(1)).join(',')).join(' '), class: 'pf-card-face' });
  shape.style.fill = faceFill(card.label);
  const [a, b] = [at(pts[edge]), at(pts[(edge + 1) % n])];
  const line = svgEl('line', { x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1), class: 'pf-card-edge' });
  svg.append(shape, line);
  return svg;
}

/**
 * @param {object} p
 * @param {object} p.ctx           단계 ctx (h · feedback · sfx)
 * @param {HTMLElement} p.root     끌어다 놓기의 뿌리(작업대 — .has-selection · .is-dragging-any가 붙는다)
 * @param {HTMLElement} p.host     판을 그릴 곳(.free-host — 무대와 같은 자리)
 * @param {Array} p.cards          면 카드 한 벌 (prism-free-logic.js freeCards)
 * @param {Function} p.area        판으로 쓸 곳 () => { left, top, width, height } (host 기준 px — 주문 그림 창 · 안내 띠를 뺀 곳)
 * @param {Function} [p.onChange]  놓인 면이 바뀌면 (message)
 */
export function createEdgeBoard({ ctx, root, host, cards, area, onChange = null, onRefuse = null }) {
  const { h } = ctx;
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const groups = [...new Set(cards.map((c) => c.group))];
  const edgeOf = new Map(groups.map((g) => [g, attachEdges(cards.find((c) => c.group === g))[0]]));
  const maxDim = Math.max(...cards.map((c) => Math.max(...c.poly.map((p) => Math.hypot(p[0], p[1]))) * 2));
  const k = CARD_ART / maxDim;
  let placed = [];
  let given = [];
  let plan = [];
  let history = [];
  let view = null;
  let enabled = true;
  let slotEls = [];

  // ── 판 ─────────────────────────────
  const svg = svgEl('svg', { class: 'pf-svg', 'aria-hidden': 'true', focusable: 'false' });
  const marks = h('div', { class: 'pf-marks', 'aria-hidden': 'true' });
  const slots = h('div', { class: 'pf-slots', role: 'group', 'aria-label': '붙일 자리' });
  const layer = h('div', { class: 'pf-board', role: 'img' }, svg, marks, slots);
  host.prepend(layer);

  // ── 카드 칸 ───────────────────────────
  const cardEls = new Map(groups.map((g) => {
    const el = h('button', { type: 'button', class: 'tray-card pf-card dnd-item', dataset: { group: g }, 'aria-pressed': 'false' });
    el.addEventListener('click', (event) => {
      // 키보드로 카드를 고르면(detail 0) 첫 붙일 자리로 초점 — 끌어다 놓기가 고르기를 정한 뒤에
      if (event.detail !== 0) return;
      setTimeout(() => {
        if (el.isConnected && el.classList.contains('is-selected')) slotEls[0]?.focus({ preventScroll: true });
      }, 0);
    });
    return [g, el];
  }));
  const trayEl = h('div', { class: 'tray-cards pf-cards', 'aria-label': '면 카드 칸' }, [...cardEls.values()]);

  const remainingIn = (g) => cards.filter((c) => c.group === g && !placed.some((p) => p.id === c.id));
  const selectedGroup = () => trayEl.querySelector('.pf-card.is-selected')?.dataset.group ?? null;

  function renderCards() {
    for (const [g, el] of cardEls) {
      // 처음부터 놓여 있는 면만 있는 묶음은 카드 칸에 없다(이 주문에서 붙일 카드가 아니다)
      const own = cards.filter((c) => c.group === g && !given.some((f) => f.id === c.id));
      el.hidden = own.length === 0;
      const left = remainingIn(g);
      const any = cards.find((c) => c.group === g);
      const top = left[0] ?? any;
      const edge = edgeOf.get(g);
      const used = left.length === 0;
      el.classList.toggle('dnd-item', !used && enabled);
      el.classList.toggle('is-used', used);
      el.disabled = used || !enabled;
      if (used && el.classList.contains('is-selected')) dnd.clearSelection();
      el.style.setProperty('--face-color', faceFill(top.label));
      el.dataset.edge = String(edge); // 붙일 변(카드의 몇 번째 변) — 그림의 굵은 변과 같다
      const len = edgeLengthOf(top.poly, edge);
      const size = top.role === 'side' ? `${top.w}×${top.h} cm` : '밑면';
      el.replaceChildren(...[
        h('span', { class: 'pf-card-label', 'aria-hidden': 'true' }, top.label),
        cardArt(top, edge, k),
        h('span', { class: 'size-text', 'aria-hidden': 'true' }, size),
        left.length > 1 ? h('span', { class: 'pf-card-count', 'aria-hidden': 'true' }, `×${left.length}`) : null,
        used ? icon('check', { class: 'used-check' }) : null,
      ].filter(Boolean));
      el.setAttribute('aria-label', used ? `${top.label} 면 카드, 붙였어요` : `${cardName(top)}${left.length > 1 ? `, 같은 카드 ${left.length}장` : ''}, 붙일 변 ${cm(len)}`);
    }
  }

  // ── 그리기 ───────────────────────────
  const px = ([x, y]) => [view.origin[0] + x * view.unit, view.origin[1] + y * view.unit];

  function render() {
    const box = area();
    view = nextBoardView(view, placed.map((f) => f.poly), box, plan);
    const W = host.clientWidth;
    const H = host.clientHeight;
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.replaceChildren();
    marks.replaceChildren();
    const facesPx = placed.map((f) => ({ id: f.id, poly: f.poly.map(px) }));
    for (const f of placed) {
      const poly = svgEl('polygon', { points: f.poly.map((p) => px(p).map((v) => v.toFixed(2)).join(',')).join(' '), class: `pf-face${f.given ? ' is-given' : ''}`, 'data-face': f.id });
      poly.style.fill = faceFill(f.label);
      svg.append(poly);
    }
    // 변: 이어 붙인 곳(다른 면과 맞닿은 변)은 점선 — 한 번만, 빈 모서리(자른 곳)는 실선 (교과서 6-1 43쪽의 약속)
    const free = freeEdges(placed);
    const isFree = (id, i) => free.some((e) => e.face === id && e.edge === i);
    const drawn = [];
    for (const f of placed) {
      f.poly.forEach((p, i) => {
        const q = f.poly[(i + 1) % f.poly.length];
        const [a, b] = [px(p), px(q)];
        const open = isFree(f.id, i);
        if (!open && drawn.some(([c, d]) => (Math.hypot(c[0] - b[0], c[1] - b[1]) < 0.5 && Math.hypot(d[0] - a[0], d[1] - a[1]) < 0.5) || (Math.hypot(c[0] - a[0], c[1] - a[1]) < 0.5 && Math.hypot(d[0] - b[0], d[1] - b[1]) < 0.5))) return;
        drawn.push([a, b]);
        svg.append(svgEl('line', { x1: a[0].toFixed(2), y1: a[1].toFixed(2), x2: b[0].toFixed(2), y2: b[1].toFixed(2), class: open ? 'pf-cut' : 'pf-fold' }));
      });
    }
    // 면 이름(+ 처음부터 놓인 면의 자물쇠)과 빈 모서리의 길이
    for (const f of placed) {
      const [cx, cy] = px(centroid(f.poly));
      const tag = h('span', { class: `pf-face-label${f.given ? ' is-given' : ''}`, style: { left: `${cx.toFixed(1)}px`, top: `${cy.toFixed(1)}px` } }, f.label);
      if (f.given) tag.append(h('span', { class: 'pf-lock' }, icon('lock')));
      marks.append(tag);
    }
    for (const e of free) {
      const face = placed.find((f) => f.id === e.face);
      const [a, b] = [px(e.p), px(e.q)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const [cx, cy] = px(centroid(face.poly));
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
      if ((mid[0] - cx) * nx + (mid[1] - cy) * ny > 0) [nx, ny] = [-nx, -ny]; // 안쪽
      let deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg <= -90) deg += 180;
      marks.append(h('span', {
        class: 'pf-len',
        style: { left: `${(mid[0] + nx * 11).toFixed(1)}px`, top: `${(mid[1] + ny * 11).toFixed(1)}px`, transform: `translate(-50%, -50%) rotate(${deg.toFixed(1)}deg)` },
      }, cm(edgeLengthOf(face.poly, e.edge))));
    }
    // 붙일 자리 (바깥이 실틈뿐인 빈 모서리는 빼고 — openEdges)
    const open = openEdges(placed, cards.filter((c) => !placed.some((f) => f.id === c.id)));
    const edges = open.map((e) => ({ key: `${e.face}:${e.edge}`, face: e.face, p: px(e.p), q: px(e.q) }));
    const spots = placeSlots(facesPx, edges, box);
    const focusedKey = document.activeElement?.closest?.('.pf-slot')?.dataset.slot ?? null;
    slotEls = spots.map((s, i) => {
      const e = open[i];
      const face = placed.find((f) => f.id === e.face);
      if (Math.hypot(s.x - s.ax, s.y - s.ay) > LINK_AFTER) {
        svg.append(svgEl('line', { x1: s.ax.toFixed(1), y1: s.ay.toFixed(1), x2: s.x.toFixed(1), y2: s.y.toFixed(1), class: 'pf-slot-link' }));
      }
      return h('button', {
        type: 'button',
        class: 'pf-slot dnd-target',
        dataset: { slot: s.key },
        style: { left: `${s.x.toFixed(1)}px`, top: `${s.y.toFixed(1)}px` },
        'aria-label': `붙일 자리 ${i + 1}: ${face.label} 면의 변, ${cm(edgeLengthOf(face.poly, e.edge))}`,
      }, icon('cross', { class: 'pf-plus' }));
    });
    slots.replaceChildren(...slotEls);
    if (focusedKey) slotEls.find((el) => el.dataset.slot === focusedKey)?.focus({ preventScroll: true });
    layer.setAttribute('aria-label', `전개도 놓는 판: 놓인 면 ${placed.map((f) => `${f.label} 면`).join(', ')}`);
    renderCards();
  }

  // ── 붙이기 ───────────────────────────
  function attach(group, slotKey) {
    if (!enabled) return false;
    const card = remainingIn(group)[0];
    const [faceId, edgeText] = slotKey.split(':');
    const parent = placed.find((f) => f.id === faceId);
    if (!card || !parent) return false;
    const e = Number(edgeText);
    const poly = attachPoly(card.poly, edgeOf.get(group), [parent.poly[e], parent.poly[(e + 1) % parent.poly.length]]);
    if (overlapsPlaced(poly, placed)) {
      // 알림(토스트)은 판의 아래쪽 붙일 자리를 가릴 수 있어 쓰지 않는다 — 주문서의 안내 줄과 화면 읽기로
      const text = '그 자리에 붙이면 놓인 면과 겹쳐요. 다른 자리에 붙이거나 붙일 변을 바꿔 봐요.';
      if (onRefuse) onRefuse(text);
      else ctx.feedback.announce(text);
      ctx.sfx.play('click');
      return false;
    }
    placed = [...placed, { id: card.id, role: card.role, label: card.label, poly, given: false }];
    history.push(card.id);
    ctx.sfx.play('click');
    render();
    onChange?.(`${card.label} 면을 ${parent.label} 면에 붙였어요.`);
    return true;
  }

  const dnd = enableDragDrop({
    root,
    itemSelector: '.pf-card.dnd-item',
    targetSelector: '.pf-slot',
    onDrop(item, target) {
      return attach(item.dataset.group, target.dataset.slot);
    },
  });

  // 붙일 자리에서: 방향키로 가까운 자리로, Esc로 그만두기
  function onSlotKey(event) {
    const el = event.target.closest?.('.pf-slot');
    if (!el) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      const g = selectedGroup();
      dnd.clearSelection();
      if (g) cardEls.get(g).focus({ preventScroll: true });
      return;
    }
    const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[event.key];
    if (!dir) return;
    event.preventDefault();
    const at = (b) => [parseFloat(b.style.left), parseFloat(b.style.top)];
    const [x0, y0] = at(el);
    let best = null;
    for (const other of slotEls) {
      if (other === el) continue;
      const [x, y] = at(other);
      const along = (x - x0) * dir[0] + (y - y0) * dir[1];
      if (along <= 1) continue;
      const score = along + 2 * Math.abs((x - x0) * dir[1] - (y - y0) * dir[0]);
      if (!best || score < best.score) best = { other, score };
    }
    best?.other.focus({ preventScroll: true });
  }
  slots.addEventListener('keydown', onSlotKey);

  /** 붙일 변 바꾸기: 고른 카드(없으면 초점 받은 카드)의 다음 변 */
  function rotate() {
    const g = selectedGroup() ?? document.activeElement?.closest?.('.pf-card')?.dataset.group ?? null;
    if (!g || remainingIn(g).length === 0) return false;
    const options = attachEdges(cards.find((c) => c.group === g));
    if (options.length < 2) return false;
    const i = options.indexOf(edgeOf.get(g));
    edgeOf.set(g, options[(i + 1) % options.length]);
    ctx.sfx.play('click');
    renderCards();
    const top = remainingIn(g)[0];
    ctx.feedback.announce(`${top.label} 면 카드의 붙일 변을 바꿨어요. ${cm(edgeLengthOf(top.poly, edgeOf.get(g)))}`);
    return true;
  }
  function onKey(event) {
    if (!enabled || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== 'r' && event.key !== 'R') return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (rotate()) event.preventDefault();
  }
  window.addEventListener('keydown', onKey);

  const resizer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    view = null; // 판의 크기가 바뀌면 처음부터 다시 맞춘다
    render();
  }) : null;
  resizer?.observe(host);

  return {
    el: layer,
    trayEl,
    /** 주문을 시작한다: 처음부터 놓인 면(given)과 판의 크기를 정할 바탕 그림(plan: cm 다각형들) */
    setOrder(nextGiven, nextPlan) {
      given = nextGiven.map((f) => ({ ...f, poly: f.poly.map((p) => [...p]), given: true }));
      plan = nextPlan.map((poly) => poly.map((p) => [...p]));
      placed = [...given];
      history = [];
      view = null;
      dnd.clearSelection();
      render();
    },
    faces: () => placed.map((f) => ({ ...f, poly: f.poly.map((p) => [...p]) })),
    rootId: () => given[0]?.id ?? null,
    count: () => ({ placed: placed.length, total: cards.length, attached: placed.length - given.length, toAttach: cards.length - given.length }),
    canUndo: () => history.length > 0,
    canRotate() {
      const g = selectedGroup();
      return Boolean(g && remainingIn(g).length > 0 && attachEdges(cards.find((c) => c.group === g)).length > 1);
    },
    hasSelection: () => Boolean(selectedGroup()),
    undo() {
      const id = history.pop();
      if (!id) return;
      placed = placed.filter((f) => f.id !== id);
      ctx.sfx.play('click');
      render();
      onChange?.(`${cardById.get(id).label} 면을 뗐어요.`);
    },
    reset() {
      if (history.length === 0) return;
      placed = [...given];
      history = [];
      dnd.clearSelection();
      ctx.sfx.play('click');
      render();
      onChange?.('처음부터 놓여 있던 면만 남겼어요.');
    },
    rotate,
    refit() {
      view = null;
      render();
    },
    render,
    /** 판에서 무대로 이어 접을 때: 1 cm의 크기와 (0, 0) cm의 자리(host 기준 px) */
    layout: () => ({ unit: view.unit, origin: [...view.origin] }),
    setEnabled(value) {
      enabled = value;
      if (!value) dnd.clearSelection();
      renderCards();
    },
    clearSelection: () => dnd.clearSelection(),
    focusCards() {
      trayEl.querySelector('.pf-card:not([disabled])')?.focus({ preventScroll: true });
    },
    slotEls: () => slotEls.slice(),
    destroy() {
      resizer?.disconnect();
      window.removeEventListener('keydown', onKey);
      slots.removeEventListener('keydown', onSlotKey);
      dnd.destroy();
    },
  };
}
