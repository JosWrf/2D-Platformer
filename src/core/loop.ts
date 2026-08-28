/** Fixed-timestep game loop with an accumulator and a render interpolation hook. */
export const FIXED_DT = 1 / 60;
const MAX_FRAME_TIME = 0.25;

export class Loop {
  private rafId = 0;
  private last = 0;
  private accumulator = 0;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      this.rafId = requestAnimationFrame(frame);
      let frameTime = (now - this.last) / 1000;
      this.last = now;
      if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;
      this.accumulator += frameTime;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 5) {
        this.update(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === 5) this.accumulator = 0;
      this.render();
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Deterministic stepping used by the screenshot tool. */
  step(dt: number): void {
    this.update(dt);
    this.render();
  }
}
