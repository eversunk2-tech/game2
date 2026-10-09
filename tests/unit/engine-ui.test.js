import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitTitleMark } from '../../src/shared/core/title-mark.js';
import { createPlayReward, stageXp } from '../../src/shared/core/rewards.js';
import {
  PRACTICE_OFF_ONCE_TEXT,
  PRACTICE_OFF_TEXT,
  customStats,
  defaultHighlights,
  gradeLabel,
  practiceNoteText,
  readUrlOptions,
  resultStats,
  stageXpLine,
  starHint,
  stageStates,
  timeRecordText,
} from '../../src/shared/ui/app.js';
import { SOUNDS } from '../../src/shared/ui/audio.js';
import { CONFETTI_MAX, RESULT_MS, confettiSpecs, isLowFx } from '../../src/shared/ui/celebrate.js';
import { anchorPlacement, belowPlacement } from '../../src/shared/ui/feedback.js';
import { RETURN_MS, ghostTransform, sameSpot } from '../../src/shared/ui/drag-drop.js';
import { ICONS, STAR_PATH } from '../../src/shared/ui/icons.js';

test('형광펜 낱말: 마지막 낱말, 괄호로 시작하면 그 앞 낱말, 이어 붙이면 원래 이름', () => {
  assert.deepEqual(splitTitleMark('전개도 접기 공방'), { before: '전개도 접기 ', mark: '공방', after: '' });
  assert.deepEqual(splitTitleMark('약수·배수 분류 (예시)'), { before: '약수·배수 ', mark: '분류', after: ' (예시)' });
  assert.deepEqual(splitTitleMark('분수공장'), { before: '', mark: '분수공장', after: '' });
  assert.deepEqual(splitTitleMark('(예시) 게임'), { before: '(예시) ', mark: '게임', after: '' });
  assert.deepEqual(splitTitleMark('학습게임 모음 (개발 중)'), { before: '학습게임 ', mark: '모음', after: ' (개발 중)' });
  assert.deepEqual(splitTitleMark('(예시)'), { before: '', mark: '(예시)', after: '' });
  for (const title of ['초등 5~6학년 학습게임', '테스트 "게임" <1>', '  앞뒤  빈칸  ', 'a (b)', 'a b (c) (d)', '', ' ']) {
    const { before, mark, after } = splitTitleMark(title);
    assert.equal(before + mark + after, title);
  }
});

test('학년 칩 글자', () => {
  assert.equal(gradeLabel({ grades: [5, 6], subject: '수학' }), '5·6학년 수학');
  assert.equal(gradeLabel({ grades: [5] }), '5학년');
  assert.equal(gradeLabel({}), '');
});

test('단계 카드 상태: 마침 · 지금 할 곳(열린 단계 중 안 한 첫 단계) · 열림 · 잠김', () => {
  const stars = { a: 3, b: 1 };
  const open = new Set(['a', 'b', 'c', 'd']);
  const states = stageStates(['a', 'b', 'c', 'd', 'e'], {
    isUnlocked: (id) => open.has(id),
    getStars: (id) => stars[id] ?? 0,
  });
  assert.deepEqual(states, { a: 'done', b: 'done', c: 'now', d: 'open', e: 'locked' });
  // 아무것도 안 했으면 첫 단계가 지금 할 곳
  assert.deepEqual(stageStates(['x', 'y'], { isUnlocked: (id) => id === 'x', getStars: () => 0 }), { x: 'now', y: 'locked' });
  // 모두 마쳤으면 지금 할 곳이 없다
  assert.deepEqual(stageStates(['x'], { isUnlocked: () => true, getStars: () => 2 }), { x: 'done' });
});

test('별 기준 안내: 몇 번 더 맞히면 별이 늘어나는지 (90% ★3, 70% ★2)', () => {
  assert.equal(starHint({ stars: 2, attempts: 6, correct: 5 }), '한 번만 더 맞히면 별 3개!'); // 6/6 = 100%
  assert.equal(starHint({ stars: 2, attempts: 10, correct: 8 }), '한 번만 더 맞히면 별 3개!'); // 9/10 = 90%
  assert.equal(starHint({ stars: 1, attempts: 10, correct: 5 }), '2번 더 맞히면 별 2개!'); // 7/10 = 70%
  assert.equal(starHint({ stars: 3, attempts: 9, correct: 9 }), '별 3개를 모두 받았어요!');
  assert.equal(starHint({ stars: 0, attempts: 4, correct: 1, cleared: false }), '까닭을 다시 살펴보고 한 번 더 해 봐요.');
  // 게임이 별을 직접 준 경우·답 기록이 없는 경우는 정답률 안내를 하지 않는다
  assert.equal(starHint({ stars: 2, attempts: 6, correct: 5, fromAccuracy: false }), null);
  assert.equal(starHint({ stars: 1, attempts: 0, correct: 0 }), null);
});

