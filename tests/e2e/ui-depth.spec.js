/**
 * 버튼 · 메뉴의 입체 표현 "차분한 면 + 은은한 그림자 + 올리면 살짝 떠오름" (spec-grade6 15-44 · 15-45, plan-ui-depth.md, build-brief-ui-depth.md).
 *
 * ① UI 틀(버튼 · 카드 · 탭 · 칩 · 판 · 알림 · 이름표 · 띠)에 잉크 색 테두리와 흐림 없는 덧붙은 두께(아래 · 옆으로 밀린 단단한 그림자), 기울인 스티커가 남지 않는다.
 *    계산된 모양으로 본다(화면 그림이 아니라 getComputedStyle). 학습 내용(전개도 면 · 쌓기나무 · 판 칸 · 도감 칸 · 면 카드 · 상자 카드)은 범위 밖이라 보지 않는다.
 * ② 누를 수 있는 것은 쉴 때 은은한 그림자(흐림 있음)가 있고, 마우스를 올리면 버튼 · 탭은 2px · 단계 카드는 3px · 학년 / 영역 카드는 4px 떠오르며 그림자가 바뀐다.
 *    움직이는 것은 transform뿐(그림자는 전환하지 않는다), 누르면 면이 진해지고 제자리. 읽는 판의 그림자는 아주 옅다(흐림 2px 이하).
 *    움직임 줄이기 · ?fx=low에서는 떠오르지 않는다. ?fx=low는 흐림 없는 그림자만(plan 3-5 ④의 안전판).
 * 기대값은 기획서 문장(15-45 · 지침 1~9)만 보고 적었다 — 저장소 CSS의 값을 읽어 와 견주지 않는다.
 */
import { expect, test } from '@playwright/test';
import { collectErrors, fileUrl } from './helpers.js';

const FILE = 'net-workshop.html';
const INK = 'rgb(30, 33, 64)';
const INK_2 = 'rgb(78, 84, 115)';

/** UI 틀 선택자(지침 1~4 · plan 1-1 표의 "UI 틀" 줄). 학습 내용(net-face · blk-cell · tray-card · size-card · dex-slot 등)은 넣지 않는다 */
const FRAME = [
  '.btn', '.stage-card', '.area-card', '.free-space-card', '.free-space-art', '.area-tab', '.stage-medal', '.flag', '.go-pill',
  '.chip', '.eyebrow', '.rank-chip', '.brand-mark', '.howto-no', '.order-kind', '.meta-box', '.xp-bar', '.xp-fill', '.grade-num',
  '.sheet', '.panel', '.note', '.toast', '.input', '.play-loading',
  '.mat', '.fold-slider', '.mat-status', '.view-tip', '.board-legend', '.stage-badge', '.hint-sticky', '.hero-sticky', '.hero-mat',
  '.blk-free-strip', '.blk-free-colors', '.blk-padbox', '.blk-key', '.blk-figure', '.blk-task', '.blk-free-notice-card',
  '.box-tag', '.box-caption', '.turn-handle', '.dex-meter', '.dex-board', '.pf-pic', '.pf-card-count', '.pc-board', '.pc-legend', '.pc-fact-num',
  '.hub-card', '.hub-cover', '.cover-paper', '.status-ribbon',
].join(', ');
/** 원래 기울어진 것(띠 모양 리본 — 모서리에 비스듬히 두르는 것이 그 모양 자체) */
const TILT_OK = '.status-ribbon';

