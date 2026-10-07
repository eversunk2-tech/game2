import meta from './game.json' with { type: 'json' };
import { createGameApp } from '../../shared/ui/app.js';
import { enableDragDrop } from '../../shared/ui/drag-drop.js';
import { STAGES, binsFor, judge, makeCards } from './logic.js';

createGameApp({
  root: document.getElementById('app'),
  game: { ...meta, subtitle: '예시 게임 · 5학년 수학 · 약수와 배수' },
  howTo: [
    '위에 있는 수 카드를 알맞은 상자로 끌어다 놓아요.',
    '끌기가 어려우면 카드를 누른 다음 상자를 눌러도 돼요.',
    '틀리면 왜 틀렸는지 알려 줘요. 다시 생각해서 넣어 보세요.',
    '카드를 모두 넣으면 단계가 끝나요. 처음부터 맞힐수록 별을 많이 받아요.',
  ],
  stages: STAGES,
  playStage(stage, ctx) {
    const { h } = ctx;
    const cards = makeCards(stage, ctx.rng);
    let remaining = cards.length;
    let finishTimer = null;

    const pool = h('div', { class: 'card-pool', 'aria-label': '수 카드' },
      cards.map((card) => h('button', {
        type: 'button',
        class: 'num-card dnd-item',
        dataset: { value: card.value },
        'aria-pressed': 'false',
      }, String(card.value))),
    );

    const bins = binsFor(stage).map((bin) => h('button', {
      type: 'button',
      class: `bin bin-${bin.id} dnd-target`,
      dataset: { bin: bin.id },
    },
      h('span', { class: 'bin-label' }, bin.label),
      h('span', { class: 'bin-slot' }),
    ));

    ctx.el.append(
      h('p', { class: 'play-tip' }, '카드를 끌어서 넣거나, 카드를 누른 다음 상자를 눌러요.'),
      pool,
      h('div', { class: 'bins' }, bins),
    );

    const dnd = enableDragDrop({
      root: ctx.el,
      onDrop(cardEl, binEl) {
        const value = Number(cardEl.dataset.value);
        const result = judge(stage, value, binEl.dataset.bin);
        ctx.log.answer({
          itemId: value,
          correct: result.correct,
          tag: result.tag,
          given: binEl.dataset.bin,
          expected: result.expected,
        });

        if (!result.correct) {
          ctx.sfx.play('wrong');
          ctx.feedback.wrong(result.message, cardEl);
          return;
        }
        ctx.sfx.play('correct');
        ctx.feedback.correct(result.message, binEl);
        binEl.querySelector('.bin-slot').append(h('span', { class: 'placed' }, String(value)));
        cardEl.remove();
        remaining -= 1;
        if (remaining === 0) finishTimer = setTimeout(() => ctx.finish(), 900);
      },
    });

    return () => {
      dnd.destroy();
      clearTimeout(finishTimer);
    };
  },
}).start();
