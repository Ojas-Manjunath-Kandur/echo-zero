import type { InputFrame } from './sim/types';

const GAME_KEYS = new Set([
  'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space',
  'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyR', 'KeyF', 'KeyQ', 'Enter',
]);

/** Keyboard state with edge latching so a tap shorter than one frame is never lost. */
export class Input {
  private down = new Set<string>();
  private latched = new Set<string>();
  /** one-shot presses consumed by the scene (pause, etc.) */
  private pressedOnce = new Set<string>();
  enabled = true;

  private onDown = (e: KeyboardEvent) => {
    if (GAME_KEYS.has(e.code) || e.code === 'Escape' || e.code === 'KeyP') {
      if (GAME_KEYS.has(e.code) && this.enabled) e.preventDefault();
    }
    if (e.repeat) return;
    if (!this.down.has(e.code)) {
      this.latched.add(e.code);
      this.pressedOnce.add(e.code);
    }
    this.down.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private onBlur = () => {
    this.down.clear();
  };

  attach() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }
  detach() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  held(...codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** true once per physical key press */
  pressed(...codes: string[]): boolean {
    let r = false;
    for (const c of codes) if (this.pressedOnce.delete(c)) r = true;
    return r;
  }

  clearPressed() {
    this.pressedOnce.clear();
    this.latched.clear();
  }

  /** Builds the sim input for the next tick; latched presses are consumed here. */
  frame(): InputFrame {
    const jumpKeys = ['Space', 'KeyW', 'ArrowUp'];
    let jumpPressed = false;
    for (const k of jumpKeys) if (this.latched.delete(k)) jumpPressed = true;
    const interactPressed = this.latched.delete('KeyE');
    return {
      left: this.held('KeyA', 'ArrowLeft'),
      right: this.held('KeyD', 'ArrowRight'),
      down: this.held('KeyS', 'ArrowDown'),
      sneak: this.held('ShiftLeft', 'ShiftRight'),
      jumpHeld: this.held(...jumpKeys),
      jumpPressed,
      interactPressed,
    };
  }

  /** current held direction keys without consuming anything (for foresight) */
  peekFrame(): InputFrame {
    return {
      left: this.held('KeyA', 'ArrowLeft'),
      right: this.held('KeyD', 'ArrowRight'),
      down: false,
      sneak: this.held('ShiftLeft', 'ShiftRight'),
      jumpHeld: this.held('Space', 'KeyW', 'ArrowUp'),
      jumpPressed: false,
      interactPressed: false,
    };
  }
}
