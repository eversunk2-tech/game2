import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoop, toCanvasPoint } from '../../src/shared/core/canvas.js';

function fakeFrames() {
  const queue = [];
  return {
    raf: (fn) => queue.push(fn),
    caf: () => {},
    tick(time) {
      const fn = queue.shift();
      fn?.(time);
    },
    get pending() {
      return queue.length;
    },
  };
}

test('게임 루프: dt는 초 단위이고 maxDt로 자른다', () => {
  const frames = fakeFrames();
  const dts = [];
  let renders = 0;
  const loop = createLoop({ update: (dt) => dts.push(dt), render: () => (renders += 1), raf: frames.raf, caf: frames.caf, maxDt: 0.1 });
  loop.start();
  frames.tick(1000);
  frames.tick(1016);
  frames.tick(5000); // 탭을 오래 비웠다 돌아온 경우
  assert.deepEqual(dts.map((x) => Number(x.toFixed(3))), [0, 0.016, 0.1]);
  assert.equal(renders, 3);
  loop.stop();
  assert.equal(loop.running, false);
  frames.tick(5016);
  assert.equal(dts.length, 3);
});

test('포인터 위치를 캔버스 논리 좌표로 바꾼다', () => {
  const canvas = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200 }) };
  const point = toCanvasPoint(canvas, { clientX: 300, clientY: 150 }, { width: 800, height: 400 });
  assert.deepEqual(point, { x: 400, y: 200 });
});
