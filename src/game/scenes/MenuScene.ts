import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../constants';
import { bus } from '../bus';
import { CharAnimator, drawShadowEntity } from '../render/Silhouette';
import { EchoPostPipeline, postParams } from '../render/PostFX';
import { bakeLevel } from '../render/artBaker';
import { LEVELS } from '../levels';
import { Lighting, flicker } from '../render/Lighting';
import { getSettings } from '../settings';
import { audio } from '../audio/AudioManager';

/** Atmospheric backdrop behind the React main menu: a slowly drifting, flickering reception hall. */
export class MenuScene extends Phaser.Scene {
  private lighting!: Lighting;
  private gfx!: Phaser.GameObjects.Graphics;
  private t = 0;
  private def = LEVELS[0];
  private anim = new CharAnimator();
  private startHandler = () => this.scene.stop();

  constructor() {
    super('Menu');
  }

  create() {
    this.t = 0;
    const baked = bakeLevel(this.def);
    for (const k of ['menu-far', 'menu-mid']) if (this.textures.exists(k)) this.textures.remove(k);
    this.textures.addCanvas('menu-far', baked.far);
    this.textures.addCanvas('menu-mid', baked.mid);
    this.add.image(0, 0, 'menu-far').setOrigin(0).setScrollFactor(baked.farScroll).setDepth(0);
    this.add.image(0, 0, 'menu-mid').setOrigin(0).setDepth(10);
    this.gfx = this.add.graphics().setDepth(30);
    this.lighting = new Lighting(this, 50);
    if (this.game.renderer.type === Phaser.WEBGL) this.cameras.main.setPostPipeline(EchoPostPipeline);
    postParams.fade = 0;
    postParams.rewind = 0;
    postParams.vision = 0;
    postParams.distort = 0.05;
    bus.on('menu:leave', this.startHandler);
    this.events.once('shutdown', () => bus.off('menu:leave', this.startHandler));
  }

  update(_: number, dtMs: number) {
    const dt = Math.min(0.05, dtMs / 1000);
    this.t += dt;
    const s = getSettings();
    postParams.grain = s.grain ? 1 : 0;
    postParams.halftone = s.halftone ? 1 : 0;
    postParams.glitch = s.glitch ? 0.25 + (Math.sin(this.t * 0.7) > 0.96 ? 1 : 0) : 0;
    const cam = this.cameras.main;
    // slow pan back and forth across the hall
    const sx = 140 + (Math.sin(this.t * 0.05) * 0.5 + 0.5) * 760;
    cam.setScroll(sx, 0);
    this.lighting.begin(this.def.ambient * 0.75, sx, 0);
    for (const l of this.def.lights) this.lighting.add(l.x, l.y, l.radius * 1.2, l.intensity * flicker(l.flicker, this.t, l.seed ?? 0));
    // a silhouette in the distance who never moves
    const g = this.gfx;
    g.clear();
    const px = 1180;
    this.anim.update({ vx: 0, vy: 0, ground: true, landT: 0, landV: 0, inter: false, wake: 0, sneak: false, skid: false }, dt);
    this.anim.draw(g, px, this.def.ground, -1, { fill: 0x000000, fillA: 0.92, rim: 0xffffff, rimA: 0.12 });
    this.lighting.add(px, 540, 160, 0.14);
    this.lighting.end();
    if (Math.sin(this.t * 0.31) > 0.985) drawShadowEntity(g, 1500, this.def.ground, -1, this.t, 0, 0, 0.5);
    audio.update(dt);
    void VIEW_W;
    void VIEW_H;
  }
}
