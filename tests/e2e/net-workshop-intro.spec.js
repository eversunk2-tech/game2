/**
 * 게임 인트로(B0c · B0c2 — spec-grade6 15-6·15-9): 앱을 열면 맨 처음 보이는 화면 → [입장하기] → 처음 화면(학년 고르기).
 * 그림(img/intro-bg.jpg · img/intro-title.png — 사용자가 캔바 AI 업스케일로 받은 2880×1620 원본 바이트 그대로)은 빌드가 dist/assets/로 따로 내보낸다.
 * 놓는 규칙(selectio game과 같게): 1.35배까지만 늘리는 꽉 채우기 + 인물 칸을 자르지 않음 + 남는 띠가 5%를 넘으면 얇은 여백 카드(늘리지 않음).
 * 인트로는 늘 움직이므로 배치는 움직임 줄이기로 연 화면에서 재고, 움직이는 화면에서는 "보이는가·누를 수 있는가·무엇이 움직이는가"만 본다(common-rules 8절).
 * 글자 폭에 기대는 픽셀 상수는 쓰지 않는다(글꼴 흉내 E2E_WIDE_TEXT=font에서도 통과해야 한다).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { DIST, collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

const FILE = 'net-workshop.html';
const NAME = '입체도형 공방';
const SUBTITLE = '전개도와 쌓기나무로 떠나는 도형 모험';
const ENTER = '입장하기';
const BACK = '← 처음으로';

/**
 * 그림에서 직접 잰 자리(그림 파일을 픽셀·격자로 보고 정한 독립 값 — 엔진·게임 코드를 쓰지 않는다)
 * - 배경 2880×1620: 두 아이(꼭 보일 칸) x 160~2250 · y 630~1620(소년의 배낭·막대부터 소녀가 든 전개도까지, 몸은 그림 아래 끝까지),
 *   소년의 머리(머리카락 포함) x 425~765 · y 625~970, 소녀의 머리 x 1820~2115 · y 860~1150
 * - 제목 2880×1620(투명 바탕)에서 쓰는 상자 x 268~2564 · y 96~1578, 리본 앞쪽 파란 띠의 위·아래 끝(가로 x에서). 부제 글자 칸이 이 안에 있어야 한다
 */
const BG = { w: 2880, h: 1620 };
const KEEP = [160, 630, 2250, 1620];
const HEADS = { 소년: [425, 625, 765, 970], 소녀: [1820, 860, 2115, 1150] };
const CROP = [268, 96, 2564, 1578];
const BAND = [[850, 1286, 1438], [900, 1290, 1436], [950, 1296, 1443], [1000, 1305, 1460], [1050, 1314, 1464], [1100, 1322, 1472], [1150, 1329, 1479], [1200, 1336, 1485],
  [1250, 1341, 1490], [1300, 1345, 1494], [1350, 1348, 1496], [1400, 1349, 1498], [1450, 1350, 1498], [1500, 1349, 1497], [1550, 1346, 1494], [1600, 1342, 1491],
  [1650, 1337, 1486], [1700, 1330, 1480], [1750, 1324, 1474], [1800, 1316, 1466], [1850, 1308, 1459], [1900, 1300, 1448], [1950, 1292, 1440], [2000, 1288, 1440], [2050, 1286, 1440]];
/** 기대 모드(독립 계산 — 기획서 15-9 문장 그대로): 배율 = min(덮는 배율, 인물 칸이 들어가는 배율, 1.35 ÷ DPR), 남는 띠가 5% 이하면 꽉 채우기, 넘으면 카드 */
function expectedMode(w, h, dpr) {
  const s = Math.min(Math.max(w / BG.w, h / BG.h), w / (KEEP[2] - KEEP[0]), h / (KEEP[3] - KEEP[1]), 1.35 / dpr);
  const band = Math.max(Math.max(0, w - BG.w * s) / w, Math.max(0, h - BG.h * s) / h);
  return band <= 0.05 ? 'fill' : 'card';
}

const enter = (page) => page.getByRole('button', { name: ENTER });
/** 그림 둘이 받아져 풀리고, 제목(.is-titled)·[입장하기](.is-ready)가 나올 상태가 될 때까지 */
const introReady = (page) => page.waitForFunction(() => document.querySelector('.screen-intro.is-ready.is-titled') && [...document.querySelectorAll('.intro-bg, .intro-logo')].every((el) => el.classList.contains('is-loaded')));
const isTouch = (testInfo) => testInfo.project.name === 'tablet';
const press = (testInfo, locator) => (isTouch(testInfo) ? locator.tap() : locator.click());