test('토스트 기준 자리: 요소 아래쪽 가운데, 화면 안으로', () => {
  const viewport = { width: 1366, height: 768 };
  // 무대(왼쪽 큰 칸) 아래쪽 가운데
  assert.deepEqual(anchorPlacement({ left: 83, right: 927, top: 147, bottom: 663, width: 844, height: 516 }, viewport), { left: 505, bottom: 121, width: 600 });
  // 좁은 요소면 그 너비에 맞추되 너무 좁아지지 않게
  assert.equal(anchorPlacement({ left: 100, right: 400, top: 0, bottom: 300, width: 300, height: 300 }, viewport).width, 268);
  assert.equal(anchorPlacement({ left: 0, right: 100, top: 0, bottom: 300, width: 100, height: 300 }, viewport).width, 240);
  // 화면 왼쪽 끝을 넘지 않는다
  assert.equal(anchorPlacement({ left: 0, right: 100, top: 0, bottom: 300, width: 100, height: 300 }, viewport).left, 136);
  // 요소 아래쪽이 화면 밖이면 화면 아래에 붙인다
  assert.equal(anchorPlacement({ left: 0, right: 800, top: 100, bottom: 1400, width: 800, height: 1300 }, viewport).bottom, 16);
  // lift: 요소 아래쪽 조작 띠만큼 더 위에
  assert.equal(anchorPlacement({ left: 83, right: 927, top: 147, bottom: 663, width: 844, height: 516 }, viewport, { lift: 64 }).bottom, 185);
  // 요소가 화면 위쪽에 있어도 너무 높이 뜨지 않는다
  assert.equal(anchorPlacement({ left: 0, right: 800, top: -500, bottom: 40, width: 800, height: 540 }, viewport).bottom, 648);
});

test('좁은 화면 토스트 자리(anchor narrow: below): 요소 바로 밑(요소 밖), 화면 안으로, 요소가 화면 밖이면 기본 자리', () => {
  const viewport = { width: 390, height: 844 };
  // 무대(위 160~520) 바로 밑에: 무대 안의 면을 가리지 않는다
  assert.deepEqual(belowPlacement({ left: 16, right: 374, top: 160, bottom: 520, width: 358, height: 360 }, viewport), { left: 195, top: 528, width: 374 });
  // 무대가 위로 지나가 안 보이거나, 밑에 토스트가 들어갈 자리가 없으면 null (기본 자리)
  assert.equal(belowPlacement({ left: 16, right: 374, top: -500, bottom: -10, width: 358, height: 490 }, viewport), null);
  assert.equal(belowPlacement({ left: 16, right: 374, top: 300, bottom: 800, width: 358, height: 500 }, viewport), null);
});

test('아이콘: 기획서 2-6절 이름이 모두 있고, 그림 요소 형식이 맞다', () => {
  const names = 'back, sound, mute, lock, check, cross, rotl, rotr, play, unfold, bulb, book, stamp, spark, clock, user, target, search, cube, trash, undo, hand, shield, grid, flag, arrow, copy, home, ring, up, down, zoomin, zoomout'.split(', ');
  for (const name of names) assert.ok(ICONS[name], name);
  for (const [name, parts] of Object.entries(ICONS)) {
    assert.ok(parts.length > 0, name);
    for (const [tag, attrs] of parts) {
      assert.ok(['path', 'circle', 'rect'].includes(tag), `${name}: ${tag}`);
      if (tag === 'path') assert.match(attrs.d, /^M[\d.\s,-]/, name);
    }
  }
  assert.match(STAR_PATH, /^M12 /);
});

