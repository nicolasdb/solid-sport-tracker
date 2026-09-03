import {
  createContainerAt,
  createSolidDataset,
  createThing,
  buildThing,
  getDatetime,
  getInteger,
  getSolidDataset,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  responseToSolidDataset,
  saveSolidDatasetAt,
  setThing,
  type SolidDataset,
  type Thing,
} from "@inrupt/solid-client";
import { RDF } from "@inrupt/vocab-common-rdf";
import { authFetch } from "./auth";
import { readLiteral } from "./literal";
import { carnetsContainer, ensureTrackerScaffold } from "./pod";
import {
  act,
  type Logbook,
  type Phase,
  type Session,
  type Step,
  type StepRun,
  type Protocol,
} from "../vocab/protocol";

const RDF_TYPE = RDF.type;

/**
 * Charge un protocole depuis n'importe quelle URI — pod local, pod d'un tiers,
 * ou simple fichier statique. C'est le chemin de découverte réel : une recette
 * vient d'une adresse, pas du code de l'app.
 *
 * Deux raisons de ne pas passer par `getSolidDataset` : la ressource peut être
 * publique (auth inutile, et un jeton expiré ne doit pas faire échouer une
 * lecture anonyme), et un serveur statique sert volontiers un `.ttl` en
 * `application/octet-stream`, ce qui ferait échouer le parsing sur le
 * content-type. On force donc `text/turtle` avant de parser.
 */
export async function fetchProtocolDataset(uri: string): Promise<SolidDataset> {
  const docUrl = uri.split("#")[0];

  let response: Response;
  try {
    response = await authFetch(docUrl);
    if (response.status === 401 || response.status === 403) {
      response = await fetch(docUrl);
    }
  } catch {
    response = await fetch(docUrl);
  }
  if (!response.ok) {
    throw new Error(`Recette illisible (${response.status}) : ${docUrl}`);
  }

  const turtle = await response.text();
  const retyped = new Response(turtle, {
    status: 200,
    headers: { "content-type": "text/turtle" },
  });
  // responseToSolidDataset lit l'URL de la réponse pour résoudre les IRIs
  // relatives ; une Response construite à la main n'en a pas.
  Object.defineProperty(retyped, "url", { value: docUrl });
  return responseToSolidDataset(retyped);
}

function orderOf(thing: Thing): number {
  return getInteger(thing, act.order) ?? 0;
}

function readPhases(dataset: SolidDataset, stepThing: Thing): Phase[] {
  return getUrlAll(stepThing, act.hasPhase)
    .map((url) => getThing(dataset, url))
    .filter((t): t is Thing => t !== null)
    .sort((a, b) => orderOf(a) - orderOf(b))
    .map((t) => ({
      title: readLiteral(t, act.title) ?? "",
      seconds: getInteger(t, act.targetSeconds) ?? 0,
    }));
}

function readStep(dataset: SolidDataset, url: string): Step | null {
  const thing = getThing(dataset, url);
  if (!thing) return null;

  const types = getUrlAll(thing, RDF_TYPE);
  const title = readLiteral(thing, act.title) ?? "(sans titre)";
  const note = readLiteral(thing, act.note) ?? undefined;
  const common = { url, title, note };

  if (types.includes(act.RepeatStep)) {
    return {
      kind: "repeat",
      ...common,
      times: getInteger(thing, act.times) ?? 1,
      steps: readSteps(dataset, thing),
    };
  }
  if (types.includes(act.IntervalStep)) {
    return {
      kind: "interval",
      ...common,
      phases: readPhases(dataset, thing),
      rounds: getInteger(thing, act.rounds) ?? 1,
    };
  }
  if (types.includes(act.CountedStep)) {
    return {
      kind: "counted",
      ...common,
      targetCount: getInteger(thing, act.targetCount) ?? 0,
      unit: readLiteral(thing, act.unit) ?? undefined,
    };
  }
  if (types.includes(act.TimedStep)) {
    return {
      kind: "timed",
      ...common,
      targetSeconds: getInteger(thing, act.targetSeconds) ?? 0,
    };
  }
  if (types.includes(act.ChecklistStep)) {
    return { kind: "checklist", ...common };
  }
  // Type inconnu : on ne devine pas, mais une étape sans mesure reste
  // exécutable — mieux vaut l'afficher que perdre une étape du protocole.
  // Marquée `unrecognized` pour que l'app le dise plutôt que de faire passer
  // une faute de frappe (ou un act:RecordStep pas encore posé) pour une
  // checklist voulue.
  console.warn("[sport-tracker] type d'étape non reconnu", url, types);
  return { kind: "checklist", ...common, unrecognized: true };
}