test('인트로: 주소 없이 열면 인트로 — 제목(h1)·리본 위 부제(글자)·[입장하기](처음 초점). 배경·꾸밈은 화면 읽기에서 숨고, 머리에는 [소리]만. [입장하기] → 학년 고르기, [← 처음으로] → 인트로', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(page.locator('.screen-intro')).toBeVisible();
  await expect(page).toHaveTitle(NAME);
  // 화면 읽기: 제목 · 부제(글자) · 버튼. 그림·반짝임·떠오르는 입체는 숨김
  await expect(page.locator('main')).toMatchAriaSnapshot(`
    - heading "${NAME}" [level=1]
    - paragraph: ${SUBTITLE}
    - button "${ENTER}"
  `);
  await expect(enter(page)).toBeFocused();
  for (const sel of ['.intro-stage', '.intro-blur', '.intro-vignette', '.intro-logo', '.intro-ribbon', '.intro-logo-sparks']) await expect(page.locator(sel)).toHaveAttribute('aria-hidden', 'true');
  // 그림·하늘의 별·떠오르는 입체는 무대(aria-hidden) 안
  expect(await page.evaluate(() => ['.intro-bg', '.intro-sparks', '.intro-blocks'].every((sel) => document.querySelector(sel).closest('[aria-hidden="true"]')))).toBe(true);
  // 부제는 그림이 아니라 글자: 리본을 따라 휜 SVG 글(제목 글꼴)과 화면 읽기용 글이 같은 문장
  await expect(page.locator('.intro-subtitle .sr-only')).toHaveText(SUBTITLE);
  await expect(page.locator('.intro-ribbon-text textPath')).toHaveText(SUBTITLE);
  expect(await page.locator('.intro-ribbon-text').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"Do Hyeon"/);
  // 머리: 게임 이름·칭호 칩은 숨고 [소리] 버튼만 오른쪽 위에
  await expect(page.locator('#app')).toHaveClass(/is-intro/);
  await expect(page.locator('.brand')).toBeHidden();
  await expect(page.locator('.rank-chip')).toBeHidden();
  await expect(page.locator('.btn-sound')).toBeVisible();
  await expect(page.locator('.grade-card')).toHaveCount(0);
  expect(await hasHorizontalScroll(page)).toBe(false);

  await press(testInfo, enter(page));
  await expect(page.locator('.screen-intro')).toHaveCount(0);
  await expect(page.locator('.grade-card')).toHaveCount(2);
  await expect(page.locator('h1')).toHaveText(NAME);
  await expect(page.locator('#app')).not.toHaveClass(/is-intro/);
  await expect(page.locator('.brand')).toBeVisible();
  await expect(page.locator('.rank-chip')).toBeVisible();
  // 학년 고르기 화면 맨 위 왼쪽의 [← 처음으로] → 인트로로 돌아간다(다시 [입장하기]에 초점)
  await expect(page.locator('.title-chips .btn').first()).toHaveText(BACK);
  await press(testInfo, page.getByRole('button', { name: BACK }));
  await expect(page.locator('.screen-intro')).toBeVisible();
  await expect(enter(page)).toBeFocused();
  await press(testInfo, enter(page));
  await expect(page.locator('.grade-card')).toHaveCount(2);
  // 다른 화면의 [처음 화면]은 지금처럼 학년 고르기 화면으로 (인트로가 아니다)
  await page.getByRole('button', { name: '학습 기록' }).click();
  await page.getByRole('button', { name: '처음 화면' }).click();
  await expect(page.locator('.grade-card')).toHaveCount(2);
  await expect(page.locator('.screen-intro')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('키보드만: 처음 초점이 [입장하기] — Enter·Space로 들어가고, 학년 고르기 화면에서 Shift+Tab으로 [← 처음으로], 초점 표시가 보인다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '키보드는 크롬북 화면에서 확인');
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(enter(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); // [← 처음으로]는 제목 앞(맨 위 왼쪽)
  await expect(page.getByRole('button', { name: BACK })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(enter(page)).toBeFocused();
  // Tab 차례: 인트로에서 Tab으로 가는 곳은 [소리]와 [입장하기]뿐 (그림·꾸밈은 Tab에 걸리지 않는다)
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.btn-sound')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(enter(page)).toBeFocused();
  // 키보드로 다루는 중: [입장하기]의 초점 표시(노랑 후광)가 보인다
  expect(await enter(page).evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  expect(await page.locator('.intro-enter-face').evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(255, 213, 79)'); // --butter
  await page.keyboard.press('Space');
  await expect(page.locator('.grade-card')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('수업 주소(?lesson=·?area=·?grade=·?stage=)로 열면 인트로 없이 그 화면, 그 밖의 주소 옵션(?unlock=all·?sound=off·?seed=·?fx=low)만 있으면 인트로부터', async ({ page }) => {
  const errors = collectErrors(page);
  const cases = [
    ['?lesson=cube', '.screen-title'], ['?lesson=blocks-top', '.screen-title'], ['?area=blocks', '.screen-stages'], ['?grade=6', '.screen-grade'],
    ['?stage=cube-judge', '.screen-play'], ['?unlock=all&stage=blocks-copy', '.screen-play'],
    // 값이 틀려도 수업 주소이면 인트로 없이 (지금처럼 처음 화면)
    ['?area=zzz', '.screen-title'], ['?grade=7', '.screen-title'], ['?grade=', '.screen-title'], ['?lesson=zzz', '.screen-title'], ['?stage=cube-opposite', '.screen-title'],
  ];
  for (const [query, screen] of cases) {
    await page.goto(fileUrl(FILE, `${query}&seed=1&sound=off`));
    await expect(page.locator(screen), query).toBeVisible();
    await expect(page.locator('.screen-intro'), query).toHaveCount(0);
    await expect(page.locator('#app'), query).not.toHaveClass(/is-intro/);
  }
  // 한 차시 주소의 처음 화면은 지금과 같다: [← 처음으로] 없이 [시작하기]
  await page.goto(fileUrl(FILE, '?lesson=cuboid&seed=1&sound=off'));
  await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible();
  await expect(page.getByRole('button', { name: BACK })).toHaveCount(0);
  // ?grade=로 연 학년 화면 → [← 학년 고르기] → 학년 고르기 화면에는 [← 처음으로](→ 인트로)
  await page.goto(fileUrl(FILE, '?grade=6&seed=1&sound=off'));
  await page.getByRole('button', { name: '← 학년 고르기' }).click();
  await page.getByRole('button', { name: BACK }).click();
  await expect(page.locator('.screen-intro')).toBeVisible();
  for (const query of ['', '?unlock=all', '?sound=off', '?seed=3', '?fx=low', '?unlock=all&seed=1&sound=off&fx=low']) {
    await page.goto(fileUrl(FILE, query));
    await expect(page.locator('.screen-intro'), query || '(없음)').toBeVisible();
    await expect(enter(page)).toBeFocused();
  }
  expect(errors).toEqual([]);
});

/** 인트로 배치: 모드, 스크롤, 그림·무대·제목·부제·버튼·소리 버튼의 자리, 인물 칸·두 아이의 머리(그림 좌표 → 화면 좌표), 부제 글자 칸과 리본 띠 */
async function introLayout(page) {
  return page.evaluate(({ BG, KEEP, HEADS, BAND }) => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
    };
    const doc = document.documentElement;
    const screen = document.querySelector('.screen-intro');
    const img = box(document.querySelector('.intro-bg')); // 그림 상자(꽉 채우기에서는 화면 밖으로 나가는 쪽이 잘린다)
    const k = img.w / BG.w;
    const onScreen = ([x0, y0, x1, y1]) => ({ x: img.x + x0 * k, y: img.y + y0 * k, r: img.x + x1 * k, b: img.y + y1 * k });
    const text = document.querySelector('.intro-ribbon-text');
    const band = (x) => {
      for (let i = 1; i < BAND.length; i += 1) {
        if (x <= BAND[i][0]) {
          const [x0, t0, b0] = BAND[i - 1];
          const [x1, t1, b1] = BAND[i];
          const t = (x - x0) / (x1 - x0);
          return [t0 + t * (t1 - t0), b0 + t * (b1 - b0)];
        }
      }
      return null;
    };
    const margins = [...text.textContent].map((ch, i) => {
      if (!ch.trim()) return null;
      const c = text.getExtentOfChar(i); // 그림 파일 좌표(SVG viewBox = 쓰는 상자)
      const lim = band(c.x + c.width / 2);
      if (!lim || c.x < BAND[0][0] || c.x + c.width > BAND.at(-1)[0]) return -1;
      return Math.min(c.y - lim[0], lim[1] - (c.y + c.height));
    }).filter((m) => m !== null);
    const vb = document.querySelector('.intro-ribbon').viewBox.baseVal;
    const logo = box(document.querySelector('.intro-logo-box'));
    return {
      mode: screen.dataset.mode,
      ratio: (img.w * devicePixelRatio) / BG.w,
      dpr: devicePixelRatio,
      hScroll: doc.scrollWidth - doc.clientWidth,
      vScroll: doc.scrollHeight - innerHeight,
      img,
      stage: box(document.querySelector('.intro-stage')),
      logo,
      button: box(document.querySelector('.intro-enter-face')),
      hit: box(document.querySelector('.intro-enter')),
      sound: box(document.querySelector('.btn-sound')),
      keep: onScreen(KEEP),
      heads: Object.fromEntries(Object.entries(HEADS).map(([name, b]) => [name, onScreen(b)])),
      ribbonMargin: Math.min(...margins),
      ribbonViewBox: [vb.x, vb.y, vb.width, vb.height],
      logoRatio: logo.w / logo.h,
      cardStyle: (() => {
        const s = getComputedStyle(document.querySelector('.intro-stage'));
        return { radius: s.borderTopLeftRadius, shadow: s.boxShadow };
      })(),
    };
  }, { BG, KEEP, HEADS, BAND });
}
const overlaps = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
const inside = (a, w, h) => a.x >= -0.5 && a.y >= -0.5 && a.r <= w + 0.5 && a.b <= h + 0.5;

/** 결과표의 기기: [폭, 높이, devicePixelRatio] (Playwright deviceScaleFactor로) */
const DEVICES = [[1366, 768, 1], [1366, 680, 1], [820, 1180, 2], [390, 844, 3], [1024, 768, 2], [1180, 820, 2], [1280, 800, 1.5], [1280, 800, 2], [1366, 1024, 2], [1920, 1080, 1], [1920, 1080, 2], [844, 390, 3]];

test('배치(결과표의 12가지 화면·DPR, 움직임 줄이기): 모드가 규칙대로(독립 계산), 꽉 채우기는 1.35배 이하·띠 5% 이하, 카드는 늘리지 않고 다 보임. 스크롤 0, 인물 칸이 다 보이고, 제목·버튼이 두 아이의 머리를 가리지 않으며, 부제 글자가 리본 띠 안', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '여러 크기를 한 번에 잰다');
  test.setTimeout(120_000);
  for (const [w, h, dpr] of DEVICES) {
    const at = `${w}×${h}@${dpr}`;
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
    await introReady(page);
    await page.evaluate(() => document.fonts.ready);
    const m = await introLayout(page);
    expect(m.dpr, at).toBe(dpr);
    expect(m.mode, `${at} 모드`).toBe(expectedMode(w, h, dpr));
    expect([m.hScroll, m.vScroll], `${at} 스크롤`).toEqual([0, 0]);
    expect(inside(m.keep, w, h), `${at} 인물 칸(두 아이)이 다 보인다`).toBe(true);
    if (m.mode === 'fill') {
      expect(m.ratio, `${at} 늘림`).toBeLessThanOrEqual(1.35 + 1e-6);
      const bandX = (Math.max(0, m.img.x) + Math.max(0, w - m.img.r)) / w;
      const bandY = (Math.max(0, m.img.y) + Math.max(0, h - m.img.b)) / h;
      expect(Math.max(bandX, bandY), `${at} 띠`).toBeLessThanOrEqual(0.05);
      expect(m.cardStyle.radius, at).toBe('0px');
    } else {
      expect(m.ratio, `${at} 카드는 늘리지 않는다`).toBeLessThanOrEqual(1 + 1e-6);
      expect(inside(m.img, w, h), `${at} 카드 그림이 다 보인다`).toBe(true);
      expect([m.stage.x, m.stage.y, m.stage.w, m.stage.h].map(Math.round), `${at} 카드 = 그림`).toEqual([m.img.x, m.img.y, m.img.w, m.img.h].map(Math.round));
      expect(Math.round(m.img.x), `${at} 양옆 여백`).toBeGreaterThanOrEqual(12);
      expect(Math.round(m.img.y), `${at} 위 여백`).toBeGreaterThanOrEqual(12);
      expect(m.cardStyle.radius, at).toBe('18px');
      expect(m.cardStyle.shadow, `${at} 흰 테 2px`).toMatch(/rgba\(255, 255, 255, 0\.9\d*\) 0px 0px 0px 2px/);
      // [입장하기]가 카드 아래 가장자리에 걸친다
      expect(m.button.y < m.img.b && m.button.b > m.img.b, `${at} 버튼이 카드 아래 가장자리에 걸침`).toBe(true);
    }
    for (const [name, el] of Object.entries({ 제목: m.logo, 버튼: m.button, 소리: m.sound })) expect(inside(el, w, h), `${at} ${name}이 화면 안`).toBe(true);
    expect(overlaps(m.logo, m.button), `${at} 제목과 버튼`).toBe(false);
    expect(overlaps(m.logo, m.sound), `${at} 제목과 소리 버튼`).toBe(false);
    for (const [name, head] of Object.entries(m.heads)) {
      expect(overlaps(m.hit, head), `${at} 버튼이 ${name}의 머리를 가린다`).toBe(false);
      expect(overlaps(m.logo, head), `${at} 제목이 ${name}의 머리를 가린다`).toBe(false);
    }
    expect(m.ribbonMargin, `${at} 부제 글자 칸이 리본 띠 안`).toBeGreaterThan(0);
    expect(m.ribbonViewBox).toEqual([CROP[0], CROP[1], CROP[2] - CROP[0], CROP[3] - CROP[1]]);
    expect(Math.abs(m.logoRatio - (CROP[2] - CROP[0]) / (CROP[3] - CROP[1])), `${at} 제목 그림 비율`).toBeLessThan(0.01);
    expect(m.logo.w, `${at} 제목 폭`).toBeGreaterThan(Math.min(w, h) * 0.3);
    // 큰 버튼: 높이 52px 이상(48px 규칙보다 크게), 폭은 높이 × 3.2 이상(2026-10-17 사용자 요청으로 전의 56px·200px보다 작게 — spec-grade6 15-11 끝)
    expect(m.button.h, `${at} 버튼 높이`).toBeGreaterThanOrEqual(52);
    expect(m.button.w, `${at} 버튼 폭`).toBeGreaterThanOrEqual(m.button.h * 3.2 - 0.05);
    expect(errors, at).toEqual([]);
    await context.close();
  }
});

test('화면 크기·devicePixelRatio가 바뀌면 모드를 다시 정한다: 1366×768 꽉 채우기 → 820×1180 카드 → 다시 꽉 채우기, 2560×1440에서 DPR 1(꽉 채우기) → 2(1.35배를 넘어 카드)', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mode = () => page.locator('.screen-intro').getAttribute('data-mode');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(page.locator('.screen-intro')).toHaveAttribute('data-mode', 'fill');
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator('.screen-intro')).toHaveAttribute('data-mode', 'card');
  await expect(page.locator('.screen-intro')).toHaveClass(/is-card/);
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(page.locator('.screen-intro')).toHaveAttribute('data-mode', 'fill');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 2560, height: 1440, deviceScaleFactor: 1, mobile: false });
  await expect(page.locator('.screen-intro')).toHaveAttribute('data-mode', 'fill');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 2560, height: 1440, deviceScaleFactor: 2, mobile: false });
  await expect(page.locator('.screen-intro')).toHaveAttribute('data-mode', 'card');
  expect(Number(await page.locator('.screen-intro').getAttribute('data-ratio'))).toBeLessThanOrEqual(1);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  expect(await mode()).not.toBeNull();
});

