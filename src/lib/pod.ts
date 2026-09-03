import {
  getSolidDataset,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  getInteger,
  getDatetime,
  getContainedResourceUrlAll,
  getPodUrlAll,
  createContainerAt,
  createThing,
  createSolidDataset,
  buildThing,
  setThing,
  saveSolidDatasetAt,
  FetchError,
} from "@inrupt/solid-client";
import { RDF } from "@inrupt/vocab-common-rdf";
import { authFetch as fetch } from "./auth";
import { readLiteral } from "./literal";
import { t } from "./i18n";
import {
  st,
  type Bloc,
  type BlocRealise,
  type Carnet,
  type Exercice,
  type Preferences,
  type SeanceInstance,
  type SeanceModele,
} from "../vocab/carnet";

const STORAGE_TYPE = "http://www.w3.org/ns/pim/space#Storage";

/** Vrai si l'en-tête Link annonce `rel="type"` vers pim:Storage. */
function advertisesStorageType(linkHeader: string | null): boolean {
  if (!linkHeader) return false;
  const entries = linkHeader.match(/<[^>]*>[^,]*/g) ?? [];
  return entries.some((entry) => {
    const target = entry.match(/^<([^>]*)>/)?.[1];
    return target === STORAGE_TYPE && /rel\s*=\s*"?type"?/i.test(entry);
  });
}

/**
 * Découverte de la racine du pod par remontée de la hiérarchie d'URI, comme
 * décrit par le protocole Solid : le serveur DOIT annoncer la racine avec un
 * en-tête `Link: <pim:Storage>; rel="type"`. Le premier ancêtre qui l'annonce
 * est la racine — il ne faut pas continuer plus haut, un CSS multi-pods
 * annonce aussi sa propre racine serveur, qui n'est pas le pod de l'usager.
 */
async function findStorageByLinkHeaders(startUrl: string): Promise<string | null> {
  const start = new URL(startUrl);
  start.hash = "";
  start.search = "";

  const candidates = [start.toString()];
  let path = start.pathname;
  while (path !== "/") {
    path = path.replace(/[^/]*\/?$/, "");
    candidates.push(new URL(path, start.origin).toString());
  }

  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok && advertisesStorageType(res.headers.get("link"))) return url;
    } catch {
      // Ancêtre inaccessible : on continue de remonter.
    }
  }
  return null;
}

/**
 * Racine du pod, en deux temps :
 * 1. le triple `pim:storage` du profil WebID (voie canonique) ;
 * 2. à défaut, la remontée par en-têtes Link — nécessaire pour les pods créés
 *    par un serveur antérieur à l'écriture automatique de `pim:storage`, dont
 *    le profil ne porte pas le triple.
 */
export async function getPrimaryPodUrl(webId: string): Promise<string> {
  try {
    const pods = await getPodUrlAll(webId, { fetch });
    if (pods.length > 0) return pods[0];
  } catch {
    // Profil illisible ou sans triple : on tente la découverte par en-têtes.
  }

  const storage = await findStorageByLinkHeaders(webId);
  if (storage) return storage;

  throw new Error(t().podRootNotFound);
}

export function trackerContainer(podUrl: string): string {
  return new URL("sport-tracker/", podUrl).toString();
}

export function carnetsContainer(podUrl: string): string {
  return new URL("sport-tracker/carnets/", podUrl).toString();
}

export function preferencesUrl(podUrl: string): string {
  return new URL("sport-tracker/preferences.ttl", podUrl).toString();
}

/**
 * Liste les URLs des containers de carnets présents sous /sport-tracker/carnets/.
 * Container absent = pod sur lequel le tracker n'a jamais rien écrit, ce qui
 * est un état normal et pas une erreur : c'est justement l'état d'un pod qu'on
 * ne veut pas modifier avant que l'usager l'ait demandé.
 */
export async function listCarnetUrls(podUrl: string): Promise<string[]> {
  const container = carnetsContainer(podUrl);
  try {
    const dataset = await getSolidDataset(container, { fetch });
    return getContainedResourceUrlAll(dataset);
  } catch (err) {
    if (err instanceof FetchError && err.statusCode === 404) return [];
    throw err;
  }
}

