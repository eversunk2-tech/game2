/**
 * 자유 쌓기 "더 큰 판" — 브라우저 검사. 기획서: spec-grade6.md 15-37(사용자 요청) · 15-39 · 15-40(사용자 결정), plan-big-board.md 3~8절, build-brief-big-board.md
 * - 메뉴 ②: 보통 판 띠 맨 아래(크롬북 · 가로 태블릿) · 띠 줄 끝(세로 태블릿 · 휴대폰), 가름선 아래 노랑 바탕 48px, 띠의 마지막 Tab 자리
 *   낮은 창(크롬북 아래 선반이 보이는 1366×653 · 633)에서는 띠가 넘칠 때만 개수 한 줄 · 버튼 사이를 좁혀 넘침 0(15-40)
 * - 큰 판 화면 20×20 · 10층: 같은 화면이 바뀐다 — 맨 위 띠 · 머리([← 단계 선택] 포함) · 양옆 빈 배경 없이 꽉 차게, 되는 기기에서는 누른 순간 전체 화면
 * - 두 판은 따로 저장(free-big-20x20), 큰 판 [모두 치우기]는 큰 판만, [기록 모두 지우기]로는 지우지 않음, 같은 큰 판을 두 탭에서 열면 서로 따라감
 * - 휴대폰(창의 짧은 변 600px 미만): 안내 카드 + [알겠어요], ?board=big을 바로 열면 6×6 판 + 안내 한 번
 * 전체 화면은 헤드리스에서 화면 크기가 바뀌지 않으므로 요청 · 끔이 불렸는지만 본다(대체 함수 — spyFullscreen). 크기는 그 크기의 창으로 흉내 낸다.
 * 정해진 시간으로 기다리지 않는다: 움직임이 끝난 것은 getAnimations · is-easing으로, 무대 그리기는 화면 프레임 두 번으로 본다.
 * 시간 예산(CPU 4 · 8 · 12배 흉내에서 잼 — 아래 각 검사의 setTimeout): 머리말 끝의 표는 Build 보고(build-brief-big-board 최종 보고)에 있다.
 */
import { expect, test } from '@playwright/test';
import { collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

const FILE = 'net-workshop.html';
const KEY14 = 'edu:net-workshop:free-14x14';
const KEYBIG = 'edu:net-workshop:free-big-20x20';
const HELLO = '더 큰 판이에요. 20칸 20줄이고 10층까지 쌓을 수 있어요.';
const ESC = '전체 화면을 나가려면 Esc를 눌러요.';
const PHONE = '더 큰 판은 태블릿이나 컴퓨터에서 쓸 수 있어요.';
const LABEL = '더 큰 판에서 쌓기';
const BACK = '보통 판으로 돌아가기';

/**
 * 처음 보기 맞춤의 한 변 — 독립 계산(기획서 문장만으로: 15-19 4 "판이 꽉 차게" · 15-28 "A 약하게" · plan 7-2 "원근 · 처음 크기는 보통 판과 같다").
 * 눈은 판 가운데(높이 1.5층)에서 판의 긴 변 × 3칸, 처음 보기(판 돌림 45°, 높이 35.26°)에서 판 n×n과 3층 상자의 꼭짓점 여덟을 원근으로 그린 범위
 * + 여백(높이 0.8 · 너비 0.6칸)이 무대에 꽉 차게
 */
function perspUnit(w, h, n) {
  const D = 3 * n;
  const c = Math.SQRT1_2;
  const s3 = 1 / Math.sqrt(3);
  const right = [c, c, 0];
  const v = [c * Math.sqrt(2 / 3), -c * Math.sqrt(2 / 3), s3];
  const down = [right[1] * v[2] - right[2] * v[1], right[2] * v[0] - right[0] * v[2], right[0] * v[1] - right[1] * v[0]];
  const pts = [];
  for (const x of [0, n]) for (const y of [0, n]) for (const z of [0, 3]) {
    const q = [x - n / 2, y - n / 2, z - 1.5];
    const dot = (a) => a[0] * q[0] + a[1] * q[1] + a[2] * q[2];
    const f = D / (D - dot(v));
    pts.push([f * dot(right), f * dot(down)]);
  }
  const ys = pts.map((p) => p[1]);
  const side = Math.max(...pts.map((p) => Math.abs(p[0])));
  return Math.max(8, Math.floor(Math.min(h / (Math.max(...ys) - Math.min(...ys) + 0.8), w / (2 * side + 0.6))));
}

const isTouch = (testInfo) => testInfo.project.name === 'tablet';
const press = (testInfo, locator) => (isTouch(testInfo) ? locator.tap() : locator.click());
const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const settled = async (page) => {
  await expect(page.locator('.blk-free .blk-stage')).not.toHaveClass(/is-easing/);
  await page.waitForFunction(() => document.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));
  await frames(page);
};
const bigButton = (page) => page.locator('.blk-free-strip .blk-free-big');
const backButton = (page) => page.locator('.blk-free-strip .blk-free-back');
const fullButton = (page) => page.locator('.blk-free-strip .blk-free-full');
const count = (page) => page.locator('.blk-free-count b');
const cell = (page, x, y) => page.locator(`.blk-free-slot .blk-cell[data-x="${x}"][data-y="${y}"]`);
const live = (page) => page.locator('.sr-only[role="status"]').first();
const bigOn = (page) => page.evaluate(() => document.documentElement.classList.contains('blk-big-on'));
const toastTexts = (page) => page.evaluate(() => window.__toasts ?? []);

