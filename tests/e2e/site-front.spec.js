import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createRng } from '../../src/shared/core/random.js';
import { BLOCK_STAGES, makeBlockQuestions } from '../../src/games/net-workshop/blocks/blocks-logic.js';
import { FRONT_FILE, GUIDE_FILE, SITE_URL, collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

/**
 * 첫 화면은 인트로 · 게임 모음은 "선생님용 안내"로 (B0d — spec-grade6.md 15-13), 학년 고르기·학년 화면의 저작권 글(15-14).
 *   사이트 맨 위 주소(/game2/ = index.html)는 입체도형 공방 HTML 그대로라 넘겨 주기 없이 인트로가 바로 나온다(옛 주소 net-workshop.html도 그대로).
 *   ?intro=0은 인트로를 건너뛰고 학년 고르기부터. 학년 고르기 맨 아래 오른쪽 구석의 작은 [선생님용 안내] → teacher.html(같은 탭).
 *   선생님용 안내의 [← 학년 고르기]·게임 카드 → net-workshop.html?intro=0. 예시 게임은 목록에 없고 주소로만 열린다.
 *   학년 고르기·학년 화면 맨 아래(그리고 선생님용 안내 맨 아래) 가운데에 "© 2026 PSC. All rights reserved." — 학습 활동 화면에는 없다.
 *   학년 고르기는 시안 A "큰 두 칸"(15-15): 맨 위 띠 한 줄 · "공부할 학년을 골라요" · 큰 학년 카드 둘(큰 숫자) · 내 공방 한 줄 · 맨 아래 줄.
 * 움직임이 끝난 뒤에 잰다(settled). 두 사이트(GitHub Pages 하위 경로 · Cloudflare Pages 맨 위 경로와 .html 빼기)는 이 검사 밖에서 흉내로 확인했다(Build 보고).
 */
const FILE = 'net-workshop.html';
const COPYRIGHT = '© 2026 PSC. All rights reserved.';
const isTouch = (testInfo) => testInfo.project.name === 'tablet';
const press = (testInfo, locator) => (isTouch(testInfo) ? locator.tap() : locator.click());
const settled = (page) => page.waitForFunction(() => document.getAnimations({ subtree: true }).every((a) => a.playState !== 'running' || a.effect?.getTiming?.().iterations === Infinity));
const guideLink = (page) => page.getByRole('link', { name: '선생님용 안내' });
const copyright = (page) => page.locator('.screen-copyright');

/** 문서에 붙는 화면(.screen)의 차례를 적어 둔다 — 처음 붙는 화면이 무엇인지(다른 화면이 잠깐이라도 그려졌는지) 본다 */
const watchScreens = (page) => page.addInitScript(() => {
  window.__screens = [];
  new MutationObserver((list) => {
    for (const m of list) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && n.classList.contains('screen')) window.__screens.push([...n.classList].find((c) => c.startsWith('screen-')));
      }
    }
  }).observe(document, { childList: true, subtree: true });
});
const screensSeen = (page) => page.evaluate(() => window.__screens);

