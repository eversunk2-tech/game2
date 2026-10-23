/**
 * 도전 주문서 "모서리와 꼭짓점"(prism-count, 셈 주문 — 사용자 결정 15-25 · 15-26 "이대로"). 규칙은 prism-count-logic.js.
 * 셈 문항(1~3): 매트에 선 각기둥(밑면과 옆면 단계와 같은 입체 무대 — 답하기 전에도 끌어서 돌려 볼 수 있다, 면은 모두 같은 색 · 글자 없음),
 *   주문서에 "한 밑면의 변의 수" · 물음 · 보기 넷. 답하면 그 각기둥의 모서리를 무늬 띠로(위 밑면 · 아래 밑면 · 옆으로 선 모서리) 세어 보이고
 *   "알아낸 것" 표에 한 줄이 더해진다. 답하기 전 무대에는 수 · 띠 · 표시가 없다(정답 노출 0).
 * 규칙 문항(4~5): 매트에 알아낸 것 표를 크게, 주문서에 식 보기 넷.
 * 한 문항에 한 번 답한다(틀려도 다음으로) — 별은 엔진 기본(5문항 정답률: 한 번 틀리면 80% ★2). 도전 주문서라 차시 별 합계에는 넣지 않는다.
 */
import { icon } from '../../../shared/ui/icons.js';
import { createNetView, createWorkbench } from '../view3d.js';
import { prismNet, stripTree } from '../solids.js';
import { countPrompt, countsOf, judgeCount, judgeRule, pieces } from './prism-count-logic.js';
import { groundPose, toastText } from './prism-logic.js';

/** 셈 문항의 무대: 선 각기둥(아래 밑면이 바닥) — 세로축 둘레로 조금 돌린 자세 */
const SPIN = -16;
const COUNT_GROW = 1.4;

