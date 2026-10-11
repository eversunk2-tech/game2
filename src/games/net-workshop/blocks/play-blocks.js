/**
 * 쌓기나무 단계 화면 (S1: 1·2차시). 기획서: spec-grade6.md 2-4·3·5절, 공통 규칙: common-rules.md
 * 틀: 왼쪽 재단 매트(쌓기나무 무대 + 방향 버튼 + 위에서 본 판 + 조작판 + 도구 띠), 오른쪽 작업 지시서(엔진 ctx.ui.order).
 *
 *   play    쌓기 놀이터 — 주문 셋을 차례로 해 본다(채점 없음: ctx.log.answer를 부르지 않는다)
 *   where   그림이 어느 쪽(가~라)에서 본 모습인지 고른다. 답하기 전에는 판이 멈춰 있고 방향 버튼·조작판이 없다
 *   scene   위에서 내려다본 배치 그림과 화살표를 보고 그쪽에서 본 모습을 고른다. 답하기 전에는 입체가 없다
 *   copy    그림 한 장을 보고 똑같이 쌓는다 → [확인하기]. 맞힐 때까지 다시 하고 틀린 시도도 기록한다
 *   count   그림과 위에서 본 모양을 보고 개수를 고른다. 답하기 전에는 보이는 면만 있는 멈춘 그림
 *   hidden  쌓기 → "다른 개수로도?" 예상 → (있으면) 다른 개수로 한 번 더 쌓기
 *
 * 정답 노출(5절): 돌려 보면 답이 보이는 문항의 그림은 답하기 전에 돌릴 수 없다. 내 판은 늘 돌릴 수 있다.
 * 내 쌓기를 그림과 견준 표시(✗)는 [확인하기] 뒤에만 나온다. 점수는 엔진이 ctx.log.answer로 계산한다.
 */
import { icon } from '../../../shared/ui/icons.js';
import { cellsOf, count, emptyMap, hiddenCells, lookDiff, mapKey, toCorner, topView } from './blocks.js';
import {
  DIR_LETTERS,
  MAP_SIDES,
  MORE_CLUES,
  MORE_CLUE_ANSWER,
  SCULPTURES,
  buildHint,
  describeScene,
  judgeBuild,
  judgeCount,
  judgeDirection,
  judgeGuess,
  judgeLook,
  judgeOther,
  judgeScene,
  otherLook,
  sculptureOf,
  spotName,
} from './blocks-logic.js';
import { createBlockTools } from './block-pad.js';
import { DEFAULT_DIRS, DEFAULT_EDGE, EDGE_FAR, SIDE_NAMES, createBlockPicture, createBlockView, createViewControls } from './block-view.js';
import { createFloorPlan, createSceneMap, createScenePicture, createSwatch } from './grid-draw.js';

/** 알림을 매트 아래 띠 위에 띄운다 (전개도 무대와 같은 값) */
const TOAST_LIFT = 64;
/** 틀린 쪽으로 먼저 돌아간 뒤 바른 쪽으로 돌 때까지 머무는 시간(ms) */
const LOOK_PAUSE = 900;
/** 같은 문항을 이만큼 틀리면 [힌트]가 열린다 */
const HINT_AFTER_WRONG = 2;

/**
 * 알림(토스트)에 띄울 짧은 글: 까닭의 첫 문장만("맞아요!" 같은 한 마디뿐이면 다음 문장까지).
 * 긴 까닭은 작업 지시서의 쪽지에 그대로 있다 — 알림이 세 줄이 되면 좁은 화면에서 답 버튼을 가린다.
 */
export function toastOf(message) {
  // (정규식의 뒤돌아보기는 옛 사파리에서 문법 오류라 쓰지 않는다)
  const parts = (String(message).match(/[^.!?]+[.!?]+/g) ?? [String(message)]).map((part) => part.trim());
  let out = parts[0] ?? '';
  for (let i = 1; i < parts.length && out.length < 8; i += 1) out += ` ${parts[i]}`;
  return out;
}

const lookOf = (id) => {
  const s = sculptureOf(id);
  return { token: `--face-${s.face}`, mark: s.mark };
};
const colorsOf = (color) => color.map((row) => row.map((id) => (id ? lookOf(id) : null)));

/** 조형물이 놓인 자리를 글로: "노란 탑 3층은 2줄 1칸, 파란 기둥 2층은 …" (줄은 앞줄부터, 칸은 왼쪽부터) */
function placesOf(color) {
  return SCULPTURES.map((s) => {
    for (let y = 0; y < color.length; y += 1) for (let x = 0; x < color[y].length; x += 1) if (color[y][x] === s.id) return `${s.name} ${s.height}층은 ${spotName(x, y)}`;
    return '';
  }).filter(Boolean).join(', ');
}

/** 둘레 네 방향(가~라) ↔ 무대의 보기 이름 */
const VIEW_OF = { front: 'front', right: 'side', back: 'back', left: 'left' };
// 뒤(다)·왼쪽(라) 글자는 처음 보기에서 높은 조형물에 가리지 않게 판에서 더 멀리 둔다
const AROUND_EDGE = Object.keys(DIR_LETTERS).map((dir) => ({ text: DIR_LETTERS[dir], at: dir, out: dir === 'back' || dir === 'left' ? EDGE_FAR : undefined }));
const AROUND_DIRS = Object.keys(DIR_LETTERS).map((dir) => ({ id: VIEW_OF[dir], text: DIR_LETTERS[dir], label: `${DIR_LETTERS[dir]} 쪽에서 보기` }));
const AROUND_NAMES = { top: '위', front: '가 쪽', side: '나 쪽', back: '다 쪽', left: '라 쪽' };

/**
 * 화면 틀. build면 내 판(쌓기 도구)이 있다.
 * → { view, controls, tools, mat, panel, given, answerBox, band, setQuestion, showNote, showBounce, clearBonus, showNext, hideNext, focusNext, after, destroy }
 */
