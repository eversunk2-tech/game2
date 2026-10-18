/**
 * 밑면과 옆면 (prism-parts, 살펴보기 주문): 접힌 각기둥(선 것 · 눕힌 것 — 눕힌 것 늘 1개)에서 밑면 두 개를 눌러 고르고 [확인].
 * 답하기 전에도 입체를 돌려 볼 수 있다(spec-grade6 5절 — 끌기·조작판·방향키). 면을 누르는 것과 끄는 것은 8px로 가르고, 누른 면은
 * 브라우저의 누르기 판정이 아니라 직접 계산한 맨 앞 면이다(view3d onPick → fold.js pickFace). 답하기 전에는 어느 면이 밑면인지
 * 화면이 알려 주지 않는다: 면 색·글자·DOM 차례(섞음)·속성이 모두 같은 규칙이다.
 * 맞히면 이름("오각기둥")과 "옆면은 5개"가 뜨고, 입체가 펼쳐져 밑면(○)·옆면(△)이 전개도의 어디로 갔는지 보인다. 맞힐 때까지 다시 한다(틀린 시도도 기록,
 * 이미 골라 본 두 면은 다시 기록하지 않는다). 펼친 뒤에는 접기 막대로 접었다 폈다 해 볼 수 있다.
 */
import { LABELS } from '../fold.js';
import { TILT } from '../orbit.js';
import { createNetView, createWorkbench } from '../view3d.js';
import { PRISM_FIT, judgeParts, toastText } from './prism-logic.js';

const UNFOLD_AFTER = 700; // 맞힌 뒤 이름을 읽을 틈(ms) — 그다음 펼친다(움직임 줄이기에서는 바로 펼친 모습)
export const PARTS_GROW = 1.5; // 접은 입체의 처음 크기(자동 맞춤의 배수)

