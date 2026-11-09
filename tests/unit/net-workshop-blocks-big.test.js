import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { emptyMap } from '../../src/games/net-workshop/blocks/blocks.js';
import { eyeDistance, homeFitPersp } from '../../src/games/net-workshop/blocks/block-view.js';
import { FREE_BOARDS, FREE_COLORS, FREE_PERSP, boardFor, freeKey, readSaved, toSaved } from '../../src/games/net-workshop/blocks/play-free-build.js';
import {
  BACK_LABEL, BIG_BOARD, BIG_HELLO, BIG_LABEL, BIG_LABEL_PHONE, BIG_NAME, BIG_ON, BIG_SIZE, FULL_ESC, PHONE_SHORT, PHONE_TEXT,
  canFullscreen, exitFullscreen, isFullscreen, isPhoneSize, onFullscreenChange, requestFullscreen, setBigScreen, wantsBig,
} from '../../src/games/net-workshop/blocks/free-big.js';

// ── 자유 쌓기 "더 큰 판" (spec-grade6 15-37 · 15-39 · 15-40, plan-big-board.md) ──
// 기대값은 기획서 문장으로 따로 센 것(독립 계산)과 견준다

test('큰 판(결정 1): 20칸 × 20칸 · 10층, 위에서 본 판 칸 18px. 저장 열쇠 free-big-20x20 — 보통 판(14×14 · 6×6)과 따로', () => {
  assert.deepEqual({ ...BIG_BOARD }, { cols: 20, rows: 20, maxH: 10, compact: true, big: true, cell: 18, key: 'free-big-20x20' });
  assert.ok(Object.isFrozen(BIG_BOARD));
  assert.equal(freeKey(BIG_BOARD), 'free-big-20x20');
  // 보통 판의 열쇠는 그대로(두 판은 따로 — 결정 3)
  assert.equal(freeKey(FREE_BOARDS.wide), 'free-14x14');
  assert.equal(freeKey(FREE_BOARDS.phone), 'free-6x6');
  assert.equal(new Set([BIG_BOARD, FREE_BOARDS.wide, FREE_BOARDS.phone].map(freeKey)).size, 3);
  // 넓이는 지금 판(14×14)의 두 배쯤(400 ÷ 196 = 2.04 — "두 배 넓은 판")
  assert.equal(Math.round(((BIG_BOARD.cols * BIG_BOARD.rows) / (14 * 14)) * 100) / 100, 2.04);
  // 원근의 눈의 거리 = 판의 긴 변 × 3(보통 판과 같은 세기 — 15-28 "A 약하게")
  assert.equal(eyeDistance({ ...BIG_BOARD, fitH: 3, persp: FREE_PERSP }), 60);
});

test('휴대폰 판정(Plan이 고른 기준): 창의 짧은 변이 600px 미만 — 지금 6×6 판을 쓰는 화면과 늘 같다', () => {
  assert.equal(PHONE_SHORT, 600);
  const phone = [[599, 900], [900, 599], [844, 390], [390, 844], [375, 667], [599, 599]];
  const notPhone = [[600, 600], [768, 1024], [1024, 768], [820, 1180], [1366, 633], [1366, 768], [600, 1400], [1400, 600]];
  for (const [w, h] of phone) assert.equal(isPhoneSize(w, h), true, `${w}×${h}`);
  for (const [w, h] of notPhone) assert.equal(isPhoneSize(w, h), false, `${w}×${h}`);
  // 독립 계산: 짧은 변 < 600 ⇔ 휴대폰. 보통 판 고르기(boardFor)와 어긋나는 크기가 없다
  for (let w = 300; w <= 1500; w += 7) {
    for (let h = 300; h <= 1500; h += 11) {
      const expected = Math.min(w, h) < 600;
      assert.equal(isPhoneSize(w, h), expected, `${w}×${h}`);
      assert.equal(boardFor(w, h) === FREE_BOARDS.phone, expected, `${w}×${h}`);
    }
  }
});

test('바로 여는 주소: ?board=big일 때만(대소문자·다른 값·없음은 보통 판)', () => {
  assert.equal(wantsBig('?stage=blocks-free&board=big'), true);
  assert.equal(wantsBig('?board=big&stage=blocks-free&sound=off'), true);
  for (const s of ['', '?stage=blocks-free', '?board=Big', '?board=bigger', '?board=', '?boards=big', undefined]) assert.equal(wantsBig(s), false, String(s));
});