async function openFree(page, extra = '') {
  await page.goto(fileUrl(FILE, `?sound=off&stage=blocks-free${extra}`));
  await page.locator('.blk-free .blk-stage[data-count]').waitFor();
  await settled(page);
}
const waitBig = async (page) => {
  await page.locator('.blk-free.is-big .blk-stage[data-count]').waitFor();
  await settled(page);
};
const waitNormal = async (page) => {
  await page.locator('.blk-free:not(.is-big) .blk-stage[data-count]').waitFor();
  await settled(page);
};

/**
 * 전체 화면 대체 함수(헤드리스는 화면 크기가 바뀌지 않는다): 요청 · 끔을 센다. mode: ok(된다) · reject(막힘 — 거절) · none(없는 브라우저).
 * 함께 알림(.toast)이 뜰 때마다 글을 적어 둔다(window.__toasts) — 같은 글이 이어서 떠도 센다
 */
async function spyFullscreen(target, mode = 'ok') {
  await target.addInitScript((m) => {
    window.__fs = { req: 0, exit: 0 };
    window.__toasts = [];
    let on = null;
    const fire = () => document.dispatchEvent(new Event('fullscreenchange'));
    Object.defineProperty(Document.prototype, 'fullscreenElement', { configurable: true, get: () => on });
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => m !== 'none' });
    Object.defineProperty(Document.prototype, 'webkitFullscreenElement', { configurable: true, get: () => on });
    Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { configurable: true, get: () => m !== 'none' });
    delete Element.prototype.webkitRequestFullscreen;
    if (m === 'none') {
      delete Element.prototype.requestFullscreen;
    } else {
      Element.prototype.requestFullscreen = function requestFullscreen() {
        window.__fs.req += 1;
        if (m === 'reject') return Promise.reject(new TypeError('Permissions check failed'));
        on = document.documentElement;
        fire();
        return Promise.resolve();
      };
    }
    Document.prototype.exitFullscreen = function exitFullscreen() {
      window.__fs.exit += 1;
      on = null;
      fire();
      return Promise.resolve();
    };
    new MutationObserver((list) => {
      for (const r of list) for (const n of r.addedNodes) if (n.nodeType === 1 && n.classList.contains('toast')) window.__toasts.push(n.textContent.trim());
    }).observe(document, { childList: true, subtree: true });
  }, mode);
}
const fs = (page) => page.evaluate(() => ({ ...window.__fs }));

async function newPage(browser, w, h, { touch = false, fsMode = 'ok' } = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  await spyFullscreen(context, fsMode);
  const page = await context.newPage();
  return { context, page };
}

/** 무대에서 읽은 판: 판 칸 수 · 무대 밖 칸 · 쌓기나무 한 변 · 무대 크기 */
const board = (page) => page.evaluate(() => {
  const stageEl = document.querySelector('.blk-free .blk-stage');
  const S = stageEl.getBoundingClientRect();
  const tiles = [...stageEl.querySelectorAll('polygon.blk-tile')].map((p) => p.getBoundingClientRect());
  const inside = (b) => {
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    return cx > S.left && cx < S.right && cy > S.top && cy < S.bottom;
  };
  return { tiles: tiles.length, out: tiles.filter((b) => !inside(b)).length, unit: parseFloat(stageEl.style.getPropertyValue('--blk-unit')), stage: { w: S.width, h: S.height } };
});

/** 배치: 스크롤 · 띠 넘침 · 잘린 버튼 · 48px 밑 버튼 · 화면 밖 버튼 · 펼친 칸이 매트 밖 · 칸 안 넘침 · 양옆 배경 · 위 띠/머리 */
const layout = (page) => page.evaluate(() => {
  const vis = (el) => Boolean(el) && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const strip = document.querySelector('.blk-free-strip');
  const mat = document.querySelector('.blk-free-mat').getBoundingClientRect();
  const slotEl = document.querySelector('.blk-free-slot');
  const slot = slotEl.hidden ? null : slotEl.getBoundingClientRect();
  let clip = 0;
  if (slot) for (const el of slotEl.querySelectorAll('.blk-cell, svg, figure')) {
    const r = el.getBoundingClientRect();
    clip = Math.max(clip, slot.left - r.left, slot.top - r.top, r.bottom - slot.bottom);
  }
  const buttons = [...strip.querySelectorAll('button')].filter(vis);
  const name = (b) => b.getAttribute('aria-label') || b.textContent.trim();
  return {
    scrollY: document.documentElement.scrollHeight - innerHeight,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    stripOver: strip.scrollHeight - strip.clientHeight + (strip.scrollWidth - strip.clientWidth),
    clipped: buttons.filter((b) => b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1).map(name),
    small: buttons.filter((b) => b.getBoundingClientRect().height < 47.5).map(name),
    offscreen: buttons.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.top < 0 || r.left < 0 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5;
    }).map(name),
    slotOut: slot ? Math.max(0, mat.top - slot.top, slot.bottom - mat.bottom, mat.left - slot.left, slot.right - mat.right) : 0,
    slotOver: slotEl.hidden ? 0 : slotEl.scrollHeight - slotEl.clientHeight + (slotEl.scrollWidth - slotEl.clientWidth),
    clip: Math.max(0, Math.round(clip)),
    appW: document.querySelector('.edu-app').getBoundingClientRect().width,
    vw: innerWidth,
    topbar: vis(document.querySelector('.topbar')),
    header: vis(document.querySelector('.play-header')),
    stageBack: vis(document.querySelector('.play-header .btn-back')),
  };
});

