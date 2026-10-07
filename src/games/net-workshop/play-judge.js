/**
 * 판별 단계 화면: 전개도를 보고 [⭕ 돼요] / [❌ 안 돼요]를 고른 뒤, 접는 장면으로 확인한다.
 * 한 번 답하면 다음 문항으로 간다(틀려도 다시 하지 않음). 판별 단계는 힌트가 없다.
 */
import { judgeNetAnswer } from './logic.js';
import { createNetView, createWorkbench } from './view3d.js';

export function playJudge(stage, ctx, questions) {
  const { h } = ctx;
  const view = createNetView({ h });
  const bench = createWorkbench({ ctx, view, total: questions.length });

  const answerButton = (value, text) => h('button', {
    type: 'button',
    class: 'btn btn-lg answer-btn',
    dataset: { answer: value },
    'aria-pressed': 'false',
    onclick: () => answer(value),
  }, text);
  const yes = answerButton('yes', '⭕ 돼요');
  const no = answerButton('no', '❌ 안 돼요');
  bench.answerBox.append(h('div', { class: 'answer-row' }, yes, no));

  let index = 0;
  let answered = false;

  function showQuestion() {
    const q = questions[index];
    answered = false;
    view.setNet(q.net);
    bench.setQuestion(index + 1, '접으면 정육면체가 될까요?');
    for (const btn of [yes, no]) {
      btn.disabled = false;
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('is-chosen');
    }
  }

  function answer(value) {
    if (answered) return;
    answered = true;
    const q = questions[index];
    const result = judgeNetAnswer(q, value);
    ctx.log.answer({ itemId: q.itemId, correct: result.correct, tag: result.tag, given: value, expected: result.expected });

    const chosen = value === 'yes' ? yes : no;
    chosen.classList.add('is-chosen');
    chosen.setAttribute('aria-pressed', 'true');
    for (const btn of [yes, no]) btn.disabled = true;

    ctx.sfx.play(result.correct ? 'correct' : 'wrong');
    if (result.correct) ctx.feedback.correct(result.message, chosen);
    else ctx.feedback.wrong(result.message, chosen);
    bench.showReason(result.message, result.correct);

    // 답한 뒤에 접어 확인한다
    view.reveal();
    bench.lockFold(false);
    view.animateTo(1);
    const last = index + 1 >= questions.length;
    bench.showNext(last ? '결과 보기' : '다음 문제 ▶', next);
    bench.focusNext();
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
  return () => view.destroy();
}
