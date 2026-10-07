/**
 * 전개도 접기 공방. 기획서: docs/games/net-workshop/spec.md
 * 차시 묶음(LESSONS)으로 단계를 묶는다. 선생님은 ?lesson=cube 처럼 차시로 바로 들어간다.
 * 단계 종류(kind)에 맞는 화면 함수로 넘긴다: judge · opposite · complete
 */
import meta from './game.json' with { type: 'json' };
import { createGameApp } from '../../shared/ui/app.js';
import { LESSONS, STAGES, makeQuestions } from './logic.js';
import { playJudge } from './play-judge.js';
import { playPick } from './play-pick.js';
import { playPlace } from './play-place.js';

const SCREENS = { judge: playJudge, opposite: playPick, complete: playPlace };

createGameApp({
  root: document.getElementById('app'),
  game: { ...meta, subtitle: '5·6학년 수학 · 입체도형의 전개도' },
  howTo: [
    '전개도를 보고, 접으면 입체가 될지 먼저 머릿속으로 생각해요.',
    '답한 뒤에 [▶ 접어 보기]나 막대로 직접 접어서 확인해요. [↺] [↻]로 돌려 볼 수 있어요.',
    '틀리면 겹치는 면(빗금, ✗ 겹쳐요)과 비는 곳(점선, 비어요)을 보여 줘요. 오른쪽 까닭 칸을 읽어 보세요.',
    '면 카드는 빈 자리로 끌어 놓거나, 카드를 누른 다음 자리를 눌러요. 키보드는 Tab과 Enter를 써요.',
  ],
  lessons: LESSONS,
  stages: STAGES,
  playStage(stage, ctx) {
    // 문항을 가장 먼저 만든다: 같은 ?seed=면 같은 문항 (e2e 테스트도 이것으로 정답을 안다)
    const questions = makeQuestions(stage, ctx.rng);
    return SCREENS[stage.kind](stage, ctx, questions);
  },
}).start();