test('카드 모드의 모습: 뒤에 같은 그림을 흐리게(작은 캔버스), 가장자리 어둡게, 카드는 둥근 모서리·흰 테·은은한 빛. 별·떠오르는 입체는 카드 안', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서 확인');
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await introReady(page);
  await expect(page.locator('.screen-intro')).toHaveClass(/has-blur/);
  const look = await page.evaluate(() => {
    const blur = document.querySelector('.intro-blur');
    const stage = document.querySelector('.intro-stage').getBoundingClientRect();
    const inStage = (sel) => [...document.querySelectorAll(sel)].every((el) => el.closest('.intro-stage'));
    return {
      blur: [blur.tagName, blur.width, blur.height, getComputedStyle(blur).opacity],
      vignette: getComputedStyle(document.querySelector('.intro-vignette')).opacity,
      overflow: getComputedStyle(document.querySelector('.intro-stage')).overflow,
      sparks: inStage('.intro-sparks .intro-spark') && inStage('.intro-block'),
      stageInside: stage.left >= 12 && stage.right <= innerWidth - 12,
    };
  });
  expect(look).toEqual({ blur: ['CANVAS', 96, 54, '1'], vignette: '1', overflow: 'hidden', sparks: true, stageInside: true });
  await context.close();
});

test('움직임: 제목이 떨어지고 → 부제 → 버튼, 그 뒤로 떠오르내림·빛·반짝임·숨 쉬는 버튼·떠오르는 입체. 모두 transform·opacity만 움직이고, 움직이는 중에도 [입장하기]가 보이고 눌린다. 나가면 남는 움직임이 없다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '움직임은 크롬북 화면에서 확인');
  const errors = collectErrors(page);
  // CPU 코어가 2개 이하인 기기는 저절로 ?fx=low(움직이지 않는 한 장면)가 된다 — 움직이는 화면을 보려고 코어 수를 정해 둔다
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }));
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await expect(page.locator('.screen-intro')).not.toHaveClass(/is-still/);
  await introReady(page);
  const motion = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('.screen-intro')).map((a) => {
    const el = a.effect.target;
    const props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p)))];
    return { name: a.animationName, cls: el.className?.baseVal ?? el.className, pseudo: a.effect.pseudoElement ?? null, props, infinite: a.effect.getTiming().iterations === Infinity };
  }));
  const names = new Set(motion.map((x) => x.name));
  for (const name of ['intro-drop', 'intro-float', 'intro-pop', 'intro-rise', 'intro-breathe', 'intro-shine', 'intro-twinkle', 'intro-rise-up']) expect(names.has(name), name).toBe(true);
  for (const x of motion) expect(x.props.filter((p) => !['transform', 'opacity'].includes(p)), `${x.name} (${x.cls})`).toEqual([]);
  expect(motion.filter((x) => x.infinite).length).toBeGreaterThanOrEqual(10);
  // 버튼 자리는 움직이지 않는다(숨 쉬는 것은 안쪽 층) — 움직이는 중에도 그대로 누를 수 있다
  expect(motion.filter((x) => x.cls === 'intro-enter')).toEqual([]);
  await expect(enter(page)).toBeVisible();
  await enter(page).click();
  await expect(page.locator('.grade-card')).toHaveCount(2);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length)).toBe(0);
  expect(errors).toEqual([]);
});