test('결과 "오늘의 솜씨" 기본 칸: 답 기록에서(처음에 맞힘·다시 일어서기·연속), 새로 찾음·설명은 있을 때만', () => {
  const play = createPlayReward();
  for (const a of [{ itemId: 1, correct: false }, { itemId: 1, correct: true }, { itemId: 2, correct: true }, { itemId: 3, correct: true }, { itemId: 4, correct: true }]) play.answer(a);
  const list = defaultHighlights(play.summary());
  assert.deepEqual(list.map((x) => [x.label, x.value, x.xp]), [
    ['처음에 맞힘', '3 / 4', 6],
    ['다시 일어서기', '2번', 2],
    ['연속 최고', '3번', 1],
  ]);
  // 칸 점수 + 단계 완료·별 = 이번 판 점수
  assert.equal(list.reduce((sum, x) => sum + x.xp, 0), play.xp());
  play.discovered();
  play.event('explain', { correct: true, itemId: 9 });
  assert.deepEqual(defaultHighlights(play.summary()).map((x) => x.label), ['처음에 맞힘', '새로 찾음', '설명 맞힘', '다시 일어서기', '연속 최고']);
  assert.deepEqual(defaultHighlights(createPlayReward().summary()), []); // 답 기록이 없는 게임
  // 별 3개 단계를 다시 하는 판: 칸은 그대로 보이고 연습 점수는 0, 새로 찾음은 그대로
  const replay = createPlayReward({ startStars: 3 });
  for (const a of [{ itemId: 1, correct: false }, { itemId: 1, correct: true }, { itemId: 2, correct: true }, { itemId: 3, correct: true }, { itemId: 4, correct: true }]) replay.answer(a);
  replay.discovered();
  const replayList = defaultHighlights(replay.summary());
  assert.deepEqual(replayList.map((x) => [x.label, x.xp]), [['처음에 맞힘', 0], ['새로 찾음', 5], ['다시 일어서기', 0], ['연속 최고', 0]]);
  assert.equal(replayList.reduce((sum, x) => sum + x.xp, 0), replay.xp());
  assert.match(PRACTICE_OFF_TEXT, /별 3개를 받은 단계라 연습 점수는 없어요/);
});

test("결과 \"오늘의 솜씨\" 기본 칸과 '한 번만' 답(scored: 'once'): 별 3개 판에서도 칸 점수의 합 = 이번 판 점수, 안내 문장은 사실대로", () => {
  const once = (itemId, correct = true) => ({ itemId, correct, scored: 'once' });
  // 별 3개 단계를 다시 하는 판: '한 번만' 답 4개(하나 틀린 뒤 다시 일어서기) + 표시 없는 답 2개 + 점수 없는 답 1개
  const play = createPlayReward({ startStars: 3 });
  for (const a of [once(1), once(2), once(3), once(4, false), once(5), { itemId: 'n1', correct: true }, { itemId: 'n2', correct: true }, { itemId: 'old', correct: true, scored: false }]) play.answer(a);
  play.event('explain', { correct: true, itemId: 1 });
  play.event('explain', { correct: true, itemId: 'n1' }); // 표시 없는 문항의 설명은 별 3개 판에서 0
  play.discovered();
  const list = defaultHighlights(play.summary());
  assert.deepEqual(list.map((x) => [x.label, x.value, x.xp]), [
    ['처음에 맞힘', '6 / 7', 8], // 점수는 '한 번만' 답 4번만
    ['새로 찾음', '1가지', 5],
    ['설명 맞힘', '2번', 2],
    ['다시 일어서기', '1번', 1],
    ['연속 최고', '3번', 1],
  ]);
  assert.equal(list.reduce((sum, x) => sum + x.xp, 0), play.xp());
  assert.equal(play.xp(), 17);
  assert.equal(play.instant(), 17); // 모두 바로 저장할 몫
  // 안내 문장: 연습 점수가 있는 판은 없음, 없는 판은 '한 번만' 답이 있었는지에 따라, 게임이 준 문장이 있으면 그 문장
  assert.equal(practiceNoteText(createPlayReward({ startStars: 2 }).summary()), null);
  assert.equal(practiceNoteText(createPlayReward({ startStars: 2 }).summary(), '게임 문장'), null);
  assert.equal(practiceNoteText(createPlayReward({ startStars: 3 }).summary()), PRACTICE_OFF_TEXT);
  assert.equal(practiceNoteText(play.summary()), PRACTICE_OFF_ONCE_TEXT);
  assert.equal(PRACTICE_OFF_ONCE_TEXT, '별 3개를 받은 단계라 연습 점수는 없어요. 처음 해 본 것은 점수를 받았어요.');
  assert.equal(practiceNoteText(play.summary(), ' 처음 접는 모양은 점수를 받아요. '), '처음 접는 모양은 점수를 받아요.');
  assert.equal(practiceNoteText(play.summary(), '   '), PRACTICE_OFF_ONCE_TEXT);
  assert.equal(practiceNoteText(null), null);
  // 무작위 500판: 별이 몇 개든, 답을 어떻게 섞든 기본 칸 점수의 합 = 이번 판 점수
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let trial = 0; trial < 500; trial += 1) {
    const p = createPlayReward({ startStars: Math.floor(rand() * 4) });
    for (let i = 0; i < 1 + Math.floor(rand() * 14); i += 1) {
      const itemId = `q${Math.floor(rand() * 8)}`;
      const kind = itemId < 'q4' ? 'once' : true; // 문항마다 한 가지 답
      p.answer(rand() < 0.15 ? { itemId: `old${i}`, correct: rand() < 0.5, scored: false } : { itemId, correct: rand() < 0.7, scored: kind });
      if (rand() < 0.3) p.event('explain', { correct: rand() < 0.7, itemId });
      if (rand() < 0.1) p.discovered(rand() < 0.5 ? 1 : undefined);
    }
    assert.equal(defaultHighlights(p.summary()).reduce((sum, x) => sum + x.xp, 0), p.xp(), `판 ${trial}`);
  }
});

