import {
  getSolidDataset,
  getThing,
  getThingAll,
  getStringNoLocale,
  getUrl,
  getUrlAll,
  getInteger,
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
import { st, type Bloc, type Carnet, type Exercice, type Preferences, type SeanceModele } from "../vocab/carnet";

/** Racine du pod déclarée dans le profil WebID (pim:storage). */
export async function getPrimaryPodUrl(webId: string): Promise<string> {
  const pods = await getPodUrlAll(webId, { fetch });
  if (pods.length === 0) {
    throw new Error("Aucun pod (pim:storage) déclaré dans ce profil WebID.");
  }
  return pods[0];
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

/** Liste les URLs des containers de carnets présents sous /sport-tracker/carnets/. */
export async function listCarnetUrls(podUrl: string): Promise<string[]> {
  const container = carnetsContainer(podUrl);
  const dataset = await getSolidDataset(container, { fetch });
  return getContainedResourceUrlAll(dataset);
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
    titre: getStringNoLocale(thing, st.titre) ?? "(sans titre)",
    objectif: getStringNoLocale(thing, st.objectif) ?? undefined,
    frequence: getStringNoLocale(thing, st.frequence) ?? undefined,
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
          titre: getStringNoLocale(t, st.titre) ?? "(sans titre)",
          repetitions: getStringNoLocale(t, st.repetitions) ?? undefined,
          dureeSecondes: getInteger(t, st.dureeSecondes) ?? undefined,
          note: getStringNoLocale(t, st.note) ?? undefined,
        }));

      return {
        titre: getStringNoLocale(blocThing, st.titre) ?? "(sans titre)",
        ordre: getInteger(blocThing, st.ordre) ?? 0,
        dureeSecondes: getInteger(blocThing, st.dureeSecondes) ?? 0,
        exercices,
      } satisfies Bloc;
    })
    .filter((b): b is Bloc => b !== null)
    .sort((a, b) => a.ordre - b.ordre);

  return {
    url: modeleUrl,
    titre: getStringNoLocale(root, st.titre) ?? "(sans titre)",
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
    tenueParDefaut: getStringNoLocale(thing, st.tenueParDefaut) ?? undefined,
    afficherTimer: getInteger(thing, st.afficherTimer) !== 0,
  };
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

async function ensurePreferences(podUrl: string): Promise<void> {
  const url = preferencesUrl(podUrl);
  try {
    await getSolidDataset(url, { fetch });
  } catch (err) {
    if (!(err instanceof FetchError) || err.statusCode !== 404) throw err;
    const thing = buildThing(createThing({ url: `${url}#it` }))
      .addUrl(RDF.type, st.Preferences)
      .setInteger(st.afficherTimer, 1)
      .build();
    await saveSolidDatasetAt(url, setThing(createSolidDataset(), thing), { fetch });
  }
}

/**
 * Crée /sport-tracker/, /sport-tracker/carnets/ et preferences.ttl s'ils
 * n'existent pas encore. Idempotent — ne touche à rien si déjà en place.
 * Ne gère pas les ACL : les ressources créées héritent du contrôle d'accès
 * du container parent le plus proche (privé par défaut sur un pod perso).
 */
export async function ensureTrackerScaffold(podUrl: string): Promise<void> {
  await ensureContainer(trackerContainer(podUrl));
  await ensureContainer(carnetsContainer(podUrl));
  await ensurePreferences(podUrl);
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
