/**
 * 맞닿는 선분 (prism-edge, 짝 찾기 주문): 전개도에서 색과 무늬로 표시한 선분(노랑 줄무늬)과 접었을 때 맞닿는 선분을 고른다.
 * 보기 4개는 전개도 위의 번호 띠(점무늬 + 번호)이고, 띠를 눌러도 되고 오른쪽 번호 버튼을 눌러도 된다(선분이 짧은 기기에서는 버튼이 48px 누를 자리).
 * 맞힐 때까지 다시 한다(틀린 시도도 기록, 이미 고른 보기는 다시 기록하지 않음). 한 번 틀리면 [반만 접어 보기] — 힌트 동안에도 접기·돌리기는 잠겨 있다.
 * 맞히면 두 선분이 같은 무늬(파랑 빗금)가 되고 접혀서 한 모서리에서 만난다. 맞히기 전에는 접히지 않는다(spec-grade6 5절).
 */
import { icon } from '../../../shared/ui/icons.js';
import { createNetView, createWorkbench } from '../view3d.js';
import { PRISM_FIT, judgePrismEdge } from './prism-logic.js';

export function playPrismEdge(stage, ctx, questions) {
  const { h } = ctx;
  // 면 이름(가~바)은 쓰지 않는 단계라 면에 글자를 적지 않는다(번호 띠와 헷갈리지 않게)
  const view = createNetView({ h, sfx: ctx.sfx, skin: { mark: () => null } });
  const bench = createWorkbench({ ctx, view, total: questions.length, hint: true });
  bench.mat.parentElement.classList.add('cuboid-bench', 'prism-bench');
  const options = h('div', { class: 'edge-options', role: 'group', 'aria-label': '맞닿는 선분 보기' });
  // 안내 글은 답하기 전에만 보인다: 답한 뒤에는 까닭 쪽지·힌트 버튼이 그 자리를 쓴다(낮은 화면에서 판 안쪽이 넘치지 않게)
  const tip = h('p', { class: 'answer-tip' }, '노랑 줄무늬 선분과 접었을 때 맞닿는 선분의 번호를 골라요. 전개도의 번호 띠를 눌러도 돼요.');
  bench.answerBox.append(options, tip);

  let index = 0;
  let solved = false;
  let tried = new Set();
  let buttons = new Map();

  const segMark = (q, index, tone, extra = {}) => ({ face: q.segments[index].face, edge: q.segments[index].edge, tone, ...extra });

  /** 띠를 다시 붙인다: 물음(노랑 줄무늬) + 보기 넷(점무늬 + 번호, 틀린 것은 빗금 + ✗) */
  function drawMarks() {
    const q = questions[index];
    view.setEdgeMarks([
      segMark(q, q.target, 'q'),
      ...q.options.map((o) => segMark(q, o.index, tried.has(o.index) ? 'x' : 'c', { text: tried.has(o.index) ? `✗${o.number}` : String(o.number), key: o.number })),
    ]);
  }

  function showQuestion() {
    const q = questions[index];
    solved = false;
    tried = new Set();
    // 다 접었을 때 두 선분이 만나는 모서리가 보이게 두 면을 보이는 쪽에 둔다(펼친 모습은 달라지지 않는다)
    view.setNet(q.net, { fitBox: PRISM_FIT, show: [q.segments[q.target].face, q.segments[q.answer].face] });
    drawMarks();
    bench.setQuestion(index + 1, '접었을 때 노랑 줄무늬 선분과 맞닿는 선분은 몇 번일까요?');
    tip.hidden = false;
    buttons = new Map(q.options.map((o) => [o.index, h('button', {
      type: 'button',
      class: 'btn edge-opt',
      dataset: { seg: String(o.number) },
      onclick: () => pick(o.index),
    }, h('span', { class: 'edge-opt-mark', 'aria-hidden': 'true' }), h('span', { class: 'opt-band', 'aria-hidden': 'true' }), h('span', null, `${o.number}번`))]));
    options.replaceChildren(...buttons.values());
  }

  function pick(seg) {
    if (solved) return;
    const q = questions[index];
    const button = buttons.get(seg);
    if (tried.has(seg)) {
      ctx.feedback.info('이미 골라 본 선분이에요. 다른 선분을 골라요.');
      return;
    }
    const result = judgePrismEdge(q, seg);
    const option = q.options.find((o) => o.index === seg);
    ctx.log.answer({ itemId: q.itemId, correct: result.correct, tag: result.tag, given: `${option.number}번`, expected: result.expected });
    tip.hidden = true;
    bench.showReason(result.message, result.correct);
    if (!result.correct) {
      tried.add(seg);
      button.classList.add('is-wrong');
      button.querySelector('.edge-opt-mark').replaceChildren(icon('cross'));
      drawMarks();
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
    // 맞닿는 두 선분을 같은 무늬로 (접으면 두 띠가 한 모서리에서 만난다)
    view.setEdgeMarks([segMark(q, q.target, 'a'), segMark(q, q.answer, 'a')]);
    view.reveal();
    bench.lockFold(false);
    view.animateTo(1);
    const last = index + 1 >= questions.length;
    bench.showNext(last ? '결과 보기' : '다음 문제', next, { iconName: 'play' });
    bench.focusNext();
  }

  /** 전개도의 번호 띠를 누르기 (마우스·손가락). 펼친 전개도에서만 — 힌트로 반쯤 접힌 동안에는 받지 않는다 */
  function onBand(event) {
    const band = event.target instanceof Element ? event.target.closest('.edge-band.is-c, .edge-tag.is-c') : null;
    if (!band || solved || view.getT() > 1e-6) return;
    const option = questions[index].options.find((o) => String(o.number) === band.dataset.mark);
    if (option) pick(option.index);
  }
  view.el.addEventListener('click', onBand);

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
    view.el.removeEventListener('click', onBand);
    bench.destroy();
    view.destroy();
  };
}
