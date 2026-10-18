/**
 * 쌓기나무 단계 화면 (S3: 5차시 층별로 나타내기 + 도전 더 붙여서 만들기). 기획서: spec-grade6.md 2-4·3·4·5절, 공통 규칙: common-rules.md
 * 틀은 S1·S2와 같다(play-blocks.js의 createBench: 왼쪽 재단 매트 + 오른쪽 작업 지시서).
 *
 *   layerdraw   만든 모양(늘 돌려 볼 수 있다)과 1층 모양을 보고 2층·3층 모양을 모눈에 칠한다 → [확인하기] → 층별로 벌어져 내 그림을 그 층에 겹쳐 견줌
 *   layerbuild  1층·2층·3층 모양 그림만 보고 내 판에 쌓는다 → [확인하기] (틀리면 다른 칸 ✗, 맞히면 층별로 벌려 보인다)
 *   layerviews  층별 모양만 보고 개수 고르기 · 앞에서 본 모양 칠하기 · 옆에서 본 모양 칠하기. 답하기 전에는 입체가 없다
 *   add         (도전) 주어진 모양에 n개를 더 붙여 만들 수 있는 모양을 보기 넷에서 모두 고른다(예상) → 내 판에서 직접 붙여 만든다 → 만든 모양에 수를 쓴다
 *
 * 정답 노출(5절): 층별 모양 그리기는 돌려 보며 칠하는 것이 과제라 늘 돌릴 수 있지만, 답하기 전에는 면에 자리 값(높이)이 없고 층마다 다른 색·층 숫자·층별로 벌려 보기가 없다.
 * 층별 모양만 보고 하는 문항은 답하기 전에 입체가 없다. 더 붙여서 만들기는 예상하기 전에 처음 모양이 멈춘 그림이고 내 판(쌓기 도구)이 없다.
 * 칠하기·쌓기·수 쓰기는 맞힐 때까지 다시 하고 틀린 시도도 기록한다. 고치지 않고 또 [확인하기]를 누르면 다시 세지 않는다.
 */
import { icon } from '../../../shared/ui/icons.js';
import { count, emptyMap, mapKey, topView } from './blocks.js';
import {
  addBuildHint,
  addNumberQuestion,
  addVerdict,
  addedCells,
  describeLayer,
  judgeAddBuild,
  judgeAddGuess,
  judgeLayerBuild,
  judgeLayerCount,
  judgeLayerDrawing,
  judgeNumbers,
  layerBuildHint,
  layerDrawHint,
  layerTitle,
  spotName,
  viewTitle,
  drawHint,
} from './blocks-logic.js';
import { createBlockPicture } from './block-view.js';
import { createGridPicture, createLayerStrip, createNumberGrid, createPaintGrid } from './grid-draw.js';
import {
  SAME_CHECK_TEXT,
  choiceButton,
  createBench,
  createChecker,
  figure,
  finishStage,
  markChoice,
  settle,
  toastOf,
} from './play-blocks.js';
import { checkPaint, countUp, createPaints, spotsOf, wideBench } from './play-views.js';

/**
 * 판이 매트 옆에 있는 두 칸 배치(blocks.css): 5차시·도전 단계는 폭 901px부터(3·4차시는 1001px부터).
 * 판이 매트 아래로 가면 폭 901~1000px의 낮은 화면(960×768)에서 모눈·그림·쪽지가 화면을 넘친다 — 옆에 두고 판을 조금 좁힌다(280px)
 */
const S3_TWO_COLUMNS = '(min-width: 901px)';

/** S3 화면의 단계 종류 (blocks-play.js가 이 종류만 이 파일로 넘긴다) */
export const LAYER_STAGE_KINDS = Object.freeze(['layerdraw', 'layerbuild', 'layerviews', 'add']);

const LAYER_LABEL = (layers) => layers.map((g, i) => describeLayer(g, i + 1)).join('. ');

/** 내가 칠한 층 모양을 그 층에 겹칠 칸(판 위 자리 그대로): [{ r, c, state: 'ok' | 'extra' | 'missing' }] */
function layerOverlayCells(mine, target) {
  const out = [];
  target.forEach((row, y) => row.forEach((on, x) => {
    const me = Boolean(mine?.[y]?.[x]);
    if (on || me) out.push({ r: y, c: x, state: on && me ? 'ok' : on ? 'missing' : 'extra' });
  }));
  return out;
}

