import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { AREA_KEY, areaLabel, areaLine, areaOfLesson, lessonNumberInArea, planAreas, startAreaId } from '../../src/shared/core/areas.js';
import { lessonChipText } from '../../src/shared/ui/app.js';
import { loadGames } from '../../scripts/lib/games.mjs';

// 영역(선택 기능, docs/engine.md 2절 "영역"): 차시 묶음을 영역으로 나눈다. 쓰지 않는 게임은 지금과 같다

const LESSONS = [{ id: 'cube', title: '정육면체' }, { id: 'cuboid', title: '직육면체' }, { id: 'look', title: '어느 방향' }, { id: 'top', title: '위에서 본 모양' }];
/** 엔진의 planLessons가 넘기는 것처럼: 단계가 있는 차시 묶음(차시 순서) */
const groupsOf = (ids) => ids.map((id) => ({ lesson: LESSONS.find((l) => l.id === id), stages: [{ id: `${id}-1` }] }));
const AREAS = [
  { id: 'net5', title: '5학년 전개도', grades: [5], note: '정육면체ㆍ직육면체', lessons: ['cube', 'cuboid'] },
  { id: 'net6', title: '6학년 전개도', grades: [6], note: '각기둥ㆍ원기둥', lessons: ['prism', 'cylinder'] },
  { id: 'blocks', title: '쌓기나무', grades: [6], note: '6학년 2학기 · 공간과 입체', lessons: ['look', 'top', 'three', 'number'] },
];

test('영역을 쓰지 않으면 null (지금과 같다)', () => {
  assert.equal(planAreas(null, groupsOf(['cube']), LESSONS), null);
  assert.equal(planAreas(undefined, groupsOf(['cube']), LESSONS), null);
  assert.equal(planAreas([], groupsOf(['cube']), LESSONS), null);
});

test('보이는 영역: 차시가 없는 영역(6학년 전개도)은 빠지고, 영역에 적힌 없는 차시(three·number)는 조용히 건너뛴다', () => {
  const plan = planAreas(AREAS, groupsOf(['cube', 'cuboid', 'look', 'top']), LESSONS);
  assert.deepEqual(plan.map((e) => e.area.id), ['net5', 'blocks']);
  assert.deepEqual(plan.map((e) => e.groups.map((g) => g.lesson.id)), [['cube', 'cuboid'], ['look', 'top']]);
  // 차시가 만들어지면 저절로 보인다: 영역에 미리 적어 둔 차시가 생기면 그 영역에 들어간다
  const later = planAreas(AREAS, groupsOf(['cube', 'cuboid', 'look', 'top']).concat([{ lesson: { id: 'three', title: '세 방향' }, stages: [{ id: 'three-1' }] }]),
    [...LESSONS, { id: 'three', title: '세 방향' }]);
  assert.deepEqual(later.find((e) => e.area.id === 'blocks').groups.map((g) => g.lesson.id), ['look', 'top', 'three']);
  // 영역 안의 차례는 영역의 lessons 순서
  const swapped = planAreas([{ id: 'a', title: 'A', lessons: ['cuboid', 'cube'] }, { id: 'b', title: 'B', lessons: ['look', 'top'] }], groupsOf(['cube', 'cuboid', 'look', 'top']), LESSONS);
  assert.deepEqual(swapped[0].groups.map((g) => g.lesson.id), ['cuboid', 'cube']);
});

test('영역 정의의 실수는 오류: id·title 없음, id 겹침, 두 영역에 든 차시, 어느 영역에도 없는 차시, lessons 없이 areas, art가 함수가 아님', () => {
  const groups = groupsOf(['cube', 'cuboid', 'look', 'top']);
  assert.throws(() => planAreas([{ title: 'A', lessons: ['cube'] }], groups, LESSONS), /id와 title/);
  assert.throws(() => planAreas([{ id: 'a', lessons: ['cube'] }], groups, LESSONS), /id와 title/);
  assert.throws(() => planAreas([{ id: 'a', title: 'A', lessons: ['cube', 'cuboid', 'look', 'top'] }, { id: 'a', title: 'B', lessons: [] }], groups, LESSONS), /겹쳐요/);
  assert.throws(() => planAreas([{ id: 'a', title: 'A', lessons: ['cube', 'cuboid'] }, { id: 'b', title: 'B', lessons: ['cuboid', 'look', 'top'] }], groups, LESSONS), /두 영역/);
  assert.throws(() => planAreas([{ id: 'a', title: 'A', lessons: ['cube', 'cuboid', 'look'] }], groups, LESSONS), /top.*어느 영역에도/);
  assert.throws(() => planAreas([{ id: 'a', title: 'A', lessons: ['cube'] }], groupsOf(['cube']), null), /lessons/);
  assert.throws(() => planAreas([{ id: 'a', title: 'A' }], groups, LESSONS), /lessons/);
  assert.throws(() => planAreas([{ id: 'a', title: 'A', lessons: ['cube', 'cuboid', 'look', 'top'], art: '그림' }], groups, LESSONS), /art/);
  assert.throws(() => planAreas('net5', groups, LESSONS), /배열/);
});

