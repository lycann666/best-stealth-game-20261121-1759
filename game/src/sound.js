// Synthesised sound only: a few WebAudio oscillators, no audio files, nothing
// loaded over the network. Every call is a no-op while muted or before the first
// gesture. The archive is quiet at night, so the effects stay soft: wingbeats,
// petal chimes, a rising warning when a warden turns suspicious.
export function createSound() {
  let ctx = null;
  let muted = false;

  function ensure() {
    if (ctx === null) {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, when, dur, type, vol) {
    const ac = ensure();
    if (ac === null || muted) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ac.currentTime + when);
    gain.gain.exponentialRampToValueAtTime(vol, ac.currentTime + when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + when + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(ac.currentTime + when);
    osc.stop(ac.currentTime + when + dur + 0.05);
  }

  return {
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    unlock() {
      ensure();
    },
    /** A soft wingbeat tick while Milo walks; called by the loop, throttled there. */
    step(sprinting) {
      tone(sprinting ? 300 : 220, 0, 0.04, 'sine', 0.03);
    },
    /** A two-note chime when a moonpetal is gathered. */
    pickup() {
      tone(880, 0, 0.14, 'sine', 0.16);
      tone(1318, 0.07, 0.2, 'sine', 0.12);
    },
    /** The exit window swings open: a low warm chord. */
    exitOpen() {
      tone(392, 0, 0.3, 'triangle', 0.12);
      tone(587, 0.08, 0.3, 'triangle', 0.1);
    },
    /** A rising warning as a warden grows suspicious. */
    spotted() {
      tone(220, 0, 0.12, 'sawtooth', 0.07);
      tone(330, 0.1, 0.16, 'sawtooth', 0.07);
    },
    /** Caught: a short descending buzz. */
    caught() {
      tone(180, 0, 0.22, 'sawtooth', 0.12);
      tone(120, 0.12, 0.3, 'sawtooth', 0.1);
    },
    /** A little arpeggio when a level is cleared. */
    levelDone() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.14));
    },
    click() {
      tone(660, 0, 0.05, 'square', 0.04);
    },
  };
}
