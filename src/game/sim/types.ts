export interface InputFrame {
  left: boolean;
  right: boolean;
  down: boolean;
  sneak: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
}

export const NO_INPUT: InputFrame = {
  left: false,
  right: false,
  down: false,
  sneak: false,
  jumpHeld: false,
  jumpPressed: false,
  interactPressed: false,
};

export type SimEvent =
  | { t: 'jump'; x: number; y: number }
  | { t: 'land'; x: number; y: number; impact: number; surface: number }
  | { t: 'step'; x: number; y: number; surface: number; sneak: boolean }
  | { t: 'pickup'; id: string; kind: string; label: string; x: number; y: number }
  | { t: 'terminal'; id: string }
  | { t: 'lever'; id: string; on: boolean; x: number; y: number; echo: boolean }
  | { t: 'plate'; id: string; down: boolean; x: number; y: number }
  | { t: 'gate'; id: string; opening: boolean; x: number; y: number }
  | { t: 'locked'; text: string }
  | { t: 'exit'; toFloor: number }
  | { t: 'death'; cause: string }
  | { t: 'event'; id: string; kind: string; x: number; y: number; params: Record<string, number | string> }
  | { t: 'blink'; stage: number; x: number }
  | { t: 'spark'; x: number; y: number }
  | { t: 'enemy'; mode: number; x: number; y: number };

export const SURF = { tile: 0, carpet: 1, metal: 2, concrete: 3 } as const;
