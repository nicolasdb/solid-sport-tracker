/**
 * Langue de l'interface.
 *
 * **Elle suit l'usager, pas la recette.** Une recette rédigée en anglais
 * chargée par un francophone garde ses titres d'étapes en anglais — c'est son
 * contenu — mais les boutons restent en français. Confondre les deux mènerait
 * à une app dont la langue change au gré des carnets ouverts.
 *
 * Le dictionnaire anglais est typé `Strings`, c'est-à-dire la forme exacte du
 * français : une clé oubliée est une erreur de compilation, pas un mot français
 * qui ressort en anglais trois écrans plus loin.
 *
 * Comme le thème, c'est un réglage qui doit s'appliquer avant le premier rendu,
 * donc `localStorage`. Il décrit pourtant l'usager et non l'appareil : sa place
 * finale est le pod (`preferences.ttl`), avec ce stockage local comme cache
 * pour le temps où le pod n'est pas encore lu. Pas fait.
 */
import { shortWebId } from "./webid";

export type Lang = "fr" | "en";

const LANG_KEY = "sst:lang";

export const LANG_LABELS: Record<Lang, string> = { fr: "🇫🇷 FR", en: "🇬🇧 EN" };

const fr = {
  loginLead:
    "Connecte-toi avec l'adresse de ton pod, ou avec ton WebID si tu ne connais pas son fournisseur — il sera alors découvert depuis ton profil.",
  loginIdentifier: "Pod ou WebID",
  loginSubmit: "Se connecter",

  connectedAs: (webId: string) => `Connecté en tant que <code title="${webId}">${shortWebId(webId)}</code>.`,
  readingPod: "Lecture du pod…",
  emptyCarnetHint:
    "Le carnet attendu sur ce pod, sous <code>/sport-tracker/carnets/</code>, est peut-être encore vide — voir <code>docs/data-model.md</code> pour la structure attendue.",
  logout: "Se déconnecter",
  logoutShort: "Déconnexion",
  cancel: "Annuler",
  back: "← Retour",

  tabSeance: "Séance",
  tabHistorique: "Historique",
  carnets: "Carnets",
  draftPending: "Séance non enregistrée en attente.",
  resume: "Reprendre",
  unrecognized: (n: number) =>
    `${n} étape(s) de type non reconnu, exécutée(s) comme simple validation.`,
  cadenceLabel: "À refaire",
  noRunnableSteps: "Ce carnet n'a pas encore d'étapes exécutables.",

  newFromPicker: "Adresse d'une nouvelle recette à ouvrir en carnet.",
  newFirstCarnet:
    "Aucun carnet sur ce pod. Rien n'y a été écrit : ouvrir un carnet est la première écriture, et elle t'appartient.",
  recipeAddress: "Adresse de la recette",
  copyNote:
    "La recette est copiée dans ton carnet ; son adresse d'origine est conservée comme provenance, sans lien vivant.",
  willCreate: (container: string) =>
    `Créera <code>${container}</code> et un container par carnet en dessous.`,
  openCarnet: "Ouvrir le carnet",
  creating: "Création en cours…",

  open: "Ouvrir",
  active: "Actif",
  opening: "Ouverture…",
  newCarnet: "Nouveau carnet",
  unreadableCarnet: "(carnet illisible)",
  rename: "Renommer",
  renameSave: "Renommer",
  renameSaving: "Renommage…",
  renameCancel: "Annuler",
  createdOn: (date: string) => `Créé le ${date}`,
  technicalDetails: "Détails techniques",

  loadingHistory: "Lecture de l'historique…",
  noSeance: "Aucune séance enregistrée pour l'instant.",
  streak: (n: number) => `jour${n > 1 ? "s" : ""} d'affilée`,
  totalSeances: (n: number) => `${n} séance${n > 1 ? "s" : ""} au total`,
  reading: "Lecture…",
  seance: "Séance",
  realDuration: "Durée réelle :",
  months: [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ],
  weekdays: ["L", "M", "M", "J", "V", "S", "D"],

  timerReady: "Prêt",
  timerStart: "Démarrer",
  timerPause: "Pause",
  timerDone: "C'est fait",
  timerImReady: "Je suis prêt",
  timerReadyFor: (label: string) => `Prêt pour : ${label} ?`,
  timerFinished: "Séance terminée !",
  timerSkip: "Passer",
  timerReset: "Réinit.",
  timerFinish: "Terminer",
  stepCount: (i: number, n: number) => `Étape ${i} / ${n}`,

  optSound: "🔊 Bip",
  optHaptic: "📳 Vibration",
  optScreen: "🔆 Écran",

  recapTitle: "Séance terminée",
  recapRestored: "Séance non enregistrée, restaurée depuis ce navigateur.",
  recapSteps: "Étapes réalisées",
  recapDuration: "Durée réelle (minutes)",
  recapFeeling: "Ressenti",
  recapFeelingHint: "Fatigue, gêne, intensité…",
  recapSave: "Enregistrer sur le pod",
  recapSaving: "Enregistrement…",
  recapDiscard: "Ne pas enregistrer",
  recapKeptLocally: "La séance est gardée en local et te sera reproposée.",

  unknownResource: "ressource inconnue",
  err401: (url: string) => `Non authentifié (401) sur ${url} — session expirée, reconnecte-toi.`,
  err403: (url: string) =>
    `Accès refusé (403) sur ${url} — ton identité est reconnue mais n'a pas les droits ici. C'est le cas d'un WebID d'agent, qui ne reçoit des droits que sur les containers qu'on lui a explicitement accordés, pas à la racine du pod.`,
  errOther: (code: number | undefined, url: string) => `Échec (${code}) sur ${url}.`,

  rounds: (n: number) => `${n} tours`,
  podRootNotFound:
    "Racine du pod introuvable : ni triple pim:storage dans le profil WebID, ni en-tête Link pim:Storage sur les containers parents.",
};

