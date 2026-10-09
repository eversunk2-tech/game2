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
      root.removeEventListener('click', onClickAfter);
      boardEl.removeEventListener('keydown', onKey);
    },
  };
}
