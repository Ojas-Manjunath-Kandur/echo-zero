import type { Settings } from '../settings';

type Surface = 0 | 1 | 2 | 3; // tile, carpet, metal, concrete

const THEME_ROOT: Record<string, number> = {
  reception: 55,
  office: 49,
  archive: 43.65,
  lab: 61.74,
  exec: 65.41,
  garage: 41.2,
};
const MINOR = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15];

/**
 * Fully procedural audio: every sound in the game is synthesised with the Web Audio API, so there
 * are no sampled assets to license. Safe to use when audio is unavailable (all calls become no-ops).
 */
export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private reverbIn!: GainNode;
  private noiseBuf!: AudioBuffer;
  private comp!: DynamicsCompressorNode;
  listenerX = 0;
  private settings: Settings | null = null;

  // ambience
  private ambienceNodes: { stop: () => void }[] = [];
  private buzzGain: GainNode | null = null;
  private buzzPan: StereoPannerNode | null = null;
  private droneGain: GainNode | null = null;
  private tickTimer = 0;
  private tickOn = false;
  private tickX: number | null = null;
  private musicTimer = 0;
  private musicRoot = 55;
  private theme = 'reception';
  tension = 0;
  private heartTimer = 0;
  // continuous loops
  private rewindLoop: { stop: () => void; rate: (r: number) => void } | null = null;
  private visionLoop: { stop: () => void } | null = null;
  private lastStepAt = 0;
  private typeAt = 0;

  get available(): boolean {
    return !!this.ctx;
  }

  /** Must be called from a user gesture the first time. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.2;
      this.master = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.comp);
      this.comp.connect(ctx.destination);
      // reverb
      const conv = ctx.createConvolver();
      conv.buffer = this.makeImpulse(2.6, 3.0);
      this.reverbIn = ctx.createGain();
      this.reverbIn.gain.value = 1;
      const ret = ctx.createGain();
      ret.gain.value = 0.9;
      this.reverbIn.connect(conv);
      conv.connect(ret);
      ret.connect(this.master);
      // noise
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.settings) this.applySettings(this.settings);
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  applySettings(s: Settings) {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05);
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (0.25 + 0.5 * (i / len));
        d[i] = lp * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // ---------------------------------------------------------------- building blocks

  /** distance attenuation + stereo pan for a world x; returns the node to connect sources to */
  private route(x: number | undefined, wet = 0.14, base = 1): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    let out: AudioNode = g;
    let vol = base;
    if (x !== undefined) {
      const dx = x - this.listenerX;
      vol *= 1 / (1 + Math.pow(Math.abs(dx) / 620, 2));
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-0.85, Math.min(0.85, dx / 900));
      g.connect(pan);
      out = pan;
    }
    g.gain.value = vol;
    out.connect(this.sfxBus);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      out.connect(send);
      send.connect(this.reverbIn);
    }
    return g;
  }

  private tone(freq: number, type: OscillatorType, t: number, dur: number, vol: number, dest: AudioNode, o: { a?: number; endFreq?: number; detune?: number } = {}) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.endFreq), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const a = o.a ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, vol: number, dest: AudioNode, f: { type?: BiquadFilterType; freq?: number; q?: number; endFreq?: number; a?: number } = {}) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = f.type ?? 'bandpass';
    flt.frequency.setValueAtTime(f.freq ?? 1000, t);
    if (f.endFreq) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f.endFreq), t + dur);
    flt.Q.value = f.q ?? 1;
    const g = ctx.createGain();
    const a = f.a ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private now(): number {
    return this.ctx!.currentTime;
  }

  // ---------------------------------------------------------------- one-shots

  footstep(surface: Surface, sneak: boolean, x?: number, ghost = false) {
    if (!this.ctx) return;
    const t = this.now();
    if (t - this.lastStepAt < 0.025) return;
    this.lastStepAt = t;
    const v = (sneak ? 0.07 : 0.16) * (0.8 + Math.random() * 0.4) * (ghost ? 0.7 : 1);
    const d = this.route(x, ghost ? 0.7 : 0.12);
    const jit = 0.9 + Math.random() * 0.25;
    switch (surface) {
      case 0: // tile
        this.noise(t, 0.07, v * 1.4, d, { freq: 2100 * jit, q: 0.9 });
        this.tone(160 * jit, 'sine', t, 0.08, v * 0.8, d, { endFreq: 80 });
        break;
      case 1: // carpet
        this.noise(t, 0.1, v * 1.1, d, { type: 'lowpass', freq: 650 * jit, q: 0.5, a: 0.012 });
        break;
      case 2: // metal
        this.noise(t, 0.05, v * 1.2, d, { freq: 3000 * jit, q: 2 });
        this.tone(820 * jit, 'triangle', t, 0.16, v * 0.5, d, { endFreq: 700 });
        this.tone(140, 'sine', t, 0.09, v * 0.7, d, { endFreq: 70 });
        break;
      default: // concrete
        this.noise(t, 0.09, v * 1.3, d, { type: 'lowpass', freq: 1000 * jit, q: 0.7 });
        this.tone(110 * jit, 'sine', t, 0.1, v * 0.9, d, { endFreq: 55 });
    }
  }

  land(impact: number, surface: Surface, x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const v = Math.min(1, impact / 900) * 0.5 + 0.12;
    const d = this.route(x, 0.2);
    this.tone(90, 'sine', t, 0.22, v, d, { endFreq: 38 });
    this.noise(t, 0.12, v * 0.8, d, { type: 'lowpass', freq: surface === 1 ? 500 : 1400, q: 0.6 });
    if (surface === 2) this.tone(620, 'triangle', t, 0.25, v * 0.25, d, { endFreq: 520 });
  }

  jump(x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.05);
    this.noise(t, 0.12, 0.05, d, { freq: 1800, endFreq: 700, q: 0.8, a: 0.02 });
  }

  doorSlam(x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.5);
    this.tone(62, 'sine', t, 0.7, 0.9, d, { endFreq: 28 });
    this.noise(t, 0.35, 0.5, d, { type: 'lowpass', freq: 500, q: 0.6 });
    this.noise(t, 0.05, 0.4, d, { freq: 2500, q: 1.5 });
  }

  plate(down: boolean, x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.2);
    this.tone(down ? 1100 : 700, 'square', t, 0.04, 0.05, d, { endFreq: down ? 380 : 260 });
    this.tone(down ? 90 : 120, 'sine', t, 0.12, 0.35, d, { endFreq: 50 });
    this.noise(t, 0.04, 0.12, d, { freq: 3200, q: 2 });
  }

  lever(on: boolean, x?: number, ghost = false) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, ghost ? 0.7 : 0.25);
    this.noise(t, 0.06, 0.3, d, { freq: 1800, q: 2 });
    this.tone(on ? 180 : 140, 'square', t + 0.02, 0.07, 0.08, d, { endFreq: 70 });
    this.tone(70, 'sine', t + 0.03, 0.18, 0.45, d, { endFreq: 45 });
  }

  gate(opening: boolean, x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.4);
    const dur = opening ? 0.65 : 0.38;
    this.tone(opening ? 70 : 140, 'sawtooth', t, dur, 0.09, d, { endFreq: opening ? 150 : 55 });
    this.noise(t, dur, 0.1, d, { freq: 400, endFreq: opening ? 1400 : 200, q: 1.2, a: 0.05 });
    this.tone(55, 'sine', t + dur - 0.05, 0.3, opening ? 0.4 : 0.7, d, { endFreq: 30 });
    if (!opening) this.noise(t + dur - 0.04, 0.12, 0.45, d, { type: 'lowpass', freq: 700 });
  }

  pickup() {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(undefined, 0.5);
    this.tone(660, 'sine', t, 0.5, 0.18, d);
    this.tone(990, 'sine', t + 0.09, 0.7, 0.16, d);
    this.tone(1320, 'triangle', t + 0.18, 0.9, 0.06, d);
  }

  terminalOpen() {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(undefined, 0.2);
    this.tone(140, 'square', t, 0.1, 0.04, d, { endFreq: 700 });
    this.noise(t, 0.2, 0.06, d, { freq: 4000, q: 3 });
  }

  /** tiny blips while terminal text types out */
  typeBlip() {
    if (!this.ctx) return;
    const t = this.now();
    if (t - this.typeAt < 0.035) return;
    this.typeAt = t;
    const d = this.route(undefined, 0);
    this.tone(1400 + Math.random() * 500, 'square', t, 0.018, 0.018, d);
  }

  keyboard(x: number | undefined, n = 10) {
    if (!this.ctx) return;
    const t0 = this.now();
    const d = this.route(x, 0.3);
    let t = t0;
    for (let i = 0; i < n; i++) {
      t += 0.05 + Math.random() * 0.12 + (Math.random() < 0.15 ? 0.25 : 0);
      this.noise(t, 0.022, 0.1, d, { type: 'highpass', freq: 2800, q: 0.7 });
      this.tone(1900 + Math.random() * 300, 'square', t, 0.01, 0.015, d);
    }
  }

  elevatorDing(x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.7);
    this.tone(1318.5, 'sine', t, 1.8, 0.28, d);
    this.tone(1976, 'sine', t, 1.2, 0.1, d);
    this.tone(2637, 'sine', t, 0.7, 0.05, d);
  }

  /** machinery noise for elevator rides / arrivals */
  elevatorRide(dur = 4, x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.4);
    this.tone(48, 'sawtooth', t, dur, 0.16, d, { a: 0.6, endFreq: 52 });
    this.tone(96.5, 'sawtooth', t, dur, 0.06, d, { a: 0.8 });
    this.noise(t, dur, 0.06, d, { type: 'lowpass', freq: 380, q: 0.5, a: 0.8 });
    for (let k = 0; k < Math.floor(dur / 0.9); k++) this.tone(70, 'sine', t + 0.5 + k * 0.9, 0.2, 0.18, d, { endFreq: 40 });
  }

  elevatorDoors(open: boolean, x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.5);
    this.noise(t, 0.9, 0.08, d, { freq: 500, endFreq: open ? 900 : 300, q: 1.5, a: 0.1 });
    this.tone(open ? 82 : 110, 'sawtooth', t, 0.9, 0.07, d, { endFreq: open ? 130 : 70 });
    this.tone(60, 'sine', t + 0.85, 0.25, 0.5, d, { endFreq: 32 });
  }

  zap(x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.3, 0.8);
    this.noise(t, 0.16, 0.3, d, { type: 'highpass', freq: 1800, q: 0.7 });
    this.tone(95, 'sawtooth', t, 0.22, 0.12, d, { endFreq: 60 });
  }

  creak(x?: number, dur = 2.4) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.5, 0.7);
    this.tone(180, 'sawtooth', t, dur, 0.05, d, { a: 0.3, endFreq: 420 });
    this.noise(t, dur, 0.04, d, { freq: 700, endFreq: 1500, q: 8, a: 0.3 });
  }

  scrape(x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.5, 0.8);
    this.noise(t, 0.7, 0.18, d, { freq: 900, endFreq: 300, q: 1.5, a: 0.1 });
    this.tone(70, 'sine', t + 0.5, 0.2, 0.3, d, { endFreq: 40 });
  }

  /** the final elevator arriving: machinery, then a bell */
  elevatorArrive() {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(undefined, 0.8);
    this.tone(46, 'sawtooth', t, 2.2, 0.14, d, { a: 1.2, endFreq: 40 });
    this.noise(t, 2.2, 0.06, d, { type: 'lowpass', freq: 320, q: 0.5, a: 1 });
    this.tone(1318.5, 'sine', t + 2.3, 2.6, 0.3, d);
    this.tone(1976, 'sine', t + 2.3, 1.6, 0.1, d);
    this.tone(60, 'sine', t + 3.2, 0.4, 0.5, d, { endFreq: 30 });
    this.noise(t + 3.3, 1.3, 0.07, d, { freq: 600, endFreq: 1400, q: 1.5, a: 0.2 });
  }

  echoPulse(x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.9);
    this.tone(330, 'sine', t, 0.9, 0.05, d, { a: 0.1, endFreq: 300 });
    this.tone(496, 'sine', t + 0.05, 0.8, 0.03, d, { a: 0.12 });
  }

  echoBorn() {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(undefined, 0.8);
    this.tone(220, 'sine', t, 1.2, 0.16, d, { a: 0.05, endFreq: 440 });
    this.tone(330, 'sine', t + 0.05, 1.2, 0.1, d, { a: 0.08, endFreq: 660 });
    this.noise(t, 0.5, 0.08, d, { freq: 3000, endFreq: 6000, q: 2, a: 0.1 });
  }

  echoGone() {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(undefined, 0.8);
    this.tone(440, 'sine', t, 0.8, 0.1, d, { endFreq: 110 });
  }

  rewindDenied() {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(undefined, 0.1);
    this.tone(180, 'square', t, 0.12, 0.05, d, { endFreq: 90 });
  }

  death(x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.6);
    this.tone(400, 'sawtooth', t, 0.9, 0.18, d, { endFreq: 36 });
    this.noise(t, 0.6, 0.35, d, { freq: 3000, endFreq: 200, q: 1.2 });
    this.tone(55, 'sine', t, 1.2, 0.6, d, { endFreq: 28 });
  }

  uiClick() {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(undefined, 0.1);
    this.tone(520, 'square', t, 0.03, 0.04, d, { endFreq: 300 });
  }
  uiHover() {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(undefined, 0.05);
    this.tone(900, 'sine', t, 0.04, 0.03, d);
  }
  uiConfirm() {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(undefined, 0.5);
    this.tone(110, 'sine', t, 0.7, 0.4, d, { endFreq: 55 });
    this.noise(t, 0.4, 0.08, d, { freq: 800, endFreq: 200, q: 1 });
  }

  // ---------------------------------------------------------------- horror

  stinger(kind: 'hit' | 'rise' | 'glitch' | 'low' | 'soft') {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(undefined, 0.8);
    switch (kind) {
      case 'hit': {
        for (const f of [110, 116.54, 164.81, 233.08, 349.2]) this.tone(f, 'sawtooth', t, 1.7, 0.09, d, { endFreq: f * 0.96, a: 0.006 });
        this.tone(42, 'sine', t, 1.6, 0.9, d, { endFreq: 22 });
        this.noise(t, 0.35, 0.5, d, { freq: 1800, endFreq: 300, q: 0.7 });
        break;
      }
      case 'rise': {
        this.tone(80, 'sawtooth', t, 2.4, 0.12, d, { endFreq: 420, a: 1.8 });
        this.tone(83, 'sawtooth', t, 2.4, 0.1, d, { endFreq: 445, a: 1.8 });
        this.noise(t, 2.4, 0.12, d, { freq: 400, endFreq: 5200, q: 2, a: 1.6 });
        break;
      }
      case 'glitch': {
        for (let i = 0; i < 9; i++) {
          const tt = t + i * 0.035 + Math.random() * 0.02;
          this.tone(200 + Math.random() * 2400, 'square', tt, 0.03, 0.06, d);
          this.noise(tt, 0.03, 0.12, d, { type: 'highpass', freq: 3000 });
        }
        break;
      }
      case 'low': {
        this.tone(36, 'sine', t, 2.4, 0.8, d, { a: 0.4, endFreq: 30 });
        this.tone(54, 'triangle', t, 2.2, 0.25, d, { a: 0.5 });
        this.noise(t, 2, 0.1, d, { type: 'lowpass', freq: 220, q: 0.5, a: 0.5 });
        break;
      }
      default: {
        this.tone(220, 'sine', t, 2, 0.12, d, { a: 0.5 });
        this.tone(233.08, 'sine', t, 2, 0.1, d, { a: 0.5 });
      }
    }
  }

  distantFootsteps(x: number, count = 6, tempo = 0.52) {
    if (!this.ctx) return;
    const t0 = this.now();
    for (let i = 0; i < count; i++) {
      const t = t0 + i * tempo + Math.random() * 0.04;
      const d = this.route(x + i * 22, 0.85, 0.5);
      this.noise(t, 0.08, 0.2, d, { type: 'lowpass', freq: 520, q: 0.8 });
      this.tone(78, 'sine', t, 0.12, 0.3, d, { endFreq: 45 });
    }
  }

  whisper(x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.9, 0.9);
    for (let i = 0; i < 6; i++) {
      const tt = t + i * (0.18 + Math.random() * 0.16);
      this.noise(tt, 0.22, 0.09, d, { freq: 1800 + Math.random() * 2400, q: 6, a: 0.06, endFreq: 1500 + Math.random() * 2500 });
    }
  }

  /** a distorted, speech-like radio announcement (no real words — formant babble through static) */
  radio(x?: number, dur = 3.2) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = this.now();
    const d = this.route(x, 0.35, 0.8);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const v = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(v * 5);
    }
    shaper.curve = curve;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.9;
    shaper.connect(bp);
    bp.connect(d);
    // static bed
    this.noise(t0, dur, 0.08, bp, { freq: 2200, q: 0.5, a: 0.1 });
    let t = t0 + 0.2;
    while (t < t0 + dur - 0.2) {
      const syl = 0.06 + Math.random() * 0.14;
      const f0 = 95 + Math.random() * 70;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.linearRampToValueAtTime(f0 * (0.85 + Math.random() * 0.4), t + syl);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 400 + Math.random() * 900;
      f1.Q.value = 5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + syl);
      osc.connect(f1);
      f1.connect(g);
      g.connect(shaper);
      osc.start(t);
      osc.stop(t + syl + 0.05);
      t += syl + (Math.random() < 0.2 ? 0.25 : 0.03 + Math.random() * 0.05);
    }
    // dropouts
    this.tone(1000, 'square', t0 + dur - 0.1, 0.08, 0.03, bp);
  }

  // ---------------------------------------------------------------- continuous loops

  startRewind() {
    if (!this.ctx || this.rewindLoop) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.7, t + 0.12);
    out.connect(this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = 0.4;
    out.connect(send);
    send.connect(this.reverbIn);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 420;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lg = ctx.createGain();
    lg.gain.value = 60;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    const og = ctx.createGain();
    og.gain.value = 0.12;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 1400;
    osc.connect(og);
    og.connect(flt);
    flt.connect(out);
    const nz = ctx.createBufferSource();
    nz.buffer = this.noiseBuf;
    nz.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 2400;
    nf.Q.value = 3;
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    nz.connect(nf);
    nf.connect(ng);
    ng.connect(out);
    osc.start();
    lfo.start();
    nz.start();
    // reverse "whoosh" at the start
    this.noise(t, 0.4, 0.2, out, { freq: 300, endFreq: 5000, q: 1.5, a: 0.3 });
    this.rewindLoop = {
      rate: (r: number) => {
        const tt = ctx.currentTime;
        osc.frequency.setTargetAtTime(300 + r * 110, tt, 0.05);
        nf.frequency.setTargetAtTime(1800 + r * 500, tt, 0.05);
      },
      stop: () => {
        const tt = ctx.currentTime;
        out.gain.cancelScheduledValues(tt);
        out.gain.setTargetAtTime(0.0001, tt, 0.05);
        osc.stop(tt + 0.3);
        lfo.stop(tt + 0.3);
        nz.stop(tt + 0.3);
        // clunk
        this.tone(90, 'sine', tt, 0.25, 0.5, this.route(undefined, 0.5), { endFreq: 40 });
      },
    };
  }

  setRewindRate(r: number) {
    this.rewindLoop?.rate(r);
  }

  stopRewind() {
    if (!this.rewindLoop) return;
    this.rewindLoop.stop();
    this.rewindLoop = null;
  }

  startVision() {
    if (!this.ctx || this.visionLoop) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5, t + 0.35);
    out.connect(this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = 0.7;
    out.connect(send);
    send.connect(this.reverbIn);
    const nodes: (OscillatorNode | AudioBufferSourceNode)[] = [];
    for (const [f, v] of [
      [392, 0.05],
      [395, 0.05],
      [588, 0.025],
      [1176, 0.012],
    ] as [number, number][]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = v;
      const trem = ctx.createOscillator();
      trem.frequency.value = 5 + Math.random() * 3;
      const tg = ctx.createGain();
      tg.gain.value = v * 0.7;
      trem.connect(tg);
      tg.connect(g.gain);
      o.connect(g);
      g.connect(out);
      o.start();
      trem.start();
      nodes.push(o, trem);
    }
    // reversed swell
    this.noise(t, 0.5, 0.15, out, { freq: 800, endFreq: 6000, q: 2, a: 0.4 });
    this.visionLoop = {
      stop: () => {
        const tt = ctx.currentTime;
        out.gain.setTargetAtTime(0.0001, tt, 0.08);
        nodes.forEach((n) => n.stop(tt + 0.4));
        this.noise(tt, 0.3, 0.1, this.route(undefined, 0.6), { freq: 5000, endFreq: 500, q: 2 });
      },
    };
  }

  stopVision() {
    if (!this.visionLoop) return;
    this.visionLoop.stop();
    this.visionLoop = null;
  }

  // ---------------------------------------------------------------- ambience & music

  startAmbience(theme: string, opts: { drone: number; buzz: number; tick: number }, tickX?: number) {
    if (!this.ctx) return;
    this.stopAmbience();
    const ctx = this.ctx;
    this.theme = theme;
    const root = THEME_ROOT[theme] ?? 55;
    this.musicRoot = root * 2;
    const t = ctx.currentTime;
    // drone
    const dg = ctx.createGain();
    dg.gain.setValueAtTime(0.0001, t);
    dg.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.22 * opts.drone), t + 3);
    dg.connect(this.sfxBus);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.connect(dg);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 110;
    lfo.connect(lfoG);
    lfoG.connect(lp.frequency);
    lfo.start();
    const oscs: OscillatorNode[] = [lfo];
    for (const [mul, type, v, det] of [
      [1, 'sine', 0.8, 0],
      [1.005, 'sawtooth', 0.35, 4],
      [1.5, 'sine', 0.35, -3],
      [2.0, 'triangle', 0.18, 7],
    ] as [number, OscillatorType, number, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = root * mul;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = v;
      o.connect(g);
      g.connect(lp);
      o.start();
      oscs.push(o);
    }
    this.droneGain = dg;
    // fluorescent buzz
    const bg = ctx.createGain();
    bg.gain.value = 0;
    const bp = ctx.createStereoPanner();
    bg.connect(bp);
    bp.connect(this.sfxBus);
    const bo = ctx.createOscillator();
    bo.type = 'sawtooth';
    bo.frequency.value = 100;
    const bo2 = ctx.createOscillator();
    bo2.type = 'square';
    bo2.frequency.value = 200.4;
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 1100;
    bf.Q.value = 3;
    const bgi = ctx.createGain();
    bgi.gain.value = 0.5;
    const bg2 = ctx.createGain();
    bg2.gain.value = 0.2;
    bo.connect(bgi);
    bo2.connect(bg2);
    bgi.connect(bf);
    bg2.connect(bf);
    bf.connect(bg);
    bo.start();
    bo2.start();
    oscs.push(bo, bo2);
    this.buzzGain = bg;
    this.buzzPan = bp;
    this.buzzScale = opts.buzz;
    this.tickOn = opts.tick > 0;
    this.tickX = tickX ?? null;
    this.tickTimer = 0.5;
    this.musicTimer = 3;
    this.heartTimer = 1;
    this.ambienceNodes.push({
      stop: () => {
        const tt = ctx.currentTime;
        dg.gain.setTargetAtTime(0.0001, tt, 0.3);
        bg.gain.setTargetAtTime(0.0001, tt, 0.1);
        oscs.forEach((o) => {
          try {
            o.stop(tt + 1.2);
          } catch {
            /* already stopped */
          }
        });
      },
    });
  }

  private buzzScale = 1;

  stopAmbience() {
    this.ambienceNodes.forEach((n) => n.stop());
    this.ambienceNodes = [];
    this.buzzGain = null;
    this.droneGain = null;
    this.tickOn = false;
  }

  /** level in 0..1 and world x of the nearest working light (for positional buzz) */
  setBuzz(level: number, x: number) {
    if (!this.ctx || !this.buzzGain || !this.buzzPan) return;
    const t = this.ctx.currentTime;
    const dx = x - this.listenerX;
    const att = 1 / (1 + Math.pow(Math.abs(dx) / 500, 2));
    this.buzzGain.gain.setTargetAtTime(Math.min(0.12, level * 0.07 * att * this.buzzScale), t, 0.03);
    this.buzzPan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, dx / 800)), t, 0.1);
  }

  buzzCrackle(x?: number) {
    if (!this.ctx) return;
    const t = this.now();
    const d = this.route(x, 0.1, 0.7);
    this.noise(t, 0.03, 0.2, d, { type: 'highpass', freq: 2500 });
    this.tone(120, 'square', t, 0.04, 0.05, d);
  }

  /** called every frame; schedules ticks, generative music and the heartbeat */
  update(dt: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.tickOn) {
      this.tickTimer -= dt;
      if (this.tickTimer <= 0) {
        this.tickTimer += Math.random() < 0.04 ? 2 : 1;
        const t = this.now();
        const d = this.route(this.tickX ?? undefined, 0.4, 0.45);
        this.noise(t, 0.012, 0.18, d, { type: 'highpass', freq: 3500, q: 0.8 });
        this.tone(1900, 'square', t, 0.008, 0.02, d);
      }
    }
    this.musicTimer -= dt;
    if (this.musicTimer <= 0 && this.ambienceNodes.length) {
      this.musicTimer = 5 + Math.random() * 6 - this.tension * 2.5;
      this.musicNote();
    }
    if (this.tension > 0.35) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        const bpm = 62 + this.tension * 70;
        this.heartTimer = 60 / bpm;
        const t = this.now();
        const mbus = this.musicBus;
        const g = this.ctx.createGain();
        g.connect(mbus);
        this.tone(52, 'sine', t, 0.18, 0.5 * this.tension, g, { endFreq: 30 });
        this.tone(52, 'sine', t + 0.16, 0.18, 0.35 * this.tension, g, { endFreq: 30 });
      }
    }
  }

  private musicNote() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const deg = MINOR[Math.floor(Math.random() * 7)];
    const f = this.musicRoot * 2 * Math.pow(2, deg / 12);
    const g = ctx.createGain();
    g.connect(this.musicBus);
    const send = ctx.createGain();
    send.gain.value = 0.9;
    g.connect(send);
    send.connect(this.reverbIn);
    const sparse = Math.random();
    if (sparse < 0.55) {
      // long pad note
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.connect(g);
      for (const [m, tp, v] of [
        [1, 'sine', 0.06],
        [2.003, 'triangle', 0.025],
        [1.498, 'sine', 0.03],
      ] as [number, OscillatorType, number][]) this.tone(f * m, tp, t, 7, v, lp, { a: 2.6 });
    } else {
      // distant piano-ish pluck
      for (const [m, v, d] of [
        [1, 0.1, 2.2],
        [2, 0.04, 1.2],
        [3, 0.02, 0.7],
        [4.2, 0.008, 0.4],
      ] as [number, number, number][]) this.tone(f * m * 2, 'sine', t, d, v, g, { a: 0.005 });
    }
    if (this.tension > 0.5 && Math.random() < 0.6) {
      this.tone(f * 1.0595, 'sine', t, 5, 0.03 * this.tension, g, { a: 2 }); // minor-second grit
    }
  }

  setTension(v: number) {
    this.tension += (v - this.tension) * 0.05;
  }

  stopAll() {
    this.stopAmbience();
    this.stopRewind();
    this.stopVision();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }
}

export const audio = new AudioManager();
