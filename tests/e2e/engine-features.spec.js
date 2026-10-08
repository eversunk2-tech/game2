import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { collectErrors } from './helpers.js';

// ── 엔진 기능 시험 페이지 ──────────────────────────
// src/를 그대로(빌드 없이) 띄워 엔진 기능을 하나씩 확인한다:
// heroArt·thumb·chip·feedback.anchor(D1), 솜씨 점수·도장·도감·도전 주문서·축하 연출·rewards.off(D2)
// ?off 를 붙이면 rewards: { off: true }
const ENGINE_PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/src/shared/styles/base.css"></head><body><div id="app"></div>
<script type="module">
import { createGameApp } from '/src/shared/ui/app.js';
const off = new URLSearchParams(location.search).has('off');
const NS = 'http://www.w3.org/2000/svg';
const box = (color) => {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 40 30');
  s.setAttribute('class', 'test-thumb');
  const r = document.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({ x: 5, y: 5, width: 30, height: 20, fill: color })) r.setAttribute(k, String(v));
  s.append(r);
  return s;
};
createGameApp({
  root: document.getElementById('app'),
  game: { id: 'engine-test', title: '엔진 시험 공방', summary: '엔진 기능을 시험해요.', grades: [5], subject: '수학', playMinutes: 10, color: '#2f6f5e' },
  howTo: ['눌러 보세요'],
  heroArt: (h) => h('div', { class: 'test-art' }, '그림'),
  lessons: [{ id: 'a', title: '첫째 차시' }],
  collections: [{ id: 'shapes', title: '모양 도감', lesson: 'a', items: [
    { id: 'tri', name: '세모', thumb: () => box('#ffd86b') }, { id: 'sq', name: '네모' }, { id: 'ci', name: '동그라미' }] }],
  rewards: off ? { off: true } : { badges: [{ id: 'finder', title: '모양 탐정', desc: '모양 2가지를 찾아요', icon: 'search', test: (s) => s.collections.shapes.count >= 2 }] },
  stages: [
    { id: 'a1', lesson: 'a', title: '첫 단계', goal: '버튼을 눌러 답해요.', chip: '검사 주문', thumb: () => box('#8ec5ff') },
    { id: 'ch1', lesson: 'a', title: '주사위 주문', goal: '시간 재기를 켤 수 있어요.', challenge: true, timer: 'optional' },
    { id: 'a2', lesson: 'a', title: '둘째 단계', goal: '한 번 더 답해요.' },
    { id: 'ch2', lesson: 'a', title: '도감 주문', goal: '모양을 모두 찾아요.', challenge: true },
  ],
  playStage(stage, ctx) {
    const { h } = ctx;
    let item = 1;
    const stageBox = h('div', { class: 'test-stage', style: { height: '220px', border: '2px solid', borderRadius: '12px' } }, '무대');
    const b = (label, fn) => h('button', { type: 'button', class: 'btn', onclick: fn }, label);
    ctx.feedback.anchor(stageBox);
    ctx.el.append(stageBox, h('div', { class: 'actions' },
      b('맞힘', () => { ctx.log.answer({ itemId: 'q' + item, correct: true }); item += 1; }),
      b('틀림', () => { ctx.log.answer({ itemId: 'q' + item, correct: false, tag: '시험 오개념' }); }),
      b('다음 문제', () => { item += 1; }),
      b('설명 맞힘', () => { window.lastXp = ctx.reward.event('explain', { correct: true, itemId: 'e' + item }); }),
      b('세모 찾기', () => { window.lastCollect = ctx.collect('shapes', 'tri'); }),
      b('네모 찾기', () => { window.lastCollect = ctx.collect('shapes', 'sq'); }),
      b('축하', () => { window.made = ctx.feedback.celebrate({ kind: 'discover', at: stageBox, text: '축하해요' }); }),
      b('알림', () => { ctx.feedback.info('무대 아래 알림이에요'); }),
      b('끝내기', () => { ctx.finish(); }),
      b('솜씨 칸으로 끝내기', () => { ctx.finish({ highlights: [{ icon: 'target', label: '예측 적중', value: '4 / 5', xp: 8 }, { icon: '없는-아이콘', label: '새 모양', value: '2가지', xp: 10 }] }); }),
      b('실패로 끝내기', () => { ctx.finish({ cleared: false }); }),
    ));
  },
}).start();
</script></body></html>`;

const URL = 'http://engine.test/engine.html';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }));
  await page.route('http://engine.test/**', async (route) => {
    const { pathname } = new globalThis.URL(route.request().url());
    if (pathname === '/engine.html') return route.fulfill({ contentType: 'text/html', body: ENGINE_PAGE });
    const file = path.resolve(`.${pathname}`);
    const contentType = file.endsWith('.css') ? 'text/css' : 'text/javascript';
    return route.fulfill({ contentType, body: await readFile(file, 'utf8') });
  });
});

const btn = (page, name) => page.getByRole('button', { name, exact: true });

test('heroArt·단계 thumb·chip: 게임이 준 그림과 칩 글자가 들어간다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(page.locator('.hero-mat.has-art .test-art')).toHaveText('그림');
  await expect(page.locator('.hero-art')).toHaveAttribute('aria-hidden', 'true');
  await btn(page, '시작하기').click();
  await expect(page.locator('.stage-path .stage-card').first().locator('.stage-thumb svg.test-thumb')).toHaveCount(1);
  await expect(page.locator('.stage-path .stage-card').nth(1).locator('.stage-thumb')).toHaveCount(0);
  await page.locator('.stage-path .stage-card').first().click();
  await expect(page.locator('.play-chip')).toHaveText('검사 주문');
  await btn(page, '끝내기').click();
  await btn(page, '다음 단계').click();
  await expect(page.locator('.play-chip')).toHaveText('2단계');
  expect(errors).toEqual([]);
});

test('feedback.anchor: 넓은 화면에서 알림을 무대 아래쪽 가운데에, 화면이 바뀌면 기본 자리로', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '넓은 화면(901px 이상)에서 확인');
  await page.goto(`${URL}?stage=a1`);
  await btn(page, '알림').click();
  await expect(page.locator('.toast-info')).toBeVisible();
  await expect(page.locator('.toast-host')).toHaveClass(/is-anchored/);
  const toast = await page.locator('.toast').boundingBox();
  const stage = await page.locator('.test-stage').boundingBox();
  expect(Math.abs(toast.x + toast.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(2);
  expect(toast.y + toast.height).toBeLessThanOrEqual(stage.y + stage.height);
  await btn(page, '← 단계 선택').click();
  await expect(page.locator('.toast-host')).not.toHaveClass(/is-anchored/);
});

test('플레이 머리: 이번 판 솜씨 점수와 연속(2 이상일 때만), 다시 일어서기 점수', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '휴대폰·태블릿 폭과 상관없는 점수 계산은 한 번만');
  await page.goto(`${URL}?stage=a1&sound=off`);
  const xp = page.locator('.meta-xp b');
  const streak = page.locator('.meta-streak');
  await expect(xp).toHaveText('+0');
  await expect(streak).toBeHidden();
  await btn(page, '맞힘').click();
  await expect(xp).toHaveText('+2');
  await expect(streak).toBeHidden();
  await btn(page, '맞힘').click();
  await expect(streak).toHaveText('연속 2');
  await btn(page, '맞힘').click(); // 연속 3 → +1
  await expect(xp).toHaveText('+7');
  await btn(page, '틀림').click();
  await expect(streak).toBeHidden(); // 틀리면 조용히 0
  await expect(xp).toHaveText('+7');
  await btn(page, '맞힘').click(); // 같은 문항 다시 도전 +1
  await btn(page, '맞힘').click(); // 다음 문항 처음 +2, 다시 일어서기 +1
  await expect(xp).toHaveText('+11');
  await btn(page, '설명 맞힘').click();
  await expect(xp).toHaveText('+13');
  await btn(page, '설명 맞힘').click(); // 같은 문항 설명은 한 번만
  await expect(xp).toHaveText('+13');
  expect(await page.evaluate(() => window.lastXp)).toBe(0);
});

test('다시 하기 점수: 별 3개 단계를 다시 하면 연습 점수 0(칭호 칩 그대로), 새로 찾음 +5는 그대로, 별 3개가 안 된 단계는 점수가 있다', async ({ page }) => {
  const errors = collectErrors(page);
  const NOTE = '별 3개를 받은 단계라 연습 점수는 없어요. 새로 찾으면 점수를 받아요.';
  await page.goto(URL);
  await page.evaluate(() => {
    localStorage.setItem('edu:engine-test:stars', JSON.stringify({ a1: 3, a2: 2 }));
    localStorage.setItem('edu:engine-test:rewards', JSON.stringify({ v: 1, xp: 20 }));
  });
  const xp = page.locator('.meta-xp b');
  const chip = page.locator('.rank-chip small');
  const storedXp = () => page.evaluate(() => JSON.parse(localStorage.getItem('edu:engine-test:rewards')).xp);

  // 별 3개 단계(a1) 다시 하기: 맞힘·다시 도전·다시 일어서기·연속·설명 모두 점수 없음. "연속 n" 글자는 보여도 된다
  await page.goto(`${URL}?stage=a1&sound=off`);
  await expect(chip).toHaveText('20점');
  for (let i = 0; i < 3; i += 1) await btn(page, '맞힘').click();
  await expect(page.locator('.meta-streak')).toHaveText('연속 3');
  await btn(page, '틀림').click();
  await btn(page, '맞힘').click(); // 다시 도전
  await btn(page, '맞힘').click(); // 다시 일어서기
  await btn(page, '설명 맞힘').click();
  expect(await page.evaluate(() => window.lastXp)).toBe(0);
  await expect(xp).toHaveText('+0');
  await expect(chip).toHaveText('20점');
  // 처음 찾은 도감 칸은 별 3개 단계에서도 +5 (한 번만)
  await btn(page, '세모 찾기').click();
  await expect(xp).toHaveText('+5');
  await expect(chip).toHaveText('25점');
  await btn(page, '세모 찾기').click();
  await expect(xp).toHaveText('+5');
  await btn(page, '끝내기').click();
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.locator('.practice-note')).toHaveText(NOTE);
  await expect(page.locator('.rank-card .xp-gain')).toHaveText('+5');
  await expect(page.locator('.behavior', { hasText: '처음에 맞힘' }).locator('.b-xp')).toHaveText('+0');
  await expect(page.locator('.behavior', { hasText: '설명 맞힘' }).locator('.b-xp')).toHaveText('+0');
  await expect(page.locator('.behavior', { hasText: '새로 찾음' }).locator('.b-xp')).toHaveText('+5');
  await expect(page.locator('[role="status"]')).toContainText(NOTE);
  await expect(chip).toHaveText('25점');
  expect(await storedXp()).toBe(25);

  // 같은 단계를 또 다시 해도 그대로
  await btn(page, '다시 하기').click();
  await btn(page, '맞힘').click();
  await btn(page, '설명 맞힘').click();
  await expect(xp).toHaveText('+0');
  await btn(page, '끝내기').click();
  await expect(page.locator('.practice-note')).toBeVisible();
  await expect(page.locator('.rank-card .xp-gain')).toHaveText('+0');
  await expect(chip).toHaveText('25점');
  expect(await storedXp()).toBe(25);

  // 별 2개 단계(a2): 지금처럼 점수가 있고, 이번 판에 처음 별 3개를 받아도 이번 판 점수는 준다
  await page.goto(`${URL}?stage=a2&sound=off`);
  await btn(page, '맞힘').click();
  await expect(xp).toHaveText('+2');
  await btn(page, '설명 맞힘').click();
  await expect(xp).toHaveText('+4');
  await btn(page, '끝내기').click();
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  await expect(page.locator('.practice-note')).toHaveCount(0);
  await expect(page.locator('.rank-card .xp-gain')).toHaveText('+6'); // 연습 4 + 별 1개 더 +2
  expect(await storedXp()).toBe(31);
  // 이제 별 3개가 됐으니 다음 판부터는 연습 점수 없음
  await btn(page, '다시 하기').click();
  await btn(page, '맞힘').click();
  await expect(xp).toHaveText('+0');
  await btn(page, '끝내기').click();
  await expect(page.locator('.practice-note')).toHaveText(NOTE);
  expect(await storedXp()).toBe(31);
  expect(errors).toEqual([]);
});

test('도전 주문서: 차시의 일반 단계를 모두 마치면 열리고, 다음 단계를 막지 않으며, 별 합계에 넣지 않는다. 시간 재기는 켜는 학생만', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${URL}?sound=off`);
  await btn(page, '시작하기').click();
  const regular = page.locator('.stage-path .stage-card');
  const challenges = page.locator('.challenge-card');
  await expect(page.locator('.stage-card')).toHaveCount(4); // 일반 2 + 도전 2 (일반 단계가 먼저)
  await expect(page.locator('.stage-card').nth(0)).toContainText('첫 단계');
  await expect(page.locator('.stage-card').nth(1)).toContainText('둘째 단계');
  await expect(regular.nth(1)).toBeDisabled();
  await expect(challenges).toHaveCount(2);
  await expect(challenges.nth(0)).toBeDisabled();
  await expect(challenges.nth(0)).toContainText('차시를 마치면 열려요');
  await expect(page.getByText('모은 별 0 / 6')).toBeVisible();

  await regular.first().click();
  for (let i = 0; i < 4; i += 1) await btn(page, '맞힘').click();
  await btn(page, '끝내기').click();
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await btn(page, '다음 단계').click(); // 도전 단계를 건너뛰고 둘째 단계
  await expect(page.getByRole('heading', { name: '둘째 단계' })).toBeVisible();
  await btn(page, '맞힘').click();
  await btn(page, '끝내기').click();
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  await expect(page.locator('.opened-chip')).toHaveText('도전 주문서 2개가 열렸어요');
  await expect(page.locator('.new-badge')).toContainText('차시 완주');

  await btn(page, '단계 선택').click();
  await expect(page.getByText('모은 별 6 / 6')).toBeVisible();
  await expect(challenges.nth(0)).toBeEnabled();
  await challenges.nth(0).click();
  await expect(page.locator('.play-chip')).toHaveText('도전 주문서');
  const toggle = btn(page, '시간 재기');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.timer-clock')).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.timer-clock')).toBeVisible();
  await btn(page, '맞힘').click();
  await expect(toggle).toBeDisabled(); // 첫 답 뒤에는 바꿀 수 없다
  await btn(page, '끝내기').click();
  await expect(page.getByRole('heading', { name: '도전 성공!' })).toBeVisible();
  await expect(page.locator('.time-line')).toContainText('(첫 기록이에요)');
  await expect(page.locator('.xp-line')).toContainText('도전 성공 +10');
  await expect(page.getByRole('button', { name: '다음 단계' })).toHaveCount(0);

  await btn(page, '단계 선택').click();
  await expect(page.getByText('모은 별 6 / 6')).toBeVisible(); // 도전 별은 합계에 넣지 않는다
  await expect(challenges.nth(0)).toContainText('내 기록');
  // 시간 재기를 켜지 않으면 기록하지 않는다
  await challenges.nth(1).click();
  await expect(btn(page, '시간 재기')).toHaveCount(0);
  await btn(page, '끝내기').click();
  await expect(page.locator('.time-line')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('도감: 처음 찾으면 새로(+5), 같은 칸은 한 번만. 도감 화면은 찾은 칸 그림·못 찾은 칸 ?, 지우면 0', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${URL}?stage=a1&sound=off`);
  await btn(page, '세모 찾기').click();
  expect(await page.evaluate(() => window.lastCollect)).toEqual({ isNew: true, count: 1, total: 3 });
  await expect(page.locator('[role="status"]')).toHaveText('새로 찾았어요: 세모 (1 / 3)');
  await expect(page.locator('.meta-xp b')).toHaveText('+5');
  await expect(page.locator('.rank-chip')).toContainText('5점'); // 새로 찾음 점수는 바로 저장된다
  await btn(page, '세모 찾기').click();
  expect(await page.evaluate(() => window.lastCollect)).toEqual({ isNew: false, count: 1, total: 3 });
  await expect(page.locator('.meta-xp b')).toHaveText('+5');
  await btn(page, '네모 찾기').click();
  await btn(page, '맞힘').click();
  await btn(page, '솜씨 칸으로 끝내기').click();
  // 게임이 준 "오늘의 솜씨" 칸 (없는 아이콘 이름이어도 그려진다)
  await expect(page.locator('.behavior')).toHaveCount(2);
  await expect(page.locator('.behavior').first()).toContainText('예측 적중');
  await expect(page.locator('.new-badge')).toContainText('모양 탐정');

  await btn(page, '단계 선택').click();
  await expect(page.locator('.lesson-group .lesson-chips')).toContainText('도감 2 / 3');
  await btn(page, '처음 화면').click();
  await expect(page.locator('.workshop-card')).toContainText('도감 2 / 3');
  await btn(page, '학습 기록').click();
  await btn(page, '모양 도감 2 / 3').click();
  await expect(page.getByRole('heading', { name: '도감', exact: true })).toBeVisible();
  await expect(page.locator('.collect-cell.is-found')).toHaveCount(2);
  await expect(page.locator('.collect-cell.is-found .new-tag')).toHaveCount(2);
  await expect(page.locator('.collect-cell.is-found').first().locator('svg.test-thumb')).toHaveCount(1);
  await expect(page.locator('.collect-cell.is-missing')).toHaveCount(1);
  await expect(page.locator('.collect-cell.is-missing')).toContainText('?');
  await expect(page.locator('.collect-cell.is-missing')).not.toContainText('동그라미');

  await btn(page, '학습 기록').click();
  await btn(page, '기록 모두 지우기').click();
  await btn(page, '한 번 더 누르면 지워져요').click();
  await expect(btn(page, '모양 도감 0 / 3')).toBeVisible();
  await expect(page.locator('.tile', { hasText: '칭호·솜씨 점수' })).toContainText('새싹 0점');
  await expect(page.locator('.badge-item.is-earned')).toHaveCount(0);
  await page.goto(`${URL}?sound=off`); // 다시 열어도 0
  await expect(page.locator('.workshop-card')).toContainText('도감 0 / 3');
  await expect(page.locator('.workshop-card')).toContainText('도장 0 / 7');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edu:engine-test:collections')))).toEqual({ shapes: {} });
  expect(errors).toEqual([]);
});

test('ctx.feedback.celebrate: 작은 색종이 8~12개 + 화면 읽기 안내, 1.4초 뒤 지운다', async ({ page }) => {
  await page.goto(`${URL}?stage=a1&sound=off`);
  await btn(page, '축하').click();
  const made = await page.evaluate(() => window.made);
  expect(made).toBeGreaterThanOrEqual(8);
  expect(made).toBeLessThanOrEqual(12);
  await expect(page.locator('.confetti-piece')).toHaveCount(made);
  await expect(page.locator('.confetti-layer')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[role="status"]')).toHaveText('축하해요');
  await expect(page.locator('.confetti-piece')).toHaveCount(0, { timeout: 2000 });
});

test('실패로 끝나면 색종이 없이 "다시 해 봐요" 도장, 답 점수는 받는다', async ({ page }) => {
  await page.goto(`${URL}?stage=a1&sound=off`);
  await btn(page, '맞힘').click();
  await btn(page, '실패로 끝내기').click();
  await expect(page.getByRole('heading', { name: '아쉬워요! 다시 해 볼까요?' })).toBeVisible();
  await expect(page.locator('.result-stamp')).toHaveClass(/stamp-blue/);
  await page.waitForTimeout(800);
  await expect(page.locator('.confetti-piece')).toHaveCount(0);
  await expect(page.locator('.rank-card .xp-gain')).toHaveText('+2');
  await expect(page.locator('.xp-line')).toContainText('별이 처음 늘 때만');
});

test('rewards: { off: true }면 점수·칭호·도장을 모두 숨긴다 (도감은 그대로)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${URL}?off&sound=off`);
  await expect(page.locator('.rank-chip')).toHaveCount(0);
  await expect(page.locator('.workshop-card')).toHaveCount(0);
  await btn(page, '시작하기').click();
  await page.locator('.stage-path .stage-card').first().click();
  await expect(page.locator('.meta-xp')).toHaveCount(0);
  await btn(page, '맞힘').click();
  await btn(page, '세모 찾기').click();
  await btn(page, '끝내기').click();
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.locator('.rank-card, .new-badge, .behavior, .xp-line')).toHaveCount(0);
  await btn(page, '단계 선택').click();
  await btn(page, '처음 화면').click();
  await btn(page, '학습 기록').click();
  await expect(page.locator('.badge-board')).toHaveCount(0);
  await expect(page.locator('.tile', { hasText: '마친 단계' })).toContainText('1 / 2');
  await expect(btn(page, '모양 도감 1 / 3')).toBeVisible();
  expect(errors).toEqual([]);
});