/** Étapes d'un conteneur (protocole ou groupe répété), triées par act:order. */
function readSteps(dataset: SolidDataset, parent: Thing): Step[] {
  return getUrlAll(parent, act.hasStep)
    .map((url) => ({ url, thing: getThing(dataset, url) }))
    .filter((e): e is { url: string; thing: Thing } => e.thing !== null)
    .sort((a, b) => orderOf(a.thing) - orderOf(b.thing))
    .map((e) => readStep(dataset, e.url))
    .filter((s): s is Step => s !== null);
}

/** Sujet du protocole dans un document : `#it` par convention, sinon le premier trouvé. */
function findProtocolThing(dataset: SolidDataset, docUrl: string): Thing | null {
  return (
    getThing(dataset, `${docUrl}#it`) ??
    getThingAll(dataset).find((t) => getUrlAll(t, RDF_TYPE).includes(act.Protocol)) ??
    null
  );
}

export async function readProtocol(uri: string): Promise<Protocol> {
  const docUrl = uri.split("#")[0];
  const dataset = await fetchProtocolDataset(uri);
  const root = uri.includes("#")
    ? getThing(dataset, uri)
    : findProtocolThing(dataset, docUrl);
  if (!root) {
    throw new Error(`Aucun act:Protocol trouvé dans ${docUrl}`);
  }
  return {
    url: root.url,
    title: readLiteral(root, act.title) ?? "(sans titre)",
    goal: readLiteral(root, act.goal) ?? undefined,
    cadence: readLiteral(root, act.cadence) ?? undefined,
    steps: readSteps(dataset, root),
  };
}

/**
 * Sérialise un protocole dans un document. Les fragments sont positionnels
 * (`#step-0-1`) : les slugs d'origine ne sont pas forcément uniques une fois
 * la recette copiée, et un chemin positionnel est stable pour une copie donnée.
 */
function buildProtocolDataset(docUrl: string, protocol: Protocol): SolidDataset {
  let dataset = createSolidDataset();

  const writeSteps = (steps: Step[], prefix: string): string[] => {
    const urls: string[] = [];
    steps.forEach((step, index) => {
      const url = `${docUrl}#${prefix}${index}`;
      urls.push(url);

      let builder = buildThing(createThing({ url }))
        .setStringNoLocale(act.title, step.title)
        .setInteger(act.order, index + 1);
      if (step.note) builder = builder.setStringNoLocale(act.note, step.note);

      switch (step.kind) {
        case "timed":
          builder = builder
            .addUrl(RDF_TYPE, act.TimedStep)
            .setInteger(act.targetSeconds, step.targetSeconds);
          break;
        case "counted":
          builder = builder
            .addUrl(RDF_TYPE, act.CountedStep)
            .setInteger(act.targetCount, step.targetCount);
          if (step.unit) builder = builder.setStringNoLocale(act.unit, step.unit);
          break;
        case "checklist":
          builder = builder.addUrl(RDF_TYPE, act.ChecklistStep);
          break;
        case "interval": {
          builder = builder
            .addUrl(RDF_TYPE, act.IntervalStep)
            .setInteger(act.rounds, step.rounds);
          step.phases.forEach((phase, phaseIdx) => {
            const phaseUrl = `${url}-phase-${phaseIdx}`;
            dataset = setThing(
              dataset,
              buildThing(createThing({ url: phaseUrl }))
                .addUrl(RDF_TYPE, act.Phase)
                .setStringNoLocale(act.title, phase.title)
                .setInteger(act.targetSeconds, phase.seconds)
                .setInteger(act.order, phaseIdx + 1)
                .build()
            );
            builder = builder.addUrl(act.hasPhase, phaseUrl);
          });
          break;
        }
        case "repeat": {
          builder = builder.addUrl(RDF_TYPE, act.RepeatStep).setInteger(act.times, step.times);
          // Écrit les enfants d'abord : ils doivent exister avant d'être liés.
          const childUrls = writeSteps(step.steps, `${prefix}${index}-`);
          childUrls.forEach((childUrl) => {
            builder = builder.addUrl(act.hasStep, childUrl);
          });
          break;
        }
      }

      dataset = setThing(dataset, builder.build());
    });
    return urls;
  };

  const stepUrls = writeSteps(protocol.steps, "step-");

  let root = buildThing(createThing({ url: `${docUrl}#it` }))
    .addUrl(RDF_TYPE, act.Protocol)
    .setStringNoLocale(act.title, protocol.title);
  if (protocol.goal) root = root.setStringNoLocale(act.goal, protocol.goal);
  if (protocol.cadence) root = root.setStringNoLocale(act.cadence, protocol.cadence);
  stepUrls.forEach((url) => {
    root = root.addUrl(act.hasStep, url);
  });

  return setThing(dataset, root.build());
}

