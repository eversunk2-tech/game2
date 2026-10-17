import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INTRO_BAND_MAX,
  INTRO_CARD_BUTTON_UP,
  INTRO_CARD_GAP,
  INTRO_UPSCALE_MAX,
  introButtonHeight,
  planIntroLayout,
  sanitizeDpr,
} from '../../src/shared/core/intro-fit.js';
import { INTRO_BUTTON_GROW_MAX, INTRO_BUTTON_NUDGE_MAX, INTRO_BUTTON_NUDGE_STAGE, INTRO_CARD_FOOT, introButtonScale } from '../../src/shared/core/intro-fit.js';

// 인트로 꽉 채우기/카드 규칙(core/intro-fit.js — spec-grade6 15-9, selectio game과 같게).
// 기대 모드는 엔진 코드를 쓰지 않고 기획서 문장만으로 짠 독립 계산과 견준다:
//   배율 = min(덮는 배율, 꼭 보일 칸이 들어가는 배율, 1.35 ÷ DPR) → 남는 띠(위아래·양옆 가운데 큰 비율)가 5% 이하면 꽉 채우기, 넘으면 카드

const ART = { width: 2880, height: 1620, keep: [160, 630, 2250, 1620], avoid: [[425, 625, 765, 970], [1820, 860, 2115, 1150]] };
const LOGO_RATIO = (2564 - 268) / (1578 - 96);

/** 독립 계산: 기획서 문장 그대로(자리 맞춤·기기 화소 맞춤은 하지 않는다) */
function expectMode(w, h, dpr) {
  const [kx0, ky0, kx1, ky1] = ART.keep;
  const s = Math.min(Math.max(w / ART.width, h / ART.height), w / (kx1 - kx0), h / (ky1 - ky0), 1.35 / dpr);
  const band = Math.max(Math.max(0, w - ART.width * s) / w, Math.max(0, h - ART.height * s) / h);
  return { mode: band <= 0.05 + 1e-9 ? 'fill' : 'card', band };
}

const DEVICES = [
  [1366, 768, 1], [1366, 680, 1], [820, 1180, 2], [390, 844, 3], [1024, 768, 2], [1180, 820, 2], [1280, 800, 1.5], [1280, 800, 2],
  [1366, 1024, 2], [1920, 1080, 1], [1920, 1080, 2], [844, 390, 3], [960, 680, 1], [1024, 600, 1], [768, 1024, 2], [2560, 1440, 2], [3840, 2160, 1], [5120, 2880, 1],
];

const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test('상수: 늘림 한도 1.35, 띠 5%, 카드 여백 12px, 버튼이 카드 아래 가장자리에 걸침', () => {
  assert.equal(INTRO_UPSCALE_MAX, 1.35);
  assert.equal(INTRO_BAND_MAX, 0.05);
  assert.equal(INTRO_CARD_GAP, 12);
  assert.ok(INTRO_CARD_BUTTON_UP >= 0 && INTRO_CARD_BUTTON_UP < 10);
  assert.equal(sanitizeDpr(undefined), 1);
  assert.equal(sanitizeDpr(-2), 1);
  assert.equal(sanitizeDpr(2), 2);
  assert.equal(introButtonHeight(390, 844), 62);
  assert.equal(introButtonHeight(1920, 1080), 84);
  assert.equal(introButtonHeight(300, 300), 56);
});

