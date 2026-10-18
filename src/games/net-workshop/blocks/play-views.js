/**
 * 쌓기나무 단계 화면 (S2: 3·4차시). 기획서: spec-grade6.md 2-4·3-4·3-5·4·5절, 공통 규칙: common-rules.md
 * 틀은 S1과 같다(play-blocks.js의 createBench: 왼쪽 재단 매트 + 오른쪽 작업 지시서).
 *
 *   flip      한쪽(앞·오른쪽)에서 본 모양을 보고 반대쪽(뒤·왼쪽)에서 본 모양을 보기 셋 가운데 고른다. 답하기 전에는 멈춘 그림
 *   draw      만든 모양(개수를 알려 줌)을 보고 위·앞·옆에서 본 모양을 모눈에 칠한다 → [확인하기] → 입체가 그 방향으로 돌고 내 그림을 겹쳐 견줌
 *   build     위·앞·옆에서 본 모양을 보고 쌓는다 → "다른 개수로도?" 예상 → (여러 가지인 문항) 다른 개수로 한 번 더
 *   write     만든 모양을 돌려 보며 위에서 본 모양의 자리마다 수를 쓴다 → 맞히면 자리마다 아래부터 세어 보인다
 *   fromnum   수를 쓴 위에서 본 모양을 보고 쌓는다
 *   numviews  수를 쓴 위에서 본 모양만 보고 앞·옆에서 본 모양을 칠하고, 맞는 모양 그림을 고른다. 답하기 전에는 입체가 없다
 *
 * 정답 노출(5절): 그림을 보고 그리거나 고르는 문항은 답하기 전에 돌릴 수 없다(멈춘 그림 — 숨겨진 쌓기나무가 없는 모양만 낸다).
 * 수 쓰기(write)는 돌려 보며 세는 것이 과제라 늘 돌릴 수 있다. 수만 보고 하는 문항(numviews)은 답하기 전에 입체가 없다.
 * 칠하기·수 쓰기·쌓기는 맞힐 때까지 다시 하고 틀린 시도도 기록한다. 고치지 않고 또 [확인하기]를 누르면 다시 세지 않는다(S1-3과 같게).
 */
import { cellsOf, count, emptyMap, hiddenCells, mapKey } from './blocks.js';
import {
  BLOCK_TAGS,
  FLIP_NAMES,
  alignCells,
  alignMap,
  columnsToCells,
  describeView,
  drawHint,
  judgeDrawing,
  judgeFlip,
  judgeNumPick,
  judgeNumberBuild,
  judgeNumbers,
  judgeThree,
  judgeThreeGuess,
  judgeThreeOther,
  numberBuildHint,
  spotName,
  threeHint,
  viewCells,
  viewKey,
  viewTitle,
} from './blocks-logic.js';
import { EDGE_FAR, createBlockPicture, prefersReducedMotion } from './block-view.js';
import { createGridPicture, createNumberGrid, createPaintGrid, describeNumbers } from './grid-draw.js';
import {
  LOOK_PAUSE,
  SAME_CHECK_TEXT,
  choiceButton,
  createBench,
  createChecker,
  figure,
  finishStage,
  markChoice,
  resetChoices,
  settle,
  toastOf,
} from './play-blocks.js';
import { icon } from '../../../shared/ui/icons.js';

/** S2 화면의 단계 종류 (index.js가 이 종류만 이 파일로 넘긴다) */
export const VIEW_STAGE_KINDS = Object.freeze(['flip', 'draw', 'build', 'write', 'fromnum', 'numviews']);

/** 세어 보일 때 쌓기나무 하나마다 머무는 시간(ms) */
const COUNT_STEP = 220;
/** 맞힌 뒤 위 → 앞 → 옆으로 차례로 돌 때 머무는 시간(ms) */
const VIEW_PAUSE = 1100;

/** 판 위·앞·옆에서 보기 버튼 이름 */
const VIEW_SNAP = { top: 'top', front: 'front', side: 'side' };
const VIEW_SHORT = { top: '위', front: '앞', side: '옆' };

/**
 * 작업대 표시: 3·4차시 화면(blocks.css의 .blk-wide — 폭 1001~1279px에서 판 안쪽 여백을 줄인다).
 * paint: 모눈을 칠하는 단계(그리기·수만 보고) — 판이 매트 아래로 가는 낮은 화면(960×768 등)에서 매트를 낮춰 모눈과 [확인하기]가 한 화면에 들어오게 한다
 * (판의 폭·매트의 높이는 단계 안에서 바뀌지 않는다 — 머리와 매트가 움직이지 않게)
 */
export function wideBench(bench, { paint = false } = {}) {
  bench.mat.parentElement.classList.add('blk-wide');
  if (paint) bench.mat.parentElement.classList.add('blk-paint-bench');
}
/** 판이 매트 옆에 있는 두 칸 배치(blocks.css와 같은 1001px) */
export const TWO_COLUMNS = '(min-width: 1001px)';

/** 내가 그린 그림을 목표가 놓인 자리로 옮겨 무대에 겹칠 칸: [{ r, c, state }] */
function overlayCells(mine, target, kind) {
  const t = viewCells(target, kind);
  const m = alignCells(mine, t, kind);
  const out = [];
  t.forEach((row, r) => row.forEach((on, c) => {
    if (on || m[r][c]) out.push({ r, c, state: on && m[r][c] ? 'ok' : on ? 'missing' : 'extra' });
  }));
  return out;
}

