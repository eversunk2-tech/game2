/**
 * 직육면체의 전개도 차시의 세 단계 화면: 만나는 선분(cuboid-edge) · 알맞은 면 고르기(cuboid-face) · 길이까지 살펴요(cuboid-judge).
 * 정육면체 차시와 같은 틀(createWorkbench: 왼쪽 재단 매트 + 오른쪽 작업 지시서)과 같은 흐름(먼저 답한다 → 접어서 확인 → 까닭)을 쓴다.
 * 무대는 늘 같은 크기(NET_FIT)에 맞춰 그린다 — 문항마다 1 cm의 화면 크기가 같아 전개도의 크기로 답을 짐작할 수 없다.
 * 규칙·문항·문장은 cuboid-logic.js (순수 함수).
 */
import { enableDragDrop } from '../../shared/ui/drag-drop.js';
import { icon } from '../../shared/ui/icons.js';
import {
  CUBOID_JUDGE_REASONS,
  NET_FIT,
  cardNet,
  cuboidJudgeTip,
  judgeCard,
  judgeCuboidAnswer,
  judgeCuboidReason,
  judgeEdge,
  primaryCuboidProblem,
} from './cuboid-logic.js';
import { createReasonPick } from './play-judge.js';
import { createNetView, createWorkbench, faceColor } from './view3d.js';

const NAME_PAD = 64; // 꼭짓점 이름을 테두리 밖에 적을 자리(px, 양쪽 합)
const cm = (value) => `${Math.round(value * 100) / 100} cm`;

/** 이 차시의 작업대 표시(.cuboid-bench): 태블릿 세로에서 매트를 조금 낮춰 글이 긴 장면도 한 화면에 들어오게 한다(cuboid.css) */
const markBench = (bench) => bench.mat.parentElement.classList.add('cuboid-bench');

/** 길이가 다른 두 변(problem.edges)에 같은 무늬 띠와 길이 이름표 */
const lengthMarks = (problem, tone = 'a') => (problem?.edges ?? []).map((e, i) => ({ face: e.face, edge: e.edge, tone, text: cm(problem.lengths[i]) }));

// ── 1단계: 만나는 선분 ─────────────────────────────
/** 보기 4개(선분 ㄱㄴ …) 가운데 접었을 때 표시한 선분과 만나는 선분을 고른다. 맞힐 때까지 다시 한다(틀린 시도도 기록) */
export function playEdge(stage, ctx, questions) {
  const { h } = ctx;
  // 면 이름(가~바)은 쓰지 않는 단계라 면에 글자를 적지 않는다(꼭짓점 이름과 헷갈리지 않게)
  const view = createNetView({ h, sfx: ctx.sfx, skin: { mark: () => null } });
  const bench = createWorkbench({ ctx, view, total: questions.length, hint: true });
  markBench(bench);
  const options = h('div', { class: 'edge-options', role: 'group', 'aria-label': '만나는 선분 보기' });
  // 안내 글은 답하기 전에만 보인다: 답한 뒤에는 까닭 쪽지·힌트 버튼이 그 자리를 쓴다(낮은 화면에서 판 안쪽이 넘치지 않게)
  const tip = h('p', { class: 'answer-tip' }, '띠로 표시한 선분과 접었을 때 만나는 선분을 골라요.');
  bench.answerBox.append(options, tip);

  let index = 0;
  let solved = false;
  let tried = new Set();
  let buttons = new Map();

  const markOf = (q, i, tone, withName = true) => ({ face: q.segments[i].face, edge: q.segments[i].edge, tone, text: withName ? q.segments[i].name : null });

  function showQuestion() {
    const q = questions[index];
    solved = false;
    tried = new Set();
    // 다 접었을 때 두 선분이 만나는 모서리가 보이게 두 면을 보이는 쪽에 둔다(펼친 모습은 달라지지 않는다)
    view.setNet(q.net, { fitBox: NET_FIT, pad: NAME_PAD, names: q.vertices, show: [q.segments[q.target].face, q.segments[q.answer].face] });
    view.setEdgeMarks([markOf(q, q.target, 'q', false)]);
    bench.setQuestion(index + 1, `접었을 때 선분 ${q.segments[q.target].name}과 만나는 선분은 어느 것일까요?`);
    tip.hidden = false;
    buttons = new Map(q.options.map((o) => [o.index, h('button', {
      type: 'button',
      class: 'btn edge-opt',
      dataset: { seg: String(o.index) },
      onclick: () => pick(o.index),
    }, h('span', { class: 'edge-opt-mark', 'aria-hidden': 'true' }), h('span', null, `선분 ${o.name}`))]));
    options.replaceChildren(...buttons.values());
  }

  function pick(seg) {
    if (solved) return;
    const q = questions[index];
    const button = buttons.get(seg);
    if (tried.has(seg)) {
      // 이미 틀린 보기는 다시 기록하지 않는다
      ctx.feedback.info('이미 골라 본 선분이에요. 다른 선분을 골라요.');
      return;
    }
    const result = judgeEdge(q, seg);
    ctx.log.answer({ itemId: q.itemId, correct: result.correct, tag: result.tag, given: `선분 ${q.segments[seg].name}`, expected: result.expected });
    tip.hidden = true;
    bench.showReason(result.message, result.correct);
    if (!result.correct) {
      tried.add(seg);
      button.classList.add('is-wrong');
      button.querySelector('.edge-opt-mark').replaceChildren(icon('cross'));
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(result.message, button);
      bench.offerHint();
      bench.showBounce({ retry: true });
      return;
    }
    solved = true;
    button.classList.add('is-right');
    button.querySelector('.edge-opt-mark').replaceChildren(icon('check'));
    for (const b of buttons.values()) b.disabled = true;
    ctx.sfx.play('correct');
    ctx.feedback.correct(result.message, button);
    bench.hideHint();
    bench.clearBonus();
    // 만나는 두 선분을 같은 무늬로 (접으면 두 띠가 한 모서리에서 만난다)
    view.setEdgeMarks([markOf(q, q.target, 'a'), markOf(q, q.answer, 'a')]);
    view.reveal();
    bench.lockFold(false);
    view.animateTo(1);
    const last = index + 1 >= questions.length;
    bench.showNext(last ? '결과 보기' : '다음 문제', next, { iconName: 'play' });
    bench.focusNext();
  }

  function next() {
    index += 1;
    if (index >= questions.length) ctx.finish();
    else {
      showQuestion();
      options.querySelector('button')?.focus({ preventScroll: true });
    }
  }

  showQuestion();
  return () => {
    bench.destroy();
    view.destroy();
  };
}