test('기기별: 모드가 독립 계산과 같고, 꽉 채우기는 1.35배 이하로 화면을 덮으며(띠 5% 이하) 인물 칸을 자르지 않고, 카드는 늘리지 않고 화면 안에 다 보인다', () => {
  const table = [];
  for (const [w, h, dpr] of DEVICES) {
    const p = planIntroLayout({ w, h, dpr, art: ART, logoRatio: LOGO_RATIO });
    const want = expectMode(w, h, dpr);
    const at = `${w}×${h}@${dpr}`;
    assert.equal(p.mode, want.mode, at);
    assert.ok(Math.abs(p.band - want.band) < 0.01 || (p.band >= 1 && want.band > INTRO_BAND_MAX), `${at} 띠 ${p.band} / ${want.band}`);
    assert.equal(p.keepVisible, true, `${at} 인물 칸`);
    // 그림 폭은 기기 화소에 맞춘다
    assert.ok(Math.abs(p.image.w * dpr - Math.round(p.image.w * dpr)) < 1e-6, `${at} 폭이 기기 화소`);
    if (p.mode === 'fill') {
      assert.ok(p.ratio <= INTRO_UPSCALE_MAX + 1e-9, `${at} 늘림 ${p.ratio}`);
      assert.deepEqual(p.stage, { x: 0, y: 0, w, h });
      const bandX = (Math.max(0, p.image.x) + Math.max(0, w - p.image.x - p.image.w)) / w;
      const bandY = (Math.max(0, p.image.y) + Math.max(0, h - p.image.y - p.image.h)) / h;
      assert.ok(Math.max(bandX, bandY) <= INTRO_BAND_MAX + 1e-9, `${at} 띠`);
      assert.ok(p.button.y + p.button.h / 2 <= h - 14 + 1e-6, `${at} 버튼이 화면 안`);
    } else {
      assert.ok(p.ratio <= 1 + 1e-9, `${at} 카드는 늘리지 않는다 ${p.ratio}`);
      assert.deepEqual(p.stage, p.image);
      assert.ok(p.image.x >= INTRO_CARD_GAP - 1e-6 && p.image.x + p.image.w <= w - INTRO_CARD_GAP + 1e-6, `${at} 양옆 여백`);
      assert.ok(p.image.y >= INTRO_CARD_GAP - 1e-6, `${at} 위 여백`);
      assert.ok(Math.abs(p.button.y - (p.image.y + p.image.h - INTRO_CARD_BUTTON_UP)) < 1e-6, `${at} 버튼이 카드 아래 가장자리에`);
      assert.ok(p.button.y + p.button.h / 2 <= h - 8, `${at} 버튼이 화면 안`);
      assert.ok(Math.abs(p.image.x + p.image.w / 2 - w / 2) <= 1, `${at} 가운데`);
    }
    // 제목 상자: 무대 안, 두 아이의 머리와 겹치지 않음, [입장하기]와 겹치지 않음
    const k = p.image.w / ART.width;
    const logo = { x0: p.logo.x, y0: p.logo.y, x1: p.logo.x + p.logo.w, y1: p.logo.y + p.logo.w / LOGO_RATIO };
    assert.ok(p.logo.w > 100, `${at} 제목 폭 ${p.logo.w}`);
    assert.ok(logo.x0 >= p.stage.x - 0.5 && logo.x1 <= p.stage.x + p.stage.w + 0.5 && logo.y0 >= Math.max(0, p.stage.y) && logo.y1 <= p.stage.y + p.stage.h, `${at} 제목이 무대 안`);
    const button = { x0: p.button.x - 100, y0: p.button.y - p.button.h / 2, x1: p.button.x + 100, y1: p.button.y + p.button.h / 2 };
    assert.equal(overlap(logo, button), false, `${at} 제목과 버튼`);
    for (const [x0, y0, x1, y1] of ART.avoid) {
      const head = { x0: p.image.x + x0 * k, y0: p.image.y + y0 * k, x1: p.image.x + x1 * k, y1: p.image.y + y1 * k };
      assert.equal(overlap(logo, head), false, `${at} 제목이 머리를 가린다`);
      assert.equal(overlap(button, head), false, `${at} 버튼이 머리를 가린다`);
    }
    table.push(`${at} ${p.mode} ×${p.ratio.toFixed(2)} 띠 ${(p.band * 100).toFixed(1)}%`);
  }
  // 대표 기기의 모드(보고서의 결과표와 같다): 가로 화면은 꽉 채우기, 세로 화면은 카드
  const modeOf = (w, h, dpr) => planIntroLayout({ w, h, dpr, art: ART, logoRatio: LOGO_RATIO }).mode;
  assert.deepEqual([modeOf(1366, 768, 1), modeOf(1366, 680, 1), modeOf(1024, 768, 2), modeOf(1366, 1024, 2), modeOf(1920, 1080, 2), modeOf(844, 390, 3)], ['fill', 'fill', 'fill', 'fill', 'fill', 'fill']);
  assert.deepEqual([modeOf(820, 1180, 2), modeOf(390, 844, 3), modeOf(768, 1024, 2)], ['card', 'card', 'card']);
  assert.equal(table.length, DEVICES.length);
});