export type Strings = typeof fr;

const en: Strings = {
  loginLead:
    "Sign in with your pod address, or with your WebID if you don't know its provider — it will then be discovered from your profile.",
  loginIdentifier: "Pod or WebID",
  loginSubmit: "Sign in",

  connectedAs: (webId: string) => `Signed in as <code title="${webId}">${shortWebId(webId)}</code>.`,
  readingPod: "Reading the pod…",
  emptyCarnetHint:
    "The logbook expected on this pod, under <code>/sport-tracker/carnets/</code>, may still be empty — see <code>docs/data-model.md</code> for the expected structure.",
  logout: "Sign out",
  logoutShort: "Sign out",
  cancel: "Cancel",
  back: "← Back",

  tabSeance: "Session",
  tabHistorique: "History",
  carnets: "Logbooks",
  draftPending: "Unsaved session waiting.",
  resume: "Resume",
  unrecognized: (n: number) => `${n} step(s) of an unknown type, run as a plain check-off.`,
  cadenceLabel: "Repeat",
  noRunnableSteps: "This logbook has no runnable steps yet.",

  newFromPicker: "Address of a new recipe to open as a logbook.",
  newFirstCarnet:
    "No logbook on this pod. Nothing has been written to it: opening a logbook is the first write, and it is yours.",
  recipeAddress: "Recipe address",
  copyNote:
    "The recipe is copied into your logbook; its original address is kept as provenance, with no live link.",
  willCreate: (container: string) =>
    `Will create <code>${container}</code> and one container per logbook below it.`,
  openCarnet: "Open the logbook",
  creating: "Creating…",

  open: "Open",
  active: "Active",
  opening: "Opening…",
  newCarnet: "New logbook",
  unreadableCarnet: "(unreadable logbook)",
  rename: "Rename",
  renameSave: "Rename",
  renameSaving: "Renaming…",
  renameCancel: "Cancel",
  createdOn: (date: string) => `Created on ${date}`,
  technicalDetails: "Technical details",

  loadingHistory: "Reading history…",
  noSeance: "No session recorded yet.",
  streak: (n: number) => `day${n > 1 ? "s" : ""} in a row`,
  totalSeances: (n: number) => `${n} session${n > 1 ? "s" : ""} in total`,
  reading: "Reading…",
  seance: "Session",
  realDuration: "Actual duration:",
  months: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
  weekdays: ["M", "T", "W", "T", "F", "S", "S"],

  timerReady: "Ready",
  timerStart: "Start",
  timerPause: "Pause",
  timerDone: "Done",
  timerImReady: "I'm ready",
  timerReadyFor: (label: string) => `Ready for: ${label}?`,
  timerFinished: "Session complete!",
  timerSkip: "Skip",
  timerReset: "Reset",
  timerFinish: "Finish",
  stepCount: (i: number, n: number) => `Step ${i} / ${n}`,

  optSound: "🔊 Beep",
  optHaptic: "📳 Vibration",
  optScreen: "🔆 Screen",

  recapTitle: "Session complete",
  recapRestored: "Unsaved session, restored from this browser.",
  recapSteps: "Steps done",
  recapDuration: "Actual duration (minutes)",
  recapFeeling: "How it felt",
  recapFeelingHint: "Tiredness, discomfort, intensity…",
  recapSave: "Save to the pod",
  recapSaving: "Saving…",
  recapDiscard: "Discard",
  recapKeptLocally: "The session is kept locally and will be offered again.",

  unknownResource: "unknown resource",
  err401: (url: string) => `Not authenticated (401) on ${url} — session expired, sign in again.`,
  err403: (url: string) =>
    `Access denied (403) on ${url} — your identity is recognised but has no rights here. That is the case for an agent WebID, which only gets rights on the containers explicitly granted to it, not at the pod root.`,
  errOther: (code: number | undefined, url: string) => `Failed (${code}) on ${url}.`,

  rounds: (n: number) => `${n} rounds`,
  podRootNotFound:
    "Pod root not found: no pim:storage triple in the WebID profile, and no Link pim:Storage header on the parent containers.",
};

const DICTS: Record<Lang, Strings> = { fr, en };

let current: Lang = "fr";

function browserLang(): Lang {
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function loadLang(): Lang {
  try {
    const raw = localStorage.getItem(LANG_KEY);
    return raw === "fr" || raw === "en" ? raw : browserLang();
  } catch {
    return browserLang();
  }
}

/** Pose aussi `lang` sur `<html>` : coupure de mots, correcteur, voix de synthèse. */
export function applyLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Stockage indisponible : la langue ne survit pas à la session, tant pis.
  }
}

export function nextLang(lang: Lang): Lang {
  return lang === "fr" ? "en" : "fr";
}

/** Le dictionnaire courant. Appelé au rendu, jamais gardé au-delà. */
export function t(): Strings {
  return DICTS[current];
}

/** Étiquette de date complète, dans la langue de l'interface. */
export function dateLocale(): string {
  return current === "fr" ? "fr-FR" : "en-GB";
}
