
let audioCtx: AudioContext | null = null;

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

// Background music removed as per request

export const startBackgroundMusic = () => {
  // Disabled
};

export const stopBackgroundMusic = () => {
  // Disabled
};

export const playSwingSound = () => {
  const ctx = initAudio();
  if (!ctx) return;

  const t = ctx.currentTime;

  // "Plok" - Impact Sound
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  
  // Rapid pitch drop for punchiness
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.8, t + 0.005); // Sharp attack
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1); // Fast decay

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.15);
};

export const playHoleSound = () => {
  const ctx = initAudio();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Happy Arpeggio
  [0, 0.1, 0.2].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880 + (i * 200), now + offset); // A5 ish

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now + offset);
    gain.gain.linearRampToValueAtTime(0.2, now + offset + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.7);
  });
};
