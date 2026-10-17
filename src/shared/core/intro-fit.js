/**
 * 게임 인트로 그림 맞추기(순수 함수 — 엔진 ui/app.js의 인트로 화면이 쓴다. 사용법: docs/engine.md 2절 "게임 인트로").
 * 규칙은 selectio game과 같다(spec-grade6 15-9 — 그 기획서 「S13-C」, 2026-10-17 사용자 요청):
 *   1. 꽉 채우기: 화면을 덮도록 그림을 놓되 그림을 1.35배까지만 늘린다(그림 CSS 폭 × devicePixelRatio ÷ 그림 폭 ≤ INTRO_UPSCALE_MAX).
 *   2. 꼭 보일 칸(keep — 인물)은 자르지 않는다: 덮는 크기에서 그 칸이 화면 밖으로 나가면 그 칸이 들어갈 만큼만 줄인다.
 *   3. 그렇게 해서 화면에 남는 띠(위아래 합 ÷ 화면 높이, 양옆 합 ÷ 화면 폭 가운데 큰 값)가 5%(INTRO_BAND_MAX)를 넘으면
 *      "얇은 여백 카드": 그림 전체가 보이는 둥근 카드. 카드는 늘리지 않는다(1.0) — 폭 = min(그림 폭 ÷ DPR, 화면 폭 − 24, (화면 높이 − 12 − 아래 자리) × 비율).
 *      여백은 양옆·위 12px(남으면 위아래 가운데), 아래는 [입장하기]가 카드 아래 가장자리에 걸칠 자리.
 *   4. 화면 크기·방향·devicePixelRatio가 바뀌면 다시 정한다(부르는 쪽).
 * 제목 그림은 그림이 보이는 곳(무대 — 꽉 채우기면 화면, 카드면 카드)의 가운데 위에 두되, 그림 속 두 아이의 머리(avoid)를 가리지 않는 크기까지만.
 * 두 모드 모두 그림의 왼쪽·위를 기기 화소에 맞추고 폭을 기기 화소로 내린다(반 화소에 놓이면 흐려진다).
 */

/** 꽉 채우기에서 그림을 늘려도 되는 한도(그림 CSS 폭 × DPR ÷ 그림 폭) */
export const INTRO_UPSCALE_MAX = 1.35;
/** 꽉 채우기로 둘 수 있는 띠의 가장 큰 비율(화면의 5%) — 넘으면 카드 */
export const INTRO_BAND_MAX = 0.05;
/** 카드의 여백(양옆·위, px) */
export const INTRO_CARD_GAP = 12;
/** [입장하기]의 가운데가 카드 아래 끝보다 이만큼 위(px — 가장자리에 걸친다) */
export const INTRO_CARD_BUTTON_UP = 4;
/** 카드 모드에서 [입장하기] 아래와 화면 밑 사이(px) */
export const INTRO_CARD_FOOT = 10;
/** 제목 그림이 머리 상자와 띄울 거리(px) */
export const INTRO_AVOID_GAP = 6;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** devicePixelRatio를 쓸 수 있는 값으로(없거나 이상하면 1) */
export function sanitizeDpr(dpr) {
  return typeof dpr === 'number' && Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 8) : 1;
}

/** [입장하기] 면의 높이(px, 배율 1): 화면 높이의 10.5%·폭의 16% 가운데 작은 값, 56~84. 큰 화면에서는 여기에 introButtonScale을 곱한다 */
export function introButtonHeight(w, h) {
  return Math.round(clamp(Math.min(0.105 * h, 0.16 * w), 56, 84));
}

/** 큰 화면에서 [입장하기]를 키우는 배율의 상한(spec-grade6 15-11 — selectio game과 같다). 이 값 하나로 바꾼다 */
export const INTRO_BUTTON_GROW_MAX = 1.35;

