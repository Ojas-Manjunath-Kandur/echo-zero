import type { HudState } from '../bus';

/** Mutable HUD state read by the React HUD every animation frame (no React re-renders during play). */
export const hudState: HudState = {
  floorLabel: '05',
  floorName: '',
  objective: '',
  rewindMem: 0,
  rewindCd: 0,
  focus: 1,
  echoes: 0,
  prompt: '',
  rewinding: false,
  vision: false,
  rewindSecs: 0,
};
