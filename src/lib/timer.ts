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
  /** Bloc terminé, le suivant est armé mais attend le feu vert de l'usager. */
  awaitingReady: boolean;
}

/** Ce que le minuteur a observé pour une étape — base du log de séance. */
export interface StepRecord {
  label: string;
  plannedSeconds: number;
  /** Secondes réellement décomptées (pauses et temps d'attente exclus). */
  elapsedSeconds: number;
  /** Faux si l'étape a été passée avant la fin de son décompte. */
  completed: boolean;
}

export interface SessionRecord {
  /** Premier démarrage, ou null si le minuteur n'a jamais tourné. */
  startedAt: Date | null;
  totalElapsedSeconds: number;
  steps: StepRecord[];
}

type TimerListener = (state: TimerState) => void;

/** Minuteur séquentiel : enchaîne une liste d'étapes chronométrées (les blocs d'une séance). */
export class SequenceTimer {
  private steps: TimerStep[];
  private stepIndex = 0;
  private remaining: number;
  private running = false;
  private awaitingReady = false;
  private intervalId: number | undefined;
  private listeners = new Set<TimerListener>();
  private elapsed: number[];
  private completed: boolean[];
  private startedAt: Date | null = null;

  constructor(steps: TimerStep[]) {
    this.steps = steps.filter((s) => s.seconds > 0);
    this.remaining = this.steps[0]?.seconds ?? 0;
    this.elapsed = this.steps.map(() => 0);
    this.completed = this.steps.map(() => false);
  }

  /** Ce qui s'est réellement passé, pour alimenter l'écran de récapitulatif. */
  getRecord(): SessionRecord {
    return {
      startedAt: this.startedAt,
      totalElapsedSeconds: this.elapsed.reduce((sum, n) => sum + n, 0),
      steps: this.steps.map((step, i) => ({
        label: step.label,
        plannedSeconds: step.seconds,
        elapsedSeconds: this.elapsed[i],
        completed: this.completed[i],
      })),
    };
  }

  /** État courant, pour les appelants qui réagissent à un clic plutôt qu'à un abonnement. */
  getSnapshot(): TimerState {
    return this.getState();
  }

  subscribe(listener: TimerListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  /** Démarre le bloc courant — c'est aussi le feu vert après un bloc terminé. */
  start(): void {
    if (this.running || this.stepIndex >= this.steps.length) return;
    this.awaitingReady = false;
    this.running = true;
    this.startedAt ??= new Date();
    this.intervalId = window.setInterval(() => this.tick(), 1000);
    this.emit();
  }

  pause(): void {
    this.stopTicking();
    this.emit();
  }

  private stopTicking(): void {
    this.running = false;
    window.clearInterval(this.intervalId);
  }

  /** Passe l'étape courante : elle est enregistrée comme non terminée. */
  skip(): void {
    this.advance(false);
  }

  reset(): void {
    this.pause();
    this.awaitingReady = false;
    this.stepIndex = 0;
    this.remaining = this.steps[0]?.seconds ?? 0;
    this.elapsed = this.steps.map(() => 0);
    this.completed = this.steps.map(() => false);
    this.startedAt = null;
    this.emit();
  }

  private tick(): void {
    this.remaining -= 1;
    this.elapsed[this.stepIndex] += 1;
    if (this.remaining <= 0) {
      this.advance(true);
      return;
    }
    this.emit();
  }

  /**
   * Arme le bloc suivant sans le lancer : on laisse l'usager souffler et
   * reprendre quand il est prêt plutôt que d'enchaîner automatiquement.
   */
  private advance(completed: boolean): void {
    this.stopTicking();
    if (this.stepIndex < this.steps.length) {
      this.completed[this.stepIndex] = completed;
    }
    this.stepIndex += 1;
    if (this.stepIndex >= this.steps.length) {
      this.awaitingReady = false;
      this.emit();
      return;
    }
    this.remaining = this.steps[this.stepIndex].seconds;
    this.awaitingReady = true;
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
      awaitingReady: this.awaitingReady,
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