export function playParts(stage, ctx, questions) {
  const { h } = ctx;
  // 모든 면이 같은 색 · 글자 없음. 화면 읽기 이름은 DOM 차례의 번호(면의 차례는 문항이 섞어 두었다)
  const skin = { name: (label) => `${LABELS.indexOf(label) + 1}번 면`, mark: () => null, color: () => 'var(--face-7)' };
  const view = createNetView({ h, interactive: true, onPick: (id) => pick(id), sfx: ctx.sfx, skin });
  const bench = createWorkbench({ ctx, view, total: questions.length, lockText: '맞힌 뒤에 펼쳐 볼 수 있어요.' });
  bench.mat.parentElement.classList.add('cuboid-bench', 'prism-bench');
  const count = h('p', { class: 'parts-count', role: 'status' });
  const check = h('button', { type: 'button', class: 'btn btn-primary btn-lg parts-check', disabled: true, onclick: () => submit() }, '확인');
  // 안내 글은 답하기 전에만 보인다: 답한 뒤에는 까닭 쪽지가 그 자리를 쓴다(낮은 화면에서 판 안쪽이 넘치지 않게)
  const tip = h('p', { class: 'answer-tip' }, '면을 누르면 골라지고, 한 번 더 누르면 풀려요. 끌면 돌려 볼 수 있어요. (키보드: Tab으로 면을 고르고 Enter)');
  const name = h('p', { class: 'parts-name', hidden: true });
  bench.answerBox.append(count, check, name, tip);

  let index = 0;
  let solved = false;
  let picked = [];
  let tried = new Set();
  let timer = 0;

  const faceIds = () => questions[index].net.faces.map((f) => f.id);
  const keyOf = (ids) => [...ids].sort().join('|');

  /** 고른 면 표시와 [확인]·글을 맞춘다 */
  function sync() {
    for (const id of faceIds()) {
      const faceEl = view.faceEl(id);
      const on = picked.includes(id);
      faceEl.classList.toggle('is-picked', on);
      faceEl.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (!faceEl.classList.contains('is-missed')) faceEl.querySelector('.face-mark').textContent = on ? '✓' : '';
    }
    count.replaceChildren('고른 면 ', h('b', null, `${picked.length} / 2`));
    check.disabled = solved || picked.length !== 2;
  }

  function showQuestion() {
    const q = questions[index];
    solved = false;
    picked = [];
    tried = new Set();
    clearTimeout(timer);
    // 입체를 놓는 자세(q.pose)와 처음 보기를 정해 준다: 펼친 전개도의 1 cm 크기는 문항마다 같다(fitBox)
    // 입체의 처음 크기는 자동 맞춤의 1.5배(사용자 결정 15-20 G1-3 — 면이 작았다). 감싸는 공이 무대 짧은 쪽의 약 79%라 돌려도 무대 안
    view.setNet(q.net, { fitBox: PRISM_FIT, model: q.pose, view: { turn: 0, tilt: TILT }, grow: PARTS_GROW });
    bench.setQuestion(index + 1, '밑면 두 개를 찾아 눌러 고른 다음 [확인]을 눌러요.');
    view.setT(1);
    bench.lockFold(true, { view: true }); // 접기·펴기는 맞힌 뒤에, 돌려 보기·크게 작게는 지금도
    name.hidden = true;
    tip.hidden = false;
    count.hidden = false;
    check.hidden = false;
    sync();
  }

  function pick(id) {
    if (solved) return;
    // 틀린 시도의 표시(✗)는 다시 고르기 시작하면 지운다
    for (const fid of faceIds()) {
      const faceEl = view.faceEl(fid);
      if (!faceEl.classList.contains('is-missed')) continue;
      faceEl.classList.remove('is-missed');
      faceEl.querySelector('.face-mark').textContent = '';
    }
    if (picked.includes(id)) picked = picked.filter((x) => x !== id);
    else if (picked.length < 2) picked = [...picked, id];
    else {
      ctx.feedback.info('두 면만 골라요. 고른 면을 다시 누르면 풀려요.');
      sync();
      return;
    }
    ctx.sfx.play('click');
    sync();
    if (picked.length === 2) ctx.feedback.announce('두 면을 골랐어요. [확인]을 눌러요.');
  }

  function submit() {
    if (solved || picked.length !== 2) return;
    const q = questions[index];
    const key = keyOf(picked);
    if (tried.has(key)) {
      ctx.feedback.info('이미 골라 본 두 면이에요. 다른 면을 골라 봐요.');
      return;
    }
    const result = judgeParts(q, picked);
    const given = picked.map((id) => `${LABELS.indexOf(q.net.faces.find((f) => f.id === id).label) + 1}번 면`).join(', ');
    ctx.log.answer({ itemId: q.itemId, correct: result.correct, tag: result.tag, given, expected: result.expected });
    tip.hidden = true;
    bench.showReason(result.message, result.correct);
    if (!result.correct) {
      tried.add(key);
      for (const id of picked) {
        const faceEl = view.faceEl(id);
        faceEl.classList.add('is-missed');
        faceEl.querySelector('.face-mark').textContent = '✗';
      }
      // 고른 두 면이 보이게 입체를 돌린다(바닥 면처럼 처음 보기에서 안 보이는 면도 — 4절 "고른 두 면이 평행하지 않음을 입체에서 보여 줌")
      view.showFaces(picked);
      picked = [];
      sync();
      bench.showBounce({ retry: true });
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(toastText(result.message), check); // 알림은 한 문장(휴대폰에서 아래 조작 띠를 가리지 않게), 까닭 전체는 쪽지에
      return;
    }
    solved = true;
    picked = [];
    // 밑면 ○ · 옆면 △ (색만으로 구분하지 않는다): 입체에서 보이고, 펼치면 전개도의 어디로 갔는지 보인다
    for (const f of q.net.faces) {
      const faceEl = view.faceEl(f.id);
      const base = f.role === 'base';
      faceEl.classList.add(base ? 'is-base' : 'is-side');
      faceEl.querySelector('.face-label').textContent = base ? '○' : '△';
      faceEl.setAttribute('aria-label', `${faceEl.getAttribute('aria-label')}, ${base ? '밑면' : '옆면'}`);
    }
    sync();
    // 고른 면 수 · [확인] 자리에 이름과 옆면의 수
    count.hidden = true;
    check.hidden = true;
    name.textContent = `${q.name}, 옆면 ${q.sides}개`; // 제목 글꼴에 없는 가운뎃점(·)은 쓰지 않는다
    name.hidden = false;
    bench.clearBonus();
    view.reveal({ ok: true, text: `${q.name}, 옆면 ${q.sides}개` });
    bench.lockFold(false);
    timer = setTimeout(() => {
      timer = 0;
      view.animateTo(0);
    }, UNFOLD_AFTER);
    const last = index + 1 >= questions.length;
    bench.showNext(last ? '결과 보기' : '다음 문제', next, { iconName: 'play' });
    // 알림은 판의 글이 다 바뀐 뒤에: 판이 짧아져 휴대폰 화면이 밀린 뒤에 자리를 잡아야 매트 아래 조작 띠를 가리지 않는다
    ctx.sfx.play('correct');
    ctx.feedback.correct(`맞아요! ${q.name}의 밑면 두 개를 찾았어요.`, check);
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
    clearTimeout(timer);
    bench.destroy();
    view.destroy();
  };
}