/**
 * 주어진 그림(목표의 그 방향 모양)을 내 쌓기 위에 겹칠 칸: 주어진 그림을 내 쌓기의 자리로 옮겨 견준다 → [{ r, c, state }]
 * (missing: 주어진 그림에는 있는데 내 쌓기에는 없는 칸 · extra: 내 쌓기에만 있는 칸)
 */
function givenOverlay(mine, target, kind) {
  const m = viewCells(mine, kind);
  const t = alignCells(viewCells(target, kind), m, kind);
  const out = [];
  m.forEach((row, r) => row.forEach((on, c) => {
    if (on || t[r][c]) out.push({ r, c, state: on && t[r][c] ? 'ok' : t[r][c] ? 'missing' : 'extra' });
  }));
  return out;
}

/**
 * 자리마다 쌓기나무를 아래부터 하나씩 세어 보인다(굵은 테두리 + 그 자리에서 센 수). 움직임 줄이기·?fx=low면 끝 모습을 바로.
 * map: 무대에 놓인 높이 지도 · spots: 셀 자리 [[x, y]](차례대로) → 다 세면 done(n)
 */
export function countUp(bench, map, spots, done) {
  const { view } = bench;
  const cubes = spots.flatMap(([x, y]) => Array.from({ length: map[y][x] }, (_, z) => [x, y, z]));
  const show = (n) => {
    const counted = cubes.slice(0, n);
    const tally = spots.map(([x, y]) => ({ x, y, z: map[y][x] - 1, n: counted.filter((c) => c[0] === x && c[1] === y).length })).filter((t) => t.n > 0);
    view.setMarks({ counted, tally });
    view.el.dataset.counted = String(n);
  };
  if (prefersReducedMotion() || view.el.closest('.fx-low')) {
    show(cubes.length);
    done?.(cubes.length);
    return;
  }
  let n = 0;
  const tick = () => {
    n += 1;
    show(n);
    if (n < cubes.length) bench.after(tick, COUNT_STEP);
    else done?.(n);
  };
  tick();
}
/** 쌓인 자리를 앞줄부터, 왼쪽부터 */
export const spotsOf = (map) => {
  const out = [];
  map.forEach((row, y) => row.forEach((v, x) => {
    if (v > 0) out.push([x, y]);
  }));
  return out;
};

// ── 앞과 뒤, 오른쪽과 왼쪽 ─────────────────
/** 이 단계의 판 가장자리 글자: 앞·오른쪽·뒤·왼쪽(뒤·왼쪽은 처음 보기에서 높은 쌓기나무에 가리지 않게 더 멀리) */
const FLIP_EDGE = [
  { text: '앞', at: 'front' },
  { text: '오른쪽', at: 'right' },
  { text: '뒤', at: 'back', out: EDGE_FAR },
  { text: '왼쪽', at: 'left', out: EDGE_FAR },
];
/** 이 단계의 방향 버튼: [위][앞][뒤][오른쪽][왼쪽] (교과서 60쪽의 다섯 방향) */
const FLIP_DIRS = ['top', 'front', 'back', 'side', 'left'].map((id) => ({ id, text: FLIP_NAMES[id], label: `${FLIP_NAMES[id]}에서 보기` }));
const FLIP_VIEW = { front: 'front', side: 'side', back: 'back', left: 'left' };

function playFlip(stage, ctx, questions) {
  const { h } = ctx;
  const bench = createBench({ ctx, total: questions.length, edge: FLIP_EDGE, dirs: FLIP_DIRS, names: FLIP_NAMES });
  const { view } = bench;
  wideBench(bench);
  bench.controls.dirs.classList.add('is-five');
  bench.card.hidden = false;
  const optionRow = h('div', { class: 'blk-options blk-options-3', role: 'group', 'aria-label': '반대쪽에서 본 모양 고르기' });
  bench.answerBox.append(optionRow);
  let buttons = [];
  let index = 0;
  let answered = false;

  const flipLabel = (heights, name) => `${name}에서 본 모양: 왼쪽부터 ${heights.map((n) => `${n}층`).join(', ')}`;

  function showQuestion() {
    const q = questions[index];
    answered = false;
    bench.setQuestion(index + 1, `${FLIP_NAMES[q.ask]}에서 본 모양은 어느 것일까요?`);
    bench.card.replaceChildren(figure(h, `${FLIP_NAMES[q.given]}에서 본 모양`, createGridPicture({
      kind: q.given, cells: viewCells(q.target, q.given), cell: 28, label: flipLabel(q.view, FLIP_NAMES[q.given]),
    })));
    buttons = q.options.map((o, i) => choiceButton(h, {
      value: i + 1,
      cls: 'blk-option',
      content: [h('b', null, `${i + 1}번`), createGridPicture({ kind: q.ask, cells: columnsToCells(o.heights), cell: 24, label: `${i + 1}번: 왼쪽부터 ${o.heights.map((n) => `${n}층`).join(', ')}` })],
      onclick: () => answer(i + 1),
    }));
    optionRow.classList.remove('is-answered');
    optionRow.replaceChildren(...buttons);
    // 답하기 전: 보이는 면만 있는 멈춘 그림(판 없음 — 가장자리 글자 앞·오른쪽·뒤·왼쪽과 화살표만). 방향 버튼·조작판이 없다 (돌리면 반대쪽 모습이 보인다)
    bench.setTag('그림이에요. 답한 뒤에 돌려 볼 수 있어요.', 'lock');
    view.home();
    view.setMarks({});
    view.setFrozen(true, { board: false, edges: true });
    view.setViewEnabled(false);
    bench.controls.lock(true);
    view.setMap(q.target);
  }

  function answer(choice) {
    if (answered) return;
    answered = true;
    const q = questions[index];
    const result = judgeFlip(q, choice);
    markChoice(buttons, choice, q.expected, result.correct);
    // 답한 뒤에는 보기를 작게 줄여 까닭 쪽지에 자리를 낸다(이쪽에서 보면?과 같게)
    optionRow.classList.add('is-answered');
    // 답한 뒤: 입체가 되어 주어진 쪽에서 본 뒤 반대쪽으로 돈다 — 두 모습이 좌우로 뒤집힌 사이인 것을 차례로 본다
    bench.setTag(null);
    view.setFrozen(false, { board: true });
    view.setViewEnabled(true);
    bench.controls.lock(false);
    view.snapTo(FLIP_VIEW[q.given], { quiet: true });
    bench.after(() => view.snapTo(FLIP_VIEW[q.ask]), LOOK_PAUSE);
    settle(ctx, bench, { q, result, given: choice, chosen: buttons[choice - 1], last: index + 1 >= questions.length, next });
  }

  function next() {
    index += 1;
    if (index >= questions.length) finishStage(stage, ctx);
    else {
      showQuestion();
      buttons[0].focus({ preventScroll: true });
    }
  }

  showQuestion();
  return () => bench.destroy();
}