/**
 * [입장하기]의 배율(spec-grade6 15-11 — selectio game의 규칙 그대로): min(화면 CSS 폭 ÷ 1280, 화면 CSS 높이 ÷ 800)을 1~INTRO_BUTTON_GROW_MAX로 묶은 값.
 * 1280×800·1366×768 크롬북·태블릿·휴대폰은 1(그대로) · 1366×1024 약 1.067 · 1440×900 1.125 · 1920×1080 이상 1.35.
 * 면 높이(introButtonHeight × 배율)와 테·여백·반짝임·그림자·누르기/올리기 거리·초점 후광을 모두 이 배율로 키운다 — transform: scale이 아니라 크기 자체를
 * (엔진이 planIntroLayout의 button.s를 CSS 변수 --btn-s = 1px × 배율로 준다, base.css의 [입장하기] 블록)
 */
export function introButtonScale(w, h) {
  const s = Math.min(w / 1280, h / 800);
  return Number.isFinite(s) ? clamp(s, 1, INTRO_BUTTON_GROW_MAX) : 1;
}

/** [입장하기]를 그림 속 손 칸에서 비키는 한도: min(면 폭 × 0.2, 무대 폭 × 0.05) (spec-grade6 15-11 끝 — 2026-10-17 사용자 결정 "왼쪽으로 약간만") */
export const INTRO_BUTTON_NUDGE_MAX = 0.2;
export const INTRO_BUTTON_NUDGE_STAGE = 0.05;

/**
 * [입장하기]가 그림 속 가리면 안 되는 칸(art.buttonAvoid — 소녀가 전개도를 든 손, 그림 px)을 가리면 **왼쪽으로만** 옮긴다:
 * 겹치지 않을 만큼까지, 다만 한도 min(면 폭 × INTRO_BUTTON_NUDGE_MAX, 무대 폭 × INTRO_BUTTON_NUDGE_STAGE)까지(못 피하면 한도만큼 — 손이 조금 가려져도 된다).
 * 버튼 = 화면에 보이는 버튼 전체: 면(폭 = 높이 × 3.6 — base.css의 최소 폭, 높이 h) + 바깥 여백 8 × s(위·양옆) + 아래 그림자 10 × s(7 + 테두리 3).
 * 위아래 자리·크기는 그대로. 꽉 채우기·카드 모두(카드에서는 그림 = 카드). 돌려주는 nudge = 옮긴 거리(px, 0 이상)
 */
export function placeIntroButton(button, image, stage, art) {
  const half = (button.h * 3.6) / 2;
  const box = { x0: button.x - half - 8 * button.s, y0: button.y - button.h / 2 - 8 * button.s, x1: button.x + half + 8 * button.s, y1: button.y + button.h / 2 + 10 * button.s };
  const k = image.w / art.width;
  let need = 0;
  for (const [ax0, ay0, ax1, ay1] of art.buttonAvoid ?? []) {
    const hand = { x0: image.x + ax0 * k, y0: image.y + ay0 * k, x1: image.x + ax1 * k, y1: image.y + ay1 * k };
    // 손 칸의 왼쪽 끝이 버튼 왼쪽 끝보다 오른쪽일 때만(왼쪽으로 옮겨 비킬 수 있을 때) 겹친 만큼
    if (hand.x0 > box.x0 && box.x0 < hand.x1 && hand.x0 < box.x1 && box.y0 < hand.y1 && hand.y0 < box.y1) need = Math.max(need, box.x1 - hand.x0);
  }
  const nudge = Math.min(need, INTRO_BUTTON_NUDGE_MAX * 2 * half, INTRO_BUTTON_NUDGE_STAGE * stage.w, Math.max(0, box.x0 - Math.max(0, stage.x)));
  return { ...button, x: button.x - nudge, nudge };
}

/**
 * 한 축에서 그림 왼쪽(위) 자리가 될 수 있는 범위: 꼭 보일 칸이 화면 안, 그림이 화면보다 크면 화면을 덮고(빈 곳 없음) 작으면 화면 안에 다 든다.
 * 그런 자리가 없으면 null (selectio game introFit.ts의 axisRange와 같다)
 */
