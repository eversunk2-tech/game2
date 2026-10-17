import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planFooter, planTeacherGuide } from '../../src/shared/ui/app.js';

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