test('결과 연출 중에도 가로 스크롤이 없다: 도장이 크게 시작해 줄어드는 2초 동안 프레임마다 잰다 (태블릿 820×1180에서 25px 넘쳤다, N1-7)', async ({ page }, testInfo) => {
  const sizes = testInfo.project.name === 'chromebook'
    ? [{ width: 1366, height: 768 }, { width: 1000, height: 700 }]
    : [{ width: 820, height: 1180 }, { width: 390, height: 844 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto(`${URL}?stage=a1&sound=off`);
    for (let i = 0; i < 4; i += 1) await btn(page, '맞힘').click();
    // 결과 화면으로 바뀌는 순간부터 2.4초 동안 프레임마다 가로 넘침(scrollWidth − clientWidth)을 모은다
    await page.evaluate(() => {
      window.overflow = [];
      const start = performance.now();
      const tick = () => {
        const d = document.documentElement;
        window.overflow.push({ over: d.scrollWidth - d.clientWidth, celebrating: Boolean(document.querySelector('.is-celebrating')) });
        if (performance.now() - start < 2400) requestAnimationFrame(tick);
        else window.overflowDone = true;
      };
      requestAnimationFrame(tick);
    });
    await btn(page, '끝내기').click();
    await expect(page.locator('.result-stamp')).toBeVisible();
    await page.waitForFunction(() => window.overflowDone === true);
    const samples = await page.evaluate(() => window.overflow);
    const during = samples.filter((x) => x.celebrating);
    expect(during.length, `${size.width}×${size.height}`).toBeGreaterThan(20); // 연출 중 프레임을 실제로 쟀다
    expect(Math.max(...samples.map((x) => x.over)), `${size.width}×${size.height}`).toBeLessThanOrEqual(1);
    // 자르는 선은 화면 가장자리 쪽 여백까지 넓혀 두었다: 증명서 종이의 그림자(5px)·초점 테두리(13px)는 잘리지 않는다
    const gap = await page.evaluate(() => {
      const box = document.querySelector('.screen-result').getBoundingClientRect();
      const inner = [...document.querySelectorAll('.certificate, .side-col > *')].map((el) => el.getBoundingClientRect());
      return { left: Math.min(...inner.map((r) => r.left)) - box.left, right: box.right - Math.max(...inner.map((r) => r.right)), overflowY: getComputedStyle(document.querySelector('.screen-result')).overflowY };
    });
    expect(gap.left, `${size.width}×${size.height}`).toBeGreaterThanOrEqual(16);
    expect(gap.right, `${size.width}×${size.height}`).toBeGreaterThanOrEqual(16);
    expect(gap.overflowY).toBe('visible'); // 세로는 자르지 않는다 (위쪽 테이프·세로 스크롤 그대로)
    // 연출이 끝나면 도장이 증명서 안에 그대로 보인다
    const stamp = await page.locator('.result-stamp').boundingBox();
    const cert = await page.locator('.certificate').boundingBox();
    expect(stamp.x).toBeGreaterThanOrEqual(cert.x);
    expect(stamp.x + stamp.width).toBeLessThanOrEqual(cert.x + cert.width + 1);
  }
});

test('1366×680: 칭호 오름·새 도장 3개·다시 살펴볼 점·도전 주문서 칩이 모두 있는 결과 화면도 세로 스크롤이 없다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '크롬북 화면 크기에서 확인');
  await page.setViewportSize({ width: 1366, height: 680 });
  await page.goto(URL);
  await page.evaluate(() => {
    localStorage.setItem('edu:engine-test:stars', JSON.stringify({ a1: 3 }));
    localStorage.setItem('edu:engine-test:rewards', JSON.stringify({ v: 1, xp: 35 }));
  });
  await page.goto(`${URL}?stage=a2&sound=off`);
  await btn(page, '틀림').click();
  await btn(page, '다음 문제').click();
  await btn(page, '틀림').click();
  await btn(page, '맞힘').click();
  await btn(page, '세모 찾기').click();
  await btn(page, '네모 찾기').click();
  await btn(page, '끝내기').click();
  await expect(page.locator('.rank-card')).toContainText('칭호가 올랐어요');
  await expect(page.locator('.new-badge-list li')).toHaveCount(3);
  await expect(page.locator('.review-note')).toBeVisible();
  await expect(page.locator('.opened-chip')).toBeVisible();
  await page.keyboard.press('Escape');
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({ scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight }));
  expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
});
