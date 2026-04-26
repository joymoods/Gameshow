let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function playTone(freq: number, type: OscillatorType, duration: number, gain = 0.4, startOffset = 0) {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.connect(env);
  env.connect(ac.destination);
  osc.type = type;
  osc.frequency.value = freq;
  const start = ac.currentTime + startOffset;
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.start(start);
  osc.stop(start + duration);
}

export function playBuzz() {
  playTone(140, 'square', 0.25, 0.35);
}

export function playCorrect() {
  playTone(523, 'sine', 0.12, 0.3, 0.00);   // C5
  playTone(659, 'sine', 0.12, 0.3, 0.12);   // E5
  playTone(784, 'sine', 0.18, 0.35, 0.24);  // G5
}

export function playWrong() {
  playTone(330, 'sawtooth', 0.15, 0.25, 0.00);  // E4
  playTone(262, 'sawtooth', 0.20, 0.25, 0.15);  // C4
}