/** Lit la fiche d'un carnet (carnet.ttl) à l'intérieur d'un container de carnet. */
export async function readCarnet(carnetContainerUrl: string): Promise<Carnet> {
  const carnetDocUrl = new URL("carnet.ttl", carnetContainerUrl).toString();
  const dataset = await getSolidDataset(carnetDocUrl, { fetch });
  const subject = `${carnetDocUrl}#it`;
  const thing = getThing(dataset, subject);
  if (!thing) {
    throw new Error(`Carnet introuvable: ${carnetDocUrl}`);
  }
  return {
    url: carnetContainerUrl,
    titre: readLiteral(thing, st.titre) ?? "(sans titre)",
    objectif: readLiteral(thing, st.objectif) ?? undefined,
    frequence: readLiteral(thing, st.frequence) ?? undefined,
    seanceModeleUrl: getUrl(thing, st.seanceModele) ?? undefined,
  };
}

/** Lit le modèle de séance (blocs + exercices) référencé par un carnet. */
export async function readSeanceModele(modeleUrl: string): Promise<SeanceModele> {
  const docUrl = modeleUrl.split("#")[0];
  const dataset = await getSolidDataset(docUrl, { fetch });
  const root = getThing(dataset, modeleUrl);
  if (!root) {
    throw new Error(`Modèle de séance introuvable: ${modeleUrl}`);
  }

  const blocUrls = getThingAll(dataset)
    .filter((t) => getUrl(t, "http://www.w3.org/1999/02/22-rdf-syntax-ns#type") === st.Bloc)
    .map((t) => t.url);

  const blocs: Bloc[] = blocUrls
    .map((blocUrl) => {
      const blocThing = getThing(dataset, blocUrl);
      if (!blocThing) return null;

      const exercices: Exercice[] = getUrlAll(blocThing, st.contientExercice)
        .map((exUrl) => getThing(dataset, exUrl))
        .filter((t): t is NonNullable<typeof t> => t !== null)
        .map((t) => ({
          titre: readLiteral(t, st.titre) ?? "(sans titre)",
          repetitions: readLiteral(t, st.repetitions) ?? undefined,
          dureeSecondes: getInteger(t, st.dureeSecondes) ?? undefined,
          note: readLiteral(t, st.note) ?? undefined,
        }));

      return {
        url: blocUrl,
        titre: readLiteral(blocThing, st.titre) ?? "(sans titre)",
        ordre: getInteger(blocThing, st.ordre) ?? 0,
        dureeSecondes: getInteger(blocThing, st.dureeSecondes) ?? 0,
        exercices,
      } satisfies Bloc;
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => a.ordre - b.ordre);

  return {
    url: modeleUrl,
    titre: readLiteral(root, st.titre) ?? "(sans titre)",
    blocs,
  };
}

export async function readPreferences(podUrl: string): Promise<Preferences> {
  const url = preferencesUrl(podUrl);
  let dataset;
  try {
    dataset = await getSolidDataset(url, { fetch });
  } catch (err) {
    if (err instanceof FetchError && err.statusCode === 404) {
      return { afficherTimer: true };
    }
    throw err;
  }
  const thing = getThing(dataset, `${url}#it`);
  if (!thing) {
    return { afficherTimer: true };
  }
  return {
    carnetActifUrl: getUrl(thing, st.carnetActif) ?? undefined,
    tenueParDefaut: readLiteral(thing, st.tenueParDefaut) ?? undefined,
    afficherTimer: getInteger(thing, st.afficherTimer) !== 0,
  };
}

/**
 * Fixe le carnet actif dans preferences.ttl. Première écriture explicite de ce
 * document — il ne fait pas partie du scaffold (voir `ensureTrackerScaffold`) :
 * un document de préférences vide n'a pas de raison d'exister avant que
 * l'usager n'ait un choix à faire entre plusieurs carnets.
 */
export async function setActiveCarnet(podUrl: string, carnetUrl: string): Promise<void> {
  const url = preferencesUrl(podUrl);
  let dataset;
  try {
    dataset = await getSolidDataset(url, { fetch });
  } catch (err) {
    if (err instanceof FetchError && err.statusCode === 404) {
      dataset = createSolidDataset();
    } else {
      throw err;
    }
  }
  const existing = getThing(dataset, `${url}#it`);
  const thing = buildThing(existing ?? createThing({ url: `${url}#it` }))
    .addUrl(RDF.type, st.Preferences)
    .setUrl(st.carnetActif, carnetUrl)
    .build();
  await saveSolidDatasetAt(url, setThing(dataset, thing), { fetch });
}

async function ensureContainer(url: string): Promise<void> {
  try {
    await getSolidDataset(url, { fetch });
  } catch (err) {
    if (err instanceof FetchError && err.statusCode === 404) {
      await createContainerAt(url, { fetch });
      return;
    }
    throw err;
  }
}

/**
 * Crée /sport-tracker/ et /sport-tracker/carnets/ s'ils n'existent pas encore.
 * Idempotent — ne touche à rien si déjà en place.
 *
 * **À n'appeler que depuis une action explicite de l'usager**, jamais au
 * login : se connecter à un pod ne doit rien y écrire. `preferences.ttl` n'en
 * fait volontairement pas partie — `readPreferences` sait vivre sans, et un
 * document de préférences vides n'a aucune raison d'exister avant qu'une
 * préférence soit posée.
 *
 * Ne gère pas les ACL : les ressources créées héritent du contrôle d'accès
 * du container parent le plus proche (privé par défaut sur un pod perso).
 */
export async function ensureTrackerScaffold(podUrl: string): Promise<void> {
  await ensureContainer(trackerContainer(podUrl));
  await ensureContainer(carnetsContainer(podUrl));
}

function slugify(titre: string): string {
  const slug = titre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "carnet";
}

export interface NewCarnet {
  titre: string;
  objectif?: string;
  frequence?: string;
  modele: Pick<SeanceModele, "titre" | "blocs">;
}

function buildModeleDataset(modeleDocUrl: string, modele: NewCarnet["modele"]) {
  let dataset = createSolidDataset();
  const blocUrls: string[] = [];

  modele.blocs.forEach((bloc, blocIdx) => {
    const blocUrl = `${modeleDocUrl}#bloc-${blocIdx}`;
    blocUrls.push(blocUrl);
    const exerciceUrls: string[] = [];

    bloc.exercices.forEach((ex, exIdx) => {
      const exUrl = `${modeleDocUrl}#bloc-${blocIdx}-ex-${exIdx}`;
      exerciceUrls.push(exUrl);
      let exBuilder = buildThing(createThing({ url: exUrl }))
        .addUrl(RDF.type, st.Exercice)
        .setStringNoLocale(st.titre, ex.titre);
      if (ex.repetitions) exBuilder = exBuilder.setStringNoLocale(st.repetitions, ex.repetitions);
      if (ex.dureeSecondes) exBuilder = exBuilder.setInteger(st.dureeSecondes, ex.dureeSecondes);
      if (ex.note) exBuilder = exBuilder.setStringNoLocale(st.note, ex.note);
      dataset = setThing(dataset, exBuilder.build());
    });

    let blocBuilder = buildThing(createThing({ url: blocUrl }))
      .addUrl(RDF.type, st.Bloc)
      .setStringNoLocale(st.titre, bloc.titre)
      .setInteger(st.ordre, bloc.ordre)
      .setInteger(st.dureeSecondes, bloc.dureeSecondes);
    exerciceUrls.forEach((exUrl) => {
      blocBuilder = blocBuilder.addUrl(st.contientExercice, exUrl);
    });
    dataset = setThing(dataset, blocBuilder.build());
  });

  let seanceBuilder = buildThing(createThing({ url: `${modeleDocUrl}#seance` }))
    .addUrl(RDF.type, st.SeanceModele)
    .setStringNoLocale(st.titre, modele.titre);
  blocUrls.forEach((blocUrl) => {
    seanceBuilder = seanceBuilder.addUrl(st.contientBloc, blocUrl);
  });
  dataset = setThing(dataset, seanceBuilder.build());

  return dataset;
}

/**
 * Crée un nouveau carnet (container + carnet.ttl + modele.ttl) sur le pod.
 * Crée aussi le scaffold /sport-tracker/ s'il n'existe pas encore.
 * Retourne l'URL du container du carnet créé.
 */
export async function createCarnet(podUrl: string, input: NewCarnet): Promise<string> {
  await ensureTrackerScaffold(podUrl);

  const slug = `${slugify(input.titre)}-${Date.now().toString(36)}`;
  const carnetContainerUrl = new URL(`${slug}/`, carnetsContainer(podUrl)).toString();
  await createContainerAt(carnetContainerUrl, { fetch });

  const modeleDocUrl = new URL("modele.ttl", carnetContainerUrl).toString();
  await saveSolidDatasetAt(modeleDocUrl, buildModeleDataset(modeleDocUrl, input.modele), { fetch });

  const carnetDocUrl = new URL("carnet.ttl", carnetContainerUrl).toString();
  let carnetBuilder = buildThing(createThing({ url: `${carnetDocUrl}#it` }))
    .addUrl(RDF.type, st.Carnet)
    .setStringNoLocale(st.titre, input.titre)
    .setUrl(st.seanceModele, `${modeleDocUrl}#seance`);
  if (input.objectif) carnetBuilder = carnetBuilder.setStringNoLocale(st.objectif, input.objectif);
  if (input.frequence) carnetBuilder = carnetBuilder.setStringNoLocale(st.frequence, input.frequence);
  await saveSolidDatasetAt(carnetDocUrl, setThing(createSolidDataset(), carnetBuilder.build()), { fetch });

  return carnetContainerUrl;
}

/**
 * Vrai si l'échec vient de l'authentification plutôt que de la ressource.
 * Sur un pod privé, un jeton expiré fait répondre 401 à *tout*, y compris aux
 * sondes d'existence — l'erreur brute renvoyée est alors trompeuse.
 */
export function isAuthError(err: unknown): boolean {
  return err instanceof FetchError && (err.statusCode === 401 || err.statusCode === 403);
}

/**
 * Message court mais diagnostiquable : le graphe d'erreur renvoyé par le
 * serveur est illisible, mais l'URL et le code, eux, sont indispensables pour
 * savoir *quelle* ressource a refusé l'accès.
 */
export function describePodError(err: unknown): string {
  if (!(err instanceof FetchError)) {
    return err instanceof Error ? err.message : String(err);
  }
  const url = err.message.match(/at \[([^\]]+)\]/)?.[1] ?? t().unknownResource;
  // 401 et 403 n'ont pas le même remède : un 401 dit « je ne sais pas qui tu
  // es » (jeton expiré, il faut se reconnecter), un 403 dit « je sais qui tu
  // es et c'est non » — se reconnecter n'y changera rien. Les confondre envoie
  // chercher une session expirée là où il manque une autorisation.
  if (err.statusCode === 401) {
    return t().err401(url);
  }
  if (err.statusCode === 403) {
    return t().err403(url);
  }
  return t().errOther(err.statusCode, url);
}