test('늘림 한도: 5K 화면을 DPR 1로 보면 1.35배를 넘게(1.78배) 늘려야 덮으므로 카드(원래 크기 2880), 4K는 1.33배라 꽉 채우기, 1920×1080을 DPR 2로 보면 꽉 채우기', () => {
  const big = planIntroLayout({ w: 5120, h: 2880, dpr: 1, art: ART, logoRatio: LOGO_RATIO });
  assert.equal(big.mode, 'card');
  assert.equal(planIntroLayout({ w: 3840, h: 2160, dpr: 1, art: ART, logoRatio: LOGO_RATIO }).mode, 'fill');
  assert.ok(big.ratio <= 1);
  assert.equal(big.image.w, 2880); // 늘리지 않는다: 원래 크기
  const retina = planIntroLayout({ w: 1920, h: 1080, dpr: 2, art: ART, logoRatio: LOGO_RATIO });
  assert.equal(retina.mode, 'fill');
  assert.ok(retina.ratio > 1.3 && retina.ratio <= 1.35);
});

test('그림 정보가 없으면 화면 가득(꽉 채우기)', () => {
  const p = planIntroLayout({ w: 800, h: 600, dpr: 1, art: { width: 800, height: 600 } });
  assert.equal(p.mode, 'fill');
  assert.deepEqual(p.image, { x: 0, y: 0, w: 800, h: 600 });
});

// 큰 화면에서 [입장하기]도 커진다(spec-grade6 15-11 — selectio game과 같게, 2026-10-17 사용자 요청).
// 기대값은 엔진 코드를 쓰지 않고 기획서 문장만으로 짠 독립 계산:
//   배율 = min(화면 CSS 폭 ÷ 1280, 화면 CSS 높이 ÷ 800)을 1~1.35로 묶는다 · 면 높이 = (화면 높이의 10.5%·폭의 16% 가운데 작은 값을 56~84로 묶어 반올림) × 배율
const expectScale = (w, h) => Math.min(1.35, Math.max(1, Math.min(w / 1280, h / 800)));
const expectBaseHeight = (w, h) => Math.round(Math.min(84, Math.max(56, Math.min(0.105 * h, 0.16 * w))));

test('[입장하기] 배율: 상한 1.35 하나, 기획서의 어림값(1280×800 → 1 · 1366×768 → 1 · 1366×1024 → 1.0672 · 1440×900 → 1.125 · 1920×1080 → 1.35 · 2560×1440 → 1.35)', () => {
  assert.equal(INTRO_BUTTON_GROW_MAX, 1.35);
  const table = [
    [1280, 800, 1], [1366, 768, 1], [1366, 1024, 1.0672], [1440, 900, 1.125], [1920, 1080, 1.35], [2560, 1440, 1.35],
    // 그대로인 화면(크롬북·태블릿·휴대폰)과 아주 큰 화면
    [1024, 768, 1], [1180, 820, 1], [820, 1180, 1], [390, 844, 1], [844, 390, 1], [1366, 680, 1], [3840, 2160, 1.35], [5120, 2880, 1.35],
    // 어림값이 기획서에 없는 큰 화면(독립 계산으로)
    [1536, 864, expectScale(1536, 864)], [1680, 1050, expectScale(1680, 1050)], [1920, 1200, 1.35],
  ];
  for (const [w, h, want] of table) {
    const s = introButtonScale(w, h);
    assert.ok(Math.abs(s - want) < 1e-4, `${w}×${h}: ${s} / ${want}`);
    assert.ok(Math.abs(s - expectScale(w, h)) < 1e-12, `${w}×${h} 독립 계산`);
  }
  // 이상한 값이면 1(그대로)
  for (const [w, h] of [[NaN, 800], [1920, NaN], [Infinity, Infinity], [undefined, undefined]]) assert.equal(introButtonScale(w, h), 1, `${w}×${h}`);
});

