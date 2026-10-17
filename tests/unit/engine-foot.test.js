import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FOOT_EDGE, FOOT_EDGE_TEXT, FOOT_GAP, FOOT_GAP_ART, FOOT_GAP_TEXT, footPlacement, planFooter, planTeacherGuide } from '../../src/shared/ui/app.js';

// 처음 화면·학년 화면의 맨 아래 줄(선택 기능 — spec-grade6 15-13 [선생님용 안내] · 15-14 저작권 글, docs/engine.md 2절 "맨 아래 줄").
// 주지 않는 게임(예시 게임·템플릿)은 화면이 지금과 같다(브라우저 검사: tests/e2e/site-front.spec.js)

test('teacherGuide: 같은 사이트의 상대 주소만 받는다(하위 경로·두 사이트에서 함께 열리게). 없으면 null', () => {
  for (const v of [null, undefined, false]) assert.equal(planTeacherGuide(v), null);
  assert.equal(planTeacherGuide('./teacher.html'), './teacher.html');
  assert.equal(planTeacherGuide('  teacher.html  '), 'teacher.html');
  assert.equal(planTeacherGuide('../guide/teacher.html'), '../guide/teacher.html');
  for (const bad of ['', '   ', '/teacher.html', '//example.com/t.html', 'https://example.com/t.html', 'http:teacher.html', 'javascript:alert(1)', 'data:,x', 'teacher page.html', 3, {}, true]) {
    assert.throws(() => planTeacherGuide(bad), /teacherGuide/, String(bad));
  }
});

test('footer: 글자 한 줄(앞뒤 빈칸 뺌). 없으면 null, 빈 글자·글자가 아닌 값은 오류', () => {
  for (const v of [null, undefined, false]) assert.equal(planFooter(v), null);
  assert.equal(planFooter(' © 2026 PSC. All rights reserved. '), '© 2026 PSC. All rights reserved.');
  for (const bad of ['', '  ', 1, ['a'], {}, true]) assert.throws(() => planFooter(bad), /footer/, String(bad));
});

/** 상자 { left, top, right, bottom } */
const box = (left, top, right, bottom, gap) => ({ left, top, right, bottom, ...(gap == null ? {} : { gap }) });

test('맨 아래 줄의 자리: 틈(둘 가운데 작은 쪽 — 버튼·카드·글 8px, 저작권 글 4px, 꾸밈 그림 2px)보다 가까우면 겹친 것(below — 엔진은 다른 자리를 찾는다), 아니면 그 자리(bottom)', () => {
  assert.deepEqual([FOOT_GAP, FOOT_GAP_TEXT, FOOT_GAP_ART, FOOT_EDGE, FOOT_EDGE_TEXT], [8, 4, 2, 4, 2]);
  const button = box(1110, 628, 1266, 676); // 1366×680의 [선생님용 안내]
  const note = box(930, 643, 1140, 661); // 그 왼쪽 저작권 글
  // 왼쪽 글 칸(아래 끝 639)·오른쪽 그림 칸의 자(아래 끝 619): 가로로 겹치지 않거나 틈이 넉넉하다
  assert.equal(footPlacement([note, button], [box(91, 92, 691, 639), box(765, 575, 1185, 619, FOOT_GAP_ART)]), 'bottom');
  // 카드·버튼과 8px보다 가까우면 아래로
  assert.equal(footPlacement([button], [box(1100, 560, 1270, 621)]), 'below', '틈 7px');
  assert.equal(footPlacement([button], [box(1100, 560, 1270, 620)]), 'bottom', '틈 8px');
  // 꾸밈 그림은 2px까지 가까워도 된다(기울어진 자의 상자는 실제 그림보다 크다)
  assert.equal(footPlacement([button], [box(1100, 560, 1270, 627, FOOT_GAP_ART)]), 'below', '틈 1px');
  assert.equal(footPlacement([button], [box(1100, 560, 1270, 626, FOOT_GAP_ART)]), 'bottom', '틈 2px');
  // 가로로 떨어져 있으면 세로로 겹쳐도 상관없다(왼쪽 글 칸 아래 끝이 줄보다 낮아도)
  assert.equal(footPlacement([button], [box(91, 400, 691, 700)]), 'bottom');
  assert.equal(footPlacement([button], [box(1109, 400, 1111, 700)]), 'below', '가로로 1px 겹침');
  assert.equal(footPlacement([button], [box(1266, 400, 1300, 700)]), 'bottom', '가로로 맞닿기만');
  // 줄의 어느 하나라도 겹치면 아래로, 내용이 없으면 맨 아래
  assert.equal(footPlacement([note, button], [box(900, 600, 1000, 640)]), 'below');
  assert.equal(footPlacement([note, button], []), 'bottom');
  // 내용이 줄보다 아래에 있어도(휴대폰처럼 내용이 화면보다 길 때) 겹치면 아래로
  assert.equal(footPlacement([button], [box(0, 0, 1366, 1200)]), 'below');
  // 저작권 글(누르지 않는 작은 글)은 카드와 4px까지 가까워도 된다 — 버튼은 8px
  const text = box(797, 582, 1004, 598, FOOT_GAP_TEXT); // 1024×600의 저작권 글(줄에 글만)
  assert.equal(footPlacement([text], [box(28, 427, 845, 578)]), 'bottom', '틈 4px');
  assert.equal(footPlacement([text], [box(28, 427, 845, 579)]), 'below', '틈 3px');
  assert.equal(footPlacement([box(797, 582, 1004, 630)], [box(28, 427, 845, 578)]), 'below', '버튼은 틈 4px이면 겹침');
  // 둘 가운데 작은 쪽: 저작권 글과 꾸밈 그림은 2px
  assert.equal(footPlacement([text], [box(900, 400, 1000, 580, FOOT_GAP_ART)]), 'bottom');
  assert.equal(footPlacement([text], [box(900, 400, 1000, 581, FOOT_GAP_ART)]), 'below');
});
