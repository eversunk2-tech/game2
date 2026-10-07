/**
 * 효과음. 소리 파일 없이 Web Audio로 짧은 음을 만든다(파일 한 개 배포 유지).
 * 브라우저 정책상 첫 소리는 학생이 버튼을 누른 뒤에만 난다.
 * 켬/끔 상태는 저장되며, 주소에 ?sound=off 를 붙이면 처음부터 꺼진다.
 */

// [주파수(Hz), 길이(초)]
const PATTERNS = {
  click: [[520, 0.05]],
  correct: [[660, 0.09], [880, 0.14]],
  wrong: [[300, 0.12], [220, 0.2]],
  clear: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.28]],
};

export function createSfx({ storage = null, enabled = true, volume = 0.18 } = {}) {
  let muted = !enabled || Boolean(storage?.get('muted', false));
  let ctx = null;

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

  function play(name) {
    if (muted) return;
    const pattern = PATTERNS[name];
    if (!pattern) return;
    const ac = ensureContext();
    if (!ac) return;

    let t = ac.currentTime + 0.01;
    for (const [freq, dur] of pattern) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = name === 'wrong' ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur * 0.9;
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
