import Phaser from 'phaser';
import { generateTextures } from '../render/textures';
import { EchoPostPipeline } from '../render/PostFX';
import { bus } from '../bus';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  create() {
    generateTextures(this);
    const r = this.game.renderer;
    if (r instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      if (!r.pipelines.has(EchoPostPipeline.KEY)) r.pipelines.addPostPipeline(EchoPostPipeline.KEY, EchoPostPipeline);
    }
    bus.emit('booted');
    this.scene.start('Menu');
  }
}