// ── 칠하기 (그리기 · 수만 보고 칠하기가 함께 쓴다) ──────────
/**
 * 모눈 칠하기 세 장(위·앞·옆)과 [확인하기]. 위에서 본 모양은 매트 왼쪽(쌓는 단계의 "위에서 본 판" 자리)에, 앞·옆은 작업 지시서에 둔다
 * (위·앞·옆을 한 문항에 모두 그릴 때 작업 지시서 한 곳에는 세 장과 까닭 쪽지가 함께 들어가지 않는다 — 1366×680).
 * onCheck: 단계가 채점한다. → { grids, topBox, paintRow, show(kinds), reset(), lock(), get(kinds), showDiff(diff), clearDiff() }
 */
export function createPaints({ ctx, bench }) {
  const { h } = ctx;
  const grids = Object.fromEntries(['top', 'front', 'side'].map((kind) => [kind, createPaintGrid({ ctx, kind })]));
  const topBox = h('div', { class: 'blk-padbox blk-paintbox', hidden: true }, grids.top.el);
  bench.controls.dirs.after(topBox);
  // 위·앞·옆을 모두 칠하는 문항에서 판이 매트 옆에 있으면(두 칸 배치) 옆 모눈은 매트 오른쪽(조작판 아래, "옆" 쪽)에 둔다 —
  // 작업 지시서에 모눈 두 장이 나란히 들어가지 않는 폭(1001~1279px, 판 300px)에서도 판을 1·2차시처럼 좁힐 수 있게 (review-blocks-s2 S2-3)
  const sideBox = h('div', { class: 'blk-padbox blk-paintbox is-side', hidden: true });
  bench.controls.pad.after(sideBox);
  const paintRow = h('div', { class: 'blk-paints' });
  bench.answerBox.append(paintRow);
  const wide = globalThis.matchMedia?.(TWO_COLUMNS);
  let shown = null;
  function place() {
    if (!shown) return;
    const sideInMat = shown.includes('top') && shown.includes('side') && Boolean(wide?.matches);
    sideBox.hidden = !sideInMat;
    sideBox.replaceChildren(...(sideInMat ? [grids.side.el] : []));
    paintRow.replaceChildren(...shown.filter((k) => k !== 'top' && !(sideInMat && k === 'side')).map((k) => grids[k].el));
    paintRow.hidden = paintRow.childElementCount === 0;
    // 판이 매트 아래로 가는 배치(태블릿 세로 등)에서는 모눈을 왼쪽 칸에, 물음·까닭·[다음 문제]를 오른쪽 칸에 둔다(blocks.css)
    bench.panel.classList.toggle('has-paints', !paintRow.hidden);
  }
  wide?.addEventListener?.('change', place);
  return {
    grids,
    show(kinds) {
      shown = [...kinds];
      topBox.hidden = !kinds.includes('top');
      place();
      for (const grid of Object.values(grids)) {
        grid.set();
        grid.lock(false);
      }
    },
    hide() {
      shown = null;
      topBox.hidden = true;
      sideBox.hidden = true;
      paintRow.hidden = true;
      bench.panel.classList.remove('has-paints');
    },
    destroy() {
      wide?.removeEventListener?.('change', place);
    },
    get: (kinds) => Object.fromEntries(kinds.map((k) => [k, grids[k].get()])),
    lock(value) {
      for (const grid of Object.values(grids)) grid.lock(value);
    },
    showDiff(diff) {
      for (const [kind, list] of Object.entries(diff)) grids[kind].showDiff(list);
    },
    clearDiff() {
      for (const grid of Object.values(grids)) grid.clearDiff();
    },
    onChange(fn) {
      for (const grid of Object.values(grids)) grid.onChange(fn);
    },
    focus(kinds) {
      grids[kinds.find((k) => k !== 'top') ?? kinds[0]].focus();
    },
  };
}

/** 틀린 그림: 먼저 볼 방향. 앞과 옆을 바꿔 그렸으면 그린 쪽(바꾼 쪽)을 먼저 보이고 바른 쪽으로 돈다 */
function wrongTurns(result, kinds) {
  const first = result.wrongKinds[0];
  if (result.tag === '앞과 옆' && kinds.length === 1 && first !== 'top') return [first === 'front' ? 'side' : 'front', first];
  return [first];
}

/**
 * 칠하는 문항 하나의 확인(그리기·수만 보고 칠하기 공통): 채점 → 기록 → 무대에 겹쳐 견줌.
 * state: { solved, checked } · reveal(): 입체를 보이는 단계의 일 · from: 'picture' | 'numbers'
 * → 맞혔으면 true
 */
