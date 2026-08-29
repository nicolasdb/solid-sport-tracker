/**
 * Vocabulaire provisoire de l'app, non résolvable pour l'instant (pas de
 * document JSON-LD/Turtle publié). Voir docs/data-model.md pour le schéma
 * complet en Turtle et le layout des containers sur le pod.
 */
export const ST = "https://vocab.nicolasdb.eu/sport-tracker#" as const;

export const st = {
  Carnet: `${ST}Carnet`,
  SeanceModele: `${ST}SeanceModele`,
  Bloc: `${ST}Bloc`,
  Exercice: `${ST}Exercice`,
  SeanceInstance: `${ST}SeanceInstance`,
  Preferences: `${ST}Preferences`,

  titre: `${ST}titre`,
  objectif: `${ST}objectif`,
  dateDebut: `${ST}dateDebut`,
  dateFin: `${ST}dateFin`,
  frequence: `${ST}frequence`,
  seanceModele: `${ST}seanceModele`,

  contientBloc: `${ST}contientBloc`,
  ordre: `${ST}ordre`,
  dureeSecondes: `${ST}dureeSecondes`,
  contientExercice: `${ST}contientExercice`,

  repetitions: `${ST}repetitions`,
  note: `${ST}note`,

  baseSurModele: `${ST}baseSurModele`,
  dateRealisation: `${ST}dateRealisation`,
  dureeReelleSecondes: `${ST}dureeReelleSecondes`,
  ressenti: `${ST}ressenti`,

  carnetActif: `${ST}carnetActif`,
  tenueParDefaut: `${ST}tenueParDefaut`,
  afficherTimer: `${ST}afficherTimer`,
} as const;

export interface Exercice {
  titre: string;
  repetitions?: string;
  dureeSecondes?: number;
  note?: string;
}

export interface Bloc {
  titre: string;
  ordre: number;
  dureeSecondes: number;
  exercices: Exercice[];
}

export interface SeanceModele {
  url: string;
  titre: string;
  blocs: Bloc[];
}

export interface Carnet {
  url: string;
  titre: string;
  objectif?: string;
  frequence?: string;
  seanceModeleUrl?: string;
}

export interface Preferences {
  carnetActifUrl?: string;
  tenueParDefaut?: string;
  afficherTimer: boolean;
}
