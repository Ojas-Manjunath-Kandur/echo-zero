import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './constants';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene, StartPayload } from './scenes/GameScene';
import { Input } from './input';
import { audio } from './audio/AudioManager';
import { getSettings, onSettings } from './settings';
import { bus } from './bus';

let game: Phaser.Game | null = null;

export function createGame(parent: HTMLElement): Phaser.Game {
  if (game) return game;
  const input = new Input();
  input.attach();
  game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#000000',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance', roundPixels: false, pixelArt: false },
    fps: { target: 60, smoothStep: false },
    disableContextMenu: true,
    audio: { noAudio: true },
    scene: [BootScene, MenuScene, GameScene],
    callbacks: {
      preBoot: (g) => {
        g.registry.set('input', input);
      },
    },
  });
  onSettings((s) => audio.applySettings(s));
  (window as unknown as Record<string, unknown>).__game = game;
  return game;
}

export function startGame(level: number) {
  if (!game) return;
  audio.init();
  audio.applySettings(getSettings());
  bus.emit('menu:leave');
  const sm = game.scene;
  if (sm.isActive('Menu')) sm.stop('Menu');
  if (sm.isActive('Game') || sm.isPaused('Game')) sm.stop('Game');
  sm.start('Game', { level, fresh: true, fadeIn: true } satisfies StartPayload);
}
