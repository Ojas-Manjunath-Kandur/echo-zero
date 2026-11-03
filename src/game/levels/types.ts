// Level data model. Everything here is static, declarative data.
// All dynamic (rewindable) state lives in the World state vector, indexed through `compile.ts`.

export type Theme = 'reception' | 'office' | 'archive' | 'lab' | 'exec' | 'garage';
export type Surface = 'tile' | 'carpet' | 'metal' | 'concrete';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A boolean expression over world signals (plate ids, lever ids, pickups, flags...). */
export type Sig = string | { not: Sig } | { all: Sig[] } | { any: Sig[] };

export interface SolidDef extends Rect {
  oneWay?: boolean;
  surface?: Surface;
  /** Visual style; drawn by the baked renderer. 'none' = invisible collider. */
  style?: 'slab' | 'wall' | 'desk' | 'shelf' | 'partition' | 'platform' | 'counter' | 'crate' | 'none';
}

export interface PlateDef {
  id: string;
  x: number; // centre x
  y: number; // surface y (top of floor it rests on)
  w: number;
}

export interface LeverDef {
  id: string;
  x: number;
  y: number; // floor y
  /** if set, the lever springs back after this many ticks (a timed button) */
  resetTicks?: number;
  label?: string;
}

export interface GateDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  open: Sig;
  /** door: solid while closed. bridge: solid (one-way) while powered. */
  kind?: 'door' | 'bridge';
  style?: 'door' | 'shutter' | 'glass' | 'beam' | 'vault';
}

export interface PickupDef {
  id: string;
  x: number;
  y: number; // feet/floor-level y where it sits
  kind: 'card' | 'fragment' | 'tape';
  label: string;
}

export interface TerminalDef {
  id: string;
  x: number;
  y: number; // floor y
  title: string;
  lines: string[];
  /** terminals that show a short alert in the world HUD when first read */
  objectiveAfter?: string;
}

export interface PhaseDef {
  x: number;
  y: number;
  w: number;
  h: number;
  /** ticks: [present, absent, present, absent, ...] repeating */
  cycle?: number[];
  offset?: number;
  /** present only while at least `min` echoes exist and (optionally) at most `max` */
  timeline?: { min: number; max?: number };
}

export interface HazardDef {
  x: number;
  y: number;
  w: number;
  h: number;
  period: number;
  on: number;
  offset: number;
  kind: 'spark' | 'beam';
}

export interface LightDef {
  x: number;
  y: number;
  radius: number;
  intensity: number; // 0..1
  flicker?: 'steady' | 'flicker' | 'dying' | 'strobe';
  /** fixture drawn in the world (ceiling tube) */
  fixture?: boolean;
  seed?: number;
}

export type EventKind =
  | 'silhouette'
  | 'chair'
  | 'prophecy'
  | 'horrorEcho'
  | 'blackout'
  | 'radio'
  | 'footsteps'
  | 'stinger'
  | 'glitch'
  | 'voice'
  | 'elevator'
  | 'shift'
  | 'whisper'
  | 'door';

export interface EventDef {
  id: string;
  kind: EventKind;
  rect: Rect;
  need?: Sig;
  params?: Record<string, number | string>;
}

export interface HintDef {
  id: string;
  rect: Rect;
  text: string;
  /** hidden when the tutorial is switched off in settings */
  tutorial?: boolean;
}

export interface ExitDef {
  x: number; // centre
  y: number; // floor y
  need: Sig;
  lockedText: string;
  toFloor: number; // next level index; -1 = ending sequence
}

export interface EnemyDef {
  x: number;
  y: number; // feet y (it is bound to this lane)
  minX: number;
  maxX: number;
  speed: number;
  hearing: number;
  /** enemy sleeps until this event fires (optional) */
  wakeOn?: string;
}

export type PropKind =
  | 'desk'
  | 'chair'
  | 'monitor'
  | 'plant'
  | 'shelf'
  | 'cabinet'
  | 'column'
  | 'window'
  | 'clock'
  | 'couch'
  | 'sign'
  | 'pipe'
  | 'vent'
  | 'tube'
  | 'machine'
  | 'car'
  | 'pillar'
  | 'cubicle'
  | 'poster'
  | 'door'
  | 'elevator'
  | 'boxes'
  | 'lamp'
  | 'rack'
  | 'cable'
  | 'chairDyn'
  | 'tvwall'
  | 'bench'
  | 'sink';

export interface PropDef {
  kind: PropKind;
  x: number; // centre x
  y: number; // base (floor) y
  w?: number;
  h?: number;
  /** extra numeric/text param (e.g. clock time, sign label, chair id) */
  text?: string;
  flip?: boolean;
  /** drawn behind (far) or in front of the player */
  layer?: 'back' | 'mid' | 'front';
  id?: string;
  n?: number;
}

export interface CheckpointDef {
  x: number;
  y: number;
}

export interface ObjectiveDef {
  /** objective text shown while the player's x is below `until` */
  until: number;
  text: string;
  /** optional signal; if set, the objective is shown only while it is false */
  unless?: Sig;
}

export interface LevelDef {
  id: string;
  floor: number; // displayed floor number; 0 = garage (B1)
  index: number;
  name: string;
  subtitle: string;
  theme: Theme;
  width: number;
  height: number;
  ground: number; // default floor line (for visuals)
  ceiling: number;
  spawn: { x: number; y: number; wake?: boolean };
  ambient: number; // 0..1 base light
  fog: number; // 0..1
  distortion: number; // 0..1 shader wobble
  solids: SolidDef[];
  plates?: PlateDef[];
  levers?: LeverDef[];
  gates?: GateDef[];
  pickups?: PickupDef[];
  terminals?: TerminalDef[];
  phases?: PhaseDef[];
  hazards?: HazardDef[];
  lights: LightDef[];
  events?: EventDef[];
  hints?: HintDef[];
  props?: PropDef[];
  exit?: ExitDef;
  enemy?: EnemyDef;
  checkpoints?: CheckpointDef[];
  objectives: ObjectiveDef[];
  /** radio / ambience parameters */
  audio?: { drone: number; buzz: number; tick: number; surface: Surface };
  /** kill line: falling below this y kills the player */
  killY: number;
  /** player can use rewind/vision from the start of this level */
  introText?: string;
}