export function checkPaint({ ctx, bench, paints, checker, q, state, reveal, from }) {
  const { view } = bench;
  const drawings = paints.get(q.kinds);
  const result = judgeDrawing(q, drawings, { from });
  if (result.empty) {
    ctx.feedback.info(result.message);
    return false;
  }
  const key = q.kinds.map((k) => viewKey(drawings[k], k)).join('|');
  // 답했다: 입체가 나타나고, 내가 그린 그림을 그 방향의 무대에 겹친다
  reveal();
  view.setOverlay(q.kinds.map((k) => ({ dir: k, cells: overlayCells(drawings[k], q.target, k) })));
  if (!result.correct) {
    paints.showDiff(result.diff);
    const turns = wrongTurns(result, q.kinds);
    view.snapTo(VIEW_SNAP[turns[0]], { force: true, quiet: turns.length > 1 });
    if (turns.length > 1) bench.after(() => view.snapTo(VIEW_SNAP[turns[1]], { force: true }), LOOK_PAUSE);
    if (state.checked === key) {
      ctx.feedback.info(SAME_CHECK_TEXT); // 고치지 않고 또 눌렀다: 다시 세지 않는다
      return false;
    }
    state.checked = key;
    ctx.log.answer({ itemId: q.itemId, correct: false, tag: result.tag, given: key, expected: result.expected });
    ctx.sfx.play('wrong');
    ctx.feedback.wrong(toastOf(result.message));
    bench.showNote(result.message, false);
    if (checker.wrong()) bench.showBounce({ retry: true });
    return false;
  }
  ctx.log.answer({ itemId: q.itemId, correct: true, tag: null, given: key, expected: result.expected });
  state.solved = true;
  ctx.sfx.play('correct');
  ctx.feedback.correct(toastOf(result.message));
  paints.lock(true);
  paints.clearDiff();
  checker.hide();
  bench.clearBonus();
  bench.showNote(result.message, true);
  // 그린 방향으로 차례로 돈다 (위 → 앞 → 옆)
  q.kinds.forEach((k, i) => {
    if (i === 0) view.snapTo(VIEW_SNAP[k], { force: true });
    else bench.after(() => view.snapTo(VIEW_SNAP[k], { force: true }), VIEW_PAUSE * i);
  });
  return true;
}

// ── 위, 앞, 옆에서 본 모양 그리기 ────────────────
function playDraw(stage, ctx, questions) {
  const bench = createBench({ ctx, total: questions.length });
  const { view } = bench;
  wideBench(bench, { paint: true });
  const paints = createPaints({ ctx, bench });
  const checker = createChecker({ ctx, bench, onCheck: () => check(), onHint: () => drawHint(questions[index], paints.get(questions[index].kinds)) });
  let index = 0;
  const state = { solved: false, checked: null };

  function showQuestion() {
    const q = questions[index];
    state.solved = false;
    state.checked = null;
    const what = q.kinds.length > 1 ? '위, 앞, 옆에서 본 모양' : viewTitle(q.kinds[0]);
    bench.setQuestion(index + 1, `${what}을 칠해 봐요.`);
    paints.show(q.kinds);
    checker.reset();
    // 답하기 전: 보이는 면만 있는 멈춘 그림(숨겨진 쌓기나무가 없는 모양 — 개수를 알려 준다). 방향 버튼·조작판이 없다.
    // 판은 없지만 교과서 그림처럼 "앞"(왼쪽 아래)·"옆"(오른쪽 아래) 글자와 화살표가 있다 — 판 가장자리 자리라 문항마다 같다
    bench.setTag(`쌓기나무 ${q.total}개로 만든 모양 그림이에요.`, 'lock');
    view.home();
    view.setMarks({});
    view.setOverlay([]);
    view.setFrozen(true, { board: false, edges: true });
    view.setViewEnabled(false);
    bench.controls.lock(true);
    view.setMap(questions[index].target);
  }

  function reveal() {
    bench.setTag(null);
    view.setFrozen(false, { board: true });
    view.setViewEnabled(true);
    bench.controls.lock(false);
  }

  // 칠한 칸을 바꾸면 지난 확인의 표시(✗·겹친 그림)를 지운다
  paints.onChange(() => {
    if (state.solved) return;
    paints.clearDiff();
    view.setOverlay([]);
  });

  function check() {
    if (state.solved) return;
    const q = questions[index];
    if (!checkPaint({ ctx, bench, paints, checker, q, state, reveal, from: 'picture' })) return;
    const last = index + 1 >= questions.length;
    bench.showNext(last ? '결과 보기' : '다음 문제', next);
    bench.focusNext();
  }

  function next() {
    index += 1;
    if (index >= questions.length) finishStage(stage, ctx);
    else {
      showQuestion();
      paints.focus(questions[index].kinds);
    }
  }

  showQuestion();
  return () => {
    paints.destroy();
    bench.destroy();
  };
}

