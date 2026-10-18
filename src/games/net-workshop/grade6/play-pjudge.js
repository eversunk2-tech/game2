/**
 * 각기둥이 될까? (prism-judge, 검사 주문): 전개도를 보고 [돼요] / [안 돼요]를 고른 뒤 접어서 확인한다. 한 번 답하면 다음 문항(틀려도 다시 하지 않음).
 * 안 되는 전개도를 "안 돼요"로 맞히면 접기 전에 "왜 안 될까요?"(면의 수 · 직사각형이 아닌 옆면 · 겹침 · 맞닿는 선분의 길이 — 맞으면 +2, 별 밖).
 * 되는 전개도는 접힌 뒤 이름("오각기둥이 됐어요")을 보인다. 정육면체·직육면체 판별과 같은 틀(createWorkbench)·같은 흐름이다.
 * 무대는 늘 같은 크기(PRISM_FIT)에 맞춰 그린다 — 문항마다 1 cm의 화면 크기가 같아 전개도의 크기로 답을 짐작할 수 없다. 답하기 전에는 접기 막대·조작판이 잠긴다(spec 17-16).
 */
import { icon } from '../../../shared/ui/icons.js';
import { createReasonPick } from '../play-judge.js';
import { createNetView, createWorkbench } from '../view3d.js';
import { PRISM_FIT, PRISM_JUDGE_REASONS, judgePrismAnswer, judgePrismReason, prismJudgeTip, prismMismatch } from './prism-logic.js';

const cm = (value) => `${Math.round(value * 100) / 100} cm`;
/** 길이가 다른 두 선분(problem.edges)에 같은 무늬 띠와 길이 이름표 */
const lengthMarks = (problem) => (problem?.edges ?? []).map((e, i) => ({ face: e.face, edge: e.edge, tone: 'a', text: cm(problem.lengths[i]) }));

export function playPrismJudge(stage, ctx, questions) {
  const { h } = ctx;
  const view = createNetView({ h, sfx: ctx.sfx });
  const bench = createWorkbench({ ctx, view, total: questions.length });
  bench.mat.parentElement.classList.add('cuboid-bench', 'prism-bench');

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

  function showQuestion() {
    const q = questions[index];
    answered = false;
    // show: 다 접었을 때 길이가 다른 두 선분이 놓인 면이 보이는 쪽에 오게 한다 — 펼친 모습(답하기 전 화면)은 달라지지 않는다
    view.setNet(q.net, { fitBox: PRISM_FIT, show: prismMismatch(q)?.faces ?? [] });
    bench.setQuestion(index + 1, '접으면 각기둥이 될까요?');
    pickSlot.replaceChildren();
    for (const btn of [yes, no]) {
      btn.disabled = false;
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('is-chosen', 'is-dim');
    }
  }

  /** 답한 뒤 접어서 확인: 까닭 쪽지 + 길이가 다른 두 선분의 띠 · 직사각형이 아닌 옆면의 표시 + 접는 장면 + 다음 버튼 */
  function reveal(result) {
    const q = questions[index];
    bench.showReason(result.message, result.correct, { tip: result.correct ? '' : prismJudgeTip(q) });
    view.setEdgeMarks(lengthMarks(prismMismatch(q)));
    for (const p of q.problems.filter((x) => x.type === 'side-shape')) {
      for (const id of p.faces) {
        const faceEl = view.faceEl(id);
        faceEl.classList.add('is-bent');
        faceEl.querySelector('.face-mark').textContent = '직사각형이 아니에요';
      }
    }
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
    const result = judgePrismAnswer(q, value);
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
    ctx.feedback.correct('맞아요! 접으면 각기둥이 안 돼요. 왜 그런지 골라 볼까요?', chosen);
    const pick = createReasonPick({
      ctx,
      itemId: q.itemId,
      problems: q.problems,
      skipLabel: '접어서 확인할래요',
      reasons: PRISM_JUDGE_REASONS,
      judge: judgePrismReason,
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
