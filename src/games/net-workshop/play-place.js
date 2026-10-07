/**
 * 면 붙이기 단계 화면 (cube-complete): 5면 전개도의 빈 자리에 마지막 면 카드를 붙인다.
 * 끌어다 놓기 · 카드 누르고 자리 누르기 · 키보드(Tab + Enter) 모두 엔진 enableDragDrop으로 된다.
 * 틀린 자리에 놓으면 그 자리로 접어 겹치는 장면을 보여 주고, [펴고 다시 하기]로 돌아온다.
 */
import { enableDragDrop } from '../../shared/ui/drag-drop.js';
import { judgeSlot, placedNet } from './logic.js';
import { createNetView, createWorkbench } from './view3d.js';

const SIDE_NAMES = [
  [[-1, 0], '오른쪽'], // 이웃 면이 왼쪽에 있으면 빈 자리는 그 면의 오른쪽
  [[1, 0], '왼쪽'],
  [[0, -1], '아래'],
  [[0, 1], '위'],
];

/** 빈 자리를 이웃한 면으로 말한다: "가 면 오른쪽 빈 자리" */
function describeSlot(question, cell) {
  for (const [[dx, dy], side] of SIDE_NAMES) {
    const face = question.net.faces.find((f) => f.cell[0] === cell[0] + dx && f.cell[1] === cell[1] + dy);
    if (face) return `${face.label} 면 ${side} 빈 자리`;
  }
  return '빈 자리';
}

export function playPlace(stage, ctx, questions) {
  const { h } = ctx;
  const view = createNetView({ h });
  const bench = createWorkbench({ ctx, view, total: questions.length, hint: true });

  const card = h('button', { type: 'button', class: 'face-card dnd-item', 'aria-pressed': 'false' });
  const cardHome = h('div', { class: 'card-home' }, card);
  bench.answerBox.append(h('div', { class: 'card-row' },
    cardHome,
    h('p', { class: 'answer-tip' }, '카드를 빈 자리(+)로 끌어 놓거나, 카드를 누른 다음 자리를 눌러요.'),
  ));

  let index = 0;
  let state = 'ready'; // ready(놓기 기다림) · trial(틀린 자리를 접어 보는 중) · solved
  let tried = new Set();

  function slotsFor(q) {
    return q.slots.map((s) => ({ key: s.key, cell: s.cell, label: describeSlot(q, s.cell) }));
  }

  function showBase() {
    const q = questions[index];
    state = 'ready';
    view.setNet(q.net, { slots: slotsFor(q) });
    for (const key of tried) {
      const slotEl = view.slotEl(key);
      slotEl.classList.add('is-tried');
      slotEl.querySelector('.slot-plus').textContent = '✗';
    }
    bench.answerBox.hidden = false;
    card.hidden = false;
    card.disabled = false;
  }

  function showQuestion() {
    const q = questions[index];
    tried = new Set();
    card.textContent = q.missingLabel;
    card.setAttribute('aria-label', `${q.missingLabel} 면 카드`);
    bench.setQuestion(index + 1, `${q.missingLabel} 면을 어디에 붙이면 정육면체가 될까요?`);
    showBase();
  }

  function place(key) {
    if (state !== 'ready') return;
    if (tried.has(key)) {
      // 이미 놓아 본 틀린 자리는 다시 기록하지 않는다
      ctx.feedback.info('이미 놓아 본 자리예요. 다른 자리에 놓아 보세요.');
      return;
    }
    const q = questions[index];
    const slot = q.slots.find((s) => s.key === key);
    const result = judgeSlot(q, key);
    ctx.log.answer({ itemId: q.itemId, correct: result.correct, tag: result.tag, given: key, expected: result.expected });
    bench.showReason(result.message, result.correct);

    bench.answerBox.hidden = true;
    const placedId = `f${q.cells.length}`;
    // 맞으면 붙인 면이 보이는 옆면에 오게, 틀리면 겹친 면·빈 자리가 보이게 (view3d.js displayNet)
    view.setNet(placedNet(q, slot.cell), { focus: result.correct ? [placedId] : [] });
    const placedEl = view.faceEl(placedId);
    // 흔들기·튀기기는 면 안쪽 글자에만 (면 버튼의 matrix3d()를 덮지 않게)
    const placedInner = placedEl.querySelector('.face-inner');
    placedEl.classList.add('is-placed');
    view.reveal();
    view.animateTo(1);

    if (!result.correct) {
      state = 'trial';
      tried.add(key);
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(result.message, placedInner);
      bench.hideHint();
      bench.lockFold(false); // 틀린 자리로 접은 모습을 막대·버튼으로 살펴볼 수 있다
      bench.showNext('◀ 펴고 다시 하기', retry, { primary: false });
      bench.focusNext();
      return;
    }
    state = 'solved';
    ctx.sfx.play('correct');
    ctx.feedback.correct(result.message, placedInner);
    bench.hideHint();
    bench.lockFold(false);
    const last = index + 1 >= questions.length;
    bench.showNext(last ? '결과 보기' : '다음 문제 ▶', next);
    bench.focusNext();
  }

  function retry() {
    bench.hideNext();
    bench.lockFold(true);
    showBase();
    bench.offerHint();
    card.focus({ preventScroll: true });
  }

  function next() {
    index += 1;
    if (index >= questions.length) ctx.finish();
    else {
      showQuestion();
      card.focus({ preventScroll: true });
    }
  }

  const dnd = enableDragDrop({
    root: ctx.el,
    onDrop(itemEl, targetEl) {
      place(targetEl.dataset.cell);
    },
  });

  // 키보드(Enter·Space)로 카드를 고르면 첫 빈 자리로 초점을 옮긴다. 키보드로 누른 click은 detail이 0.
  // enableDragDrop보다 뒤에 등록해서, 카드가 이미 골라진 뒤에 실행된다.
  function onCardKey(event) {
    if (event.detail !== 0 || event.target !== card || !card.classList.contains('is-selected')) return;
    const slotEl = view.el.querySelector('.net-slot:not(.is-tried)') ?? view.el.querySelector('.net-slot');
    slotEl?.focus({ preventScroll: true });
  }
  ctx.el.addEventListener('click', onCardKey);

  showQuestion();
  return () => {
    ctx.el.removeEventListener('click', onCardKey);
    dnd.destroy();
    view.destroy();
  };
}
