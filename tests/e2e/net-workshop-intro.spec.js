/**
 * 게임 인트로(B0c · spec-grade6 15-6, 2026-10-16 사용자 수정 요청): 앱을 열면 맨 처음 보이는 화면 → [입장하기] → 처음 화면(학년 고르기).
 * 그림(img/intro-bg.jpg · img/intro-title.webp)은 사용자가 캔바 시안에서 고른 것이고, 움직임·버튼·부제는 코드다.
 * 인트로는 늘 움직이므로 배치는 움직임 줄이기로 연 화면에서 재고, 움직이는 화면에서는 "보이는가·누를 수 있는가·무엇이 움직이는가"만 본다(common-rules 8절).
 * 글자 폭에 기대는 픽셀 상수는 쓰지 않는다(글꼴 흉내 E2E_WIDE_TEXT=font에서도 통과해야 한다).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

const FILE = 'net-workshop.html';
const NAME = '입체도형 공방';
const SUBTITLE = '전개도와 쌓기나무로 떠나는 도형 모험';
const ENTER = '입장하기';
const BACK = '← 처음으로';

/**
 * 그림에서 직접 잰 자리(기획서·그림만 보고 정한 독립 값 — 엔진·게임 코드를 쓰지 않는다)
 * - 배경 1680×944: 소년의 얼굴(머리카락 포함) x 300~430 · y 450~565, 소녀의 얼굴 x 1110~1230 · y 555~660
 * - 제목 1352×873: 리본 앞쪽 파란 띠의 위·아래 끝(가로 x에서, 그림을 픽셀로 훑어 잼). 부제 글자 칸이 이 안에 있어야 한다
 */
const BG = { w: 1680, h: 944 };
const FACES = { 소년: [300, 450, 430, 565], 소녀: [1110, 555, 1230, 660] };
const LOGO = { w: 1352, h: 873 };
const BAND = [[410, 709, 786], [440, 714, 793], [470, 719, 799], [500, 723, 804], [530, 727, 808], [560, 730, 811], [590, 733, 814], [620, 735, 816], [650, 737, 817],
  [680, 737, 818], [710, 737, 816], [740, 736, 814], [770, 735, 812], [800, 732, 810], [830, 729, 807], [860, 725, 805], [890, 720, 801], [920, 715, 797], [950, 709, 792],
  [980, 704, 788], [1010, 700, 780]];

const enter = (page) => page.getByRole('button', { name: ENTER });
/** 그림이 풀리고 움직임이 시작될 수 있는 상태(.is-ready)가 될 때까지 */
const introReady = (page) => page.waitForFunction(() => document.querySelector('.screen-intro.is-ready') && [...document.querySelectorAll('.intro-bg, .intro-logo')].every((el) => el.classList.contains('is-loaded')));
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
  for (const sel of ['.intro-bg', '.intro-logo', '.intro-ribbon', '.intro-sparks', '.intro-blocks', '.intro-logo-sparks']) await expect(page.locator(sel)).toHaveAttribute('aria-hidden', 'true');
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

/** 인트로 배치: 스크롤, 제목·부제·버튼·소리 버튼의 자리, 두 아이의 얼굴 자리(배경 그림의 그려진 자리로 바꿈), 부제 글자 칸과 리본 띠 */
async function introLayout(page) {
  return page.evaluate(({ BG, FACES, LOGO, BAND }) => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
    };
    const doc = document.documentElement;
    // 배경 그림이 화면에 그려진 자리: background-size(cover 또는 너비) · background-position(%)
    const bgEl = document.querySelector('.intro-bg');
    const area = box(bgEl);
    const cs = getComputedStyle(bgEl);
    let iw;
    if (cs.backgroundSize === 'cover') iw = BG.w * Math.max(area.w / BG.w, area.h / BG.h);
    else iw = parseFloat(cs.backgroundSize.split(' ')[0]);
    const ih = (iw * BG.h) / BG.w;
    const [px, py] = cs.backgroundPosition.split(' ').map((v) => parseFloat(v) / 100);
    const ox = area.x + (area.w - iw) * px;
    const oy = area.y + (area.h - ih) * py;
    const k = iw / BG.w;
    const faces = Object.fromEntries(Object.entries(FACES).map(([name, [x0, y0, x1, y1]]) => [name, { x: ox + x0 * k, y: oy + y0 * k, r: ox + x1 * k, b: oy + y1 * k }]));
    // 부제 글자 칸(글자마다, 제목 그림 좌표)이 리본 띠의 위·아래 끝 안에 있는가 — 띠 가장자리까지 남는 거리(그림 좌표)의 가장 작은 값
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
      const c = text.getExtentOfChar(i);
      const lim = band(c.x + c.width / 2);
      if (!lim || c.x < BAND[0][0] || c.x + c.width > BAND.at(-1)[0]) return -1;
      return Math.min(c.y - lim[0], lim[1] - (c.y + c.height));
    }).filter((m) => m !== null);
    const svg = document.querySelector('.intro-ribbon');
    const vb = svg.viewBox.baseVal;
    return {
      hScroll: doc.scrollWidth - doc.clientWidth,
      vScroll: doc.scrollHeight - innerHeight,
      vw: innerWidth,
      vh: innerHeight,
      logo: box(document.querySelector('.intro-logo-box')),
      button: box(document.querySelector('.intro-enter-face')),
      hit: box(document.querySelector('.intro-enter')),
      sound: box(document.querySelector('.btn-sound')),
      faces,
      ribbonMargin: Math.min(...margins),
      ribbonViewBox: [vb.width, vb.height],
      logoRatio: box(document.querySelector('.intro-logo-box')).w / box(document.querySelector('.intro-logo-box')).h,
      LOGO_RATIO: LOGO.w / LOGO.h,
    };
  }, { BG, FACES, LOGO, BAND });
}
const overlaps = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
const inside = (a, w, h) => a.x >= 0 && a.y >= 0 && a.r <= w && a.b <= h;