test('[입장하기] 크기와 자리: 면 높이 = 배율 1의 높이 × 배율(1920×1080에서 113.4px), 꽉 채우기에서 화면 밑과의 틈은 그대로(3.5%, 적어도 14px), 카드에서는 틈도 배율만큼 — 커진 버튼(초점 후광 포함)이 화면 안이고 두 아이의 머리·제목과 겹치지 않는다', () => {
  const sizes = [
    [1280, 800, 1], [1280, 800, 1.5], [1280, 800, 2], [1366, 768, 1], [1366, 1024, 2], [1440, 900, 1], [1440, 900, 2], [1536, 864, 1.25], [1680, 1050, 1],
    [1920, 1080, 1], [1920, 1080, 2], [1920, 1200, 1], [2560, 1440, 1], [2560, 1440, 2], [3840, 2160, 1], [3840, 2160, 2], [5120, 2880, 1], [5120, 1440, 1], [2560, 1080, 2],
    [1024, 768, 2], [1180, 820, 2], [820, 1180, 2], [390, 844, 3], [844, 390, 3], [1366, 680, 1], [768, 1024, 2], [1440, 2560, 1],
  ];
  for (const [w, h, dpr] of sizes) {
    const at = `${w}×${h}@${dpr}`;
    const p = planIntroLayout({ w, h, dpr, art: ART, logoRatio: LOGO_RATIO });
    const s = expectScale(w, h);
    assert.ok(Math.abs(p.button.s - s) < 1e-12, `${at} 배율 ${p.button.s}`);
    assert.ok(Math.abs(p.button.h - expectBaseHeight(w, h) * s) < 1e-9, `${at} 면 높이 ${p.button.h}`);
    if (s === 1) assert.equal(p.button.h, introButtonHeight(w, h), `${at} 배율 1이면 지금 높이 그대로`);
    const faceBottom = p.button.y + p.button.h / 2;
    if (p.mode === 'fill') assert.ok(Math.abs(h - faceBottom - Math.max(14, 0.035 * h)) < 1e-9, `${at} 꽉 채우기의 틈 ${h - faceBottom}`);
    else assert.ok(h - faceBottom >= INTRO_CARD_FOOT * s - 1e-9, `${at} 카드의 틈 ${h - faceBottom}`);
    // 커진 버튼의 바깥(면 + 초점 후광 12px × 배율): 최소 폭 = 면 높이 × 3.6(base.css)
    const halo = 12 * s;
    const half = (p.button.h * 3.6) / 2 + halo;
    const outer = { x0: p.button.x - half, y0: p.button.y - p.button.h / 2 - halo, x1: p.button.x + half, y1: p.button.y + p.button.h / 2 + halo };
    assert.ok(outer.x0 >= 0 && outer.x1 <= w, `${at} 버튼이 화면 안(가로)`);
    if (p.mode === 'fill') assert.ok(outer.y1 <= h + 1e-9, `${at} 초점 후광까지 화면 안 ${outer.y1} / ${h}`);
    else assert.ok(faceBottom + 10 * s <= h + 1e-9, `${at} 아래 그림자까지 화면 안`); // 카드가 화면 높이에 꽉 차면 초점 후광 끝(2px × 배율)만 밑에 닿을 수 있다(배율 1의 지금과 같은 비율)
    const k = p.image.w / ART.width;
    const logo = { x0: p.logo.x, y0: p.logo.y, x1: p.logo.x + p.logo.w, y1: p.logo.y + p.logo.w / LOGO_RATIO };
    assert.equal(overlap(outer, logo), false, `${at} 버튼과 제목`);
    for (const [x0, y0, x1, y1] of ART.avoid) {
      const head = { x0: p.image.x + x0 * k, y0: p.image.y + y0 * k, x1: p.image.x + x1 * k, y1: p.image.y + y1 * k };
      assert.equal(overlap(outer, head), false, `${at} 버튼이 머리를 가린다`);
    }
  }
  const at1920 = planIntroLayout({ w: 1920, h: 1080, dpr: 1, art: ART, logoRatio: LOGO_RATIO });
  assert.ok(Math.abs(at1920.button.h - 113.4) < 1e-9, `1920×1080 면 높이 ${at1920.button.h}`);
});