/** 지금 보이는 판 칸(무대 안 · 펼친 칸 밖) */
const seen = (page) => page.evaluate(() => {
  const stage = document.querySelector('.blk-free .blk-stage');
  const S = stage.getBoundingClientRect();
  const slotEl = document.querySelector('.blk-free-slot');
  const slot = !slotEl.hidden && getComputedStyle(slotEl).position === 'absolute' ? slotEl.getBoundingClientRect() : null;
  return [...stage.querySelectorAll('polygon.blk-tile')].filter((t) => {
    const r = t.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    return x > S.left && x < S.right && y > S.top && y < S.bottom && !(slot && x > slot.left && x < slot.right && y > slot.top && y < slot.bottom);
  }).map((t) => `${t.dataset.x},${t.dataset.y}`);
});

/** 알림 밑에 깔린 띠 · 매트의 버튼 */
const underToast = (page) => page.evaluate(() => {
  const toast = document.querySelector('.toast');
  if (!toast) return null;
  const t = toast.getBoundingClientRect();
  return [...document.querySelectorAll('.blk-free button')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && !el.closest('[hidden]') && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top;
  }).map((el) => el.getAttribute('aria-label') || el.textContent.trim());
});

// ── 메뉴 ② ──────────────────────────

test('메뉴 ②(결정 4 · 15-40): 보통 판 띠 맨 아래(크롬북) · 띠 줄 끝(세로 태블릿), 가름선 아래 노랑 바탕 48px, 이름 "더 큰 판에서 쌓기", 띠의 마지막 Tab 자리. 판은 그대로', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await spyFullscreen(page);
  const sizes = isTouch(testInfo) ? [[820, 1180]] : [[1366, 768], [1366, 680]];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await openFree(page);
    const btn = bigButton(page);
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAccessibleName(LABEL);
    await expect(btn).toHaveText('더 큰 판');
    const m = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const strip = document.querySelector('.blk-free-strip');
      const big = document.querySelector('.blk-free-big');
      const door = document.querySelector('.blk-free-door');
      const tools = [...strip.querySelectorAll('button')].filter((b) => b !== big);
      const cs = getComputedStyle(door);
      return {
        strip: box(strip).toJSON(),
        big: box(big).toJSON(),
        tools: tools.map((b) => box(b).toJSON()),
        stripPad: [parseFloat(getComputedStyle(strip).paddingRight), parseFloat(getComputedStyle(strip).paddingBottom), parseFloat(getComputedStyle(strip).borderRightWidth)],
        line: [cs.borderTopWidth, cs.borderTopStyle, cs.borderLeftWidth, cs.borderLeftStyle],
        border: getComputedStyle(big).borderStyle,
        bg: getComputedStyle(big).backgroundColor,
        toolBg: getComputedStyle(document.querySelector('.blk-free-pad')).backgroundColor,
        last: [...strip.querySelectorAll('button')].at(-1) === big,
        tight: strip.classList.contains('is-tight'),
      };
    });
    expect(m.last, `${w}×${h}`).toBe(true);
    expect(m.big.height, `${w}×${h}`).toBeGreaterThanOrEqual(48);
    expect(m.border).toBe('solid'); // 점선은 이 앱에서 "지금은 누를 수 없음"
    expect(m.bg).not.toBe(m.toolBg); // 쌓기 도구(흰 바탕)와 다른 바탕(노랑)
    expect(m.tight, `${w}×${h}`).toBe(false); // 넘치지 않는 창의 보통 판은 그대로(15-40)
    const [padR, padB, edge] = m.stripPad;
    if (w > 1000) {
      // 띠 맨 아래: 띠 안쪽 아래 끝에 붙고, 다른 버튼과 같은 폭 · 같은 자리, 모든 도구 버튼보다 아래, 위에 가름선
      expect(Math.abs(m.strip.bottom - edge - padB - m.big.bottom), `${w}×${h}`).toBeLessThanOrEqual(1);
      for (const t of m.tools) {
        expect(Math.round(t.x)).toBe(Math.round(m.big.x));
        expect(Math.round(t.width)).toBe(Math.round(m.big.width));
        expect(t.bottom).toBeLessThan(m.big.top);
      }
      expect(m.line.slice(0, 2)).toEqual(['2px', 'solid']);
    } else {
      // 띠 줄 끝: 줄의 오른쪽 끝에 붙고, 마지막 줄에(다른 버튼보다 위에 있지 않다), 왼쪽에 세로 가름선
      expect(Math.abs(m.strip.right - edge - padR - m.big.right), `${w}×${h}`).toBeLessThanOrEqual(1);
      expect(m.big.top).toBeGreaterThanOrEqual(Math.max(...m.tools.map((t) => t.top)) - 1);
      expect(m.line.slice(2)).toEqual(['2px', 'solid']);
    }
    // 판은 그대로: 14×14, 한 변 = 독립 계산, 무대 밖 0. 스크롤 · 띠 넘침 0
    const b = await board(page);
    expect([b.tiles, b.out]).toEqual([196, 0]);
    expect(b.unit, `${w}×${h}`).toBe(perspUnit(b.stage.w, b.stage.h, 14));
    const l = await layout(page);
    expect([l.scrollX, l.scrollY, l.stripOver, l.clipped.length, l.small.length], `${w}×${h}`).toEqual([0, 0, 0, 0, 0]);
    // Tab 차례: [색] 다음이 [더 큰 판], 그다음은 띠 밖
    await page.locator('.blk-free-color').focus();
    await page.keyboard.press('Tab');
    await expect(btn).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.blk-free-strip')))).toBe(false);
  }
  expect(await bigOn(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('낮은 창(크롬북 아래 선반이 보이는 1366×653 · 633 — 15-40): 띠가 넘칠 때만 개수 한 줄 · 버튼 사이를 좁혀 띠 넘침 0, [더 큰 판] 보임, 버튼 48px 그대로', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북 창');
  const errors = collectErrors(page);
  for (const [w, h] of [[1366, 653], [1366, 633]]) {
    await page.setViewportSize({ width: w, height: h });
    await openFree(page);
    const m = await page.evaluate(() => {
      const strip = document.querySelector('.blk-free-strip');
      const big = document.querySelector('.blk-free-big').getBoundingClientRect();
      const s = strip.getBoundingClientRect();
      return {
        tight: strip.classList.contains('is-tight'),
        countRow: getComputedStyle(document.querySelector('.blk-free-count')).flexDirection,
        inStrip: big.top >= s.top && big.bottom <= s.bottom - 2,
        inView: big.bottom <= innerHeight,
      };
    });
    expect(m, `${w}×${h}`).toEqual({ tight: true, countRow: 'row', inStrip: true, inView: true });
    await expect(bigButton(page)).toBeVisible();
    const l = await layout(page);
    expect([l.stripOver, l.scrollX, l.scrollY, l.clipped, l.small, l.offscreen], `${w}×${h}`).toEqual([0, 0, 0, [], [], []]);
    const b = await board(page);
    expect(b.unit, `${w}×${h}`).toBe(perspUnit(b.stage.w, b.stage.h, 14));
  }
  expect(errors).toEqual([]);
});

// ── 큰 판 화면 ──────────────────────────

/** 큰 판 화면 한 크기: 처음 보기 · [위][앞][옆] · 위에서 본 판(옮기기로 모든 칸) · 위ㆍ앞ㆍ옆 모양 · 층별로 벌림 */
async function checkBigScreen(browser, w, h) {
  const { context, page } = await newPage(browser, w, h);
  const errors = collectErrors(page);
  const tag = `${w}×${h}`;
  await openFree(page, '&board=big');
  await waitBig(page);
  expect(await bigOn(page), tag).toBe(true);
  // 들어갈 때 알림(바로 연 주소 — 전체 화면은 누르는 동작이 있어야 해 켜지 않는다): 띠 · 매트의 버튼을 가리지 않는다
  await expect(page.locator('.toast'), tag).toHaveText(HELLO);
  await settled(page);
  expect(await underToast(page), tag).toEqual([]);
  const home = await board(page);
  expect([home.tiles, home.out], tag).toEqual([400, 0]);
  expect(home.unit, tag).toBe(perspUnit(home.stage.w, home.stage.h, 20));
  const l = await layout(page);
  expect({ appW: l.appW, topbar: l.topbar, header: l.header, stageBack: l.stageBack }, tag).toEqual({ appW: w, topbar: false, header: false, stageBack: false });
  expect([l.scrollX, l.scrollY, l.stripOver, l.clipped, l.small, l.offscreen], tag).toEqual([0, 0, 0, [], [], []]);
  await expect(page.locator('.blk-free-bigname')).toHaveText('더 큰 판20칸 20줄');
  await expect(backButton(page)).toBeVisible();
  await expect(fullButton(page)).toBeVisible();
  // [위][앞][옆]: 판 칸이 모두 무대 안
  for (const dir of ['top', 'front', 'side']) {
    await page.locator(`.blk-free .blk-dir[data-dir="${dir}"]`).click();
    await settled(page);
    expect((await board(page)).out, `${tag} ${dir}`).toBe(0);
  }
  await page.locator('.blk-free .blk-stage').focus();
  await page.keyboard.press('0');
  await settled(page);
  // 위에서 본 판: 20×20 한눈에(칸 18px — 낮으면 줄이되 13px 밑으로는 아니다), 펼친 칸이 매트 안 · 안쪽 넘침 0, 옮기기로 모든 칸을 본다
  await page.locator('.blk-free-pad').click();
  await settled(page);
  await expect(page.locator('.blk-free-slot .blk-cell:visible'), tag).toHaveCount(400);
  const sizes = await page.locator('.blk-free-slot .blk-cell').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().width)))]);
  for (const s of sizes) {
    expect(s, tag).toBeGreaterThanOrEqual(13);
    expect(s, tag).toBeLessThanOrEqual(18);
  }
  let lp = await layout(page);
  expect([lp.slotOut, lp.slotOver, lp.clip, lp.stripOver, lp.scrollX, lp.scrollY], `${tag} 펼침`).toEqual([0, 0, 0, 0, 0, 0]);
  const union = new Set(await seen(page));
  for (const b of [page.locator('.blk-free-pan.is-prev'), page.locator('.blk-free-pan.is-next'), page.locator('.blk-free-pan.is-prev')]) {
    let n = 0;
    while (n < 12 && (await b.isVisible()) && (await b.isEnabled())) {
      await b.click();
      await settled(page);
      for (const k of await seen(page)) union.add(k);
      n += 1;
    }
  }
  expect(union.size, `${tag} 옮기기로 본 칸`).toBe(400);
  await page.locator('.blk-free-pad').click();
  // 위ㆍ앞ㆍ옆 모양: 그림 칸 8px — 20칸 그림 하나 164px
  await page.locator('.blk-free-views').click();
  await settled(page);
  const flats = await page.locator('.blk-free-flat').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  expect(flats, tag).toEqual([164, 164, 164]);
  lp = await layout(page);
  expect([lp.slotOut, lp.slotOver, lp.clip, lp.stripOver, lp.scrollX, lp.scrollY], `${tag} 위ㆍ앞ㆍ옆`).toEqual([0, 0, 0, 0, 0, 0]);
  await page.locator('.blk-free-views').click();
  await page.locator('.blk-free-apart').click();
  await settled(page);
  expect((await board(page)).out, `${tag} 벌림`).toBe(0);
  lp = await layout(page);
  expect([lp.stripOver, lp.clipped, lp.scrollX, lp.scrollY], `${tag} 벌림`).toEqual([0, [], 0, 0]);
  expect(errors, tag).toEqual([]);
  await context.close();
}