/**
 * [층별로 벌려 보기] / [다시 모으기] 버튼 — 매트 아래 띠의 왼쪽(답한 뒤에만 보인다). 벌리면 층마다 몇 개인지 이름표가 붙는다
 * → { button, set(value, { quiet }), show(), hide() }
 */
function createApartToggle({ ctx, bench, chips = false }) {
  const { h } = ctx;
  const { view } = bench;
  const text = h('span', null, '층별로 벌려 보기');
  const button = h('button', { type: 'button', class: 'btn blk-apart blk-apart-left', hidden: true, 'aria-pressed': 'false', onclick: () => set(!view.isApart()) }, h('span', { class: 'btn-ico', 'aria-hidden': 'true' }, icon('layers')), text);
  bench.band.prepend(button);
  function set(value, { quiet = false } = {}) {
    view.setApart(value);
    // 층마다 몇 개인지 이름표(벌렸을 때 무대 왼쪽): 매트 왼쪽에 판·모눈이 있는 단계에서는 그 자리와 겹치므로 붙이지 않는다 — 층 숫자와 색이 층을 알려 준다
    if (chips) view.setMarks({ layers: value });
    button.setAttribute('aria-pressed', String(value));
    text.textContent = value ? '다시 모으기' : '층별로 벌려 보기';
    if (!quiet) {
      ctx.sfx.play('click');
      ctx.feedback.announce(value ? '층별로 벌렸어요.' : '다시 모았어요.');
    }
  }
  return {
    button,
    set,
    show() {
      button.hidden = false;
    },
    hide() {
      button.hidden = true;
    },
  };
}

// ── 층별 모양 그리기 ────────────────────────
/**
 * 2층·3층 모양을 칠하는 모눈 둘. 판이 매트 옆에 있으면(두 칸 배치) 2층은 매트 왼쪽(위에서 본 판 자리), 3층은 매트 오른쪽(조작판 아래),
 * 판이 매트 아래로 가면 작업 지시서의 왼쪽 칸에 1층 모양과 함께 둔다. → { grids, floor(1층 그림 자리), show(q), get(), lock, showDiff, clearDiff, onChange, focus, destroy }
 */
function createLayerPaints({ ctx, bench }) {
  const { h } = ctx;
  const grids = { 2: createPaintGrid({ ctx, kind: 'top', title: layerTitle(2), name: 'layer2' }), 3: createPaintGrid({ ctx, kind: 'top', title: layerTitle(3), name: 'layer3' }) };
  const leftBox = h('div', { class: 'blk-padbox blk-paintbox' });
  const rightBox = h('div', { class: 'blk-padbox blk-paintbox is-side' });
  bench.controls.dirs.after(leftBox);
  bench.controls.pad.after(rightBox);
  const floor = h('div', { class: 'blk-floor-slot' });
  const paintRow = h('div', { class: 'blk-paints blk-layer-paints' });
  bench.answerBox.append(floor, paintRow);
  const wide = globalThis.matchMedia?.(S3_TWO_COLUMNS);
  function place() {
    const inMat = Boolean(wide?.matches);
    leftBox.hidden = !inMat;
    rightBox.hidden = !inMat;
    leftBox.replaceChildren(...(inMat ? [grids[2].el] : []));
    rightBox.replaceChildren(...(inMat ? [grids[3].el] : []));
    paintRow.replaceChildren(...(inMat ? [] : [grids[2].el, grids[3].el]));
    paintRow.hidden = inMat;
    // 판이 매트 아래로 가는 배치(태블릿 세로 등)에서는 1층 그림과 모눈을 왼쪽 칸에, 물음·까닭·[다음 문제]를 오른쪽 칸에 둔다(blocks.css)
    bench.panel.classList.toggle('has-paints', !inMat);
  }
  wide?.addEventListener?.('change', place);
  place();
  return {
    grids,
    show(q) {
      floor.replaceChildren(figure(h, layerTitle(1), createGridPicture({ kind: 'top', cells: q.layers[0], cell: 26, label: describeLayer(q.layers[0], 1) }), 'blk-floor-fig'));
      for (const grid of Object.values(grids)) {
        grid.set();
        grid.lock(false);
      }
    },
    get: () => ({ 2: grids[2].get(), 3: grids[3].get() }),
    lock(value) {
      for (const grid of Object.values(grids)) grid.lock(value);
    },
    showDiff(diff) {
      for (const [k, list] of Object.entries(diff)) grids[k].showDiff(list);
    },
    clearDiff() {
      for (const grid of Object.values(grids)) grid.clearDiff();
    },
    onChange(fn) {
      for (const grid of Object.values(grids)) grid.onChange(fn);
    },
    focus() {
      grids[2].focus();
    },
    destroy() {
      wide?.removeEventListener?.('change', place);
    },
  };
}

