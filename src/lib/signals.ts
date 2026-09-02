/**
 * Retours sonores et haptiques pendant une séance.
 *
 * Le point : pouvoir suivre le déroulé **sans regarder l'écran**. Un
 * métronome qu'il faut lire ne sert à rien en courant, et le bip seul est
 * inaudible avec un casque sur les oreilles.
 *
 * Les deux canaux sont indépendants parce que les contextes le sont : en
 * yoga collectif on veut la vibration sans le son, en courant l'inverse, et
 * un cours peut vouloir le métronome visuel seul.
 *
 * Contraintes des deux API :
 * - `navigator.vibrate` n'existe pas sur iOS Safari, et ne déclenche rien
 *   quand la page est cachée (d'où l'intérêt du verrou d'écran).
 * - un `AudioContext` créé hors d'un geste utilisateur démarre suspendu :
 *   `arm()` doit être appelé depuis le handler du tap « Démarrer ».
 * Dans les deux cas l'absence de support est silencieuse : on ne bloque pas
 * une séance pour un bip.
 */

/**
 * Les événements qui méritent un signal. La table de motifs ci-dessous est
 * volontairement le seul endroit à toucher pour affiner le vocabulaire
 * haptique — à terme, un motif par type d'étape.
 */
export type SignalKind =
  | "tick" // décompte des dernières secondes
  | "phase" // fin d'une phase d'intervalle, le tour continue
  | "step" // fin d'une étape
  | "session"; // fin de séance

interface SignalPattern {
  /** Fréquences successives, en Hz. */
  tones: number[];
  /** Durée d'un bip, en ms. */
  toneMs: number;
  /** Motif passé à `navigator.vibrate` : [vibre, pause, vibre, …]. */
  vibration: number[];
}

/**
 * Motifs distinguables à l'oreille et au poignet sans les compter : un signal
 * qu'il faut analyser vaut un signal manqué.
 */
const PATTERNS: Record<SignalKind, SignalPattern> = {
  tick: { tones: [880], toneMs: 60, vibration: [40] },
  phase: { tones: [1320], toneMs: 110, vibration: [110] },
  step: { tones: [660, 990], toneMs: 130, vibration: [140, 90, 140] },
  session: { tones: [660, 880, 1320], toneMs: 160, vibration: [200, 120, 200, 120, 320] },
};

export interface SignalPrefs {
  sound: boolean;
  haptic: boolean;
}

export class SessionSignals {
  private ctx: AudioContext | null = null;
  private prefs: SignalPrefs;

  constructor(prefs: SignalPrefs) {
    this.prefs = prefs;
  }

  setPrefs(prefs: SignalPrefs): void {
    this.prefs = prefs;
  }

  get hapticSupported(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  }

  /** À appeler depuis un geste utilisateur : sans ça l'audio reste suspendu. */
  arm(): void {
    if (!this.prefs.sound) return;
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  emit(kind: SignalKind): void {
    const pattern = PATTERNS[kind];
    if (this.prefs.haptic && this.hapticSupported) {
      navigator.vibrate(pattern.vibration);
    }
    if (this.prefs.sound) this.beep(pattern);
  }

  private beep(pattern: SignalPattern): void {
    if (!this.ctx) this.arm();
    const ctx = this.ctx;
    if (!ctx) return;

    pattern.tones.forEach((frequency, index) => {
      const start = ctx.currentTime + (index * pattern.toneMs) / 1000;
      const end = start + pattern.toneMs / 1000;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = frequency;
      // Une enveloppe, sinon le début et la fin du bip claquent.
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.01);
      gain.gain.linearRampToValueAtTime(0, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
  }
}