test('큰 판 화면(결정 1 · 2) 크롬북 · 큰 화면: 20×20칸, 한 변 = 독립 계산, 무대 밖 0(처음 · [위][앞][옆]), 양옆 배경 0 · 위 띠/머리 안 보임 · 스크롤 0 · 띠 넘침 0, 알림이 버튼을 가리지 않음, 위에서 본 판 한눈에 · 옮기기로 400칸', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만(크롬북 묶음에서 크기마다 연다)');
  test.setTimeout(240_000);
  // 크롬북 같은 탭 · 전체 화면 · 아래 선반이 보이는 같은 탭, PC 큰 화면
  for (const [w, h] of [[1366, 681], [1366, 768], [1366, 633], [1920, 1080]]) await checkBigScreen(browser, w, h);
});

test('큰 판 화면(결정 1 · 2) 태블릿 가로 · 세로: 20×20칸, 한 변 = 독립 계산, 무대 밖 0, 양옆 배경 0 · 위 띠/머리 안 보임 · 스크롤 0 · 띠 넘침 0, 위에서 본 판 한눈에 · 옮기기로 400칸', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만(크롬북 묶음에서 크기마다 연다)');
  test.setTimeout(240_000);
  for (const [w, h] of [[1180, 820], [1024, 768], [820, 1180], [768, 1024]]) await checkBigScreen(browser, w, h);
});