test('움직임 줄이기 · ?fx=low: 움직이지 않는 한 장면 — 도는 움직임 0, 제목·부제·버튼이 처음부터 제자리에 보인다', async ({ page }) => {
  const still = async () => {
    await expect(page.locator('.screen-intro')).toHaveClass(/is-still/);
    await introReady(page);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
    for (const sel of ['.intro-drop', '.intro-float', '.intro-subtitle', '.intro-enter-pulse', '.intro-enter-face', '.intro-bg']) {
      expect(await page.locator(sel).evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).transform]), sel).toEqual(['1', 'none']);
    }
    await expect(enter(page)).toBeFocused();
  };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await still();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&fx=low'));
  await expect(page.locator('#app')).toHaveClass(/fx-low/);
  await still();
});

test('그림은 따로 파일(./assets/)로 받아진다 — 받기 전에는 하늘색 바탕(빈 화면 아님), 받으면 나타난다. 받은 그림은 사용자의 2880 원본과 바이트가 같다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  expect(await page.locator('.screen-intro').evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/^linear-gradient/);
  await introReady(page);
  const urls = await page.evaluate(() => ({
    bg: getComputedStyle(document.querySelector('.intro-bg')).backgroundImage,
    logo: getComputedStyle(document.querySelector('.intro-logo')).backgroundImage,
    mask: getComputedStyle(document.querySelector('.intro-shine')).maskImage || getComputedStyle(document.querySelector('.intro-shine')).webkitMaskImage,
    bgOpacity: getComputedStyle(document.querySelector('.intro-bg')).opacity,
  }));
  expect(urls.bg).toMatch(/\/assets\/intro-bg-[A-Z0-9]+\.jpg"\)$/);
  expect(urls.logo).toMatch(/\/assets\/intro-title-[A-Z0-9]+\.png"\)$/);
  expect(urls.mask).toBe(urls.logo);
  expect(urls.bgOpacity).toBe('1');
  // 실제로 받아 풀린 그림의 크기
  const sizes = await page.evaluate(async (list) => Promise.all(list.map(async (css) => {
    const img = new Image();
    img.src = /url\("(.*)"\)/.exec(css)[1];
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  })), [urls.bg, urls.logo]);
  expect(sizes).toEqual([[2880, 1620], [2880, 1620]]);
  // 이 테스트가 연 파일 옆의 assets/: 원본과 md5가 같고, HTML 안에는 큰 그림이 data:로 다시 들어가 있지 않다
  const html = readFileSync(path.join(DIST, FILE), 'utf8');
  const md5 = (file) => createHash('md5').update(readFileSync(path.join(DIST, file))).digest('hex');
  const refs = [...html.matchAll(/url\("?\.\/(assets\/[^")]+)"?\)/g)].map((m) => m[1]).sort();
  expect(refs.map((r) => r.replace(/-[A-Z0-9]+\./, '.'))).toEqual(['assets/intro-bg.jpg', 'assets/intro-title.png']);
  expect(refs.map(md5)).toEqual(['a0ca1de662f43b43b63964d18f635e0c', 'aa28acc246cf72c99d8a9a5a1367777f']);
  expect(html).not.toMatch(/data:image\/(jpeg|png)/);
});

test('소리: [입장하기]를 누르면 짧은 효과음(종 두 번), 소리 끔이면 없다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '소리는 크롬북에서 확인');
  // 효과음은 Web Audio의 음(oscillator)으로 만든다 — 만든 음의 높이를 모은다
  await page.addInitScript(() => {
    window.tones = [];
    const make = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function createOscillator() {
      const osc = make.call(this);
      const set = osc.frequency.setValueAtTime.bind(osc.frequency);
      osc.frequency.setValueAtTime = (value, time) => {
        window.tones.push(Math.round(value));
        return set(value, time);
      };
      return osc;
    };
  });
  await page.goto(fileUrl(FILE, '?seed=1'));
  await expect(page.locator('.btn-sound')).toHaveText('소리 켬');
  await enter(page).click();
  await expect(page.locator('.grade-card')).toHaveCount(2);
  expect(await page.evaluate(() => window.tones)).toEqual([1175, 1568]); // 'unlock' (audio.js)
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  await enter(page).click();
  await expect(page.locator('.grade-card')).toHaveCount(2);
  expect(await page.evaluate(() => window.tones)).toEqual([]);
});