// ── 위, 앞, 옆을 보고 쌓기 ──────────────────
function playViewBuild(stage, ctx, questions) {
  const { h } = ctx;
  const bench = createBench({ ctx, total: questions.length, build: true });
  const { view, tools } = bench;
  wideBench(bench);
  const views = h('div', { class: 'blk-views' });
  bench.given.append(views);
  const checker = createChecker({ ctx, bench, onCheck: () => check(), onHint: () => useHint() });
  const yes = choiceButton(h, { value: 'yes', content: [h('span', { class: 'answer-sym' }, icon('ring')), h('span', null, '만들 수 있어요')], onclick: () => guess('yes') });
  const no = choiceButton(h, { value: 'no', content: [h('span', { class: 'answer-sym' }, icon('cross')), h('span', null, '만들 수 없어요')], onclick: () => guess('no') });
  const guessRow = h('div', { class: 'answer-row blk-guess', role: 'group', 'aria-label': '다른 개수로도 만들 수 있을지 예상하기', hidden: true }, yes, no);
  bench.answerBox.append(guessRow);
  let index = 0;
  let phase = 'build'; // build → guess → other(여러 가지인 문항) → done
  let first = null;
  let hinted = null;
  let checked = null;

  const PROMPTS = {
    build: '위, 앞, 옆에서 본 모양에 맞게 쌓아 봐요.',
    guess: '다른 개수로도 위, 앞, 옆에서 본 모양이 같게 만들 수 있을까요?',
    other: '쌓기나무의 개수를 바꿔서 한 번 더 쌓아 봐요.',
  };

  function drawGiven(q, { diff = null } = {}) {
    views.replaceChildren(...['top', 'front', 'side'].map((kind) => {
      const cells = viewCells(q.target, kind);
      const hint = kind === 'top' && hinted ? { r: hinted.y, c: hinted.x, text: hinted.value } : null;
      // 이름표는 짧게("위에서") — 셋이 한 줄에 들어가게. 그림의 글 이름은 "위에서 본 모양: …"
      // 틀린 뒤: 다른 그림은 칸에 ✗, 내 쌓기와 같은 그림은 이름표 옆에 ✓ (review-blocks-s2 S2-7)
      const same = diff && diff[kind].length === 0;
      const caption = same ? [`${VIEW_SHORT[kind]}에서 `, h('span', { class: 'blk-same', title: '내 쌓기와 같아요' }, '✓')] : `${VIEW_SHORT[kind]}에서`;
      const label = `${describeView(cells, kind)}${same ? '. 내 쌓기와 같아요' : diff ? '. 내 쌓기와 다른 칸에 ✗' : ''}`;
      return figure(h, caption, createGridPicture({ kind, cells, cell: 22, diff: diff?.[kind] ?? [], hint, label }), 'blk-view-fig');
    }));
  }

  function showQuestion() {
    const q = questions[index];
    phase = 'build';
    first = null;
    hinted = null;
    checked = null;
    bench.given.classList.remove('is-done');
    bench.setQuestion(index + 1, PROMPTS.build);
    drawGiven(q);
    checker.reset();
    guessRow.hidden = true;
    resetChoices([yes, no]);
    view.home();
    view.setMarks({});
    view.setOverlay([]);
    tools.load(emptyMap());
    tools.lock(false);
    view.setViewEnabled(true);
    bench.controls.lock(false);
  }

  function useHint() {
    const hint = threeHint(questions[index], tools.getMap());
    hinted = { x: hint.x, y: hint.y, value: hint.value };
    drawGiven(questions[index]);
    return hint.text;
  }

  tools.onChange(() => {
    if (phase !== 'build' && phase !== 'other') return;
    view.setMarks({});
    view.setOverlay([]);
    drawGiven(questions[index]);
  });

  function wrongBuild(q, mine, result, itemId) {
    const again = checked === mapKey(mine);
    if (!again) {
      checked = mapKey(mine);
      ctx.log.answer({ itemId, correct: false, tag: result.tag, given: mapKey(mine), expected: mapKey(q.target) });
      ctx.sfx.play('wrong');
    }
    drawGiven(q, { diff: result.diff });
    // 처음으로 다른 그림의 방향에서 내 쌓기를 보이고, 주어진 그림을 그 위에 겹친다(위 → 앞 → 옆)
    // 좌우가 뒤집혔거나 앞과 옆이 바뀌었으면 앞에서, 그 밖에는 처음으로 다른 그림의 방향에서
    const differs = ['top', 'front', 'side'].filter((k) => result.diff[k].length > 0);
    const kind = (result.tag === BLOCK_TAGS.mirror || result.tag === BLOCK_TAGS.frontSide) && differs.includes('front') ? 'front' : differs[0] ?? 'front';
    view.setOverlay(['top', 'front', 'side'].map((k) => ({ dir: k, cells: givenOverlay(mine, q.target, k) })));
    view.snapTo(VIEW_SNAP[kind], { force: true, quiet: true });
    if (again) {
      ctx.feedback.info(SAME_CHECK_TEXT);
      return;
    }
    ctx.feedback.wrong(toastOf(result.message));
    bench.showNote(result.message, false, { tip: `✗ 표시한 칸이 내 쌓기와 달라요. 무대는 ${viewTitle(kind)}을 보여 줘요.` });
    if (checker.wrong()) bench.showBounce({ retry: true });
  }

  function check() {
    const q = questions[index];
    const mine = tools.getMap();
    if (phase === 'build') {
      const result = judgeThree(q, mine);
      if (result.empty) {
        ctx.feedback.info(result.message);
        return;
      }
      if (!result.correct) {
        wrongBuild(q, mine, result, `${q.itemId}:build`);
        return;
      }
      ctx.log.answer({ itemId: `${q.itemId}:build`, correct: true, tag: null, given: mapKey(mine), expected: mapKey(q.target) });
      ctx.sfx.play('correct');
      ctx.feedback.correct(toastOf(result.message));
      first = mine;
      phase = 'guess';
      hinted = null;
      checked = null;
      drawGiven(q);
      view.setMarks({});
      view.setOverlay([]);
      bench.clearBonus();
      bench.showNote(result.message, true);
      // 예상하는 동안은 쌓기를 잠근다(먼저 생각한다). 돌려 보기는 그대로 된다
      tools.lock(true);
      checker.hide();
      bench.setPrompt(PROMPTS.guess);
      guessRow.hidden = false;
      yes.focus({ preventScroll: true });
      return;
    }
    if (phase !== 'other') return;
    const result = judgeThreeOther(q, mine, first);
    if (result.status === 'same' || result.status === 'sameCount' || result.status === 'empty') {
      ctx.feedback.info(result.message); // 기록하지 않는다
      return;
    }
    if (result.status === 'wrong') {
      wrongBuild(q, mine, result, `${q.itemId}:other`);
      return;
    }
    ctx.log.answer({ itemId: `${q.itemId}:other`, correct: true, tag: null, given: mapKey(mine), expected: 'other-count' });
    ctx.sfx.play('correct');
    ctx.feedback.correct(toastOf(result.message));
    bench.clearBonus();
    view.setOverlay([]);
    drawGiven(q);
    // 많은 쪽 쌓기를 보이고, 적은 쪽에 없는 쌓기나무(달라진 자리)를 점선으로 표시한다
    const [few, many] = count(mine) > count(first) ? [first, mine] : [mine, first];
    const lower = alignMap(few, many);
    const extra = cellsOf(many).filter(([x, y, z]) => z >= lower[y][x]);
    view.setMap(many);
    bench.setTag(`쌓기나무 ${count(many)}개로 만든 모양`);
    view.setMarks({ hidden: extra, hiddenText: '달라진 자리' });
    // 달라진 쌓기나무가 처음 보기에서 모두 가려지면 뒤에서 보인다
    const hidden = new Set(hiddenCells(many).map((c) => c.join(',')));
    view.snapTo(extra.every((c) => hidden.has(c.join(','))) ? 'behind' : 'home', { force: true, quiet: true });
    done(`${result.message} 점선 쌓기나무는 앞이나 옆에서 볼 때 다른 쌓기나무와 겹쳐 보여서 있어도 없어도 그림이 같아요.`);
  }

  function guess(value) {
    if (phase !== 'guess') return;
    const q = questions[index];
    const result = judgeThreeGuess(q, value);
    ctx.log.answer({ itemId: `${q.itemId}:guess`, correct: result.correct, tag: result.tag, given: value, expected: result.expected });
    markChoice([yes, no], value, q.expected, result.correct);
    ctx.sfx.play(result.correct ? 'correct' : 'wrong');
    if (result.correct) ctx.feedback.correct(toastOf(result.message), value === 'yes' ? yes : no);
    else {
      ctx.feedback.wrong(toastOf(result.message), value === 'yes' ? yes : no);
      bench.showBounce({ last: !q.many && index + 1 >= questions.length });
    }
    if (!q.many) {
      done(result.message, result.correct);
      return;
    }
    phase = 'other';
    checked = null;
    bench.showNote(result.message, result.correct, { title: result.correct ? '맞아요' : '까닭' });
    bench.setPrompt(PROMPTS.other);
    guessRow.hidden = true;
    checker.reset();
    tools.lock(false);
    checker.focus();
  }

  function done(message, correct = true) {
    phase = 'done';
    bench.given.classList.add('is-done');
    tools.lock(true);
    checker.hide();
    guessRow.hidden = true;
    bench.showNote(message, correct, { title: correct ? '맞아요' : '까닭' });
    bench.showNext(index + 1 >= questions.length ? '결과 보기' : '다음 문제', next);
    bench.focusNext();
  }

  function next() {
    index += 1;
    if (index >= questions.length) finishStage(stage, ctx);
    else {
      showQuestion();
      tools.focusPad();
    }
  }

  showQuestion();
  return () => bench.destroy();
}

