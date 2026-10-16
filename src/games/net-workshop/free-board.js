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
const HANDLE = 48; // 돌리기 손잡이의 크기(px) — 누르는 곳 48px
const TURN_START = 8; // 손잡이를 이만큼(px) 움직여야 돌리기로 본다 (그 전에 떼면 누르기 = 90° 돌리기)

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
/** 시계 방향으로 90° k번 돌린 크기와, 그때 면 안에서 집은 칸이 가는 자리 (w × h 안의 칸 [x, y] → h × w 안의 [h − 1 − y, x]) */
function turnedGrab(grab, { w, h }, k) {
  let [g, size] = [grab, { w, h }];
  for (let i = 0; i < k; i += 1) {
    g = [size.h - 1 - g[1], g[0]];
    size = { w: size.h, h: size.w };
  }
  return { grab: g, size };
}
const swapSize = ({ w, h }, odd) => (odd ? { w: h, h: w } : { w, h });

/**
 * 직사각형 면 카드를 놓는 판. createFreeBoard와 같은 조작을 여러 칸짜리 카드로 한다:
 *   - 빈 칸 누르기: 남은 카드 중 앞의 것을 그 칸을 왼쪽 위로 놓는다 · 카드를 판으로 끌기 · 카드 누르고 칸 누르기
 *   - 놓인 면 끌기(옮기기 — 집은 자리 그대로 따라온다) · 놓인 면 누르기(고르기) → 빈 칸 누르기(옮기기) / 카드 칸 누르기(빼기)
 *   - 돌리기: 면을 두 번 누르기(고른 면을 한 번 더 누르면 돌고 내려놓인다) · rotate()(도구 띠의 [돌리기]: 고른 면·카드나 방금 놓은 면) · 키보드 R
 *   - 돌리기 손잡이(spec 16-16): 놓인 면이나 카드를 눌러 고르면(키보드로 든 면도) 그 면의 모서리에 ↻ 손잡이(48px)가 생긴다.
 *     손잡이를 잡고 돌리면 면이 따라 돌다가 놓으면 가장 가까운 90°로 맞춰진다(가로·세로가 바뀐 면이 들어가지 않으면 제자리 + 알림).
 *     손잡이를 누르기만 하면(8px 안) 90° 돈다 — 키보드는 손잡이에서 Enter·Space·←→. 정사각형 면에는 손잡이가 없다(돌려도 모양이 같다)
 *   - 끄는 중 돌리기(spec 16-16): 다른 손가락으로 톡(태블릿) · 마우스 오른쪽 버튼 · R 키 → 끄는 면이 90° 돌고, 놓으면 돌린 대로 놓인다
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
  let press = null; // 지금 누르고 있는 것: { label, id(포인터), grab: [칸, 칸](면 안에서 집은 칸), x, y, dragged }
  let dragTurns = 0; // 끄는 동안 돌린 횟수(시계 방향 90°씩) — 놓을 때 쓴다
  let ghostHome = null; // 끄는 동안 돌린 복제의 처음 모습(놓기 직전에 되돌린다 — 제자리로 돌아갈 때 처음 모습으로)
  let lastPoint = null; // 끄는 동안의 마지막 포인터 자리
  const cardTurn = new Set(); // 카드 칸에서 돌려 둔 카드(놓을 때 가로·세로가 바뀐다)
  const nameOf = (label) => adapter.name(label);
  const allSquare = cards.every((c) => c.w === c.h);
  const isSquare = (label) => cardOf.get(label)?.w === cardOf.get(label)?.h;

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
  /** 돌리기 손잡이: 판에 놓인 면의 것과 카드 칸의 카드의 것 (고른 것이 있을 때만 보인다) */
  const makeHandle = (where) => h('button', { type: 'button', class: `turn-handle turn-handle-${where}`, hidden: true, dataset: { where } }, icon('rotr'));
  const boardHandle = makeHandle('board');
  const trayHandle = makeHandle('tray');
  const boardEl = h('div', {
    class: 'free-board rect-board',
    role: 'grid',
    'aria-label': `전개도 놓는 판 ${cols}칸 × ${rows}줄, 한 칸은 1 cm. 방향키로 칸을 옮기고 Enter로 놓아요. R 키는 돌리기예요.`,
    style: { '--cols': String(cols), '--rows': String(rows) },
  }, rowEls, shadowLayer, tileLayer, preview, boardHandle);
  const tileEls = new Map();

  const trayCards = new Map(cards.map((c) => [c.label, h('button', {
    type: 'button',
    class: 'tray-card rect-card dnd-item',
    dataset: { label: c.label },
    'aria-pressed': 'false',
  },
    h('span', { class: 'size-rect', 'aria-hidden': 'true' }, c.label),
    h('span', { class: 'size-text', 'aria-hidden': 'true' }),
  )]));
  for (const [label, el] of trayCards) el.style.setProperty('--face-color', adapter.color(label));
  const trayEl = h('div', { class: 'tray-cards rect-tray tray-drop dnd-target', dataset: { tray: '1' }, 'aria-label': '면 카드 칸' }, [...trayCards.values()], trayHandle);
  // 카드 그림의 축척: 처음 상자(가장 큰 카드 3×2 cm)와 같은 자리에 들어가게 큰 상자는 줄인다 — 여섯 장은 늘 같은 축척
  trayEl.style.setProperty('--card-k', String(Math.min(1, 3 / Math.max(...cards.map((c) => c.w)), 2 / Math.max(...cards.map((c) => c.h)))));

  // ── 상태 ────────────────────────────
  const labelAt = ([x, y]) => {
    for (const [label, r] of placed) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return label;
    return null;
  };
  const remaining = () => cards.map((c) => c.label).filter((label) => !placed.has(label));
  const snapshot = () => new Map([...placed].map(([k, v]) => [k, { ...v }]));
  /** 카드 칸의 카드 크기: 돌려 두었으면 가로·세로가 바뀐다 */
  const cardSize = (label) => swapSize(cardOf.get(label), cardTurn.has(label));
  const sizeOf = (label) => placed.get(label) ?? cardSize(label);
  /** 카드 방향(°): 카드 정의와 같으면 0, 가로·세로가 바뀌었으면 90 */
  const angleOf = (label) => (sizeOf(label).w === cardOf.get(label).w ? 0 : 90);
  /** 그 자리에 놓을 수 있나: 판 안이고 다른 면과 겹치지 않는다 */
  const free = (label, rect) => adapter.inside(rect) && ![...placed].some(([other, r]) => other !== label && rectsOverlap(r, rect));
  /** 판 밖으로 나가지 않게 왼쪽 위를 당긴다 */
  const clamp = (rect) => ({ ...rect, x: Math.max(0, Math.min(cols - rect.w, rect.x)), y: Math.max(0, Math.min(rows - rect.h, rect.y)) });
  const selectedTile = () => root.querySelector('.rect-tile.is-selected')?.dataset.label ?? null;
  const selectedCard = () => {
    const label = root.querySelector('.rect-card.is-selected')?.dataset.label ?? null;
    return label && !placed.has(label) ? label : null;
  };
  /** 지금 끄는 중인가 (엔진 끌기가 시작됐고 그 포인터를 이 판이 알고 있다) */
  const dragging = () => Boolean(press?.dragged && root.classList.contains('is-dragging-any'));

  function state() {
    const labels = cards.map((c) => c.label).filter((label) => placed.has(label));
    return { rects: labels.map((label) => ({ ...placed.get(label), label })), labels, count: placed.size, total: cards.length };
  }

  function emit(message) {
    if (onChange) onChange(state(), message);
    else if (message) ctx.feedback.announce(message);
  }

  function commit(next, message, touched = null, { keepHeld = false } = {}) {
    history.push(snapshot());
    if (history.length > MAX_UNDO) history.shift();
    placed = next;
    if (!keepHeld) held = null;
    if (touched !== undefined) last = touched && next.has(touched) ? touched : null;
    for (const label of placed.keys()) cardTurn.delete(label); // 놓으면 카드의 돌린 방향은 면의 크기가 된다
    hidePreview();
    render();
    ctx.sfx.play('click');
    emit(message ? `${message} 놓은 면 ${placed.size}/${cards.length}` : null);
  }

  // ── 동작 ────────────────────────────
  /**
   * label을 왼쪽 위 at에 놓는다(옮긴다). 판 밖이면 안으로 당기고, 다른 면과 겹치면 놓지 않는다 → 놓았으면 true
   * turned: 끄는 동안 돌린 대로(가로·세로를 바꿔) 놓는다
   */
  function place(label, at, verb = '놓았어요', turned = false) {
    if (!enabled || !label) return false;
    const size = swapSize(sizeOf(label), turned);
    const asIs = { x: at[0], y: at[1], w: size.w, h: size.h };
    let rect = clamp(asIs);
    // 새로 놓는 카드: 누른 칸을 왼쪽 위로 그대로 놓을 수 없고(다른 면에 걸리거나 판 밖으로 나감) 돌리면 놓을 수 있으면 돌려서 놓는다
    // — 좁은 틈에 끼워 넣을 때. 그래도 안 되면 판 안으로 당겨 놓는다. 끄는 동안 돌린 면은 돌린 그대로만 놓는다
    if (!placed.has(label) && !turned && !free(label, asIs)) {
      const other = { x: at[0], y: at[1], w: size.h, h: size.w };
      if (free(label, other)) rect = other;
      else if (!free(label, rect) && free(label, clamp(other))) rect = clamp(other);
    }
    if (!free(label, rect)) {
      ctx.feedback.announce('그 자리에는 다른 면이 있어요. 빈 곳에 놓아요.');
      flash();
      return false;
    }
    const now = placed.get(label);
    if (now && now.x === rect.x && now.y === rect.y && now.w === rect.w) {
      held = null;
      hidePreview();
      render();
      return false;
    }
    const next = snapshot();
    next.set(label, rect);
    commit(next, `${josa(nameOf(label), '을/를')} ${now ? (now.w === rect.w ? '옮겼어요' : '돌려서 옮겼어요') : verb}.`, label);
    return true;
  }

  function remove(label) {
    if (!enabled || !placed.has(label)) return false;
    const next = snapshot();
    next.delete(label);
    cardTurn.delete(label);
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

  /** 지금 가리키는 면: 키보드로 든 면 → 눌러 고른 면 → 고른 카드 → 마지막으로 놓은 면 */
  const pointed = () => held ?? selectedTile() ?? selectedCard() ?? (last && placed.has(last) ? last : null);

  /** 카드 칸의 카드를 90° 돌려 둔다(놓을 때 그 방향으로 놓인다) */
  function turnCard(label) {
    if (!enabled || !label || placed.has(label) || isSquare(label)) return false;
    if (cardTurn.has(label)) cardTurn.delete(label);
    else cardTurn.add(label);
    render();
    ctx.sfx.play('click');
    const size = cardSize(label);
    emit(`${nameOf(label)} 카드를 돌렸어요. ${adapter.sizeName(size.w, size.h)}.`);
    return true;
  }

  /** 면을 90° 돌린다(왼쪽 위는 그대로, 판 밖으로 나가면 안으로 당긴다). 돌릴 자리가 없으면 그대로 둔다. 카드 칸의 카드면 카드를 돌려 둔다 */
  function rotate(label = pointed()) {
    if (!enabled || !label) return false;
    if (!placed.has(label)) return turnCard(label);
    const now = placed.get(label);
    const rect = clamp({ x: now.x, y: now.y, w: now.h, h: now.w });
    return turnTo(label, [rect]);
  }

  /** 손잡이로 돌린다: 면의 가운데를 축으로 90°(칸에 맞춰), 판 밖이면 안으로 당기고, 그래도 안 되면 왼쪽 위를 그대로 두고 돌린다 */
  function turnAround(label) {
    if (!placed.has(label)) return turnCard(label);
    const now = placed.get(label);
    const turned = { w: now.h, h: now.w };
    // 가운데가 반 칸에 걸리면 좁아지는 쪽은 내리고 넓어지는 쪽은 올린다: 두 번 돌리면 늘 처음 자리로 돌아온다(돌릴수록 한쪽으로 흘러가지 않게)
    const snap = (at, shift) => (shift >= 0 ? Math.floor(at + shift) : Math.ceil(at + shift));
    const centered = { ...turned, x: snap(now.x, (now.w - turned.w) / 2), y: snap(now.y, (now.h - turned.h) / 2) };
    return turnTo(label, [centered, clamp(centered), clamp({ ...turned, x: now.x, y: now.y })]);
  }

  function turnTo(label, candidates) {
    const rect = candidates.find((r) => free(label, r));
    if (!rect) {
      ctx.feedback.info('돌릴 자리가 모자라요. 빈 곳으로 옮긴 다음 돌려요.');
      flash();
      render();
      return false;
    }
    const next = snapshot();
    next.set(label, rect);
    // 든 채로 돌려도 계속 들고 있다(손잡이도 그대로 — 손잡이에 있던 초점이 남는다)
    commit(next, `${josa(nameOf(label), '을/를')} 돌렸어요. ${adapter.sizeName(rect.w, rect.h)}.`, label, { keepHeld: true });
    if (held) {
      if (held === label) cursor = [rect.x, rect.y];
      showPreview(held, cursor);
    }
    render();
    return true;
  }

  function clearAll() {
    if (!enabled || placed.size === 0) return;
    cardTurn.clear();
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

  function showPreview(label, at, size = sizeOf(label)) {
    const rect = clamp({ x: at[0], y: at[1], w: size.w, h: size.h });
    putVars(preview, rect);
    preview.classList.toggle('is-blocked', !free(label, rect));
    preview.hidden = false;
  }
  function hidePreview() {
    preview.hidden = true;
  }

  /** 손잡이가 붙을 것: 판에 든·고른 면이나 카드 칸에서 고른 카드 (정사각형이 아닐 때, 끄는 중이 아닐 때) */
  function handleTarget() {
    if (!enabled || allSquare || root.classList.contains('is-dragging-any')) return null;
    const onBoard = held ?? selectedTile();
    if (onBoard && placed.has(onBoard)) return isSquare(onBoard) ? null : { where: 'board', label: onBoard };
    const card = selectedCard();
    return card && !isSquare(card) ? { where: 'tray', label: card } : null;
  }

  /** 손잡이 자리: 면의 오른쪽 위 모서리에(판 밖으로 나가면 다른 모서리에). 카드는 카드의 오른쪽 위에 카드 칸 안으로 당겨서 */
  function placeHandles() {
    const target = turning ? { where: turning.where, label: turning.label } : handleTarget();
    for (const el of [boardHandle, trayHandle]) {
      const on = Boolean(target && el.dataset.where === target.where);
      el.hidden = !on;
      if (!on) continue;
      el.setAttribute('aria-label', `${nameOf(target.label)} 돌리기 손잡이, 지금 ${angleOf(target.label)}°`);
      el.title = '돌리기 손잡이: 잡고 돌리거나 눌러서 90° 돌려요';
      if (turning) continue; // 돌리는 동안에는 손잡이가 손을 따라간다
      // 카드의 손잡이는 문서에서 그 카드 바로 뒤에 둔다: 키보드로 카드를 고른 뒤 Tab 한 번에 손잡이로 간다
      if (target.where === 'tray' && el.previousElementSibling !== trayCards.get(target.label)) trayCards.get(target.label).after(el);
      const at = target.where === 'board' ? boardHandleAt(target.label) : trayHandleAt(target.label);
      el.style.left = `${at[0]}px`;
      el.style.top = `${at[1]}px`;
    }
  }
  function boardHandleAt(label) {
    const r = placed.get(label);
    const [W, H] = [cols * cellPx, rows * cellPx];
    const half = HANDLE / 2;
    const corners = [[r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y], [r.x, r.y + r.h]].map(([x, y]) => [x * cellPx - half, y * cellPx - half]);
    const fits = ([x, y]) => x >= 0 && y >= 0 && x + HANDLE <= W && y + HANDLE <= H;
    const [x, y] = corners.find(fits) ?? corners[0];
    return [Math.max(0, Math.min(W - HANDLE, x)), Math.max(0, Math.min(H - HANDLE, y))];
  }
  function trayHandleAt(label) {
    const card = trayCards.get(label).getBoundingClientRect();
    const box = trayEl.getBoundingClientRect();
    const half = HANDLE / 2;
    const x = card.right - box.left - half;
    const y = card.top - box.top - half;
    return [Math.max(0, Math.min(box.width - HANDLE, x)), Math.max(0, Math.min(Math.max(0, box.height - HANDLE), y))];
  }

  function render() {
    const selected = selectedTile();
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
      const size = used ? cardOf.get(label) : cardSize(label);
      el.classList.toggle('is-used', used);
      el.classList.toggle('dnd-item', !used);
      el.disabled = !enabled;
      el.setAttribute('aria-label', `${nameOf(label)} 카드, ${adapter.sizeName(size.w, size.h)}${used ? ', 판에 놓음' : ''}`);
      const rect = el.querySelector('.size-rect');
      rect.style.setProperty('--cw', String(size.w));
      rect.style.setProperty('--ch', String(size.h));
      el.querySelector('.size-text').textContent = `${size.w}×${size.h} cm`;
      const check = el.querySelector('.used-check');
      if (used && !check) el.append(icon('check', { class: 'used-check' }));
      if (!used && check) check.remove();
    }
    placeHandles();
  }

  function fit(host) {
    const box = host.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    cellPx = Math.max(RECT_MIN_CELL, Math.floor(Math.min(MAX_CELL, box.height / rows, box.width / cols)));
    boardEl.style.setProperty('--cell', `${cellPx}px`);
    placeHandles();
  }

  /** 화면의 점이 놓인 칸 [x, y] (판 밖이면 null) */
  function cellAtPoint(clientX, clientY) {
    const box = boardEl.getBoundingClientRect();
    const x = Math.floor((clientX - box.left) / cellPx);
    const y = Math.floor((clientY - box.top) / cellPx);
    return x >= 0 && y >= 0 && x < cols && y < rows ? [x, y] : null;
  }

  /** 끄는 면의 크기와 집은 칸: 끄는 동안 돌린 만큼 (카드 칸의 카드는 가운데를 집는다) */
  function dragShape(label) {
    const size = sizeOf(label);
    const k = press?.dragged && press.label === label ? dragTurns : 0;
    const grab = press?.dragged && press.label === label && press.grab ? press.grab : null;
    if (grab) return turnedGrab(grab, size, k);
    const turned = swapSize(size, k % 2 === 1);
    return { grab: [Math.floor((turned.w - 1) / 2), Math.floor((turned.h - 1) / 2)], size: turned };
  }
  /** 끌어 놓을 때 왼쪽 위: 놓인 면은 집은 칸이 포인터 칸에 오게, 카드 칸의 카드는 가운데가 포인터 칸에 오게 */
  function dropOrigin(label, at) {
    const { grab } = dragShape(label);
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
      const turned = dragged && dragTurns % 2 === 1;
      hidePreview();
      if (targetEl.dataset.tray) {
        dragTurns = 0;
        if (itemEl.classList.contains('rect-tile')) return remove(label);
        render();
        return false;
      }
      const at = targetEl.dataset.cell.split(',').map(Number);
      // 끌어 놓았으면 집은 자리 그대로(끄는 동안 돌렸으면 돌린 대로), 눌러 고른 뒤 칸을 눌렀으면 그 칸이 왼쪽 위
      const origin = dragged ? dropOrigin(label, at) : at;
      dragTurns = 0;
      const ok = place(label, origin, '놓았어요', turned);
      if (ok) cursor = [placed.get(label).x, placed.get(label).y];
      render();
      return ok;
    },
  });

  function onClickCapture(event) {
    if (!enabled || justDropped) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.turn-handle')) return; // 손잡이는 제 click이 받는다
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
    // 끄는 중에 다른 손가락이 닿았다: 끄는 것은 그대로 (그 손가락은 돌리기 — onOtherPointer)
    if (dragging() && event.pointerId !== press.id) return;
    justDropped = false;
    dragTurns = 0;
    const tile = event.target instanceof Element ? event.target.closest('.rect-tile, .rect-card') : null;
    press = null;
    if (!tile || !root.contains(tile)) return;
    let grab = null;
    if (tile.classList.contains('rect-tile')) {
      const box = tile.getBoundingClientRect();
      const r = placed.get(tile.dataset.label);
      if (r) grab = [Math.max(0, Math.min(r.w - 1, Math.floor((event.clientX - box.left) / cellPx))), Math.max(0, Math.min(r.h - 1, Math.floor((event.clientY - box.top) / cellPx)))];
    }
    press = { label: tile.dataset.label, id: event.pointerId, grab, x: event.clientX, y: event.clientY, dragged: false };
  }
  root.addEventListener('pointerdown', onPressCapture, true);

  /** 끄는 동안(마우스·손가락) 놓일 자리를 미리 보인다. 눌러 고른 채 마우스를 움직일 때도 같다 */
  function onMove(event) {
    if (!enabled) return;
    if (press && event.pointerId === press.id && !press.dragged && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8) press.dragged = true;
    // 마우스 왼쪽 버튼으로 끄는 중에 오른쪽 버튼을 함께 누름(포인터 이벤트로는 버튼이 바뀐 pointermove로 온다)
    if (event.pointerType === 'mouse' && event.button === 2 && (event.buttons & 2)) rightPress(event);
    const isDrag = dragging() && event.pointerId === press.id;
    if (isDrag) lastPoint = [event.clientX, event.clientY];
    const picked = !isDrag && event.pointerType === 'mouse' ? root.querySelector('.rect-tile.is-selected, .rect-card.is-selected')?.dataset.label : null;
    const label = isDrag ? press.label : picked;
    if (!label) return;
    showDragPreview(label, event.clientX, event.clientY, isDrag);
  }
  function showDragPreview(label, x, y, isDrag) {
    const at = cellAtPoint(x, y);
    if (!at) {
      hidePreview();
      return;
    }
    if (!isDrag) {
      showPreview(label, at);
      return;
    }
    showPreview(label, dropOrigin(label, at), dragShape(label).size);
  }
  window.addEventListener('pointermove', onMove);
  const onRelease = (event) => {
    if (press && event.pointerId !== press.id && dragging()) return; // 끄는 중에 돌리기로 쓴 다른 손가락
    // 끄는 동안 돌린 복제는 놓기 직전에 처음 모습으로 되돌린다: 놓이면 곧 사라지고, 놓을 곳이 아니면 처음 모습으로 제자리에 돌아간다
    if (press && event.pointerId === press.id) restoreGhost();
    if (!held) hidePreview();
  };
  window.addEventListener('pointerup', onRelease);
  window.addEventListener('pointercancel', onRelease);

  // ── 끄는 중 돌리기: R 키 · 마우스 오른쪽 버튼 · 다른 손가락으로 톡 (spec 16-16) ─────
  /** 지금 끄는 복제(엔진이 <body>에 붙인 .dnd-ghost) */
  const ghostEl = () => [...document.querySelectorAll('body > .dnd-ghost')].filter((g) => !g.classList.contains('is-returning')).at(-1) ?? null;
  function turnGhost() {
    const ghost = ghostEl();
    if (!ghost || !press) return;
    const style = ghost.style;
    const inner = ghost.querySelector('.size-rect');
    if (!ghostHome) {
      ghostHome = {
        ghost,
        left: style.getPropertyValue('left'),
        top: style.getPropertyValue('top'),
        width: style.getPropertyValue('width'),
        height: style.getPropertyValue('height'),
        inner: inner ? [inner.style.width, inner.style.height] : null,
        text: ghost.querySelector('.size-text')?.textContent ?? null,
      };
    }
    const odd = dragTurns % 2 === 1;
    if (ghost.classList.contains('rect-tile')) {
      // 놓인 면의 복제: 가로·세로를 바꾸고, 집은 자리가 포인터 아래에 그대로 있게 옮긴다
      const [L, T, W, H] = ['left', 'top', 'width', 'height'].map((k) => parseFloat(ghostHome[k]));
      let [ox, oy, w, hh] = [press.x - L, press.y - T, W, H];
      for (let i = 0; i < dragTurns; i += 1) [ox, oy, w, hh] = [hh - oy, ox, hh, w];
      style.setProperty('left', `${press.x - ox}px`, 'important');
      style.setProperty('top', `${press.y - oy}px`, 'important');
      style.setProperty('width', `${w}px`, 'important');
      style.setProperty('height', `${hh}px`, 'important');
    } else if (inner && ghostHome.inner) {
      // 카드 칸 카드의 복제: 카드 안의 작은 직사각형과 크기 글자를 돌린다
      const [iw, ih] = ghostHome.inner;
      inner.style.width = odd ? ih : iw;
      inner.style.height = odd ? iw : ih;
      const size = dragShape(press.label).size;
      const text = ghost.querySelector('.size-text');
      if (text) text.textContent = `${size.w}×${size.h} cm`;
    }
  }
  function restoreGhost() {
    if (!ghostHome) return;
    const { ghost } = ghostHome;
    if (ghost.isConnected) {
      for (const k of ['left', 'top', 'width', 'height']) ghost.style.setProperty(k, ghostHome[k], 'important');
      const inner = ghost.querySelector('.size-rect');
      if (inner && ghostHome.inner) [inner.style.width, inner.style.height] = ghostHome.inner;
      const text = ghost.querySelector('.size-text');
      if (text && ghostHome.text != null) text.textContent = ghostHome.text;
    }
    ghostHome = null;
  }

  /** 끄는 면을 시계 방향으로 90° 돌린다(놓을 때 돌린 대로 놓인다) → 돌렸으면 true */
  function turnWhileDragging() {
    if (!enabled || !dragging()) return false;
    const label = press.label;
    if (isSquare(label)) return false; // 정사각형은 돌려도 같은 모양이다
    dragTurns = (dragTurns + 1) % 4;
    turnGhost();
    if (lastPoint) showDragPreview(label, lastPoint[0], lastPoint[1], true);
    ctx.sfx.play('click');
    const size = dragShape(label).size;
    ctx.feedback.announce(`${josa(nameOf(label), '을/를')} 돌렸어요. ${adapter.sizeName(size.w, size.h)}.`);
    return true;
  }

  function onKeyTurn(event) {
    if (!dragging() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== 'r' && event.key !== 'R' && event.key !== 'ㄱ') return; // ㄱ: 한글 자판 상태에서 누른 R
    event.preventDefault();
    event.stopPropagation(); // 판의 R(커서 칸의 면 돌리기)로 가지 않게
    turnWhileDragging();
  }
  window.addEventListener('keydown', onKeyTurn, true);

  let rightAt = -Infinity;
  let menuUntil = 0;
  /** 끄는 중에 누른 오른쪽 버튼: 한 번 누름에 한 번 돌린다(마우스 이벤트와 포인터 이벤트로 두 번 와도) */
  function rightPress(event) {
    if (!dragging()) return;
    event.preventDefault?.();
    menuUntil = performance.now() + 1500; // 오른쪽 버튼을 뗄 때 뜨는 메뉴도 막는다
    if (event.timeStamp - rightAt < 120) return;
    rightAt = event.timeStamp;
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

  const tapIds = new Set(); // 돌리기로 쓴 다른 손가락 (그 손가락의 click은 아무것도 누르지 않게 막는다)
  function onOtherPointer(event) {
    if (event.pointerType !== 'touch' || !dragging() || event.pointerId === press.id) return;
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
    setTimeout(() => tapIds.delete(event.pointerId), 400); // 그 손가락의 click이 오지 않았으면 잊는다
  };
  window.addEventListener('pointerup', forgetTap, true);

  let afterTimer = null;
  const onClickAfter = () => {
    placeHandles(); // 고르자마자 손잡이가 생긴다(키보드로 카드를 고르고 바로 Tab을 눌러도 손잡이로 간다)
    clearTimeout(afterTimer);
    afterTimer = setTimeout(() => {
      if (!held && !root.classList.contains('has-selection')) hidePreview();
      render();
      emit(null); // 고른 면이 바뀌면 [돌리기]가 가리키는 면도 바뀐다
    }, 0);
  };
  root.addEventListener('click', onClickAfter);

  // ── 돌리기 손잡이: 잡고 돌리기(마우스·터치) · 누르기 · 키보드 ─────
  let turning = null; // { where, label, id, x0, y0, cx, cy, a0, active, deg, el, hx, hy, handle }
  let swallowHandleClick = false;
  function onHandleDown(event) {
    const handle = event.currentTarget;
    if (!enabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const target = handleTarget();
    if (!target || target.where !== handle.dataset.where) return;
    swallowHandleClick = false;
    event.stopPropagation(); // 끌기 엔진·판이 이 누르기를 면 고르기·끌기로 받지 않게
    const el = target.where === 'board' ? tileEls.get(target.label) : trayCards.get(target.label).querySelector('.size-rect');
    const b = el.getBoundingClientRect();
    const [cx, cy] = [b.left + b.width / 2, b.top + b.height / 2];
    turning = {
      ...target, id: event.pointerId, x0: event.clientX, y0: event.clientY, cx, cy, a0: Math.atan2(event.clientY - cy, event.clientX - cx),
      active: false, deg: 0, el, handle, hx: handle.offsetLeft, hy: handle.offsetTop,
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
    // 손잡이를 누른 동안의 touchmove는 "우리가 썼다"고 알린다: 화면이 쓸리지도, 뗀 뒤 관성 스크롤이 돌지도 않게(끈 뒤 첫 누르기가 먹히게)
    if (turning && event.cancelable) event.preventDefault();
  }
  function onHandleMove(event) {
    if (!turning || event.pointerId !== turning.id) return;
    if (!turning.active) {
      if (Math.hypot(event.clientX - turning.x0, event.clientY - turning.y0) < TURN_START) return;
      turning.active = true;
      root.classList.add('is-turning-face');
    }
    event.preventDefault();
    const a = Math.atan2(event.clientY - turning.cy, event.clientX - turning.cx);
    turning.deg = ((a - turning.a0) * 180) / Math.PI;
    turning.el.style.rotate = `${turning.deg.toFixed(2)}deg`;
    // 손잡이도 면의 모서리를 따라 돈다
    const handleBox = turning.handle.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const half = HANDLE / 2;
    const hx = handleBox.left + turning.hx + half - turning.cx;
    const hy = handleBox.top + turning.hy + half - turning.cy;
    const rad = (turning.deg * Math.PI) / 180;
    const [rx, ry] = [hx * Math.cos(rad) - hy * Math.sin(rad), hx * Math.sin(rad) + hy * Math.cos(rad)];
    turning.handle.style.left = `${turning.cx + rx - handleBox.left - half}px`;
    turning.handle.style.top = `${turning.cy + ry - handleBox.top - half}px`;
  }
  function endTurning() {
    window.removeEventListener('pointermove', onHandleMove);
    window.removeEventListener('pointerup', onHandleUp);
    window.removeEventListener('pointercancel', onHandleCancel);
    window.removeEventListener('touchmove', onHandleTouch);
    root.classList.remove('is-turning-face');
    const t = turning;
    turning = null;
    if (t) t.el.style.rotate = '';
    return t;
  }
  function onHandleUp(event) {
    if (!turning || event.pointerId !== turning.id) return;
    const t = endTurning();
    if (!t.active) return; // 누르기만 했다: 뒤따르는 click이 90° 돌린다
    swallowHandleClick = true; // 돌린 뒤 따라오는 click은 한 번 막는다 (새로 누르면 풀린다)
    setTimeout(() => {
      swallowHandleClick = false;
    }, 0);
    const snapped = (((Math.round(t.deg / 90) * 90) % 360) + 360) % 360;
    if (snapped === 90 || snapped === 270) {
      turnAround(t.label);
      return;
    }
    render();
    ctx.feedback.announce(snapped === 180 ? '반 바퀴 돌려도 가로와 세로는 그대로예요.' : '제자리로 돌아왔어요.');
  }
  function onHandleCancel(event) {
    if (!turning || event.pointerId !== turning.id) return;
    endTurning();
    render();
  }
  function onHandleClick(event) {
    event.stopPropagation(); // 카드 칸(놓을 곳)이 이 누르기를 받지 않게
    event.preventDefault();
    if (swallowHandleClick) {
      swallowHandleClick = false;
      return;
    }
    const target = handleTarget();
    if (!target || target.where !== event.currentTarget.dataset.where) return;
    turnAround(target.label); // 손잡이는 같은 요소이고 자리만 옮기므로 초점이 그대로 남는다
  }
  function onHandleKey(event) {
    const target = handleTarget();
    if (!target) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      turnAround(target.label);
    } else if (event.key === 'Escape') {
      // 고르기를 풀고 초점을 그 면(카드)으로 돌려보낸다
      event.preventDefault();
      event.stopPropagation();
      const wasHeld = held;
      held = null;
      dnd.clearSelection();
      hidePreview();
      render();
      if (target.where === 'tray') trayCards.get(target.label).focus({ preventScroll: true });
      else {
        if (!wasHeld) cursor = [placed.get(target.label).x, placed.get(target.label).y];
        render();
        cellEls.get(adapter.key(cursor)).focus({ preventScroll: true });
      }
      ctx.feedback.announce('제자리에 두었어요.');
    }
  }
  for (const el of [boardHandle, trayHandle]) {
    el.addEventListener('pointerdown', onHandleDown);
    el.addEventListener('click', onHandleClick);
    el.addEventListener('keydown', onHandleKey);
  }

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
        if (turning) endTurning();
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
      if (turning) endTurning();
      restoreGhost();
      dnd.destroy();
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('pointerdown', onPressCapture, true);
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
      boardEl.removeEventListener('keydown', onKey);
    },
  };
}
