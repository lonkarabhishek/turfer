/**
 * Optional coin sounds for the cricket toss, off unless the user turns them on:
 * a thumb flick and a metal "ting" built from a few partials. Synthesised, so
 * there is nothing to download. Create it inside a tap so the browser lets it play.
 */
export type TossSound = {
  ting(delay: number, vol: number): void;
  click(delay: number, freq: number, vol: number): void;
  /** silence anything still scheduled */
  hush(): void;
  close(): void;
};

export function createTossSound(): TossSound | null {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  // One gain per batch of sounds, so hush() can drop everything queued on it.
  let bus = ctx.createGain();
  bus.connect(ctx.destination);
  const ready = () => {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx.state !== "closed";
  };

  const click = (delay: number, freq: number, vol: number) => {
    if (!ready()) return;
    const t0 = ctx.currentTime + Math.max(0, delay);
    const len = Math.floor(ctx.sampleRate * 0.025);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 0.9;
    g.gain.value = vol;
    src.connect(bp);
    bp.connect(g);
    g.connect(bus);
    src.start(t0);
  };

  return {
    click,
    ting(delay, vol) {
      if (!ready()) return;
      const t0 = ctx.currentTime + Math.max(0, delay);
      const out = ctx.createGain();
      out.gain.value = vol;
      out.connect(bus);
      // ratio, level, decay (s): an inharmonic set that reads as a small metal disc
      for (const [r, a, d] of [
        [1, 1, 0.95],
        [1.73, 0.5, 0.62],
        [2.32, 0.34, 0.46],
        [3.17, 0.2, 0.3],
        [4.08, 0.12, 0.2],
      ]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 2280 * r;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(a * 0.22, t0 + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        o.connect(g);
        g.connect(out);
        o.start(t0);
        o.stop(t0 + d + 0.05);
      }
      click(delay, 3400, vol * 0.35);
    },
    hush() {
      try {
        bus.disconnect();
      } catch {
        /* already gone */
      }
      bus = ctx.createGain();
      bus.connect(ctx.destination);
    },
    close() {
      ctx.close().catch(() => {});
    },
  };
}