test('배치(네 크기 + 가로 태블릿, 움직임 줄이기): 스크롤 0, 제목·부제·버튼이 화면 안에서 겹치지 않고, 버튼이 두 아이의 얼굴을 가리지 않으며, 부제 글자가 리본 띠 안. 버튼은 48px보다 훨씬 크다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '여러 크기를 한 번에 잰다');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [w, h, wide] of [[1366, 768, 0.45], [1366, 680, 0.4], [820, 1180, 0.8], [390, 844, 0.85], [1024, 768, 0.45], [1180, 820, 0.45]]) {
    const at = `${w}×${h}`;
    await page.setViewportSize({ width: w, height: h });
    await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
    await introReady(page);
    await page.evaluate(() => document.fonts.ready);
    const m = await introLayout(page);
    expect([m.hScroll, m.vScroll], `${at} 스크롤`).toEqual([0, 0]);
    for (const [name, el] of Object.entries({ 제목: m.logo, 버튼: m.button, 소리: m.sound })) expect(inside(el, w, h), `${at} ${name}이 화면 안`).toBe(true);
    expect(overlaps(m.logo, m.button), `${at} 제목과 버튼`).toBe(false);
    expect(overlaps(m.logo, m.sound), `${at} 제목과 소리 버튼`).toBe(false);
    for (const [name, face] of Object.entries(m.faces)) {
      expect(overlaps(m.hit, face), `${at} 버튼이 ${name}의 얼굴을 가린다`).toBe(false);
      expect(overlaps(m.logo, face), `${at} 제목이 ${name}의 얼굴을 가린다`).toBe(false);
      expect(inside(face, w, h), `${at} ${name}의 얼굴이 화면 안`).toBe(true);
    }
    expect(m.ribbonMargin, `${at} 부제 글자 칸이 리본 띠 안`).toBeGreaterThan(0);
    expect(m.ribbonViewBox).toEqual([LOGO.w, LOGO.h]);
    expect(Math.abs(m.logoRatio - m.LOGO_RATIO), `${at} 제목 그림 비율`).toBeLessThan(0.01);
    // 제목 크기: 가로 화면은 화면 폭의 약 40~55%, 세로 화면은 약 80~92%
    expect(m.logo.w / w, `${at} 제목 폭`).toBeGreaterThanOrEqual(wide);
    expect(m.logo.w / w, `${at} 제목 폭`).toBeLessThanOrEqual(w > h ? 0.55 : 0.93);
    // 큰 버튼: 높이 60px 이상, 폭 200px 이상(48px 규칙보다 훨씬 크게)
    expect(m.button.h, `${at} 버튼 높이`).toBeGreaterThanOrEqual(60);
    expect(m.button.w, `${at} 버튼 폭`).toBeGreaterThanOrEqual(200);
  }
  expect(errors).toEqual([]);
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

test('그림이 풀리기 전에도 빈 화면이 아니다: 인트로 바탕은 하늘색 그러데이션, 배경 그림은 풀린 뒤 나타난다(그 전에는 투명)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'));
  expect(await page.locator('.screen-intro').evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/^linear-gradient/);
  await introReady(page);
  expect(await page.locator('.intro-bg').evaluate((el) => [getComputedStyle(el).opacity, /^url\("data:image\/jpeg/.test(getComputedStyle(el).backgroundImage)])).toEqual(['1', true]);
  expect(await page.locator('.intro-logo').evaluate((el) => /^url\("data:image\/webp/.test(getComputedStyle(el).backgroundImage))).toBe(true);
  expect(await page.locator('.intro-shine').evaluate((el) => /^url\("data:image\/webp/.test(getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage))).toBe(true);
  // 빌드 파일에 그림은 한 벌씩만 (제목 그림은 그림·빛줄기 틀 두 곳에 쓰여도 한 번)
  const html = readFileSync(path.resolve('dist', FILE), 'utf8');
  expect([html.split('data:image/jpeg').length - 1, html.split('data:image/webp').length - 1]).toEqual([1, 1]);
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