export function seancesContainer(carnetContainerUrl: string): string {
  return new URL("seances/", carnetContainerUrl).toString();
}

export interface BlocRealiseInput {
  /** URL du st:Bloc du modèle dont ce bloc réalisé est l'occurrence. */
  blocUrl?: string;
  titre: string;
  complete: boolean;
  dureeReelleSecondes: number;
}

export interface NewSeanceLog {
  modeleUrl: string;
  dateRealisation: Date;
  dureeReelleSecondes: number;
  ressenti?: string;
  blocs: BlocRealiseInput[];
}

/** `2026-08-29` — nom de fichier par défaut d'une séance, en heure locale. */
function isoDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function exists(url: string): Promise<boolean> {
  try {
    await getSolidDataset(url, { fetch });
    return true;
  } catch (err) {
    if (err instanceof FetchError && err.statusCode === 404) return false;
    throw err;
  }
}

/**
 * Écrit le log d'une séance réalisée sous `<carnet>/seances/`. Un seul write,
 * en fin de séance : des écritures incrémentales en cours d'effort exposeraient
 * à des enregistrements partiels au moindre incident réseau.
 * Nommé `<date>.ttl`, suffixé de l'heure si la journée a déjà une séance.
 */
export async function logSeance(carnetContainerUrl: string, log: NewSeanceLog): Promise<string> {
  const container = seancesContainer(carnetContainerUrl);
  await ensureContainer(container);

  const day = isoDate(log.dateRealisation);
  let docUrl = new URL(`${day}.ttl`, container).toString();
  if (await exists(docUrl)) {
    const time = log.dateRealisation.toTimeString().slice(0, 8).replace(/:/g, "");
    docUrl = new URL(`${day}-${time}.ttl`, container).toString();
  }

  let dataset = createSolidDataset();
  const blocUrls: string[] = [];

  log.blocs.forEach((bloc, i) => {
    const url = `${docUrl}#bloc-${i}`;
    blocUrls.push(url);
    let builder = buildThing(createThing({ url }))
      .addUrl(RDF.type, st.BlocRealise)
      .setStringNoLocale(st.titre, bloc.titre)
      // Booléen encodé en 0/1, même convention que st:afficherTimer.
      .setInteger(st.complete, bloc.complete ? 1 : 0)
      .setInteger(st.dureeReelleSecondes, bloc.dureeReelleSecondes);
    if (bloc.blocUrl) builder = builder.setUrl(st.baseSurBloc, bloc.blocUrl);
    dataset = setThing(dataset, builder.build());
  });

  let seance = buildThing(createThing({ url: `${docUrl}#it` }))
    .addUrl(RDF.type, st.SeanceInstance)
    .setUrl(st.baseSurModele, log.modeleUrl)
    .setDatetime(st.dateRealisation, log.dateRealisation)
    .setInteger(st.dureeReelleSecondes, log.dureeReelleSecondes);
  if (log.ressenti) seance = seance.setStringNoLocale(st.ressenti, log.ressenti);
  blocUrls.forEach((url) => {
    seance = seance.addUrl(st.blocRealise, url);
  });
  dataset = setThing(dataset, seance.build());

  await saveSolidDatasetAt(docUrl, dataset, { fetch });
  return docUrl;
}