test('인트로가 없는 게임(예시 게임)은 그대로: 인트로·[← 처음으로] 없이 처음 화면에 [시작하기]', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl('sample-divisor-sort.html', '?seed=1&sound=off'));
  await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible();
  await expect(page.locator('.screen-intro')).toHaveCount(0);
  await expect(page.getByRole('button', { name: BACK })).toHaveCount(0);
  await expect(page.locator('#app')).not.toHaveClass(/is-intro/);
  expect(errors).toEqual([]);
});

test('학년 고르기 화면: [← 처음으로]가 더해져도 크롬북·태블릿과 작은 가로 화면(960×680 · 1024×600 · 1024×768 · 1180×820 · 1280×720)·태블릿 세로 768×1024에 세로·가로 스크롤 0, 버튼은 맨 위 왼쪽에 48px', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '여러 크기를 한 번에 잰다');
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [w, h] of [[1366, 768], [1366, 680], [820, 1180], [960, 680], [1024, 600], [1024, 768], [1180, 820], [1280, 720], [768, 1024]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
    await enter(page).click();
    await expect(page.locator('.grade-card')).toHaveCount(2);
    const m = await page.evaluate(() => {
      const doc = document.documentElement;
      const back = document.querySelector('.btn-intro').getBoundingClientRect();
      const title = document.querySelector('.title-main').getBoundingClientRect();
      return { h: doc.scrollWidth - doc.clientWidth, v: doc.scrollHeight - innerHeight, back: [back.width, back.height, back.left, back.bottom <= title.top + 0.5] };
    });
    expect([m.h, m.v], `${w}×${h}`).toEqual([0, 0]);
    expect(m.back[0], `${w}×${h} 폭`).toBeGreaterThanOrEqual(48);
    expect(m.back[1], `${w}×${h} 높이`).toBeGreaterThanOrEqual(48);
    expect(m.back[3], `${w}×${h} 제목 위`).toBe(true);
  }
});

