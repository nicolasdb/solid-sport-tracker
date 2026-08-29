export interface TimerStep {
  label: string;
  seconds: number;
}

export interface TimerState {
  stepIndex: number;
  step: TimerStep | null;
  remaining: number;
  running: boolean;
  done: boolean;
}

type TimerListener = (state: TimerState) => void;

/** Minuteur séquentiel : enchaîne une liste d'étapes chronométrées (les blocs d'une séance). */
export class SequenceTimer {
  private steps: TimerStep[];
  private stepIndex = 0;
  private remaining: number;
  private running = false;
  private intervalId: number | undefined;
  private listeners = new Set<TimerListener>();

  constructor(steps: TimerStep[]) {
    this.steps = steps.filter((s) => s.seconds > 0);
    this.remaining = this.steps[0]?.seconds ?? 0;
  }

  subscribe(listener: TimerListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.running || this.stepIndex >= this.steps.length) return;
    this.running = true;
    this.intervalId = window.setInterval(() => this.tick(), 1000);
    this.emit();
  }

  pause(): void {
    this.running = false;
    window.clearInterval(this.intervalId);
    this.emit();
  }

  skip(): void {
    this.advance();
  }

  reset(): void {
    this.pause();
    this.stepIndex = 0;
    this.remaining = this.steps[0]?.seconds ?? 0;
    this.emit();
  }

  private tick(): void {
    this.remaining -= 1;
    if (this.remaining <= 0) {
      this.advance();
      return;
    }
    this.emit();
  }

  private advance(): void {
    this.stepIndex += 1;
    if (this.stepIndex >= this.steps.length) {
      this.pause();
      this.emit();
      return;
    }
    this.remaining = this.steps[this.stepIndex].seconds;
    this.emit();
  }

  private getState(): TimerState {
    const done = this.stepIndex >= this.steps.length;
    return {
      stepIndex: this.stepIndex,
      step: done ? null : this.steps[this.stepIndex],
      remaining: this.remaining,
      running: this.running,
      done,
    };
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }
}

export function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
