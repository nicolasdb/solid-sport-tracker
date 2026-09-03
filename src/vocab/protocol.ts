/**
 * Vocabulaire généralisé de l'app : un protocole (« recette ») est une suite
 * d'étapes typées, indépendante du domaine sportif.
 *
 * Trois niveaux distincts, et les distinguer est le point du vocabulaire :
 * - `Protocol` — le protocole lui-même, versionné, potentiellement hébergé
 *   sur un pod tiers (un kiné, un coach) ;
 * - `Logbook` — l'engagement d'une personne dans un protocole. Le carnet est
 *   l'unité de partage et la granularité d'ACL : un container par carnet ;
 * - `Session` — une exécution du protocole, consignée dans le carnet.
 *
 * Un carnet **copie** son protocole plutôt que d'y pointer : une v2 du
 * protocole casserait la correspondance entre les séances déjà consignées et
 * le protocole qu'elles suivaient. L'URI d'origine est conservée comme
 * provenance (`sourceProtocol`), pas comme lien vivant.
 *
 * Namespace non résolvable pour l'instant. Le préfixe `activity:` préfigure
 * une couche horizontale « ce qui se passe dans le temps » — une séance de
 * kiné, un atelier scolaire et une induction machine sont structurellement la
 * même chose. Voir docs/data-model.md et docs/todo-tracker-kit-dashboard.md.
 */
export const ACT = "https://vocab.nicolasdb.eu/activity#" as const;

export const act = {
  Protocol: `${ACT}Protocol`,
  Logbook: `${ACT}Logbook`,
  Session: `${ACT}Session`,

  TimedStep: `${ACT}TimedStep`,
  CountedStep: `${ACT}CountedStep`,
  IntervalStep: `${ACT}IntervalStep`,
  ChecklistStep: `${ACT}ChecklistStep`,
  RepeatStep: `${ACT}RepeatStep`,
  Phase: `${ACT}Phase`,
  StepRun: `${ACT}StepRun`,

  title: `${ACT}title`,
  goal: `${ACT}goal`,
  note: `${ACT}note`,
  cadence: `${ACT}cadence`,
  order: `${ACT}order`,

  hasStep: `${ACT}hasStep`,
  targetSeconds: `${ACT}targetSeconds`,
  targetCount: `${ACT}targetCount`,
  unit: `${ACT}unit`,
  hasPhase: `${ACT}hasPhase`,
  rounds: `${ACT}rounds`,
  times: `${ACT}times`,

  protocol: `${ACT}protocol`,
  sourceProtocol: `${ACT}sourceProtocol`,
  startedAt: `${ACT}startedAt`,
  durationSeconds: `${ACT}durationSeconds`,
  feeling: `${ACT}feeling`,
  hasRun: `${ACT}hasRun`,
  ofStep: `${ACT}ofStep`,
  completed: `${ACT}completed`,
} as const;

/** Une étape chronométrée : le minuteur signale la fin, il ne mesure pas une performance. */
export interface TimedStep {
  kind: "timed";
  url?: string;
  title: string;
  note?: string;
  targetSeconds: number;
}

/** Une étape comptée (10 squats) : validée par l'usager, pas par une horloge. */
export interface CountedStep {
  kind: "counted";
  url?: string;
  title: string;
  note?: string;
  targetCount: number;
  /** « répétitions », « pas », « respirations »… libellé affiché tel quel. */
  unit?: string;
}

/** Une phase d'intervalle : un segment du métronome. */
export interface Phase {
  title: string;
  seconds: number;
}

/**
 * Un métronome : les phases s'enchaînent, le tout répété `rounds` fois.
 * Les ratios asymétriques et évolutifs (1:1 → 2:2 → 2:5) s'expriment comme
 * des phases explicites — pas de notion de ratio dans le modèle.
 */
export interface IntervalStep {
  kind: "interval";
  url?: string;
  title: string;
  note?: string;
  phases: Phase[];
  rounds: number;
}

/** Une étape sans aucune mesure : elle est faite, ou elle ne l'est pas. */
export interface ChecklistStep {
  kind: "checklist";
  url?: string;
  title: string;
  note?: string;
  /**
   * Vrai quand la checklist est une retombée du parseur et non un
   * `act:ChecklistStep` voulu : le type RDF n'a pas été reconnu. L'étape reste
   * exécutable — mieux vaut l'afficher que la perdre — mais l'app doit le dire
   * plutôt que de faire passer une faute de frappe pour un choix.
   */
  unrecognized?: boolean;
}

/**
 * Un groupe répété. `3× [10 squats, 10 fentes, 10 push-ups]` n'est pas
 * `3×10 squats` : l'imbrication porte du sens pédagogique (rythme,
 * mémorisation), et l'aplatir le perdrait.
 */
export interface RepeatStep {
  kind: "repeat";
  url?: string;
  title: string;
  note?: string;
  times: number;
  steps: Step[];
}

export type Step =
  | TimedStep
  | CountedStep
  | IntervalStep
  | ChecklistStep
  | RepeatStep;

export interface Protocol {
  url: string;
  title: string;
  goal?: string;
  cadence?: string;
  steps: Step[];
}