// ── 전체 화면 ──────────────────────────

test('전체 화면(결정 2): [더 큰 판]을 누른 순간 한 번 요청, 들어갈 때 알림 + "Esc" 한 번, [전체 화면]으로 끄고 다시 켬(Esc 안내는 처음 한 번만), [← 보통 판으로]에서 끔', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북');
  const errors = collectErrors(page);
  await spyFullscreen(page, 'ok');
  await openFree(page);
  expect(await fs(page)).toEqual({ req: 0, exit: 0 });
  await bigButton(page).click();
  await waitBig(page);
  expect(await fs(page)).toEqual({ req: 1, exit: 0 });
  await expect(page.locator('.toast')).toHaveText(`${HELLO} ${ESC}`);
  await expect(live(page)).toHaveText(`${HELLO} ${ESC}`);
  await expect(fullButton(page)).toHaveAttribute('aria-pressed', 'true');
  // 끄고(Esc로 나간 것과 같다) 다시 켜기
  await fullButton(page).click();
  expect(await fs(page)).toEqual({ req: 1, exit: 1 });
  await expect(fullButton(page)).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => document.exitFullscreen()); // 이미 꺼진 뒤 브라우저가 한 번 더 알려도 그대로
  await fullButton(page).click();
  await expect(fullButton(page)).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 0))); // 요청 결과(약속)가 돌아온 뒤
  expect((await fs(page)).req).toBe(2);
  expect((await toastTexts(page)).filter((t) => t === ESC || t.endsWith(ESC))).toHaveLength(1); // Esc 안내는 처음 한 번
  // [← 보통 판으로]: 전체 화면도 끈다 · 큰 판 화면 표시가 없어진다 · 보통 판 14×14
  await backButton(page).click();
  await waitNormal(page);
  expect((await fs(page)).exit).toBe(3);
  expect(await bigOn(page)).toBe(false);
  expect((await board(page)).tiles).toBe(196);
  expect(errors).toEqual([]);
});