test('차시가 하나뿐인 영역(정육면체·직육면체)의 단계 지도에는 차시 칩이 없고(제목만), 차시가 여럿인 쌓기나무는 "1차시"부터. 수업 주소 화면의 칩은 그대로', async ({ page }) => {
  for (const [area, chips] of [['cube', []], ['cuboid', []]]) {
    await page.goto(fileUrl(FILE, `?area=${area}&seed=1&sound=off`));
    await expect(page.locator('.lesson-group')).toHaveCount(1);
    await expect(page.locator('.lesson-no')).toHaveText(chips);
    await expect(page.locator('.lesson-group h3')).toHaveCount(1);
  }
  await page.goto(fileUrl(FILE, '?area=blocks&seed=1&sound=off'));
  const n = await page.locator('.lesson-group').count();
  expect(n).toBeGreaterThan(1);
  await expect(page.locator('.lesson-no')).toHaveText(Array.from({ length: n }, (_, i) => `${i + 1}차시`));
  await page.goto(fileUrl(FILE, '?lesson=cuboid&seed=1&sound=off'));
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.lesson-no')).toHaveText(['2차시']);
});

test('대비 4.5:1: 부제의 흰 글자와 그 둘레의 남색 테두리, [입장하기]의 남색 글자와 금빛 바탕(위 · 가운데 · 아래 색)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  const ratios = await page.evaluate(() => {
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = (c) => {
      const [r, g, b] = rgb(c).map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    // CSS 변수(토큰)의 색을 rgb()로
    const probe = document.createElement('span');
    document.body.append(probe);
    const color = (v) => {
      probe.style.color = v;
      return getComputedStyle(probe).color;
    };
    const text = getComputedStyle(document.querySelector('.intro-ribbon-text')).fill;
    const edge = getComputedStyle(document.querySelector('.intro-ribbon-edge')).stroke;
    const ink = getComputedStyle(document.querySelector('.intro-enter-face')).color;
    const out = { 부제: ratio(text, edge), ...Object.fromEntries(['--butter-soft', '--butter', '--star'].map((v) => [`버튼 ${v}`, ratio(ink, color(`var(${v})`))])) };
    probe.remove();
    return out;
  });
  for (const [what, r] of Object.entries(ratios)) expect(r, what).toBeGreaterThanOrEqual(4.5);
  // 버튼 바탕이 정말 그 세 색의 금빛 그러데이션이다(위 반짝임 + 금빛 + 파란 테)
  expect(await page.locator('.intro-enter-face').evaluate((el) => getComputedStyle(el).backgroundImage.split('linear-gradient').length - 1)).toBe(3);
});

/**
 * 큰 화면에서 [입장하기]도 커진다(spec-grade6 15-11 — selectio game과 같게). 기대값은 기획서 문장만으로 짠 독립 계산:
 * 배율 s = min(화면 CSS 폭 ÷ 1280, 화면 CSS 높이 ÷ 800)을 1~1.35로 묶은 값, 면 높이 = (화면 높이의 9.7%·폭의 14.7% 가운데 작은 값을 52~77로 묶어 반올림) × s,
 * 면 폭 = 높이 × 3.2, 글자 = 면 높이 × 0.51(2026-10-17 사용자 요청 "글자 크기에 비해 여백이 너무 많은거 같아" — 높이 약 8%·폭 약 18% 작게, 글자 약 12% 크게),
 * 테 6·바깥 여백 8·반짝임 18·잉크 테두리 3·아래 그림자 7·흐린 그림자 14/26·올리기 −2·누르기 +5·초점 후광 9/12(px) × s
 */