function createBench({ ctx, total, build = false, edge = DEFAULT_EDGE, dirs = DEFAULT_DIRS, names = SIDE_NAMES, board = true, label = '문제' }) {
  const { h } = ctx;
  const view = createBlockView({ h, board, edge, names });
  const controls = createViewControls({ ctx, view, dirs });
  const tools = build ? createBlockTools({ ctx, view }) : null;
  const order = ctx.ui.order({ kind: ctx.stage.order ?? '', label: '문제 판' });
  order.counter.classList.add('q-counter');
  const prompt = h('p', { class: 'q-prompt blk-prompt' });
  const given = h('div', { class: 'blk-given' });
  const answerBox = h('div', { class: 'q-answer blk-answer' });
  const noteSlot = h('div', { class: 'reason-slot' });
  const pickSlot = h('div', { class: 'pick-slot' });
  const bonusSlot = h('div', { class: 'bonus-slot' });
  const nextLabel = h('span', null, '');
  const nextButton = h('button', { type: 'button', class: 'btn btn-primary btn-lg next-btn', hidden: true }, nextLabel, icon('play'));
  let onNext = null;
  nextButton.addEventListener('click', () => {
    ctx.sfx.play('click');
    onNext?.();
  });
  // 도구 띠: 내 판이 있으면 쌓기 도구, 없으면 단계가 채우는 빈 띠
  const band = tools ? tools.band : h('div', { class: 'mat-tools blk-tools' });
  // 매트 오른쪽(조작판 아래)의 주어진 그림 한 장 — 내 판 바로 옆에서 견줘 본다
  const card = h('div', { class: 'blk-card', hidden: true });
  // 매트 왼쪽의 이름표 칸(조형물 이름 등)
  const key = h('div', { class: 'blk-key', hidden: true });
  const mat = h('div', { class: `mat blk-mat${build ? ' is-build' : ''}` }, view.el, controls.dirs, tools?.pad, key, controls.pad, card, band);
  order.el.classList.add('net-panel', 'blk-panel');
  order.el.append(prompt, given, answerBox, noteSlot, pickSlot, bonusSlot, nextButton);
  ctx.el.append(h('div', { class: 'workbench blk-bench' }, mat, order.el));
  ctx.feedback.anchor?.(mat, { lift: TOAST_LIFT, narrow: 'below' });

  // 매트 위쪽 이름표(눌리지 않는 칩): 무대에 무엇이 놓여 있는지 한 줄
  const tag = h('p', { class: 'board-legend blk-tag', hidden: true });
  mat.append(tag);

  const timers = new Set();
  /** 단계에서 나가면 함께 지워지는 타이머 */
  const after = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  function showNote(text, correct, { title = correct ? '맞아요' : '어디가 다를까요?', tip = '' } = {}) {
    const note = ctx.ui.note({ type: correct ? 'correct' : 'wrong', title, text, tip });
    note.classList.add('reason', correct ? 'is-correct' : 'is-wrong');
    note.setAttribute('role', 'status');
    noteSlot.replaceChildren(note);
  }

  /** 보너스 쪽지: 틀린 뒤 "다시 일어서기"·"다시 도전" 기회를 글로 보인다 (점수는 엔진이 행동으로 계산) */
  function showBounce({ retry = false } = {}) {
    const peek = ctx.reward.peek?.();
    if (!peek?.on || peek.practice === false) return;
    bonusSlot.replaceChildren(retry
      ? ctx.ui.bonus(h('b', null, '다시 도전'), ' · 고쳐서 맞히면 +1, 다음 문제도 맞히면 다시 일어서기 +1')
      : ctx.ui.bonus(h('b', null, '다시 일어서기'), ' · 다음 문제를 맞히면 +1'));
  }

  return {
    view,
    controls,
    tools,
    mat,
    band,
    card,
    key,
    bonusSlot,
    panel: order.el,
    given,
    answerBox,
    pickSlot,
    after,
    setQuestion(number, text) {
      // 앞 문항이 걸어 둔 움직임(틀린 쪽 → 바른 쪽으로 돌기 등)은 버린다
      for (const id of timers) clearTimeout(id);
      timers.clear();
      // 앞 문항의 알림도 지운다(다음 문항 위에 앞 문항의 개수·까닭이 떠 있지 않게). 화면 읽기에는 새 문항을 알린다
      if (number > 1) {
        ctx.feedback.clear();
        ctx.feedback.announce(`${label} ${number}번이에요.`);
      }
      order.setCounter(`${label} ${number} / ${total}`);
      ctx.setProgress?.(number, total, { label });
      prompt.textContent = text;
      noteSlot.replaceChildren();
      pickSlot.replaceChildren();
      bonusSlot.replaceChildren();
      nextButton.hidden = true;
      onNext = null;
      tag.hidden = true;
    },
    setPrompt(text) {
      prompt.textContent = text;
    },
    /** 매트 이름표를 바꾼다(null이면 숨긴다) */
    setTag(text, iconName = 'info') {
      tag.hidden = !text;
      tag.replaceChildren(...(text ? [icon(iconName), text] : []));
    },
    showNote,
    clearNote() {
      noteSlot.replaceChildren();
    },
    showBounce,
    clearBonus() {
      bonusSlot.replaceChildren();
    },
    showNext(text, fn) {
      nextLabel.textContent = text;
      nextButton.hidden = false;
      onNext = fn;
    },
    hideNext() {
      nextButton.hidden = true;
      onNext = null;
    },
    focusNext() {
      nextButton.focus({ preventScroll: true });
    },
    destroy() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      tools?.destroy();
      controls.destroy();
      view.destroy();
    },
  };
}

/** 그림 한 칸: 그림(SVG) + 이름표 */
const figure = (h, caption, svg, cls = '') => h('figure', { class: `blk-figure ${cls}`.trim() }, svg, h('figcaption', null, caption));

