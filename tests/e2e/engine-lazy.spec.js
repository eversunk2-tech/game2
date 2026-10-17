import { expect, test } from '@playwright/test';
import { collectErrors, fileUrl } from './helpers.js';

/**
 * 늦게 불러오기 (B0b — docs/engine.md 2절 "늦게 불러오기", spec-grade6.md 7-4·7-5절).
 * 쌓기나무의 플레이 묶음(assets/blocks-play-해시.js)은 그 영역의 단계에 들어갈 때 import()로 받고, 처음 화면이 그려진 뒤 한가할 때 미리 받아 둔다.
 * 받는 동안 0.4초가 넘으면 "불러오는 중", 기다리는 사이에 나가면 받은 뒤 아무것도 그리지 않고 정리, 받지 못하면 불러오기 실패 화면.
 * 처음 스크립트를 받지 못하면 HTML의 onerror가 한 번만 새로 고친다(core/reload.js).
 * 받는 때를 시간으로 흉내 내지 않는다: 그 파일의 요청을 붙잡아 두었다가(route) 검사가 놓아준다.
 */
const FILE = 'net-workshop.html';
const BLOCKS = '**/assets/blocks-play-*.js';
const isTouch = (testInfo) => testInfo.project.name === 'tablet';
const press = (testInfo, locator) => (isTouch(testInfo) ? locator.tap() : locator.click());
/** 브라우저가 스스로 남기는 받기 실패 줄(일부러 실패시킨 요청) — 앱의 오류가 아니다 */
const notNetwork = (errors) => errors.filter((e) => !/Failed to load resource|net::ERR_/.test(e));

/** 요청을 붙잡아 두는 문: 놓아주기 전까지 그 파일을 받지 못한다 */
async function holdRequests(page, pattern) {
  let open;
  const gate = new Promise((resolve) => { open = resolve; });
  const held = [];
  await page.route(pattern, async (route) => {
    held.push(route.request().url());
    await gate;
    await route.continue();
  });
  return { open: () => open(), held };
}

/** 화면에 .play-loading이 한 번이라도 붙었는지 적어 둔다(짧게 보였다 사라진 것도) */
const watchLoading = (page) => page.addInitScript(() => {
  window.__loadingSeen = 0;
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches('.play-loading') || n.querySelector('.play-loading'))) window.__loadingSeen += 1;
  }).observe(document, { childList: true, subtree: true });
});

/** window·document에 걸린 리스너 수(걸고 뗀 것을 센다) */
const watchListeners = (page) => page.addInitScript(() => {
  window.__listeners = 0;
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    const live = new Set();
    target.addEventListener = (type, fn, opts) => {
      const key = `${type}`;
      if (fn && !live.has(fn)) { live.add(fn); window.__listeners += 1; fn.__key = key; }
      return add(type, fn, opts);
    };
    target.removeEventListener = (type, fn, opts) => {
      if (fn && live.has(fn)) { live.delete(fn); window.__listeners -= 1; }
      return remove(type, fn, opts);
    };
  }
});

const nextFrames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

test('미리 받기: 처음 화면이 그려진 뒤 한가할 때 쌓기나무 묶음을 받아 둔다 — 그 뒤 쌓기나무 단계에 들어가면 "불러오는 중" 없이 바로 그린다', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await watchLoading(page);
  const fetched = page.waitForResponse((r) => /\/assets\/blocks-play-[A-Z0-9]+\.js$/.test(r.url()));
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=blocks'));
  await expect(page.locator('.screen-stages')).toBeVisible();
  // 누르기 전에 받아진다(사람이 아무것도 하지 않아도)
  expect((await fetched).status()).toBe(200);
  await page.evaluate(() => new Promise((resolve) => (window.requestIdleCallback ?? setTimeout)(resolve)));
  await press(testInfo, page.locator('.stage-card').first());
  await expect(page.locator('.blk-stage')).toBeVisible();
  await nextFrames(page);
  expect(await page.evaluate(() => window.__loadingSeen)).toBe(0);
  expect(errors).toEqual([]);
});

test('받는 동안(0.4초가 넘으면) 화면 가운데에 "불러오는 중이에요"(화면 읽기 알림) — 받으면 사라지고 단계가 그려진다. 머리는 움직이지 않는다', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  const hold = await holdRequests(page, BLOCKS);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=blocks-copy'));
  const header = page.locator('.play-header');
  await expect(header).toBeVisible();
  await expect(page.locator('.play-title')).toHaveText('똑같이 만들기');
  const loading = page.locator('.play-loading');
  await expect(loading).toBeVisible();
  await expect(loading).toHaveText('불러오는 중이에요');
  await expect(loading).toHaveAttribute('role', 'status');
  expect(hold.held.length).toBeGreaterThan(0);
  // 떠 있는 쪽지라 무대·머리의 자리를 차지하지 않는다
  expect(await loading.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  expect(await page.locator('.play-area').evaluate((el) => el.childElementCount)).toBe(0);
  const before = await header.boundingBox();
  hold.open();
  await expect(page.locator('.blk-stage')).toBeVisible();
  await expect(loading).toHaveCount(0);
  await page.waitForFunction(() => document.getAnimations({ subtree: true }).every((a) => a.playState !== 'running' || a.effect?.getTiming?.().iterations === Infinity));
  expect(await header.boundingBox()).toEqual(before);
  expect(errors).toEqual([]);
});