test('결과 점수 줄: 단계 완료·별 점수, 반복이면 안내, 늘 "빨리 푼 시간에는 점수가 없어요"', () => {
  assert.equal(stageXpLine(stageXp({ prevStars: 0, stars: 2 })), '단계 완료 +5 · 별 2개 +4 · 빨리 푼 시간에는 점수가 없어요');
  assert.equal(stageXpLine(stageXp({ prevStars: 0, stars: 3, challenge: true }), { challenge: true }), '도전 성공 +10 · 별 3개 +6 · 빨리 푼 시간에는 점수가 없어요');
  assert.match(stageXpLine(stageXp({ prevStars: 3, stars: 3 })), /별이 처음 늘 때만/);
});

test('시간 재기 문장 (점수 없음, 내 기록과만 비교)', () => {
  assert.equal(timeRecordText({ ms: 130_000, prevMs: null }), '내 기록 2분 10초 (첫 기록이에요)');
  assert.equal(timeRecordText({ ms: 130_000, prevMs: 142_000 }), '내 기록 2분 10초 (지난번보다 12초 빨라요)');
  assert.equal(timeRecordText({ ms: 150_000, prevMs: 130_000 }), '내 기록 2분 30초 (가장 좋은 기록은 2분 10초)');
});

test('결과 화면의 기록 칸: 기본은 정답률 · 맞힘/시도 · 걸린 시간. 게임이 stats를 주면 정답률 대신 그 칸, 시간 재기를 켜지 않은 판은 걸린 시간 없음', () => {
  const record = { accuracy: 0.8, attempts: 5, correct: 4, durationMs: 130_000 };
  assert.deepEqual(resultStats({ record }), [['정답률', '80%'], ['맞힘/시도', '5번 중 4번 맞힘'], ['걸린 시간', '2분 10초']]);
  // 답이 없는 판(시뮬레이션 등): 맞힘/시도 칸은 없다 (지금까지와 같다)
  assert.deepEqual(resultStats({ record: { accuracy: null, attempts: 0, correct: 0, durationMs: 5000 } }), [['정답률', '-'], ['걸린 시간', '5초']]);
  // 시간 재기를 고를 수 있는 단계에서 켜지 않았으면 걸린 시간을 보이지 않는다
  assert.deepEqual(resultStats({ record, showTime: false }), [['정답률', '80%'], ['맞힘/시도', '5번 중 4번 맞힘']]);
  // 게임이 준 칸(맞힘·틀림으로 보이지 않는 단계): 정답률 · 맞힘/시도 자리에 들어간다
  const custom = [{ label: '찾은 전개도', value: '3가지' }, { label: '접어 본 모양', value: '5가지' }];
  assert.deepEqual(resultStats({ record, custom }), [['찾은 전개도', '3가지'], ['접어 본 모양', '5가지'], ['걸린 시간', '2분 10초']]);
  assert.deepEqual(resultStats({ record, custom, showTime: false }), [['찾은 전개도', '3가지'], ['접어 본 모양', '5가지']]);
  // 쓸 수 없는 값은 버리고(이름·값이 없는 칸), 3칸까지. 쓸 칸이 하나도 없으면 기본 칸
  assert.deepEqual(customStats([{ label: 'a', value: 1 }, null, { label: '', value: 2 }, { label: 'b' }, { label: 'c', value: 0 }, { label: 'd', value: 3 }, { label: 'e', value: 4 }]),
    [['a', '1'], ['c', '0'], ['d', '3']]);
  for (const bad of [null, undefined, 'x', [], [{}], [{ label: ' ', value: 1 }]]) {
    assert.equal(customStats(bad), null);
    assert.equal(resultStats({ record, custom: bad })[0][0], '정답률');
  }
});

