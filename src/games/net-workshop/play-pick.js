/**
 * 면 누르기 단계 화면 (cube-opposite): 접었을 때 ★ 면과 마주 보는 면을 전개도에서 누른다.
 * 맞힐 때까지 다시 한다(틀린 시도도 모두 기록). 한 번 틀리면 [반만 접어 보기] 힌트가 열린다.
 */
import { judgeOpposite } from './logic.js';
import { createNetView, createWorkbench } from './view3d.js';

export function playPick(stage, ctx, questions) {
  const { h } = ctx;
  const view = createNetView({ h, interactive: true, onFaceClick: (id) => pick(id), sfx: ctx.sfx });
  const bench = createWorkbench({ ctx, view, total: questions.length, hint: true });
  bench.answerBox.append(h('p', { class: 'answer-tip' }, '전개도에서 면을 눌러요. (키보드: Tab으로 고르고 Enter)'));

  let index = 0;
  let solved = false;

  function showQuestion() {
    const q = questions[index];
    solved = false;
    view.setNet(q.net, { focus: [q.star, q.answer] }); // 다 접으면 ★·정답 면이 옆면에, 정답 면이 보이게
    const star = view.faceEl(q.star);
    star.classList.add('is-star');
    star.querySelector('.face-label').textContent = '★';
    star.setAttribute('aria-label', '★ 면');
    bench.setQuestion(index + 1, '접었을 때 ★ 면과 마주 보는 면은 어느 면일까요?');
  }

  // 흔들기·튀기기는 면 안쪽 글자에만 준다. 면 버튼 자체에 주면 matrix3d()가 덮여 면이 무대 가운데로 튄다.
  const inner = (faceEl) => faceEl.querySelector('.face-inner');

  function mark(faceEl, ok) {
    faceEl.classList.add(ok ? 'is-correct' : 'is-wrong');
    faceEl.querySelector('.face-mark').textContent = ok ? '✓ 마주 봐요' : '✗ 이웃';
  }

  function pick(id) {
    if (solved) return;
    const q = questions[index];
    if (id === q.star) {
      ctx.feedback.info('★ 면 말고, ★ 면과 마주 보는 면을 골라요.');
      return;
    }
    const faceEl = view.faceEl(id);
    if (faceEl.classList.contains('is-wrong')) {
      // 이미 틀린 면은 다시 기록하지 않는다
      ctx.feedback.info('이미 골라 본 면이에요. 다른 면을 골라요.');
      return;
    }
    const result = judgeOpposite(q, id);
    const label = q.net.faces.find((f) => f.id === id).label;
    ctx.log.answer({ itemId: q.itemId, correct: result.correct, tag: result.tag, given: label, expected: result.expected });
    bench.showReason(result.message, result.correct);

    if (!result.correct) {
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(result.message, inner(faceEl));
      mark(faceEl, false);
      bench.offerHint();
      bench.showBounce({ retry: true });
      return;
    }
    solved = true;
    ctx.sfx.play('correct');
    ctx.feedback.correct(result.message, inner(faceEl));
    mark(faceEl, true);
    bench.hideHint();
    bench.clearBonus();
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
      view.el.focus({ preventScroll: true });
    }
  }

  showQuestion();
  return () => {
    bench.destroy();
    view.destroy();
  };
}