test('전체 화면이 막히거나(거절) 없는 브라우저: 큰 판 화면은 그대로 열리고 오류 0 · Esc 안내 없음. 주소로 바로 열면 요청하지 않고, [전체 화면]을 누르면 그때 Esc 안내 한 번', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북');
  for (const mode of ['reject', 'none']) {
    const { context, page } = await newPage(browser, 1366, 768, { fsMode: mode });
    const errors = collectErrors(page);
    await openFree(page);
    await bigButton(page).click();
    await waitBig(page);
    expect(await bigOn(page), mode).toBe(true);
    await expect(page.locator('.toast'), mode).toHaveText(HELLO);
    if (mode === 'none') await expect(fullButton(page), mode).toHaveCount(0);
    else {
      expect((await fs(page)).req, mode).toBe(1);
      await expect(fullButton(page)).toHaveAttribute('aria-pressed', 'false');
    }
    expect((await board(page)).tiles, mode).toBe(400);
    await backButton(page).click();
    await waitNormal(page);
    expect(await bigOn(page), mode).toBe(false);
    expect(errors, mode).toEqual([]);
    await context.close();
  }
  // 주소로 바로 열기(?board=big): 요청하지 않는다. [전체 화면]을 누르면 그때 요청하고 Esc 안내를 처음 한 번
  const { context, page } = await newPage(browser, 1366, 768);
  const errors = collectErrors(page);
  await openFree(page, '&board=big');
  await waitBig(page);
  expect(await fs(page)).toEqual({ req: 0, exit: 0 });
  await expect(fullButton(page)).toHaveAttribute('aria-pressed', 'false');
  await fullButton(page).click();
  await expect(page.locator('.toast')).toHaveText(ESC);
  await fullButton(page).click();
  await fullButton(page).click();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
  expect(await fs(page)).toEqual({ req: 2, exit: 1 });
  expect((await toastTexts(page)).filter((t) => t === ESC)).toHaveLength(1);
  expect(errors).toEqual([]);
  await context.close();
});

test('나가기: 큰 판 화면에는 단계 지도로 나가는 다른 길이 없고([← 단계 선택] · 맨 위 띠가 안 보임), 단계에서 나가면(엔진이 정리) 표시 · 전체 화면이 남지 않는다. 보통 판에서 나가도 같다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북');
  const errors = collectErrors(page);
  await spyFullscreen(page, 'ok');
  await page.goto(fileUrl(FILE, '?sound=off&intro=0'));
  const before = await page.evaluate(() => document.documentElement.className);
  await openFree(page);
  await bigButton(page).click();
  await waitBig(page);
  // 보이는 버튼은 큰 판 화면 안(매트 · 띠)의 것뿐
  const outside = await page.evaluate(() => [...document.querySelectorAll('button, a')].filter((b) => b.getClientRects().length > 0 && !b.closest('.blk-free')).map((b) => b.textContent.trim()));
  expect(outside).toEqual([]);
  // 엔진이 단계를 정리하는 길(감춰진 [← 단계 선택]을 대신 눌러 흉내): 큰 판 화면 표시가 지워지고 전체 화면도 꺼진다
  await page.evaluate(() => document.querySelector('.play-header .btn-back').click());
  await expect(page.locator('.blk-free')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.className)).toBe(before);
  expect(await fs(page)).toEqual({ req: 1, exit: 1 });
  await expect(page.locator('.topbar')).toBeVisible();
  // 보통 판에서 [← 단계 선택]
  await openFree(page);
  await page.locator('.play-header .btn-back').click();
  await expect(page.locator('.blk-free')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.className)).toBe(before);
  await expect(page.locator('.blk-free-notice')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// ── 저장 ──────────────────────────

test('저장(결정 3 · 4-2): 큰 판 작품은 free-big-20x20에만(보통 판 값은 글자까지 같다), 큰 판 [모두 치우기]는 큰 판만, 나갔다 들어오면 이어서, [기록 모두 지우기]로는 지우지 않는다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await spyFullscreen(page);
  const work14 = JSON.stringify({ v: 1, h: Array.from({ length: 14 }, (_, y) => Array.from({ length: 14 }, (__, x) => (x === 2 && y === 3 ? 4 : 0))), c: [] });
  await page.addInitScript(([k, v]) => {
    if (sessionStorage.getItem('big-save-started')) return;
    sessionStorage.setItem('big-save-started', '1');
    localStorage.setItem(k, v);
  }, [KEY14, work14]);
  const read = () => page.evaluate(([a, b]) => [localStorage.getItem(a), JSON.parse(localStorage.getItem(b) ?? 'null')], [KEY14, KEYBIG]);
  const sum = (raw) => raw.h.flat().reduce((x, y) => x + y, 0);
  await openFree(page);
  await expect(count(page)).toHaveText('4');
  await bigButton(page).click();
  await waitBig(page);
  await expect(count(page)).toHaveText('0'); // 큰 판은 빈 판으로 시작
  await page.locator('.blk-free-pad').click();
  await cell(page, 0, 0).click();
  await cell(page, 0, 0).click();
  await cell(page, 19, 19).click();
  await expect(count(page)).toHaveText('3');
  let [s14, big] = await read();
  expect(s14).toBe(work14);
  expect(big.h.length).toBe(20);
  expect([big.h[0][0], big.h[19][19], sum(big)]).toEqual([2, 1, 3]);
  // 큰 판 [모두 치우기] → 큰 판만 · 되돌리기로 되살림
  await page.locator('.blk-free-strip .blk-clear').click();
  await expect(count(page)).toHaveText('0');
  [s14, big] = await read();
  expect([s14, sum(big)]).toEqual([work14, 0]);
  await page.locator('.blk-free-strip .blk-undo').click();
  await expect(count(page)).toHaveText('3');
  // 보통 판으로 → 보통 판 작품 그대로(4) → 다시 큰 판 → 이어서(3) → 새로 고침(주소로 바로) → 3
  await backButton(page).click();
  await waitNormal(page);
  await expect(count(page)).toHaveText('4');
  await bigButton(page).click();
  await waitBig(page);
  await expect(count(page)).toHaveText('3');
  await openFree(page, '&board=big');
  await waitBig(page);
  await expect(count(page)).toHaveText('3');
  // [기록 모두 지우기] 뒤에도 그대로
  const bigBefore = await page.evaluate((k) => localStorage.getItem(k), KEYBIG);
  await page.goto(fileUrl(FILE, '?sound=off&intro=0'));
  await page.getByRole('button', { name: '학습 기록' }).first().click();
  await page.getByRole('button', { name: '기록 모두 지우기' }).click();
  await page.getByRole('button', { name: '한 번 더 누르면 지워져요' }).click();
  await expect(page.locator('.toast')).toContainText('기록을 지웠어요.');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEYBIG)).toBe(bigBefore);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY14)).toBe(work14);
  await openFree(page, '&board=big');
  await waitBig(page);
  await expect(count(page)).toHaveText('3');
  expect(errors).toEqual([]);
});