export function playPrismCount(stage, ctx, questions) {
  const { h } = ctx;
  const skin = { name: (label) => `${'가나다라마바사아'.indexOf(label) + 1}번 면`, mark: () => null, color: () => 'var(--face-7)' };
  const view = createNetView({ h, interactive: false, sfx: null, skin });
  const bench = createWorkbench({ ctx, view, total: questions.length, lockText: '' });
  bench.mat.parentElement.classList.add('cuboid-bench', 'prism-bench', 'prism-count');
  bench.tools.el.classList.add('pc-hidden'); // 접기 막대는 없다 — 입체는 늘 접힌 채 돌려 보기만

  const fact = h('p', { class: 'pc-fact' });
  const choices = h('div', { class: 'pc-answers' });
  const tip = h('p', { class: 'answer-tip' });
  const legend = h('p', { class: 'pc-legend', hidden: true, 'aria-hidden': 'true' });
  const tableBody = h('tbody');
  const table = () => h('table', { class: 'pc-table' },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, '각기둥'), h('th', { scope: 'col' }, '한 밑면의 변'), h('th', { scope: 'col' }, '모서리'), h('th', { scope: 'col' }, '꼭짓점'))),
    tableBody);
  const panelTable = table();
  const found = h('section', { class: 'pc-found', 'aria-label': '알아낸 것' }, h('p', { class: 'pc-found-head' }, icon('book'), h('b', null, '알아낸 것')), panelTable);
  const board = h('div', { class: 'pc-board', hidden: true, 'aria-label': '알아낸 것' }, h('p', { class: 'pc-board-head' }, icon('book'), '알아낸 것'));
  bench.answerBox.append(choices, tip);
  bench.panel.querySelector('.q-prompt')?.before(fact); // 주어진 것(한 밑면의 변의 수)을 물음보다 먼저
  bench.panel.querySelector('.fold-note')?.remove();
  bench.panel.append(found);
  bench.mat.append(board, legend);

  const rows = []; // 알아낸 것: { name, n }
  let index = 0;
  let answered = false;

  function renderRows(body) {
    body.replaceChildren(...(rows.length === 0
      ? [h('tr', null, h('td', { colspan: '4', class: 'pc-empty' }, '답하면 여기에 적혀요'))]
      : rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r.name), h('td', null, pieces(r.n)), h('td', null, pieces(countsOf(r.n).edges)), h('td', null, pieces(countsOf(r.n).vertices))))));
  }

  /** 답한 뒤 세어 보이기: 위 밑면 · 아래 밑면의 둘레(모서리 · 꼭짓점 모두)와 옆으로 선 모서리(모서리 문항)를 무늬 띠로 */
  function countMarks(q) {
    const faces = currentNet.faces;
    const top = faces.find((f) => f.solid === 'b1');
    const bottom = faces.find((f) => f.solid === 'b0');
    const marks = [
      ...top.poly.map((_, e) => ({ face: top.id, edge: e, tone: 'a' })),
      ...bottom.poly.map((_, e) => ({ face: bottom.id, edge: e, tone: 'q' })),
    ];
    if (q.what === 'edges') for (const f of faces.filter((x) => x.role === 'side')) marks.push({ face: f.id, edge: 1, tone: 'v' });
    view.setEdgeMarks(marks);
    // 무늬의 뜻 (색만으로 알리지 않는다: 무늬 + 글)
    legend.replaceChildren(...[
      h('span', { class: 'pc-key' }, h('i', { class: 'pc-swatch is-a', 'aria-hidden': 'true' }), '위 밑면'),
      h('span', { class: 'pc-key' }, h('i', { class: 'pc-swatch is-q', 'aria-hidden': 'true' }), '아래 밑면'),
      q.what === 'edges' ? h('span', { class: 'pc-key' }, h('i', { class: 'pc-swatch is-v', 'aria-hidden': 'true' }), '옆으로 선 모서리') : null,
    ].filter(Boolean));
    legend.hidden = false;
  }

  let currentNet = null;
  function showQuestion() {
    const q = questions[index];
    answered = false;
    legend.hidden = true;
    bench.setQuestion(index + 1, countPrompt(q));
    bench.lockFold(true, { view: q.kind === 'count' });
    if (q.kind === 'count') {
      board.hidden = true;
      view.el.hidden = false;
      bench.tools.pad.hidden = false;
      found.hidden = false;
      currentNet = prismNet(q.solid, stripTree(q.solid));
      const ground = currentNet.faces.find((f) => f.solid === 'b0').id;
      view.setNet(currentNet, { model: groundPose(currentNet, ground, SPIN), view: { turn: 0, tilt: 56 }, grow: COUNT_GROW });
      view.setT(1);
      view.el.setAttribute('aria-label', `${q.name}. 끌거나 방향키로 돌려 볼 수 있어요. 더하기·빼기 키로 크게·작게 볼 수 있어요.`);
      fact.classList.remove('is-line');
      fact.replaceChildren(h('span', { class: 'pc-fact-num', 'aria-hidden': 'true' }, String(q.n)), h('span', null, `이 각기둥은`, h('br'), h('b', null, `한 밑면의 변이 ${q.n}개`), '예요.'));
      fact.hidden = false;
      tip.hidden = false;
      tip.textContent = '각기둥을 끌어서 돌려 보며 세어 봐요. (키보드: 무대에서 방향키로 돌리기)';
      choices.className = 'pc-answers';
      choices.replaceChildren(...q.choices.map((c) => h('button', { type: 'button', class: 'btn btn-lg answer-btn', dataset: { value: String(c.value) }, 'aria-pressed': 'false', onclick: () => answer(c.value) }, pieces(c.value))));
    } else {
      view.el.hidden = true;
      bench.tools.pad.hidden = true;
      found.hidden = true;
      board.hidden = false;
      const big = table();
      renderRows(big.querySelector('tbody'));
      board.replaceChildren(h('p', { class: 'pc-board-head' }, icon('book'), '알아낸 것'), big);
      fact.hidden = true;
      tip.hidden = false;
      tip.textContent = globalThis.matchMedia?.('(max-width: 900px)').matches ? '위의 표에서 한 밑면의 변의 수와 견줘 봐요.' : '왼쪽 표에서 한 밑면의 변의 수와 견줘 봐요.';
      choices.className = 'pc-answers pc-rules';
      choices.replaceChildren(...q.choices.map((c) => h('button', { type: 'button', class: 'btn btn-lg answer-btn', dataset: { rule: c.id }, 'aria-pressed': 'false', 'aria-label': c.text, onclick: () => answer(c.id) }, c.label)));
      fact.replaceChildren(h('span', null, h('b', { class: 'pc-box' }, '□'), '는 한 밑면의 변의 수예요.'));
      fact.classList.add('is-line');
      fact.hidden = false;
    }
    renderRows(tableBody);
    fitFound();
  }

  function answer(value) {
    if (answered) return;
    answered = true;
    const q = questions[index];
    const result = q.kind === 'count' ? judgeCount(q, value) : judgeRule(q, value, rows);
    ctx.log.answer({ itemId: q.itemId, correct: result.correct, tag: result.tag, given: q.kind === 'count' ? pieces(value) : value, expected: result.expected });
    for (const btn of choices.querySelectorAll('button')) {
      const mine = (btn.dataset.value ?? btn.dataset.rule) === String(value);
      btn.disabled = true;
      btn.setAttribute('aria-pressed', mine ? 'true' : 'false');
      btn.classList.toggle('is-chosen', mine);
      if (!result.correct && (btn.dataset.value ?? btn.dataset.rule) === String(q.kind === 'count' ? q.answer : q.answer)) btn.classList.add('is-answer');
    }
    const chosen = [...choices.querySelectorAll('button')].find((b) => b.classList.contains('is-chosen'));
    if (result.correct) {
      ctx.sfx.play('correct');
      ctx.feedback.correct(toastText(result.message), chosen);
    } else {
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(toastText(result.message), chosen);
    }
    bench.showReason(result.message, result.correct);
    tip.hidden = true;
    fact.hidden = true; // 주어진 것(변의 수)은 까닭 쪽지가 다시 말한다 — 낮은 화면에서 판 안쪽이 넘치지 않게 접는다
    if (q.kind === 'count') {
      countMarks(q);
      rows.push({ name: q.name, n: q.n });
      renderRows(tableBody);
    }
    if (!result.correct) bench.showBounce();
    const last = index + 1 >= questions.length;
    bench.showNext(last ? '결과 보기' : '다음 문제', next, { iconName: 'play' });
    fitFound();
    bench.focusNext();
  }

  /** 판 안쪽이 넘칠 때만 알아낸 것 표를 머리 한 줄로 접는다(규칙 문항에서는 매트에 크게 — spec 16-10과 같은 규칙) */
  function fitFound() {
    found.classList.remove('is-folded');
    panelTable.hidden = false;
    found.hidden = !board.hidden;
    if (found.hidden) return;
    const panel = bench.panel;
    // 넓은 화면: 판 안쪽이 넘치면 · 태블릿 세로(판이 매트 아래): 화면이 세로로 넘치면(휴대폰은 세로 스크롤을 허용한다)
    const over = () => panel.scrollHeight > panel.clientHeight
      || (globalThis.matchMedia?.('(min-width: 561px) and (max-width: 900px)').matches && document.documentElement.scrollHeight > globalThis.innerHeight);
    if (over()) {
      found.classList.add('is-folded');
      panelTable.hidden = true;
    }
    if (over()) found.hidden = true;
  }

  function next() {
    if (index + 1 >= questions.length) {
      ctx.finish();
      return;
    }
    index += 1;
    ctx.feedback.clear?.(); // 앞 문제의 알림(틀린 까닭)이 다음 문제 위에 남지 않게
    showQuestion();
  }

  showQuestion();
  return () => {
    bench.destroy();
    view.destroy();
  };
}
