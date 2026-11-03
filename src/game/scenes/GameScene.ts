import Phaser from 'phaser';
import {
  DT,
  FORESIGHT_DRAIN,
  FORESIGHT_MAX,
  FORESIGHT_MIN_START,
  FORESIGHT_REGEN,
  FORESIGHT_TIMESCALE,
  PREDICT_STRIDE,
  REWIND_COOLDOWN_TICKS,
  VIEW_H,
  VIEW_W,
} from '../constants';
import { bus } from '../bus';
import { Input } from '../input';
import { Simulation } from '../sim/Simulation';
import { EchoPose, newEchoPose } from '../sim/Echo';
import {
  P_DEAD,
  P_FACE,
  P_GROUND,
  P_INTER,
  P_LAND,
  P_LANDV,
  P_SKID,
  P_SNEAK,
  P_VX,
  P_VY,
  P_WAKE,
  P_X,
  P_Y,
  FLAG_GROUND,
  FLAG_INTER,
  FLAG_SKID,
  FLAG_SNEAK,
} from '../sim/state';
import { InputFrame, NO_INPUT, SimEvent } from '../sim/types';
import { LEVELS } from '../levels';
import type { EventC } from '../sim/compile';
import { bakeLevel } from '../render/artBaker';
import { DynamicRenderer } from '../render/Dynamic';
import { CharAnimator, CharStyle, PoseIn, drawFrontal, drawShadowEntity } from '../render/Silhouette';
import { EchoPostPipeline, postParams } from '../render/PostFX';
import { Lighting, flicker } from '../render/Lighting';
import { hudState } from '../render/hud';
import { audio } from '../audio/AudioManager';
import { getSettings, loadSave, writeSave, SaveData } from '../settings';
import type { Surface } from '../levels/types';

const DEPTH = { far: 0, mid: 10, env: 20, fenv: 21, chars: 30, front: 40, light: 50, emit: 60, femit: 61, shaft: 62, fog: 65, dust: 66 };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pad2 = (n: number) => String(n).padStart(2, '0');

export interface StartPayload {
  level: number;
  fresh?: boolean;
  fadeIn?: boolean;
}

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  s: number;
  life: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface HorrorCapture {
  frames: Float32Array; // x,y,face,vx,vy,flags per frame
  n: number;
}

const hudLabel = (floor: number) => (floor === 0 ? 'B1' : pad2(floor));

/** The in-game scene: fixed-timestep simulation + all rendering, effects, audio hooks and cinematics. */
export class GameScene extends Phaser.Scene {
  sim!: Simulation;
  input_!: Input;
  levelIndex = 0;
  private def = LEVELS[0];
  private dyn!: DynamicRenderer;
  private lighting!: Lighting;

  private env!: Phaser.GameObjects.Graphics;
  private chars!: Phaser.GameObjects.Graphics;
  private emit!: Phaser.GameObjects.Graphics;
  private fenv!: Phaser.GameObjects.Graphics;
  private femit!: Phaser.GameObjects.Graphics;
  private fogImgs: Phaser.GameObjects.Image[] = [];
  private dust: { img: Phaser.GameObjects.Image; vx: number; vy: number; ph: number }[] = [];
  private shafts: Phaser.GameObjects.Image[] = [];

  // timing
  private acc = 0;
  private realTime = 0;
  private prevX = 0;
  private prevY = 0;
  private camX = 0;
  private shake = 0;

  // modes
  private paused = false;
  private uiLock = false;
  private ending = false;
  private transition: { phase: 'walk' | 'fade' | 'ride'; t: number; to: number } | null = null;
  private playerHidden = false;
  private introT = 0;

  // rewind
  private rewindHeld = 0;
  private rewindCd = 0;
  /** after a rewind ends while R is still down (buffer ran out) the key must be released before the next one */
  private rewindArmed = true;
  private rewindRate = 0;
  private rewindAcc = 0;
  private rewindsMade = 0;
  // foresight
  private focus = FORESIGHT_MAX;
  private visionOn = false;
  private visionAmt = 0;
  private rewindAmt = 0;
  private predFrame = 0;
  private previewTick = 0;
  private hasPrediction = false;

  // death
  private deadAt = -1;
  private shards: Shard[] = [];
  private sparks: Spark[] = [];
  private deaths = 0;
  private seconds = 0;

  // anims
  private pAnim = new CharAnimator();
  private ghostAnim = new CharAnimator();
  private echoAnims = new Map<number, CharAnimator>();
  private extraAnim = new CharAnimator();
  private pose: EchoPose = newEchoPose();
  private horror = new Map<string, HorrorCapture>();

  // fx
  private blackoutUntil = 0;
  private glitchBoost = 0;
  private flash = 0;
  private tension = 0;
  private toastCd = 0;
  private hintId = '';
  private objOverride = '';
  private objOverrideUntil = 0;
  private lastObjective = '';
  private buzzCd = 0;
  private sil: EventC | undefined;
  private lastEchoCount = -1;

  constructor() {
    super('Game');
  }

  init(data: StartPayload) {
    this.levelIndex = clamp(data?.level ?? 0, 0, LEVELS.length - 1);
    this.def = LEVELS[this.levelIndex];
    this.initData = data ?? { level: 0 };
  }
  private initData: StartPayload = { level: 0 };

  /** Phaser reuses this Scene instance across floors, so every piece of per-floor state must be reset here. */
  private resetState() {
    this.acc = 0;
    this.shake = 0;
    this.paused = false;
    this.uiLock = false;
    this.ending = false;
    this.transition = null;
    this.playerHidden = false;
    this.rewindHeld = 0;
    this.rewindCd = 0;
    this.rewindArmed = true;
    this.rewindAmt = 0;
    this.visionAmt = 0;
    this.visionOn = false;
    this.focus = FORESIGHT_MAX;
    this.hasPrediction = false;
    this.deadAt = -1;
    this.shards = [];
    this.sparks = [];
    this.echoAnims.clear();
    this.horror.clear();
    this.pAnim = new CharAnimator();
    this.blackoutUntil = 0;
    this.glitchBoost = 0;
    this.flash = 0;
    this.tension = 0;
    this.hintId = '';
    this.objOverride = '';
    this.objOverrideUntil = 0;
    this.lastEchoCount = -1;
    this.fogImgs = [];
    this.dust = [];
    this.shafts = [];
  }

