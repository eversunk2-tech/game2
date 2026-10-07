import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitTitleMark } from '../../src/shared/core/title-mark.js';
import { gradeLabel, starHint, stageStates } from '../../src/shared/ui/app.js';
import { anchorPlacement } from '../../src/shared/ui/feedback.js';
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
  // 요소가 화면 위쪽에 있어도 너무 높이 뜨지 않는다
  assert.equal(anchorPlacement({ left: 0, right: 800, top: -500, bottom: 40, width: 800, height: 540 }, viewport).bottom, 648);
});

test('아이콘: 기획서 2-6절 이름이 모두 있고, 그림 요소 형식이 맞다', () => {
  const names = 'back, sound, mute, lock, check, cross, rotl, rotr, play, unfold, bulb, book, stamp, spark, clock, user, target, search, cube, trash, undo, hand, shield, grid, flag, arrow, copy, home'.split(', ');
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
