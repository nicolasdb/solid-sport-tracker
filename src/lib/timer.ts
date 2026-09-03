export interface TimerStep {
  label: string;
  seconds: number;
  /** Démarre sans attendre de validation quand l'étape précédente se clôt. */
  chain?: boolean;
}

export interface TimerState {
  stepIndex: number;
  step: TimerStep | null;
  remaining: number;
  running: boolean;
  done: boolean;
  /** Bloc terminé, le suivant est armé mais attend le feu vert de l'usager. */
  awaitingReady: boolean;
  /** Faux pour une étape comptée ou une checklist : c'est l'usager qui la clôt. */
  timed: boolean;
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
  /**
   * Durée murale depuis le premier démarrage, pauses et temps d'attente
   * inclus — la durée de séance qu'on enregistre même quand peu d'étapes
   * sont chronométrées.
   */
  wallClockSeconds: number;
  steps: StepRecord[];
}

type TimerListener = (state: TimerState) => void;

/**
 * Minuteur séquentiel : enchaîne une liste d'étapes chronométrées (les blocs
 * d'une séance).
 *
 * Le temps est mesuré en deltas d'horloge (`Date.now()`), jamais en comptant
 * les ticks : sur mobile, le navigateur throttle voire gèle les `setInterval`
 * d'un onglet en arrière-plan, et un décompte par ticks sous-estime alors
 * massivement la durée réelle. L'interval ne sert qu'à rafraîchir l'affichage ;
 * `resync()` permet de recaler l'état immédiatement au retour en foreground.
 */
export class SequenceTimer {
  private steps: TimerStep[];
  private stepIndex = 0;
  private running = false;
  private awaitingReady = false;
  private intervalId: number | undefined;
  private listeners = new Set<TimerListener>();
  /** Temps couru accumulé par étape, en ms (hors période de course en cours). */
  private elapsedMs: number[];
  private completed: boolean[];
  private startedAt: Date | null = null;
  /** Horodatage du dernier (re)démarrage de l'étape courante, null à l'arrêt. */
  private stepStartedAt: number | null = null;

  constructor(steps: TimerStep[]) {
    // Une étape à 0 seconde n'est pas ignorée : c'est une étape comptée ou une
    // checklist, que l'usager valide lui-même. Le temps y court quand même —
    // seule la fin automatique est désactivée.
    this.steps = steps;
    this.elapsedMs = this.steps.map(() => 0);
    this.completed = this.steps.map(() => false);
  }

  /** Ce qui s'est réellement passé, pour alimenter l'écran de récapitulatif. */
  getRecord(): SessionRecord {
    this.foldElapsed();
    return {
      startedAt: this.startedAt,
      totalElapsedSeconds: Math.round(
        this.elapsedMs.reduce((sum, n) => sum + n, 0) / 1000
      ),
      wallClockSeconds: this.startedAt
        ? Math.round((Date.now() - this.startedAt.getTime()) / 1000)
        : 0,
      steps: this.steps.map((step, i) => ({
        label: step.label,
        plannedSeconds: step.seconds,
        elapsedSeconds: Math.round(this.elapsedMs[i] / 1000),
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
    this.beginStep();
    this.emit();
  }

  /** Fait courir l'horloge sur le bloc courant, sans notifier. */
  private beginStep(): void {
    this.running = true;
    this.startedAt ??= new Date();
    this.stepStartedAt = Date.now();
    this.intervalId = window.setInterval(() => this.resync(), 250);
  }

  pause(): void {
    this.stopTicking();
    this.emit();
  }

  /**
   * Recale l'état sur l'horloge et notifie. À appeler au retour en foreground
   * (`visibilitychange`) : si le temps du bloc s'est écoulé pendant l'absence,
   * le bloc se termine ici.
   */
  resync(): void {
    if (!this.running) return;
    // Un onglet caché throttle son intervalle : le retour au premier plan
    // peut trouver plusieurs blocs déjà épuisés d'un coup (un intervalle
    // entier, par exemple, maintenant qu'il s'enchaîne tout seul). On les
    // vide tous avant de notifier, pour qu'un rattrapage ne tire pas une
    // rafale de signaux — signalTransitions ne compare que l'index avant/après.
    this.foldElapsed();
    while (this.isTimed() && this.remainingSeconds() <= 0) {
      const chained = this.advance(true, { silent: true });
      if (!chained) break;
      this.foldElapsed();
    }
    this.emit();
  }

  /** Valide l'étape courante — le geste de fin d'une étape non chronométrée. */
  complete(): void {
    this.advance(true);
  }

  private isTimed(): boolean {
    return (this.steps[this.stepIndex]?.seconds ?? 0) > 0;
  }

  private stopTicking(): void {
    this.foldElapsed();
    this.running = false;
    this.stepStartedAt = null;
    window.clearInterval(this.intervalId);
  }

  /** Verse la période de course en cours dans l'accumulateur de l'étape. */
  private foldElapsed(): void {
    if (this.stepStartedAt === null || this.stepIndex >= this.steps.length) return;
    const now = Date.now();
    this.elapsedMs[this.stepIndex] += now - this.stepStartedAt;
    this.stepStartedAt = now;
  }

  private remainingSeconds(): number {
    if (this.stepIndex >= this.steps.length) return 0;
    const planned = this.steps[this.stepIndex].seconds * 1000;
    let elapsed = this.elapsedMs[this.stepIndex];
    if (this.stepStartedAt !== null) elapsed += Date.now() - this.stepStartedAt;
    return Math.max(0, Math.ceil((planned - elapsed) / 1000));
  }

  /** Passe l'étape courante : elle est enregistrée comme non terminée. */
  skip(): void {
    this.advance(false);
  }

  reset(): void {
    this.pause();
    this.awaitingReady = false;
    this.stepIndex = 0;
    this.elapsedMs = this.steps.map(() => 0);
    this.completed = this.steps.map(() => false);
    this.startedAt = null;
    this.emit();
  }

  /**
   * Clôt le bloc courant. Arme le suivant et attend le feu vert de l'usager,
   * sauf si la transition est marquée `chain` — l'entrée dans un intervalle
   * attend toujours, tout le reste de l'intervalle s'enchaîne (voir
   * `RunnableStep.chain` dans `vocab/protocol.ts`).
   *
   * `opts.silent` évite d'émettre ici : `resync()` s'en sert pour vider
   * plusieurs blocs d'affilée sans notifier à chaque pas. Renvoie vrai si le
   * bloc suivant s'est enchaîné sans attendre (donc si `resync()` doit
   * continuer à vérifier).
   */
  private advance(completed: boolean, opts: { silent?: boolean } = {}): boolean {
    this.stopTicking();
    if (this.stepIndex < this.steps.length) {
      this.completed[this.stepIndex] = completed;
    }
    this.stepIndex += 1;
    if (this.stepIndex >= this.steps.length) {
      this.awaitingReady = false;
      if (!opts.silent) this.emit();
      return false;
    }
    this.awaitingReady = !this.steps[this.stepIndex]?.chain;
    if (!this.awaitingReady) this.beginStep();
    if (!opts.silent) this.emit();
    return !this.awaitingReady;
  }

  private getState(): TimerState {
    const done = this.stepIndex >= this.steps.length;
    return {
      stepIndex: this.stepIndex,
      step: done ? null : this.steps[this.stepIndex],
      remaining: this.remainingSeconds(),
      running: this.running,
      done,
      awaitingReady: this.awaitingReady,
      timed: this.isTimed(),
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