test('짧게 걸리면(이미 받은 묶음) "불러오는 중"은 한 번도 보이지 않는다 · 예시 게임(늦게 받는 묶음 없음)도 보이지 않는다', async ({ page }) => {
  const errors = collectErrors(page);
  await watchLoading(page);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=blocks-play'));
  await expect(page.locator('.blk-stage')).toBeVisible();
  // 처음 받을 때는 망·기기에 따라 0.4초를 넘을 수 있다 — 그 뒤(이미 받은 묶음)만 센다
  await page.evaluate(() => { window.__loadingSeen = 0; });
  await page.getByRole('button', { name: '← 단계 선택' }).click();
  await page.locator('.stage-card').first().click();
  await expect(page.locator('.blk-stage')).toBeVisible();
  await nextFrames(page);
  expect(await page.evaluate(() => window.__loadingSeen)).toBe(0);
  await page.goto(fileUrl('sample-divisor-sort.html', '?unlock=all&seed=1&sound=off&stage=divisors-of-12'));
  await expect(page.locator('.play-area .dnd-item').first()).toBeVisible();
  await nextFrames(page);
  expect(await page.evaluate(() => window.__loadingSeen)).toBe(0);
  expect(errors).toEqual([]);
});

test('기다리는 사이에 나가면: 받은 뒤 아무것도 그리지 않고 정리한다(쌓기나무 화면·알림·리스너가 남지 않는다). 다시 들어가면 그대로 된다', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await watchListeners(page);
  const hold = await holdRequests(page, BLOCKS);
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=blocks'));
  await expect(page.locator('.screen-stages')).toBeVisible();
  await nextFrames(page);
  const baseline = await page.evaluate(() => window.__listeners);
  await press(testInfo, page.locator('.stage-card').first());
  await expect(page.locator('.play-title')).toHaveText('쌓기 놀이터');
  await press(testInfo, page.getByRole('button', { name: '← 단계 선택' }));
  await expect(page.locator('.screen-stages')).toBeVisible();
  const arrived = page.waitForResponse((r) => /\/assets\/blocks-play-[A-Z0-9]+\.js$/.test(r.url()));
  hold.open();
  await arrived;
  // 받은 모듈이 풀린 뒤(같은 모듈을 한 번 더 import — 이미 풀린 것) 엔진의 뒤처리까지 두 프레임
  await page.evaluate((url) => import(url), (await arrived).url());
  await nextFrames(page);
  await expect(page.locator('.screen-stages')).toBeVisible();
  expect(await page.locator('.play-area, .blk-stage, .play-loading, .screen-reload').count()).toBe(0);
  expect(await page.locator('.toast').count()).toBe(0);
  expect(await page.evaluate(() => window.__listeners)).toBe(baseline);
  // 학습 기록에 시작만 하고 그만둔 판이 남지 않는다
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:log') ?? '[]').length)).toBe(0);
  // 다시 들어가면 그대로 된다
  await press(testInfo, page.locator('.stage-card').first());
  await expect(page.locator('.blk-stage')).toBeVisible();
  expect(errors).toEqual([]);
});

test('받지 못하면(새 버전을 올린 직후 옛 파일이 없음) 불러오기 실패 화면: "새 버전이 올라왔어요" + [새로 고침] · [단계 선택]. [새로 고침]이면 새로 열려 그 단계에 들어갈 수 있다', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.route(BLOCKS, (route) => route.fulfill({ status: 404, body: 'gone' }));
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&area=blocks'));
  await expect(page.locator('.screen-stages')).toBeVisible();
  await press(testInfo, page.locator('.stage-card').first());
  const screen = page.locator('.screen-reload');
  await expect(screen).toBeVisible();
  await expect(screen.getByRole('heading', { level: 2 })).toHaveText('새 버전이 올라왔어요');
  await expect(screen).toContainText('[새로 고침]을 누르면 새 버전으로 다시 열려요.');
  await expect(screen).toContainText('모은 별과 학습 기록은 그대로 남아 있어요.');
  await expect(page.locator('.play-loading')).toHaveCount(0);
  const reload = screen.getByRole('button', { name: '새로 고침' });
  const back = screen.getByRole('button', { name: '단계 선택' });
  // 화면이 들어오는 움직임이 끝난 뒤에 잰다
  await page.waitForFunction(() => document.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));
  for (const b of [reload, back]) {
    const box = await b.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:log') ?? '[]').length)).toBe(0);
  // [단계 선택] → 지도, 다시 눌러도 같은 실패 화면
  await press(testInfo, back);
  await expect(page.locator('.screen-stages')).toBeVisible();
  await press(testInfo, page.locator('.stage-card').first());
  await expect(screen).toBeVisible();
  // 새 버전이 올라왔다(이제 파일이 있다) → [새로 고침]
  await page.unroute(BLOCKS);
  await Promise.all([page.waitForEvent('load'), press(testInfo, reload)]);
  await expect(page.locator('.screen-stages')).toBeVisible(); // 같은 주소(?area=blocks)로 다시 열림
  await press(testInfo, page.locator('.stage-card').first());
  await expect(page.locator('.blk-stage')).toBeVisible();
  expect(notNetwork(errors)).toEqual([]);
});

