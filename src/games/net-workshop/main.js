/**
 * 전개도 접기 공방. 기획서: docs/games/net-workshop/spec.md (16절: 자유 배치·게임 요소)
 * 차시 묶음(LESSONS)으로 단계를 묶는다. 선생님은 ?lesson=cube 처럼 차시로 바로 들어간다.
 * 단계 종류(kind)에 맞는 화면 함수로 넘긴다: judge · opposite · complete · free(내 맘대로 전개도) · dex(도감 주문) · dice(주사위 주문)
 */
import meta from './game.json' with { type: 'json' };
import { createGameApp } from '../../shared/ui/app.js';
import { LESSONS, NOTE_ITEMS, NOTE_XP, STAGES, dexItemName, makeQuestions, noteItemName } from './logic.js';
import { CUBE_NETS } from './nets-data.js';
import { playDice } from './play-dice.js';
import { playFree } from './play-free.js';
import { playJudge } from './play-judge.js';
import { playPick } from './play-pick.js';
import { playPlace } from './play-place.js';
import { heroArt, miniNet, stageThumb } from './thumbs.js';

const SCREENS = { judge: playJudge, opposite: playPick, complete: playPlace, free: playFree, dex: playFree, dice: playDice };

// ── 게임 도장 6개 (spec 16-3). 엔진 기본 6개와 합쳐 도장판 12칸. 판정은 학습 기록·도감·누적 횟수로(순수 함수) ──
// 직접 만드는 단계(내 맘대로 전개도·도감 주문)는 접기 전에 될지 묻지 않는다(spec 16-12): 기록의 맞음 = 정육면체가 되는 전개도를 만듦
const BUILD_STAGES = ['cube-free', 'cube-dex'];
const buildRecords = (s) => s.records.filter((r) => BUILD_STAGES.includes(r.stageId));

/** 한 판 안에서 연달아 맞은 답의 가장 긴 길이 (직접 만드는 단계: 안 되는 모양 없이 연달아 만든 전개도 수) */
function bestRun(records) {
  let best = 0;
  for (const r of records) {
    let run = 0;
    for (const a of r.answers) {
      run = a.correct ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return best;
}

const BADGES = [
  {
    id: 'beyond-cross',
    title: '십자 너머',
    desc: '십자(1-4-1) 모양이 아닌 전개도를 직접 만들어 찾아요',
    icon: 'arrow',
    test: (s) => (s.collections['cube-nets']?.found ?? []).some((id) => !id.startsWith('1-4-1')),
  },
  // 아래 두 도장은 예상하기를 없애면서(spec 16-12) 조건을 바꿨다. id는 그대로라 이미 받은 도장은 그대로 남는다
  {
    id: 'overlap-detective',
    title: '겹침 탐정',
    desc: '안 되는 까닭을 5번 맞혀요',
    icon: 'target',
    test: (s) => s.counters.explain >= 5, // "왜 안 될까요?"를 맞힌 횟수(판별·내 맘대로 전개도·도감 주문, 마친 판의 누적)
  },
  {
    id: 'predict-master',
    title: '설계 명수',
    desc: '안 되는 모양 없이 전개도를 5번 연달아 만들어요',
    icon: 'spark',
    test: (s) => bestRun(buildRecords(s)) >= 5,
  },
  {
    id: 'net-doctor',
    title: '전개도 박사',
    desc: '전개도 도감 11칸을 모두 채워요',
    icon: 'grid',
    test: (s) => (s.collections['cube-nets']?.count ?? 0) >= 11,
  },
  {
    id: 'dice-master',
    title: '주사위 장인',
    desc: '주사위 주문(도전)을 성공해요',
    icon: 'cube',
    test: (s) => (s.stars['cube-dice'] ?? 0) > 0,
  },
  {
    id: 'note-keeper',
    title: '노트 정리왕',
    desc: '안 되는 모양 노트를 12칸 채워요',
    icon: 'copy',
    test: (s) => (s.collections['cube-non-nets']?.count ?? 0) >= 12,
  },
];

// 도감 2개: 내 맘대로 전개도와 도감 주문에서 직접 만들어 접은 모양만 등록한다 (판별에서 본 것, 주사위 주문에서 접은 것은 아님)
// "도감 n / 11" 칩에는 전개도 도감만 세고, 노트는 label로 따로 "노트 n / 24". 노트 등록 점수는 +1 (spec 16-8)
const COLLECTIONS = [
  {
    id: 'cube-nets',
    title: '전개도 도감',
    lesson: 'cube',
    desc: '직접 만들어 접은 정육면체 전개도가 모여요. 돌리거나 뒤집어도 같은 모양은 한 칸이에요. 모두 11가지예요.',
    items: CUBE_NETS.map((n) => ({ id: n.name, name: dexItemName(n), thumb: () => miniNet(n.cells) })),
  },
  {
    id: 'cube-non-nets',
    title: '안 되는 모양 노트',
    label: '노트',
    icon: 'copy',
    xp: NOTE_XP,
    lesson: 'cube',
    desc: '접어 봤더니 정육면체가 안 된 모양이 까닭별로 모여요(면이 겹치는 모양 16 · 네 면이 한 점에 모이는 모양 8).',
    items: NOTE_ITEMS.map((n) => ({ id: n.name, name: noteItemName(n), thumb: () => miniNet(n.cells, { invalid: true }) })),
  },
];

createGameApp({
  root: document.getElementById('app'),
  game: { ...meta, subtitle: '5·6학년 수학 · 입체도형의 전개도' },
  howTo: [
    '전개도를 보고, 접으면 입체가 될지 먼저 머릿속으로 생각해요.',
    '답한 뒤에 [접어 보기]나 막대로 직접 접어서 확인해요. 접은 입체는 끌어서 여러 방향으로 돌려 보고, 크게도 작게도 볼 수 있어요.',
    '틀리면 겹치는 면(빗금, ✗ 겹쳐요)과 비는 곳(점선, 비어요)을 보여 줘요. 오른쪽 까닭 쪽지를 읽어 보세요.',
    '면 카드는 빈 자리로 끌어 놓거나, 카드를 누른 다음 자리를 눌러요. 키보드는 Tab과 Enter, 방향키를 써요.',
    '마지막 단계에서는 면 6장을 마음대로 놓고 접어 봐요. 새로 찾은 전개도는 도감에 모여요.',
    '네 단계를 모두 마치면 도전 주문서(주사위 주문, 도감 주문)가 열려요. 하고 싶은 사람만 해요. 시간은 [시간 재기]를 켠 사람에게만 보여요.',
  ],
  heroArt,
  lessons: LESSONS,
  rewards: {
    ranks: ['견습생', '솜씨꾼', '접기 장인', '설계 장인', '공방 명장'],
    badges: BADGES,
  },
  collections: COLLECTIONS,
  stages: STAGES.map((stage) => ({ ...stage, thumb: stageThumb(stage.kind) })),
  playStage(stage, ctx) {
    // 문항을 가장 먼저 만든다: 같은 ?seed=면 같은 문항 (e2e 테스트도 이것으로 정답을 안다)
    const questions = makeQuestions(stage, ctx.rng);
    return SCREENS[stage.kind](stage, ctx, questions);
  },
}).start();
