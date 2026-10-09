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

// '한 번만 점수' 답(scored: 'once') 시험 페이지: 답의 표시만 다른 버튼들. 같은 것을 다시 답하지 않게 하는 것은 게임의 몫이라 여기서는 문항 번호를 늘린다
const ONCE_PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/src/shared/styles/base.css"></head><body><div id="app"></div>
<script type="module">
import { createGameApp } from '/src/shared/ui/app.js';
createGameApp({
  root: document.getElementById('app'),
  game: { id: 'once-test', title: '한 번만 시험 공방', summary: '한 번만 점수 답을 시험해요.', grades: [5], subject: '수학' },
  collections: [{ id: 'shapes', title: '모양 도감', items: [{ id: 'tri', name: '세모' }, { id: 'sq', name: '네모' }] }],
  stages: [{ id: 's1', title: '첫 단계', goal: '버튼을 눌러 답해요.' }, { id: 's2', title: '둘째 단계', goal: '한 번 더 답해요.' }],
  playStage(stage, ctx) {
    const { h } = ctx;
    let n = 0;
    const b = (label, fn) => h('button', { type: 'button', class: 'btn', onclick: fn }, label);
    ctx.el.append(h('div', { class: 'actions' },
      b('한 번만 맞힘', () => { n += 1; ctx.log.answer({ itemId: 'o' + n, correct: true, scored: 'once' }); }),
      b('한 번만 틀림', () => { n += 1; ctx.log.answer({ itemId: 'o' + n, correct: false, scored: 'once' }); }),
      b('표시 없이 맞힘', () => { n += 1; ctx.log.answer({ itemId: 'p' + n, correct: true }); }),
      b('표시 없이 틀림', () => { n += 1; ctx.log.answer({ itemId: 'p' + n, correct: false }); }),
      b('이미 받은 답', () => { n += 1; ctx.log.answer({ itemId: 'old' + n, correct: true, scored: false }); }),
      b('한 번만 설명', () => { window.lastXp = ctx.reward.event('explain', { correct: true, itemId: 'o' + n }); }),
      b('표시 없는 설명', () => { window.lastXp = ctx.reward.event('explain', { correct: true, itemId: 'p' + n }); }),
      b('세모 찾기', () => { ctx.collect('shapes', 'tri'); }),
      b('끝내기', () => { ctx.finish(); }),
      b('문장 주고 끝내기', () => { ctx.finish({ practiceNote: '처음 한 것만 점수를 받아요.' }); }),
    ));
  },
}).start();
</script></body></html>`;
const ONCE_URL = 'http://engine.test/once.html';

// 끌어다 놓기 시험 페이지: 카드가 스크롤 상자(overflow: hidden auto) 안에 있고, 상자는 그 밖에 있다.
// 카드 모양은 조상 선택자·조상의 CSS 변수에 기대게 했다(복제가 <body> 아래에서도 같은 모양인지 보려고). 상자 '넣는 곳'만 카드를 옮겨 넣는다
const DND_PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/src/shared/styles/base.css">
<style>
  body { margin: 0; padding: 20px; }
  #root { display: flex; flex-wrap: wrap; gap: 30px; align-items: flex-start; --card: 64px; --card-color: rgb(255, 216, 107); }
  .clip { position: relative; z-index: 0; width: 240px; height: 96px; padding: 10px; overflow: hidden auto; border: 2px solid rgb(30, 33, 64); background: rgb(240, 240, 240); }
  .clip .card { width: var(--card); height: var(--card); margin-right: 6px; border: 2px solid rgb(30, 33, 64); border-radius: 8px; background: var(--card-color); font-size: 24px; font-weight: 700; }
  .clip .card .lab { color: rgb(200, 40, 40); }
  .bin { position: relative; z-index: 1; width: 150px; height: 150px; border: 2px dashed rgb(30, 33, 64); background: rgb(255, 255, 255); }
  .bin .card { width: 40px; height: 40px; }
  #outside { margin-top: 40px; padding: 30px; }
</style></head><body>
<div id="root">
  <div class="clip">
    <button type="button" class="card dnd-item" id="card-a" data-v="가" aria-pressed="false"><span class="lab">가</span></button><button type="button" class="card dnd-item" data-v="나" aria-pressed="false"><span class="lab">나</span></button><button type="button" class="card dnd-item" data-v="다" aria-pressed="false"><span class="lab">다</span></button>
  </div>
  <button type="button" class="bin dnd-target" data-bin="yes">넣는 곳</button>
  <button type="button" class="bin dnd-target" data-bin="no">안 받는 곳</button>
</div>
<p id="outside">놓을 수 없는 곳</p>
<script type="module">
import { enableDragDrop } from '/src/shared/ui/drag-drop.js';
window.drops = [];
window.dnd = enableDragDrop({
  root: document.getElementById('root'),
  onDrop(item, target) {
    window.drops.push(item.dataset.v + '>' + target.dataset.bin);
    if (target.dataset.bin === 'yes') target.append(item);
  },
});
</script></body></html>`;
const DND_URL = 'http://engine.test/dnd.html';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }));
  await page.route('http://engine.test/**', async (route) => {
    const { pathname } = new globalThis.URL(route.request().url());
    if (pathname === '/engine.html') return route.fulfill({ contentType: 'text/html', body: ENGINE_PAGE });
    if (pathname === '/once.html') return route.fulfill({ contentType: 'text/html', body: ONCE_PAGE });
    if (pathname === '/dnd.html') return route.fulfill({ contentType: 'text/html', body: DND_PAGE });
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

test("한 번만 점수 답(scored: 'once'): 별 3개 단계에서도 점수를 받고 그 자리에서 저장된다. 중간에 나가도 남고, 마칠 때 다시 더하지 않는다. 표시 없는 답은 그대로", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(ONCE_URL);
  await page.evaluate(() => {
    localStorage.setItem('edu:once-test:stars', JSON.stringify({ s1: 3, s2: 2 }));
    localStorage.setItem('edu:once-test:rewards', JSON.stringify({ v: 1, xp: 20 }));
  });
  const xp = page.locator('.meta-xp b');
  const chip = page.locator('.rank-chip small');
  const storedXp = () => page.evaluate(() => JSON.parse(localStorage.getItem('edu:once-test:rewards')).xp);

  // 별 3개 단계(s1) 다시 하기: '한 번만' 답은 처음 맞힘 +2, 연속 3번 +1 — 누르는 그 자리에서 칭호 칩(저장된 점수)이 오른다
  await page.goto(`${ONCE_URL}?stage=s1&sound=off`);
  await expect(chip).toHaveText('20점');
  for (let i = 0; i < 3; i += 1) await btn(page, '한 번만 맞힘').click();
  await expect(xp).toHaveText('+7');
  await expect(chip).toHaveText('27점');
  expect(await storedXp()).toBe(27);
  // 표시 없는 답·설명·이미 받은 답은 지금까지처럼 0점이고 저장도 그대로
  await btn(page, '표시 없이 맞힘').click();
  await btn(page, '표시 없는 설명').click();
  expect(await page.evaluate(() => window.lastXp)).toBe(0);
  await btn(page, '이미 받은 답').click();
  await expect(xp).toHaveText('+7');
  expect(await storedXp()).toBe(27);
  // 표시 없는 답(연습)을 틀려도 '한 번만' 답에 다시 일어서기가 붙지 않는다. '한 번만' 답을 틀린 뒤 맞히면 +2 +1
  await btn(page, '표시 없이 틀림').click();
  await btn(page, '한 번만 맞힘').click();
  await expect(xp).toHaveText('+9');
  await btn(page, '한 번만 틀림').click();
  await btn(page, '한 번만 맞힘').click();
  await expect(xp).toHaveText('+12');
  // 그 문항의 설명 +2도 별과 상관없이, 바로 저장
  await btn(page, '한 번만 설명').click();
  expect(await page.evaluate(() => window.lastXp)).toBe(2);
  await expect(xp).toHaveText('+14');
  await expect(chip).toHaveText('34점');
  expect(await storedXp()).toBe(34);
  // 판 중간에 나가도(← 단계 선택, 새로 고침) 남는다
  await btn(page, '← 단계 선택').click();
  await expect(chip).toHaveText('34점');
  expect(await storedXp()).toBe(34);
  await page.goto(`${ONCE_URL}?stage=s1&sound=off`);
  await expect(chip).toHaveText('34점');

  // 판을 마칠 때 같은 점수를 다시 더하지 않는다. 결과의 "오늘의 솜씨" 칸 합 = 이번에 모은 점수 = 저장된 점수 차
  await btn(page, '한 번만 맞힘').click();
  await btn(page, '표시 없이 맞힘').click();
  await expect(xp).toHaveText('+2');
  expect(await storedXp()).toBe(36);
  await btn(page, '끝내기').click();
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.locator('.rank-card .xp-gain')).toHaveText('+2');
  await expect(page.locator('.behavior', { hasText: '처음에 맞힘' })).toContainText('2 / 2');
  await expect(page.locator('.behavior', { hasText: '처음에 맞힘' }).locator('.b-xp')).toHaveText('+2');
  await expect(page.locator('.practice-note')).toHaveText('별 3개를 받은 단계라 연습 점수는 없어요. 처음 해 본 것은 점수를 받았어요.');
  await expect(page.locator('[role="status"]')).toContainText('처음 해 본 것은 점수를 받았어요');
  await expect(chip).toHaveText('36점');
  expect(await storedXp()).toBe(36);
  // 게임이 안내 문장을 주면 그 문장을 보인다 (별 3개 단계를 다시 한 판에서만)
  await btn(page, '다시 하기').click();
  await btn(page, '문장 주고 끝내기').click();
  await expect(page.locator('.practice-note')).toHaveText('처음 한 것만 점수를 받아요.');
  expect(await storedXp()).toBe(36);

  // 별 2개 단계(s2): 표시 없는 답은 판을 마칠 때 저장, '한 번만' 답과 새로 찾음은 바로 저장. 연속·다시 일어서기는 따로 센다
  await page.goto(`${ONCE_URL}?stage=s2&sound=off`);
  await btn(page, '표시 없이 맞힘').click();
  await btn(page, '표시 없이 맞힘').click();
  await expect(xp).toHaveText('+4');
  await expect(chip).toHaveText('36점');
  await btn(page, '한 번만 맞힘').click(); // 화면의 연속은 3이지만 '한 번만' 답으로는 첫 번째라 연속 보너스가 없다
  await expect(page.locator('.meta-streak')).toHaveText('연속 3');
  await expect(xp).toHaveText('+6');
  await expect(chip).toHaveText('38점');
  await btn(page, '세모 찾기').click();
  await expect(chip).toHaveText('43점');
  expect(await storedXp()).toBe(43);
  // 중간에 나가면 표시 없는 답의 4점은 지금까지처럼 저장되지 않는다
  await btn(page, '← 단계 선택').click();
  expect(await storedXp()).toBe(43);
  // 다시 들어가 마치면: 표시 없는 답 2 + '한 번만' 2(바로 저장) + 별 1개 더 +2, 문장은 없다(연습 점수가 있는 판)
  await page.goto(`${ONCE_URL}?stage=s2&sound=off`);
  await btn(page, '표시 없이 맞힘').click();
  await btn(page, '한 번만 맞힘').click();
  await expect(chip).toHaveText('45점');
  await btn(page, '문장 주고 끝내기').click();
  await expect(page.locator('.practice-note')).toHaveCount(0);
  await expect(page.locator('.rank-card .xp-gain')).toHaveText('+6');
  expect(await storedXp()).toBe(49);
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

// ── 끌어다 놓기: 끄는 동안 보이는 복제 (ui/drag-drop.js) ─────────────
/** 마우스(크롬북)·한 손가락 터치(태블릿, CDP)로 같은 끌기를 한다: down → move … → up */
async function pointerOf(page, testInfo) {
  if (testInfo.project.name !== 'tablet') {
    return {
      kind: 'mouse',
      down: async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); },
      move: (x, y) => page.mouse.move(x, y, { steps: 4 }),
      up: () => page.mouse.up(),
    };
  }
  const cdp = await page.context().newCDPSession(page);
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y]) => ({ x, y })) });
  let at = [0, 0];
  return {
    kind: 'touch',
    down: async (x, y) => { at = [x, y]; await send('touchStart', [at]); },
    move: async (x, y) => {
      const from = at;
      for (let i = 1; i <= 4; i += 1) {
        at = [from[0] + ((x - from[0]) * i) / 4, from[1] + ((y - from[1]) * i) / 4];
        await send('touchMove', [at]);
      }
    },
    up: () => send('touchEnd', []),
  };
}