function slugify(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "carnet";
}

/**
 * Ouvre un carnet à partir d'une recette : le protocole est **copié** dans le
 * container du carnet, et l'URI d'origine n'est gardée que comme provenance.
 * Sans copie, une v2 publiée par l'auteur changerait rétroactivement le
 * protocole des séances déjà consignées, et le carnet cesserait d'être
 * comparable à lui-même.
 */
/**
 * Copie le protocole dans le carnet. Attention : la copie re-sérialise le
 * modèle *parsé* (`buildProtocolDataset`), pas le dataset brut lu sur le pod
 * source. Une étape dont le type RDF n'a pas été reconnu à la lecture est
 * donc écrite ici en `act:ChecklistStep` — la perte est définitive à la
 * copie, pas seulement à l'affichage.
 */
export async function createLogbookFromProtocol(
  podUrl: string,
  protocolUri: string
): Promise<string> {
  const protocol = await readProtocol(protocolUri);
  await ensureTrackerScaffold(podUrl);

  const slug = `${slugify(protocol.title)}-${Date.now().toString(36)}`;
  const logbookUrl = new URL(`${slug}/`, carnetsContainer(podUrl)).toString();
  await createContainerAt(logbookUrl, { fetch: authFetch });

  const protocolDocUrl = new URL("protocol.ttl", logbookUrl).toString();
  await saveSolidDatasetAt(protocolDocUrl, buildProtocolDataset(protocolDocUrl, protocol), {
    fetch: authFetch,
  });

  const logbookDocUrl = new URL("logbook.ttl", logbookUrl).toString();
  let builder = buildThing(createThing({ url: `${logbookDocUrl}#it` }))
    .addUrl(RDF_TYPE, act.Logbook)
    .setStringNoLocale(act.title, protocol.title)
    .setUrl(act.protocol, `${protocolDocUrl}#it`)
    .setUrl(act.sourceProtocol, protocol.url);
  if (protocol.goal) builder = builder.setStringNoLocale(act.goal, protocol.goal);
  if (protocol.cadence) builder = builder.setStringNoLocale(act.cadence, protocol.cadence);
  await saveSolidDatasetAt(logbookDocUrl, setThing(createSolidDataset(), builder.build()), {
    fetch: authFetch,
  });

  return logbookUrl;
}

/** Lit la fiche d'un carnet, ou null si le container n'en porte pas (ancien carnet `st:`). */
export async function readLogbook(logbookContainerUrl: string): Promise<Logbook | null> {
  const docUrl = new URL("logbook.ttl", logbookContainerUrl).toString();
  let dataset: SolidDataset;
  try {
    dataset = await getSolidDataset(docUrl, { fetch: authFetch });
  } catch {
    return null;
  }
  const thing = getThing(dataset, `${docUrl}#it`);
  if (!thing) return null;
  return {
    url: logbookContainerUrl,
    title: readLiteral(thing, act.title) ?? "(sans titre)",
    goal: readLiteral(thing, act.goal) ?? undefined,
    cadence: readLiteral(thing, act.cadence) ?? undefined,
    protocolUrl: getUrl(thing, act.protocol) ?? undefined,
    sourceProtocolUrl: getUrl(thing, act.sourceProtocol) ?? undefined,
  };
}

export function sessionsContainer(logbookContainerUrl: string): string {
  return new URL("sessions/", logbookContainerUrl).toString();
}

