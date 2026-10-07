/**
 * Canvas 게임용 도구: 게임 루프, 고해상도 캔버스 준비, 포인터 좌표 변환.
 * DOM만으로 충분한 게임(카드·퍼즐)은 쓰지 않아도 된다.
 */

/**
 * requestAnimationFrame 게임 루프. update(dt)의 dt는 초 단위이며,
 * 탭을 바꿨다 돌아왔을 때 물체가 순간 이동하지 않도록 maxDt로 자른다.
 */
export function createLoop({
  update,
  render = () => {},
  maxDt = 0.1,
  raf = globalThis.requestAnimationFrame?.bind(globalThis),
  caf = globalThis.cancelAnimationFrame?.bind(globalThis),
}) {
  let handle = null;
  let last = null;
  let running = false;

  function frame(time) {
    if (!running) return;
    const dt = last == null ? 0 : Math.min((time - last) / 1000, maxDt);
    last = time;
    update(dt);
    render();
    if (running) handle = raf(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = null;
      handle = raf(frame);
    },
    stop() {
      running = false;
      if (handle != null) caf?.(handle);
      handle = null;
    },
    get running() {
      return running;
    },
  };
}

/**
 * 논리 크기(width×height)로 그림을 그릴 수 있게 캔버스를 준비한다.
 * 화면 크기에 맞춰 늘어나도(CSS) 레티나 화면에서 흐려지지 않는다.
 */
export function setupCanvas(canvas, { width, height, dpr = globalThis.devicePixelRatio || 1 }) {
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.aspectRatio = `${width} / ${height}`;
  canvas.classList.add('game-canvas');
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** 포인터 이벤트 위치를 캔버스 논리 좌표로 바꾼다. */
export function toCanvasPoint(canvas, event, { width, height }) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * width,
    y: ((event.clientY - rect.top) / rect.height) * height,
  };
}