// ── 2단계: 알맞은 면 고르기 ───────────────────────────
const SIDE_WORDS = { top: '위', bottom: '아래', left: '왼쪽', right: '오른쪽' };

/**
 * 크기가 다른 면 카드 3장 가운데 빈 자리(+)에 맞는 것을 붙인다. 끌어다 놓기 · 카드 누르고 자리 누르기 · 키보드 모두 엔진 enableDragDrop.
 * 빈 자리 표시의 크기는 빠진 면의 크기와 무관하게 늘 같다. 틀린 카드는 붙인 대로 접어 길이가 다른 곳을 보여 주고 [펴고 다시 하기].
 */
export function playFaceCard(stage, ctx, questions) {
  const { h } = ctx;
  const view = createNetView({ h, sfx: ctx.sfx });
  const bench = createWorkbench({ ctx, view, total: questions.length, hint: true });
  markBench(bench);
  const cardRow = h('div', { class: 'size-cards', role: 'group', 'aria-label': '면 카드' });
  // 안내 글은 첫 카드를 붙이기 전에만 보인다(다시 할 때는 까닭 쪽지·힌트 버튼이 그 자리를 쓴다)
  const tip = h('p', { class: 'answer-tip' }, '카드를 빈 자리(+)로 끌어 놓거나, 카드를 누른 다음 자리를 눌러요.');
  bench.answerBox.append(cardRow, tip);

  let index = 0;
  let state = 'ready'; // ready(놓기 기다림) · trial(틀린 카드를 접어 보는 중) · solved
  let tried = new Set();
  let cards = new Map();

  function showBase() {
    const q = questions[index];
    state = 'ready';
    const { slot } = q;
    view.setNet(q.net, {
      slots: [{ key: slot.key, rect: slot.rect, label: `${slot.parentLabel} 면 ${SIDE_WORDS[slot.side]} 빈 자리` }],
      lengths: true,
      fitBox: NET_FIT,
    });
    bench.answerBox.hidden = false;
    tip.hidden = tried.size > 0;
    for (const [id, card] of cards) {
      card.disabled = false;
      card.classList.toggle('is-tried', tried.has(id));
    }
  }

  function showQuestion() {
    const q = questions[index];
    tried = new Set();
    // 카드 세 장은 같은 색(빠진 면의 색) · 같은 축척: 크기만 다르다
    cards = new Map(q.cards.map((c) => {
      const card = h('button', {
        type: 'button',
        class: 'size-card dnd-item',
        'aria-pressed': 'false',
        'aria-label': `가로 ${c.w} cm, 세로 ${c.h} cm 면 카드`,
        dataset: { card: c.id },
      },
        h('span', { class: 'size-rect', 'aria-hidden': 'true', style: { width: `calc(var(--card-cm) * ${c.w})`, height: `calc(var(--card-cm) * ${c.h})` } }),
        h('span', { class: 'size-text', 'aria-hidden': 'true' }, h('span', null, `가로 ${c.w} cm`), h('span', null, `세로 ${c.h} cm`)),
      );
      card.style.setProperty('--face-color', faceColor(q.missingLabel));
      return [c.id, card];
    }));
    cardRow.replaceChildren(...cards.values());
    bench.setQuestion(index + 1, `빈 자리(+)에 붙일 ${q.missingLabel} 면은 어느 카드일까요?`);
    showBase();
  }

  function place(cardId) {
    if (state !== 'ready') return;
    if (tried.has(cardId)) {
      ctx.feedback.info('이미 붙여 본 카드예요. 다른 카드를 붙여 보세요.');
      return;
    }
    const q = questions[index];
    const card = q.cards.find((c) => c.id === cardId);
    const result = judgeCard(q, cardId);
    ctx.log.answer({ itemId: q.itemId, correct: result.correct, tag: result.tag, given: `${Math.min(card.w, card.h)}×${Math.max(card.w, card.h)} cm`, expected: result.expected });
    bench.showReason(result.message, result.correct);
    bench.answerBox.hidden = true;

    const net = cardNet(q, cardId);
    const placedId = net.faces[net.faces.length - 1].id;
    // 길이가 다른 두 선분(틀린 카드): 같은 무늬 띠 + 길이 이름표, 그 두 면이 보이게 놓는다
    const mismatch = result.correct ? null : (result.problems ?? []).find((p) => p.type === 'edge-length') ?? null;
    view.setNet(net, { focus: result.correct ? [placedId] : [], show: mismatch ? mismatch.faces : [], lengths: true, fitBox: NET_FIT });
    const placedEl = view.faceEl(placedId);
    const placedInner = placedEl.querySelector('.face-inner');
    placedEl.classList.add('is-placed');
    if (mismatch) view.setEdgeMarks(lengthMarks(mismatch));
    view.reveal();
    view.animateTo(1);

    if (!result.correct) {
      state = 'trial';
      tried.add(cardId);
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(result.message, placedInner);
      bench.hideHint();
      bench.showBounce({ retry: true });
      bench.lockFold(false);
      bench.showNext('펴고 다시 하기', retry, { primary: false, iconName: 'unfold' });
      bench.focusNext();
      return;
    }
    state = 'solved';
    ctx.sfx.play('correct');
    ctx.feedback.correct(result.message, placedInner);
    bench.hideHint();
    bench.clearBonus();
    bench.lockFold(false);
    const last = index + 1 >= questions.length;
    bench.showNext(last ? '결과 보기' : '다음 문제', next, { iconName: 'play' });
    bench.focusNext();
  }

  const firstCard = () => [...cards.entries()].find(([id]) => !tried.has(id))?.[1] ?? cards.values().next().value;

  function retry() {
    ctx.feedback.clear?.();
    bench.hideNext();
    bench.lockFold(true);
    showBase();
    bench.offerHint();
    firstCard()?.focus({ preventScroll: true });
  }

  function next() {
    index += 1;
    if (index >= questions.length) ctx.finish();
    else {
      showQuestion();
      firstCard()?.focus({ preventScroll: true });
    }
  }

  const dnd = enableDragDrop({
    root: ctx.el,
    onDrop(itemEl) {
      place(itemEl.dataset.card);
    },
  });

  // 키보드(Enter·Space)로 카드를 고르면 빈 자리로 초점을 옮긴다 (키보드로 누른 click은 detail이 0. 끌기 엔진보다 뒤에 등록)
  function onCardKey(event) {
    const card = event.target instanceof Element ? event.target.closest('.size-card') : null;
    if (event.detail !== 0 || !card || !card.classList.contains('is-selected')) return;
    view.el.querySelector('.net-slot')?.focus({ preventScroll: true });
  }
  ctx.el.addEventListener('click', onCardKey);

  showQuestion();
  return () => {
    ctx.el.removeEventListener('click', onCardKey);
    dnd.destroy();
    bench.destroy();
    view.destroy();
  };
}

