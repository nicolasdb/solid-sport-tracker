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
} from "@inrupt/solid-client";
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
  const dataset = await getSolidDataset(url, { fetch });
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