// ── 자리마다 몇 개? ──────────────────────
function playWrite(stage, ctx, questions) {
  const bench = createBench({ ctx, total: questions.length });
  const { view } = bench;
  wideBench(bench);
  const checker = createChecker({ ctx, bench, onCheck: () => check(), onHint: () => useHint() });
  let grid = null;
  let index = 0;
  let solved = false;
  let checked = null;
  let lastWrong = [];

  function showQuestion() {
    const q = questions[index];
    solved = false;
    checked = null;
    lastWrong = [];
    bench.setQuestion(index + 1, '돌려 보며 자리마다 쌓인 쌓기나무의 수를 써 봐요.');
    // 쓰는 판은 문항마다 새로(쌓인 자리가 다르다). 위에서 본 판 자리(방향 버튼 아래)에 둔다
    grid?.el.remove();
    grid = createNumberGrid({ ctx, top: q.top });
    bench.controls.dirs.after(grid.el);
    grid.onChange(() => {
      if (solved) return;
      grid.clearWrong();
      view.setMarks({});
    });
    checker.reset();
    bench.setTag(null);
    // 늘 돌려 볼 수 있다(보고 세는 것이 과제). 쌓기나무를 누르면 수가 뜨는 것은 맞힌 뒤에만
    view.home();
    view.setMarks({});
    delete view.el.dataset.counted;
    view.setBare(true); // 답하기 전: 면에 자리 값(높이)을 싣지 않는다
    view.setFrozen(false, { board: true });
    view.setViewEnabled(true);
    bench.controls.lock(false);
    view.setMap(q.target);
  }

  function useHint() {
    const q = questions[index];
    const [x, y] = lastWrong[0] ?? [];
    const spot = x === undefined ? spotsOf(q.target)[0] : [x, y];
    countUp(bench, q.target, [spot], null);
    return `${spotName(spot[0], spot[1])} 자리를 아래부터 세어 볼게요. 무대에 센 수가 나와요.`;
  }

  view.on('tap', (hit) => {
    if (!solved) return;
    const n = questions[index].target[hit.y]?.[hit.x] ?? 0;
    if (n > 0) ctx.feedback.info(`${spotName(hit.x, hit.y)} 자리는 ${n}개예요.`);
  });

  function check() {
    if (solved) return;
    const q = questions[index];
    const numbers = grid.get();
    const result = judgeNumbers(q, numbers);
    if (result.empty) {
      ctx.feedback.info(result.message);
      return;
    }
    if (!result.correct) {
      grid.showWrong(result.wrong);
      lastWrong = result.wrong;
      if (checked === mapKey(numbers)) {
        ctx.feedback.info(SAME_CHECK_TEXT);
        return;
      }
      checked = mapKey(numbers);
      ctx.log.answer({ itemId: q.itemId, correct: false, tag: result.tag, given: mapKey(numbers), expected: result.expected });
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(toastOf(result.message));
      bench.showNote(result.message, false, { tip: '무대를 돌려 가려진 쌓기나무도 세어 보고, 고친 다음 다시 [확인하기]를 눌러요.' });
      if (checker.wrong()) bench.showBounce({ retry: true });
      return;
    }
    ctx.log.answer({ itemId: q.itemId, correct: true, tag: null, given: mapKey(numbers), expected: result.expected });
    solved = true;
    ctx.sfx.play('correct');
    ctx.feedback.correct(toastOf(result.message));
    grid.lock(true);
    checker.hide();
    bench.clearBonus();
    view.setBare(false); // 맞힌 뒤: 쌓기나무를 누르면 그 자리의 수가 뜬다
    bench.showNote(result.message, true, { tip: '쌓기나무를 누르면 그 자리의 수가 나와요.' });
    // 자리마다 아래부터 하나씩 세어 보이고, 다 세면 모두 몇 개인지
    countUp(bench, q.target, spotsOf(q.target), null);
    bench.showNext(index + 1 >= questions.length ? '결과 보기' : '다음 문제', next);
    bench.focusNext();
  }

  function next() {
    index += 1;
    if (index >= questions.length) finishStage(stage, ctx);
    else {
      showQuestion();
      grid.focus();
    }
  }

  showQuestion();
  return () => bench.destroy();
}