test('사이트 맨 위 주소(/game2/)로 열면 넘겨 주기 없이 입체도형 공방의 인트로가 바로 — 처음 그려지는 화면이 인트로이고 게임 모음은 없다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await watchScreens(page);
  for (const url of [SITE_URL, fileUrl(FRONT_FILE)]) {
    const response = await page.goto(url);
    expect(response.status(), url).toBe(200);
    expect(response.request().redirectedFrom(), `${url}: 넘겨 주기 없음`).toBeNull();
    expect(page.url()).toBe(url);
    await expect(page.locator('.intro-enter')).toBeVisible();
    expect(await screensSeen(page), url).toEqual(['screen-intro']);
    await expect(page).toHaveTitle('입체도형 공방');
    await expect(page.locator('.hub, .hub-card')).toHaveCount(0);
  }
  // [입장하기] → 학년 고르기(맨 아래 구석에 [선생님용 안내])
  await press(testInfo, page.locator('.intro-enter'));
  await expect(page.locator('.grade-card')).toHaveCount(2);
  await expect(guideLink(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('맨 위 주소에 수업 주소 옵션을 붙여도 그 화면이 바로 열린다(인트로가 먼저 그려지지 않는다) — ?lesson=·?area=·?grade=·?stage=·?intro=0', async ({ page }) => {
  const errors = collectErrors(page);
  await watchScreens(page);
  const cases = [
    ['?lesson=cube&sound=off', async () => {
      await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible();
      await expect(page.locator('.grade-card')).toHaveCount(0);
    }, 'screen-title'],
    ['?area=blocks&sound=off', async () => {
      await expect(page.locator('.area-tab[aria-selected="true"]')).toHaveAttribute('data-area', 'blocks');
    }, 'screen-stages'],
    ['?grade=6&sound=off', async () => {
      await expect(page.locator('.screen-grade')).toHaveAttribute('data-grade', '6');
    }, 'screen-grade'],
    ['?stage=cube-judge&seed=1&sound=off', async () => {
      await expect(page.locator('.play-area')).toBeVisible();
    }, 'screen-play'],
    ['?intro=0&sound=off', async () => {
      await expect(page.locator('.grade-card')).toHaveCount(2);
    }, 'screen-title'],
  ];
  for (const [query, check, first] of cases) {
    await page.goto(`${SITE_URL}${query}`);
    await check();
    expect((await screensSeen(page))[0], query).toBe(first);
    expect(await page.locator('.screen-intro').count(), query).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('?intro=0(옛 주소): 인트로 없이 학년 고르기부터 — [← 처음으로]는 인트로로. 수업 주소가 함께 오면 그 화면, ?intro=1 등은 뜻이 없다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await watchScreens(page);
  await page.goto(fileUrl(FILE, '?intro=0&sound=off'));
  await expect(page.locator('.grade-card')).toHaveCount(2);
  expect(await screensSeen(page)).toEqual(['screen-title']);
  await press(testInfo, page.getByRole('button', { name: '← 처음으로' }));
  await expect(page.locator('.intro-enter')).toBeVisible();
  await page.goto(fileUrl(FILE, '?intro=0&grade=5&sound=off'));
  await expect(page.locator('.screen-grade')).toHaveAttribute('data-grade', '5');
  for (const query of ['?intro=1&sound=off', '?intro=&sound=off', '?sound=off']) {
    await page.goto(fileUrl(FILE, query));
    await expect(page.locator('.intro-enter'), query).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('[선생님용 안내]: 학년 고르기 화면에만 — 오른쪽 아래 구석(학년 카드 아래), 작고 덜 띄게, 누르는 곳 48px. 누르면(마우스·터치) 같은 탭에서 안내 페이지', async ({ page, context }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?intro=0&sound=off'));
  await expect(page.locator('.grade-card')).toHaveCount(2);
  await settled(page);
  const link = guideLink(page);
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('href', './teacher.html');
  expect(await link.getAttribute('target')).toBeNull();
  const m = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const a = document.querySelector('.btn-teacher');
    const cards = [...document.querySelectorAll('.grade-card')].map(r);
    const cardTitle = parseFloat(getComputedStyle(document.querySelector('.grade-card .area-title')).fontSize);
    const style = getComputedStyle(a);
    return {
      w: r(a).width, h: r(a).height, right: Math.max(...cards.map((c) => c.right)) - r(a).right, top: r(a).top, bottom: r(a).bottom,
      cardsBottom: Math.max(...cards.map((c) => c.bottom)), innerHeight, font: parseFloat(style.fontSize), cardTitle,
    };
  });
  expect(m.h).toBeGreaterThanOrEqual(48);
  expect(m.w).toBeGreaterThanOrEqual(48);
  expect(Math.abs(m.right), '오른쪽 끝이 학년 카드의 오른쪽 끝과 같다(오른쪽 아래 구석)').toBeLessThan(1);
  expect(m.top, '학년 카드보다 아래(크롬북·태블릿 — 카드보다 앞서 보이지 않는다)').toBeGreaterThan(m.cardsBottom);
  expect(m.bottom).toBeLessThanOrEqual(m.innerHeight);
  expect(m.font, '글자는 학년 카드 이름보다 작다').toBeLessThan(m.cardTitle);
  // 누르면 같은 탭에서
  await press(testInfo, link);
  await page.waitForURL(/\/teacher\.html$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('입체도형 공방 선생님용 안내');
  expect(context.pages()).toHaveLength(1);
  // 다른 화면에는 없다: 인트로 · 학년 화면 · 단계 지도 · 한 차시 주소 화면 · 놀이 방법 · 학습 기록
  await page.goto(fileUrl(FILE, '?sound=off'));
  await expect(page.locator('.intro-enter')).toBeVisible();
  await expect(guideLink(page)).toHaveCount(0);
  for (const [query, ready] of [['?grade=6', '.screen-grade'], ['?area=cube', '.screen-stages'], ['?lesson=cube', '.screen-title']]) {
    await page.goto(fileUrl(FILE, `${query}&sound=off`));
    await expect(page.locator(ready)).toBeVisible();
    await expect(guideLink(page), query).toHaveCount(0);
  }
  await page.goto(fileUrl(FILE, '?intro=0&sound=off'));
  await press(testInfo, page.getByRole('button', { name: '놀이 방법' }));
  await expect(page.locator('.screen-howto')).toBeVisible();
  await expect(guideLink(page)).toHaveCount(0);
  await press(testInfo, page.getByRole('button', { name: '처음 화면' }));
  await press(testInfo, page.getByRole('button', { name: '학습 기록' }));
  await expect(page.locator('.screen-report')).toBeVisible();
  await expect(guideLink(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('키보드만: 학년 고르기의 Tab 차례는 학년 카드 둘 → 놀이 방법 → 학습 기록 → [선생님용 안내](초점 표시가 보인다) — Enter로 안내 페이지', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '키보드는 크롬북에서');
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?intro=0&sound=off'));
  await expect(page.locator('.grade-card')).toHaveCount(2);
  const order = [];
  for (let i = 0; i < 8 && !order.includes('teacher'); i += 1) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (el.matches('.grade-card')) return `grade-${el.dataset.grade}`;
      if (el.matches('.btn-teacher')) return 'teacher';
      return el.textContent.trim();
    }));
  }
  expect(order).toEqual(['grade-5', 'grade-6', '놀이 방법', '학습 기록', 'teacher']);
  const ring = await page.locator('.btn-teacher').evaluate((el) => ({ visible: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineStyle }));
  expect(ring).toEqual({ visible: true, outline: 'solid' });
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/teacher\.html$/);
  await expect(page.locator('.hub-card')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('선생님용 안내: [← 학년 고르기]와 입체도형 공방 카드는 인트로 없이 학년 고르기로 — 예시 게임 카드는 없고 예시 게임은 주소로 열린다. 맨 아래 저작권 글', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await watchScreens(page);
  await page.goto(fileUrl(GUIDE_FILE));
  await expect(page).toHaveTitle('선생님용 안내 - 입체도형 공방');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('입체도형 공방 선생님용 안내');
  await expect(page.locator('.lead')).toContainText('학생에게는 이 사이트 주소를 나눠 주세요.');
  await expect(page.locator('.hub-card')).toHaveCount(1);
  await expect(page.locator('.hub-card .hub-card-title')).toHaveText('입체도형 공방');
  await expect(page.locator('a[href^="sample-divisor-sort"]')).toHaveCount(0);
  await expect(page.locator('.opt-list li').filter({ hasText: '?intro=0' })).toHaveText('?intro=0인트로 없이 학년 고르기부터');
  await expect(page.locator('.hub-privacy')).toContainText('학생 기록은 사이트 주소마다 따로 남아요.');
  await expect(page.locator('.hub-privacy .site-name')).toHaveText(['eversunk2-tech.github.io/game2/', 'solid-figure.pages.dev']);
  // 맨 아래 저작권 글: 페이지의 마지막 글, 판들보다 아래
  const note = page.locator('.guide-copyright');
  await expect(note).toHaveText(COPYRIGHT);
  const [noteTop, panelsBottom] = await page.evaluate(() => [document.querySelector('.guide-copyright').getBoundingClientRect().top, Math.max(...[...document.querySelectorAll('.hub-footer > *')].map((el) => el.getBoundingClientRect().bottom))]);
  expect(noteTop).toBeGreaterThan(panelsBottom);
  expect(await hasHorizontalScroll(page)).toBe(false);
  for (const target of [page.getByRole('link', { name: '← 학년 고르기' }), page.locator('.hub-card')]) {
    await page.goto(fileUrl(GUIDE_FILE));
    await page.evaluate(() => { window.__screens = []; });
    await press(testInfo, target);
    await page.waitForURL(/\/net-workshop\.html\?intro=0$/);
    await expect(page.locator('.grade-card')).toHaveCount(2);
    expect(await screensSeen(page)).toEqual(['screen-title']);
  }
  // 예시 게임: 목록에는 없지만 주소로 열린다(엔진 검사에 쓴다 — 사용자 결정 15-13)
  await page.goto(fileUrl('sample-divisor-sort.html', '?sound=off'));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // teacherGuide·footer를 주지 않는 게임은 맨 아래 줄이 없다(화면이 전과 같다)
  await expect(page.locator('.screen-foot, .btn-teacher, .screen-copyright, .has-foot')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** WCAG 대비(이 검사가 따로 계산): "rgb(r, g, b)" 두 색 */
function contrast(fg, bg) {
  const lum = (css) => {
    const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

test('저작권 글: 학년 고르기·학년 화면 맨 아래에 글자 그대로, 본문보다 작고 차분하게(대비 4.5:1 이상) — 인트로·단계 지도·플레이·결과·놀이 방법·학습 기록에는 없다', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  const check = async (label) => {
    await expect(copyright(page), label).toHaveCount(1);
    await expect(copyright(page), label).toHaveText(COPYRIGHT);
    await settled(page);
    const m = await page.evaluate(() => {
      const el = document.querySelector('.screen-copyright');
      const s = getComputedStyle(el);
      const content = [...document.querySelectorAll('.screen > :not(.screen-foot)')].map((x) => x.getBoundingClientRect().bottom);
      return { size: parseFloat(s.fontSize), body: parseFloat(getComputedStyle(document.body).fontSize), color: s.color, bg: getComputedStyle(document.body).backgroundColor, top: el.getBoundingClientRect().top, contentBottom: Math.max(...content) };
    });
    expect(m.size, `${label}: 본문보다 작은 글자`).toBeLessThan(m.body);
    expect(contrast(m.color, m.bg), `${label}: 대비`).toBeGreaterThanOrEqual(4.5);
    expect(m.top, `${label}: 맨 아래(내용보다 아래)`).toBeGreaterThan(m.contentBottom - 1);
  };
  await page.goto(fileUrl(FILE, '?sound=off'));
  await expect(page.locator('.intro-enter')).toBeVisible();
  await expect(copyright(page), '인트로').toHaveCount(0);
  await press(testInfo, page.locator('.intro-enter'));
  await expect(page.locator('.grade-card')).toHaveCount(2);
  await check('학년 고르기');
  for (const grade of ['5', '6']) {
    await page.goto(fileUrl(FILE, `?grade=${grade}&sound=off`));
    await expect(page.locator('.screen-grade')).toBeVisible();
    await check(`${grade}학년 화면`);
  }
  // 없는 곳: 단계 지도 · 한 차시 주소 화면 · 놀이 방법 · 학습 기록 · 플레이 · 결과
  for (const [query, ready] of [['?area=cube', '.screen-stages'], ['?area=blocks', '.screen-stages'], ['?lesson=cube', '.screen-title'], ['?stage=cube-judge&seed=1', '.play-area']]) {
    await page.goto(fileUrl(FILE, `${query}&sound=off`));
    await expect(page.locator(ready)).toBeVisible();
    await expect(copyright(page), query).toHaveCount(0);
  }
  await page.goto(fileUrl(FILE, '?intro=0&sound=off'));
  await press(testInfo, page.getByRole('button', { name: '놀이 방법' }));
  await expect(page.locator('.screen-howto')).toBeVisible();
  await expect(copyright(page), '놀이 방법').toHaveCount(0);
  await press(testInfo, page.getByRole('button', { name: '처음 화면' }));
  await press(testInfo, page.getByRole('button', { name: '학습 기록' }));
  await expect(page.locator('.screen-report')).toBeVisible();
  await expect(copyright(page), '학습 기록').toHaveCount(0);
  // 결과: 쌓기 놀이터(채점 없는 연습)를 끝까지
  const stage = BLOCK_STAGES.find((s) => s.id === 'blocks-play');
  const [{ spot: [x, y] }] = makeBlockQuestions(stage, createRng('1:blocks-play'));
  const cell = page.locator(`.blk-cell[data-x="${x}"][data-y="${y}"]`);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=blocks-play'));
  await expect(page.locator('.blk-stage')).toBeVisible();
  await expect(copyright(page), '플레이(쌓기나무)').toHaveCount(0);
  await press(testInfo, cell);
  await press(testInfo, cell);
  await press(testInfo, page.locator('.blk-mode[data-mode="remove"]'));
  await press(testInfo, cell);
  await press(testInfo, page.locator('.blk-dir[data-dir="front"]'));
  await press(testInfo, page.locator('.blk-finish'));
  await expect(page.locator('.screen-result')).toBeVisible();
  await expect(copyright(page), '결과').toHaveCount(0);
  expect(errors).toEqual([]);
});

/** 맨 아래 줄(저작권 글·[선생님용 안내])과 화면의 다른 것들: 겹침, 화면 밖, 스크롤, 저작권 글이 가운데인지, 줄을 숨겼을 때와 견준 카드 자리(학년 화면) */
async function footLayout(page) {
  return page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const doc = document.documentElement;
    const screen = document.querySelector('.screen');
    const foot = document.querySelector('.screen-foot');
    const parts = [...foot.children];
    // 다른 것들: 머리와 화면의 보이는 조각(글·카드·버튼·그림) — 묶음 상자는 빼고
    const others = [...document.querySelectorAll('.topbar > *, .screen *')]
      .filter((el) => !foot.contains(el) && !el.matches('.hero-foot, .hero-more, .area-cards, .area-cards > li, .screen-head, .grade-title, .title-chips') && el.getClientRects().length > 0)
      .filter((el) => { const b = r(el); return b.width > 0 && b.height > 0; });
    const hits = [];
    for (const p of parts) {
      const a = r(p);
      for (const o of others) {
        const b = r(o);
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) hits.push(`${p.className} × ${o.className || o.tagName}`);
      }
    }
    const cs = getComputedStyle(screen);
    const inner = { left: r(screen).left + parseFloat(cs.paddingLeft), right: r(screen).right - parseFloat(cs.paddingRight) };
    const note = foot.querySelector('.screen-copyright');
    const cards = () => [...document.querySelectorAll('.area-card, .hero-more .btn, .btn-back, .workshop-card')].map((el) => { const b = r(el); return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10); });
    const withFoot = cards();
    foot.style.display = 'none';
    const without = cards();
    foot.style.display = '';
    const guide = foot.querySelector('.btn-teacher');
    return {
      hits,
      h: doc.scrollWidth - doc.clientWidth,
      v: doc.scrollHeight - innerHeight,
      moved: JSON.stringify(withFoot) !== JSON.stringify(without),
      outside: parts.filter((p) => { const b = r(p); return b.left < -0.5 || b.right > innerWidth + 0.5; }).length,
      footBottom: r(foot).bottom,
      contentBottom: Math.max(...[...screen.children].filter((el) => el !== foot).map((el) => r(el).bottom)),
      noteCenter: (r(note).left + r(note).right) / 2 - (inner.left + inner.right) / 2,
      guide: guide && { w: r(guide).width, h: r(guide).height },
    };
  });
}

/** 학년 고르기의 큰 학년 카드 안: 큰 숫자·이름·설명·별·그림이 카드 안에 있고 서로 겹치지 않는다(글이 그림 밑으로 들어가지 않는다) */
async function gradeCardInside(page) {
  return page.locator('.grade-card').evaluateAll((list) => list.flatMap((card) => {
    const r = (el) => el.getBoundingClientRect();
    const box = r(card);
    const parts = ['.grade-num', '.area-title', '.area-line', '.area-meta', '.area-art'].map((sel) => card.querySelector(sel)).filter((el) => el && el.getClientRects().length && r(el).width > 0);
    const out = [];
    for (const el of parts) {
      const b = r(el);
      if (b.left < box.left - 0.5 || b.right > box.right + 0.5 || b.top < box.top - 0.5 || b.bottom > box.bottom + 0.5) out.push(`${card.dataset.grade} ${el.className} 카드 밖`);
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${card.dataset.grade} ${el.className} 글 넘침`);
    }
    // 글(이름·설명)은 줄마다 — 그림·별과 겹치지 않는다
    const lines = ['.area-title', '.area-line'].flatMap((sel) => { const range = document.createRange(); range.selectNodeContents(card.querySelector(sel)); return [...range.getClientRects()].map((b) => ({ b, name: sel })); });
    const solid = ['.area-meta', '.area-art', '.grade-num'].map((sel) => card.querySelector(sel)).filter((el) => el && el.getClientRects().length && r(el).width > 0).map((el) => ({ b: r(el), name: el.className }));
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    for (const t of lines) for (const o of solid) if (hit(t.b, o.b)) out.push(`${card.dataset.grade} ${t.name} × ${o.name}`);
    for (let i = 0; i < solid.length; i += 1) for (let j = i + 1; j < solid.length; j += 1) if (hit(solid[i].b, solid[j].b)) out.push(`${card.dataset.grade} ${solid[i].name} × ${solid[j].name}`);
    return out;
  }));
}

test('배치(여러 크기 · 글꼴 흉내에서도): 학년 고르기(시안 A)·학년 화면에 세로 스크롤 0(휴대폰은 가로만), 맨 아래 줄은 내용과 겹치지 않고 맨 아래 가운데에 저작권 글 · 오른쪽 [선생님용 안내] 48px, 학년 카드 안이 겹치거나 넘치지 않는다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '여러 크기를 한 번에 잰다');
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const sizes = [[1366, 768], [1366, 680], [820, 1180], [390, 844], [1920, 1080], [1024, 768], [768, 1024], [1024, 600], [960, 680], [1280, 720], [1180, 820], [1440, 900], [1366, 1024], [360, 740]];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    for (const query of ['?intro=0', '?grade=5', '?grade=6']) {
      const label = `${w}×${h} ${query}`;
      await page.goto(fileUrl(FILE, `${query}&sound=off`));
      await expect(page.locator('.screen-foot')).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      await settled(page);
      const m = await footLayout(page);
      expect(m.hits, `${label} 겹침`).toEqual([]);
      expect(m.h, `${label} 가로 스크롤`).toBeLessThanOrEqual(0);
      expect(m.outside, `${label} 화면 밖`).toBe(0);
      expect(m.footBottom, `${label} 맨 아래 줄은 내용 아래`).toBeGreaterThan(m.contentBottom);
      if (w > 560) {
        expect(m.v, `${label} 세로 스크롤`).toBeLessThanOrEqual(0);
        expect(m.footBottom, `${label} 스크롤 없이 보인다`).toBeLessThanOrEqual(h);
        expect(Math.abs(m.noteCenter), `${label} 저작권 글은 가운데`).toBeLessThan(2);
      }
      if (query === '?intro=0') {
        expect(m.guide.w, label).toBeGreaterThanOrEqual(48);
        expect(m.guide.h, label).toBeGreaterThanOrEqual(48);
        expect(await gradeCardInside(page), `${label} 학년 카드 안`).toEqual([]);
      } else {
        expect(m.guide, label).toBeNull();
        expect(m.moved, `${label} 영역 카드·버튼의 자리는 맨 아래 줄이 없을 때와 같다`).toBe(false);
      }
    }
  }
  expect(errors).toEqual([]);
});

test('저장 값 그대로: 맨 위 주소(index.html)와 옛 주소(net-workshop.html)는 같은 기록을 쓴다 — 열쇠는 edu:net-workshop:… 하나뿐', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto(`${SITE_URL}?intro=0&seed=1`);
  await press(testInfo, page.locator('.grade-card[data-grade="6"]'));
  await press(testInfo, page.locator('.screen-grade .area-card[data-area="blocks"]'));
  await press(testInfo, page.locator('.stage-card').first());
  await expect(page.locator('.blk-stage')).toBeVisible();
  await press(testInfo, page.getByRole('button', { name: '← 단계 선택' }));
  await press(testInfo, page.getByRole('button', { name: /소리 켬|소리 끔/ }));
  const saved = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  expect(Object.keys(saved).length).toBeGreaterThan(0);
  for (const key of Object.keys(saved)) expect(key).toMatch(/^edu:net-workshop:/);
  expect(JSON.parse(saved['edu:net-workshop:area'])).toBe('blocks');
  // 옛 주소로 열면 같은 기록: 지난번 학년(6학년)에 "여기부터!", 소리 끔 그대로
  await page.goto(fileUrl(FILE, '?intro=0'));
  await expect(page.locator('.grade-card.is-now')).toHaveAttribute('data-grade', '6');
  await expect(page.getByRole('button', { name: /소리 끔/ })).toBeVisible();
  const again = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  expect(again).toEqual(saved);
  // 게임 폴더의 game.json id = 저장 열쇠의 이름(빌드가 바꾸지 않는다)
  expect(JSON.parse(readFileSync(path.resolve('src/games/net-workshop/game.json'), 'utf8')).id).toBe('net-workshop');
  expect(errors).toEqual([]);
});