/** 끄는 중인 화면: 복제(.dnd-ghost)의 자리·모양·잘림, 원래 카드, 강조된 상자, 남은 표시 */
const dragState = (page) => page.evaluate(() => {
  const round = (r) => [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10);
  const ghosts = [...document.querySelectorAll('.dnd-ghost')];
  const ghost = ghosts[0];
  const item = document.querySelector('.dnd-item.is-dragging, .dnd-item.is-returning');
  const look = (el) => {
    const c = getComputedStyle(el);
    const lab = el.querySelector('.lab');
    return [c.backgroundColor, c.borderTopWidth, c.borderRadius, c.fontSize, c.fontWeight, lab ? getComputedStyle(lab).color : '', el.textContent.trim()].join(' | ');
  };
  // 복제가 어느 상자에도 잘리지 않는가: 조상 가운데 overflow가 visible이 아닌 것
  const clippers = [];
  for (let p = ghost?.parentElement; p; p = p.parentElement) {
    const c = getComputedStyle(p);
    if (c.overflowX !== 'visible' || c.overflowY !== 'visible') clippers.push(p.tagName);
  }
  const g = ghost ? getComputedStyle(ghost) : null;
  return {
    ghosts: ghosts.length,
    ghost: ghost ? round(ghost.getBoundingClientRect()) : null,
    ghostLook: ghost ? look(ghost) : null,
    ghostParent: ghost?.parentElement.tagName ?? null,
    ghostStyle: g ? [g.position, g.zIndex, g.pointerEvents, g.opacity, g.visibility] : null,
    ghostHidden: ghost ? [ghost.getAttribute('aria-hidden'), ghost.inert, ghost.id, ghost.classList.contains('dnd-item')] : null,
    clippers,
    item: item ? round(item.getBoundingClientRect()) : null,
    itemLook: item ? look(item) : null,
    itemOpacity: item ? getComputedStyle(item).opacity : null,
    itemClass: item ? [...item.classList].filter((c) => c.startsWith('is-')).join(' ') : null,
    over: [...document.querySelectorAll('.dnd-target.is-over')].map((t) => t.dataset.bin),
    rootDragging: document.getElementById('root').classList.contains('is-dragging-any'),
    selected: document.querySelectorAll('.is-selected').length,
    scroll: [window.scrollX, window.scrollY, document.querySelector('.clip').scrollTop],
    ids: document.querySelectorAll('#card-a').length,
  };
});
/** 끌기를 마친 뒤 남은 것이 없다: 복제, 끄는 중·돌아가는 중·강조 표시 */
const NOTHING_LEFT = { ghosts: 0, item: null, over: [], rootDragging: false, selected: 0 };
const leftOf = (s) => ({ ghosts: s.ghosts, item: s.item, over: s.over, rootDragging: s.rootDragging, selected: s.selected });
const centerOf = async (locator) => {
  const b = await locator.boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};