// 소녀의 손을 가리면 왼쪽으로 조금(spec-grade6 15-11 끝 — 2026-10-17 사용자 결정 "손 안 가리게 버튼 조금 옮겨줘. 왼쪽으로 약간만. 너무 중심이 흐트러지지는 않도록").
// 독립 계산(기획서 문장만): 버튼 = 면(폭 = 높이 × 3.6) + 바깥 여백 8s(위·양옆) + 아래 그림자 10s. 손 칸과 겹치면 왼쪽으로만, 겹치지 않을 만큼까지,
// 다만 한도 min(면 폭 × 0.2, 무대 폭 × 0.05). 그렇게 옮겨도 손 칸이 가려지는 넓이가 줄지 않으면 옮기지 않는다(사용자 결정 "안 보이면 옮기지 않기"). 위아래·크기는 그대로
const HAND = [1675, 1378, 1795, 1442]; // 배경 그림에서 직접 잰 손 칸(손가락 끝~소매 앞, 엄지 위~손바닥 아래)
const ART_HAND = { ...ART, buttonAvoid: [HAND] };
const buttonBox = (b) => ({ x0: b.x - 1.8 * b.h - 8 * b.s, y0: b.y - b.h / 2 - 8 * b.s, x1: b.x + 1.8 * b.h + 8 * b.s, y1: b.y + b.h / 2 + 10 * b.s });
const handOn = (p) => {
  const k = p.image.w / ART.width;
  return { x0: p.image.x + HAND[0] * k, y0: p.image.y + HAND[1] * k, x1: p.image.x + HAND[2] * k, y1: p.image.y + HAND[3] * k };
};
const area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