/** 화면에 보이는 UI 틀 요소마다 테두리 · 그림자 · 기울임을 모은다 */
const frameLook = (page) => page.evaluate(({ FRAME, TILT_OK }) => {
  const out = [];
  for (const el of document.querySelectorAll(FRAME)) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((k) => ({ w: parseFloat(cs[`border${k}Width`]), style: cs[`border${k}Style`], color: cs[`border${k}Color`] }))
      .filter((b) => b.w >= 1 && b.style !== 'none' && b.style !== 'hidden');
    const shadows = cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\))/).map((p) => {
      const color = (p.match(/rgba?\([^)]*\)/) || [''])[0];
      const n = p.replace(color, '').match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
      return { color, inset: /inset/.test(p), x: n[0] ?? 0, y: n[1] ?? 0, blur: n[2] ?? 0 };
    });
    const m = cs.transform === 'none' ? null : new DOMMatrixReadOnly(cs.transform);
    const tilt = m ? Math.abs(Math.atan2(m.b, m.a) * 180 / Math.PI) : 0;
    out.push({
      name: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`,
      borders: sides.map((b) => b.color),
      hard: shadows.filter((s) => !s.inset && s.blur === 0 && (Math.abs(s.x) >= 2 || Math.abs(s.y) >= 2)).map((s) => `${s.color} ${s.x} ${s.y}`),
      tilt: el.matches(TILT_OK) ? 0 : Math.round(tilt * 10) / 10,
    });
  }
  const tape = document.querySelector('.tape');
  // 테이프(.tape::before)를 그리지 않는다: 만들어지는 내용이 없다(content none · normal = 그 가상 요소가 생기지 않음)
  const made = tape ? getComputedStyle(tape, '::before').content : 'none';
  return { items: out, tape: ['none', 'normal'].includes(made) ? 'none' : made };
}, { FRAME, TILT_OK });

function expectNoInkFrame(look, where) {
  expect(look.items.length, `${where}: UI 틀 요소가 보인다`).toBeGreaterThan(3);
  const inkBorder = look.items.filter((x) => x.borders.some((c) => c === INK || c === INK_2)).map((x) => `${x.name} ${x.borders.join('/')}`);
  const hard = look.items.filter((x) => x.hard.length).map((x) => `${x.name} ${x.hard.join(' · ')}`);
  const tilted = look.items.filter((x) => x.tilt > 0.5).map((x) => `${x.name} ${x.tilt}°`);
  expect(inkBorder, `${where}: 잉크 색 테두리`).toEqual([]);
  expect(hard, `${where}: 흐림 없는 덧붙은 두께(2px 이상 밀린 단단한 그림자)`).toEqual([]);
  expect(tilted, `${where}: 기울인 스티커 · 꼬리표`).toEqual([]);
  expect(look.tape, `${where}: 테이프`).toBe('none');
}

const animationsDone = (page) => page.waitForFunction(() => document.getAnimations({ subtree: true }).every((a) => a.effect?.getTiming?.().iterations === Infinity || a.playState !== 'running'));

test('① UI 틀에 잉크 색 테두리 · 흐림 없는 덧붙은 두께 · 기울인 스티커가 남지 않는다(학년 고르기 · 영역 · 단계 지도 · 놀이 · 결과 · 기록 · 선생님용 안내 · 예시 게임, 계산된 모양)', async ({ page }, testInfo) => {
  test.setTimeout(120_000); // 화면 14곳 열기 + 몇 번 누르기 — 이 맥에서 약 15초, CPU 12배에서 약 60초
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const visit = async (query, wait, where, file = FILE) => {
    await page.goto(fileUrl(file, query));
    await expect(page.locator(wait).first()).toBeVisible({ timeout: 20_000 });
    await animationsDone(page);
    expectNoInkFrame(await frameLook(page), `${testInfo.project.name} ${where}`);
  };
  await visit('?intro=0&seed=1&sound=off', '.grade-card', '학년 고르기');
  await visit('?intro=0&grade=6&seed=1&sound=off', '.screen-grade .area-card', '6학년 영역');
  await visit('?intro=0&area=prism&seed=1&sound=off', '.stage-card', '단계 지도(각기둥)');
  await visit('?intro=0&area=blocks&seed=1&sound=off', '.free-space-card', '단계 지도(쌓기나무)');
  // 놀이: 답한 뒤(고른 답 · 까닭 쪽지 · 결과 이름표 · 보기 조작판 · 알림이 함께 보인다)
  await visit('?unlock=all&seed=1&sound=off&stage=cube-judge', '.answer-btn', '정육면체 답하기 전');
  await page.locator('.answer-btn').first().click();
  await expect(page.locator('.stage-badge')).toBeVisible();
  expectNoInkFrame(await frameLook(page), `${testInfo.project.name} 정육면체 답한 뒤(알림 포함)`);
  await visit('?unlock=all&seed=1&sound=off&stage=cuboid-dex', '.play-area .mat', '직육면체 도감 주문');
  await visit('?unlock=all&seed=1&sound=off&stage=cuboid-free', '.play-area .mat', '직육면체 내 맘대로');
  await visit('?unlock=all&seed=1&sound=off&stage=prism-free', '.play-area .mat', '각기둥 전개도 완성하기');
  await visit('?unlock=all&seed=1&sound=off&stage=prism-count', '.play-area .mat', '각기둥 도전');
  await visit('?unlock=all&seed=1&sound=off&stage=blocks-scene', '.blk-choice', '쌓기나무 이쪽에서 보면?');
  await visit('?unlock=all&seed=1&sound=off&stage=blocks-free', '.blk-free-strip', '자유 쌓기');
  if (testInfo.project.name === 'chromebook') {
    // 펼친 판 · 색 고르기(뜬 판)까지
    await page.locator('.blk-free-pad').click();
    await page.locator('.blk-free-color').click();
    await expect(page.locator('.blk-free-colors')).toBeVisible();
    await animationsDone(page);
    expectNoInkFrame(await frameLook(page), `${testInfo.project.name} 자유 쌓기(위에서 본 판 · 색 펼침)`);
    // 휴대폰 폭(학년 카드의 색 칸 아래 · 옆 가름선이 바뀌는 폭)
    await page.setViewportSize({ width: 390, height: 844 });
    await visit('?intro=0&seed=1&sound=off', '.grade-card', '휴대폰 학년 고르기');
    await visit('?intro=0&area=prism&seed=1&sound=off', '.stage-card', '휴대폰 단계 지도');
    await page.setViewportSize({ width: 1366, height: 768 });
  }
  await visit('?intro=0&seed=1&sound=off', '.grade-card', '학년 고르기(기록으로)');
  await page.getByRole('button', { name: '학습 기록' }).click();
  await expect(page.locator('.summary-tiles').first()).toBeVisible();
  await animationsDone(page);
  expectNoInkFrame(await frameLook(page), `${testInfo.project.name} 학습 기록`);
  await visit('', '.hub-card', '선생님용 안내', 'teacher.html');
  await visit('?seed=1&sound=off', '.btn', '예시 게임', 'sample-divisor-sort.html');
  expect(errors).toEqual([]);
});

/** 계산된 모양 하나: 떠오른 거리(transform의 y) · 그림자 · 면 색 · 자리(transform을 뺀 문서 기준) · 전환하는 속성과 시간 */
const lookOf = (locator) => locator.evaluate((el) => {
  const cs = getComputedStyle(el);
  let x = 0;
  let y = 0;
  for (let e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
  const shadows = cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\))/).map((p) => {
    const color = (p.match(/rgba?\([^)]*\)/) || [''])[0];
    const n = p.replace(color, '').match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
    return { inset: /inset/.test(p), y: n[1] ?? 0, blur: n[2] ?? 0, spread: n[3] ?? 0 };
  }).filter((s) => !s.inset && !(s.y === 0 && s.blur === 0)); // 바깥 그림자만(초점 후광 같은 퍼짐 고리는 뺀다)
  const lum = (c) => {
    const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map((v) => {
      const t = Number(v) / 255;
      return t <= 0.03928 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  return {
    dy: cs.transform === 'none' ? 0 : new DOMMatrixReadOnly(cs.transform).m42,
    shadow: cs.boxShadow,
    shadows,
    reach: Math.max(0, ...shadows.map((s) => s.y + s.blur + s.spread)), // 그림자가 아래로 닿는 거리
    face: lum(cs.backgroundColor),
    at: [x, y],
    transition: cs.transitionProperty.split(',').map((t) => t.trim()),
    duration: cs.transitionDuration.split(',').map((t) => t.trim()),
  };
});
const settle = (locator) => locator.evaluate((el) => new Promise((done) => {
  const check = () => (el.getAnimations().every((a) => a.playState !== 'running') ? done() : requestAnimationFrame(check));
  check();
}));

/** 누를 수 있는 것: [이름, 열 주소, 선택자, 떠오르는 거리(px), 전환 시간] — 지침 1 "2px(큰 카드는 4px까지) · 0.2초(큰 카드 0.3초)" */
const KEYS = [
  ['보통 버튼', '?intro=0&seed=1&sound=off', '.hero-more .btn >> nth=0', 2, '0.2s'],
  ['돌아가기', '?intro=0&seed=1&sound=off', '.btn-intro', 2, '0.2s'],
  ['선생님용 안내', '?intro=0&seed=1&sound=off', '.btn-teacher', 2, '0.2s'],
  ['학년 카드', '?intro=0&seed=1&sound=off', '.grade-card >> nth=0', 4, '0.3s'],
  ['영역 카드', '?intro=0&grade=6&seed=1&sound=off', '.screen-grade .area-card >> nth=1', 4, '0.3s'],
  ['영역 탭', '?intro=0&area=prism&seed=1&sound=off', '.area-tab:not(.is-current)', 2, '0.2s'],
  ['단계 카드', '?intro=0&area=prism&unlock=all&seed=1&sound=off', '.stage-card:not([disabled]) >> nth=1', 3, '0.3s'],
  ['자유 공간 카드', '?intro=0&area=blocks&seed=1&sound=off', '.free-space-card', 3, '0.3s'],
  ['답 버튼', '?unlock=all&seed=1&sound=off&stage=cube-judge', '.answer-btn >> nth=0', 2, '0.2s'],
  ['도구 띠 버튼', '?unlock=all&seed=1&sound=off&stage=blocks-free', '.blk-free-pad', 2, '0.2s'],
];

for (const [mode, label] of [['motion', '움직임 켬'], ['reduce', '움직임 줄이기'], ['fxlow', '?fx=low']]) {
  test(`② 누를 수 있는 것: 쉴 때 은은한 그림자, 올리면 ${mode === 'motion' ? '2 · 3 · 4px 떠오르고(transform만)' : '떠오르지 않고'} 그림자가 바뀌며, 누르면 면이 진해지고 제자리 — ${label}`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromebook', '마우스 올림은 크롬북 화면에서 확인(태블릿은 누름만 — 아래 "누름" 줄이 같은 규칙)');
    test.setTimeout(90_000); // 누르는 것 10가지 × (열기 + 올림 + 누름) — 이 맥에서 약 12초, CPU 12배에서 약 50초
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: mode === 'reduce' ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    const errors = collectErrors(page);
    let opened = '';
    for (const [name, query, sel, rise, dur] of KEYS) {
      const q = mode === 'fxlow' ? `${query}&fx=low` : query;
      if (q !== opened) {
        await page.mouse.move(2, 2);
        await page.goto(fileUrl(FILE, q));
        await expect(page.locator(sel).first()).toBeVisible({ timeout: 20_000 });
        await animationsDone(page);
        opened = q;
      }
      const el = page.locator(sel).first();
      await page.mouse.move(2, 2);
      await settle(el);
      const rest = await lookOf(el);
      // 움직이는 것은 transform(+ 색), 그림자는 전환하지 않는다
      expect(rest.transition, `${name} 전환 속성`).toContain('transform');
      expect(rest.transition.some((p) => /shadow|all/.test(p)), `${name} 그림자는 전환하지 않는다 ${rest.transition}`).toBe(false);
      if (mode !== 'reduce') expect(rest.duration[rest.transition.indexOf('transform')], `${name} 떠오르는 시간`).toBe(dur);
      // 쉴 때: 떠 있지 않고, 은은한 그림자(?fx=low는 흐림 없는 얇은 그림자 — 1px)
      expect(Math.abs(rest.dy), `${name} 쉴 때 자리`).toBeLessThan(0.01);
      expect(rest.shadows.length, `${name} 쉴 때 그림자 ${rest.shadow}`).toBeGreaterThan(0);
      if (mode === 'fxlow') for (const s of rest.shadows) expect([s.blur, s.y <= 1], `${name} ?fx=low 흐림 없는 얇은 그림자 ${rest.shadow}`).toEqual([0, true]);
      else {
        expect(Math.max(...rest.shadows.map((s) => s.blur)), `${name} 은은한 그림자(흐림 있음) ${rest.shadow}`).toBeGreaterThan(0);
        for (const s of rest.shadows) expect(s.blur, `${name} 흐림 20px 이하 ${rest.shadow}`).toBeLessThanOrEqual(20);
      }
      // 올림
      const box = await el.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await settle(el);
      const up = await lookOf(el);
      expect(up.at, `${name} 올려도 자리(transform을 뺀 상자)는 그대로`).toEqual(rest.at);
      expect(up.dy, `${name} 올리면 ${mode === 'motion' ? `${rise}px 떠오름` : '떠오르지 않음'}`).toBeCloseTo(mode === 'motion' ? -rise : 0, 2);
      expect(up.shadow, `${name} 올리면 그림자가 바뀐다`).not.toBe(rest.shadow);
      if (mode !== 'fxlow') {
        expect(up.reach, `${name} 올리면 그림자가 커진다 ${rest.shadow} → ${up.shadow}`).toBeGreaterThan(rest.reach);
        for (const s of up.shadows) expect(s.blur, `${name} 흐림 20px 이하 ${up.shadow}`).toBeLessThanOrEqual(20);
      } else for (const s of up.shadows) expect(s.blur, `${name} ?fx=low 흐림 없음 ${up.shadow}`).toBe(0);
      // 누름: 면이 진해지고(밝기가 낮아짐) 제자리, 그림자는 쉴 때보다 작다(아래로 덧붙는 두께 없음)
      await page.mouse.down();
      await settle(el);
      const down = await lookOf(el);
      expect(down.dy, `${name} 누르면 제자리`).toBeCloseTo(0, 2);
      expect(down.face, `${name} 누르면 면이 진해진다`).toBeLessThan(rest.face);
      expect(down.reach, `${name} 누른 그림자 ${down.shadow}`).toBeLessThan(Math.max(rest.reach, 1.01));
      await page.mouse.move(2, 2);
      await page.mouse.up(); // 다른 곳에서 놓아 누르기를 끝내지 않는다(화면을 옮기지 않음)
    }
    // 읽는 판(차시 판)은 그림자가 아주 옅다 — 누르는 것보다 낮은 층(흐림 2px 이하 · 아래로 1px 이하)
    await page.goto(fileUrl(FILE, `?intro=0&area=prism&seed=1&sound=off${mode === 'fxlow' ? '&fx=low' : ''}`));
    await expect(page.locator('.lesson-group')).toBeVisible();
    await animationsDone(page);
    const board = await lookOf(page.locator('.lesson-group'));
    for (const s of board.shadows) expect([s.blur <= 2, s.y <= 1], `읽는 판 그림자 ${board.shadow}`).toEqual([true, true]);
    const card = await lookOf(page.locator('.stage-card').first());
    if (mode !== 'fxlow') expect(card.reach, `누르는 카드(${card.shadow})가 읽는 판(${board.shadow})보다 높다`).toBeGreaterThan(board.reach);
    expect(errors).toEqual([]);
    await context.close();
  });
}
