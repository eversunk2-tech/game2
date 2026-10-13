/**
 * 자유 배치 "놓는 판" (브라우저). spec 16-1·16-2
 *
 * 판(칸 격자)과 면 카드 칸(트레이)을 만들고, 놓기·빼기·옮기기·되돌리기를 마우스·터치·키보드로 모두 한다.
 *   - 빈 칸 누르기: 남은 카드 중 앞의 것을 놓는다 · 카드를 칸으로 끌기 · 카드 누르고 칸 누르기
 *   - 놓인 면 누르기(들어 올림) → 빈 칸 누르기(옮기기) / 카드 칸 누르기(빼기) · 놓인 면을 끌어 옮기거나 카드 칸으로 빼기
 *   - 키보드: 판은 칸 하나만 Tab에 걸리고(roving tabindex) 방향키로 칸 이동, Enter·Space로 놓기·들기·놓기,
 *     Esc 제자리, Delete·Backspace 빼기, Ctrl+Z 되돌리기
 * 끌기·눌러 놓기는 엔진 enableDragDrop: 카드·놓인 면 = .dnd-item, 칸·카드 칸 = .dnd-target
 *
 * 어댑터(gridAdapter)가 "칸"을 정한다. 정육면체는 정사각형 격자. 2~4차(직육면체·각기둥·원기둥)는 어댑터를 더한다.
 */
import { josa } from '../../shared/core/korean.js';
import { enableDragDrop } from '../../shared/ui/drag-drop.js';
import { icon } from '../../shared/ui/icons.js';
import { faceColor } from './view3d.js';

const MAX_CELL = 84;
const MIN_CELL = 48; // 누르는 곳 48px 이상
const MAX_UNDO = 60;

/**
 * 정육면체 어댑터: cols × rows 격자, 면 카드 = labels (가~바)
 * skin(선택): 카드의 겉모습을 바꿀 때(주사위 주문의 눈 카드) — { name(label) 이름("주사위 눈 3"), mark(h, label) 카드 안의 그림,
 *   color(label) 카드 색 }. 없으면 "가 면" · 글자 · 색종이 색
 */