function playLayerDraw(stage, ctx, questions) {
  const bench = createBench({ ctx, total: questions.length });
  const { view } = bench;
  wideBench(bench, { paint: true });
  bench.mat.parentElement.classList.add('blk-s3', 'blk-layer-bench');
  const paints = createLayerPaints({ ctx, bench });
  const checker = createChecker({ ctx, bench, onCheck: () => check(), onHint: () => layerDrawHint(questions[index], paints.get()).text });
  const apart = createApartToggle({ ctx, bench });
  let index = 0;
  let solved = false;
  let checked = null;
  let shown = false; // 이 문항에서 [확인하기]를 한 번이라도 눌러 층별 색·벌려 보기가 열렸는가

  function showQuestion() {
    const q = questions[index];
    solved = false;
    checked = null;
    shown = false;
    bench.setQuestion(index + 1, '만든 모양을 돌려 보며 2층, 3층 모양을 칠해 봐요.');
    paints.show(q);
    checker.reset();
    apart.hide();
    bench.setTag(null);
    // 늘 돌려 볼 수 있다(보고 칠하는 것이 과제). 답하기 전에는 면에 자리 값(높이)이 없고, 층마다 다른 색·층 숫자·층별로 벌려 보기가 없다
    view.home();
    view.setApart(false);
    view.setLayerLook(false);
    view.setLayerOverlay([]);
    view.setMarks({});
    view.setBare(true);
    view.setFrozen(false, { board: true });
    view.setViewEnabled(true);
    bench.controls.lock(false);
    view.setMap(q.target);
  }

  /** 답했다: 층마다 다른 색과 층 숫자, 층별로 벌려 보기가 열린다 */
  function reveal() {
    if (shown) return;
    shown = true;
    view.setBare(false);
    view.setLayerLook(true);
    apart.show();
  }

  paints.onChange(() => {
    if (solved) return;
    paints.clearDiff();
    view.setLayerOverlay([]);
  });

  view.on('tap', (hit) => {
    if (!solved) return;
    const n = questions[index].target[hit.y]?.[hit.x] ?? 0;
    if (n > 0) ctx.feedback.info(`${spotName(hit.x, hit.y)} 자리는 ${n}개예요.`);
  });

  function check() {
    if (solved) return;
    const q = questions[index];
    const drawings = paints.get();
    const result = judgeLayerDrawing(q, drawings);
    if (result.empty) {
      ctx.feedback.info(result.message);
      return;
    }
    const key = `${mapKey(drawings[2])}|${mapKey(drawings[3])}`;
    // 답했다: 층별로 벌어지고, 내가 칠한 2층·3층 모양이 그 층 위에 겹친다(교과서 방향에서)
    reveal();
    view.setLayerOverlay(q.kinds.map((k) => ({ z: k - 1, cells: layerOverlayCells(drawings[k], q.layers[k - 1]) })));
    apart.set(true, { quiet: true });
    view.snapTo('home', { force: true, quiet: true });
    if (!result.correct) {
      paints.showDiff(result.diff);
      if (checked === key) {
        ctx.feedback.info(SAME_CHECK_TEXT);
        return;
      }
      checked = key;
      ctx.log.answer({ itemId: q.itemId, correct: false, tag: result.tag, given: key, expected: result.expected });
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(toastOf(result.message));
      bench.showNote(result.message, false, { tip: '층별로 벌어진 무대의 그 층에 내 그림을 겹쳐 보여요. 고친 다음 다시 [확인하기]를 눌러요.' });
      if (checker.wrong()) bench.showBounce({ retry: true });
      return;
    }
    ctx.log.answer({ itemId: q.itemId, correct: true, tag: null, given: key, expected: result.expected });
    solved = true;
    ctx.sfx.play('correct');
    ctx.feedback.correct(toastOf(result.message));
    paints.lock(true);
    paints.clearDiff();
    checker.hide();
    bench.clearBonus();
    bench.showNote(result.message, true, { tip: '쌓기나무를 누르면 그 자리의 개수가 나와요.' });
    bench.showNext(index + 1 >= questions.length ? '결과 보기' : '다음 문제', next);
    bench.focusNext();
  }

  function next() {
    index += 1;
    if (index >= questions.length) finishStage(stage, ctx);
    else {
      showQuestion();
      paints.focus();
    }
  }

  showQuestion();
  return () => {
    paints.destroy();
    bench.destroy();
  };
}

