import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOOT_ERROR_TEXT, RELOAD_KEY, bootErrorHandler, clearReloadMark } from '../../src/shared/core/reload.js';
import { LOAD_FAILED, PLAY_LOADING_MS, lazyModule } from '../../src/shared/ui/app.js';

// 늦게 불러오기(B0b — docs/engine.md 2절 "늦게 불러오기", spec-grade6 7-4·7-5절): lazyModule과 처음 스크립트 실패 때 한 번만 새로 고침

test('lazyModule: 같은 묶음은 한 번만 받고, play는 받은 뒤 단계가 열려 있을 때만 run(모듈)을 불러 그 값을 준다', async () => {
  let loads = 0;
  const mod = { play: () => 'cleanup' };
  const lazy = lazyModule(() => {
    loads += 1;
    return Promise.resolve(mod);
  });
  const open = { signal: new AbortController().signal };
  assert.equal(await lazy.play(open, (m) => m.play()), 'cleanup');
  assert.equal(await lazy.preload(), true);
  assert.equal(await lazy.play(open, (m) => m.play()), 'cleanup');
  assert.equal(loads, 1);
});

test('lazyModule: 기다리는 사이에 단계에서 나갔으면(ctx.signal.aborted) run을 부르지 않는다 — 아무것도 그리지 않는다', async () => {
  let release;
  const lazy = lazyModule(() => new Promise((resolve) => { release = resolve; }));
  const life = new AbortController();
  let ran = 0;
  const pending = lazy.play({ signal: life.signal }, () => {
    ran += 1;
    return () => {};
  });
  await Promise.resolve();
  life.abort(); // 나감
  release({});
  assert.equal(await pending, null);
  assert.equal(ran, 0);
  // 다시 들어가면(새 판) 부른다
  assert.equal(typeof (await lazy.play({ signal: new AbortController().signal }, () => () => {})), 'function');
});

test('lazyModule: 받지 못하면 LOAD_FAILED 표시가 붙은 오류(엔진의 불러오기 실패 화면). 다음에는 다시 받아 본다. preload는 실패해도 조용하다', async () => {
  let tries = 0;
  const lazy = lazyModule(() => {
    tries += 1;
    return tries <= 2 ? Promise.reject(new TypeError('Failed to fetch dynamically imported module')) : Promise.resolve({ ok: true });
  });
  assert.equal(await lazy.preload(), false);
  await assert.rejects(lazy.play({ signal: new AbortController().signal }, () => null), (error) => error.code === LOAD_FAILED && /묶음을 받지 못했어요/.test(error.message) && error.cause instanceof TypeError);
  assert.equal(await lazy.play({ signal: new AbortController().signal }, (m) => m.ok), true);
  assert.equal(tries, 3);
  // load가 바로 던져도 같은 오류
  const throwing = lazyModule(() => { throw new Error('없음'); });
  await assert.rejects(throwing.play({}, () => null), (error) => error.code === LOAD_FAILED);
  assert.throws(() => lazyModule(null), /import/);
  assert.ok(PLAY_LOADING_MS >= 200 && PLAY_LOADING_MS <= 800, '짧은 기다림에는 불러오는 중을 보이지 않는다');
});

/** HTML onerror 처리를 가짜 브라우저에서 돌린다 */
function runBoot({ storage = new Map(), throwing = false, path = '/game2/net-workshop.html' } = {}) {
  const reloads = [];
  const appended = [];
  const app = { appendChild: (el) => appended.push(el) };
  const el = (tag) => ({ tag, children: [], setAttribute(k, v) { this[k] = v; }, appendChild(c) { this.children.push(c); } });
  const sessionStorage = throwing
    ? { getItem() { throw new Error('막힘'); }, setItem() { throw new Error('막힘'); } }
    : { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) };
  const window = { sessionStorage };
  const location = { pathname: path, reload: () => reloads.push(path) };
  const document = { getElementById: () => app, body: app, querySelector: () => (appended.length ? appended[0] : null), createElement: el };
  new Function('window', 'location', 'document', bootErrorHandler())(window, location, document);
  return { reloads, appended, storage };
}

test('처음 스크립트를 못 받으면(onerror) 한 번만 새로 고친다: 표시가 없으면 표시를 두고 새로 고침, 이미 있으면 안내와 [새로 고침]만', () => {
  const first = runBoot();
  assert.deepEqual(first.reloads, ['/game2/net-workshop.html']);
  assert.equal(first.storage.get(RELOAD_KEY), '/game2/net-workshop.html');
  assert.equal(first.appended.length, 0);
  // 새로 고친 뒤에도 또 못 받음 → 되풀이하지 않고 안내만
  const again = runBoot({ storage: first.storage });
  assert.deepEqual(again.reloads, []);
  assert.equal(again.appended.length, 1);
  const box = again.appended[0];
  assert.equal(box.className, 'panel boot-error');
  assert.equal(box.role, 'alert');
  assert.equal(box.children[0].textContent, BOOT_ERROR_TEXT);
  assert.equal(box.children[1].textContent, '새로 고침');
  box.children[1].onclick();
  assert.equal(again.reloads.length, 1, '[새로 고침]을 누르면 새로 고친다');
  // 다른 페이지(다른 게임)는 따로 한 번
  assert.equal(runBoot({ storage: first.storage, path: '/game2/other.html' }).reloads.length, 1);
  // sessionStorage를 못 쓰면 되풀이를 막을 수 없으니 새로 고치지 않고 안내만
  const blocked = runBoot({ throwing: true });
  assert.deepEqual(blocked.reloads, []);
  assert.equal(blocked.appended.length, 1);
  // 바깥 주소·// 를 쓰지 않는다(빌드 검사 ①) · 해요체 안내
  assert.doesNotMatch(bootErrorHandler(), /https?:|\/\//);
  assert.match(BOOT_ERROR_TEXT, /요\.$/);
});

test('앱이 열리면 되풀이 막는 표시를 지운다(clearReloadMark) — sessionStorage를 못 써도 오류 없음', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  try {
    const store = new Map([[RELOAD_KEY, '/game2/x.html']]);
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { removeItem: (k) => store.delete(k) } });
    clearReloadMark();
    assert.equal(store.has(RELOAD_KEY), false);
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('막힘'); } });
    assert.doesNotThrow(() => clearReloadMark());
  } finally {
    if (saved) Object.defineProperty(globalThis, 'sessionStorage', saved);
    else delete globalThis.sessionStorage;
  }
});