// ── 수를 보고 쌓기 ───────────────────────
function playFromNum(stage, ctx, questions) {
  const { h } = ctx;
  const bench = createBench({ ctx, total: questions.length, build: true });
  const { view, tools } = bench;
  wideBench(bench);
  bench.card.hidden = false;
  const checker = createChecker({ ctx, bench, onCheck: () => check(), onHint: () => useHint() });
  let index = 0;
  let solved = false;
  let checked = null;
  let hinted = null;

  function drawPlan(q, { diff = [] } = {}) {
    const marks = diff.map(([x, y]) => ({ r: y, c: x }));
    const focusCell = hinted ? { r: hinted.y, c: hinted.x, text: '' } : null;
    bench.card.replaceChildren(figure(h, '수를 쓴 위에서 본 모양', createGridPicture({ kind: 'top', numbers: q.target, cell: 32, diff: marks, mark: focusCell, label: describeNumbers(q.target) })));
  }

  function showQuestion() {
    const q = questions[index];
    solved = false;
    checked = null;
    hinted = null;
    bench.setQuestion(index + 1, '위에서 본 모양에 쓴 수를 보고 똑같은 모양으로 쌓아 봐요.');
    drawPlan(q);
    checker.reset();
    bench.setTag(null);
    view.home();
    view.setMarks({});
    delete view.el.dataset.counted;
    tools.load(emptyMap());
    tools.lock(false);
    view.setViewEnabled(true);
    bench.controls.lock(false);
  }

  function useHint() {
    const hint = numberBuildHint(questions[index], tools.getMap());
    hinted = { x: hint.x, y: hint.y };
    drawPlan(questions[index]);
    return hint.text;
  }

  tools.onChange(() => {
    if (solved) return;
    view.setMarks({});
    drawPlan(questions[index]);
  });

  function check() {
    if (solved) return;
    const q = questions[index];
    const mine = tools.getMap();
    const result = judgeNumberBuild(q, mine);
    if (result.empty) {
      ctx.feedback.info(result.message);
      return;
    }
    if (!result.correct) {
      drawPlan(q, { diff: result.wrong });
      view.snapTo('home', { force: true, quiet: true });
      if (checked === mapKey(mine)) {
        ctx.feedback.info(SAME_CHECK_TEXT);
        return;
      }
      checked = mapKey(mine);
      ctx.log.answer({ itemId: q.itemId, correct: false, tag: result.tag, given: mapKey(mine), expected: result.expected });
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(toastOf(result.message));
      bench.showNote(result.message, false, { tip: '✗ 표시한 자리를 살펴보고, 고친 다음 다시 [확인하기]를 눌러요.' });
      if (checker.wrong()) bench.showBounce({ retry: true });
      return;
    }
    ctx.log.answer({ itemId: q.itemId, correct: true, tag: null, given: mapKey(mine), expected: result.expected });
    solved = true;
    ctx.sfx.play('correct');
    ctx.feedback.correct(toastOf(result.message));
    tools.lock(true);
    checker.hide();
    bench.clearBonus();
    hinted = null;
    drawPlan(q);
    bench.showNote(result.message, true);
    // 내 쌓기를 자리마다 아래부터 세어 수와 견준다
    view.snapTo('home', { force: true, quiet: true });
    countUp(bench, mine, spotsOf(mine), null);
    bench.showNext(index + 1 >= questions.length ? '결과 보기' : '다음 문제', next);
    bench.focusNext();
  }

  function next() {
    index += 1;
    if (index >= questions.length) finishStage(stage, ctx);
    else {
      showQuestion();
      tools.focusPad();
    }
  }

  showQuestion();
  return () => bench.destroy();
}

