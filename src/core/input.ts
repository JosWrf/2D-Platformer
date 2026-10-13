export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'attack'
  | 'parry'
  | 'dash'
  | 'skill'
  | 'cycle'
  | 'pause'
  | 'restart'
  | 'confirm'
  | 'calm'
  | 'music'
  | 'sound'
  | 'help';

const BINDINGS: Record<string, Action[]> = {
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ArrowUp: ['up'],
  KeyW: ['up', 'jump'],
  ArrowDown: ['down'],
  KeyS: ['down'],
  Space: ['jump', 'confirm'],
  KeyJ: ['attack'],
  KeyK: ['attack'],
  KeyX: ['attack'],
  KeyE: ['parry'],
  KeyI: ['parry'],
  ShiftLeft: ['dash'],
  ShiftRight: ['dash'],
  KeyL: ['dash'],
  // The boss attacks: one to use the one picked, one to pick the next.
  KeyF: ['skill'],
  KeyU: ['skill'],
  KeyC: ['skill'],
  KeyQ: ['cycle'],
  KeyO: ['cycle'],
  KeyV: ['cycle'],
  KeyP: ['pause'],
  Escape: ['pause'],
  KeyR: ['restart'],
  KeyB: ['calm'],
  KeyM: ['music'],
  KeyN: ['sound'],
  KeyH: ['help'],
  Enter: ['confirm'],
};

/**
 * The three sets of keys the game is played with, by the key that uses the
 * picked boss attack and the key that changes it: F and Q beside WASD, C and
 * V beside the arrow keys' X, U and O over the right hand's J, K and L. The
 * HUD shows the caps of the set last used.
 */
const SKILL_KEYS: Readonly<Record<string, string>> = { KeyF: 'F', KeyU: 'U', KeyC: 'C' };
const CYCLE_KEYS: Readonly<Record<string, string>> = { KeyQ: 'Q', KeyO: 'O', KeyV: 'V' };
/** And the caps of the keys that move, by the set last used: left, right, up, down. */
const MOVE_ARROWS = ['←', '→', '↑', '↓'] as const;
const MOVE_WASD = ['A', 'D', 'W', 'S'] as const;
const WASD = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS']);
const PAIRS: Readonly<Record<string, readonly [string, string]>> = {
  F: ['F', 'Q'],
  Q: ['F', 'Q'],
  U: ['U', 'O'],
  O: ['U', 'O'],
  C: ['C', 'V'],
  V: ['C', 'V'],
};

/** What a reader of the keys needs: the keys themselves, or a view of them with some held back. */
export interface Keys {
  isDown(action: Action): boolean;
  pressed(action: Action): boolean;
  released(action: Action): boolean;
  axisX(): number;
}

/** Keyboard state with edge detection; consumed once per fixed update. */
export class Input implements Keys {
  private readonly down = new Set<Action>();
  private readonly pressedThisFrame = new Set<Action>();
  private readonly releasedThisFrame = new Set<Action>();
  /** Anything typed since the last frame - used by "press any key" prompts. */
  anyPressed = false;
  /** The caps of the set of keys last used for the boss attacks: [use, change]. */
  attackKeys: readonly [string, string] = ['F', 'Q'];
  /** The caps of the keys last used to move: left, right, up, down. */
  moveKeys: readonly [string, string, string, string] = MOVE_WASD;

  attach(target: Window | HTMLElement): () => void {
    const onDown = (ev: KeyboardEvent) => {
      const actions = BINDINGS[ev.code];
      if (ev.code === 'Space' || ev.code.startsWith('Arrow')) ev.preventDefault();
      if (!actions) return;
      const cap = SKILL_KEYS[ev.code] ?? CYCLE_KEYS[ev.code];
      if (cap) this.attackKeys = PAIRS[cap];
      if (ev.code.startsWith('Arrow')) this.moveKeys = MOVE_ARROWS;
      else if (WASD.has(ev.code)) this.moveKeys = MOVE_WASD;
      if (!ev.repeat) {
        this.anyPressed = true;
        for (const a of actions) {
          if (!this.down.has(a)) this.pressedThisFrame.add(a);
        }
      }
      for (const a of actions) this.down.add(a);
    };
    const onUp = (ev: KeyboardEvent) => {
      const actions = BINDINGS[ev.code];
      if (!actions) return;
      for (const a of actions) {
        this.down.delete(a);
        this.releasedThisFrame.add(a);
      }
    };
    const onBlur = () => this.clear();

    const el = target as Window;
    el.addEventListener('keydown', onDown as EventListener);
    el.addEventListener('keyup', onUp as EventListener);
    el.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('keydown', onDown as EventListener);
      el.removeEventListener('keyup', onUp as EventListener);
      el.removeEventListener('blur', onBlur);
    };
  }

  isDown(action: Action): boolean {
    return this.down.has(action);
  }

  pressed(action: Action): boolean {
    return this.pressedThisFrame.has(action);
  }

  released(action: Action): boolean {
    return this.releasedThisFrame.has(action);
  }

  /** -1, 0 or 1 from the horizontal keys. */
  axisX(): number {
    return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
  }

  endFrame(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.anyPressed = false;
  }

  clear(): void {
    this.down.clear();
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
  }

  /** Used by the automated screenshot tool. */
  forceDown(action: Action, isDown: boolean): void {
    if (isDown) {
      if (!this.down.has(action)) this.pressedThisFrame.add(action);
      this.down.add(action);
    } else {
      if (this.down.has(action)) this.releasedThisFrame.add(action);
      this.down.delete(action);
    }
  }
}

/** The keys with some actions held back: what the hero reads while the attack picker has the arrows. */
export class MaskedKeys implements Keys {
  constructor(
    private readonly keys: Keys,
    private readonly hidden: ReadonlySet<Action>,
  ) {}

  isDown(action: Action): boolean {
    return !this.hidden.has(action) && this.keys.isDown(action);
  }

  pressed(action: Action): boolean {
    return !this.hidden.has(action) && this.keys.pressed(action);
  }

  released(action: Action): boolean {
    return !this.hidden.has(action) && this.keys.released(action);
  }

  axisX(): number {
    return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
  }
}