test('큰 판 저장 값(결정 3 · 4-2): 20×20 · 10층의 높이와 색을 그대로 읽는다(무작위 판 200개). 다 채워도 수 KB', () => {
  const rng = createRng('free-big-save');
  for (let n = 0; n < 200; n += 1) {
    const fill = rng.next();
    const map = emptyMap(20, 20).map((row) => row.map(() => (rng.next() < fill ? rng.int(1, 10) : 0)));
    const cubes = map.map((row) => row.map((v) => Array.from({ length: v }, () => rng.pick(FREE_COLORS).token)));
    const raw = JSON.parse(JSON.stringify(toSaved(map, cubes)));
    assert.deepEqual(readSaved(raw, BIG_BOARD), { map, cubes });
  }
  const full = emptyMap(20, 20).map((row) => row.map(() => 10));
  const size = JSON.stringify(toSaved(full, full.map((row) => row.map(() => Array(10).fill('--face-5'))))).length;
  assert.ok(size < 8000, `${size}`);
});

test('큰 판 저장 값이 판과 맞지 않으면 빈 판(보통 판 14×14 · 6×6의 값, 줄·칸 수가 다름, 11층, 소수, 옛 모양)', () => {
  const grid = (cols, rows, v = 1) => Array.from({ length: rows }, () => Array.from({ length: cols }, () => v));
  const bad = [
    { v: 1, h: grid(14, 14) },
    { v: 1, h: grid(6, 6) },
    { v: 1, h: grid(20, 19) },
    { v: 1, h: grid(19, 20) },
    { v: 1, h: grid(20, 20, 11) },
    { v: 1, h: grid(20, 20, 1.5) },
    { v: 1, h: grid(20, 20, -1) },
    { v: 2, h: grid(20, 20) },
    { h: grid(20, 20) },
    null,
    'x',
  ];
  for (const raw of bad) assert.equal(readSaved(raw, BIG_BOARD), null, JSON.stringify(raw)?.slice(0, 40));
  // 거꾸로: 큰 판의 값은 보통 판에서 읽히지 않는다(두 판은 서로 따로)
  assert.equal(readSaved({ v: 1, h: grid(20, 20) }, FREE_BOARDS.wide), null);
});

/**
 * 처음 보기 맞춤의 한 변 — 독립 계산(기획서 문장만으로: 15-19 4 "판이 꽉 차게" · 15-28 "A 약하게", plan 7-2 "원근 · 처음 크기는 보통 판과 같다").
 * 눈은 판 가운데(높이 1.5층)에서 판의 긴 변 × 3칸, 처음 보기(판 돌림 45°, 높이 35.26°)에서 판 n×n과 3층 상자의 꼭짓점 여덟을 원근으로 그린 범위
 * + 여백(높이 0.8 · 너비 0.6칸)이 무대에 꽉 차게. (e2e의 perspUnit과 같은 식)
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

test('처음 보기 맞춤(큰 판 20×20): 판과 3층 높이가 무대에 꽉 차는 한 변 = 독립 계산(무대 크기 400개 + 큰 판 화면에서 잰 무대 넷)', () => {
  const eye = eyeDistance({ ...BIG_BOARD, fitH: 3, persp: FREE_PERSP });
  const unitOf = (w, h) => homeFitPersp(w, h, { cols: 20, rows: 20, fitH: 3, eye }).unit;
  const rng = createRng('free-big-fit');
  for (let i = 0; i < 400; i += 1) {
    const w = rng.int(300, 2000);
    const h = rng.int(250, 1400);
    assert.equal(unitOf(w, h), perspUnit(w, h, 20), `${w}×${h}`);
  }
  // 큰 판 화면의 무대(크롬북 같은 탭 1366×681 · 전체 화면 1366×768 · 태블릿 가로 1180×820 · 세로 820×1180 — Build 차례 1에서 잰 무대 크기)
  // → 쌓기나무 한 변 32 · 36 · 34 · 27px(Plan 2-3 표 B의 V2와 같다)
  assert.deepEqual([[1190, 657], [1190, 744], [1004, 796], [792, 1027]].map(([w, h]) => [unitOf(w, h), perspUnit(w, h, 20)]), [[32, 32], [36, 36], [34, 34], [27, 27]]);
});

test('글(결정 2 · 5, Plan 7-1 · 7-2): 알림 · 안내 카드 · 버튼 이름. 화면 읽기 이름은 보이는 글로 시작한다', () => {
  assert.equal(BIG_NAME, '더 큰 판');
  assert.equal(BIG_SIZE, '20칸 20줄');
  assert.equal(BIG_HELLO, '더 큰 판이에요. 20칸 20줄이고 10층까지 쌓을 수 있어요.');
  assert.equal(FULL_ESC, '전체 화면을 나가려면 Esc를 눌러요.');
  assert.equal(PHONE_TEXT, '더 큰 판은 태블릿이나 컴퓨터에서 쓸 수 있어요.');
  assert.equal(BIG_LABEL, '더 큰 판에서 쌓기');
  assert.equal(BIG_LABEL_PHONE, '더 큰 판에서 쌓기, 태블릿과 컴퓨터에서 쓸 수 있어요');
  for (const label of [BIG_LABEL, BIG_LABEL_PHONE]) assert.ok(label.startsWith(BIG_NAME));
  assert.ok(BACK_LABEL.startsWith('보통 판으로'));
  // 제목 글꼴(Do Hyeon)에 없는 기호를 버튼 · 띠 이름에 쓰지 않는다(common-rules 7)
  for (const text of [BIG_NAME, BIG_SIZE, '보통 판으로', '전체 화면', '알겠어요']) assert.doesNotMatch(text, /[×·—…]/);
});

/** 전체 화면 함수를 흉내 낸 문서(document) — 표준 · 옛 webkit · 없음 · 거절 */
function fakeDocument({ api = 'std', outcome = 'ok', enabled = true } = {}) {
  const calls = { req: 0, exit: 0 };
  const listeners = new Map();
  const classes = new Set();
  const root = { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } };
  const doc = {
    documentElement: root,
    fullscreenEnabled: api === 'std' ? enabled : undefined,
    webkitFullscreenEnabled: api === 'webkit' ? enabled : undefined,
    fullscreenElement: null,
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: (type, fn) => listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)),
    exitFullscreen() {
      calls.exit += 1;
      doc.fullscreenElement = null;
      return Promise.resolve();
    },
  };
  if (api === 'std') {
    root.requestFullscreen = () => {
      calls.req += 1;
      if (outcome === 'throw') throw new TypeError('막힘');
      if (outcome === 'reject') return Promise.reject(new TypeError('막힘'));
      doc.fullscreenElement = root;
      return Promise.resolve();
    };
  } else if (api === 'webkit') {
    root.webkitRequestFullscreen = () => {
      calls.req += 1;
      return undefined; // 옛 webkit은 돌려주는 것이 없다
    };
  }
  return { doc, calls, classes, listeners };
}
async function withDocument(fake, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  const old = globalThis.document;
  globalThis.document = fake.doc;
  try {
    await fn();
  } finally {
    if (had) globalThis.document = old;
    else delete globalThis.document;
  }
}

