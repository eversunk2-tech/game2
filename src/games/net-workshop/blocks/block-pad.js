/**
 * 쌓기 도구: 내 쌓기(높이 지도)와 되돌리기 기록, "위에서 본 판", 쌓기·빼기·되돌리기·모두 치우기 버튼. 기획서: spec-grade6.md 3-2절
 *
 * "위에서 본 판"(48px 칸 3×3)은 입체의 면을 누르는 것과 같은 일을 한다 — 비스듬히 보이는 면은 48px보다 작으므로
 * 누르는 곳 48px 기준은 이 판으로 지킨다. 끌지 않고도, 키보드만으로도 쌓기·빼기가 모두 된다.
 *   마우스·터치: [쌓기] 상태에서 칸을 누르면 그 자리의 맨 위에 1개, [빼기] 상태에서 누르면 맨 위 1개가 빠진다
 *   키보드: 방향키로 자리 이동, Enter·Space = 1개 쌓기, Backspace·Delete = 1개 빼기, 숫자 0~3 = 그 자리를 그 높이로, Ctrl+Z = 되돌리기
 * 무대(block-view.js)의 누르기(tap)도 여기로 온다: 누른 면 → 바뀌는 자리(blocks.js targetOf).
 */
import { icon } from '../../../shared/ui/icons.js';
import { COLS, MAX_H, ROWS, count, emptyMap, place, remove, sameMap, setHeight, targetOf } from './blocks.js';
import { spotName } from './blocks-logic.js';

export const FULL_TEXT = `여기는 ${MAX_H}층까지 쌓을 수 있어요.`;
export const OUTSIDE_TEXT = '판 밖에는 놓을 수 없어요.';
export const EMPTY_TEXT = '여기에는 뺄 쌓기나무가 없어요.';

/**
 * → { band(매트 아래 띠), pad(위에서 본 판), getMap, load(지도 — 기록을 비우고 새로 시작), lock, setGoal, onChange, undo, destroy }
 * onChange(fn): 쌓기가 바뀔 때마다 fn({ map, kind: 'add' | 'remove' | 'set' | 'clear' | 'undo', x, y })
 */