export function gridAdapter({ cols, rows, labels, skin = null }) {
  const name = skin?.name ?? ((label) => `${label} 면`);
  return {
    cols,
    rows,
    cards: [...labels],
    key: ([x, y]) => `${x},${y}`,
    inside: ([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows,
    name,
    mark: skin?.mark ?? null,
    color: skin?.color ?? faceColor,
    cellName: ([x, y], label) => `${y + 1}줄 ${x + 1}칸, ${label ? name(label) : '빈 칸'}`,
  };
}

/**
 * @param {object} p
 * @param {object} p.ctx       엔진 ctx (h, sfx, feedback)
 * @param {object} p.adapter   gridAdapter(...)
 * @param {Element} p.root     끌기를 받는 범위(판과 카드 칸을 모두 품은 요소)
 * @param {(state, message) => void} p.onChange  놓인 면이 바뀔 때: state { cells, labels, count, total },
 *   message(화면 읽기 안내 문장 — onChange가 읽게 한다. 없으면 판이 직접 읽는다)
 */
export function createFreeBoard({ ctx, adapter, root, onChange = null }) {
  const { h } = ctx;
  const { cols, rows, cards } = adapter;
  let placed = new Map(); // 면 이름 → [x, y]
  const history = [];
  let cursor = [Math.floor(cols / 2) - 1, Math.floor(rows / 2)];
  let held = null; // 키보드로 들어 올린 면 이름
  let enabled = true;
  let justDropped = false;
  let detached = new Set();
  let cellPx = MAX_CELL;
  /** 카드·면 안에 넣을 것: 어댑터가 그림을 주면 그 그림(주사위 눈), 아니면 글자 */
  const markOf = (label) => (adapter.mark ? adapter.mark(h, label) : label);
  const nameOf = (label) => adapter.name(label);

  // ── DOM ─────────────────────────────
  const cellEls = new Map();
  const rowEls = [];
  for (let y = 0; y < rows; y += 1) {
    const row = h('div', { class: 'board-row', role: 'row' });
    for (let x = 0; x < cols; x += 1) {
      const cell = h('div', {
        class: 'cell dnd-target',
        role: 'gridcell',
        tabindex: '-1',
        dataset: { cell: adapter.key([x, y]) },
      });
      cellEls.set(adapter.key([x, y]), cell);
      row.append(cell);
    }
    rowEls.push(row);
  }
  const shadowLayer = h('div', { class: 'board-shadow', 'aria-hidden': 'true' });
  const boardEl = h('div', {
    class: 'free-board',
    role: 'grid',
    'aria-label': `전개도 놓는 판 ${cols}칸 × ${rows}줄. 방향키로 칸을 옮기고 Enter로 놓아요.`,
    style: { '--cols': String(cols), '--rows': String(rows) },
  }, rowEls, shadowLayer);

  const trayCards = new Map(cards.map((label) => [label, h('button', {
    type: 'button',
    class: 'tray-card dnd-item',
    dataset: { label },
    'aria-pressed': 'false',
  }, h('span', { class: 'tray-label' }, markOf(label)))]));
  for (const [label, el] of trayCards) el.style.setProperty('--face-color', adapter.color(label));
  const trayEl = h('div', { class: 'tray-cards tray-drop dnd-target', dataset: { tray: '1' }, 'aria-label': '면 카드 칸' }, [...trayCards.values()]);

  // ── 상태 ────────────────────────────
  const labelAt = (cell) => {
    const k = adapter.key(cell);
    for (const [label, c] of placed) if (adapter.key(c) === k) return label;
    return null;
  };
  const remaining = () => cards.filter((label) => !placed.has(label));
  const snapshot = () => new Map([...placed].map(([k, v]) => [k, [...v]]));

  function commit(next, message) {
    history.push(snapshot());
    if (history.length > MAX_UNDO) history.shift();
    placed = next;
    held = null;
    render();
    ctx.sfx.play('click');
    emit(message ? `${message} 놓은 면 ${placed.size}/${cards.length}` : null);
  }

  /** 바뀐 것을 알린다. onChange가 있으면 화면 읽기 안내 문장도 함께 넘겨 한 번에 읽게 한다 */
  function emit(message) {
    if (onChange) onChange(state(), message);
    else if (message) ctx.feedback.announce(message);
  }

  function state() {
    const labels = cards.filter((label) => placed.has(label));
    return { cells: labels.map((label) => [...placed.get(label)]), labels, count: placed.size, total: cards.length };
  }

  // ── 동작 ────────────────────────────
  function place(label, cell, verb = '놓았어요') {
    if (!enabled || !label || !adapter.inside(cell)) return false;
    const other = labelAt(cell);
    if (other && other !== label) {
      ctx.feedback.announce(`그 칸에는 ${josa(nameOf(other), '이/가')} 있어요. 빈 칸에 놓아요.`);
      return false;
    }
    if (other === label) {
      held = null;
      render();
      return false;
    }
    const next = snapshot();
    const moving = next.has(label);
    next.set(label, [...cell]);
    commit(next, `${josa(nameOf(label), '을/를')} ${moving ? '옮겼어요' : verb}.`);
    return true;
  }

  function remove(label) {
    if (!enabled || !placed.has(label)) return false;
    const next = snapshot();
    next.delete(label);
    commit(next, `${josa(nameOf(label), '을/를')} 뺐어요.`);
    return true;
  }

  function placeNext(cell) {
    const label = remaining()[0];
    if (!label) {
      ctx.feedback.announce('면 6장을 모두 놓았어요. 옮기려면 놓인 면을 들어 올려요.');
      flashStatus();
      return false;
    }
    return place(label, cell);
  }

  function clearAll() {
    if (!enabled || placed.size === 0) return;
    commit(new Map(), '면을 모두 뺐어요.');
  }

  function undo() {
    if (!enabled || history.length === 0) return false;
    placed = history.pop();
    held = null;
    render();
    ctx.sfx.play('click');
    emit(`되돌렸어요. 놓은 면 ${placed.size}/${cards.length}`);
    return true;
  }

  // ── 그리기 ──────────────────────────
  let statusFlash = null;
  function flashStatus() {
    boardEl.classList.remove('is-full-flash');
    void boardEl.offsetWidth;
    boardEl.classList.add('is-full-flash');
    clearTimeout(statusFlash);
    statusFlash = setTimeout(() => boardEl.classList.remove('is-full-flash'), 700);
  }

  function render() {
    const selectedLabel = root.querySelector('.tile-face.is-selected')?.dataset.label ?? null;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const cell = cellEls.get(adapter.key([x, y]));
        const label = labelAt([x, y]);
        const isCursor = cursor[0] === x && cursor[1] === y;
        cell.tabIndex = isCursor ? 0 : -1;
        cell.classList.toggle('is-cursor', isCursor);
        cell.classList.toggle('is-filled', Boolean(label));
        cell.setAttribute('aria-label', adapter.cellName([x, y], label) + (label && label === held ? ', 들어 올림' : '') + (label && detached.has(label) ? ', 떨어진 면' : ''));
        const current = cell.querySelector('.tile-face');
        if (!label) {
          // 빈 칸: 바뀔 때만 다시 그린다 (누른 요소를 바꾸면 끌기 엔진이 그 칸을 찾지 못한다)
          const ghost = isCursor && held ? held : null;
          const shown = cell.firstElementChild;
          const same = shown && !current && (ghost ? shown.classList.contains('cell-ghost') && shown.textContent === ghost : shown.classList.contains('cell-plus'));
          if (!same) cell.replaceChildren(ghost ? h('span', { class: 'cell-ghost', 'aria-hidden': 'true' }, ghost) : h('span', { class: 'cell-plus', 'aria-hidden': 'true' }, '+'));
          continue;
        }
        let tile = current && current.dataset.label === label ? current : null;
        if (!tile) {
          tile = h('div', { class: 'tile-face dnd-item', dataset: { label }, 'aria-hidden': 'true' }, h('span', { class: 'tile-label' }, markOf(label)));
          tile.style.setProperty('--face-color', adapter.color(label));
          cell.replaceChildren(tile);
        }
        tile.classList.toggle('is-held', label === held || label === selectedLabel);
        tile.classList.toggle('is-apart', detached.has(label));
      }
    }
    for (const [label, el] of trayCards) {
      const used = placed.has(label);
      el.classList.toggle('is-used', used);
      el.classList.toggle('dnd-item', !used);
      el.disabled = !enabled;
      el.setAttribute('aria-label', `${nameOf(label)} 카드${used ? ', 판에 놓음' : ''}`);
      const check = el.querySelector('.used-check');
      if (used && !check) el.append(icon('check', { class: 'used-check' }));
      if (!used && check) check.remove();
    }
  }

  // ── 크기: 칸 = min(84, 판 자리 높이 / 줄, 판 자리 너비 / 칸), 48px 이상 ──
  function fit(host) {
    const box = host.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const size = Math.floor(Math.min(MAX_CELL, box.height / rows, box.width / cols));
    cellPx = Math.max(MIN_CELL, size);
    boardEl.style.setProperty('--cell', `${cellPx}px`);
  }

  // ── 마우스·터치: 엔진 끌어다 놓기 + 빈 칸 누르기 ─────
  const dnd = enableDragDrop({
    root,
    onDrop(itemEl, targetEl) {
      justDropped = true;
      setTimeout(() => {
        justDropped = false;
      }, 0);
      const label = itemEl.dataset.label;
      if (targetEl.dataset.tray) {
        if (itemEl.classList.contains('tile-face')) remove(label);
        else render();
        return;
      }
      const cell = targetEl.dataset.cell.split(',').map(Number);
      cursor = cell;
      place(label, cell);
      render();
    },
  });

  // 빈 칸 누르기: 고른 카드·들어 올린 면이 없으면 남은 카드 중 앞의 것을 놓는다 (끌기 엔진보다 먼저 받는다)
  function onClickCapture(event) {
    if (!enabled || justDropped) return;
    const cell = event.target instanceof Element ? event.target.closest('.cell') : null;
    if (!cell || !boardEl.contains(cell)) return;
    const at = cell.dataset.cell.split(',').map(Number);
    cursor = at;
    // 놓인 면 누르기 = 들어 올리기, 고른 카드·면을 이 칸에 놓기는 끌기 엔진(onDrop)이 한다
    if (labelAt(at) || root.classList.contains('has-selection')) return;
    event.stopPropagation();
    if (held) {
      place(held, at);
      return;
    }
    placeNext(at);
  }
  root.addEventListener('click', onClickCapture, true);
  // 끌어 놓은 바로 뒤의 "따라오는 click 건너뛰기"(justDropped)는 새로 누르는 순간 반드시 푼다: 터치 끌기에는 click이 따라오지 않아
  // 타이머로만 풀면, 기기가 느려 타이머가 밀린 사이의 첫 누르기(빈 칸에 다음 카드 놓기)가 먹히지 않을 수 있다
  const onPressCapture = () => {
    justDropped = false;
  };
  root.addEventListener('pointerdown', onPressCapture, true);
  // 카드·면을 고르거나 풀 때 들어 올림 테두리를 다시 그린다 (모든 click 처리가 끝난 뒤)
  let afterTimer = null;
  const onClickAfter = () => {
    clearTimeout(afterTimer);
    afterTimer = setTimeout(render, 0);
  };
  root.addEventListener('click', onClickAfter);

  // ── 키보드 ───────────────────────────
  const STEP = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  function onKey(event) {
    if (!enabled) return;
    const cellEl = event.target instanceof Element ? event.target.closest('.cell') : null;
    if (!cellEl) return;
    const step = STEP[event.key];
    if (step) {
      event.preventDefault();
      const next = [cursor[0] + step[0], cursor[1] + step[1]];
      if (!adapter.inside(next)) return;
      cursor = next;
      render();
      cellEls.get(adapter.key(cursor)).focus({ preventScroll: true });
      if (held) ctx.feedback.announce(adapter.cellName(cursor, labelAt(cursor)));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const here = labelAt(cursor);
      const pickedCard = root.querySelector('.tray-card.is-selected');
      const pickedTile = root.querySelector('.tile-face.is-selected');
      if (pickedCard || pickedTile) {
        const label = (pickedCard ?? pickedTile).dataset.label;
        dnd.clearSelection();
        if (!here) place(label, cursor);
        else render();
        return;
      }
      if (held) {
        if (here === held || !here) place(held, cursor);
        else ctx.feedback.announce(`그 칸에는 ${josa(nameOf(here), '이/가')} 있어요. 빈 칸에 놓거나 Esc로 제자리에 둬요.`);
        return;
      }
      if (here) {
        held = here;
        render();
        ctx.feedback.announce(`${josa(nameOf(here), '을/를')} 들었어요. 방향키로 옮기고 Enter로 놓아요. Esc는 제자리, Delete는 빼기.`);
        return;
      }
      placeNext(cursor);
      return;
    }
    if (event.key === 'Escape') {
      if (held || root.classList.contains('has-selection')) {
        event.preventDefault();
        held = null;
        dnd.clearSelection();
        render();
        ctx.feedback.announce('제자리에 두었어요.');
      }
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      remove(held ?? labelAt(cursor));
    }
  }
  boardEl.addEventListener('keydown', onKey);

  render();

  return {
    el: boardEl,
    trayEl,
    state,
    undo,
    clearAll,
    canUndo: () => history.length > 0,
    fit,
    /** 판에서 무대로 이어 접을 때: 칸 한 변(px)과 판 (0, 0) 칸의 왼쪽 위 자리(판을 품은 요소 기준) */
    layout: () => ({ unit: cellPx, origin: [boardEl.offsetLeft, boardEl.offsetTop] }),
    /** 칸 (x, y)의 화면 자리 (시험·초점용) */
    cellEl: (cell) => cellEls.get(adapter.key(cell)),
    focus() {
      cellEls.get(adapter.key(cursor)).focus({ preventScroll: true });
    },
    setEnabled(value) {
      enabled = value;
      if (!value) {
        held = null;
        dnd.clearSelection();
      }
      render();
    },
    /** 떨어진 면 표시 (점선 + "떨어짐") */
    markDetached(labels) {
      detached = new Set(labels);
      render();
    },
    /** 힌트 그림자: 이 칸들에 점선 칸을 보인다 (누를 수 없음) */
    showShadow(cellsToShow) {
      shadowLayer.replaceChildren(...cellsToShow.map(([x, y]) => {
        const ghost = h('span', { class: 'shadow-cell' });
        ghost.style.left = `calc(var(--cell) * ${x})`;
        ghost.style.top = `calc(var(--cell) * ${y})`;
        return ghost;
      }));
      boardEl.classList.add('has-shadow');
    },
    clearShadow() {
      shadowLayer.replaceChildren();
      boardEl.classList.remove('has-shadow');
    },
    hasShadow: () => boardEl.classList.contains('has-shadow'),
    destroy() {
      clearTimeout(statusFlash);
      clearTimeout(afterTimer);
      dnd.destroy();
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('pointerdown', onPressCapture, true);
      root.removeEventListener('click', onClickAfter);
      boardEl.removeEventListener('keydown', onKey);
    },
  };
}

