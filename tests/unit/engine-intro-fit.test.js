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