  create() {
    this.resetState();
    const def = this.def;
    this.input_ = this.registry.get('input') as Input;
    this.sim = new Simulation(def);
    this.dyn = new DynamicRenderer(this.sim.c);
    this.sil = this.sim.c.events.find((e) => e.def.kind === 'silhouette');
    const save = loadSave();
    this.deaths = save?.deaths ?? 0;
    this.rewindsMade = save?.rewinds ?? 0;
    this.seconds = save?.seconds ?? 0;

    // ---- baked art
    const baked = bakeLevel(def);
    const keyFar = `far-${def.id}`;
    const keyMid = `mid-${def.id}`;
    const keyFront = `front-${def.id}`;
    for (const k of [keyFar, keyMid, keyFront]) if (this.textures.exists(k)) this.textures.remove(k);
    this.textures.addCanvas(keyFar, baked.far);
    this.textures.addCanvas(keyMid, baked.mid);
    this.add.image(0, 0, keyFar).setOrigin(0).setScrollFactor(baked.farScroll).setDepth(DEPTH.far);
    this.add.image(0, 0, keyMid).setOrigin(0).setDepth(DEPTH.mid);
    if (baked.front) {
      this.textures.addCanvas(keyFront, baked.front);
      this.add.image(0, 0, keyFront).setOrigin(0).setDepth(DEPTH.front);
    }
    this.env = this.add.graphics().setDepth(DEPTH.env);
    this.fenv = this.add.graphics().setDepth(DEPTH.fenv);
    this.chars = this.add.graphics().setDepth(DEPTH.chars);
    this.emit = this.add.graphics().setDepth(DEPTH.emit);
    this.femit = this.add.graphics().setDepth(DEPTH.femit);
    this.lighting = new Lighting(this, DEPTH.light);
    this.buildAtmosphere();

    if (this.game.renderer.type === Phaser.WEBGL) this.cameras.main.setPostPipeline(EchoPostPipeline);
    this.cameras.main.setBounds(0, 0, def.width, VIEW_H);

    // ---- initial state
    this.prevX = this.sim.px;
    this.prevY = this.sim.py;
    this.camX = clamp(this.sim.px - VIEW_W / 2, 0, def.width - VIEW_W);
    postParams.fade = this.initData.fadeIn ? 1 : 0;
    postParams.rewind = 0;
    postParams.vision = 0;
    postParams.flash = 0;
    postParams.glitch = 0;
    postParams.distort = def.distortion;
    this.input_.clearPressed();

    audio.stopAmbience();
    const a = def.audio ?? { drone: 1, buzz: 1, tick: 1, surface: 'tile' as Surface };
    audio.startAmbience(def.theme, { drone: a.drone, buzz: a.buzz, tick: a.tick }, def.lights[0]?.x);

    // ---- bus commands
    const on = (ev: string, fn: (...args: any[]) => void) => {
      bus.on(ev, fn);
      this.events.once('shutdown', () => bus.off(ev, fn));
    };
    on('terminal:close', () => this.closeTerminal());
    on('cmd:resume', () => this.setPaused(false));
    on('cmd:restartFloor', () => this.restartFloorFull());
    on('cmd:quit', () => this.quitToMenu());
    this.events.once('shutdown', () => {
      audio.stopAll();
      bus.emit('hint', null);
    });

    bus.emit('state', 'playing');
    bus.emit('title', { floor: hudLabel(def.floor), name: def.name, subtitle: def.subtitle });
    if (def.introText) this.time.delayedCall(3200, () => bus.emit('toast', def.introText));
    this.saveProgress(false);
    this.introT = 0;
    (window as unknown as Record<string, unknown>).__echo = { scene: this };
  }

  // ------------------------------------------------------------------------------------ atmosphere

