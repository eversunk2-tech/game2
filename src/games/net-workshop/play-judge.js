/**
 * 판별 단계 화면: 전개도를 보고 [돼요] / [안 돼요]를 고른 뒤, 접는 장면으로 확인한다.
 * 한 번 답하면 다음 문항으로 간다(틀려도 다시 하지 않음). 판별 단계는 힌트가 없다.
 * 안 되는 전개도를 "안 돼요"로 맞히면 접기 전에 "왜 안 될까요?" 까닭 고르기(선택, 맞으면 +2, 정답률·별에는 넣지 않음).
 */
import { icon } from '../../shared/ui/icons.js';
import { REASONS, judgeNetAnswer, judgeReason } from './logic.js';
import { createNetView, createWorkbench } from './view3d.js';

/**
 * "왜 안 될까요?" 까닭 고르기 칩 3개 + 넘어가기 (판별·자유 배치가 함께 쓴다).
 * 고르면 맞는지 보여 주고(틀리면 바른 까닭), 맞으면 ctx.reward.event('explain', { correct, itemId })로 점수(문항마다 한 번).
 * onDone({ chosen, correct, xp }) — 넘어가면 chosen은 null
 */
export function createReasonPick({ ctx, itemId, problems, skipLabel = '넘어가기', onDone }) {
  const { h } = ctx;
  let done = false;
  const result = h('p', { class: 'reason-pick-result', role: 'status' });
  const chips = REASONS.map((r) => h('button', {
    type: 'button',
    class: 'btn btn-small reason-chip',
    dataset: { reason: r.id },
    onclick: () => choose(r.id),
  }, r.text));
  const skip = h('button', { type: 'button', class: 'btn btn-small reason-skip', onclick: () => finish(null, false, 0) }, skipLabel);
  const chipRow = h('div', { class: 'reason-chips' }, chips, skip);
  const question = h('p', { class: 'reason-pick-q' }, icon('bulb'), '왜 안 될까요?', h('small', null, '골라도 되고 넘어가도 돼요'));
  const el = h('div', { class: 'reason-pick', role: 'group', 'aria-label': '왜 안 될까요? 까닭 고르기' }, question, chipRow, result);

  function finish(chosen, correct, xp) {
    if (done) return;
    done = true;
    for (const c of chips) c.disabled = true;
    // 고른 뒤에는 한 줄(내 답과 결과)만 남겨 판을 짧게 한다. 넘어가면 통째로 접는다
    chipRow.hidden = true;
    question.hidden = true;
    el.classList.add('is-done');
    if (chosen == null) el.hidden = true;
    onDone?.({ chosen, correct, xp });
  }

  function choose(id) {
    if (done) return;
    const r = judgeReason(problems, id);
    const xp = r.correct ? ctx.reward.event('explain', { correct: true, itemId }) : 0;
    ctx.sfx.play(r.correct ? 'correct' : 'click');
    for (const c of chips) {
      if (c.dataset.reason === id) c.classList.add('is-chosen', r.correct ? 'is-right' : 'is-wrong');
      if (!r.correct && c.dataset.reason === r.answer) c.classList.add('is-right');
    }
    const mine = REASONS.find((x) => x.id === id).text;
    result.replaceChildren(icon(r.correct ? 'check' : 'info'), h('span', null,
      r.correct ? `내 까닭 "${mine}" 맞아요!${xp ? ` 설명 +${xp}` : ''}` : `내 까닭 "${mine}" — 바른 까닭은 "${r.answerText}"예요.`));
    result.classList.toggle('is-right', r.correct);
    finish(id, r.correct, xp);
  }

  return { el, focus: () => chips[0].focus({ preventScroll: true }), isDone: () => done };
}

export function playJudge(stage, ctx, questions) {
  const { h } = ctx;
  const view = createNetView({ h, sfx: ctx.sfx });
  const bench = createWorkbench({ ctx, view, total: questions.length });

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
    view.setNet(q.net);
    bench.setQuestion(index + 1, '접으면 정육면체가 될까요?');
    pickSlot.replaceChildren();
    for (const btn of [yes, no]) {
      btn.disabled = false;
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('is-chosen', 'is-dim');
    }
  }

  /** 답한 뒤 접어서 확인: 까닭 쪽지 + 접는 장면 + 다음 버튼 */
  function reveal(result) {
    const q = questions[index];
    let tip = '';
    if (!result.correct && !q.valid) {
      tip = q.intended === 'vertex-full' ? '● 표시한 꼭짓점에 면이 몇 개 모였는지 세어 봐요.'
        : q.intended === 'face-count' ? '면이 몇 개인지 세어 봐요.'
          : '빗금 친 면과 점선(비어요)을 찾아보고, 돌려 보기로 빈 자리를 확인해요.';
    }
    bench.showReason(result.message, result.correct, { tip });
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
    const result = judgeNetAnswer(q, value);
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
    ctx.feedback.correct('맞아요! 접으면 정육면체가 안 돼요. 왜 그런지 골라 볼까요?', chosen);
    const pick = createReasonPick({
      ctx,
      itemId: q.itemId,
      problems: q.problems,
      skipLabel: '접어서 확인할래요',
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