test('처음 스크립트를 받지 못하면 HTML이 한 번만 새로 고친다 — 다음에 받아지면 그대로 열리고 표시는 지워진다. 계속 못 받으면 되풀이하지 않고 안내만', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  // 페이지(HTML)를 받은 횟수 = 처음 + 새로 고친 수
  let loads = 0;
  page.on('request', (r) => { if (r.resourceType() === 'document') loads += 1; });
  // 한 번만 없는 파일(옛 HTML이 지워진 파일을 찾음) → 새로 고침 → 받아짐
  let failures = 1;
  await page.route('**/assets/net-workshop-*.js', (route) => (failures-- > 0 ? route.fulfill({ status: 404, body: 'gone' }) : route.continue()));
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'), { waitUntil: 'commit' }); // 새로 고침이 첫 페이지의 load보다 먼저 올 수 있다
  await expect(page.locator('.intro-enter')).toBeVisible();
  expect(loads).toBe(2);
  expect(await page.evaluate(() => sessionStorage.getItem('edu:reload-once'))).toBe(null);
  expect(await page.locator('.boot-error').count()).toBe(0);
  // 계속 못 받음 → 한 번 새로 고친 뒤 안내와 [새로 고침]만 (되풀이 없음)
  await page.unroute('**/assets/net-workshop-*.js');
  await page.route('**/assets/net-workshop-*.js', (route) => route.fulfill({ status: 404, body: 'gone' }));
  loads = 0;
  await page.goto(fileUrl(FILE, '?seed=1&sound=off'), { waitUntil: 'commit' });
  const notice = page.locator('.boot-error');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('role', 'alert');
  await expect(notice).toContainText('게임 파일을 받지 못했어요.');
  await expect(notice.getByRole('button', { name: '새로 고침' })).toBeVisible();
  await page.waitForLoadState('load');
  await nextFrames(page);
  expect(loads).toBe(2);
  expect(await page.evaluate(() => sessionStorage.getItem('edu:reload-once'))).toBe(new URL(page.url()).pathname);
  // 파일이 다시 생기면 [새로 고침]으로 열린다
  await page.unroute('**/assets/net-workshop-*.js');
  await Promise.all([page.waitForEvent('load'), notice.getByRole('button', { name: '새로 고침' }).click()]);
  await expect(page.locator('.intro-enter')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('edu:reload-once'))).toBe(null);
  expect(notNetwork(errors)).toEqual([]);
});

// review-b0b B0b-2: ?fx=low(느린 기기)와 움직임 줄이기에서는 "불러오는 중"의 점 셋이 멈춰 있다(common-rules 7절 "?fx=low면 끝 상태로") — 보통 실행에서는 움직인다
test('?fx=low·움직임 줄이기: "불러오는 중"의 점 셋은 멈춘 채 또렷하다(도는 움직임 0) — 보통은 움직인다', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  const dots = page.locator('.play-loading-dots i');
  for (const { label, query, reduced, moving } of [
    { label: '보통', query: '', reduced: false, moving: true },
    { label: '?fx=low', query: '&fx=low', reduced: false, moving: false },
    { label: '움직임 줄이기', query: '', reduced: true, moving: false },
  ]) {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const hold = await holdRequests(page, BLOCKS);
    await page.goto(fileUrl(FILE, `?unlock=all&seed=1&sound=off&stage=blocks-copy${query}`));
    await expect(page.locator('.play-loading'), label).toBeVisible();
    await expect(dots).toHaveCount(3);
    // 받기를 붙잡아 둔 동안이라 쪽지는 사라지지 않는다 — 그 사이에 점의 움직임을 센다
    const running = await dots.evaluateAll((list) => list.flatMap((d) => d.getAnimations()).filter((a) => a.playState === 'running').length);
    if (moving) expect(running, label).toBe(3);
    else {
      expect(running, label).toBe(0);
      expect(await dots.evaluateAll((list) => list.map((d) => getComputedStyle(d).opacity)), `${label}: 멈춘 점은 흐리지 않다`).toEqual(['1', '1', '1']);
    }
    hold.open();
    await expect(page.locator('.blk-stage')).toBeVisible();
    await page.unroute(BLOCKS);
  }
  expect(errors).toEqual([]);
});