function axisRange(screen, size, k0, k1) {
  let lo = -k0 * size;
  let hi = screen - k1 * size;
  if (size >= screen) {
    lo = Math.max(lo, screen - size);
    hi = Math.min(hi, 0);
  } else {
    lo = Math.max(lo, 0);
    hi = Math.min(hi, screen - size);
  }
  return lo <= hi + 1e-6 ? [lo, Math.max(lo, hi)] : null;
}

/**
 * 인트로의 모드·자리·크기.
 * @param {{ w: number, h: number, dpr: number, art: { width: number, height: number, keep: number[], avoid?: number[][] }, logoRatio?: number }} o
 *   w·h = 화면(CSS px), dpr = devicePixelRatio, art = 배경 그림의 크기(px)와 꼭 보일 칸 keep [x0, y0, x1, y1]·가릴 수 없는 머리 avoid(그림 px),
 *   logoRatio = 제목 그림(잘라 쓰는 상자)의 가로 ÷ 세로
 * @returns {{ mode: 'fill'|'card', image: {x,y,w,h}, stage: {x,y,w,h}, band: number, ratio: number,
 *   button: { x: number, y: number, h: number }, logo: { x: number, y: number, w: number }, keepVisible: boolean }}
 *   image = 그림(화면 px — 꽉 채우기에서는 화면 밖으로 나가는 쪽이 잘린다), stage = 그림이 보이는 곳(꽉 채우기 = 화면, 카드 = 카드),
 *   band = 늘리지 않는 꽉 채우기에서 남는 띠의 비율(모드를 정한 값), ratio = 그림 CSS 폭 × DPR ÷ 그림 폭(꽉 채우기 ≤ 1.35, 카드 ≤ 1),
 *   button = [입장하기] 면의 가운데·높이, logo = 제목 그림 상자의 왼쪽 위·폭(화면 px)
 */