test('차시가 든 영역과 영역 안의 차례 ("n차시")', () => {
  const plan = planAreas(AREAS, groupsOf(['cube', 'cuboid', 'look', 'top']), LESSONS);
  assert.equal(areaOfLesson(plan, 'top').area.id, 'blocks');
  assert.equal(areaOfLesson(plan, 'cuboid').area.id, 'net5');
  assert.equal(areaOfLesson(plan, 'prism'), null);
  assert.equal(areaOfLesson(null, 'cube'), null);
  assert.equal(lessonNumberInArea(plan, 'cube'), 1);
  assert.equal(lessonNumberInArea(plan, 'cuboid'), 2);
  assert.equal(lessonNumberInArea(plan, 'look'), 1);
  assert.equal(lessonNumberInArea(plan, 'top'), 2);
  assert.equal(lessonNumberInArea(plan, 'zzz'), null);
  assert.equal(lessonNumberInArea(null, 'cube'), null);
});

test('"여기부터!" 영역: 저장된 지난 영역이 보이는 영역이면 그것, 아니면(처음·옛 저장 값·없는 영역·깨진 값) 첫 영역', () => {
  const plan = planAreas(AREAS, groupsOf(['cube', 'cuboid', 'look', 'top']), LESSONS);
  assert.equal(AREA_KEY, 'area');
  assert.equal(startAreaId(plan, 'blocks'), 'blocks');
  assert.equal(startAreaId(plan, 'net5'), 'net5');
  for (const saved of [null, undefined, '', 'net6', 'zzz', 3, { id: 'blocks' }, ['blocks']]) assert.equal(startAreaId(plan, saved), 'net5');
  assert.equal(startAreaId(null, 'blocks'), null);
});

test('영역 카드의 한 줄과 화면 읽기 이름', () => {
  assert.equal(areaLine(AREAS[0]), '정육면체ㆍ직육면체'); // 이름에 학년이 있다
  assert.equal(areaLine(AREAS[2]), '6학년 2학기 · 공간과 입체'); // 한 줄에 학년이 있다
  assert.equal(areaLine({ title: '쌓기나무', grades: [6], note: '공간과 입체' }), '6학년 · 공간과 입체');
  assert.equal(areaLine({ title: '쌓기나무', grades: [6] }), '6학년');
  assert.equal(areaLine({ title: '쌓기나무' }), '');
  assert.equal(areaLabel(AREAS[0], { lessons: 2, stars: 0, maxStars: 24 }), '5학년 전개도, 정육면체ㆍ직육면체, 차시 2개, 모은 별 0 / 24');
  assert.equal(areaLabel(AREAS[2], { lessons: 2, stars: 7, maxStars: 18, here: true }), '쌓기나무, 6학년 2학기 · 공간과 입체, 차시 2개, 모은 별 7 / 18, 여기부터');
});

test('차시 칩: 영역의 단계 지도는 chip을 쓰지 않고 영역 안의 차례 "n차시", 그 밖(한 차시 주소·영역 없는 게임)은 지금처럼 chip', () => {
  const lesson = { id: 'look', title: '어느 방향', chip: '쌓기나무 1차시' };
  assert.equal(lessonChipText(lesson, 1, { useChip: false }), '1차시');
  assert.equal(lessonChipText(lesson, 3), '쌓기나무 1차시');
  assert.equal(lessonChipText({ id: 'cube' }, 1, { useChip: false }), '1차시');
});

test('입체도형 공방(net-workshop) 게임 정보: 새 이름·쌓기나무 문장·단원 "6-2 공간과 입체"·성취기준은 빈 칸 그대로, 표지에 전개도 조각과 쌓기나무 세 개', async () => {
  const games = await loadGames(new URL('../../src/games/', import.meta.url).pathname);
  const game = games.find((g) => g.dirName === 'net-workshop');
  assert.deepEqual(game.errors, []);
  assert.equal(game.meta.id, 'net-workshop'); // id·주소·저장 열쇠는 그대로
  assert.equal(game.meta.title, '입체도형 공방');
  assert.match(game.meta.summary, /쌓기나무/);
  assert.deepEqual(game.meta.units, ['5-2 직육면체·정육면체', '6-1 각기둥·각뿔', '6-2 공간과 입체', '6-2 원기둥·원뿔·구']);
  assert.deepEqual(game.meta.standards, []);
  const cover = await readFile(new URL('../../src/games/net-workshop/cover.svg', import.meta.url), 'utf8');
  assert.equal((cover.match(/<rect /g) ?? []).length, 6); // 전개도 조각 6장
  assert.equal((cover.match(/<polygon /g) ?? []).length, 9); // 쌓기나무 3개 × 보이는 면 3
  const html = await readFile(new URL('../../src/games/net-workshop/index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>입체도형 공방<\/title>/);
});
