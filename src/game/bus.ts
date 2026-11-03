import Phaser from 'phaser';

/** Shared event bus between the React UI and the Phaser game. */
export const bus = new Phaser.Events.EventEmitter();

export interface HudState {
  floorLabel: string;
  floorName: string;
  objective: string;
  rewindMem: number; // 0..1 buffer filled
  rewindCd: number; // 0..1 cooldown remaining
  focus: number; // 0..1 foresight energy
  echoes: number;
  prompt: string; // interaction prompt text ('' = none)
  rewinding: boolean;
  vision: boolean;
  rewindSecs: number;
}

export interface TerminalPayload {
  id: string;
  title: string;
  lines: string[];
}

export interface HintPayload {
  text: string;
}

export interface TitleCardPayload {
  floor: string;
  name: string;
  subtitle: string;
}