test('두 탭(plan 4-2): 같은 큰 판을 두 탭에서 열고 한쪽에서 쌓거나 빼면 다른 쪽이 따라온다(마지막에 한 것이 두 탭에 같게). 보통 판 값은 그대로', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만');
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await spyFullscreen(context);
  const a = await context.newPage();
  const b = await context.newPage();
  const errors = [...[a, b].map(collectErrors)];
  await openFree(a, '&board=big');
  await waitBig(a);
  await openFree(b, '&board=big');
  await waitBig(b);
  const before14 = await a.evaluate((k) => localStorage.getItem(k), KEY14);
  await a.locator('.blk-free-pad').click();
  await cell(a, 5, 5).click();
  await cell(a, 5, 5).click();
  await expect(count(a)).toHaveText('2');
  await expect(count(b)).toHaveText('2');
  await expect(b.locator('.blk-free .blk-stage')).toHaveAttribute('data-count', '2');
  // 다른 쪽에서 빼기
  await b.locator('.blk-free-pad').click();
  await b.locator('.blk-free-strip .blk-mode[data-mode="remove"]').click();
  await cell(b, 5, 5).click();
  await expect(count(b)).toHaveText('1');
  await expect(count(a)).toHaveText('1');
  await expect(a.locator('.blk-free-slot .blk-cell[data-x="5"][data-y="5"]')).toHaveText('1'); // 펼친 판의 수도 따라온다
  expect(await a.evaluate((k) => localStorage.getItem(k), KEY14)).toBe(before14);
  // 보통 판의 탭은 큰 판이 바뀌어도 그대로(따로)
  await b.locator('.blk-free-strip .blk-mode[data-mode="add"]').click();
  await backButton(a).click();
  await waitNormal(a);
  await cell(b, 6, 6).click();
  await expect(count(b)).toHaveText('2');
  await expect(count(a)).toHaveText('0');
  for (const e of errors) expect(e).toEqual([]);
  await context.close();
});

test('막힌 저장소(사생활 보호 모드처럼 localStorage가 오류): 큰 판도 오류 없이 쌓고, 보통 판에 다녀와도 그 단계 동안은 남는다', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만');
  const errors = collectErrors(page);
  await spyFullscreen(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('막힘', 'SecurityError'); } });
  });
  await openFree(page);
  await bigButton(page).click();
  await waitBig(page);
  await page.locator('.blk-free-pad').click();
  await cell(page, 3, 3).click();
  await cell(page, 4, 3).click();
  await expect(count(page)).toHaveText('2');
  await backButton(page).click();
  await waitNormal(page);
  await expect(count(page)).toHaveText('0');
  await bigButton(page).click();
  await waitBig(page);
  await expect(count(page)).toHaveText('2');
  expect(errors).toEqual([]);
});

// ── 휴대폰 ──────────────────────────