test('전체 화면(결정 2): 되면 true, 막히거나(거절 · 던짐) 없거나 결과를 모르면(옛 webkit) false — 오류를 밖으로 내지 않는다. 끄기는 켜져 있을 때만', async () => {
  // 문서가 없는 곳(이 검사 환경)에서도 오류 없이 false
  assert.equal(canFullscreen(), false);
  assert.equal(await requestFullscreen(), false);
  exitFullscreen();
  setBigScreen(true);
  const ok = fakeDocument();
  await withDocument(ok, async () => {
    assert.equal(canFullscreen(), true);
    assert.equal(isFullscreen(), false);
    exitFullscreen(); // 켜져 있지 않으면 부르지 않는다
    assert.equal(ok.calls.exit, 0);
    assert.equal(await requestFullscreen(), true);
    assert.equal(isFullscreen(), true);
    exitFullscreen();
    assert.deepEqual(ok.calls, { req: 1, exit: 1 });
    const seen = [];
    const off = onFullscreenChange(() => seen.push(1));
    assert.equal(ok.listeners.get('fullscreenchange').length, 1);
    assert.equal(ok.listeners.get('webkitfullscreenchange').length, 1);
    off();
    assert.equal(ok.listeners.get('fullscreenchange').length, 0);
    setBigScreen(true);
    assert.deepEqual([...ok.classes], [BIG_ON]);
    setBigScreen(false);
    assert.deepEqual([...ok.classes], []);
  });
  for (const outcome of ['reject', 'throw']) {
    const f = fakeDocument({ outcome });
    await withDocument(f, async () => {
      assert.equal(await requestFullscreen(), false, outcome);
      assert.equal(f.calls.req, 1);
    });
  }
  const off = fakeDocument({ enabled: false });
  await withDocument(off, async () => {
    assert.equal(canFullscreen(), false);
    assert.equal(await requestFullscreen(), false);
    assert.equal(off.calls.req, 0);
  });
  const none = fakeDocument({ api: 'none' });
  await withDocument(none, async () => {
    assert.equal(canFullscreen(), false);
    assert.equal(await requestFullscreen(), false);
  });
  const webkit = fakeDocument({ api: 'webkit' });
  await withDocument(webkit, async () => {
    assert.equal(canFullscreen(), true);
    assert.equal(await requestFullscreen(), false); // 불렀지만 결과를 모른다 — Esc 안내를 하지 않는다
    assert.equal(webkit.calls.req, 1);
  });
});
