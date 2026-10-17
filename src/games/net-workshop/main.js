/**
 * 입체도형 공방(예전 이름 "전개도 접기 공방" — id·주소·저장 열쇠는 net-workshop 그대로).
 * 기획서: docs/games/net-workshop/spec.md (16절: 자유 배치·게임 요소) · spec-grade6.md (7-1절: 영역)
 * 차시 묶음(LESSONS)으로 단계를 묶고, 차시를 학년(GRADES) 아래의 영역(AREAS)으로 나눈다.
 * 선생님은 ?lesson=cube 처럼 차시로, ?area=blocks 처럼 영역으로, ?grade=6 처럼 학년으로 바로 들어간다.
 * 단계 종류(kind)에 맞는 화면 함수로 넘긴다: judge · opposite · complete · free(내 맘대로 전개도) · dex(도감 주문) · dice(주사위 주문)
 */
import meta from './game.json' with { type: 'json' };
import { createGameApp, lazyModule } from '../../shared/ui/app.js';
import { areaArt } from './thumbs.js'; // 학년·영역 카드와 탭 그림
import { CUBOID_COLLECTIONS, CUBOID_SCREENS } from './cuboid-main.js';
import { CUBOID_HOW_TO_MORE } from './cuboid-main.js'; // 직육면체 영역의 놀이 방법에 덧붙이는 줄(상자 크기 · 돌리기 손잡이, spec 16-16)
import { CUBOID_BADGES } from './cuboid-main.js'; // 직육면체 차시의 도장: 직육면체 도감 완성(spec 16-17 — 도장판 13칸)
import { LESSONS, NOTE_ITEMS, NOTE_XP, STAGES, dexItemName, makeQuestions, noteItemName } from './logic.js';
import { CUBE_NETS } from './nets-data.js';
import { playDice } from './play-dice.js';
import { playFree } from './play-free.js';
import { playJudge } from './play-judge.js';
import { playPick } from './play-pick.js';
import { playPlace } from './play-place.js';
import { heroArt, miniNet, stageThumb } from './thumbs.js';
import { BLOCK_HOW_TO, BLOCK_LESSONS, BLOCK_STAGES } from './blocks/index.js'; // 쌓기나무 영역(6학년): 차시·단계 목록(바탕 묶음)
// 쌓기나무의 플레이(문제 만들기·판정·화면)는 그 영역의 단계에 들어갈 때 받는다 — 처음 화면이 그려진 뒤 한가할 때 미리 받아 둔다(spec-grade6 7-4절, B0b)
const BLOCKS_PLAY = lazyModule(() => import('./blocks/blocks-play.js'));

const SCREENS = { judge: playJudge, opposite: playPick, complete: playPlace, free: playFree, dex: playFree, dice: playDice };
Object.assign(SCREENS, CUBOID_SCREENS); // 직육면체의 전개도 차시: edge · face · cjudge · cfree (cuboid-main.js)

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
BADGES.push(...CUBOID_BADGES); // 직육면체 도감 완성 (cuboid-main.js, spec 16-17)

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
  ...CUBOID_COLLECTIONS, // 직육면체 차시에서 찾은 전개도(화면에 보이지 않는 모음, cuboid-main.js)
];

// ── 학년 → 영역 (spec-grade6 7-1절 · 2026-10-16 사용자 수정 요청: 학년으로 먼저 고른다) ──
// 처음 화면의 학년 카드 → 학년 화면의 영역 카드 → 영역의 단계 지도(같은 학년의 영역 탭).
// 차시가 아직 없는 영역(각기둥·원기둥)은 "준비 중" 카드로 보이고, 적어 둔 차시가 만들어지면 저절로 열린다(엔진이 없는 차시 id는 건너뛴다)
const CUBE_HOW_TO = [
  '전개도를 보고, 접으면 입체가 될지 먼저 머릿속으로 생각해요.',
  '답한 뒤에 [접어 보기]나 막대로 직접 접어서 확인해요. 접은 입체는 끌어서 여러 방향으로 돌려 보고, 크게도 작게도 볼 수 있어요.',
  '틀리면 겹치는 면(빗금, ✗ 겹쳐요)과 비는 곳(점선, 비어요)을 보여 줘요. 오른쪽 까닭 쪽지를 읽어 보세요.',
  '면 카드는 빈 자리로 끌어 놓거나, 카드를 누른 다음 자리를 눌러요. 키보드는 Tab과 Enter, 방향키를 써요.',
  '마지막 단계에서는 면 6장을 마음대로 놓고 접어 봐요. 새로 찾은 전개도는 도감에 모여요.',
  '네 단계를 모두 마치면 도전 주문서(주사위 주문, 도감 주문)가 열려요. 하고 싶은 사람만 해요. 시간은 [시간 재기]를 켠 사람에게만 보여요.',
];
// 직육면체: 앞 네 줄은 같고, 마지막 단계(도감·도전 주문서가 없다)만 그 차시에 맞게
const CUBOID_HOW_TO = [
  ...CUBE_HOW_TO.slice(0, 4),
  '마지막 단계에서는 면 6장을 마음대로 놓고 접어 봐요. 서로 다른 전개도를 3가지까지 찾아봐요.',
];
CUBOID_HOW_TO.push(...CUBOID_HOW_TO_MORE);
const GRADES = [
  { grade: 5, title: '5학년', note: '정육면체, 직육면체 전개도 탐구', art: areaArt('grade5') },
  { grade: 6, title: '6학년', note: '각기둥의 전개도, 쌓기나무 탐구, 원기둥의 전개도 탐구', art: areaArt('grade6') },
];
const AREAS = [
  { id: 'cube', grade: 5, title: '정육면체의 전개도', note: '5학년 2학기 · 직육면체와 정육면체', lessons: ['cube'], art: areaArt('cube'), howTo: CUBE_HOW_TO },
  { id: 'cuboid', grade: 5, title: '직육면체의 전개도', note: '5학년 2학기 · 직육면체와 정육면체', lessons: ['cuboid'], art: areaArt('cuboid'), howTo: CUBOID_HOW_TO },
  { id: 'prism', grade: 6, title: '각기둥의 전개도', note: '6학년 1학기 · 각기둥과 각뿔', lessons: ['prism'], art: areaArt('prism') },
  {
    id: 'blocks',
    grade: 6,
    title: '쌓기나무',
    note: '6학년 2학기 · 공간과 입체',
    lessons: ['blocks-look', 'blocks-top', 'blocks-three', 'blocks-number', 'blocks-layer'],
    art: areaArt('blocks'),
    howTo: BLOCK_HOW_TO, // 쌓기나무 차시의 조작
  },
  { id: 'cylinder', grade: 6, title: '원기둥의 전개도', note: '6학년 2학기 · 원기둥, 원뿔, 구', lessons: ['cylinder'], art: areaArt('cylinder') },
];