// ── 길이가 있는 면 카드의 판 (직육면체: 1 cm 칸에 직사각형 카드를 놓는다) ─────────────────────────
const RECT_MIN_CELL = 24;

/**
 * 직사각형 카드 어댑터: cols × rows(1 cm 칸) 판, 카드 = [{ label, w, h }](cm). 카드는 왼쪽 위를 칸에 맞춰 놓고 90°씩 돌린다.
 * 놓인 면끼리는 겹쳐 놓을 수 없다.
 */
export function rectAdapter({ cols, rows, cards }) {
  const name = (label) => `${label} 면`;
  return {
    cols,
    rows,
    cards: cards.map((c) => ({ ...c })),
    key: ([x, y]) => `${x},${y}`,
    inside: (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= cols && r.y + r.h <= rows,
    name,
    color: faceColor,
    sizeName: (w, h) => `가로 ${w} cm, 세로 ${h} cm`,
    cellName: ([x, y], label) => `${y + 1}줄 ${x + 1}칸, ${label ? name(label) : '빈 칸'}`,
  };
}

const rectsOverlap = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

/**
 * 직사각형 면 카드를 놓는 판. createFreeBoard와 같은 조작을 여러 칸짜리 카드로 한다:
 *   - 빈 칸 누르기: 남은 카드 중 앞의 것을 그 칸을 왼쪽 위로 놓는다 · 카드를 판으로 끌기 · 카드 누르고 칸 누르기
 *   - 놓인 면 끌기(옮기기 — 집은 자리 그대로 따라온다) · 놓인 면 누르기(고르기) → 빈 칸 누르기(옮기기) / 카드 칸 누르기(빼기)
 *   - 돌리기: 면을 두 번 누르기(고른 면을 한 번 더 누르면 돌고 내려놓인다) · rotate()(도구 띠의 [돌리기]: 고른 면이나 방금 놓은 면) · 키보드 R
 *   - 키보드: 칸 하나만 Tab에 걸리고 방향키로 칸 이동, Enter·Space로 놓기·들기·놓기, R 돌리기, Esc 제자리, Delete·Backspace 빼기
 * 끄는 동안·든 동안에는 놓일 자리를 점선으로 미리 보인다(놓을 수 없으면 벽돌색 ✗).
 * 칸은 자리를 가리키는 곳(.cell.dnd-target)이고, 놓인 면(.rect-tile.dnd-item)은 칸 위의 층에 여러 칸 크기로 놓인다.
 * onChange(state, message): state { rects: [{ x, y, w, h, label }](카드 순서), labels, count, total }
 */
export function createRectBoard({ ctx, adapter, root, onChange = null }) {
  const { h } = ctx;
  const { cols, rows, cards } = adapter;
  const cardOf = new Map(cards.map((c) => [c.label, c]));
  let placed = new Map(); // 면 이름 → { x, y, w, h }
  const history = [];
  let cursor = [Math.max(0, Math.floor(cols / 2) - 2), Math.max(0, Math.floor(rows / 2) - 1)];
  let held = null; // 키보드로 들어 올린 면 이름
  let last = null; // 마지막으로 놓거나 옮긴 면 (돌리기 버튼이 가리키는 면)
  let enabled = true;
  let justDropped = false;
  let detached = new Set();
  let cellPx = MAX_CELL;
  let press = null; // 지금 누르고 있는 것: { label, grab: [칸, 칸](면 안에서 집은 칸), x, y, dragged }
  const nameOf = (label) => adapter.name(label);

  // ── DOM ─────────────────────────────
  const cellEls = new Map();
  const rowEls = [];
  for (let y = 0; y < rows; y += 1) {
    const row = h('div', { class: 'board-row', role: 'row' });
    for (let x = 0; x < cols; x += 1) {
      const cell = h('div', { class: 'cell dnd-target', role: 'gridcell', tabindex: '-1', dataset: { cell: adapter.key([x, y]) } },
        h('span', { class: 'cell-plus', 'aria-hidden': 'true' }, '+'));
      cellEls.set(adapter.key([x, y]), cell);
      row.append(cell);
    }
    rowEls.push(row);
  }
  const shadowLayer = h('div', { class: 'board-shadow', 'aria-hidden': 'true' });
  const tileLayer = h('div', { class: 'rect-layer' });
  const preview = h('div', { class: 'rect-preview', 'aria-hidden': 'true', hidden: true }, icon('cross'));
  const boardEl = h('div', {
    class: 'free-board rect-board',
    role: 'grid',
    'aria-label': `전개도 놓는 판 ${cols}칸 × ${rows}줄, 한 칸은 1 cm. 방향키로 칸을 옮기고 Enter로 놓아요. R 키는 돌리기예요.`,
    style: { '--cols': String(cols), '--rows': String(rows) },
  }, rowEls, shadowLayer, tileLayer, preview);
  const tileEls = new Map();

  const trayCards = new Map(cards.map((c) => [c.label, h('button', {
    type: 'button',
    class: 'tray-card rect-card dnd-item',
    dataset: { label: c.label },
    'aria-pressed': 'false',
  },
    h('span', { class: 'size-rect', 'aria-hidden': 'true', style: { width: `calc(var(--card-cm) * ${c.w})`, height: `calc(var(--card-cm) * ${c.h})` } }, c.label),
    h('span', { class: 'size-text', 'aria-hidden': 'true' }, `${c.w}×${c.h} cm`),
  )]));
  for (const [label, el] of trayCards) el.style.setProperty('--face-color', adapter.color(label));
  const trayEl = h('div', { class: 'tray-cards rect-tray tray-drop dnd-target', dataset: { tray: '1' }, 'aria-label': '면 카드 칸' }, [...trayCards.values()]);

  // ── 상태 ────────────────────────────
  const labelAt = ([x, y]) => {
    for (const [label, r] of placed) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return label;
    return null;
  };
  const remaining = () => cards.map((c) => c.label).filter((label) => !placed.has(label));
  const snapshot = () => new Map([...placed].map(([k, v]) => [k, { ...v }]));
  const sizeOf = (label) => placed.get(label) ?? cardOf.get(label);
  /** 그 자리에 놓을 수 있나: 판 안이고 다른 면과 겹치지 않는다 */
  const free = (label, rect) => adapter.inside(rect) && ![...placed].some(([other, r]) => other !== label && rectsOverlap(r, rect));
  /** 판 밖으로 나가지 않게 왼쪽 위를 당긴다 */
  const clamp = (rect) => ({ ...rect, x: Math.max(0, Math.min(cols - rect.w, rect.x)), y: Math.max(0, Math.min(rows - rect.h, rect.y)) });

  function state() {
    const labels = cards.map((c) => c.label).filter((label) => placed.has(label));
    return { rects: labels.map((label) => ({ ...placed.get(label), label })), labels, count: placed.size, total: cards.length };
  }

  function emit(message) {
    if (onChange) onChange(state(), message);
    else if (message) ctx.feedback.announce(message);
  }

  function commit(next, message, touched = null) {
    history.push(snapshot());
    if (history.length > MAX_UNDO) history.shift();
    placed = next;
    held = null;
    if (touched !== undefined) last = touched && next.has(touched) ? touched : null;
    hidePreview();
    render();
    ctx.sfx.play('click');
    emit(message ? `${message} 놓은 면 ${placed.size}/${cards.length}` : null);
  }

  // ── 동작 ────────────────────────────
  /** label을 왼쪽 위 at에 놓는다(옮긴다). 판 밖이면 안으로 당기고, 다른 면과 겹치면 놓지 않는다 → 놓았으면 true */
  function place(label, at, verb = '놓았어요') {
    if (!enabled || !label) return false;
    const size = sizeOf(label);
    const asIs = { x: at[0], y: at[1], w: size.w, h: size.h };
    let rect = clamp(asIs);
    // 새로 놓는 카드: 누른 칸을 왼쪽 위로 그대로 놓을 수 없고(다른 면에 걸리거나 판 밖으로 나감) 돌리면 놓을 수 있으면 돌려서 놓는다
    // — 좁은 틈에 끼워 넣을 때. 그래도 안 되면 판 안으로 당겨 놓는다
    if (!placed.has(label) && !free(label, asIs)) {
      const turned = { x: at[0], y: at[1], w: size.h, h: size.w };
      if (free(label, turned)) rect = turned;
      else if (!free(label, rect) && free(label, clamp(turned))) rect = clamp(turned);
    }
    if (!free(label, rect)) {
      ctx.feedback.announce('그 자리에는 다른 면이 있어요. 빈 곳에 놓아요.');
      flash();
      return false;
    }
    const now = placed.get(label);
    if (now && now.x === rect.x && now.y === rect.y) {
      held = null;
      hidePreview();
      render();
      return false;
    }
    const next = snapshot();
    next.set(label, rect);
    commit(next, `${josa(nameOf(label), '을/를')} ${now ? '옮겼어요' : verb}.`, label);
    return true;
  }

  function remove(label) {
    if (!enabled || !placed.has(label)) return false;
    const next = snapshot();
    next.delete(label);
    commit(next, `${josa(nameOf(label), '을/를')} 뺐어요.`, null);
    return true;
  }

  function placeNext(at) {
    const label = remaining()[0];
    if (!label) {
      ctx.feedback.announce(`면 ${cards.length}장을 모두 놓았어요. 옮기려면 놓인 면을 끌거나 들어 올려요.`);
      flash();
      return false;
    }
    return place(label, at);
  }

  /** 지금 가리키는 면: 키보드로 든 면 → 눌러 고른 면 → 마지막으로 놓은 면 */
  const pointed = () => held ?? root.querySelector('.rect-tile.is-selected')?.dataset.label ?? (last && placed.has(last) ? last : null);

  /** 면을 90° 돌린다(왼쪽 위는 그대로, 판 밖으로 나가면 안으로 당긴다). 돌릴 자리가 없으면 그대로 둔다 */
  function rotate(label = pointed()) {
    if (!enabled || !label || !placed.has(label)) return false;
    const now = placed.get(label);
    const rect = clamp({ x: now.x, y: now.y, w: now.h, h: now.w });
    if (!free(label, rect)) {
      ctx.feedback.info('돌릴 자리가 모자라요. 빈 곳으로 옮긴 다음 돌려요.');
      flash();
      return false;
    }
    const next = snapshot();
    next.set(label, rect);
    const keep = held;
    commit(next, `${josa(nameOf(label), '을/를')} 돌렸어요. ${adapter.sizeName(rect.w, rect.h)}.`, label);
    held = keep; // 든 채로 돌려도 계속 들고 있다
    if (held) showPreview(held, cursor);
    render();
    return true;
  }

  function clearAll() {
    if (!enabled || placed.size === 0) return;
    commit(new Map(), '면을 모두 뺐어요.', null);
  }

  function undo() {
    if (!enabled || history.length === 0) return false;
    placed = history.pop();
    held = null;
    if (last && !placed.has(last)) last = null;
    hidePreview();
    render();
    ctx.sfx.play('click');
    emit(`되돌렸어요. 놓은 면 ${placed.size}/${cards.length}`);
    return true;
  }

  // ── 그리기 ──────────────────────────
  let flashTimer = null;
  function flash() {
    boardEl.classList.remove('is-full-flash');
    void boardEl.offsetWidth;
    boardEl.classList.add('is-full-flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => boardEl.classList.remove('is-full-flash'), 700);
  }

  const putVars = (el, r) => {
    for (const k of ['x', 'y', 'w', 'h']) el.style.setProperty(`--${k}`, String(r[k]));
  };

  function showPreview(label, at) {
    const size = sizeOf(label);
    const rect = clamp({ x: at[0], y: at[1], w: size.w, h: size.h });
    putVars(preview, rect);
    preview.classList.toggle('is-blocked', !free(label, rect));
    preview.hidden = false;
  }
  function hidePreview() {
    preview.hidden = true;
  }

  function render() {
    const selected = root.querySelector('.rect-tile.is-selected')?.dataset.label ?? null;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const cell = cellEls.get(adapter.key([x, y]));
        const label = labelAt([x, y]);
        const isCursor = cursor[0] === x && cursor[1] === y;
        cell.tabIndex = isCursor ? 0 : -1;
        cell.classList.toggle('is-cursor', isCursor);
        cell.classList.toggle('is-filled', Boolean(label));
        cell.setAttribute('aria-label', adapter.cellName([x, y], label)
          + (label ? `, ${adapter.sizeName(placed.get(label).w, placed.get(label).h)}` : '')
          + (label && label === held ? ', 들어 올림' : '') + (label && detached.has(label) ? ', 떨어진 면' : ''));
      }
    }
    for (const [label, el] of tileEls) {
      if (placed.has(label)) continue;
      el.remove();
      tileEls.delete(label);
    }
    for (const [label, r] of placed) {
      let tile = tileEls.get(label);
      if (!tile) {
        tile = h('div', { class: 'tile-face rect-tile dnd-item', dataset: { label }, 'aria-hidden': 'true' }, h('span', { class: 'tile-label' }, label));
        tile.style.setProperty('--face-color', adapter.color(label));
        tileEls.set(label, tile);
        tileLayer.append(tile);
      }
      putVars(tile, r);
      tile.classList.toggle('is-held', label === held || label === selected);
      tile.classList.toggle('is-apart', detached.has(label));
    }
    for (const [label, el] of trayCards) {
      const used = placed.has(label);
      const card = cardOf.get(label);
      el.classList.toggle('is-used', used);
      el.classList.toggle('dnd-item', !used);
      el.disabled = !enabled;
      el.setAttribute('aria-label', `${nameOf(label)} 카드, ${adapter.sizeName(card.w, card.h)}${used ? ', 판에 놓음' : ''}`);
      const check = el.querySelector('.used-check');
      if (used && !check) el.append(icon('check', { class: 'used-check' }));
      if (!used && check) check.remove();
    }
  }

  function fit(host) {
    const box = host.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    cellPx = Math.max(RECT_MIN_CELL, Math.floor(Math.min(MAX_CELL, box.height / rows, box.width / cols)));
    boardEl.style.setProperty('--cell', `${cellPx}px`);
  }

  /** 화면의 점이 놓인 칸 [x, y] (판 밖이면 null) */
  function cellAtPoint(clientX, clientY) {
    const box = boardEl.getBoundingClientRect();
    const x = Math.floor((clientX - box.left) / cellPx);
    const y = Math.floor((clientY - box.top) / cellPx);
    return x >= 0 && y >= 0 && x < cols && y < rows ? [x, y] : null;
  }

  /** 끌어 놓을 때 왼쪽 위: 놓인 면은 집은 칸이 포인터 칸에 오게, 카드 칸의 카드는 가운데가 포인터 칸에 오게 */
  function dropOrigin(label, at) {
    const size = sizeOf(label);
    const grab = press?.dragged && press.label === label && press.grab ? press.grab : [Math.floor((size.w - 1) / 2), Math.floor((size.h - 1) / 2)];
    return [at[0] - grab[0], at[1] - grab[1]];
  }

  // ── 마우스·터치: 엔진 끌어다 놓기 + 빈 칸 누르기 + 고른 면 다시 누르기(돌리기) ─────
  const dnd = enableDragDrop({
    root,
    onDrop(itemEl, targetEl) {
      justDropped = true;
      setTimeout(() => {
        justDropped = false;
      }, 0);
      const label = itemEl.dataset.label;
      const dragged = Boolean(press?.dragged && press.label === label);
      hidePreview();
      if (targetEl.dataset.tray) {
        if (itemEl.classList.contains('rect-tile')) return remove(label);
        render();
        return false;
      }
      const at = targetEl.dataset.cell.split(',').map(Number);
      // 끌어 놓았으면 집은 자리 그대로, 눌러 고른 뒤 칸을 눌렀으면 그 칸이 왼쪽 위
      const origin = dragged ? dropOrigin(label, at) : at;
      const ok = place(label, origin);
      if (ok) cursor = [placed.get(label).x, placed.get(label).y];
      render();
      return ok;
    },
  });

  function onClickCapture(event) {
    if (!enabled || justDropped) return;
    const target = event.target instanceof Element ? event.target : null;
    // 고른 면을 한 번 더 누르면 돌리고 내려놓는다 (끌기 엔진이 "고르기 풀기"로만 받기 전에) — 면을 두 번 누르면 90° 돈다
    const tile = target?.closest('.rect-tile');
    if (tile && boardEl.contains(tile) && tile.classList.contains('is-selected')) {
      event.stopPropagation();
      dnd.clearSelection();
      rotate(tile.dataset.label);
      render();
      return;
    }
    const cell = target?.closest('.cell');
    if (!cell || !boardEl.contains(cell)) return;
    const at = cell.dataset.cell.split(',').map(Number);
    cursor = at;
    if (root.classList.contains('has-selection')) return; // 고른 카드·면을 이 칸에 놓기는 끌기 엔진(onDrop)이 한다
    event.stopPropagation();
    if (held) {
      place(held, at);
      return;
    }
    placeNext(at);
  }
  root.addEventListener('click', onClickCapture, true);

  function onPressCapture(event) {
    justDropped = false;
    const tile = event.target instanceof Element ? event.target.closest('.rect-tile, .rect-card') : null;
    press = null;
    if (!tile || !root.contains(tile)) return;
    let grab = null;
    if (tile.classList.contains('rect-tile')) {
      const box = tile.getBoundingClientRect();
      const r = placed.get(tile.dataset.label);
      if (r) grab = [Math.max(0, Math.min(r.w - 1, Math.floor((event.clientX - box.left) / cellPx))), Math.max(0, Math.min(r.h - 1, Math.floor((event.clientY - box.top) / cellPx)))];
    }
    press = { label: tile.dataset.label, grab, x: event.clientX, y: event.clientY, dragged: false };
  }
  root.addEventListener('pointerdown', onPressCapture, true);

  /** 끄는 동안(마우스·손가락) 놓일 자리를 미리 보인다. 눌러 고른 채 마우스를 움직일 때도 같다 */
  function onMove(event) {
    if (!enabled) return;
    if (press && !press.dragged && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8) press.dragged = true;
    const dragging = press?.dragged && root.classList.contains('is-dragging-any');
    const picked = !dragging && event.pointerType === 'mouse' ? root.querySelector('.rect-tile.is-selected, .rect-card.is-selected')?.dataset.label : null;
    const label = dragging ? press.label : picked;
    if (!label) return;
    const at = cellAtPoint(event.clientX, event.clientY);
    if (!at) {
      hidePreview();
      return;
    }
    const origin = dragging ? dropOrigin(label, at) : at;
    showPreview(label, origin);
  }
  window.addEventListener('pointermove', onMove);
  const onRelease = () => {
    if (!held) hidePreview();
  };
  window.addEventListener('pointerup', onRelease);
  window.addEventListener('pointercancel', onRelease);

  let afterTimer = null;
  const onClickAfter = () => {
    clearTimeout(afterTimer);
    afterTimer = setTimeout(() => {
      if (!held && !root.classList.contains('has-selection')) hidePreview();
      render();
      emit(null); // 고른 면이 바뀌면 [돌리기]가 가리키는 면도 바뀐다
    }, 0);
  };
  root.addEventListener('click', onClickAfter);

  // ── 키보드 ───────────────────────────
  const STEP = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  function onKey(event) {
    if (!enabled) return;
    const cellEl = event.target instanceof Element ? event.target.closest('.cell') : null;
    if (!cellEl) return;
    const step = STEP[event.key];
    if (step) {
      event.preventDefault();
      const next = [cursor[0] + step[0], cursor[1] + step[1]];
      if (next[0] < 0 || next[1] < 0 || next[0] >= cols || next[1] >= rows) return;
      cursor = next;
      render();
      cellEls.get(adapter.key(cursor)).focus({ preventScroll: true });
      if (held) {
        showPreview(held, cursor);
        ctx.feedback.announce(adapter.cellName(cursor, labelAt(cursor)));
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const here = labelAt(cursor);
      const picked = root.querySelector('.rect-card.is-selected, .rect-tile.is-selected');
      if (picked) {
        const label = picked.dataset.label;
        dnd.clearSelection();
        place(label, cursor);
        render();
        return;
      }
      if (held) {
        place(held, cursor);
        return;
      }
      if (here) {
        held = here;
        cursor = [placed.get(here).x, placed.get(here).y]; // 든 면의 왼쪽 위로 커서를 옮긴다(그대로 놓으면 제자리)
        showPreview(held, cursor);
        render();
        cellEls.get(adapter.key(cursor)).focus({ preventScroll: true });
        ctx.feedback.announce(`${josa(nameOf(here), '을/를')} 들었어요. 방향키로 옮기고 Enter로 놓아요. R은 돌리기, Esc는 제자리, Delete는 빼기.`);
        return;
      }
      placeNext(cursor);
      return;
    }
    if (event.key === 'r' || event.key === 'R' || event.key === 'ㄱ') {
      // ㄱ: 한글 자판 상태에서 누른 R
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      rotate(held ?? labelAt(cursor) ?? pointed());
      return;
    }
    if (event.key === 'Escape') {
      if (held || root.classList.contains('has-selection')) {
        event.preventDefault();
        held = null;
        dnd.clearSelection();
        hidePreview();
        render();
        ctx.feedback.announce('제자리에 두었어요.');
      }
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      remove(held ?? labelAt(cursor));
    }
  }
  boardEl.addEventListener('keydown', onKey);

  render();

  return {
    el: boardEl,
    trayEl,
    state,
    undo,
    clearAll,
    rotate,
    /** [돌리기]가 가리키는 면이 있나 */
    canRotate: () => Boolean(pointed()),
    canUndo: () => history.length > 0,
    fit,
    /**
     * 판에서 무대로 이어 접을 때: 1 cm 칸의 크기(px)와 판 (0, 0) 칸의 왼쪽 위 자리(판을 품은 요소 기준).
     * 판이 가운데 놓여 자리가 0.5px 단위일 수 있어(offsetLeft는 정수로 반올림된다) 화면에 놓인 자리 그대로 잰다 — 어긋남 0px
     */
    layout() {
      const box = boardEl.getBoundingClientRect();
      const host = boardEl.offsetParent?.getBoundingClientRect() ?? { left: box.left, top: box.top };
      return { unit: cellPx, origin: [box.left - host.left, box.top - host.top] };
    },
    cellEl: (cell) => cellEls.get(adapter.key(cell)),
    focus() {
      cellEls.get(adapter.key(cursor)).focus({ preventScroll: true });
    },
    setEnabled(value) {
      enabled = value;
      if (!value) {
        held = null;
        dnd.clearSelection();
        hidePreview();
      }
      render();
    },
    markDetached(labels) {
      detached = new Set(labels);
      render();
    },
    /** 힌트 그림자: 이 직사각형들을 점선으로 보인다 (누를 수 없음) */
    showShadow(rects) {
      shadowLayer.replaceChildren(...rects.map((r) => {
        const ghost = h('span', { class: 'rect-shadow' });
        putVars(ghost, r);
        return ghost;
      }));
      boardEl.classList.add('has-shadow');
    },
    clearShadow() {
      shadowLayer.replaceChildren();
      boardEl.classList.remove('has-shadow');
    },
    hasShadow: () => boardEl.classList.contains('has-shadow'),
    destroy() {
      clearTimeout(flashTimer);
      clearTimeout(afterTimer);
      dnd.destroy();
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('pointerdown', onPressCapture, true);
      root.removeEventListener('click', onClickAfter);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('pointercancel', onRelease);
      boardEl.removeEventListener('keydown', onKey);
    },
  };
}