// ── 층별 모양을 보고 쌓기 ───────────────────
function playLayerBuild(stage, ctx, questions) {
  const { h } = ctx;
  const bench = createBench({ ctx, total: questions.length, build: true });
  const { view, tools } = bench;
  wideBench(bench);
  bench.mat.parentElement.classList.add('blk-s3', 'blk-layer-bench');
  const views = h('div', { class: 'blk-views blk-layer-views' });
  bench.given.append(views);
  const checker = createChecker({ ctx, bench, onCheck: () => check(), onHint: () => useHint() });
  const apart = createApartToggle({ ctx, bench });
  let index = 0;
  let solved = false;
  let checked = null;
  let hinted = null;

  function drawGiven(q, { diff = null } = {}) {
    views.replaceChildren(...q.layers.map((cells, i) => {
      const k = i + 1;
      const same = diff && diff[k].length === 0;
      // 틀린 뒤: 다른 층 모양은 칸에 ✗, 내 쌓기와 같은 층 모양은 이름표 옆에 ✓ (위, 앞, 옆을 보고 쌓기와 같다)
      const caption = same ? [`${k}층 `, h('span', { class: 'blk-same', title: '내 쌓기와 같아요' }, '✓')] : `${k}층`;
      const label = `${describeLayer(cells, k)}${same ? '. 내 쌓기와 같아요' : diff ? '. 내 쌓기와 다른 칸에 ✗' : ''}`;
      const mark = hinted ? { r: hinted.y, c: hinted.x } : null;
      return figure(h, caption, createGridPicture({ kind: 'top', cells, cell: 22, diff: diff?.[k] ?? [], mark, label }), 'blk-view-fig');
    }));
  }

  function showQuestion() {
    const q = questions[index];
    solved = false;
    checked = null;
    hinted = null;
    bench.given.classList.remove('is-done');
    bench.setQuestion(index + 1, '층별 모양을 보고 똑같이 쌓아 봐요.');
    drawGiven(q);
    checker.reset();
    apart.hide();
    bench.setTag(null);
    view.home();
    view.setApart(false);
    view.setLayerLook(false);
    view.setMarks({});
    tools.load(emptyMap());
    tools.lock(false);
    view.setViewEnabled(true);
    bench.controls.lock(false);
  }

  function useHint() {
    const hint = layerBuildHint(questions[index], tools.getMap());
    hinted = { x: hint.x, y: hint.y };
    drawGiven(questions[index]);
    return hint.text;
  }

  tools.onChange(() => {
    if (solved) return;
    view.setMarks({});
    drawGiven(questions[index]);
  });

  function check() {
    if (solved) return;
    const q = questions[index];
    const mine = tools.getMap();
    const result = judgeLayerBuild(q, mine);
    if (result.empty) {
      ctx.feedback.info(result.message);
      return;
    }
    if (!result.correct) {
      const again = checked === mapKey(mine);
      if (!again) {
        checked = mapKey(mine);
        ctx.log.answer({ itemId: q.itemId, correct: false, tag: result.tag, given: mapKey(mine), expected: result.expected });
        ctx.sfx.play('wrong');
      }
      drawGiven(q, { diff: result.diff });
      view.snapTo('home', { force: true, quiet: true });
      if (again) {
        ctx.feedback.info(SAME_CHECK_TEXT);
        return;
      }
      ctx.feedback.wrong(toastOf(result.message));
      bench.showNote(result.message, false);
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
    drawGiven(q);
    // 맞힌 뒤: 내 쌓기가 층마다 다른 색·층 숫자로 층별로 벌어진다
    view.setLayerLook(true);
    apart.show();
    apart.set(true, { quiet: true });
    view.snapTo('home', { force: true, quiet: true });
    bench.showNote(result.message, true);
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

// ── 층별 모양만 보고 알아내기 ─────────────────
function playLayerViews(stage, ctx, questions) {
  const { h } = ctx;
  const bench = createBench({ ctx, total: questions.length });
  const { view } = bench;
  wideBench(bench, { paint: true });
  bench.mat.parentElement.classList.add('blk-s3', 'blk-layer-bench');
  // 답하기 전에는 입체가 없다: 무대는 답한 뒤에 매트에 붙인다. 그 전에는 층별 모양 셋이 매트 가운데에 크게 놓인다
  view.el.remove();
  const planCard = h('div', { class: 'blk-photo blk-plan-card blk-layer-plan' });
  bench.mat.prepend(planCard);
  const paints = createPaints({ ctx, bench });
  const choiceRow = h('div', { class: 'answer-row blk-choices-4', role: 'group', 'aria-label': '쌓기나무의 개수 고르기', hidden: true });
  bench.answerBox.append(choiceRow);
  const checker = createChecker({ ctx, bench, onCheck: () => check(), onHint: () => drawHint(questions[index], paints.get(questions[index].kinds), { from: 'layers' }) });
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
    bench.setQuestion(index + 1, paint ? `층별 모양을 보고 ${viewTitle(q.kinds[0])}을 칠해 봐요.` : '똑같은 모양으로 만드는 데 필요한 쌓기나무는 모두 몇 개일까요?');
    // 답하기 전: 입체가 없다(무대 요소를 매트에서 떼어 둔다)
    view.el.remove();
    bench.controls.lock(true);
    view.setViewEnabled(false);
    view.home();
    view.setOverlay([]);
    view.setApart(false);
    view.setLayerLook(false);
    view.setMarks({});
    view.setMap(emptyMap());
    bench.card.hidden = true;
    bench.card.replaceChildren();
    planCard.hidden = false;
    planCard.replaceChildren(h('div', { class: 'blk-layer-row' }, q.layers.map((cells, i) => figure(h, layerTitle(i + 1), createGridPicture({ kind: 'top', cells, cell: 40, label: describeLayer(cells, i + 1) })))));
    if (paint) {
      paints.show(q.kinds);
      checker.reset();
      choiceRow.hidden = true;
      choiceRow.replaceChildren();
      buttons = [];
    } else {
      paints.hide();
      checker.hide();
      buttons = q.options.map((n) => choiceButton(h, { value: n, content: [h('b', null, String(n)), h('span', null, '개')], onclick: () => pick(n) }));
      choiceRow.replaceChildren(...buttons);
      choiceRow.hidden = false;
    }
  }

  /** 답했다: 입체가 나타난다(층마다 다른 색·층 숫자). 층별 모양은 매트 오른쪽 카드로 작게 옮긴다 */
  function reveal() {
    const q = questions[index];
    if (view.el.isConnected) return;
    planCard.hidden = true;
    bench.mat.prepend(view.el);
    bench.card.hidden = false;
    bench.card.replaceChildren(figure(h, '층별 모양', createLayerStrip({ layers: q.layers, label: LAYER_LABEL(q.layers) })));
    view.setFrozen(false, { board: true });
    view.setLayerLook(true);
    view.setMap(q.target);
    view.setViewEnabled(true);
    bench.controls.lock(false);
  }

  paints.onChange(() => {
    if (state.solved) return;
    paints.clearDiff();
    view.setOverlay([]);
  });

  view.on('tap', (hit) => {
    if (!view.el.isConnected) return;
    const n = questions[index].target[hit.y]?.[hit.x] ?? 0;
    if (n > 0) ctx.feedback.info(`${spotName(hit.x, hit.y)} 자리는 ${n}개예요.`);
  });

  function check() {
    if (state.solved) return;
    const q = questions[index];
    if (q.kind !== 'paint') return;
    if (!checkPaint({ ctx, bench, paints, checker, q, state, reveal, from: 'layers' })) return;
    bench.showNext(index + 1 >= questions.length ? '결과 보기' : '다음 문제', next);
    bench.focusNext();
  }

  function pick(value) {
    if (answered) return;
    answered = true;
    const q = questions[index];
    const result = judgeLayerCount(q, value);
    markChoice(buttons, value, q.expected, result.correct);
    // 답한 뒤: 입체가 나타나 층별로 벌어지고 층마다 몇 개인지 이름표가 붙는다
    reveal();
    view.setApart(true);
    view.setMarks({ layers: true });
    view.snapTo('home', { force: true, quiet: true });
    settle(ctx, bench, { q, result, given: value, chosen: buttons.find((b) => b.dataset.answer === String(value)), last: index + 1 >= questions.length, next });
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

// ── 도전: 더 붙여서 만들기 ───────────────────
function playAdd(stage, ctx, questions) {
  const { h } = ctx;
  const bench = createBench({ ctx, total: questions.length, build: true });
  const { view, tools } = bench;
  wideBench(bench);
  bench.mat.parentElement.classList.add('blk-s3', 'blk-add-bench');
  const optionRow = h('div', { class: 'blk-options blk-pictures blk-add-options', role: 'group', 'aria-label': '만들 수 있는 모양 모두 고르기' });
  const submitButton = h('button', { type: 'button', class: 'btn btn-primary btn-lg blk-add-submit', onclick: () => submitGuess() }, icon('check'), h('span', null, '다 골랐어요'));
  bench.answerBox.append(optionRow, submitButton);
  const checker = createChecker({ ctx, bench, onCheck: () => check(), onHint: () => useHint() });
  let buttons = [];
  let index = 0;
  let phase = 'guess'; // guess(예상) → build(내 판에서 붙여 만들기) → write(만든 모양에 수 쓰기) → done
  let chosen = new Set();
  let made = null; // 내가 만든 모양
  let grid = null; // 수 쓰기 판
  let checked = null;
  let lastWrong = [];

  const PROMPTS = {
    guess: (q) => `처음 모양에 쌓기나무를 ${q.n}개 더 붙여서 만들 수 있는 모양을 모두 골라 봐요.`,
    build: () => '만들 수 있는 모양 하나를 골라 내 판에서 직접 붙여 만들어 봐요.',
    write: () => '만든 모양을 위에서 본 모양에 수를 써서 나타내 봐요.',
  };

  /** 보기 버튼 하나의 안: 번호 · 그림(답한 뒤에는 붙인 쌓기나무에 점선) · 판정 글(답한 뒤) */
  function optionContent(q, i, { answered = false, mine = false } = {}) {
    const o = q.options[i];
    const verdict = answered ? addVerdict(q, i + 1) : null;
    const ok = o.role === 'answer';
    return [
      h('b', null, `${i + 1}번`),
      createBlockPicture({ map: o.map, unit: 22, label: `${i + 1}번 모양 그림${verdict ? `. ${verdict.long}${mine ? '. 내가 만든 모양이에요' : ''}` : ''}`, added: answered ? o.added : [] }),
      verdict && h('span', { class: `blk-verdict ${ok ? 'is-yes' : 'is-no'}`, 'aria-hidden': 'true' }, icon(ok ? 'ring' : 'cross'), h('span', null, mine ? '만든 모양' : verdict.short)),
    ];
  }

  function drawOptions(q, { answered = false } = {}) {
    buttons.forEach((b, i) => b.replaceChildren(...optionContent(q, i, { answered, mine: made && b.dataset.made === 'true' }).filter(Boolean)));
  }

  function showQuestion() {
    const q = questions[index];
    phase = 'guess';
    chosen = new Set();
    made = null;
    checked = null;
    lastWrong = [];
    grid?.el.remove();
    grid = null;
    bench.setQuestion(index + 1, PROMPTS.guess(q));
    buttons = q.options.map((_, i) => {
      const b = choiceButton(h, { value: i + 1, cls: 'blk-option blk-add-option', content: [], onclick: () => toggle(i + 1) });
      return b;
    });
    optionRow.classList.remove('is-answered');
    optionRow.replaceChildren(...buttons);
    drawOptions(q);
    submitButton.hidden = false;
    checker.hide();
    // 예상하기 전: 처음 모양은 멈춘 그림(판 없음 — "앞"·"옆" 글자와 화살표만), 내 판(위에서 본 판·쌓기 도구)이 없다
    bench.setTag(`쌓기나무 ${count(q.base)}개로 만든 처음 모양 그림이에요.`, 'lock');
    tools.pad.hidden = true;
    bench.band.classList.add('is-waiting');
    tools.load(q.base);
    tools.lock(true);
    view.home();
    view.setMarks({});
    view.setBare(false);
    view.setFrozen(true, { board: false, edges: true });
    view.setViewEnabled(false);
    bench.controls.lock(true);
    view.setMap(q.base);
  }

  function toggle(i) {
    if (phase !== 'guess') return;
    const b = buttons[i - 1];
    if (chosen.has(i)) chosen.delete(i);
    else chosen.add(i);
    const on = chosen.has(i);
    b.classList.toggle('is-chosen', on);
    b.setAttribute('aria-pressed', String(on));
    ctx.sfx.play('click');
    ctx.feedback.announce(on ? `${i}번을 골랐어요.` : `${i}번을 뺐어요.`);
  }

  function submitGuess() {
    if (phase !== 'guess') return;
    const q = questions[index];
    const result = judgeAddGuess(q, [...chosen]);
    if (result.empty) {
      ctx.feedback.info(result.message);
      return;
    }
    ctx.log.answer({ itemId: `${q.itemId}:guess`, correct: result.correct, tag: result.tag, given: result.given, expected: result.expected });
    ctx.sfx.play(result.correct ? 'correct' : 'wrong');
    for (const b of buttons) b.disabled = true;
    optionRow.classList.add('is-answered');
    drawOptions(q, { answered: true });
    submitButton.hidden = true;
    if (result.correct) ctx.feedback.correct(toastOf(result.message));
    else {
      ctx.feedback.wrong(toastOf(result.message));
      bench.showBounce();
    }
    bench.showNote(result.message, result.correct, { title: result.correct ? '맞아요' : '까닭', tip: '점선은 더 붙인 쌓기나무예요.' });
    startBuild();
  }

  /** 예상한 뒤: 내 판이 열린다(처음 모양이 놓여 있다) */
  function startBuild() {
    const q = questions[index];
    phase = 'build';
    checked = null;
    bench.setPrompt(PROMPTS.build());
    bench.setTag(null);
    view.setFrozen(false, { board: true });
    tools.pad.hidden = false;
    bench.band.classList.remove('is-waiting');
    tools.load(q.base);
    tools.lock(false);
    view.setViewEnabled(true);
    bench.controls.lock(false);
    checker.reset();
    tools.focusPad();
  }

  /** 만들었다: 만든 모양에 수를 쓴다(위에서 본 판 자리에 수 쓰기 판 — 판의 수는 보이지 않게 위에서 본 판을 숨긴다) */
  function startWrite() {
    phase = 'write';
    checked = null;
    lastWrong = [];
    bench.setPrompt(PROMPTS.write());
    tools.pad.hidden = true;
    grid = createNumberGrid({ ctx, top: topView(made), title: '만든 모양에 수 쓰기' });
    bench.controls.dirs.after(grid.el);
    grid.onChange(() => {
      if (phase !== 'write') return;
      grid.clearWrong();
      view.setMarks({ hidden: addedCells(questions[index].base, made), hiddenText: '붙인 쌓기나무' });
    });
    view.setBare(true); // 면에 자리 값(높이)을 싣지 않는다 — 돌려 보며 세는 것이 과제(자리마다 몇 개?와 같다)
    checker.reset();
    grid.focus();
  }

  function useHint() {
    const q = questions[index];
    if (phase === 'write') {
      const [x, y] = lastWrong[0] ?? spotsOf(made)[0];
      countUp(bench, made, [[x, y]], null);
      return `${spotName(x, y)} 자리를 아래부터 세어 볼게요. 무대에 센 수가 나와요.`;
    }
    const hint = addBuildHint(q);
    view.setMarks({ goal: [hint.x, hint.y] });
    tools.setGoal([hint.x, hint.y]);
    return hint.text;
  }

  tools.onChange(() => {
    if (phase !== 'build') return;
    view.setMarks({});
    tools.setGoal(null);
  });

  function check() {
    if (phase === 'build') checkBuild();
    else if (phase === 'write') checkWrite();
  }

  function checkBuild() {
    const q = questions[index];
    const mine = tools.getMap();
    const result = judgeAddBuild(q, mine);
    if (result.status === 'empty' || result.status === 'unchanged' || result.status === 'notOption') {
      ctx.feedback.info(result.message); // 기록하지 않는다
      return;
    }
    if (result.status === 'wrong') {
      const again = checked === mapKey(mine);
      view.snapTo('home', { force: true, quiet: true });
      if (again) {
        ctx.feedback.info(SAME_CHECK_TEXT);
        return;
      }
      checked = mapKey(mine);
      ctx.log.answer({ itemId: `${q.itemId}:build`, correct: false, tag: result.tag, given: mapKey(mine), expected: q.expected });
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(toastOf(result.message));
      bench.showNote(result.message, false, { tip: '[되돌리기]를 누르면 하나씩 돌아가요.' });
      if (checker.wrong()) bench.showBounce({ retry: true });
      return;
    }
    ctx.log.answer({ itemId: `${q.itemId}:build`, correct: true, tag: null, given: mapKey(mine), expected: q.expected });
    ctx.sfx.play('correct');
    ctx.feedback.correct(toastOf(result.message));
    made = mine;
    bench.clearBonus();
    tools.lock(true);
    tools.setGoal(null);
    buttons[result.option - 1].dataset.made = 'true';
    buttons[result.option - 1].classList.add('is-made');
    drawOptions(q, { answered: true });
    // 붙인 쌓기나무를 점선으로 표시한다
    view.setMarks({ hidden: addedCells(q.base, made), hiddenText: '붙인 쌓기나무' });
    view.snapTo('home', { force: true, quiet: true });
    bench.showNote(result.message, true);
    startWrite();
  }

  function checkWrite() {
    const q = questions[index];
    const numbers = grid.get();
    const nq = addNumberQuestion(q, made);
    const result = judgeNumbers(nq, numbers);
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
      ctx.log.answer({ itemId: `${q.itemId}:write`, correct: false, tag: result.tag, given: mapKey(numbers), expected: result.expected });
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(toastOf(result.message));
      bench.showNote(result.message, false, { tip: '무대를 돌려 가려진 쌓기나무도 세어요.' });
      if (checker.wrong()) bench.showBounce({ retry: true });
      return;
    }
    ctx.log.answer({ itemId: `${q.itemId}:write`, correct: true, tag: null, given: mapKey(numbers), expected: result.expected });
    phase = 'done';
    ctx.sfx.play('correct');
    ctx.feedback.correct(toastOf(result.message));
    grid.lock(true);
    checker.hide();
    bench.clearBonus();
    view.setBare(false);
    view.setMarks({});
    bench.showNote(result.message, true);
    countUp(bench, made, spotsOf(made), null);
    bench.showNext(index + 1 >= questions.length ? '결과 보기' : '다음 문제', next);
    bench.focusNext();
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

const SCREENS = { layerdraw: playLayerDraw, layerbuild: playLayerBuild, layerviews: playLayerViews, add: playAdd };

/** S3 단계 종류에 맞는 화면을 그린다 → 정리 함수 */
export function playLayers(stage, ctx, questions) {
  const screen = SCREENS[stage.kind];
  if (!screen) throw new Error(`알 수 없는 쌓기나무 단계 종류: ${stage.kind}`);
  return screen(stage, ctx, questions);
}