test('휴대폰(결정 5): [더 큰 판]을 누르면 안내 카드("안내" · 글 · [알겠어요]) — 큰 판은 열리지 않는다. [알겠어요] · Esc · 카드 밖 누르기로 닫고 초점은 메뉴로. 가로로 든 휴대폰도 같다', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만(크롬북 묶음에서 휴대폰 크기로 연다)');
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const { context, page } = await newPage(browser, w, h, { touch: true });
    const errors = collectErrors(page);
    const tag = `${w}×${h}`;
    await openFree(page);
    expect((await board(page)).tiles, tag).toBe(36);
    await expect(bigButton(page)).toHaveAccessibleName('더 큰 판에서 쌓기, 태블릿과 컴퓨터에서 쓸 수 있어요');
    const close = [
      async () => page.getByRole('button', { name: '알겠어요' }).tap(),
      async () => page.keyboard.press('Escape'),
      async () => page.locator('.blk-free-notice').click({ position: { x: 6, y: 6 } }),
    ];
    for (const how of close) {
      await bigButton(page).tap();
      const dialog = page.getByRole('dialog', { name: '안내' });
      await expect(dialog, tag).toBeVisible();
      await expect(dialog).toContainText(PHONE);
      await expect(page.getByRole('button', { name: '알겠어요' })).toBeFocused();
      const m = await page.evaluate(() => {
        const c = document.querySelector('.blk-free-notice-card').getBoundingClientRect();
        const ok = document.querySelector('.blk-free-notice-ok').getBoundingClientRect();
        return { inView: c.left >= 0 && c.top >= 0 && c.right <= innerWidth && c.bottom <= innerHeight, ok: ok.height, big: document.documentElement.classList.contains('blk-big-on') };
      });
      expect(m, tag).toEqual({ inView: true, ok: m.ok, big: false });
      expect(m.ok, tag).toBeGreaterThanOrEqual(48);
      expect(await hasHorizontalScroll(page), tag).toBe(false);
      await how();
      await expect(dialog, tag).toHaveCount(0);
      await expect(bigButton(page), tag).toBeFocused();
      expect((await board(page)).tiles, tag).toBe(36);
      expect(await fs(page), tag).toEqual({ req: 0, exit: 0 });
    }
    expect(errors, tag).toEqual([]);
    await context.close();
  }
});

test('휴대폰에서 큰 판 주소(?board=big)를 바로 열면: 보통 6×6 판 + 같은 안내 카드 한 번, 큰 판 작품은 그대로', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만');
  const { context, page } = await newPage(browser, 390, 844, { touch: true });
  const errors = collectErrors(page);
  const work = JSON.stringify({ v: 1, h: Array.from({ length: 20 }, (_, y) => Array.from({ length: 20 }, (__, x) => (x === y ? 1 : 0))), c: [] });
  await page.addInitScript(([k, v]) => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, v);
  }, [KEYBIG, work]);
  await openFree(page, '&board=big');
  await expect(page.getByRole('dialog', { name: '안내' })).toContainText(PHONE);
  expect((await board(page)).tiles).toBe(36);
  expect(await bigOn(page)).toBe(false);
  await page.getByRole('button', { name: '알겠어요' }).tap();
  await expect(page.locator('.blk-free-notice')).toHaveCount(0);
  await frames(page);
  await expect(page.locator('.blk-free-notice')).toHaveCount(0); // 한 번만
  expect(await page.evaluate((k) => localStorage.getItem(k), KEYBIG)).toBe(work);
  expect(await hasHorizontalScroll(page)).toBe(false);
  expect(errors).toEqual([]);
  await context.close();
});

// ── 드나들기 · 키보드 · 화면 읽기 ──────────────────────────

test('드나들기(결정 2 · 4): [더 큰 판] → 같은 자리의 [← 보통 판으로](초점도 그리로), 들어갈 때 화면 읽기 알림, 돌아오면 보통 판 그대로 · 맨 위 띠 · 머리가 다시 보이고 초점은 [더 큰 판]', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await spyFullscreen(page);
  await openFree(page);
  const normal = await board(page);
  const box = await bigButton(page).boundingBox();
  if (isTouch(testInfo)) await bigButton(page).tap();
  else {
    // 키보드만으로: [색]에서 Tab → [더 큰 판] → Enter
    await page.locator('.blk-free-color').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
  }
  await waitBig(page);
  await expect(backButton(page)).toBeFocused();
  await expect(backButton(page)).toHaveAccessibleName(BACK);
  await expect(live(page)).toContainText(HELLO);
  await expect(page.locator('.blk-free-strip')).toHaveAttribute('aria-label', '더 큰 판 도구');
  await expect(page.locator('.blk-free .blk-stage')).toHaveAttribute('aria-label', /^더 큰 판 무대\. 판은 20칸 20줄이고 10층까지 쌓을 수 있어요\./);
  // 크롬북(띠 맨 아래): [← 보통 판으로]가 [더 큰 판]이 있던 구석(오른쪽 아래)에 있다
  if (!isTouch(testInfo)) {
    const back = await backButton(page).boundingBox();
    const vp = page.viewportSize();
    expect(vp.width - (back.x + back.width)).toBeLessThanOrEqual(vp.width - (box.x + box.width));
    expect(vp.height - (back.y + back.height)).toBeLessThanOrEqual(vp.height - (box.y + box.height));
  }
  if (isTouch(testInfo)) await backButton(page).tap();
  else await page.keyboard.press('Enter');
  await waitNormal(page);
  await expect(bigButton(page)).toBeFocused();
  expect(await bigOn(page)).toBe(false);
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.play-header .btn-back')).toBeVisible();
  const again = await board(page);
  expect([again.tiles, again.unit, again.out]).toEqual([normal.tiles, normal.unit, 0]);
  expect(errors).toEqual([]);
});