test('?fx=low 또는 코어 2개 이하면 저사양 모드', () => {
  assert.equal(readUrlOptions('?fx=low').fx, 'low');
  assert.equal(readUrlOptions('').fx, null);
  assert.equal(isLowFx({ fx: 'low', hardwareConcurrency: 8 }), true);
  assert.equal(isLowFx({ fx: null, hardwareConcurrency: 2 }), true);
  assert.equal(isLowFx({ fx: null, hardwareConcurrency: 4 }), false);
  assert.equal(isLowFx({ fx: null, hardwareConcurrency: undefined }), false);
});

test('색종이: 한 번에 12개 이하, 2초 안에 끝나는 연출', () => {
  assert.equal(CONFETTI_MAX, 12);
  assert.ok(RESULT_MS <= 2000);
  assert.equal(confettiSpecs(50).length, 12);
  assert.equal(confettiSpecs(0).length, 0);
  const specs = confettiSpecs(10, { width: 600, random: () => 0.5 });
  assert.equal(specs.length, 10);
  assert.ok(specs.every((p) => p.delay <= 200 && p.color >= 1 && p.color <= 8));
  assert.ok(specs.every((p) => Math.abs(p.x) <= 300));
});

test('효과음: 기획서 4절 이름이 모두 있고, 음 길이가 짧다', () => {
  for (const name of ['click', 'correct', 'wrong', 'clear', 'stamp', 'combo', 'discover', 'rankup', 'fold', 'unlock']) {
    const parts = SOUNDS[name](3);
    assert.ok(parts.length > 0, name);
    for (const p of parts) assert.ok(p.t + p.d <= 0.8, `${name}: ${p.t + p.d}초`);
  }
  // combo: 연속 수가 늘면 음이 높아진다
  assert.ok(SOUNDS.combo(2)[0].f > SOUNDS.combo(1)[0].f);
});

test('끌어다 놓기: 끄는 복제의 자리(처음 자리에서 끈 만큼, 조상이 확대돼 있으면 그 비율), 놓은 뒤 카드가 제자리에 그대로인지 판단', () => {
  // 복제는 처음 자리에 고정해 두고 transform으로만 옮긴다
  assert.equal(ghostTransform(0, 0), 'translate(0px, 0px)');
  assert.equal(ghostTransform(120.5, -40), 'translate(120.5px, -40px)');
  assert.equal(ghostTransform(10, 20, [1, 1]), 'translate(10px, 20px)');
  assert.equal(ghostTransform(10, 20, [1.5, 1.5]), 'translate(10px, 20px) scale(1.5, 1.5)');
  // 제자리에 그대로(2px까지): 복제가 돌아간다. 옮겨졌거나 크기가 바뀌었거나 숨겨졌으면(0 × 0) 복제는 그 자리에서 사라진다
  const home = { left: 100, top: 50, width: 64, height: 64 };
  assert.equal(sameSpot(home, { ...home }), true);
  assert.equal(sameSpot(home, { left: 101.5, top: 48.5, width: 64, height: 65 }), true);
  assert.equal(sameSpot(home, { ...home, left: 103 }), false);
  assert.equal(sameSpot(home, { ...home, top: 400 }), false);
  assert.equal(sameSpot(home, { ...home, width: 40, height: 40 }), false);
  assert.equal(sameSpot(home, { left: 0, top: 0, width: 0, height: 0 }), false);
  assert.equal(sameSpot({ left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0, width: 0, height: 0 }), false); // 보이지 않는 것은 "그대로"가 아니다
  assert.equal(sameSpot(home, null), false);
  assert.equal(sameSpot(home, { ...home, left: 104 }, 5), true);
  assert.ok(RETURN_MS >= 100 && RETURN_MS <= 200); // 돌아가는 것이 보이되 다음 조작을 기다리게 하지 않는다
});