/**
 * URLs des séances loguées, en une seule requête (listing du container).
 * Container absent = aucune séance encore enregistrée, pas une erreur.
 */
export async function listTurtleUrls(containerUrl: string): Promise<string[]> {
  try {
    const dataset = await getSolidDataset(containerUrl, { fetch });
    return getContainedResourceUrlAll(dataset).filter((url) => url.endsWith(".ttl"));
  } catch (err) {
    if (err instanceof FetchError && err.statusCode === 404) return [];
    throw err;
  }
}

export function listSeanceUrls(carnetContainerUrl: string): Promise<string[]> {
  return listTurtleUrls(seancesContainer(carnetContainerUrl));
}

/**
 * Jour d'une séance déduit de son nom de fichier (`2026-08-29.ttl`), ce qui
 * évite de télécharger le document. C'est un *indice* : le nom peut être
 * suffixé de l'heure, et seul `st:dateRealisation` fait foi une fois le
 * document ouvert.
 */
export function seanceDayFromUrl(url: string): string | null {
  return url.split("/").pop()?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

function blocFragmentIndex(url: string): number {
  return Number(url.match(/#bloc-(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

export async function readSeance(docUrl: string): Promise<SeanceInstance> {
  const dataset = await getSolidDataset(docUrl, { fetch });
  const root = getThing(dataset, `${docUrl}#it`);
  if (!root) {
    throw new Error(`Séance introuvable: ${docUrl}`);
  }

  const blocs: BlocRealise[] = getUrlAll(root, st.blocRealise)
    .map((url) => {
      const thing = getThing(dataset, url);
      if (!thing) return null;
      return {
        url,
        baseSurBlocUrl: getUrl(thing, st.baseSurBloc) ?? undefined,
        titre: readLiteral(thing, st.titre) ?? "(sans titre)",
        complete: getInteger(thing, st.complete) === 1,
        dureeReelleSecondes: getInteger(thing, st.dureeReelleSecondes) ?? 0,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    // L'ordre des objets d'un prédicat n'est pas garanti : on retrouve celui
    // de la séance via l'index encodé dans le fragment (#bloc-0, #bloc-1…).
    .sort((a, b) => blocFragmentIndex(a.url) - blocFragmentIndex(b.url));

  return {
    url: docUrl,
    modeleUrl: getUrl(root, st.baseSurModele) ?? undefined,
    dateRealisation: getDatetime(root, st.dateRealisation) ?? undefined,
    dureeReelleSecondes: getInteger(root, st.dureeReelleSecondes) ?? 0,
    ressenti: readLiteral(root, st.ressenti) ?? undefined,
    blocs,
  };
}