/** 조형물 셋의 이름표(색·무늬·이름·높이) */
function legend(h) {
  return h('ul', { class: 'blk-legend', 'aria-label': '조형물' }, SCULPTURES.map((s) => h('li', null, createSwatch(lookOf(s.id)), `${s.name} ${s.height}층`)));
}

/** 쌓인 자리가 판의 왼쪽 앞 구석에서 얼마나 떨어져 있는가 [칸, 줄] */
function cornerOffset(map) {
  let offX = map[0].length;
  let offY = map.length;
  map.forEach((row, y) => row.forEach((v, x) => {
    if (v > 0) {
      offX = Math.min(offX, x);
      offY = Math.min(offY, y);
    }
  }));
  return [offX, offY];
}

// ── 쌓기 놀이터 ──────────────────────────
function playPlay(stage, ctx, questions) {
  const { h } = ctx;
  const [q] = questions;
  const bench = createBench({ ctx, total: 3, build: true, label: '주문' });
  const { view, tools } = bench;
  const [gx, gy] = q.spot;
  const tasks = [
    { text: `노란 자리(${spotName(gx, gy)})에 ${q.height}층으로 쌓아요.`, tip: '무대의 노란 자리를 짧게 누르거나, "위에서 본 판"의 칸을 눌러요.' },
    { text: '쌓기나무 하나를 빼요.', tip: '[빼기]를 누른 다음 쌓기나무를 눌러요. 다 뺐으면 [쌓기]로 돌아와요.' },
    { text: '[앞]을 눌러 앞에서 봐요.', tip: '무대를 끌면 어느 쪽으로든 돌아가요. 짧게 누르면 쌓이고, 끌면 돌아가요.' },
  ];
  const items = tasks.map((t, i) => h('li', { class: 'blk-task', dataset: { task: i + 1 } },
    h('span', { class: 'blk-task-mark', 'aria-hidden': 'true' }, String(i + 1)),
    h('span', { class: 'blk-task-text' }, t.text)));
  const tip = h('p', { class: 'answer-tip blk-task-tip' });
  bench.answerBox.append(h('ol', { class: 'blk-tasks' }, items), tip);
  const finishButton = h('button', { type: 'button', class: 'btn btn-primary btn-lg next-btn blk-finish', hidden: true, onclick: () => finish() }, h('span', null, '놀이터 마치기'), icon('play'));
  bench.panel.append(finishButton);
  let done = 0;

  function show() {
    items.forEach((li, i) => {
      li.classList.toggle('is-done', i < done);
      li.classList.toggle('is-now', i === done);
      li.querySelector('.blk-task-mark').replaceChildren(i < done ? icon('check') : String(i + 1));
      if (i === done) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    ctx.setProgress?.(Math.min(done + 1, tasks.length), tasks.length, { label: '주문', done, check: true });
    const goal = done === 0 ? q.spot : null;
    view.setMarks({ goal });
    tools.setGoal(goal);
    if (done < tasks.length) {
      bench.setPrompt('주문을 차례로 해 봐요.');
      tip.textContent = tasks[done].tip;
      return;
    }
    bench.setPrompt('주문 셋을 모두 했어요!');
    tip.textContent = '끌어서 돌려 보고, 마음껏 쌓아 봐도 좋아요. 다 했으면 [놀이터 마치기]를 눌러요.';
    finishButton.hidden = false;
  }

  function complete(index, text) {
    if (done !== index) return;
    done += 1;
    ctx.sfx.play('correct');
    ctx.feedback.correct(text);
    show();
    if (done === tasks.length) finishButton.focus({ preventScroll: true });
  }

  tools.onChange(({ map, kind }) => {
    if (done === 0 && map[gy][gx] === q.height) complete(0, `좋아요! ${spotName(gx, gy)}에 ${q.height}층으로 쌓았어요.`);
    else if (done === 1 && kind === 'remove') complete(1, '좋아요! 하나를 뺐어요.');
  });
  view.on('facing', (name) => {
    if (name === 'front') complete(2, '좋아요! 앞에서 본 모습이에요.');
  });

  function finish() {
    ctx.sfx.play('click');
    // 채점 없음: 답 기록이 없다. 결과의 기록 칸은 해 본 주문 수로 채운다
    ctx.finish({ stars: 3, stats: [{ label: '해 본 주문', value: `${tasks.length}가지` }] });
  }

  bench.setQuestion(1, '주문을 차례로 해 봐요.');
  tools.load(emptyMap());
  tools.lock(false);
  view.setViewEnabled(true);
  bench.controls.lock(false);
  show();
  return () => bench.destroy();
}

/** 고르는 버튼 하나 (답 버튼과 같은 모습) */
const choiceButton = (h, { value, content, onclick, cls = '' }) => h('button', {
  type: 'button',
  class: `btn btn-lg answer-btn blk-choice ${cls}`.trim(),
  dataset: { answer: value },
  'aria-pressed': 'false',
  onclick,
}, content);

function markChoice(buttons, value, expected, correct) {
  for (const b of buttons) {
    b.disabled = true;
    const mine = b.dataset.answer === String(value);
    b.classList.toggle('is-chosen', mine);
    b.classList.toggle('is-dim', !mine);
    b.setAttribute('aria-pressed', String(mine));
    if (!correct && b.dataset.answer === String(expected)) b.classList.add('is-answer');
  }
}
function resetChoices(buttons) {
  for (const b of buttons) {
    b.disabled = false;
    // 앞 문항에서 튀거나 흔들린 표시(fx-*)도 지운다: 새 문항의 답 버튼은 넷 모두 같은 모습이어야 한다
    b.classList.remove('is-chosen', 'is-dim', 'is-answer', 'fx-correct', 'fx-wrong');
    b.setAttribute('aria-pressed', 'false');
  }
}

/** 한 번 답하고 확인하는 단계(where·scene·count)의 공통 흐름: 답 기록 → 알림 → 까닭 쪽지 → 다음 */
function settle(ctx, bench, { q, result, given, chosen, last, next }) {
  ctx.log.answer({ itemId: q.itemId, correct: result.correct, tag: result.tag, given, expected: result.expected });
  ctx.sfx.play(result.correct ? 'correct' : 'wrong');
  if (result.correct) ctx.feedback.correct(toastOf(result.message), chosen);
  else {
    ctx.feedback.wrong(toastOf(result.message), chosen);
    bench.showBounce();
  }
  bench.showNote(result.message, result.correct, { title: result.correct ? '맞아요' : '까닭' });
  bench.showNext(last ? '결과 보기' : '다음 문제', next);
  bench.focusNext();
}

// ── 어느 방향에서 보았을까? ─────────────────
function playWhere(stage, ctx, questions) {
  const { h } = ctx;
  const bench = createBench({ ctx, total: questions.length, edge: AROUND_EDGE, dirs: AROUND_DIRS, names: AROUND_NAMES });
  const { view } = bench;
  bench.card.hidden = false;
  bench.key.hidden = false;
  bench.key.append(legend(h));
  const buttons = Object.keys(DIR_LETTERS).map((dir) => choiceButton(h, {
    value: dir,
    content: [h('b', null, DIR_LETTERS[dir]), h('span', null, ' 쪽')],
    onclick: () => answer(dir),
  }));
  bench.answerBox.append(h('div', { class: 'answer-row blk-choices-4', role: 'group', 'aria-label': '어느 쪽에서 본 모습인지 고르기' }, buttons));
  let index = 0;
  let answered = false;

  function showQuestion() {
    const q = questions[index];
    answered = false;
    bench.setQuestion(index + 1, '이 그림은 어느 쪽에서 본 모습일까요?');
    bench.card.replaceChildren(figure(h, '본 모습', createScenePicture({ scene: q.picture, look: lookOf, label: `어느 쪽에서 본 모습. ${describeScene(q.picture)}` })));
    resetChoices(buttons);
    // 답하기 전: 판은 처음 보기로 멈춰 있고, 방향 버튼·조작판이 없다 (돌리면 그 모습이 보이는 쪽을 찾을 수 있다)
    view.home();
    view.setFrozen(true);
    view.setViewEnabled(false);
    bench.controls.lock(true);
    view.setMap(q.h, { colors: colorsOf(q.color) });
    // 판 위의 배치를 글로도 알린다(그림을 보지 못해도 풀 수 있게 — 모습이 아니라 놓인 자리라 답이 아니다)
    view.setLabel(`판 위의 조형물: ${placesOf(q.color)}. 화살표 가는 앞줄 쪽, 나는 오른쪽, 다는 뒷줄 쪽, 라는 왼쪽에서 판을 봐요.`);
  }

  function answer(dir) {
    if (answered) return;
    answered = true;
    const q = questions[index];
    const result = judgeDirection(q, dir);
    markChoice(buttons, dir, q.dir, result.correct);
    // 답한 뒤: 입체가 풀려 그 방향으로 돈다. 틀렸으면 고른 쪽으로 먼저 돌아간 뒤 바른 쪽으로
    view.setLabel(null);
    view.setFrozen(false);
    view.setViewEnabled(true);
    bench.controls.lock(false);
    view.snapTo(VIEW_OF[dir], { quiet: !result.correct });
    if (!result.correct) bench.after(() => view.snapTo(VIEW_OF[q.dir]), LOOK_PAUSE);
    settle(ctx, bench, { q, result, given: DIR_LETTERS[dir], chosen: buttons.find((b) => b.dataset.answer === dir), last: index + 1 >= questions.length, next });
  }

  function next() {
    index += 1;
    if (index >= questions.length) ctx.finish();
    else {
      showQuestion();
      buttons[0].focus({ preventScroll: true });
    }
  }

  showQuestion();
  return () => bench.destroy();
}

// ── 이쪽에서 보면? ───────────────────────
function playScene(stage, ctx, questions) {
  const { h } = ctx;
  const bench = createBench({ ctx, total: questions.length, edge: [], dirs: [], names: AROUND_NAMES });
  const { view } = bench;
  // 답하기 전에는 입체가 없다: 무대는 답한 뒤에 매트에 붙인다. 그 전에는 위에서 내려다본 배치 그림이 매트에 놓인다
  view.el.remove();
  const mapCard = h('div', { class: 'blk-photo blk-map-card' });
  bench.mat.prepend(mapCard);
  const optionRow = h('div', { class: 'blk-options', role: 'group', 'aria-label': '화살표 쪽에서 본 모습 고르기' });
  bench.key.hidden = false;
  bench.key.append(legend(h));
  bench.answerBox.append(optionRow);
  let buttons = [];
  let index = 0;
  let answered = false;

  function showQuestion() {
    const q = questions[index];
    answered = false;
    bench.setQuestion(index + 1, '화살표 쪽에서 보면 어떤 모습일까요?');
    view.el.remove();
    bench.controls.lock(true);
    view.setViewEnabled(false);
    view.home();
    view.setMap(emptyMap(), { colors: null });
    mapCard.replaceChildren(figure(h, '위에서 내려다본 그림', createSceneMap({
      color: q.color,
      look: lookOf,
      dir: q.dir,
      label: `위에서 내려다본 그림. ${placesOf(q.color)}. 화살표는 ${MAP_SIDES[q.dir]}에서 판을 향해요.`,
    })));
    mapCard.hidden = false;
    buttons = q.options.map((o, i) => choiceButton(h, {
      value: i + 1,
      cls: 'blk-option',
      content: [h('b', null, `${i + 1}번`), createScenePicture({ scene: o.picture, look: lookOf, label: describeScene(o.picture), cell: 20 })],
      onclick: () => (answered ? lookFrom(o.dir) : answer(i + 1)),
    }));
    optionRow.replaceChildren(...buttons);
  }

  /** 답한 뒤에는 보기 그림을 누르면 무대가 그 그림 쪽으로 돈다 */
  function lookFrom(dir) {
    ctx.sfx.play('click');
    view.snapTo(VIEW_OF[dir], { quiet: true });
    ctx.feedback.announce(`${MAP_SIDES[dir]}에서 본 모습이에요.`);
  }

  function answer(choice) {
    if (answered) return;
    answered = true;
    const q = questions[index];
    const result = judgeScene(q, choice);
    for (const b of buttons) {
      const mine = b.dataset.answer === String(choice);
      b.classList.toggle('is-chosen', mine);
      b.setAttribute('aria-pressed', String(mine));
      if (!result.correct && b.dataset.answer === String(q.expected)) b.classList.add('is-answer');
      b.setAttribute('title', '이 그림 쪽에서 보기');
    }
    // 입체가 나타나 그 방향으로 돈다
    mapCard.hidden = true;
    bench.mat.prepend(view.el);
    view.setFrozen(false);
    view.setEdge([{ text: '여기', at: q.dir }]);
    view.setMap(q.h, { colors: colorsOf(q.color) });
    view.setViewEnabled(true);
    bench.controls.lock(false);
    view.snapTo(VIEW_OF[result.chosenDir ?? q.dir], { quiet: true });
    if (!result.correct) bench.after(() => view.snapTo(VIEW_OF[q.dir], { quiet: true }), LOOK_PAUSE);
    settle(ctx, bench, { q, result, given: choice, chosen: buttons[choice - 1], last: index + 1 >= questions.length, next });
  }

  function next() {
    index += 1;
    if (index >= questions.length) ctx.finish();
    else {
      showQuestion();
      buttons[0].focus({ preventScroll: true });
    }
  }

  showQuestion();
  return () => bench.destroy();
}

// ── 모두 몇 개일까? ───────────────────────
function playCount(stage, ctx, questions) {
  const { h } = ctx;
  const bench = createBench({ ctx, total: questions.length });
  const { view } = bench;
  bench.card.hidden = false;
  const choiceRow = h('div', { class: 'answer-row blk-choices-4', role: 'group', 'aria-label': '쌓기나무의 개수 고르기' });
  bench.answerBox.append(choiceRow);
  const apartIcon = h('span', { class: 'btn-ico', 'aria-hidden': 'true' }, icon('layers'));
  const apartText = h('span', null, '층별로 벌려 보기');
  const apartButton = h('button', { type: 'button', class: 'btn blk-apart', hidden: true, 'aria-pressed': 'false', onclick: () => setApart(!view.isApart()) }, apartIcon, apartText);
  bench.band.append(apartButton);
  let buttons = [];
  let index = 0;
  let answered = false;

  function setApart(value, { quiet = false } = {}) {
    view.setApart(value);
    apartButton.setAttribute('aria-pressed', String(value));
    apartText.textContent = value ? '다시 모으기' : '층별로 벌려 보기';
    if (!quiet) {
      ctx.sfx.play('click');
      ctx.feedback.announce(value ? '층별로 벌렸어요.' : '다시 모았어요.');
    }
  }

  function showQuestion() {
    const q = questions[index];
    answered = false;
    bench.setQuestion(index + 1, '똑같은 모양으로 만드는 데 필요한 쌓기나무는 모두 몇 개일까요?');
    bench.card.replaceChildren(figure(h, '위에서 본 모양', createFloorPlan({ top: q.top, unit: 26 })));
    buttons = q.options.map((n) => choiceButton(h, { value: n, content: [h('b', null, String(n)), h('span', null, '개')], onclick: () => answer(n) }));
    choiceRow.replaceChildren(...buttons);
    // 답하기 전: 보이는 면만 있는 멈춘 그림(숨겨진 쌓기나무는 DOM에도 없다). 방향 버튼·조작판·벌려 보기가 없다
    setApart(false, { quiet: true });
    apartButton.hidden = true;
    bench.setTag('그림이에요. 답한 뒤에 돌려 볼 수 있어요.', 'lock');
    view.home();
    view.setMarks({});
    view.setFrozen(true, { board: false });
    view.setViewEnabled(false);
    bench.controls.lock(true);
    view.setMap(q.target);
  }

  function answer(value) {
    if (answered) return;
    answered = true;
    const q = questions[index];
    const result = judgeCount(q, value);
    markChoice(buttons, value, q.expected, result.correct);
    // 답한 뒤: 그림이 입체가 된다 — 돌려 보고 층별로 벌려 볼 수 있다. 숨어 있던 쌓기나무에는 점선 테두리와 글자
    bench.setTag(null);
    view.setFrozen(false, { board: true });
    view.setMarks({ hidden: q.hidden, layers: true });
    view.setViewEnabled(true);
    bench.controls.lock(false);
    apartButton.hidden = false;
    if (q.hidden.length > 0 || !result.correct) setApart(true, { quiet: true });
    settle(ctx, bench, { q, result, given: value, chosen: buttons.find((b) => b.dataset.answer === String(value)), last: index + 1 >= questions.length, next });
  }

  // 답한 뒤 쌓기나무를 누르면 그 자리의 개수가 뜬다(손끝으로 세기)
  view.on('tap', (hit) => {
    if (!answered) return;
    const n = questions[index].target[hit.y]?.[hit.x] ?? 0;
    if (n > 0) ctx.feedback.info(`${spotName(hit.x, hit.y)} 자리는 ${n}개예요.`);
  });

  function next() {
    index += 1;
    if (index >= questions.length) ctx.finish();
    else {
      showQuestion();
      buttons[0].focus({ preventScroll: true });
    }
  }

  showQuestion();
  return () => bench.destroy();
}

// ── 쌓는 단계가 함께 쓰는 것 ─────────────────
/**
 * [확인하기] 버튼과 [힌트] — 매트 아래 띠의 오른쪽 끝에 놓는다(쌓기 도구 바로 옆).
 * 틀린 횟수를 세어 HINT_AFTER_WRONG번이면 힌트를 연다(문항마다 1번). 힌트 글은 작업 지시서의 보너스 쪽지 자리에 나온다.
 * → { reset, wrong(), hide, show, focus }
 */
function createChecker({ ctx, bench, onCheck, onHint }) {
  const { h } = ctx;
  const button = h('button', { type: 'button', class: 'btn btn-primary blk-check', onclick: () => onCheck() }, icon('check'), h('span', null, '확인하기'));
  const hintButton = h('button', { type: 'button', class: 'btn hint-btn blk-hint', hidden: true, onclick: () => useHint() }, icon('bulb'), h('span', null, '힌트'));
  bench.band.append(hintButton, button);
  let wrongs = 0;
  let used = false;
  function useHint() {
    if (used) return;
    used = true;
    hintButton.disabled = true;
    ctx.sfx.play('click');
    const text = onHint();
    if (text) bench.bonusSlot.replaceChildren(h('p', { class: 'answer-tip blk-hint-text', role: 'status' }, icon('bulb'), h('span', null, text)));
  }
  return {
    reset() {
      wrongs = 0;
      used = false;
      button.hidden = false;
      hintButton.hidden = true;
      hintButton.disabled = false;
    },
    /** 틀린 [확인하기] 한 번. 두 번이면 힌트 버튼이 열린다 */
    wrong() {
      wrongs += 1;
      if (wrongs >= HINT_AFTER_WRONG && !used) hintButton.hidden = false;
      return !used;
    },
    hintUsed: () => used,
    hide() {
      button.hidden = true;
      hintButton.hidden = true;
    },
    focus() {
      button.focus({ preventScroll: true });
    },
  };
}

/** 내 쌓기에서 다른 면을 무대에 표시하고(✗), 그림과 같은 쪽에서 보게 돌린다 */
function showDiff(view, mine, target) {
  const diff = lookDiff(mine, target);
  view.setMarks({ diff: diff.extra });
  view.snapTo('home', { force: true, quiet: true });
  return diff;
}

// ── 똑같이 만들기 ────────────────────────
function playCopy(stage, ctx, questions) {
  const { h } = ctx;
  const bench = createBench({ ctx, total: questions.length, build: true });
  const { view, tools } = bench;
  const checker = createChecker({ ctx, bench, onCheck: () => check(), onHint: () => buildHint(questions[index], tools.getMap()).text });
  bench.card.hidden = false;
  let index = 0;
  let solved = false;

  const drawPicture = (q, diff = []) => bench.card.replaceChildren(figure(h, '그림', createBlockPicture({ map: q.target, unit: 30, diff })));

  function showQuestion() {
    const q = questions[index];
    solved = false;
    bench.setQuestion(index + 1, '그림과 똑같은 모양으로 쌓아 봐요.');
    drawPicture(q);
    checker.reset();
    view.home();
    view.setMarks({});
    tools.load(emptyMap());
    tools.lock(false);
    view.setViewEnabled(true);
    bench.controls.lock(false);
  }

  // 쌓기를 고치면 지난 확인의 표시(✗)는 지운다 — 내 쌓기를 그림과 견준 표시는 [확인하기] 뒤에만 나온다
  tools.onChange(() => {
    if (solved) return;
    view.setMarks({});
    drawPicture(questions[index]);
  });

  function check() {
    if (solved) return;
    const q = questions[index];
    const mine = tools.getMap();
    const result = judgeLook(q, mine);
    if (result.empty) {
      ctx.feedback.info(result.message);
      return;
    }
    ctx.log.answer({ itemId: q.itemId, correct: result.correct, tag: result.tag, given: mapKey(mine), expected: result.expected });
    if (!result.correct) {
      ctx.sfx.play('wrong');
      const diff = showDiff(view, mine, q.target);
      drawPicture(q, diff.missing);
      ctx.feedback.wrong(toastOf(result.message));
      bench.showNote(result.message, false, { tip: '✗ 표시한 곳이 그림과 달라요. 고친 다음 다시 [확인하기]를 눌러요.' });
      if (checker.wrong()) bench.showBounce({ retry: true });
      return;
    }
    solved = true;
    ctx.sfx.play('correct');
    ctx.feedback.correct(toastOf(result.message));
    tools.lock(true);
    checker.hide();
    bench.clearBonus();
    view.setMarks({});
    view.snapTo('home', { force: true, quiet: true });
    const last = index + 1 >= questions.length;
    const other = otherLook(q, mine);
    if (!other) {
      bench.showNote(`${result.message} 이 그림은 다른 개수로는 만들 수 없어요.`, true);
      bench.showNext(last ? '결과 보기' : '다음 문제', next);
      bench.focusNext();
      return;
    }
    // 그림은 같아 보이는데 개수가 다른 쌓기를 돌려서 보여 준다 → "무엇을 더 알면 똑같이 만들 수 있을까요?"
    const [few, many] = count(other) > count(mine) ? [mine, other] : [other, mine];
    bench.showNote(`${result.message} 그런데 쌓기나무 ${count(many)}개로 만든 것도, ${count(few)}개로 만든 것도 그림과 똑같아 보여요.`, true, {
      tip: '뒤에 숨은 쌓기나무는 그림에 보이지 않아요. 돌려서 확인해 봐요.',
    });
    bench.after(() => {
      view.setMap(many);
      bench.setTag(`쌓기나무 ${count(many)}개로 만든 모양`);
      view.setMarks({ hidden: hiddenCells(many) });
      view.snapTo('behind', { force: true, quiet: true });
      ctx.feedback.announce(`쌓기나무 ${count(many)}개로 만든 모양을 뒤에서 본 모습이에요. 숨어 있던 쌓기나무가 보여요.`);
    }, LOOK_PAUSE);
    const pick = createCluePick({
      ctx,
      itemId: q.itemId,
      onDone: () => {
        bench.showNext(last ? '결과 보기' : '다음 문제', next);
        bench.focusNext();
      },
    });
    bench.pickSlot.replaceChildren(pick.el);
    pick.focus();
  }

  function next() {
    index += 1;
    if (index >= questions.length) ctx.finish();
    else {
      showQuestion();
      tools.focusPad();
    }
  }

  showQuestion();
  return () => bench.destroy();
}

/**
 * "무엇을 더 알면 똑같이 만들 수 있을까요?" 고르기(선택, 넘어가도 된다). 까닭 고르기(spec 16-3)와 같은 규칙:
 * 맞으면 ctx.reward.event('explain', { correct, itemId })로 설명 점수(문항마다 한 번), 정답률·별에는 넣지 않는다.
 */
function createCluePick({ ctx, itemId, onDone }) {
  const { h } = ctx;
  let done = false;
  const result = h('p', { class: 'reason-pick-result', role: 'status' });
  const chips = MORE_CLUES.map((c) => h('button', { type: 'button', class: 'btn btn-small reason-chip', dataset: { clue: c.id }, onclick: () => choose(c) }, c.text));
  const skip = h('button', { type: 'button', class: 'btn btn-small reason-skip', onclick: () => finish(true) }, '넘어가기');
  const chipRow = h('div', { class: 'reason-chips' }, chips, skip);
  const question = h('p', { class: 'reason-pick-q' }, icon('bulb'), '무엇을 더 알면 똑같이 만들 수 있을까요?', h('small', null, '골라도 되고 넘어가도 돼요'));
  const el = h('div', { class: 'reason-pick blk-clue', role: 'group', 'aria-label': '무엇을 더 알면 똑같이 만들 수 있을까요? 고르기' }, question, chipRow, result);

  function finish(skipped) {
    if (done) return;
    done = true;
    chipRow.hidden = true;
    question.hidden = true;
    el.classList.add('is-done');
    if (skipped) el.hidden = true;
    onDone?.();
  }
  function choose(clue) {
    if (done) return;
    const correct = clue.id === MORE_CLUE_ANSWER;
    const xp = correct ? ctx.reward.event('explain', { correct: true, itemId }) : 0;
    ctx.sfx.play(correct ? 'correct' : 'click');
    const answer = MORE_CLUES.find((c) => c.id === MORE_CLUE_ANSWER).text;
    result.replaceChildren(icon(correct ? 'check' : 'info'), h('span', null, correct
      ? `맞아요! ${answer}을 함께 보면 쌓인 자리를 알 수 있어요.${xp ? ` 설명 +${xp}` : ''}`
      : `${answer}을 함께 보면 쌓인 자리를 알 수 있어요. 다음 단계에서 해 봐요.`));
    result.classList.toggle('is-right', correct);
    finish(false);
  }
  return { el, focus: () => chips[0].focus({ preventScroll: true }) };
}

// ── 숨겨진 쌓기나무 ───────────────────────
function playHidden(stage, ctx, questions) {
  const { h } = ctx;
  const bench = createBench({ ctx, total: questions.length, build: true });
  const { view, tools } = bench;
  const planSlot = h('div', { class: 'blk-figure-slot' });
  bench.given.append(planSlot);
  bench.card.hidden = false;
  const checker = createChecker({ ctx, bench, onCheck: () => check(), onHint: () => useHint() });
  const yes = choiceButton(h, { value: 'yes', content: [h('span', { class: 'answer-sym' }, icon('ring')), h('span', null, '만들 수 있어요')], onclick: () => guess('yes') });
  const no = choiceButton(h, { value: 'no', content: [h('span', { class: 'answer-sym' }, icon('cross')), h('span', null, '만들 수 없어요')], onclick: () => guess('no') });
  const guessRow = h('div', { class: 'answer-row blk-guess', role: 'group', 'aria-label': '다른 개수로도 만들 수 있을지 예상하기', hidden: true }, yes, no);
  bench.answerBox.append(guessRow);
  let index = 0;
  let phase = 'build'; // build(맞게 쌓기) → guess(예상) → other(다른 개수로 한 번 더) → done
  let first = null; // 처음에 맞힌 내 쌓기
  let hinted = null; // 힌트로 위에서 본 모양에 적어 준 자리 { x, y, value } (문항·장면이 바뀌면 지운다)

  const PROMPTS = {
    build: '그림과 위에서 본 모양에 맞게 쌓아 봐요.',
    guess: '다른 개수로도 똑같아 보이게 만들 수 있을까요?',
    other: '쌓기나무의 개수를 바꿔서 한 번 더 쌓아 봐요.',
  };

  function drawGiven(q, { diff = [], cells = [], hint = null } = {}) {
    bench.card.replaceChildren(figure(h, '그림', createBlockPicture({ map: q.target, unit: 30, diff })));
    planSlot.replaceChildren(figure(h, '위에서 본 모양', createFloorPlan({ top: q.top, unit: 26, diff: cells, hint })));
  }

  function showQuestion() {
    const q = questions[index];
    phase = 'build';
    first = null;
    hinted = null;
    bench.setQuestion(index + 1, PROMPTS.build);
    drawGiven(q);
    checker.reset();
    guessRow.hidden = true;
    resetChoices([yes, no]);
    view.home();
    view.setMarks({});
    tools.load(emptyMap());
    tools.lock(false);
    view.setViewEnabled(true);
    bench.controls.lock(false);
  }

  function useHint() {
    const q = questions[index];
    ctx.reward.event('inspect');
    if (phase === 'other') {
      const [x, y] = q.spot;
      hinted = { x, y, value: '?' };
      drawGiven(q, { hint: hinted });
      return `위에서 본 모양의 ? 자리(${spotName(x, y)})는 그림에서 가려져 있어요. 그 자리의 높이를 바꿔 봐요.`;
    }
    const hint = buildHint(q, tools.getMap());
    hinted = { x: hint.x, y: hint.y, value: hint.value };
    drawGiven(q, { hint: hinted });
    return hint.text;
  }

  tools.onChange(() => {
    if (phase !== 'build' && phase !== 'other') return;
    view.setMarks({});
    drawGiven(questions[index], { hint: hinted });
  });

  /** 위에서 본 모양에서 내 것과 다른 자리(주어진 모양의 자리로) */
  function topDiff(q, mine) {
    const me = toCorner(topView(mine));
    const given = toCorner(q.top);
    const [offX, offY] = cornerOffset(q.top);
    const out = [];
    for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) if (given[y][x] !== me[y][x] && x + offX < 3 && y + offY < 3) out.push([x + offX, y + offY]);
    return out;
  }

  function wrongBuild(q, mine, result, itemId) {
    ctx.log.answer({ itemId, correct: false, tag: result.tag, given: mapKey(mine), expected: mapKey(q.target) });
    ctx.sfx.play('wrong');
    if (result.topOk) {
      const diff = showDiff(view, mine, q.target);
      drawGiven(q, { diff: diff.missing, hint: hinted });
    } else {
      view.setMarks({});
      view.snapTo('home', { force: true, quiet: true });
      drawGiven(q, { cells: topDiff(q, mine), hint: hinted });
    }
    ctx.feedback.wrong(toastOf(result.message));
    bench.showNote(result.message, false, { tip: '✗ 표시한 곳을 살펴보고, 고친 다음 다시 [확인하기]를 눌러요.' });
    if (checker.wrong()) bench.showBounce({ retry: true });
  }

  function check() {
    const q = questions[index];
    const mine = tools.getMap();
    if (phase === 'build') {
      const result = judgeBuild(q, mine);
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
      drawGiven(q);
      view.setMarks({});
      bench.clearBonus();
      bench.showNote(result.message, true);
      // 예상하는 동안은 쌓기를 잠근다(해 보고 고르는 것이 아니라 먼저 생각한다). 돌려 보기는 그대로 된다
      tools.lock(true);
      checker.hide();
      bench.setPrompt(PROMPTS.guess);
      guessRow.hidden = false;
      yes.focus({ preventScroll: true });
      return;
    }
    if (phase !== 'other') return;
    const result = judgeOther(q, mine, first);
    if (result.status === 'same') {
      ctx.feedback.info(result.message); // 이미 한 쌓기는 기록하지 않는다
      return;
    }
    if (result.status === 'wrong') {
      if (result.empty) ctx.feedback.info(result.message);
      else wrongBuild(q, mine, result, `${q.itemId}:other`);
      return;
    }
    ctx.log.answer({ itemId: `${q.itemId}:other`, correct: true, tag: null, given: mapKey(mine), expected: 'other-count' });
    ctx.sfx.play('correct');
    ctx.feedback.correct(toastOf(result.message));
    bench.clearBonus();
    // 달라진 자리의 쌓기나무를 표시하고, 가려져 있던 쪽에서 보여 준다
    const [x, y] = q.spot;
    const big = count(mine) > count(first) ? mine : first;
    // 내 쌓기는 판 위에서 통째로 옮겨져 있을 수 있다: 가려진 자리를 내 쌓기의 자리로 옮긴다
    const [bx, by] = cornerOffset(big);
    const [tx, ty] = cornerOffset(q.top);
    const extra = cellsOf(big).filter((c) => c[0] === x + bx - tx && c[1] === y + by - ty && c[2] >= q.heights[0]);
    view.setMap(big);
    bench.setTag(`쌓기나무 ${count(big)}개로 만든 모양`);
    view.setMarks({ hidden: extra });
    view.snapTo('behind', { force: true, quiet: true });
    done(`${result.message} 표시한 자리는 그림에서 가려져 있어서 높이가 달라도 똑같아 보여요.`);
  }

  function guess(value) {
    if (phase !== 'guess') return;
    const q = questions[index];
    const result = judgeGuess(q, value);
    ctx.log.answer({ itemId: `${q.itemId}:guess`, correct: result.correct, tag: result.tag, given: value, expected: result.expected });
    markChoice([yes, no], value, q.expected, result.correct);
    ctx.sfx.play(result.correct ? 'correct' : 'wrong');
    if (result.correct) ctx.feedback.correct(toastOf(result.message), value === 'yes' ? yes : no);
    else {
      ctx.feedback.wrong(toastOf(result.message), value === 'yes' ? yes : no);
      bench.showBounce();
    }
    if (!q.many) {
      done(result.message, result.correct);
      return;
    }
    // 여러 가지: 다른 개수로 한 번 더 쌓아 확인한다
    phase = 'other';
    bench.showNote(result.message, result.correct, { title: result.correct ? '맞아요' : '까닭' });
    bench.setPrompt(PROMPTS.other);
    guessRow.hidden = true;
    checker.reset();
    tools.lock(false);
    checker.focus();
  }

  function done(message, correct = true) {
    phase = 'done';
    tools.lock(true);
    checker.hide();
    guessRow.hidden = true;
    bench.showNote(message, correct, { title: correct ? '맞아요' : '까닭' });
    bench.showNext(index + 1 >= questions.length ? '결과 보기' : '다음 문제', next);
    bench.focusNext();
  }

  function next() {
    index += 1;
    if (index >= questions.length) ctx.finish();
    else {
      showQuestion();
      tools.focusPad();
    }
  }

  showQuestion();
  return () => bench.destroy();
}

const SCREENS = { play: playPlay, where: playWhere, scene: playScene, copy: playCopy, count: playCount, hidden: playHidden };

/** 단계 종류에 맞는 화면을 그린다 → 정리 함수 */
export function playBlocks(stage, ctx, questions) {
  const screen = SCREENS[stage.kind];
  if (!screen) throw new Error(`알 수 없는 쌓기나무 단계 종류: ${stage.kind}`);
  return screen(stage, ctx, questions);
}