const growScale = (w, h) => Math.min(1.35, Math.max(1, Math.min(w / 1280, h / 800)));
const baseButtonHeight = (w, h) => Math.round(Math.min(77, Math.max(52, Math.min(0.097 * h, 0.147 * w))));
/** 계산된 box-shadow의 길이(px)만 차례로 (색은 뺀다) */
const shadowLengths = (shadow) => shadow.replace(/rgba?\([^)]*\)/g, '').match(/-?[\d.]+px/g).map(parseFloat);
const near = (got, want, tol) => got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) <= tol);
/** 배경 그림에서 직접 잰 소녀의 손 칸(그림 px — 손가락 끝~소매 앞, 엄지 위~손바닥 아래). [입장하기]가 가리면 왼쪽으로만 조금 비킨다(spec-grade6 15-11 끝) */
const HAND = [1675, 1378, 1795, 1442];
const area = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));

test('큰 화면의 [입장하기](움직임 줄이기): 배율 s만큼 면·글자·테·여백·반짝임·그림자·올리기/누르기 거리·초점 후광이 함께 커지고(1920×1080에서 332.6×103.95px), 초점 후광까지 화면 안, 두 아이의 머리·제목·부제·소리 버튼과 겹침 0. 소녀의 손을 가리면 왼쪽으로만 조금(한도 안 — 더 보이지 않으면 그대로)', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '여러 크기를 한 번에 잰다');
  test.setTimeout(120_000); // 10개 화면 × (열기 + 그림 풀기 + 잼) — 이 맥에서 약 3초, CPU 12배에서 약 15초
  let shape1 = null; // 배율 1(1280×800)의 면 폭 ÷ 높이: 큰 화면에서도 같은 모양(폭도 s배)
  for (const [w, h, dpr] of [[1280, 800, 1], [1366, 768, 1], [1366, 1024, 2], [1440, 900, 2], [1920, 1080, 1], [1920, 1080, 2], [2560, 1440, 2], [1024, 768, 2], [820, 1180, 2], [768, 1024, 2]]) {
    const at = `${w}×${h}@${dpr}`;
    const s = growScale(w, h);
    const faceH = baseButtonHeight(w, h) * s;
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
    await introReady(page);
    await page.evaluate(() => document.fonts.ready);
    // 키보드로 [입장하기]에 초점(초점 후광이 보이는 상태)
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(enter(page)).toBeFocused();
    const settled = () => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
    await settled();
    const m = await introLayout(page);
    const look = await page.evaluate(() => {
      const face = document.querySelector('.intro-enter-face');
      const cs = getComputedStyle(face);
      return {
        focusVisible: document.querySelector('.intro-enter').matches(':focus-visible'),
        font: parseFloat(cs.fontSize), border: parseFloat(cs.borderTopWidth), shadow: cs.boxShadow, transform: cs.transform,
        pad: parseFloat(getComputedStyle(document.querySelector('.intro-enter')).paddingTop), spark: parseFloat(getComputedStyle(face, '::after').width),
        ribbon: (() => {
          const r = document.querySelector('.intro-ribbon-text').getBoundingClientRect();
          return { x: r.left, y: r.top, r: r.right, b: r.bottom };
        })(),
      };
    });
    // 크기: 면 높이·폭·글자, 테·바깥 여백·반짝임(크롬은 테 두께를 정수 px로 내린다 — 1px 안), 초점 후광
    expect(Math.abs(m.button.h - faceH), `${at} 면 높이 ${m.button.h} / ${faceH}`).toBeLessThan(0.05);
    expect(Math.abs(m.button.w - faceH * 3.2), `${at} 면 폭 = 높이 × 3.2 (${m.button.w})`).toBeLessThan(0.05);
    if (s === 1 && h === 800) shape1 = m.button.w / m.button.h;
    expect(Math.abs(m.button.w - shape1 * faceH), `${at} 면 폭 ${m.button.w} = 높이 ${faceH} × 배율 1의 모양 ${shape1}`).toBeLessThan(1.5);
    expect(Math.abs(look.font - faceH * 0.51), `${at} 글자 ${look.font}`).toBeLessThan(0.05);
    expect(look.border, `${at} 테`).toBeGreaterThan(6 * s - 1);
    expect(look.border, `${at} 테`).toBeLessThanOrEqual(6 * s + 0.01);
    expect(Math.abs(look.pad - 8 * s), `${at} 바깥 여백 ${look.pad}`).toBeLessThan(0.02);
    expect(Math.abs(look.spark - 18 * s), `${at} 반짝임 ${look.spark}`).toBeLessThan(0.05);
    expect(look.focusVisible, `${at} 초점 표시`).toBe(true);
    expect(near(shadowLengths(look.shadow), [0, 0, 0, 3, 0, 7, 0, 3, 0, 0, 0, 9, 0, 0, 0, 12].map((v) => v * s), 0.02), `${at} 잉크 테두리·아래 그림자·초점 후광 ${look.shadow}`).toBe(true);
    expect(look.transform, `${at} 크기는 transform이 아니라 크기 자체`).toBe('none');
    // 자리: 면 + 초점 후광(12px × s)이 화면 안, 화면 밑과의 틈은 지금 규칙 그대로, 스크롤 0
    const halo = 12 * s;
    const outer = { x: m.button.x - halo, y: m.button.y - halo, r: m.button.r + halo, b: m.button.b + halo };
    expect(inside(outer, w, h), `${at} 버튼(초점 후광 포함)이 화면 안`).toBe(true);
    expect([m.hScroll, m.vScroll], `${at} 스크롤`).toEqual([0, 0]);
    if (m.mode === 'fill') expect(Math.abs(h - m.button.b - Math.max(14, 0.035 * h)), `${at} 화면 밑과의 틈 ${h - m.button.b}`).toBeLessThan(0.6);
    else expect(h - m.button.b, `${at} 화면 밑과의 틈`).toBeGreaterThanOrEqual(10 * s - 0.6);
    // 겹침 0: 두 아이의 머리(그림 좌표 → 화면) · 제목 그림 · 부제 글 · 소리 버튼
    for (const [name, head] of Object.entries(m.heads)) expect(overlaps(outer, head), `${at} 버튼이 ${name}의 머리를 가린다`).toBe(false);
    for (const [name, el] of Object.entries({ 제목: m.logo, 부제: look.ribbon, 소리: m.sound })) expect(overlaps(outer, el), `${at} 버튼과 ${name}`).toBe(false);
    // 소녀의 손: 버튼(면 + 바깥 여백 8s + 아래 그림자 10s)이 가운데 자리에서 손 칸을 가리면 왼쪽으로만, 한도 min(면 폭 × 0.2, 무대 폭 × 0.05)까지 옮긴다.
    // 옮겨도 손이 더 보이지 않으면(세로 카드) 옮기지 않는다(사용자 결정 "안 보이면 옮기지 않기")
    const k = m.img.w / BG.w;
    const hand = { x: m.img.x + HAND[0] * k, y: m.img.y + HAND[1] * k, r: m.img.x + HAND[2] * k, b: m.img.y + HAND[3] * k };
    const shown = { x: m.button.x - 8 * s, y: m.button.y - 8 * s, r: m.button.r + 8 * s, b: m.button.b + 10 * s };
    const dx = w / 2 - (m.button.x + m.button.r) / 2; // 화면 가운데에서 왼쪽으로 옮긴 거리
    const centered = { ...shown, x: shown.x + dx, r: shown.r + dx };
    const limit = Math.min(0.2 * m.button.w, 0.05 * m.stage.w);
    expect(dx, `${at} 왼쪽으로만`).toBeGreaterThanOrEqual(-0.5);
    expect(dx, `${at} 한도 ${limit} 안`).toBeLessThanOrEqual(limit + 0.5);
    if (dx > 0.5) {
      expect(area(shown, hand), `${at} 옮겼으면 손이 더 보인다`).toBeLessThan(area(centered, hand));
      if (dx < limit - 0.5) expect(area(shown, hand), `${at} 한도 안에서 옮겼으면 손이 다 보인다`).toBeLessThan(1);
    } else {
      expect(Math.abs(dx), `${at} 옮기지 않으면 가운데 그대로`).toBeLessThan(0.5);
      // 가운데에서 손을 가린다면: 한도까지 옮겨도 손이 더 보이지 않는 화면이어야 한다
      const most = Math.min(centered.r - hand.x, limit);
      if (area(centered, hand) > 0) expect(area({ ...centered, x: centered.x - most, r: centered.r - most }, hand), `${at} 옮겨도 손이 더 보이지 않아 그대로`).toBeGreaterThanOrEqual(area(centered, hand) - 0.5);
    }
    if (w === 768) expect([Math.abs(dx) < 0.5, area(centered, hand) > 0], `${at} 세로 카드: 손은 버튼 아래, 버튼은 가운데 그대로`).toEqual([true, true]);
    if (w === 1920) {
      expect(area(centered, hand), `${at} 가운데 자리는 손을 가린다(옮겨야 하는 화면)`).toBeGreaterThan(0);
      expect(area(shown, hand), `${at} 옮긴 뒤 손이 다 보인다`).toBeLessThan(1);
    }
    // 올리기·누르기: 움직이는 거리와 그림자도 s배 (초점을 빼고 잰다 — 초점 후광이 그림자를 덮으므로)
    await page.evaluate(() => document.activeElement.blur());
    await page.mouse.move(m.button.x + m.button.w / 2, m.button.y + m.button.h / 2);
    await settled();
    const faceNow = () => page.locator('.intro-enter-face').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { dy: new DOMMatrixReadOnly(cs.transform).m42, shadow: cs.boxShadow };
    });
    const hover = await faceNow();
    expect(Math.abs(hover.dy - -2 * s), `${at} 올리기 ${hover.dy}`).toBeLessThan(0.02);
    expect(near(shadowLengths(hover.shadow), [0, 0, 0, 3, 0, 9, 0, 3, 0, 16, 28, 0].map((v) => v * s), 0.02), `${at} 올린 그림자 ${hover.shadow}`).toBe(true);
    await page.mouse.down();
    await settled();
    const down = await faceNow();
    expect(Math.abs(down.dy - 5 * s), `${at} 누르기 ${down.dy}`).toBeLessThan(0.02);
    expect(near(shadowLengths(down.shadow), [0, 0, 0, 3, 0, 2, 0, 3, 0, 6, 12, 0].map((v) => v * s), 0.02), `${at} 누른 그림자 ${down.shadow}`).toBe(true);
    // 버튼 밖에서 놓으면 들어가지 않는다(인트로 그대로) — 다음 화면을 열지 않고 끝낸다
    await page.mouse.move(4, h / 2);
    await page.mouse.up();
    await expect(page.locator('.screen-intro')).toBeVisible();
    expect(errors, at).toEqual([]);
    await context.close();
  }
});