  private buildAtmosphere() {
    const def = this.def;
    const low = getSettings().quality === 'low';
    const nFog = Math.ceil(def.width / 520);
    for (let i = 0; i < nFog; i++) {
      const im = this.add
        .image(i * 520 + 260, 470 + (i % 3) * 30, 'fog')
        .setDepth(DEPTH.fog)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(900, 420)
        .setAlpha(0);
      this.fogImgs.push(im);
    }
    const nDust = low ? 12 : 34;
    for (let i = 0; i < nDust; i++) {
      const im = this.add.image(0, 0, 'soft').setDepth(DEPTH.dust).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2);
      const sc = 0.03 + Math.random() * 0.05;
      im.setScale(sc);
      this.dust.push({ img: im, vx: -6 + Math.random() * 12, vy: -3 + Math.random() * 6, ph: Math.random() * 10 });
      im.setPosition(Math.random() * def.width, 120 + Math.random() * 480);
    }
    for (const p of def.props ?? []) {
      if (p.kind !== 'window' || low) continue;
      const w = (p.w ?? 200) * 1.1;
      const im = this.add
        .image(p.x, (p.y ?? 300) - (p.h ?? 250) / 2 + 20, 'shaft')
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.shaft)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(w * 1.5, 460)
        .setAlpha(0.1 * (def.ambient + 0.4));
      this.shafts.push(im);
    }
  }

  // ------------------------------------------------------------------------------------ control helpers

  private setPaused(p: boolean) {
    if (this.paused === p) return;
    this.paused = p;
    if (p) {
      audio.suspend();
      this.stopLoops();
    } else {
      audio.resume();
      this.input_.clearPressed();
    }
    bus.emit('paused', p);
  }

  private stopLoops() {
    if (this.rewindHeld > 0) {
      this.finishRewind();
    }
    if (this.visionOn) {
      this.visionOn = false;
      audio.stopVision();
    }
  }

  private quitToMenu() {
    this.saveProgress(false);
    audio.resume();
    audio.stopAll();
    bus.emit('state', 'menu');
    this.scene.start('Menu');
  }

  private restartFloorFull() {
    this.setPaused(false);
    this.scene.restart({ level: this.levelIndex, fresh: true, fadeIn: true });
  }

  private closeTerminal() {
    this.uiLock = false;
    this.input_.clearPressed();
  }

  private saveProgress(completed: boolean, secret = false) {
    const prev = loadSave();
    const d: SaveData = {
      level: Math.max(prev?.level ?? 0, this.levelIndex),
      deaths: this.deaths,
      rewinds: this.rewindsMade,
      seconds: Math.round(this.seconds),
      completed: completed || !!prev?.completed,
      secret: secret || !!prev?.secret,
    };
    writeSave(d);
  }

  // ------------------------------------------------------------------------------------ main loop

  update(_t: number, deltaMs: number) {
    const dtReal = Math.min(0.1, deltaMs / 1000);
    this.realTime += dtReal;
    const inp = this.input_;
    const settings = getSettings();

    if (!this.ending && !this.transition && inp.pressed('Escape', 'KeyP') && !this.uiLock) this.setPaused(!this.paused);

    const frozen = this.paused || this.uiLock || this.ending;
    if (!frozen) this.seconds += dtReal;

    if (this.paused) {
      this.renderFrame(dtReal, 0);
      return;
    }

    this.introT += dtReal;
    this.updateTransition(dtReal);

    const sim = this.sim;
    const dead = sim.S[P_DEAD] > 0.5;
    const canAct = !frozen && !this.transition && this.introT > 0.4;

    // ---------------- rewind
    const wantRewind = canAct && inp.held('KeyR');
    if (!wantRewind) this.rewindArmed = true;
    if (wantRewind && this.rewindArmed && this.rewindHeld === 0 && this.rewindCd <= 0 && !this.visionOn) {
      if (sim.beginRewind()) {
        this.rewindHeld = 0.0001;
        this.rewindRate = 150;
        this.rewindAcc = 0;
        audio.startRewind();
        this.acc = 0;
      } else if (inp.pressed('KeyR')) audio.rewindDenied();
    }
    if (this.rewindHeld > 0) {
      if (wantRewind) {
        this.rewindHeld += dtReal;
        this.rewindRate = Math.min(700, 150 + this.rewindHeld * 520);
        this.rewindAcc += this.rewindRate * dtReal;
        const n = Math.floor(this.rewindAcc);
        this.rewindAcc -= n;
        const moved = n > 0 ? sim.rewindBy(n) : 1;
        audio.setRewindRate(1 + this.rewindHeld * 2.2);
        if (moved === 0) this.finishRewind();
        this.prevX = sim.px;
        this.prevY = sim.py;
        this.deadAt = sim.S[P_DEAD] > 0.5 ? this.deadAt : -1;
        if (sim.S[P_DEAD] < 0.5) this.shards.length = 0;
      } else this.finishRewind();
    }

    // ---------------- foresight
    const wantVision = canAct && inp.held('KeyF') && this.rewindHeld === 0 && !dead;
    if (wantVision && !this.visionOn && this.focus >= FORESIGHT_MIN_START) {
      this.visionOn = true;
      this.predFrame = 0;
      this.previewTick = 0;
      this.hasPrediction = false;
      audio.startVision();
    }
    if (this.visionOn) {
      this.focus = Math.max(0, this.focus - FORESIGHT_DRAIN * dtReal);
      if (!wantVision || this.focus <= 0) {
        this.visionOn = false;
        audio.stopVision();
      }
    } else this.focus = Math.min(FORESIGHT_MAX, this.focus + FORESIGHT_REGEN * dtReal);

    // ---------------- echoes
    if (canAct && inp.pressed('KeyQ') && sim.echoes.length > 0 && this.rewindHeld === 0) {
      sim.clearEchoes();
      audio.echoGone();
      bus.emit('toast', 'ECHOES RELEASED');
    }

    // ---------------- restart on death
    if (dead && canAct && this.rewindHeld === 0) {
      if (this.deadAt < 0) this.deadAt = this.realTime;
      if (inp.pressed('Enter') || this.realTime - this.deadAt > 3.2) this.respawn();
    }

    // ---------------- fixed timestep
    const scale = this.visionOn ? FORESIGHT_TIMESCALE : 1;
    let alpha = 0;
    if (!frozen && this.rewindHeld === 0) {
      this.acc += dtReal * scale;
      let steps = 0;
      while (this.acc >= DT && steps < 5) {
        this.acc -= DT;
        steps++;
        this.prevX = sim.px;
        this.prevY = sim.py;
        const frame = this.currentInput(canAct);
        sim.play(frame);
        if (this.rewindCd > 0) this.rewindCd--;
        this.drainEvents();
        if (sim.checkpointHit) {
          sim.checkpointHit = false;
          bus.emit('toast', 'CHECKPOINT  ·  ECHOES DISPERSE');
          audio.echoPulse(sim.px);
          this.saveProgress(false);
        }
        if (frozen) break;
      }
      if (steps >= 5) this.acc = 0;
      alpha = this.acc / DT;
    }

    // prediction
    if (this.visionOn && !dead) {
      if (!this.hasPrediction || this.game.loop.frame % 6 === 0) {
        const p = sim.predict(inp.peekFrame());
        this.predFrame = p.count;
        this.hasPrediction = true;
      }
      this.previewTick += dtReal * 150;
      const total = sim.prediction.count * PREDICT_STRIDE;
      if (this.previewTick > total + 45) this.previewTick = 0;
    }

    // tension, ambience
    this.updateTension(dtReal);
    audio.listenerX = sim.px;
    audio.update(dtReal);
    this.buzzCd -= dtReal;
    if (this.buzzCd <= 0) {
      this.buzzCd = 0.15;
      let best = this.def.lights[0];
      let bd = 1e9;
      for (const l of this.def.lights) {
        const d = Math.abs(l.x - sim.px);
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
      if (best) audio.setBuzz(clamp(1 - bd / 700, 0, 1) * (this.def.audio?.buzz ?? 1), best.x);
    }

    // postfx params
    const tgtRewind = this.rewindHeld > 0 ? 1 : 0;
    const tgtVision = this.visionOn ? 1 : 0;
    this.rewindAmt += (tgtRewind - this.rewindAmt) * Math.min(1, dtReal * 10);
    this.visionAmt += (tgtVision - this.visionAmt) * Math.min(1, dtReal * 7);
    this.glitchBoost = Math.max(0, this.glitchBoost - dtReal * 1.4);
    this.flash = Math.max(0, this.flash - dtReal * 2.4);
    postParams.rewind = this.rewindAmt;
    postParams.vision = this.visionAmt;
    postParams.flash = this.flash;
    postParams.grain = settings.grain ? 1 : 0;
    postParams.halftone = settings.halftone ? 1 : 0;
    postParams.glitch = (settings.glitch ? 0.12 + this.glitchBoost : 0) + (dead ? 0.5 : 0) + this.rewindAmt * 0.3;
    postParams.distort = this.def.distortion * (settings.glitch ? 1 : 0.4) + this.glitchBoost * 0.5 + this.visionAmt * 0.3;
    postParams.vignette = 0.75 + this.tension * 0.3 + (dead ? 0.2 : 0);
    if (!this.transition && postParams.fade > 0 && !(dead && this.deadAt >= 0 && this.realTime - this.deadAt > 3.0)) {
      postParams.fade = Math.max(0, postParams.fade - dtReal * 1.1);
    }

    this.updateHud();
    this.renderFrame(dtReal, alpha);
  }

  private currentInput(canAct: boolean): InputFrame {
    if (this.transition?.phase === 'walk') {
      const ex = this.sim.c.exit?.def.x ?? this.sim.px;
      const dx = ex - this.sim.px;
      return { ...NO_INPUT, right: dx > 6, left: dx < -6, sneak: true };
    }
    if (!canAct || this.sim.S[P_DEAD] > 0.5) {
      this.input_.frame(); // discard latched presses
      return NO_INPUT;
    }
    return this.input_.frame();
  }

  private finishRewind() {
    if (this.rewindHeld <= 0) return;
    this.rewindHeld = 0;
    this.rewindArmed = false;
    audio.stopRewind();
    const e = this.sim.endRewind();
    this.rewindCd = REWIND_COOLDOWN_TICKS;
    this.rewindsMade++;
    this.acc = 0;
    this.input_.clearPressed();
    if (e) {
      audio.echoBorn();
      this.flash = 0.5;
      this.glitchBoost = Math.max(this.glitchBoost, 0.5);
      this.shake = Math.max(this.shake, 0.5);
      bus.emit('toast', `ECHO ${this.sim.echoes.length}/3 ACTIVE`);
    }
    this.deadAt = this.sim.S[P_DEAD] > 0.5 ? this.realTime : -1;
  }

  private respawn() {
    // quick fade then restore the last checkpoint
    if (this.sim.S[P_DEAD] < 0.5) return;
    postParams.fade = 1;
    this.sim.restoreCheckpoint();
    this.shards.length = 0;
    this.deadAt = -1;
    this.prevX = this.sim.px;
    this.prevY = this.sim.py;
    this.camX = clamp(this.sim.px - VIEW_W / 2, 0, this.def.width - VIEW_W);
    this.acc = 0;
    this.rewindCd = 0;
    this.input_.clearPressed();
    this.horror.clear();
    bus.emit('toast', 'ITERATION RESTORED');
  }

  // ------------------------------------------------------------------------------------ transitions

  private startExitTransition(to: number) {
    this.transition = { phase: 'walk', t: 0, to };
    this.stopLoops();
    audio.elevatorDoors(true, this.def.width);
    bus.emit('hint', null);
  }

  private updateTransition(dt: number) {
    const tr = this.transition;
    if (!tr) return;
    tr.t += dt;
    const ex = this.sim.c.exit?.def.x ?? this.sim.px;
    if (tr.phase === 'walk') {
      if (Math.abs(this.sim.px - ex) < 10 || tr.t > 1.6) {
        tr.phase = 'fade';
        tr.t = 0;
        this.playerHidden = true;
        audio.elevatorDoors(false, ex);
      }
    } else if (tr.phase === 'fade') {
      postParams.fade = Math.min(1, tr.t / 0.9);
      if (tr.t >= 1) {
        tr.phase = 'ride';
        tr.t = 0;
        const from = hudLabel(this.def.floor);
        const to = hudLabel(LEVELS[tr.to].floor);
        bus.emit('elevator', { from, to, ms: 4200 });
        audio.elevatorRide(4, undefined);
        this.saveProgress(false);
        const lv = tr.to;
        this.saveProgressTo(lv);
      }
    } else if (tr.phase === 'ride') {
      if (tr.t >= 4.3) {
        const to = tr.to;
        this.transition = null;
        this.scene.start('Game', { level: to, fresh: true, fadeIn: true } satisfies StartPayload);
      }
    }
  }

  private saveProgressTo(level: number) {
    const prev = loadSave();
    writeSave({
      level: Math.max(prev?.level ?? 0, level),
      deaths: this.deaths,
      rewinds: this.rewindsMade,
      seconds: Math.round(this.seconds),
      completed: !!prev?.completed,
      secret: !!prev?.secret,
    });
  }

  private startEnding(secret = false) {
    if (this.ending) return;
    this.ending = true;
    this.stopLoops();
    bus.emit('hint', null);
    this.saveProgress(true, secret);
    audio.stopAmbience();
    bus.emit('ending:start', { deaths: this.deaths, rewinds: this.rewindsMade, seconds: Math.round(this.seconds), secret });
  }

  // ------------------------------------------------------------------------------------ sim events

  private drainEvents() {
    const w = this.sim.world;
    if (w.events.length === 0) return;
    const evs = w.events.slice();
    w.events.length = 0;
    for (const e of evs) this.handleEvent(e);
  }

  private handleEvent(e: SimEvent) {
    const def = this.def;
    switch (e.t) {
      case 'jump':
        audio.jump(e.x);
        break;
      case 'step':
        audio.footstep(e.surface as 0 | 1 | 2 | 3, e.sneak, e.x);
        break;
      case 'land':
        audio.land(e.impact, e.surface as 0 | 1 | 2 | 3, e.x);
        this.shake = Math.max(this.shake, clamp((e.impact - 600) / 900, 0, 0.5));
        break;
      case 'pickup':
        audio.pickup();
        bus.emit('toast', `ACQUIRED  ·  ${e.label}`);
        this.flash = Math.max(this.flash, 0.1);
        break;
      case 'terminal':
        this.onTerminal(e.id);
        break;
      case 'lever':
        audio.lever(e.on, e.x, e.echo);
        break;
      case 'plate':
        audio.plate(e.down, e.x);
        break;
      case 'gate':
        audio.gate(e.opening, e.x);
        break;
      case 'locked':
        audio.rewindDenied();
        bus.emit('toast', e.text);
        break;
      case 'exit':
        this.startExitTransition(e.toFloor);
        break;
      case 'death':
        this.onDeath(e.cause);
        break;
      case 'event':
        this.onWorldEvent(e);
        break;
      case 'blink':
        this.blackoutUntil = this.realTime + 0.5;
        audio.buzzCrackle(e.x >= 0 ? e.x : this.sim.px);
        if (e.stage >= 3 && e.stage < 6) audio.stinger(e.stage >= 5 ? 'low' : 'soft');
        if (e.stage >= 6) audio.stinger('hit');
        this.glitchBoost = Math.max(this.glitchBoost, 0.6);
        break;
      case 'spark':
        audio.zap(e.x);
        for (let i = 0; i < 6; i++)
          this.sparks.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 220, life: 0.4 + Math.random() * 0.3 });
        break;
      case 'enemy':
        if (e.mode === 2) audio.stinger('hit');
        break;
    }
    void def;
  }

  private onTerminal(id: string) {
    const tm = this.sim.c.terminals.find((t) => t.def.id === id);
    if (!tm) return;
    if (id === 'car') {
      // the true ending: all three echoes are standing at the car when you read it
      this.startEnding(this.sim.echoesAssembled(tm.def.x, 170));
      return;
    }
    audio.terminalOpen();
    this.uiLock = true;
    this.stopLoops();
    bus.emit('terminal', { id, title: tm.def.title, lines: tm.def.lines });
    if (tm.def.objectiveAfter) {
      this.objOverride = tm.def.objectiveAfter;
      this.objOverrideUntil = this.realTime + 14;
    }
    if (id === 'recon') {
      this.glitchBoost = 2.2;
      this.flash = 0.9;
      audio.stinger('hit');
      this.time.delayedCall(700, () => audio.stinger('glitch'));
    }
  }

  private onDeath(cause: string) {
    const sim = this.sim;
    this.deaths++;
    this.deadAt = this.realTime;
    audio.death(sim.px);
    this.shake = 1;
    this.flash = 0.7;
    this.glitchBoost = 1.5;
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 320;
      this.shards.push({
        x: sim.px,
        y: sim.py - 28 + (Math.random() - 0.5) * 40,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 160,
        r: Math.random() * 6,
        vr: (Math.random() - 0.5) * 14,
        s: 3 + Math.random() * 7,
        life: 1.6 + Math.random() * 0.8,
      });
    }
    bus.emit('toast', cause === 'shadow' ? 'IT HEARD YOU' : cause === 'fall' ? 'THERE WAS NO FLOOR' : 'THE ELECTRICITY HAD A SCHEDULE');
  }

  private onWorldEvent(e: Extract<SimEvent, { t: 'event' }>) {
    const p = e.params;
    const num = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
    switch (e.kind) {
      case 'radio':
        audio.radio(this.sim.px);
        break;
      case 'whisper':
        audio.whisper(num('x', this.sim.px));
        break;
      case 'footsteps':
        audio.distantFootsteps(num('x', this.sim.px));
        break;
      case 'stinger':
        audio.stinger((p.type as 'hit' | 'rise' | 'glitch' | 'low' | 'soft') ?? 'soft');
        break;
      case 'glitch':
        audio.stinger('glitch');
        this.glitchBoost = 1.6;
        break;
      case 'elevator':
        audio.elevatorDing(num('x', this.sim.px));
        break;
      case 'door':
        audio.doorSlam(num('x', this.sim.px));
        this.shake = 0.6;
        break;
      case 'chair': {
        const pr = this.def.props?.find((q) => q.id === p.prop);
        audio.creak(pr?.x, 2.4);
        break;
      }
      case 'shift': {
        const pr = this.def.props?.find((q) => q.id === p.prop);
        audio.scrape(pr?.x);
        this.glitchBoost = Math.max(this.glitchBoost, 0.4);
        break;
      }
      case 'silhouette':
        audio.stinger('soft');
        break;
      case 'prophecy':
        audio.stinger('rise');
        audio.distantFootsteps(num('from', this.sim.px), 8, 0.2);
        this.glitchBoost = Math.max(this.glitchBoost, 0.8);
        break;
      case 'horrorEcho': {
        const secs = num('secs', 5);
        const tl = this.sim.tl;
        const now = this.sim.tick;
        const from = Math.max(tl.oldest, now - Math.round(secs * 60));
        const n = now - from + 1;
        const frames = new Float32Array(n * 6);
        for (let i = 0; i < n; i++) {
          const s = tl.peek(from + i);
          frames.set([s[P_X], s[P_Y], s[P_FACE], s[P_VX], s[P_VY], s[P_GROUND]], i * 6);
        }
        this.horror.set(e.id, { frames, n });
        audio.stinger('rise');
        this.glitchBoost = Math.max(this.glitchBoost, 0.7);
        break;
      }
      case 'blackout':
        this.blackoutUntil = this.realTime + num('secs', 1.2);
        audio.buzzCrackle(this.sim.px);
        break;
      case 'voice':
        audio.whisper(num('x', this.sim.px));
        break;
    }
  }

  // ------------------------------------------------------------------------------------ HUD / tension

  private updateTension(dt: number) {
    const S = this.sim.S;
    let t = 0;
    const en = this.sim.c.enemy;
    if (en && S[en.off + 7] > 0.5) {
      const st = S[en.off + 3];
      const d = Math.abs(S[en.off] - S[P_X]);
      t = Math.max(t, st === 2 ? 0.95 : st === 1 ? 0.6 : d < 500 ? 0.3 : 0.12);
    }
    if (this.sil && S[this.sil.off] >= 0) {
      const sx = S[this.sil.off + 1];
      if (sx >= 0) t = Math.max(t, clamp(1 - Math.abs(sx - S[P_X]) / 900, 0.25, 0.9));
    }
    if (this.def.floor <= 1) t = Math.max(t, 0.25);
    if (this.visionOn && this.sim.prediction.deathFrame >= 0) t = Math.max(t, 0.8);
    this.tension += (t - this.tension) * Math.min(1, dt * 1.5);
    audio.setTension(this.tension);
  }

  private objective(): string {
    if (this.realTime < this.objOverrideUntil && this.objOverride) return this.objOverride;
    const c = this.sim.c;
    const S = this.sim.S;
    const count = (kind: string) => c.pickups.filter((p) => p.def.kind === kind && S[p.off] > 0.5).length;
    for (const o of this.def.objectives) {
      if (S[P_X] >= o.until) continue;
      if (o.unless && c.sig(o.unless)(this.sim.world)) continue;
      return o.text.replace('{frag}', String(count('fragment'))).replace('{tapes}', String(count('tape'))).replace('{cards}', String(count('card')));
    }
    return '';
  }

  private updateHud() {
    const sim = this.sim;
    const S = sim.S;
    const h = hudState;
    h.floorLabel = hudLabel(this.def.floor);
    h.floorName = this.def.name;
    h.objective = this.objective();
    h.rewindMem = sim.memory;
    h.rewindCd = this.rewindCd / REWIND_COOLDOWN_TICKS;
    h.focus = this.focus;
    h.echoes = sim.echoes.length;
    h.rewinding = this.rewindHeld > 0;
    h.vision = this.visionOn;
    h.rewindSecs = sim.rewindable;
    let prompt = '';
    if (S[P_DEAD] > 0.5) prompt = 'HOLD R — REWIND      ENTER — RESTART';
    else if (!this.uiLock && !this.transition && !this.ending) {
      const tgt = sim.world.findInteract();
      if (tgt) prompt = `E — ${tgt.label}`;
    }
    h.prompt = prompt;

    // contextual hints
    let hint = '';
    let hintText = '';
    if (!this.uiLock && S[P_DEAD] < 0.5 && !this.transition) {
      for (const hd of this.def.hints ?? []) {
        if (hd.tutorial && !getSettings().tutorial) continue;
        const r = hd.rect;
        if (S[P_X] > r.x && S[P_X] < r.x + r.w) {
          hint = hd.id;
          hintText = hd.text;
          break;
        }
      }
    }
    if (hint !== this.hintId) {
      this.hintId = hint;
      bus.emit('hint', hint ? { text: hintText } : null);
    }
  }

  // ------------------------------------------------------------------------------------ rendering

  private poseFromState(S: Float64Array): PoseIn {
    return {
      vx: S[P_VX],
      vy: S[P_VY],
      ground: S[P_GROUND] > 0.5,
      landT: S[P_LAND],
      landV: S[P_LANDV],
      inter: S[P_INTER] > 0,
      wake: S[P_WAKE],
      sneak: S[P_SNEAK] > 0.5,
      skid: S[P_SKID] > 0.5,
    };
  }

  private poseFromEcho(p: EchoPose): PoseIn {
    return {
      vx: p.vx,
      vy: p.vy,
      ground: (p.flags & FLAG_GROUND) !== 0,
      landT: p.landT,
      landV: p.landV,
      inter: (p.flags & FLAG_INTER) !== 0,
      wake: 0,
      sneak: (p.flags & FLAG_SNEAK) !== 0,
      skid: (p.flags & FLAG_SKID) !== 0,
    };
  }

  private renderFrame(dt: number, alpha: number) {
    const sim = this.sim;
    const S = sim.S;
    const def = this.def;
    const settings = getSettings();
    const cam = this.cameras.main;
    const time = this.realTime;
    const tick = S[0];

    // ---- camera
    const face = S[P_FACE];
    const px = this.prevX + (S[P_X] - this.prevX) * alpha;
    const py = this.prevY + (S[P_Y] - this.prevY) * alpha;
    const look = (S[P_VX] / 300) * 90;
    const target = clamp(px - VIEW_W / 2 + look + face * 30, 0, Math.max(0, def.width - VIEW_W));
    const k = 1 - Math.exp(-dt * 6);
    this.camX += (target - this.camX) * (this.introT < 0.05 ? 1 : k);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = settings.shake ? this.shake * 9 : 0;
    const sx = this.camX + (Math.random() - 0.5) * sh;
    const sy = (Math.random() - 0.5) * sh;
    cam.setScroll(Math.round(sx * 10) / 10, sy);

    // ---- dynamic world
    const env = this.env;
    const emit = this.emit;
    const chars = this.chars;
    env.clear();
    emit.clear();
    chars.clear();
    this.dyn.draw(env, emit, S, time, 1);
    this.drawDynamicProps(env, S, tick, time);

    // ---- echoes
    const echoCount = sim.echoes.length;
    for (const e of sim.echoes) {
      if (!e.sample(tick, this.pose)) continue;
      let an = this.echoAnims.get(e.id);
      if (!an) {
        an = new CharAnimator();
        this.echoAnims.set(e.id, an);
      }
      an.update(this.poseFromEcho(this.pose), dt);
      const wob = Math.sin(time * 40 + e.id) > 0.93 ? 1 : 0;
      an.draw(chars, this.pose.x, this.pose.y, this.pose.face, {
        fill: 0xd8d8d8,
        fillA: 0.55,
        rim: 0xffffff,
        rimA: 0.95,
        rimBoost: 2,
        glitch: wob,
      });
    }
    if (echoCount !== this.lastEchoCount) {
      this.lastEchoCount = echoCount;
      this.dyn.timelineCount = echoCount;
    }

    // ---- shadow enemy
    const en = sim.c.enemy;
    if (en && S[en.off + 7] > 0.5) {
      drawShadowEntity(chars, S[en.off], en.def.y, S[en.off + 2] >= 0 ? 1 : -1, time, Math.abs(S[en.off + 1]), S[en.off + 3]);
    }

    // ---- scripted horror
    this.drawHorror(chars, S, tick, time, dt);

    // ---- player
    const dead = S[P_DEAD] > 0.5;
    if (!dead && !this.playerHidden) {
      this.pAnim.update(this.poseFromState(S), dt);
      this.pAnim.draw(chars, px, py, face, { fill: 0x040404, fillA: 1, rim: 0xffffff, rimA: 0.5 });
    }
    this.drawShards(chars, dt);
    this.drawSparks(emit, dt);

    // ---- foresight preview
    this.fenv.clear();
    this.femit.clear();
    if (this.visionAmt > 0.02 && this.hasPrediction) this.drawPreview(dt, time);

    // ---- lighting
    this.drawLights(px, py, time, dead);

    // ---- atmosphere
    const fogOn = settings.fog;
    for (const im of this.fogImgs) {
      im.setAlpha(fogOn ? def.fog * 0.16 * (0.7 + 0.3 * Math.sin(time * 0.3 + im.x * 0.01)) : 0);
      im.x += dt * 9;
      if (im.x > def.width + 450) im.x = -450;
    }
    for (const d of this.dust) {
      d.ph += dt;
      d.img.x += (d.vx + Math.sin(d.ph * 0.7) * 6) * dt;
      d.img.y += (d.vy + Math.cos(d.ph * 0.5) * 5) * dt;
      if (d.img.x < this.camX - 40) d.img.x += VIEW_W + 80;
      if (d.img.x > this.camX + VIEW_W + 40) d.img.x -= VIEW_W + 80;
      if (d.img.y < 80) d.img.y = 640;
      if (d.img.y > 660) d.img.y = 100;
      d.img.setAlpha(0.12 + 0.12 * Math.sin(d.ph * 1.3));
    }
    for (const s of this.shafts) s.setAlpha((0.07 + 0.03 * Math.sin(time * 0.4 + s.x)) * (this.blackoutUntil > time ? 0 : 1));
  }

  /** Dynamic props: swivel chairs that move on their own. */
  private drawDynamicProps(g: Phaser.GameObjects.Graphics, S: Float64Array, tick: number, time: number) {
    for (const p of this.def.props ?? []) {
      if (p.kind !== 'chairDyn') continue;
      let yaw = Math.PI * 0.15;
      let x = p.x;
      for (const ev of this.sim.c.events) {
        if (ev.def.params?.prop !== p.id) continue;
        const trig = S[ev.off];
        if (trig < 0) continue;
        const el = tick - trig;
        if (ev.def.kind === 'chair') yaw = Math.PI * 0.15 + clamp(el / 150, 0, 1) * Math.PI * 0.85;
        if (ev.def.kind === 'shift') {
          const dx = Number(ev.def.params?.dx ?? 0);
          x = p.x + dx * (1 - Math.pow(1 - clamp(el / 40, 0, 1), 3));
          yaw = Math.PI;
        }
      }
      const c = Math.cos(yaw);
      const wob = Math.sin(time * 3 + p.x) * 0.004;
      const y = p.y;
      g.lineStyle(3, 0x050505, 1);
      g.fillStyle(0x1b1b1b, 1);
      // base + stem
      g.beginPath();
      g.moveTo(x - 22, y);
      g.lineTo(x + 22, y);
      g.moveTo(x, y);
      g.lineTo(x, y - 24);
      g.strokePath();
      // seat
      const sw = 30 * Math.max(0.35, Math.abs(c));
      g.fillRect(x - sw, y - 32, sw * 2, 9);
      g.strokeRect(x - sw, y - 32, sw * 2, 9);
      // back (swings from one side to the other as the chair turns)
      const bx = x + c * 26;
      g.fillRect(bx - 5, y - 74 + wob * 100, 10, 44);
      g.strokeRect(bx - 5, y - 74 + wob * 100, 10, 44);
      g.fillStyle(0xffffff, 0.06);
      g.fillRect(bx - 3, y - 72, 2, 38);
    }
  }

  private groundAt(x: number): number {
    return this.def.ground;
  }

  private drawHorror(g: Phaser.GameObjects.Graphics, S: Float64Array, tick: number, time: number, dt: number) {
    const c = this.sim.c;
    // prophecy: a ghost of yourself running ahead through the dark
    for (const ev of c.events) {
      if (ev.def.kind === 'prophecy') {
        const trig = S[ev.off];
        if (trig < 0) continue;
        const from = Number(ev.def.params?.from ?? 0);
        const to = Number(ev.def.params?.to ?? 0);
        const speed = Number(ev.def.params?.speed ?? 400);
        const el = (tick - trig) / 60;
        const x = from + el * speed;
        if (x > to + 40) continue;
        const gy = this.groundAt(x);
        const hop = Math.max(0, Math.sin(el * 7.5)) * 0 + 0;
        const flick = Math.sin(time * 55) > 0.82 ? 0.25 : 1;
        this.extraAnim.update({ vx: speed, vy: 0, ground: true, landT: 0, landV: 0, inter: false, wake: 0, sneak: false, skid: false }, dt);
        this.extraAnim.draw(g, x, gy - hop, 1, { fill: 0x000000, fillA: 0.9 * flick, rim: 0xffffff, rimA: 0.9 * flick, rimBoost: 2.5, glitch: 1 });
      } else if (ev.def.kind === 'horrorEcho') {
        const trig = S[ev.off];
        if (trig < 0) continue;
        const cap = this.horror.get(ev.def.id);
        if (!cap) continue;
        const el = tick - trig;
        const i = Math.min(el, cap.n - 1);
        if (el < 0) continue;
        const o = Math.max(0, i) * 6;
        const x = cap.frames[o];
        const y = cap.frames[o + 1];
        if (el < cap.n - 1) {
          this.ghostAnim.update(
            { vx: cap.frames[o + 3], vy: cap.frames[o + 4], ground: cap.frames[o + 5] > 0.5, landT: 0, landV: 0, inter: false, wake: 0, sneak: false, skid: false },
            dt,
          );
          this.ghostAnim.draw(g, x, y, cap.frames[o + 2], { fill: 0x101010, fillA: 0.85, rim: 0xffffff, rimA: 0.9, rimBoost: 2 });
        } else {
          // it stops, and turns around to look out of the screen
          const turn = clamp((el - (cap.n - 1)) / 120, 0, 1);
          if (turn < 0.5) {
            this.ghostAnim.update({ vx: 0, vy: 0, ground: true, landT: 0, landV: 0, inter: false, wake: 0, sneak: false, skid: false }, dt);
            this.ghostAnim.draw(g, x, y, cap.frames[o + 2], { fill: 0x101010, fillA: 0.85, rim: 0xffffff, rimA: 0.9, rimBoost: 2 });
          } else drawFrontal(g, x, y, time, 1, 1);
        }
      }
    }
    // the corridor silhouette
    if (this.sil && S[this.sil.off] >= 0) {
      const sx = S[this.sil.off + 1];
      if (sx >= 0 && this.realTime > this.blackoutUntil) {
        drawShadowEntity(g, sx, this.def.ground, S[P_X] < sx ? -1 : 1, time, 0, 0, 1);
      }
    }
  }

  private drawShards(g: Phaser.GameObjects.Graphics, dt: number) {
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.shards.splice(i, 1);
        continue;
      }
      s.vy += 900 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.r += s.vr * dt;
      const a = clamp(s.life, 0, 1);
      const cs = Math.cos(s.r) * s.s;
      const sn = Math.sin(s.r) * s.s;
      g.fillStyle(i % 3 === 0 ? 0xffffff : 0x000000, a);
      g.fillTriangle(s.x - cs, s.y - sn, s.x + sn, s.y - cs, s.x + cs * 0.4, s.y + sn * 1.2);
    }
  }

  private drawSparks(g: Phaser.GameObjects.Graphics, dt: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy += 700 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      g.fillStyle(0xffffff, clamp(s.life * 3, 0, 1));
      g.fillRect(s.x, s.y, 2.5, 2.5);
    }
  }

  private drawPreview(dt: number, time: number) {
    const sim = this.sim;
    const p = sim.prediction;
    const a = this.visionAmt;
    const size = p.size;
    const idx = clamp(Math.floor(this.previewTick / PREDICT_STRIDE), 0, p.count - 1);
    const S = p.frames.subarray(idx * size, (idx + 1) * size);
    const fe = this.fenv;
    const fm = this.femit;
    // future world, translucent
    this.dyn.draw(fe, fm, S, time, 0.35 * a, true);
    // the path you are about to walk
    fm.lineStyle(2, 0xffffff, 0.45 * a);
    fm.beginPath();
    let started = false;
    const end = p.deathFrame >= 0 ? p.deathFrame : p.count - 1;
    for (let i = 0; i <= end; i += 1) {
      const o = i * size;
      const x = p.frames[o + P_X];
      const y = p.frames[o + P_Y] - 27;
      if (!started) {
        fm.moveTo(x, y);
        started = true;
      } else fm.lineTo(x, y);
    }
    fm.strokePath();
    // echoes in the future
    const ft = S[0];
    for (const e of sim.echoes) {
      if (!e.sample(ft, this.pose)) continue;
      fe.fillStyle(0xffffff, 0.2 * a);
      fe.fillRect(this.pose.x - 11, this.pose.y - 54, 22, 54);
    }
    const en = sim.c.enemy;
    if (en && S[en.off + 7] > 0.5) drawShadowEntity(fe, S[en.off], en.def.y, S[en.off + 2] >= 0 ? 1 : -1, time, Math.abs(S[en.off + 1]), S[en.off + 3], 0.35 * a);
    // future self
    if (S[P_DEAD] < 0.5) {
      this.ghostAnim.update(this.poseFromState(S), dt);
      this.ghostAnim.draw(fe, S[P_X], S[P_Y], S[P_FACE], { fill: 0xffffff, fillA: 0.22 * a, rim: 0xffffff, rimA: 0.9 * a, rimBoost: 1.5, glitch: 1 });
    }
    if (p.deathFrame >= 0) {
      const o = p.deathFrame * size;
      const x = p.frames[o + P_X];
      const y = p.frames[o + P_Y] - 30;
      const pulse = 0.6 + 0.4 * Math.sin(time * 12);
      fm.lineStyle(5, 0xffffff, pulse * a);
      fm.beginPath();
      fm.moveTo(x - 18, y - 18);
      fm.lineTo(x + 18, y + 18);
      fm.moveTo(x + 18, y - 18);
      fm.lineTo(x - 18, y + 18);
      fm.strokePath();
      fm.lineStyle(2, 0xffffff, pulse * 0.5 * a);
      fm.strokeCircle(x, y, 30 + Math.sin(time * 9) * 4);
    }
  }

  private drawLights(px: number, py: number, time: number, dead: boolean) {
    const def = this.def;
    const L = this.lighting;
    const S = this.sim.S;
    const sx = this.cameras.main.scrollX;
    const sy = this.cameras.main.scrollY;
    const black = this.realTime < this.blackoutUntil ? 0.03 : 1;
    L.begin(def.ambient * (black < 1 ? 0.35 : 1), sx, sy);
    for (const l of def.lights) {
      L.add(l.x, l.y, l.radius, l.intensity * flicker(l.flicker, time, l.seed ?? 0) * black);
    }
    // personal lantern so the silhouette never vanishes in total dark
    if (!dead && !this.playerHidden) L.add(px, py - 34, 150, 0.3);
    for (const e of this.sim.echoes) {
      if (e.sample(S[0], this.pose)) L.add(this.pose.x, this.pose.y - 32, 130, 0.45);
    }
    for (const p of this.sim.c.plates) L.add(p.def.x, p.def.y - 6, 70, S[p.off] > 0.5 ? 0.5 : 0.18);
    for (const t of this.sim.c.terminals) L.add(t.def.x, t.def.y - 40, 130, S[t.off] > 0.5 ? 0.4 : 0.65);
    for (const k of this.sim.c.pickups) if (S[k.off] < 0.5) L.add(k.def.x, k.def.y - 22, 90, 0.6);
    const ex = this.sim.c.exit;
    if (ex) L.add(ex.def.x, ex.def.y - 100, 230, 0.2 + 0.75 * S[ex.off + 1]);
    for (const lv of this.sim.c.levers) L.add(lv.def.x, lv.def.y - 28, 70, S[lv.off] > 0.5 ? 0.55 : 0.2);
    const en = this.sim.c.enemy;
    if (en && S[en.off + 7] > 0.5) L.addDark(S[en.off], en.def.y - 60, 170, 0.85);
    if (this.sil && S[this.sil.off] >= 0 && S[this.sil.off + 1] >= 0) L.addDark(S[this.sil.off + 1], def.ground - 60, 140, 0.8);
    L.end();
  }
}