export interface NewSession {
  protocolUrl?: string;
  startedAt: Date;
  durationSeconds: number;
  feeling?: string;
  runs: Array<Omit<StepRun, "url">>;
}

/**
 * Écrit une séance en un seul write, en fin de séance. Des écritures
 * incrémentales voudraient dire des échecs réseau pendant l'effort et des
 * enregistrements à moitié écrits.
 */
export async function logSession(
  logbookContainerUrl: string,
  session: NewSession
): Promise<string> {
  const container = sessionsContainer(logbookContainerUrl);
  try {
    await getSolidDataset(container, { fetch: authFetch });
  } catch {
    await createContainerAt(container, { fetch: authFetch });
  }

  const day = toLocalDay(session.startedAt);
  let docUrl = new URL(`${day}.ttl`, container).toString();
  if (await exists(docUrl)) {
    // Plusieurs séances le même jour : suffixe horaire plutôt qu'écrasement.
    const time = session.startedAt
      .toTimeString()
      .slice(0, 8)
      .replace(/:/g, "");
    docUrl = new URL(`${day}-${time}.ttl`, container).toString();
  }

  let dataset = createSolidDataset();
  const runUrls: string[] = [];
  session.runs.forEach((run, index) => {
    const url = `${docUrl}#run-${index}`;
    runUrls.push(url);
    let builder = buildThing(createThing({ url }))
      .addUrl(RDF_TYPE, act.StepRun)
      // Titre recopié : le log reste lisible si le protocole change après coup.
      .setStringNoLocale(act.title, run.title)
      .setInteger(act.completed, run.completed ? 1 : 0)
      .setInteger(act.durationSeconds, run.durationSeconds);
    if (run.ofStepUrl) builder = builder.setUrl(act.ofStep, run.ofStepUrl);
    dataset = setThing(dataset, builder.build());
  });

  let root = buildThing(createThing({ url: `${docUrl}#it` }))
    .addUrl(RDF_TYPE, act.Session)
    .setDatetime(act.startedAt, session.startedAt)
    .setInteger(act.durationSeconds, session.durationSeconds);
  if (session.protocolUrl) root = root.setUrl(act.protocol, session.protocolUrl);
  if (session.feeling) root = root.setStringNoLocale(act.feeling, session.feeling);
  runUrls.forEach((url) => {
    root = root.addUrl(act.hasRun, url);
  });

  await saveSolidDatasetAt(docUrl, setThing(dataset, root.build()), { fetch: authFetch });
  return docUrl;
}

export async function readSession(docUrl: string): Promise<Session> {
  const dataset = await getSolidDataset(docUrl, { fetch: authFetch });
  const root = getThing(dataset, `${docUrl}#it`);
  if (!root) throw new Error(`Séance introuvable : ${docUrl}`);

  const runs = getUrlAll(root, act.hasRun)
    .map((url) => getThing(dataset, url))
    .filter((t): t is Thing => t !== null)
    .map((t) => ({
      url: t.url,
      ofStepUrl: getUrl(t, act.ofStep) ?? undefined,
      title: readLiteral(t, act.title) ?? "(sans titre)",
      completed: (getInteger(t, act.completed) ?? 0) !== 0,
      durationSeconds: getInteger(t, act.durationSeconds) ?? 0,
    }))
    // L'ordre des objets d'un prédicat n'est pas garanti : on retrie sur le
    // rang porté par le fragment `#run-N`.
    .sort((a, b) => runFragmentIndex(a.url) - runFragmentIndex(b.url));

  return {
    url: docUrl,
    protocolUrl: getUrl(root, act.protocol) ?? undefined,
    startedAt: getDatetime(root, act.startedAt) ?? undefined,
    durationSeconds: getInteger(root, act.durationSeconds) ?? 0,
    feeling: readLiteral(root, act.feeling) ?? undefined,
    runs,
  };
}

function runFragmentIndex(url: string): number {
  return Number(url.split("#run-")[1] ?? 0);
}

/** Date locale, pas UTC : une séance du soir doit tomber le bon jour. */
function toLocalDay(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function exists(url: string): Promise<boolean> {
  const res = await authFetch(url, { method: "HEAD" });
  return res.ok;
}
