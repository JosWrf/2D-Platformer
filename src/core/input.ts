export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'attack'
  | 'dash'
  | 'pause'
  | 'restart'
  | 'confirm';

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
  ShiftLeft: ['dash'],
  ShiftRight: ['dash'],
  KeyL: ['dash'],
  KeyP: ['pause'],
  Escape: ['pause'],
  KeyR: ['restart'],
  Enter: ['confirm'],
};

/** Keyboard state with edge detection; consumed once per fixed update. */
export class Input {
  private readonly down = new Set<Action>();
  private readonly pressedThisFrame = new Set<Action>();
  private readonly releasedThisFrame = new Set<Action>();
  /** Anything typed since the last frame - used by "press any key" prompts. */
  anyPressed = false;

  attach(target: Window | HTMLElement): () => void {
    const onDown = (ev: KeyboardEvent) => {
      const actions = BINDINGS[ev.code];
      if (ev.code === 'Space' || ev.code.startsWith('Arrow')) ev.preventDefault();
      if (!actions) return;
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
      this.down.delete(action);
    }
  }
}