export interface Logbook {
  url: string;
  title: string;
  goal?: string;
  cadence?: string;
  /** Copie locale du protocole, dans le container du carnet. */
  protocolUrl?: string;
  /** URI d'où le protocole a été copié — provenance, pas lien vivant. */
  sourceProtocolUrl?: string;
}

/** Ce qu'une étape a donné lors d'une exécution. */
export interface StepRun {
  url?: string;
  /** Étape du protocole dont ceci est l'occurrence. */
  ofStepUrl?: string;
  /** Titre recopié : le log reste lisible si le protocole est modifié après coup. */
  title: string;
  completed: boolean;
  durationSeconds: number;
}

export interface Session {
  url: string;
  protocolUrl?: string;
  startedAt?: Date;
  /** Durée murale de la séance, enregistrée même sans étape chronométrée. */
  durationSeconds: number;
  feeling?: string;
  runs: StepRun[];
}

/**
 * Étape exécutable : ce que le minuteur enchaîne réellement, une fois les
 * répétitions dépliées et les intervalles éclatés en phases. `path` retient
 * d'où elle vient (`ofStepUrl` + rang de tour), pour que le récapitulatif
 * puisse recoudre les exécutions sur les étapes du protocole.
 */
export interface RunnableStep {
  label: string;
  /** 0 pour une étape non chronométrée : elle attend une validation. */
  seconds: number;
  /** Étape du protocole dont celle-ci est une occurrence. */
  sourceStep: Step;
  /** Rang d'occurrence quand l'étape est dans un groupe répété (1-indexé). */
  round?: number;
  /**
   * Démarre sans attendre de validation quand l'étape précédente se clôt.
   *
   * L'enchaînement est une propriété de la **transition**, pas une constante du
   * minuteur : entre deux phases d'un intervalle il n'y a rien à valider, c'est
   * le même effort qui continue. Sans ça, `3 × (10 s + 20 s)` demande six taps
   * et `IntervalStep` ne se distingue plus d'un `RepeatStep` de `TimedStep`.
   *
   * Calculé ici et nulle part ailleurs : `flattenSteps` est le seul endroit qui
   * sache qu'il vient d'émettre deux phases consécutives du même intervalle.
   * C'est aussi ce qui décide du motif de bip (`endSignal` dans `main.ts`) —
   * un seul prédicat, pas deux qui dérivent.
   */
  chain?: boolean;
}

/**
 * Déplie un protocole en séquence exécutable : les `RepeatStep` sont répétés,
 * les `IntervalStep` éclatés en une étape par phase et par tour.
 */
export function flattenSteps(steps: Step[]): RunnableStep[] {
  const out: RunnableStep[] = [];

  const walk = (list: Step[], round?: number) => {
    for (const step of list) {
      const suffix = round ? ` (${round})` : "";
      switch (step.kind) {
        case "timed":
          out.push({
            label: `${step.title}${suffix}`,
            seconds: step.targetSeconds,
            sourceStep: step,
            round,
          });
          break;
        case "counted":
          out.push({
            label: `${step.title}${suffix}`,
            seconds: 0,
            sourceStep: step,
            round,
          });
          break;
        case "checklist":
          out.push({
            label: `${step.title}${suffix}`,
            seconds: 0,
            sourceStep: step,
            round,
          });
          break;
        case "interval":
          for (let r = 1; r <= step.rounds; r += 1) {
            step.phases.forEach((phase, phaseIndex) => {
              out.push({
                label: `${step.title} — ${phase.title} (${r}/${step.rounds})`,
                seconds: phase.seconds,
                sourceStep: step,
                round: r,
                // Seule l'entrée dans l'intervalle attend le feu vert. Tout le
                // reste s'enchaîne, frontière de tour comprise : un métronome
                // qu'il faut relancer à chaque tour n'est pas un métronome.
                chain: !(r === 1 && phaseIndex === 0),
              });
            });
          }
          break;
        case "repeat":
          for (let r = 1; r <= step.times; r += 1) {
            walk(step.steps, r);
          }
          break;
      }
    }
  };

  walk(steps);
  return out;
}

/**
 * Nombre d'étapes dont le type RDF n'a pas été reconnu par le parseur.
 * Sert à le dire à l'usager : une recette peut être du Turtle valide et
 * pourtant fausse, et une étape avalée en silence ne se voit nulle part.
 */
export function countUnrecognized(steps: Step[]): number {
  return steps.reduce((n, step) => {
    if (step.kind === "repeat") return n + countUnrecognized(step.steps);
    return n + (step.kind === "checklist" && step.unrecognized ? 1 : 0);
  }, 0);
}

/** Libellé de l'objectif d'une étape, pour l'affichage du programme. */
export function describeStep(step: Step): string {
  switch (step.kind) {
    case "timed":
      return `${step.targetSeconds} s`;
    case "counted":
      return `${step.targetCount}${step.unit ? ` ${step.unit}` : ""}`;
    case "interval": {
      const phases = step.phases.map((p) => `${p.seconds} s ${p.title}`).join(" + ");
      return `${step.rounds} × (${phases})`;
    }
    case "checklist":
      return "";
    case "repeat":
      return `${step.times} tours`;
  }
}