export function planIntroLayout(o) {
  const { w: sw, h: sh, art } = o;
  const dpr = sanitizeDpr(o.dpr);
  const W = art.width;
  const H = art.height;
  const [kx0, ky0, kx1, ky1] = art.keep ?? [0, 0, W, H];
  const btnS = introButtonScale(sw, sh); // 큰 화면에서 [입장하기]의 배율(1~1.35) — 배치도 커진 크기로 맞춘다
  const btnH = introButtonHeight(sw, sh) * btnS;
  const snap = (v) => Math.round(v * dpr) / dpr;
  const floorPx = (v) => Math.max(1, Math.floor(v * dpr + 1e-6)) / dpr;

  // ① 늘리지 않는 꽉 채우기: 덮는 배율에서 시작해 꼭 보일 칸이 들어가는 만큼·늘림 한도만큼 줄인다
  const cover = Math.max(sw / W, sh / H);
  const s = Math.min(cover, sw / (kx1 - kx0), sh / (ky1 - ky0), INTRO_UPSCALE_MAX / dpr);
  const fw = floorPx(W * s);
  const fh = (fw * H) / W;
  const rx = axisRange(sw, fw, kx0 / W, kx1 / W);
  const ry = axisRange(sh, fh, ky0 / H, ky1 / H);
  let band = 1;
  let fx = (sw - fw) / 2;
  let fy = (sh - fh) / 2;
  if (rx && ry) {
    fx = snap(clamp(fx, rx[0], rx[1]));
    fy = snap(clamp(fy, ry[0], ry[1]));
    const bandX = (Math.max(0, fx) + Math.max(0, sw - (fx + fw))) / sw;
    const bandY = (Math.max(0, fy) + Math.max(0, sh - (fy + fh))) / sh;
    band = Math.max(bandX, bandY);
  }

  let mode;
  let image;
  let stage;
  let button;
  if (band <= INTRO_BAND_MAX + 1e-9) {
    mode = 'fill';
    image = { x: fx, y: fy, w: fw, h: fh };
    stage = { x: 0, y: 0, w: sw, h: sh };
    // [입장하기]: 화면 아래 가운데(밑에서 화면 높이의 3.5%, 적어도 14px)
    button = placeIntroButton({ x: sw / 2, y: sh - Math.max(14, 0.035 * sh) - btnH / 2, h: btnH, s: btnS }, image, stage, art); // 손 칸을 가리면 왼쪽으로 조금
  } else {
    // ② 얇은 여백 카드(늘리지 않는다)
    mode = 'card';
    const bottom = btnH / 2 - INTRO_CARD_BUTTON_UP + INTRO_CARD_FOOT * btnS; // 화면 밑과의 틈도 배율만큼(아래 그림자가 함께 커진다)
    const cw = floorPx(Math.min(W / dpr, sw - 2 * INTRO_CARD_GAP, ((sh - INTRO_CARD_GAP - bottom) * W) / H));
    const ch = (cw * H) / W;
    const cx = snap((sw - cw) / 2);
    const cy = snap(INTRO_CARD_GAP + Math.max(0, (sh - bottom - INTRO_CARD_GAP - ch) / 2));
    image = { x: cx, y: cy, w: cw, h: ch };
    stage = { ...image };
    button = placeIntroButton({ x: sw / 2, y: cy + ch - INTRO_CARD_BUTTON_UP, h: btnH, s: btnS }, image, stage, art); // 손 칸을 가리면 왼쪽으로 조금
  }

  // ③ 제목 그림: 무대의 보이는 곳 가운데 위. 폭 = 무대 폭의 47%, 무대 높이의 52%(× 비율)까지, 그리고 두 아이의 머리를 가리지 않는 만큼까지
  const logoRatio = o.logoRatio ?? 1.6;
  const vx0 = Math.max(stage.x, 0);
  const vy0 = Math.max(stage.y, 0);
  const vx1 = Math.min(stage.x + stage.w, sw);
  const vy1 = Math.min(stage.y + stage.h, sh);
  const vw = vx1 - vx0;
  const vh = vy1 - vy0;
  const cxMid = (vx0 + vx1) / 2;
  const top = vy0 + Math.max(mode === 'card' ? 8 : 10, 0.025 * vh);
  let lw = Math.min(0.47 * vw, 0.52 * vh * logoRatio);
  const k = image.w / W;
  for (const [ax0, ay0, ax1, ay1] of art.avoid ?? []) {
    const head = { x0: image.x + ax0 * k, y0: image.y + ay0 * k, x1: image.x + ax1 * k, y1: image.y + ay1 * k };
    // 제목 상자(가운데 cxMid, 위 top, 폭 lw, 높이 lw ÷ 비율)가 이 머리와 겹치면: 옆으로 비키는 폭과 위로 비키는 폭 가운데 큰 쪽까지 줄인다
    const byTop = (head.y0 - INTRO_AVOID_GAP - top) * logoRatio;
    const bySide = head.x1 <= cxMid ? 2 * (cxMid - head.x1 - INTRO_AVOID_GAP) : head.x0 >= cxMid ? 2 * (head.x0 - INTRO_AVOID_GAP - cxMid) : -Infinity;
    const box = { x0: cxMid - lw / 2, y0: top, x1: cxMid + lw / 2, y1: top + lw / logoRatio };
    const hit = box.x0 < head.x1 && head.x0 < box.x1 && box.y0 < head.y1 && head.y0 < box.y1;
    if (hit) lw = Math.max(0, Math.min(lw, Math.max(byTop, bySide)));
  }
  lw = Math.max(0, Math.floor(lw));
  const logo = { x: Math.round(cxMid - lw / 2), y: Math.round(top), w: lw };

  const keepVisible = image.x + kx0 * k >= -0.5 && image.y + ky0 * k >= -0.5 && image.x + kx1 * k <= sw + 0.5 && image.y + ky1 * k <= sh + 0.5;
  return { mode, image, stage, band, ratio: (image.w * dpr) / W, button, logo, keepVisible };
}
