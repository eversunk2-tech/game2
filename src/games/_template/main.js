/**
 * 새 게임 시작점. `npm run new -- <게임-id> "<게임 이름>"`으로 복사된다.
 * 1) docs/games/<게임-id>.md 기획서를 먼저 채운다.
 * 2) STAGES와 playStage를 기획서대로 바꾼다. (지금은 버튼 두 개짜리 예시 문제)
 * 3) 규칙은 logic.js 같은 순수 함수 파일로 빼고 tests/unit에 테스트를 쓴다.
 * 엔진 사용법: docs/engine.md · 완성 예시: src/games/sample-divisor-sort
 */
import meta from './game.json' with { type: 'json' };
import { createGameApp } from '../../shared/ui/app.js';

const STAGES = [
  {
    id: 'stage-1',
    title: '1단계',
    goal: '이 단계에서 학생이 할 일을 한 문장으로 써요.',
    questions: [
      { id: 'q1', text: '2 + 3 = 5 인가요?', answer: true },
      { id: 'q2', text: '3 × 4 = 7 인가요?', answer: false },
    ],
  },
  {
    id: 'stage-2',
    title: '2단계',
    goal: '앞 단계를 마치면 열려요.',
    questions: [
      { id: 'q1', text: '10 ÷ 2 = 5 인가요?', answer: true },
    ],
  },
];

createGameApp({
  root: document.getElementById('app'),
  game: meta,
  howTo: ['놀이 방법을 한 줄씩 써요.', '학생이 처음 보고도 할 수 있게 짧게 써요.'],
  stages: STAGES,
  playStage(stage, ctx) {
    const { h } = ctx;
    const questions = ctx.rng.shuffle(stage.questions);
    let index = 0;

    const questionEl = h('p', { class: 'question' });
    const answer = (value) => {
      const q = questions[index];
      const correct = value === q.answer;
      // tag: 틀린 이유(오개념). 기획서의 오개념 표와 같은 말을 쓴다.
      ctx.log.answer({ itemId: q.id, correct, tag: correct ? null : '예시 오개념' });
      if (!correct) {
        ctx.sfx.play('wrong');
        ctx.feedback.wrong('다시 생각해 보세요.', questionEl);
        return;
      }
      ctx.sfx.play('correct');
      ctx.feedback.correct('맞아요!', questionEl);
      index += 1;
      if (index === questions.length) ctx.finish();
      else render();
    };
    const render = () => {
      questionEl.textContent = questions[index].text;
    };

    ctx.el.append(
      questionEl,
      h('div', { class: 'choices' },
        h('button', { type: 'button', class: 'btn btn-lg', onclick: () => answer(true) }, '⭕ 맞아요'),
        h('button', { type: 'button', class: 'btn btn-lg', onclick: () => answer(false) }, '❌ 아니에요'),
      ),
    );
    render();

    // 화면을 떠날 때 부르는 정리 함수: 타이머·게임 루프·window 이벤트를 여기서 멈춘다.
    return () => {};
  },
}).start();