export function createBlockTools({ ctx, view }) {
  const { h } = ctx;
  let map = emptyMap();
  let history = [];
  let mode = 'add';
  let locked = false;
  let focusAt = [0, 0];
  const listeners = new Set();

  const modeButton = (value, iconName, label) => h('button', {
    type: 'button',
    class: 'btn blk-mode',
    dataset: { mode: value },
    'aria-pressed': 'false',
    onclick: () => {
      ctx.sfx.play('click');
      setMode(value);
    },
  }, icon(iconName), h('span', null, label));
  const addButton = modeButton('add', 'blockadd', '쌓기');
  const removeButton = modeButton('remove', 'blockremove', '빼기');
  // 좁은 매트에서는 글자를 숨기고 그림만 보인다(blocks.css) — 이름은 aria-label·title로 늘 읽힌다
  const undoButton = h('button', { type: 'button', class: 'btn blk-undo', disabled: true, 'aria-label': '되돌리기', title: '되돌리기', onclick: () => undo() }, icon('undo'), h('span', null, '되돌리기'));
  const clearButton = h('button', { type: 'button', class: 'btn blk-clear', disabled: true, 'aria-label': '모두 치우기', title: '모두 치우기', onclick: () => clearAll() }, icon('trash'), h('span', null, '모두 치우기'));
  const countText = h('b', { class: 'blk-count' }, '0');
  const band = h('div', { class: 'mat-tools blk-tools' },
    h('div', { class: 'blk-modes', role: 'group', 'aria-label': '무대와 판을 누르면 할 일' }, addButton, removeButton),
    undoButton, clearButton);

  // 위에서 본 판: 뒷줄이 위, 앞줄이 아래 (아래에 "앞", 오른쪽에 "옆")
  const cells = [];
  const rows = [];
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    const row = [];
    for (let x = 0; x < COLS; x += 1) {
      const button = h('button', {
        type: 'button',
        class: 'blk-cell',
        role: 'gridcell',
        tabindex: '-1',
        dataset: { x, y },
        onclick: () => press(x, y),
      }, h('span', { class: 'blk-cell-n' }));
      cells.push({ x, y, button });
      row.push(button);
    }
    rows.push(h('div', { class: 'blk-pad-row', role: 'row' }, row));
  }
  const grid = h('div', { class: 'blk-pad-grid', role: 'grid', 'aria-label': '위에서 본 판. 방향키로 자리를 옮기고, Enter는 쌓기, Backspace는 빼기, 숫자 0부터 3은 그 높이로 맞추기예요.' }, rows);
  const pad = h('div', { class: 'blk-padbox' },
    h('p', { class: 'blk-pad-title' }, '위에서 본 판'),
    grid,
    h('span', { class: 'blk-pad-side', 'aria-hidden': 'true' }, '옆'),
    h('span', { class: 'blk-pad-front', 'aria-hidden': 'true' }, '앞'),
    h('p', { class: 'blk-pad-count' }, '쌓은 쌓기나무 ', countText, '개'));
  const cellAt = (x, y) => cells.find((c) => c.x === x && c.y === y);

  function setMode(next) {
    mode = next;
    addButton.setAttribute('aria-pressed', String(mode === 'add'));
    removeButton.setAttribute('aria-pressed', String(mode === 'remove'));
    pad.classList.toggle('is-remove', mode === 'remove');
    view.setMode(mode);
  }

  function paint() {
    for (const c of cells) {
      const n = map[c.y][c.x];
      c.button.firstChild.textContent = n > 0 ? String(n) : '';
      c.button.classList.toggle('is-on', n > 0);
      c.button.setAttribute('aria-label', `${spotName(c.x, c.y)}, 쌓기나무 ${n}개`);
      c.button.setAttribute('tabindex', c.x === focusAt[0] && c.y === focusAt[1] ? '0' : '-1');
      c.button.disabled = locked;
    }
    const total = count(map);
    countText.textContent = String(total);
    undoButton.disabled = locked || history.length === 0;
    clearButton.disabled = locked || total === 0;
    addButton.disabled = locked;
    removeButton.disabled = locked;
  }

  /** 새 높이 지도로 바꾼다(기록에 남긴다). 바뀐 것이 없으면 false */
  function commit(next, info) {
    if (locked || !next || sameMap(next, map)) return false;
    history.push(map);
    map = next;
    view.setMap(map);
    paint();
    for (const fn of listeners) fn({ map: getMap(), ...info });
    return true;
  }

  const total = () => `모두 ${count(map)}개`;

  /** 그 자리(x, y)의 맨 위에 하나 쌓는다 */
  function addAt(x, y) {
    if (locked) return false;
    if (map[y][x] >= MAX_H) {
      ctx.feedback.info(FULL_TEXT);
      return false;
    }
    commit(place(map, { x, y }), { kind: 'add', x, y });
    ctx.sfx.play('click');
    ctx.feedback.announce(`${spotName(x, y)}에 쌓았어요. ${total()}`);
    return true;
  }

  /** 그 자리의 맨 위 하나를 뺀다 */
  function removeAt(x, y) {
    if (locked) return false;
    if (map[y][x] <= 0) {
      ctx.feedback.info(EMPTY_TEXT);
      return false;
    }
    commit(remove(map, { x, y }), { kind: 'remove', x, y });
    ctx.sfx.play('click');
    ctx.feedback.announce(`${spotName(x, y)}에서 뺐어요. ${total()}`);
    return true;
  }

  /** 위에서 본 판의 칸을 눌렀다: 지금 상태(쌓기·빼기)대로 */
  function press(x, y) {
    focusAt = [x, y];
    if (mode === 'remove') removeAt(x, y);
    else addAt(x, y);
    paint();
  }

  /** 무대에서 면(또는 판의 자리)을 짧게 눌렀다. right: 마우스 오른쪽 누르기 = 빼기 */
  function tap(hit, { right = false } = {}) {
    if (locked) return;
    const target = targetOf(map, hit, right ? 'remove' : mode);
    if (target.error === 'full') ctx.feedback.info(FULL_TEXT);
    else if (target.error === 'outside') ctx.feedback.info(OUTSIDE_TEXT);
    else if (target.error === 'empty') ctx.feedback.info(EMPTY_TEXT);
    else if (right || mode === 'remove') removeAt(target.x, target.y);
    else addAt(target.x, target.y);
  }

  function undo() {
    if (locked || history.length === 0) return false;
    map = history.pop();
    view.setMap(map);
    paint();
    ctx.sfx.play('click');
    ctx.feedback.announce(`되돌렸어요. ${total()}`);
    for (const fn of listeners) fn({ map: getMap(), kind: 'undo' });
    return true;
  }

  function clearAll() {
    if (commit(emptyMap(), { kind: 'clear' })) {
      ctx.sfx.play('click');
      ctx.feedback.announce('모두 치웠어요. 모두 0개');
    }
  }

  const getMap = () => map.map((row) => [...row]);

  function moveFocus(dx, dy) {
    const x = Math.max(0, Math.min(COLS - 1, focusAt[0] + dx));
    const y = Math.max(0, Math.min(ROWS - 1, focusAt[1] + dy));
    focusAt = [x, y];
    paint();
    cellAt(x, y).button.focus({ preventScroll: true });
  }

  function onGridKey(event) {
    const cell = cells.find((c) => c.button === event.target);
    if (!cell || event.ctrlKey || event.metaKey || event.altKey) return;
    focusAt = [cell.x, cell.y];
    const { key } = event;
    if (key === 'ArrowLeft') moveFocus(-1, 0);
    else if (key === 'ArrowRight') moveFocus(1, 0);
    else if (key === 'ArrowUp') moveFocus(0, 1); // 판의 위쪽 = 뒷줄
    else if (key === 'ArrowDown') moveFocus(0, -1);
    else if (key === 'Enter' || key === ' ') addAt(cell.x, cell.y);
    else if (key === 'Backspace' || key === 'Delete') removeAt(cell.x, cell.y);
    else if (/^[0-3]$/.test(key)) {
      const value = Number(key);
      if (commit(setHeight(map, cell, value), { kind: 'set', x: cell.x, y: cell.y })) {
        ctx.sfx.play('click');
        ctx.feedback.announce(`${spotName(cell.x, cell.y)}을 ${value}층으로 맞췄어요. ${total()}`);
      }
    } else return;
    event.preventDefault();
    paint();
  }
  grid.addEventListener('keydown', onGridKey);
  grid.addEventListener('focusin', (event) => {
    const cell = cells.find((c) => c.button === event.target);
    if (cell) focusAt = [cell.x, cell.y];
  });

  /** Ctrl+Z · Cmd+Z = 되돌리기 (플레이 화면 어디에 초점이 있든) */
  function onUndoKey(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'z') return;
    if (!ctx.el.isConnected || locked) return;
    event.preventDefault();
    undo();
  }
  document.addEventListener('keydown', onUndoKey);

  const offTap = view.on('tap', tap);
  setMode('add');
  paint();

  return {
    band,
    pad,
    getMap,
    /** 새 문항: 그 지도로 시작하고 되돌리기 기록을 비운다 */
    load(next = emptyMap()) {
      map = next.map((row) => [...row]);
      history = [];
      focusAt = [0, 0];
      setMode('add');
      view.setMap(map);
      paint();
    },
    /** 잠그면 쌓기·빼기·되돌리기가 모두 꺼진다 (맞힌 뒤) */
    lock(value) {
      locked = Boolean(value);
      view.setEditable(!locked);
      paint();
    },
    /** 판의 한 칸을 "여기에 놓아요"로 표시한다 (놀이터). null이면 지운다 */
    setGoal(spot) {
      for (const c of cells) c.button.classList.toggle('is-goal', Boolean(spot) && c.x === spot[0] && c.y === spot[1]);
    },
    mode: () => mode,
    undo,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    focusPad() {
      cellAt(focusAt[0], focusAt[1]).button.focus({ preventScroll: true });
    },
    destroy() {
      offTap();
      listeners.clear();
      grid.removeEventListener('keydown', onGridKey);
      document.removeEventListener('keydown', onUndoKey);
    },
  };
}