// ── 게임 인트로 (spec-grade6 15-6 · 15-9: 캔바 그림 + 코드 움직임, 꽉 채우기/카드 규칙은 selectio game과 같게) ──
// 그림은 style.css가 준다(img/intro-bg.jpg 배경 · img/intro-title.png 제목 — 사용자가 캔바 AI 업스케일로 받은 2880×1620 원본 바이트 그대로).
// 여기에는 그림 좌표(px)로 잰 자리: 배경의 꼭 보일 칸(두 아이 — 얼굴·몸·소녀가 든 전개도까지, 몸은 그림 아래 끝까지)·제목이 가리면 안 되는 두 아이의 머리,
// 제목 그림에서 쓸 상자(투명 여백을 뺀 글자 상자 — 불투명도 10 이상인 곳 + 둘레 약 7px)와 그 안의 빈 파란 리본의 가운데 선
const INTRO = {
  subtitle: '전개도와 쌓기나무로 떠나는 도형 모험',
  enterLabel: '입장하기',
  art: {
    width: 2880,
    height: 1620,
    keep: [160, 630, 2250, 1620], // 왼쪽 소년(배낭·막대 포함) x 160~800 · 오른쪽 소녀(든 전개도 포함) x 1420~2250, 머리 위 끝 y 630부터 그림 아래 끝까지
    avoid: [[425, 625, 765, 970], [1820, 860, 2115, 1150]], // 소년의 머리 · 소녀의 머리(머리카락 포함)
    buttonAvoid: [[1675, 1378, 1795, 1442]], // [입장하기]가 가리면 왼쪽으로 조금 비킬 칸: 소녀가 전개도를 든 손(손가락 끝~소매 앞, 엄지 위~손바닥 아래 — spec-grade6 15-11 끝)
    glow: 'rgb(90 165 255 / 55%)', // 카드 둘레의 빛: 그림의 하늘색
  },
  logo: { width: 2880, height: 1620, crop: [268, 96, 2564, 1578], ribbon: { path: 'M830 1352 Q1450 1480 2070 1352', fontSize: 96, length: 1120 } },
};

createGameApp({
  root: document.getElementById('app'),
  game: { ...meta, subtitle: '5·6학년 수학 · 전개도와 쌓기나무' },
  grades: GRADES,
  areas: AREAS,
  intro: INTRO, // 앱을 열면 인트로부터(수업 주소 ?lesson=·?area=·?grade=·?stage=로 열면 인트로 없이)
  // 처음 화면(학년·영역을 고르기 전)의 놀이 방법: 모든 영역에 같은 몇 줄. 영역의 단계 지도·한 차시 주소에서는 그 영역의 줄(AREAS의 howTo)
  howTo: [
    '학년을 고른 다음, 공부할 영역을 골라요. 영역을 누르면 그 영역의 차시와 단계가 나와요.',
    '단계는 차례로 열려요. 앞 단계를 마치면 다음 단계를 할 수 있어요.',
    '틀려도 괜찮아요. 까닭을 읽고 다시 해 보면 솜씨 점수가 쌓이고 칭호가 올라가요.',
    '마우스, 손가락, 키보드(Tab과 Enter, 방향키) 어느 것으로도 할 수 있어요.',
    '영역마다 하는 방법은 단계를 고르는 화면의 [놀이 방법]에서 볼 수 있어요.',
  ],
  heroArt,
  lessons: [...LESSONS, ...BLOCK_LESSONS],
  rewards: {
    ranks: ['견습생', '솜씨꾼', '접기 장인', '설계 장인', '공방 명장'],
    badges: BADGES,
  },
  collections: COLLECTIONS,
  stages: [...STAGES.map((stage) => ({ ...stage, thumb: stageThumb(stage.kind) })), ...BLOCK_STAGES],
  preload: [BLOCKS_PLAY.preload],
  playStage(stage, ctx) {
    // 쌓기나무 단계는 blocks/가 문항도 화면도 만든다(받은 뒤에 — 받는 동안은 엔진의 "불러오는 중")
    if (stage.area === 'blocks') return BLOCKS_PLAY.play(ctx, (blocks) => blocks.playBlockStage(stage, ctx));
    // 문항을 가장 먼저 만든다: 같은 ?seed=면 같은 문항 (e2e 테스트도 이것으로 정답을 안다)
    const questions = makeQuestions(stage, ctx.rng);
    return SCREENS[stage.kind](stage, ctx, questions);
  },
}).start();