test('[입장하기]가 소녀의 손을 가리면 왼쪽으로만 조금(한도 min(면 폭 × 0.2, 무대 폭 × 0.05)): 독립 계산과 같은 거리, 옮기면 겹침이 줄고(한도 안이면 0), 줄지 않으면 가운데 그대로(세로 카드), 위아래·크기 그대로, 두 아이의 머리·제목과 겹침 0, 무대 밖으로 안 나감. 손 칸이 없는 그림은 그대로', () => {
  assert.equal(INTRO_BUTTON_NUDGE_MAX, 0.2);
  assert.equal(INTRO_BUTTON_NUDGE_STAGE, 0.05);
  const sizes = [
    [1280, 800, 1], [1280, 800, 1.5], [1280, 800, 2], [1366, 768, 1], [1366, 1024, 2], [1440, 900, 1], [1440, 900, 2], [1536, 864, 1.25], [1680, 1050, 1],
    [1920, 1080, 1], [1920, 1080, 2], [1920, 1200, 1], [2560, 1440, 1], [2560, 1440, 2], [3840, 2160, 1], [5120, 2880, 1],
    [1024, 768, 2], [1180, 820, 2], [820, 1180, 2], [390, 844, 3], [844, 390, 3], [1366, 680, 1], [768, 1024, 2], [960, 680, 1], [1024, 600, 1],
  ];
  const moved = [];
  for (const [w, h, dpr] of sizes) {
    const at = `${w}×${h}@${dpr}`;
    const plain = planIntroLayout({ w, h, dpr, art: ART, logoRatio: LOGO_RATIO }); // 손 칸이 없는 그림
    const p = planIntroLayout({ w, h, dpr, art: ART_HAND, logoRatio: LOGO_RATIO });
    // 손 칸이 없으면 가운데 그대로
    assert.equal(plain.button.x, w / 2, `${at} 손 칸 없음 → 가운데`);
    assert.equal(plain.button.nudge, 0, at);
    // 위아래·크기·모드·그림·제목은 그대로, 가로만
    assert.deepEqual([p.mode, p.image, p.logo, p.button.y, p.button.h, p.button.s], [plain.mode, plain.image, plain.logo, plain.button.y, plain.button.h, plain.button.s], at);
    // 독립 계산: 가운데 자리에서 손 칸과 겹치면 겹치지 않을 만큼(손 칸 왼쪽 끝까지), 한도까지
    const centered = buttonBox(plain.button);
    const hand = handOn(p);
    const limit = Math.min(0.2 * 3.6 * plain.button.h, 0.05 * p.stage.w);
    let want = area(centered, hand) > 0 ? Math.min(centered.x1 - hand.x0, limit) : 0;
    const shifted = { ...centered, x0: centered.x0 - want, x1: centered.x1 - want };
    if (area(shifted, hand) >= area(centered, hand)) want = 0; // 옮겨도 손이 더 보이지 않으면 옮기지 않는다
    const dx = w / 2 - p.button.x;
    assert.ok(Math.abs(dx - want) < 1e-9, `${at} 옮긴 거리 ${dx} / ${want}`);
    assert.ok(dx >= 0 && dx <= limit + 1e-9, `${at} 왼쪽으로만, 한도 ${limit} 안`);
    assert.ok(Math.abs(p.button.nudge - dx) < 1e-9, at);
    const after = area(buttonBox(p.button), hand);
    if (dx > 0) assert.ok(after < area(centered, hand), `${at} 옮겼으면 손이 더 보인다`);
    else assert.equal(p.button.x, w / 2, `${at} 안 옮기면 가운데 그대로`);
    if (dx > 0 && dx < limit - 1e-9) assert.ok(after < 1e-6, `${at} 한도 안에서 옮겼으면 손이 다 보인다 ${after}`);
    // 옮긴 뒤에도: 무대(카드) 안, 두 아이의 머리·제목과 겹치지 않는다
    const box = buttonBox(p.button);
    assert.ok(box.x0 >= Math.max(0, p.stage.x) - 1e-9, `${at} 무대 왼쪽 밖으로 나가지 않는다`);
    const k = p.image.w / ART.width;
    const logo = { x0: p.logo.x, y0: p.logo.y, x1: p.logo.x + p.logo.w, y1: p.logo.y + p.logo.w / LOGO_RATIO };
    assert.equal(overlap(box, logo), false, `${at} 버튼과 제목`);
    for (const [x0, y0, x1, y1] of ART.avoid) assert.equal(overlap(box, { x0: p.image.x + x0 * k, y0: p.image.y + y0 * k, x1: p.image.x + x1 * k, y1: p.image.y + y1 * k }), false, `${at} 버튼과 머리`);
    if (dx > 0) moved.push(at);
  }
  // 배율 1.35 화면: 1920×1080은 손을 다 비킨다(약 58px — 한도 82px 안), 겹침이 줄어든다
  const big = planIntroLayout({ w: 1920, h: 1080, dpr: 1, art: ART_HAND, logoRatio: LOGO_RATIO });
  assert.ok(big.button.nudge > 50 && big.button.nudge < 0.2 * 3.6 * 113.4, `1920×1080 옮긴 거리 ${big.button.nudge}`);
  assert.ok(area(buttonBox(big.button), handOn(big)) < 1e-6);
  assert.ok(area(buttonBox(planIntroLayout({ w: 1920, h: 1080, dpr: 1, art: ART, logoRatio: LOGO_RATIO }).button), handOn(big)) > 0, '가운데 자리는 손을 가린다');
  assert.ok(moved.includes('1920×1080@1') && moved.includes('1440×900@2') && moved.includes('1366×768@1') && !moved.includes('1024×768@2'), moved.join(' '));
  // 세로 화면 카드: 손이 버튼 한가운데 아래라 한도만큼 옮겨도 더 보이지 않는다 → 옮기지 않는다(사용자 결정)
  for (const at of ['820×1180@2', '768×1024@2', '390×844@3']) assert.equal(moved.includes(at), false, `${at}는 옮기지 않는다`);
  for (const [w, h, dpr] of [[820, 1180, 2], [768, 1024, 2], [390, 844, 3]]) {
    const p = planIntroLayout({ w, h, dpr, art: ART_HAND, logoRatio: LOGO_RATIO });
    assert.equal(p.mode, 'card');
    assert.ok(area(buttonBox(p.button), handOn(p)) > 0, `${w}×${h} 손은 버튼 아래(가려진 채로 둔다)`);
  }
});