// ── 3단계: 길이까지 살펴요 ───────────────────────────
/**
 * 길이가 적힌 전개도를 보고 [돼요] / [안 돼요]를 고른 뒤 접어서 확인한다. 한 번 답하면 다음 문항(틀려도 다시 하지 않음).
 * 안 되는 전개도를 "안 돼요"로 맞히면 접기 전에 "왜 안 될까요?"(겹침 · 붙은 변의 길이 · 마주 보는 면의 크기) — 고른 뒤에 접어서 보여 준다.
 */
export function playCuboidJudge(stage, ctx, questions) {
  const { h } = ctx;
  const view = createNetView({ h, sfx: ctx.sfx });
  const bench = createWorkbench({ ctx, view, total: questions.length });
  markBench(bench);

  const answerButton = (value, iconName, text) => h('button', {
    type: 'button',
    class: 'btn btn-lg answer-btn',
    dataset: { answer: value },
    'aria-pressed': 'false',
    onclick: () => answer(value),
  }, h('span', { class: `answer-sym sym-${value}` }, icon(iconName)), h('span', null, text));
  const yes = answerButton('yes', 'ring', '돼요');
  const no = answerButton('no', 'cross', '안 돼요');
  const pickSlot = h('div', { class: 'pick-slot' });
  bench.answerBox.append(h('div', { class: 'answer-row' }, yes, no), pickSlot);

  let index = 0;
  let answered = false;

  /** 길이가 다른 두 변: 붙은 두 변(길이형) 또는 접어서 만나는 두 선분(크기형). 겹침형·되는 전개도는 없다 */
  function mismatchOf(q) {
    if (q.valid) return null;
    const primary = primaryCuboidProblem(q.problems);
    if (primary?.type === 'edge-length') return primary;
    return q.intended === 'pair' ? q.problems.find((p) => p.type === 'edge-length') ?? null : null;
  }

  function showQuestion() {
    const q = questions[index];
    answered = false;
    // show: 다 접었을 때 길이가 다른 두 변이 놓인 면이 보이는 쪽에 오게 한다 — 펼친 모습(답하기 전 화면)은 달라지지 않는다
    view.setNet(q.net, { lengths: true, fitBox: NET_FIT, show: mismatchOf(q)?.faces ?? [] });
    bench.setQuestion(index + 1, '접으면 직육면체가 될까요?');
    pickSlot.replaceChildren();
    for (const btn of [yes, no]) {
      btn.disabled = false;
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('is-chosen', 'is-dim');
    }
  }

  /** 답한 뒤 접어서 확인: 까닭 쪽지 + 길이가 다른 두 변의 띠 + 접는 장면 + 다음 버튼 */
  function reveal(result) {
    const q = questions[index];
    bench.showReason(result.message, result.correct, { tip: result.correct ? '' : cuboidJudgeTip(q) });
    // 길이가 다른 두 변을 같은 무늬 띠와 길이 이름표로 짚는다
    view.setEdgeMarks(lengthMarks(mismatchOf(q)));
    view.reveal();
    bench.lockFold(false);
    view.animateTo(1);
    const last = index + 1 >= questions.length;
    bench.showNext(last ? '결과 보기' : '다음 문제', next, { iconName: 'play' });
    bench.focusNext();
  }

  function answer(value) {
    if (answered) return;
    answered = true;
    const q = questions[index];
    const result = judgeCuboidAnswer(q, value);
    ctx.log.answer({ itemId: q.itemId, correct: result.correct, tag: result.tag, given: value, expected: result.expected });

    const chosen = value === 'yes' ? yes : no;
    chosen.classList.add('is-chosen');
    chosen.setAttribute('aria-pressed', 'true');
    (value === 'yes' ? no : yes).classList.add('is-dim');
    for (const btn of [yes, no]) btn.disabled = true;

    ctx.sfx.play(result.correct ? 'correct' : 'wrong');
    if (!result.correct) {
      ctx.feedback.wrong(result.message, chosen);
      bench.showBounce();
      reveal(result);
      return;
    }
    if (q.valid) {
      ctx.feedback.correct(result.message, chosen);
      reveal(result);
      return;
    }
    // 안 되는 전개도를 맞힘: 접기 전에 까닭을 골라 보게 한다 (까닭을 먼저 보여 주지 않는다)
    ctx.feedback.correct('맞아요! 접으면 직육면체가 안 돼요. 왜 그런지 골라 볼까요?', chosen);
    const pick = createReasonPick({
      ctx,
      itemId: q.itemId,
      problems: q.problems,
      skipLabel: '접어서 확인할래요',
      reasons: CUBOID_JUDGE_REASONS,
      judge: (problems, choice) => judgeCuboidReason(problems, choice, 'judge'),
      onDone: () => reveal(result),
    });
    pickSlot.replaceChildren(pick.el);
    pick.focus();
  }

  function next() {
    index += 1;
    if (index >= questions.length) ctx.finish();
    else {
      showQuestion();
      yes.focus({ preventScroll: true });
    }
  }

  showQuestion();
  return () => {
    bench.destroy();
    view.destroy();
  };
}