test('끌어다 놓기: 끄는 카드가 스크롤 상자 밖에서도 잘리지 않고 놓을 때까지 보인다(복제는 body 아래 맨 위, 모양·크기 같음, 원래 자리는 흐림). 놓으면 들어가고, 놓을 수 없는 곳·받지 않는 상자·Esc·취소에서는 제자리로 돌아가며 남는 것이 없다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  // 창에 남아 있는 리스너 수(움직임·취소·키·가려짐). pointerup은 Playwright도 누를 때마다 붙였다 떼므로 세지 않는다
  await page.addInitScript(() => {
    const active = new Map();
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = (type, fn, ...rest) => {
      if (/^(pointermove|pointercancel|keydown|blur)$/.test(type)) active.set(fn, (active.get(fn) ?? new Set()).add(type));
      return add(type, fn, ...rest);
    };
    window.removeEventListener = (type, fn, ...rest) => {
      active.get(fn)?.delete(type);
      return remove(type, fn, ...rest);
    };
    window.listeners_ = () => [...active.values()].reduce((sum, types) => sum + types.size, 0);
    document.addEventListener('pointerdown', (e) => { window.lastPointerId_ = e.pointerId; }, true);
  });
  await page.goto(DND_URL);
  // 복제가 제자리로 돌아갈 때의 모습을 적어 둔다(150ms 안에 지나가므로 그 순간에 적는다): 복제의 움직임 설정·도착 자리, 원래 카드의 흐림
  await page.evaluate(() => {
    window.returns_ = [];
    new MutationObserver((records) => {
      for (const { target } of records) {
        if (!target.classList?.contains('is-returning') || target.dataset.seen_) continue;
        target.dataset.seen_ = '1';
        if (target.classList.contains('dnd-ghost')) {
          // 스타일은 클래스 바로 뒤에 적히므로 다음 차례에 읽는다
          queueMicrotask(() => window.returns_.push(`복제 ${target.style.transition} → ${target.style.transform}`));
        } else window.returns_.push(`카드 흐림 ${getComputedStyle(target).opacity}`);
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  });
  const returns = async () => {
    const seen = await page.evaluate(() => window.returns_.splice(0));
    await page.evaluate(() => { for (const el of document.querySelectorAll('[data-seen_]')) delete el.dataset.seen_; });
    return seen.sort();
  };
  const pointer = await pointerOf(page, testInfo);
  const card = (v) => page.locator(`#root .dnd-item[data-v="${v}"], #root .card[data-v="${v}"]`).first();
  const bin = (name) => page.locator(`.bin[data-bin="${name}"]`);
  const drops = () => page.evaluate(() => window.drops);
  const listeners0 = await page.evaluate(() => window.listeners_());
  const clip = await page.locator('.clip').boundingBox();

  // 1) 가 → 넣는 곳. 문턱(8px) 전에는 복제가 없다
  const [ax, ay] = await centerOf(card('가'));
  const home = await card('가').boundingBox();
  const [yx, yy] = await centerOf(bin('yes'));
  await pointer.down(ax, ay);
  await pointer.move(ax + 4, ay + 3);
  expect((await dragState(page)).ghosts).toBe(0);
  // 스크롤 상자 밖(아래로 150px)으로 끈다: 예전에는 여기서 카드가 잘려 보이지 않았다
  const out = [ax + 30, ay + 150];
  await pointer.move(...out);
  let s = await dragState(page);
  expect(s.ghosts).toBe(1);
  expect(s.ghost[1]).toBeGreaterThan(clip.y + clip.height); // 복제 전체가 스크롤 상자 밖에 있다
  // 집은 자리 그대로 포인터를 따라온다: 처음 자리에서 (30, 150)만큼, 크기는 카드와 같다
  [home.x + 30, home.y + 150, home.width, home.height].forEach((v, i) => expect(Math.abs(s.ghost[i] - v), `복제 상자 ${s.ghost}`).toBeLessThanOrEqual(1));
  expect([s.ghostParent, s.clippers]).toEqual(['BODY', []]); // 어느 상자에도 잘리지 않는다
  expect(s.ghostStyle).toEqual(['fixed', '1000', 'none', '1', 'visible']);
  expect(s.ghostHidden).toEqual(['true', true, '', false]); // 화면 읽기·초점·끌기 대상이 아니고 id가 겹치지 않는다
  expect(s.ids).toBe(1);
  expect(s.ghostLook).toBe('rgb(255, 216, 107) | 2px | 8px | 24px | 700 | rgb(200, 40, 40) | 가'); // 조상 선택자·CSS 변수로 정한 모양도 그대로
  expect(s.itemLook).toBe(s.ghostLook);
  // 원래 카드는 제자리에서 흐려진다 — 또렷한 카드가 둘로 보이지 않는다
  expect(s.item).toEqual([home.x, home.y, home.width, home.height].map((v) => Math.round(v * 10) / 10));
  expect([s.itemOpacity, s.itemClass, s.rootDragging]).toEqual(['0.35', 'is-dragging', true]);
  expect(s.scroll).toEqual([0, 0, 0]); // 끄는 동안 페이지·상자가 스크롤되지 않는다
  expect(await page.evaluate(() => window.listeners_())).toBeGreaterThan(listeners0);
  // 상자 위에 오면 그 상자가 강조되고, 놓으면 들어간다. 복제·표시는 바로 없어진다
  await pointer.move(yx, yy);
  s = await dragState(page);
  expect([s.ghosts, s.over]).toEqual([1, ['yes']]);
  await pointer.up();
  expect(leftOf(await dragState(page))).toEqual(NOTHING_LEFT);
  expect(await drops()).toEqual(['가>yes']);
  await expect(bin('yes').locator('.card')).toHaveCount(1);
  expect(await page.evaluate(() => window.listeners_())).toBe(listeners0);

  // 2) 나 → 안 받는 곳: onDrop은 불리지만 카드가 제자리에 그대로다 → 복제가 제자리로 돌아간 뒤 없어진다(그동안 원래 카드는 흐린 채)
  const [bx, by] = await centerOf(card('나'));
  const homeB = await card('나').boundingBox();
  const [nx, ny] = await centerOf(bin('no'));
  await pointer.down(bx, by);
  await pointer.move(nx, ny);
  expect((await dragState(page)).over).toEqual(['no']);
  await pointer.up();
  await expect(page.locator('.dnd-ghost')).toHaveCount(0);
  expect(await returns()).toEqual(['복제 transform 150ms ease-out → translate(0px, 0px)', '카드 흐림 0.35']);
  expect(leftOf(await dragState(page))).toEqual(NOTHING_LEFT);
  expect(await drops()).toEqual(['가>yes', '나>no']);
  expect(await card('나').boundingBox()).toEqual(homeB);

  // 3) 놓을 수 없는 곳에서 떼기: 놓기는 없고, 복제가 돌아가는 것이 보인다(끝나면 처음 자리에 온다)
  const [ox, oy] = await centerOf(page.locator('#outside'));
  await pointer.down(bx, by);
  await pointer.move(ox, oy);
  expect((await dragState(page)).over).toEqual([]);
  // 돌아가는 동안 복제가 어디 있는지 프레임마다 적는다
  await page.evaluate(() => {
    window.flight_ = [];
    const tick = () => {
      const ghost = document.querySelector('.dnd-ghost.is-returning');
      if (ghost) window.flight_.push(ghost.getBoundingClientRect().top);
      if (document.querySelector('.dnd-ghost') || window.flight_.length === 0) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await pointer.up();
  await expect(page.locator('.dnd-ghost')).toHaveCount(0);
  expect(await returns()).toEqual(['복제 transform 150ms ease-out → translate(0px, 0px)', '카드 흐림 0.35']);
  const flight = await page.evaluate(() => window.flight_);
  // 한 번에 사라지지 않고 제자리 쪽으로(위로) 움직이는 것이 보인다 — 적힌 자리가 떼던 자리와 제자리 사이에서 줄어든다
  expect(flight.length).toBeGreaterThanOrEqual(1);
  expect(flight.every((top, i) => top <= oy && top >= homeB.y - 1 && (i === 0 || top <= flight[i - 1] + 0.5)), `돌아가는 자리 ${flight.map(Math.round)}`).toBe(true);
  expect(leftOf(await dragState(page))).toEqual(NOTHING_LEFT);
  expect(await drops()).toHaveLength(2);

  // 4) Esc: 끌기를 그만둔다 — 복제는 돌아가고, 그 뒤 상자 위에서 떼어도 놓이지 않는다. 제 카드 위에서 떼어도 "고르기"가 되지 않는다
  await pointer.down(bx, by);
  await pointer.move(yx, yy);
  expect((await dragState(page)).over).toEqual(['yes']);
  await page.keyboard.press('Escape');
  s = await dragState(page);
  expect([s.over, s.rootDragging]).toEqual([[], false]);
  await pointer.up();
  await expect(page.locator('.dnd-ghost')).toHaveCount(0);
  expect(await returns()).toEqual(['복제 transform 150ms ease-out → translate(0px, 0px)', '카드 흐림 0.35']);
  await pointer.down(bx, by);
  await pointer.move(bx + 60, by + 90);
  await page.keyboard.press('Escape');
  await pointer.move(bx + 2, by + 2);
  await pointer.up();
  await page.waitForTimeout(250);
  expect(leftOf(await dragState(page))).toEqual(NOTHING_LEFT);
  expect(await drops()).toHaveLength(2);
  expect(await page.evaluate(() => window.listeners_())).toBe(listeners0);

  // 5) 끄는 도중 포인터가 취소되거나(pointercancel) 창이 가려지면(blur) 그 자리에서 그만둔다
  for (const stop of ['pointercancel', 'blur']) {
    await pointer.down(bx, by);
    await pointer.move(yx, yy);
    expect((await dragState(page)).ghosts).toBe(1);
    await page.evaluate((type) => {
      const id = window.lastPointerId_;
      window.dispatchEvent(type === 'blur' ? new Event('blur') : new PointerEvent('pointercancel', { pointerId: id }));
    }, stop);
    await pointer.up();
    await expect(page.locator('.dnd-ghost')).toHaveCount(0);
    expect(leftOf(await dragState(page)), stop).toEqual(NOTHING_LEFT);
    expect(await drops(), stop).toHaveLength(2);
    expect(await page.evaluate(() => window.listeners_()), stop).toBe(listeners0);
    await page.waitForTimeout(50);
  }

  // 6) 눌러서 고르고 상자 누르기 · 키보드(Tab + Enter)는 그대로다
  await card('나').click();
  await expect(card('나')).toHaveAttribute('aria-pressed', 'true');
  await bin('yes').click();
  expect(await drops()).toEqual(['가>yes', '나>no', '나>yes']);
  await card('다').focus();
  await page.keyboard.press('Enter');
  await bin('no').focus();
  await page.keyboard.press('Enter');
  expect(await drops()).toEqual(['가>yes', '나>no', '나>yes', '다>no']);
  expect(leftOf(await dragState(page))).toEqual(NOTHING_LEFT);

  // 7) 끄는 도중 화면이 치워지면(destroy) 복제·표시·리스너가 남지 않는다
  const [cx, cy] = await centerOf(card('다'));
  await pointer.down(cx, cy);
  await pointer.move(yx, yy);
  expect((await dragState(page)).ghosts).toBe(1);
  await page.evaluate(() => window.dnd.destroy());
  expect(leftOf(await dragState(page))).toEqual(NOTHING_LEFT);
  expect(await page.evaluate(() => window.listeners_())).toBe(listeners0);
  await pointer.up();
  expect(await drops()).toHaveLength(4);
  expect(errors).toEqual([]);
});

test.describe('끌어다 놓기 (움직임 줄이기)', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('놓을 수 없는 곳에서 떼면 복제가 움직임 없이 바로 없어지고 카드는 제자리에 또렷하게 남는다', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await page.goto(DND_URL);
    const pointer = await pointerOf(page, testInfo);
    const [ax, ay] = await centerOf(page.locator('.dnd-item[data-v="가"]'));
    const [ox, oy] = await centerOf(page.locator('#outside'));
    await pointer.down(ax, ay);
    await pointer.move(ox, oy);
    expect((await dragState(page)).ghosts).toBe(1);
    await pointer.up();
    expect(leftOf(await dragState(page))).toEqual(NOTHING_LEFT); // 같은 차례에 없어진다
    expect(await page.locator('.dnd-item[data-v="가"]').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    expect(await page.evaluate(() => window.drops)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