// ── 수만 보고 알아내기 ────────────────────
function playNumViews(stage, ctx, questions) {
  const { h } = ctx;
  const bench = createBench({ ctx, total: questions.length });
  const { view } = bench;
  wideBench(bench, { paint: true });
  // 답하기 전에는 입체가 없다: 무대는 답한 뒤에 매트에 붙인다. 그 전에는 수를 쓴 위에서 본 모양이 매트 가운데에 크게 놓인다
  view.el.remove();
  const planCard = h('div', { class: 'blk-photo blk-plan-card' });
  bench.mat.prepend(planCard);
  const paints = createPaints({ ctx, bench });
  const optionRow = h('div', { class: 'blk-options blk-pictures', role: 'group', 'aria-label': '수에 맞게 만든 모양 고르기', hidden: true });
  bench.answerBox.append(optionRow);
  const checker = createChecker({ ctx, bench, onCheck: () => check(), onHint: () => drawHint(questions[index], paints.get(questions[index].kinds), { from: 'numbers' }) });
  let buttons = [];
  let index = 0;
  let answered = false;
  const state = { solved: false, checked: null };

  function showQuestion() {
    const q = questions[index];
    answered = false;
    state.solved = false;
    state.checked = null;
    const paint = q.kind === 'paint';
    bench.setQuestion(index + 1, paint ? `${viewTitle(q.kinds[0])}을 칠해 봐요.` : '수에 맞게 만든 모양을 골라 봐요.');
    // 답하기 전: 입체가 없다(무대 요소를 매트에서 떼어 둔다)
    view.el.remove();
    bench.controls.lock(true);
    view.setViewEnabled(false);
    view.home();
    view.setOverlay([]);
    view.setMarks({});
    view.setMap(emptyMap());
    bench.card.hidden = true;
    bench.card.replaceChildren();
    planCard.hidden = false;
    planCard.replaceChildren(figure(h, '수를 쓴 위에서 본 모양', createGridPicture({ kind: 'top', numbers: q.target, cell: 64, label: describeNumbers(q.target) })));
    if (paint) {
      paints.show(q.kinds);
      checker.reset();
      optionRow.hidden = true;
      optionRow.replaceChildren();
      buttons = [];
    } else {
      paints.hide();
      checker.hide();
      buttons = q.options.map((o, i) => choiceButton(h, {
        value: i + 1,
        cls: 'blk-option',
        content: [h('b', null, `${i + 1}번`), createBlockPicture({ map: o.map, unit: 24, label: `${i + 1}번 모양 그림`, edges: true })],
        onclick: () => pick(i + 1),
      }));
      optionRow.hidden = false;
      optionRow.classList.remove('is-answered');
      optionRow.replaceChildren(...buttons);
    }
  }

  /** 답했다: 입체가 나타난다. 수를 쓴 그림은 매트 오른쪽 카드로 작게 옮긴다 */
  function reveal() {
    const q = questions[index];
    if (view.el.isConnected) return;
    planCard.hidden = true;
    bench.mat.prepend(view.el);
    bench.card.hidden = false;
    bench.card.replaceChildren(figure(h, '수를 쓴 위에서 본 모양', createGridPicture({ kind: 'top', numbers: q.target, cell: 30, label: describeNumbers(q.target) })));
    view.setFrozen(false, { board: true });
    view.setMap(q.target);
    view.setViewEnabled(true);
    bench.controls.lock(false);
  }

  paints.onChange(() => {
    if (state.solved) return;
    paints.clearDiff();
    view.setOverlay([]);
  });

  function check() {
    if (state.solved) return;
    const q = questions[index];
    if (q.kind !== 'paint') return;
    if (!checkPaint({ ctx, bench, paints, checker, q, state, reveal, from: 'numbers' })) return;
    bench.showNext(index + 1 >= questions.length ? '결과 보기' : '다음 문제', next);
    bench.focusNext();
  }

  function pick(choice) {
    if (answered) return;
    answered = true;
    const q = questions[index];
    const result = judgeNumPick(q, choice);
    markChoice(buttons, choice, q.expected, result.correct);
    // 답한 뒤에는 보기를 한 줄로 줄여 까닭 쪽지에 자리를 낸다(이쪽에서 보면?과 같게)
    optionRow.classList.add('is-answered');
    reveal();
    view.snapTo('home', { force: true, quiet: true });
    settle(ctx, bench, { q, result, given: choice, chosen: buttons[choice - 1], last: index + 1 >= questions.length, next });
  }

  function next() {
    index += 1;
    if (index >= questions.length) finishStage(stage, ctx);
    else {
      showQuestion();
      const q = questions[index];
      if (q.kind === 'paint') paints.focus(q.kinds);
      else buttons[0].focus({ preventScroll: true });
    }
  }

  showQuestion();
  return () => {
    paints.destroy();
    bench.destroy();
  };
}

const SCREENS = { flip: playFlip, draw: playDraw, build: playViewBuild, write: playWrite, fromnum: playFromNum, numviews: playNumViews };

/** S2 단계 종류에 맞는 화면을 그린다 → 정리 함수 */
export function playViews(stage, ctx, questions) {
  const screen = SCREENS[stage.kind];
  if (!screen) throw new Error(`알 수 없는 쌓기나무 단계 종류: ${stage.kind}`);
  return screen(stage, ctx, questions);
}

