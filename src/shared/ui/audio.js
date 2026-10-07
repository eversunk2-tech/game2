/**
 * 효과음. 소리 파일 없이 Web Audio로 짧은 음을 만든다(파일 한 개 배포 유지). 음량은 0.18 이하.
 * 브라우저 정책상 첫 소리는 학생이 버튼을 누른 뒤에만 난다.
 * 켬/끔 상태는 저장되며, 주소에 ?sound=off 를 붙이면 처음부터 꺼진다.
 *
 *   sfx.play('correct')     이름: click correct wrong clear stamp combo discover rankup fold unlock
 *   sfx.play('combo', 3)    연속 수만큼 한 음씩 높아지는 5음계
 */

// 5음계(도 레 미 솔 라)를 위로 이어 간다: combo 음 높이
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0];
const pentatonic = (step) => PENTATONIC[step % 5] * 2 ** Math.floor(step / 5);

/**
 * 소리 모양. tone: { t(시작, 초), d(길이), f(주파수), to(끝 주파수, 미끄럼), type, g(음량 배율) }
 * noise: { noise: true, t, d, band(가운데 주파수), q, g }
 */
export const SOUNDS = {
  // 종이 톡
  click: () => [{ t: 0, d: 0.03, f: 900, type: 'triangle', g: 0.6 }],
  // 마림바 두 음 (솔 → 도)
  correct: () => [
    { t: 0, d: 0.12, f: 783.99, type: 'sine' },
    { t: 0, d: 0.06, f: 1567.98, type: 'sine', g: 0.25 },
    { t: 0.1, d: 0.2, f: 1046.5, type: 'sine' },
    { t: 0.1, d: 0.08, f: 2093.0, type: 'sine', g: 0.25 },
  ],
  // 낮고 부드러운 "둥둥" (버저 아님)
  wrong: () => [
    { t: 0, d: 0.16, f: 330, type: 'sine', g: 0.8 },
    { t: 0.14, d: 0.24, f: 247, type: 'sine', g: 0.8 },
  ],
  // 도-미-솔-도 + 반짝
  clear: () => [
    { t: 0, d: 0.12, f: 523.25, type: 'triangle' },
    { t: 0.11, d: 0.12, f: 659.25, type: 'triangle' },
    { t: 0.22, d: 0.12, f: 783.99, type: 'triangle' },
    { t: 0.33, d: 0.32, f: 1046.5, type: 'triangle' },
    { t: 0.42, d: 0.22, f: 2093.0, type: 'sine', g: 0.3 },
  ],
  // 도장 "쿵": 낮은 음 + 짧은 잡음
  stamp: () => [
    { t: 0, d: 0.16, f: 120, to: 70, type: 'sine' },
    { noise: true, t: 0, d: 0.06, band: 900, q: 0.8, g: 0.5 },
  ],
  // 연속: n번째일수록 한 음씩 높게
  combo: (n = 1) => {
    const step = Math.max(0, Math.min(14, Math.floor(Number(n) || 1) - 1));
    return [
      { t: 0, d: 0.1, f: pentatonic(step), type: 'sine' },
      { t: 0.08, d: 0.16, f: pentatonic(step + 2), type: 'sine', g: 0.8 },
    ];
  },
  // 새로 찾음: 올라가는 미끄럼음 + 종
  discover: () => [
    { t: 0, d: 0.22, f: 440, to: 880, type: 'sine', g: 0.7 },
    { t: 0.2, d: 0.4, f: 1318.5, type: 'sine', g: 0.6 },
    { t: 0.2, d: 0.3, f: 2637.0, type: 'sine', g: 0.15 },
  ],
  // 짧은 팡파르
  rankup: () => [
    { t: 0, d: 0.1, f: 523.25, type: 'triangle' },
    { t: 0.1, d: 0.1, f: 659.25, type: 'triangle' },
    { t: 0.2, d: 0.1, f: 783.99, type: 'triangle' },
    { t: 0.3, d: 0.36, f: 1046.5, type: 'triangle' },
    { t: 0.3, d: 0.36, f: 783.99, type: 'triangle', g: 0.5 },
  ],
  // 종이 스치는 소리
  fold: () => [{ noise: true, t: 0, d: 0.15, band: 2600, q: 0.7, g: 0.45 }],
  // 종 두 번
  unlock: () => [
    { t: 0, d: 0.3, f: 1174.66, type: 'sine', g: 0.7 },
    { t: 0.16, d: 0.4, f: 1567.98, type: 'sine', g: 0.7 },
  ],
};

export function createSfx({ storage = null, enabled = true, volume = 0.18 } = {}) {
  let muted = !enabled || Boolean(storage?.get('muted', false));
  const level = Math.min(0.18, Math.max(0, volume));
  let ctx = null;
  let noiseBuffer = null;

  function ensureContext() {
    if (!ctx) {
      const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function noise(ac) {
    if (!noiseBuffer) {
      noiseBuffer = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.3), ac.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function envelope(ac, start, dur, gainValue) {
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    gain.connect(ac.destination);
    return gain;
  }

  function play(name, n) {
    if (muted) return;
    const shape = SOUNDS[name];
    if (!shape) return;
    const ac = ensureContext();
    if (!ac) return;
    try {
      const base = ac.currentTime + 0.01;
      for (const part of shape(n)) {
        const start = base + part.t;
        const gain = envelope(ac, start, part.d, level * (part.g ?? 1));
        if (part.noise) {
          const src = ac.createBufferSource();
          src.buffer = noise(ac);
          const filter = ac.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = part.band;
          filter.Q.value = part.q ?? 1;
          src.connect(filter).connect(gain);
          src.start(start);
          src.stop(start + part.d + 0.02);
        } else {
          const osc = ac.createOscillator();
          osc.type = part.type ?? 'sine';
          osc.frequency.setValueAtTime(part.f, start);
          if (part.to) osc.frequency.exponentialRampToValueAtTime(part.to, start + part.d);
          osc.connect(gain);
          osc.start(start);
          osc.stop(start + part.d + 0.02);
        }
      }
    } catch {
      // 소리는 없어도 게임은 계속된다.
    }
  }

  return {
    play,
    isMuted: () => muted,
    setMuted(value) {
      muted = Boolean(value);
      storage?.set('muted', muted);
    },
  };
}
