import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { collectErrors, srcBody } from './helpers.js';

// ── 엔진: 자유 공간 (F1 — docs/engine.md 2절 "자유 공간", spec-grade6 15-19 결정 3) ──
// 자유 단계(free: true)는 단계 지도 맨 위의 넓은 카드 한 장이고, 차시·번호·별·잠금·진도·점수·학습 기록에 들지 않는다.
// 영역을 쓰지 않는 게임(이 시험 페이지)은 단계 지도 맨 위, 영역을 쓰는 게임은 그 영역의 지도 맨 위(net-workshop-blocks-free.spec.js)
const PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/src/shared/styles/base.css"></head><body><div id="app"></div>
<script type="module">
import { createGameApp } from '/src/shared/ui/app.js';
createGameApp({
  root: document.getElementById('app'),
  game: { id: 'free-test', title: '자유 시험 공방', summary: '자유 공간을 시험해요.', grades: [6], subject: '수학' },
  howTo: ['눌러 보세요'],
  lessons: [{ id: 'a', title: '첫째 차시' }, { id: 'b', title: '둘째 차시' }],
  collections: [{ id: 'shapes', title: '모양 도감', lesson: 'a', items: [{ id: 'tri', name: '세모' }, { id: 'sq', name: '네모' }] }],
  stages: [
    { id: 'a1', lesson: 'a', title: '첫 단계', goal: '버튼을 눌러 답해요.' },
    { id: 'a2', lesson: 'a', title: '둘째 단계', goal: '한 번 더 답해요.' },
    { id: 'b1', lesson: 'b', title: '셋째 단계', goal: '또 답해요.' },
    { id: 'f1', free: true, title: '자유 놀이', goal: '마음대로 살펴봐요.', thumb: (h) => h('span', { class: 'test-free-art' }, '그림') },
  ],
  playStage(stage, ctx) {
    const { h } = ctx;
    const b = (label, fn) => h('button', { type: 'button', class: 'btn', onclick: fn }, label);
    ctx.el.append(h('div', { class: 'actions' },
      b('맞힘', () => ctx.log.answer({ itemId: 'q1', correct: true })),
      b('설명', () => { window.lastXp = ctx.reward.event('explain', { correct: true, itemId: 'q1' }); }),
      b('세모 찾기', () => { window.lastCollect = ctx.collect('shapes', 'tri'); }),
      b('끝내기', () => ctx.finish({ stars: 3 })),
    ));
  },
}).start();
</script></body></html>`;
const URL = 'http://engine.test/free.html';

test.beforeEach(async ({ page }) => {
  await page.route('http://engine.test/**', async (route) => {
    const { pathname } = new globalThis.URL(route.request().url());
    if (pathname === '/free.html') return route.fulfill({ contentType: 'text/html', body: PAGE });
    const file = path.resolve(`.${pathname}`);
    const contentType = file.endsWith('.css') ? 'text/css' : 'text/javascript';
    return route.fulfill({ contentType, body: srcBody(file, await readFile(file, 'utf8')) });
  });
});

const stored = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('edu:free-test:')).map((k) => [k.slice('edu:free-test:'.length), localStorage.getItem(k)])));

test('자유 공간 카드: 단계 지도 맨 위에 한 장(그림·제목·목표·[들어가기]) — 번호·별·잠금·"여기부터!" 없음, 모은 별은 일반 단계만(0 / 9), 한 차시 주소에는 없다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${URL}?sound=off`);
  await page.getByRole('button', { name: '시작하기' }).click();
  const list = page.getByRole('list', { name: '혼자 탐구하는 곳' });
  await expect(list.locator('.free-space-card')).toHaveCount(1);
  const card = page.locator('.free-space-card');
  await expect(card).toHaveAttribute('data-stage', 'f1');
  await expect(card).toHaveAccessibleName('자유 놀이 마음대로 살펴봐요.');
  await expect(card.locator('.test-free-art')).toHaveText('그림');
  await expect(card.locator('.go-pill')).toHaveText('들어가기');
  await expect(card.locator('.stage-medal, .stars, .star, .stage-lock, .flag, .lesson-no')).toHaveCount(0);
  await expect(page.locator('.flag')).toHaveCount(2); // "여기부터!"는 두 차시의 첫 단계에만(자유 카드에는 없다)
  // 자유 카드가 차시 판들보다 위
  const order = await page.evaluate(() => [...document.querySelectorAll('.free-space-list, .lesson-group')].map((el) => (el.classList.contains('free-space-list') ? 'free-space-list' : 'lesson-group')));
  expect(order).toEqual(['free-space-list', 'lesson-group', 'lesson-group']);
  await expect(page.locator('.lesson-group')).toHaveCount(2);
  await expect(page.locator('.lesson-no')).toHaveText(['1차시', '2차시']); // 자유 단계가 차시 번호를 밀지 않는다
  await expect(page.locator('.star-total')).toHaveText('모은 별 0 / 9');
  await expect(page.locator('.stage-card')).toHaveCount(3);
  // 한 차시 주소: 자유 카드 없음
  await page.goto(`${URL}?sound=off&lesson=a`);
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.lesson-group')).toHaveCount(1);
  await expect(page.locator('.free-space-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('자유 단계 플레이: 머리에 연속·솜씨 점수 칸 없음. 답·설명·도감·끝내기가 아무것도 남기지 않고(학습 기록·별·점수·도감 그대로), 끝내기·[← 단계 선택]은 단계 지도로', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${URL}?sound=off`);
  await page.getByRole('button', { name: '시작하기' }).click();
  const before = await stored(page);
  await page.locator('.free-space-card').focus();
  await page.keyboard.press('Enter'); // 키보드로도 들어간다
  await expect(page.locator('.screen-play.is-free .play-title')).toHaveText('자유 놀이');
  await expect(page.locator('.play-goal')).toHaveText('마음대로 살펴봐요.');
  await expect(page.locator('.play-chip')).toHaveCount(0); // "0단계" 같은 칩이 없다
  await expect(page.locator('.meta-xp, .meta-streak')).toHaveCount(0);
  await expect(page.locator('.meta-progress')).toBeHidden();
  for (const name of ['맞힘', '맞힘', '맞힘', '설명', '세모 찾기']) await page.getByRole('button', { name, exact: true }).click();
  expect(await page.evaluate(() => window.lastXp)).toBe(0);
  expect(await page.evaluate(() => window.lastCollect)).toEqual({ isNew: false, count: 0, total: 2 });
  await expect(page.locator('.rank-chip')).toContainText('0점');
  await page.getByRole('button', { name: '끝내기' }).click();
  await expect(page.locator('.free-space-card')).toBeVisible(); // 결과 화면 없이 단계 지도
  await expect(page.locator('.screen-result')).toHaveCount(0);
  await expect(page.locator('.star-total')).toHaveText('모은 별 0 / 9');
  expect(await stored(page)).toEqual(before); // 학습 기록(log)·진도·점수·도감 어느 것도 바뀌지 않았다
  // [← 단계 선택]도 단계 지도로, 그 뒤 보통 단계는 지금처럼 기록된다
  await page.locator('.free-space-card').click();
  await page.getByRole('button', { name: '← 단계 선택' }).click();
  await expect(page.locator('.free-space-card')).toBeVisible();
  expect(await stored(page)).toEqual(before);
  await page.locator('.stage-card').first().click();
  await page.getByRole('button', { name: '맞힘', exact: true }).click();
  await page.getByRole('button', { name: '끝내기' }).click();
  await expect(page.locator('.screen-result')).toBeVisible();
  expect(Object.keys(await stored(page))).toEqual(expect.arrayContaining(['log', 'stars']));
  expect(errors).toEqual([]);
});

test('?stage=<자유 단계 id>: ?unlock=all 없이도 바로 열린다(늘 열려 있다). 없는 id는 처음 화면', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${URL}?sound=off&stage=f1`);
  await expect(page.locator('.screen-play.is-free .play-title')).toHaveText('자유 놀이');
  await page.getByRole('button', { name: '← 단계 선택' }).click();
  await expect(page.locator('.free-space-card')).toBeVisible();
  await page.goto(`${URL}?sound=off&stage=nope`);
  await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible();
  expect(errors).toEqual([]);
});
