export const MUSIC_VOL = 0.42;

type AC = typeof AudioContext;

function decode(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Older Safari only supports the callback form.
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

/**
 * Web Audio graph: sfx + music (with a muffling low-pass) → master → compressor → speakers.
 * Created lazily on the first user gesture so browsers (and iOS) let it start.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  musicFilter!: BiquadFilterNode;
  noise!: AudioBuffer;
  sfxOn = true;
  musicOn = true;
  /** True while we have deliberately suspended audio (app in background). */
  parked = false;
  onStart: (() => void) | null = null;
  private samples = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<ArrayBuffer | null>>();
  private primed = false;

  /** Start downloading a sample right away; it is decoded once the context exists. */
  preload(name: string, url: string): void {
    this.pending.set(
      name,
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null),
    );
  }

  /** Call from every user gesture until audio is running (iOS needs a gesture to start or resume). */
  unlock(): void {
    try {
      if (!this.ctx) this.create();
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      if (!this.primed) {
        this.primed = true;
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
      }
    } catch {
      // No audio on this device — the game still works silently.
    }
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  sample(name: string): AudioBuffer | undefined {
    return this.samples.get(name);
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.ctx) this.music.gain.setTargetAtTime(on ? MUSIC_VOL : 0, this.ctx.currentTime, 0.08);
  }

  /** Low-pass the music (pause menu, slow-mo, game over). 18000 = fully open. */
  muffle(freq: number, tc = 0.12): void {
    if (this.ctx) this.musicFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, tc);
  }

  /** Sounds may be scheduled: running, or resuming after a gesture (iOS resumes asynchronously). */
  get usable(): boolean {
    return !!this.ctx && this.ctx.state !== 'closed' && !this.parked;
  }

  suspend(): void {
    this.parked = true;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    this.parked = false;
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume().catch(() => undefined);
  }

  private create(): void {
    const Ctor: AC | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext;
    if (!Ctor) return;
    // iOS 17+: mix with the player's own music and respect the silent switch, like a good casual game.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'ambient';
      } catch {
        /* read-only on some versions */
      }
    }
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.002;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(this.master);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicFilter.Q.value = 0.8;
    this.musicFilter.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicOn ? MUSIC_VOL : 0;
    this.music.connect(this.musicFilter);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    for (const [name, p] of this.pending) {
      p.then((ab) => (ab ? decode(ctx, ab) : null))
        .then((buf) => {
          if (buf) this.samples.set(name, buf);
        })
        .catch(() => undefined);
    }
    this.onStart?.();
  }
}
