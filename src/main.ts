import "./style.css";
import { completeLogin, getSession, loginWithIdentifier, logout } from "./lib/auth";
import {
  carnetsContainer,
  describePodError,
  getPrimaryPodUrl,
  isAuthError,
  listCarnetUrls,
  listSeanceUrls,
  listTurtleUrls,
  logSeance,
  readCarnet,
  readPreferences,
  readSeance,
  readSeanceModele,
  seanceDayFromUrl,
  setActiveCarnet,
} from "./lib/pod";
import {
  createLogbookFromProtocol,
  logSession,
  readLogbook,
  readProtocol,
  readSession,
  sessionsContainer,
} from "./lib/protocol-pod";
import {
  SequenceTimer,
  formatSeconds,
  type SessionRecord,
  type TimerState,
} from "./lib/timer";
import { ScreenWakeLock } from "./lib/wake-lock";
import { applyTheme, loadTheme, nextTheme, THEME_LABELS, type ThemeChoice } from "./lib/theme";
import { SessionSignals, type SignalKind, type SignalPrefs } from "./lib/signals";
import {
  countUnrecognized,
  describeStep,
  flattenSteps,
  type RunnableStep,
  type Step,
} from "./vocab/protocol";
import type { Bloc } from "./vocab/carnet";

const DEFAULT_IDENTIFIER = "https://pod.nicolasdb.eu/";
const app = document.querySelector<HTMLDivElement>("#app")!;

async function main() {
  // Avant tout rendu : sinon le premier écran s'affiche dans le mauvais thème
  // le temps d'un aller-retour réseau.
  applyTheme(loadTheme());
  await completeLogin();
  const session = getSession();

  if (!session.info.isLoggedIn) {
    renderLoginView();
    return;
  }

  renderLoadingView(session.info.webId!);
  try {
    await renderApp(session.info.webId!);
  } catch (err) {
    renderErrorView(session.info.webId!, err);
  }
}

function renderLoginView(message?: string) {
  app.innerHTML = `
    <main class="screen">
      <h1>Solid Sport Tracker</h1>
      <p class="lead">Connecte-toi avec l'adresse de ton pod, ou avec ton WebID si tu ne connais pas son fournisseur — il sera alors découvert depuis ton profil.</p>
      <form id="login-form">
        <label for="identifier">Pod ou WebID</label>
        <input id="identifier" name="identifier" type="url" value="${DEFAULT_IDENTIFIER}" required />
        <button type="submit">Se connecter</button>
      </form>
      ${message ? `<p class="error">${message}</p>` : ""}
    </main>
  `;

  const form = document.querySelector<HTMLFormElement>("#login-form")!;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = (document.querySelector<HTMLInputElement>("#identifier")!).value.trim();
    try {
      await loginWithIdentifier(identifier);
    } catch (err) {
      renderLoginView(err instanceof Error ? err.message : String(err));
    }
  });
}

function renderLoadingView(webId: string) {
  app.innerHTML = `
    <main class="screen">
      <p class="lead">Connecté en tant que <code>${webId}</code>. Lecture du pod…</p>
    </main>
  `;
}

function renderErrorView(webId: string, err: unknown) {
  const msg = describePodError(err);
  app.innerHTML = `
    <main class="screen">
      <p class="lead">Connecté en tant que <code>${webId}</code>.</p>
      <p class="error">${msg}</p>
      <p>Le carnet attendu sur ce pod, sous <code>/sport-tracker/carnets/</code>, est peut-être encore vide — voir <code>docs/data-model.md</code> pour la structure attendue.</p>
      <button id="logout">Se déconnecter</button>
    </main>
  `;
  document.querySelector<HTMLButtonElement>("#logout")!.addEventListener("click", async () => {
    await logout();
    renderLoginView();
  });
}

/**
 * Recette d'exemple servie par l'app elle-même. Elle est versionnée dans le
 * repo (`public/recipes/`) plutôt qu'importée depuis le code : le chemin de
 * découverte réel — une recette vient d'une adresse — est ainsi exercé dès le
 * premier carnet, sans dépendre d'un pod tiers.
 */
const RECETTE_EXEMPLE = new URL("recipes/echauffement.ttl", location.href).toString();

/**
 * Un carnet, quel que soit son vocabulaire. Les carnets écrits avant les
 * étapes typées (`st:`) sont convertis à la lecture : une seule vue, un seul
 * minuteur, un seul récapitulatif, et l'ancien format n'a pas besoin de
 * migration pour rester consultable.
 */
interface Programme {
  titre: string;
  objectif?: string;
  cadence?: string;
  steps: Step[];
  /** Protocole de référence, recopié dans les séances écrites. */
  protocolUrl?: string;
  legacy: boolean;
}

/** Convertit un ancien modèle `st:` : un bloc chronométré devient une étape chronométrée. */
function legacyToSteps(blocs: Bloc[]): Step[] {
  return blocs.map((bloc) => ({
    kind: "timed" as const,
    url: bloc.url,
    title: bloc.titre,
    note: bloc.exercices
      .map((ex) => (ex.repetitions ? `${ex.titre} — ${ex.repetitions}` : ex.titre))
      .join(" · ") || undefined,
    targetSeconds: bloc.dureeSecondes,
  }));
}

async function loadProgramme(containerUrl: string): Promise<Programme> {
  const logbook = await readLogbook(containerUrl);
  if (logbook?.protocolUrl) {
    const protocol = await readProtocol(logbook.protocolUrl);
    return {
      titre: logbook.title,
      objectif: logbook.goal,
      cadence: logbook.cadence,
      steps: protocol.steps,
      protocolUrl: protocol.url,
      legacy: false,
    };
  }

  const carnet = await readCarnet(containerUrl);
  const modele = carnet.seanceModeleUrl ? await readSeanceModele(carnet.seanceModeleUrl) : null;
  return {
    titre: carnet.titre,
    objectif: carnet.objectif,
    cadence: carnet.frequence,
    // Un bloc sans durée n'était pas exécutable dans l'ancien modèle.
    steps: legacyToSteps(modele ? modele.blocs.filter((b) => b.dureeSecondes > 0) : []),
    protocolUrl: carnet.seanceModeleUrl,
    legacy: true,
  };
}

/**
 * @param carnetUrl Carnet à ouvrir explicitement (venant du picker). Sans ça,
 *   on retombe sur `st:carnetActif` (préférences), puis sur le premier carnet
 *   trouvé — l'ordre déjà en place avant le picker.
 */
async function renderApp(webId: string, carnetUrl?: string) {
  const podUrl = await getPrimaryPodUrl(webId);
  console.info("[sport-tracker] WebID:", webId, "→ racine du pod:", podUrl);
  // Se connecter ne doit rien écrire : le scaffold n'est créé qu'au moment où
  // l'usager ouvre son premier carnet.
  const carnetUrls = await listCarnetUrls(podUrl);

  if (carnetUrls.length === 0) {
    renderNewLogbookView(webId, podUrl);
    return;
  }

  const prefs = await readPreferences(podUrl);
  const active =
    carnetUrl && carnetUrls.includes(carnetUrl)
      ? carnetUrl
      : prefs.carnetActifUrl && carnetUrls.includes(prefs.carnetActifUrl)
        ? prefs.carnetActifUrl
        : carnetUrls[0];

  const programme = await loadProgramme(active);
  const runnable = flattenSteps(programme.steps);
  // legacyToSteps ne produit jamais de type non reconnu : le vocabulaire
  // st: n'a que des blocs, il n'y a rien à mal typer.
  const unrecognized = programme.legacy ? 0 : countUnrecognized(programme.steps);

  const ctx: SeanceContext = {
    webId,
    carnetContainerUrl: active,
    carnetTitre: programme.titre,
    protocolUrl: programme.protocolUrl ?? "",
    legacy: programme.legacy,
  };
  const hasDraft = loadDraft(ctx.carnetContainerUrl) !== null;

  app.innerHTML = `
    <main class="session">
      <header class="topbar">
        <button id="pick-carnet" class="ghost">Carnets</button>
        <span class="webid">${webId}</span>
        <button id="logout" class="ghost">Déconnexion</button>
      </header>
      <nav class="tabs">
        <button id="tab-seance" class="tab is-active">Séance</button>
        <button id="tab-historique" class="tab">Historique</button>
      </nav>
      <div class="session-scroll" id="view-seance">
        ${
          hasDraft
            ? `<p class="banner">Séance non enregistrée en attente.
                 <button id="resume-recap" class="ghost">Reprendre</button></p>`
            : ""
        }
        ${
          unrecognized > 0
            ? `<p class="banner">${unrecognized} étape(s) de type non reconnu, exécutée(s)
                 comme simple validation.</p>`
            : ""
        }
        <h1>${programme.titre}</h1>
        ${programme.objectif ? `<p class="lead">${programme.objectif}</p>` : ""}
        ${
          programme.cadence
            ? `<p class="cadence"><span class="label">Fréquence</span> ${programme.cadence}</p>`
            : ""
        }
        ${
          runnable.length
            ? `<ol class="blocs">${runnable.map(renderRunnable).join("")}</ol>`
            : `<p>Ce carnet n'a pas encore d'étapes exécutables.</p>`
        }
      </div>
      <div class="session-scroll" id="view-historique" hidden></div>
      ${runnable.length ? renderTimerBar(runnable[0].seconds) : ""}
    </main>
  `;

  wireTabs(ctx);

  document.querySelector<HTMLButtonElement>("#logout")!.addEventListener("click", async () => {
    await logout();
    renderLoginView();
  });

  document.querySelector<HTMLButtonElement>("#pick-carnet")!.addEventListener("click", () => {
    renderCarnetPickerView(webId, podUrl, carnetUrls, active).catch((err) =>
      renderErrorView(webId, err)
    );
  });

  if (hasDraft) {
    document.querySelector<HTMLButtonElement>("#resume-recap")!.addEventListener("click", () => {
      // Le brouillon fournit le relevé ; l'enregistrement vide sert juste de base.
      renderRecapView(runnable, ctx, {
        startedAt: null,
        totalElapsedSeconds: 0,
        wallClockSeconds: 0,
        steps: [],
      });
    });
  }

  if (runnable.length) {
    wireTimer(runnable, ctx);
  }
}

/** Ouverture d'un carnet à partir de l'adresse d'une recette. */
/**
 * @param onCancel Présent quand ce carnet n'est pas le seul recours — on
 *   arrive ici depuis le picker, pas depuis un pod vierge — pour offrir un
 *   retour plutôt que de coincer l'usager dans un formulaire.
 */
function renderNewLogbookView(webId: string, podUrl: string, onCancel?: () => void) {
  app.innerHTML = `
    <main class="screen">
      <p class="lead">Connecté en tant que <code>${webId}</code>.</p>
      <p>${
        onCancel
          ? "Adresse d'une nouvelle recette à ouvrir en carnet."
          : "Aucun carnet sur ce pod. Rien n'y a été écrit : ouvrir un carnet est la première écriture, et elle t'appartient."
      }</p>
      <form id="new-logbook">
        <label for="recette">Adresse de la recette</label>
        <input id="recette" name="recette" type="url" value="${RECETTE_EXEMPLE}" required />
        <p class="meta">La recette est copiée dans ton carnet ; son adresse d'origine
          est conservée comme provenance, sans lien vivant.</p>
        <p class="meta">Créera <code>${carnetsContainer(podUrl)}</code> et un container
          par carnet en dessous.</p>
        <p class="error" id="new-error" hidden></p>
        <button type="submit" id="new-submit">Ouvrir le carnet</button>
        ${onCancel ? `<button type="button" id="new-cancel" class="ghost">Annuler</button>` : ""}
      </form>
      ${onCancel ? "" : `<button id="logout" class="ghost">Se déconnecter</button>`}
    </main>
  `;

  document.querySelector<HTMLFormElement>("#new-logbook")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.querySelector<HTMLButtonElement>("#new-submit")!;
    const errorEl = document.querySelector<HTMLParagraphElement>("#new-error")!;
    const uri = document.querySelector<HTMLInputElement>("#recette")!.value.trim();
    btn.disabled = true;
    btn.textContent = "Création en cours…";
    errorEl.hidden = true;
    try {
      const logbookUrl = await createLogbookFromProtocol(podUrl, uri);
      await setActiveCarnet(podUrl, logbookUrl);
      await renderApp(webId, logbookUrl);
    } catch (err) {
      errorEl.textContent = describePodError(err);
      errorEl.hidden = false;
      btn.disabled = false;
      btn.textContent = "Ouvrir le carnet";
    }
  });

  if (onCancel) {
    document.querySelector<HTMLButtonElement>("#new-cancel")!.addEventListener("click", onCancel);
  } else {
    document.querySelector<HTMLButtonElement>("#logout")!.addEventListener("click", async () => {
      await logout();
      renderLoginView();
    });
  }
}

/**
 * Écran de bascule entre carnets. Atteint depuis le bouton « Carnets » de la
 * séance ; pas de router, on rend juste un autre écran par-dessus le DOM.
 */
async function renderCarnetPickerView(
  webId: string,
  podUrl: string,
  carnetUrls: string[],
  activeCarnetUrl: string
) {
  app.innerHTML = `
    <main class="screen">
      <button id="pick-back" class="ghost">← Retour</button>
      <h1>Carnets</h1>
      <ol class="blocs" id="carnet-list">
        ${carnetUrls
          .map(
            (url) => `
          <li class="bloc${url === activeCarnetUrl ? " is-current" : ""}">
            <span>…</span>
            <button data-carnet="${url}" ${url === activeCarnetUrl ? "disabled" : ""}>
              ${url === activeCarnetUrl ? "Actif" : "Ouvrir"}
            </button>
          </li>`
          )
          .join("")}
      </ol>
      <button id="new-carnet" class="ghost">Nouveau carnet</button>
    </main>
  `;

  document.querySelector<HTMLButtonElement>("#pick-back")!.addEventListener("click", () => {
    renderApp(webId, activeCarnetUrl).catch((err) => renderErrorView(webId, err));
  });
  document.querySelector<HTMLButtonElement>("#new-carnet")!.addEventListener("click", () => {
    renderNewLogbookView(webId, podUrl, () => renderCarnetPickerView(webId, podUrl, carnetUrls, activeCarnetUrl));
  });

  document.querySelectorAll<HTMLButtonElement>("#carnet-list button[data-carnet]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.carnet!;
      btn.disabled = true;
      btn.textContent = "Ouverture…";
      try {
        await setActiveCarnet(podUrl, url);
        await renderApp(webId, url);
      } catch (err) {
        renderErrorView(webId, err);
      }
    });
  });

  // Titres chargés après affichage : la liste ne dépend pas d'un aller-retour
  // supplémentaire pour apparaître, seul le libellé se remplit ensuite.
  carnetUrls.forEach((url, i) => {
    loadProgramme(url)
      .then((programme) => {
        const item = document.querySelectorAll<HTMLLIElement>("#carnet-list li")[i];
        const span = item?.querySelector("span");
        if (span) span.textContent = programme.titre;
      })
      .catch(() => {
        const item = document.querySelectorAll<HTMLLIElement>("#carnet-list li")[i];
        const span = item?.querySelector("span");
        if (span) span.textContent = "(carnet illisible)";
      });
  });
}

/**
 * Les deux vues coexistent dans le DOM et on bascule leur visibilité : les
 * re-rendre détruirait le minuteur en cours et ses écouteurs.
 */
function wireTabs(ctx: SeanceContext) {
  const tabSeance = document.querySelector<HTMLButtonElement>("#tab-seance")!;
  const tabHistorique = document.querySelector<HTMLButtonElement>("#tab-historique")!;
  const viewSeance = document.querySelector<HTMLElement>("#view-seance")!;
  const viewHistorique = document.querySelector<HTMLElement>("#view-historique")!;
  const timerBar = document.querySelector<HTMLElement>("#timer");

  let historiqueLoaded = false;

  const show = (historique: boolean) => {
    viewSeance.hidden = historique;
    viewHistorique.hidden = !historique;
    if (timerBar) timerBar.hidden = historique;
    tabSeance.classList.toggle("is-active", !historique);
    tabHistorique.classList.toggle("is-active", historique);
    if (historique && !historiqueLoaded) {
      historiqueLoaded = true;
      loadHistorique(viewHistorique, ctx);
    }
  };

  tabSeance.addEventListener("click", () => show(false));
  tabHistorique.addEventListener("click", () => show(true));
}

/** `2026-08-29` en heure locale — clé de comparaison des jours. */
function isoDay(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Série de jours consécutifs jusqu'à aujourd'hui. Une journée encore en cours
 * ne casse pas la série : on repart d'hier si rien n'est enregistré aujourd'hui.
 */
function currentStreak(days: Set<string>): number {
  const cursor = new Date();
  if (!days.has(isoDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(isoDay(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function loadHistorique(container: HTMLElement, ctx: SeanceContext) {
  container.innerHTML = `<p class="lead">Lecture de l'historique…</p>`;
  try {
    // Les deux emplacements coexistent : `seances/` pour les carnets écrits
    // avant les étapes typées, `sessions/` depuis. Le calendrier les fusionne
    // pour que la continuité reste lisible d'un format à l'autre.
    const [anciennes, nouvelles] = await Promise.all([
      listSeanceUrls(ctx.carnetContainerUrl),
      listTurtleUrls(sessionsContainer(ctx.carnetContainerUrl)),
    ]);
    const urls = [...anciennes, ...nouvelles];
    if (urls.length === 0) {
      container.innerHTML = `<p class="lead">Aucune séance enregistrée pour l'instant.</p>`;
      return;
    }

    // Un jour peut porter plusieurs séances (fichiers suffixés de l'heure).
    const byDay = new Map<string, string[]>();
    for (const url of urls) {
      const day = seanceDayFromUrl(url);
      if (!day) continue;
      byDay.set(day, [...(byDay.get(day) ?? []), url]);
    }

    renderHistorique(container, ctx, byDay, new Date());
  } catch (err) {
    container.innerHTML = `<p class="error">${describePodError(err)}</p>`;
  }
}

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function renderHistorique(
  container: HTMLElement,
  ctx: SeanceContext,
  byDay: Map<string, string[]>,
  month: Date
) {
  const days = new Set(byDay.keys());
  const streak = currentStreak(days);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // getDay() met dimanche à 0 ; on décale pour une semaine commençant lundi.
  const leading = (first.getDay() + 6) % 7;

  const cells: string[] = [];
  for (let i = 0; i < leading; i += 1) cells.push(`<span class="day is-empty"></span>`);
  for (let d = 1; d <= daysInMonth; d += 1) {
    const key = isoDay(new Date(year, monthIndex, d));
    const count = byDay.get(key)?.length ?? 0;
    cells.push(
      count > 0
        ? `<button class="day is-done" data-day="${key}">${d}${
            count > 1 ? `<sup>${count}</sup>` : ""
          }</button>`
        : `<span class="day">${d}</span>`
    );
  }

  // byDay est indexé par jour : le nombre de séances est la somme des listes,
  // un jour pouvant en porter plusieurs.
  const totalSeances = [...byDay.values()].reduce((sum, urls) => sum + urls.length, 0);
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const monthSeances = [...byDay.entries()]
    .filter(([day]) => day.startsWith(monthPrefix))
    .reduce((sum, [, urls]) => sum + urls.length, 0);

  container.innerHTML = `
    <div class="streak">
      <strong>${streak}</strong> jour${streak > 1 ? "s" : ""} d'affilée
      <span class="meta">· ${totalSeances} séance${totalSeances > 1 ? "s" : ""} au total</span>
    </div>
    <div class="cal-head">
      <button id="cal-prev" class="ghost">‹</button>
      <span>${MOIS[monthIndex]} ${year} <span class="meta">· ${monthSeances}</span></span>
      <button id="cal-next" class="ghost">›</button>
    </div>
    <div class="cal-grid">
      ${["L", "M", "M", "J", "V", "S", "D"].map((d) => `<span class="dow">${d}</span>`).join("")}
      ${cells.join("")}
    </div>
    <div id="seance-detail"></div>
  `;

  document.querySelector<HTMLButtonElement>("#cal-prev")!.addEventListener("click", () => {
    renderHistorique(container, ctx, byDay, new Date(year, monthIndex - 1, 1));
  });
  document.querySelector<HTMLButtonElement>("#cal-next")!.addEventListener("click", () => {
    renderHistorique(container, ctx, byDay, new Date(year, monthIndex + 1, 1));
  });

  container.querySelectorAll<HTMLButtonElement>("button.day").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll("button.day").forEach((b) => b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      showSeanceDetail(byDay.get(btn.dataset.day!)!);
    });
  });
}

/** Une séance lue, quel que soit le format dans lequel elle a été écrite. */
interface SeanceLue {
  date?: Date;
  dureeSecondes: number;
  ressenti?: string;
  etapes: Array<{ titre: string; complete: boolean; dureeSecondes: number }>;
}

async function readSeanceQuelquesoitLeFormat(url: string): Promise<SeanceLue> {
  if (url.includes("/sessions/")) {
    const session = await readSession(url);
    return {
      date: session.startedAt,
      dureeSecondes: session.durationSeconds,
      ressenti: session.feeling,
      etapes: session.runs.map((r) => ({
        titre: r.title,
        complete: r.completed,
        dureeSecondes: r.durationSeconds,
      })),
    };
  }
  const seance = await readSeance(url);
  return {
    date: seance.dateRealisation,
    dureeSecondes: seance.dureeReelleSecondes,
    ressenti: seance.ressenti,
    etapes: seance.blocs.map((b) => ({
      titre: b.titre,
      complete: b.complete,
      dureeSecondes: b.dureeReelleSecondes,
    })),
  };
}

/** Un jour peut porter plusieurs séances : on les affiche toutes, dans l'ordre. */
async function showSeanceDetail(urls: string[]) {
  const panel = document.querySelector<HTMLElement>("#seance-detail")!;
  panel.innerHTML = `<p class="lead">Lecture…</p>`;
  try {
    const seances = await Promise.all(urls.map(readSeanceQuelquesoitLeFormat));
    // Les noms de fichiers ne se trient pas chronologiquement (`<date>.ttl`
    // passe après `<date>-HHMMSS.ttl`) : on trie sur l'heure réelle.
    seances.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

    panel.innerHTML = seances
      .map((seance) => {
        const titre = seance.date
          ? seance.date.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })
          : "Séance";
        return `
        <section class="detail">
          <h3>${titre}</h3>
          <p class="meta">Durée réelle : ${formatSeconds(seance.dureeSecondes)}</p>
          <ul class="detail-blocs">
            ${seance.etapes
              .map(
                (e) => `<li class="${e.complete ? "is-done" : "is-skipped"}">
                  <span>${e.complete ? "✓" : "✗"}</span>
                  <span>${e.titre}</span>
                  <span class="meta">${formatSeconds(e.dureeSecondes)}</span>
                </li>`
              )
              .join("")}
          </ul>
          ${seance.ressenti ? `<p class="ressenti">${seance.ressenti}</p>` : ""}
        </section>`;
      })
      .join("");
  } catch (err) {
    panel.innerHTML = `<p class="error">${describePodError(err)}</p>`;
  }
}

interface SeanceContext {
  webId: string;
  carnetContainerUrl: string;
  carnetTitre: string;
  protocolUrl: string;
  /** Carnet écrit avant les étapes typées : la séance s'écrit dans `seances/`. */
  legacy: boolean;
}

function renderRunnable(step: RunnableStep, index: number): string {
  // Une étape non chronométrée affiche son objectif (10 squats) plutôt qu'un
  // temps : c'est l'usager qui la valide, pas l'horloge.
  const objectif = step.seconds > 0 ? formatSeconds(step.seconds) : describeStep(step.sourceStep);
  const note = step.sourceStep.note ? `<p class="bloc-note">${step.sourceStep.note}</p>` : "";
  return `
    <li class="bloc" data-index="${index}">
      <p class="bloc-head"><strong class="bloc-titre">${step.label}</strong>
        <span class="bloc-objectif">${objectif}</span></p>
      ${note}
    </li>`;
}

function renderTimerBar(firstDuration: number): string {
  return `
    <section id="timer" class="timer">
      <div class="timer-progress" aria-hidden="true"><div id="timer-progress-fill"></div></div>
      <div class="timer-display">
        <span id="timer-label">Prêt</span>
        <span id="timer-remaining">${formatSeconds(firstDuration)}</span>
        <span id="timer-count" class="meta"></span>
      </div>
      <div class="timer-controls">
        <button id="timer-toggle">Démarrer</button>
      </div>
      <div class="timer-controls secondary">
        <button id="timer-skip" class="ghost">Passer</button>
        <button id="timer-reset" class="ghost">Réinit.</button>
        <button id="timer-finish" class="ghost">Terminer</button>
      </div>
      <div class="timer-toggles">
        <button id="opt-sound" class="chip" type="button" aria-pressed="false">🔊 Bip</button>
        <button id="opt-haptic" class="chip" type="button" aria-pressed="false">📳 Vibration</button>
        <button id="opt-screen" class="chip" type="button" aria-pressed="false">🔆 Écran</button>
        <button id="opt-theme" class="chip" type="button">☀️ Clair</button>
      </div>
    </section>
  `;
}

/**
 * Réglages de séance. Ils vivent dans le navigateur et non sur le pod : ils
 * décrivent l'appareil du moment, pas l'usager — un téléphone vibre, un
 * portable non, et le contexte change d'une séance à l'autre (yoga en
 * silence, course avec un casque).
 */
interface DevicePrefs extends SignalPrefs {
  screenOn: boolean;
}

const DEVICE_PREFS_KEY = "sst:device-prefs";

const DEFAULT_DEVICE_PREFS: DevicePrefs = { sound: true, haptic: true, screenOn: true };

function loadDevicePrefs(): DevicePrefs {
  try {
    const raw = localStorage.getItem(DEVICE_PREFS_KEY);
    return raw ? { ...DEFAULT_DEVICE_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_DEVICE_PREFS };
  } catch {
    return { ...DEFAULT_DEVICE_PREFS };
  }
}

function saveDevicePrefs(prefs: DevicePrefs): void {
  try {
    localStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Stockage indisponible : les réglages ne survivent pas à la session, tant pis.
  }
}

/** Nombre de blocs suivants gardés visibles sur petit écran, en plus du bloc courant. */
const LOOKAHEAD = 2;

/**
 * Sous ce seuil, l'étape est trop courte pour mériter un décompte : elle est
 * son propre signal, et le tick chevaucherait le bip qui vient de l'ouvrir.
 */
const TICK_MIN_SECONDS = 5;

function wireTimer(steps: RunnableStep[], ctx: SeanceContext) {
  const timer = new SequenceTimer(
    steps.map((s) => ({ label: s.label, seconds: s.seconds, chain: s.chain }))
  );
  const label = document.querySelector<HTMLSpanElement>("#timer-label")!;
  const remaining = document.querySelector<HTMLSpanElement>("#timer-remaining")!;
  const toggleBtn = document.querySelector<HTMLButtonElement>("#timer-toggle")!;
  const skipBtn = document.querySelector<HTMLButtonElement>("#timer-skip")!;
  const resetBtn = document.querySelector<HTMLButtonElement>("#timer-reset")!;
  const finishBtn = document.querySelector<HTMLButtonElement>("#timer-finish")!;
  const timerSection = document.querySelector<HTMLElement>("#timer")!;
  const progressFill = document.querySelector<HTMLElement>("#timer-progress-fill")!;
  const count = document.querySelector<HTMLElement>("#timer-count")!;
  const blocItems = Array.from(document.querySelectorAll<HTMLLIElement>("li.bloc"));

  // Le verrou d'écran n'appartient qu'à son bouton : ni « Passer », ni
  // « Réinit. », ni une pause ne le relâchent. Ils le faisaient, et le bouton
  // repassait à ⚠️ en pleine séance alors que l'usager n'avait rien demandé —
  // il fallait éteindre puis rallumer l'option pour récupérer l'écran.
  const wakeLock = new ScreenWakeLock();
  const prefs = loadDevicePrefs();
  const signals = new SessionSignals(prefs);
  wireDevicePrefs(prefs, signals, wakeLock);

  /**
   * Un signal marque une fin d'étape, mais toutes les fins ne se valent pas :
   * une phase d'intervalle enchaîne dans le même effort, une fin d'étape
   * appelle une transition. On distingue les deux en regardant si l'étape
   * suivante vient encore du même `IntervalStep`.
   */
  const endSignal = (index: number): SignalKind => {
    const next = steps[index + 1];
    if (!next) return "session";
    return next.chain ? "phase" : "step";
  };

  let recapOpened = false;
  const openRecap = () => {
    if (recapOpened) return;
    recapOpened = true;
    timer.pause();
    renderRecapView(steps, ctx, timer.getRecord());
  };

  // Le navigateur throttle les timers d'un onglet caché et relâche le verrou
  // d'écran : au retour, on recale le décompte sur l'horloge et on reprend
  // le verrou.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    timer.resync();
    void wakeLock.reacquire();
  });

  let previous: TimerState | null = null;

  const signalTransitions = (state: TimerState) => {
    const prev = previous;
    previous = state;
    if (!prev) return;

    // Une étape vient de se clore. On ne signale qu'une progression : une
    // remise à zéro reviendrait en arrière et ne mérite pas de bip.
    if (state.stepIndex > prev.stepIndex) {
      signals.emit(endSignal(prev.stepIndex));
      return;
    }

    // Décompte des dernières secondes : c'est ce qui permet de se préparer
    // sans regarder l'écran.
    if (
      state.running &&
      state.timed &&
      (state.step?.seconds ?? 0) >= TICK_MIN_SECONDS &&
      state.remaining > 0 &&
      state.remaining <= 3 &&
      state.remaining !== prev.remaining
    ) {
      signals.emit("tick");
    }
  };

  const render = (state: TimerState) => {
    signalTransitions(state);

    if (state.done) {
      label.textContent = "Séance terminée !";
      toggleBtn.textContent = "Démarrer";
      // Dernier bloc fini : on bascule directement sur le récapitulatif.
      queueMicrotask(openRecap);
    } else if (state.awaitingReady) {
      label.textContent = `Prêt pour : ${state.step?.label ?? ""} ?`;
      toggleBtn.textContent = "Je suis prêt";
    } else if (!state.timed && state.running) {
      // Étape comptée ou checklist : rien à décompter, c'est l'usager qui clôt.
      label.textContent = state.step?.label ?? "Prêt";
      toggleBtn.textContent = "C'est fait";
    } else {
      label.textContent = state.step?.label ?? "Prêt";
      toggleBtn.textContent = state.running ? "Pause" : "Démarrer";
    }

    const objectif = steps[state.stepIndex]?.sourceStep;
    remaining.textContent =
      !state.done && !state.timed && objectif ? describeStep(objectif) : formatSeconds(state.remaining);
    // Où l'on en est dans la séance entière : le décompte ne dit que l'étape,
    // et « il en reste combien » est la question qui vient juste après.
    const fait = state.done ? steps.length : state.stepIndex;
    count.textContent = state.done ? "" : `Étape ${fait + 1} / ${steps.length}`;
    progressFill.style.width = `${(fait / steps.length) * 100}%`;

    toggleBtn.disabled = state.done;
    skipBtn.disabled = state.done;
    timerSection.classList.toggle("is-awaiting", state.awaitingReady);

    // Sur petit écran on ne garde que le bloc courant et les suivants proches :
    // le reste du programme est masqué par CSS via ces classes.
    blocItems.forEach((item, index) => {
      const offset = index - state.stepIndex;
      item.classList.toggle("is-current", !state.done && offset === 0);
      if (offset === 0) {
        // Étape non chronométrée : rien ne s'écoule, la barre reste pleine.
        const total = state.step?.seconds ?? 0;
        const ecoule = total > 0 ? (total - state.remaining) / total : 0;
        item.style.setProperty("--bloc-fill", `${Math.min(100, Math.max(0, ecoule * 100))}%`);
      }
      item.classList.toggle("is-last-done", !state.done && offset === -1);
      item.classList.toggle("is-past", !state.done && offset < -1);
      item.classList.toggle("is-far", !state.done && offset > LOOKAHEAD);
    });
  };

  timer.subscribe(render);

  toggleBtn.addEventListener("click", () => {
    // Ce tap est le geste utilisateur dont l'AudioContext a besoin pour sortir
    // de l'état suspendu ; sans lui, aucun bip ne sortira de la séance.
    signals.arm();
    const state = timer.getSnapshot();
    if (state.running && !state.timed) {
      timer.complete();
    } else if (state.running) {
      timer.pause();
    } else {
      timer.start();
      // Prendre le verrou, jamais le rendre : l'option peut être active depuis
      // une séance précédente, et une acquisition demande un geste — ce tap
      // est le premier de la séance.
      if (prefs.screenOn) void wakeLock.acquire();
    }
  });
  skipBtn.addEventListener("click", () => timer.skip());
  resetBtn.addEventListener("click", () => {
    recapOpened = false;
    timer.reset();
  });
  finishBtn.addEventListener("click", openRecap);
}

/**
 * Les trois options de séance. Elles s'appliquent immédiatement, y compris en
 * pleine séance : c'est le moment où on découvre qu'on est dans une salle
 * silencieuse.
 */
function wireDevicePrefs(
  prefs: DevicePrefs,
  signals: SessionSignals,
  wakeLock: ScreenWakeLock
): void {
  const soundBtn = document.querySelector<HTMLButtonElement>("#opt-sound")!;
  const hapticBtn = document.querySelector<HTMLButtonElement>("#opt-haptic")!;
  const screenBtn = document.querySelector<HTMLButtonElement>("#opt-screen")!;
  const themeBtn = document.querySelector<HTMLButtonElement>("#opt-theme")!;
  // Tri-état, donc pas de `aria-pressed` : le libellé porte l'état, et c'est
  // aussi ce que l'usager lit en plein soleil.
  let theme: ThemeChoice = loadTheme();

  // Sans support haptique (iOS, poste de bureau) l'option ment : on la retire
  // plutôt que d'afficher un bouton sans effet.
  if (!signals.hapticSupported) hapticBtn.hidden = true;
  if (!wakeLock.supported) screenBtn.hidden = true;

  const paint = () => {
    soundBtn.setAttribute("aria-pressed", String(prefs.sound));
    hapticBtn.setAttribute("aria-pressed", String(prefs.haptic));
    screenBtn.setAttribute("aria-pressed", String(prefs.screenOn));
    // Le chemin réellement actif, pas l'intention : « écran allumé » demandé et
    // « verrou tenu » sont deux choses différentes, et seule la seconde se
    // vérifie. Sondé, faute d'événement quand le verrou tombe côté vidéo.
    const marque = { native: "🔒", video: "🎞", off: "⚠️" }[wakeLock.status];
    const chutes = wakeLock.drops > 0 ? `×${wakeLock.drops}` : "";
    screenBtn.textContent = `🔆 Écran ${prefs.screenOn ? marque + chutes : ""}`.trim();
    themeBtn.textContent = THEME_LABELS[theme];
  };
  setInterval(paint, 2000);

  const toggle = (key: keyof DevicePrefs) => async () => {
    prefs[key] = !prefs[key];
    saveDevicePrefs(prefs);
    signals.setPrefs(prefs);
    paint();

    if (key === "sound" && prefs.sound) signals.arm();
    // Un aperçu du signal : on n'active pas une option à l'aveugle.
    if (key !== "screenOn" && prefs[key]) signals.emit("phase");
    if (key === "screenOn") {
      // Pas de condition sur « séance en cours » : le bouton promet un écran
      // allumé, et ce tap est le geste utilisateur dont l'acquisition a besoin.
      // Attendre le démarrage, c'était promettre sans tenir.
      if (prefs.screenOn) await wakeLock.acquire();
      if (!prefs.screenOn) await wakeLock.release();
      // L'acquisition est asynchrone : sans ce second passage, le bouton
      // afficherait « rien de tenu » jusqu'au prochain sondage.
      paint();
    }
  };

  themeBtn.addEventListener("click", () => {
    theme = nextTheme(theme);
    applyTheme(theme);
    paint();
  });
  soundBtn.addEventListener("click", toggle("sound"));
  hapticBtn.addEventListener("click", toggle("haptic"));
  screenBtn.addEventListener("click", toggle("screenOn"));
  paint();
}

interface RecapRow {
  step: RunnableStep;
  complete: boolean;
  dureeSecondes: number;
}

interface RecapDraft {
  savedAt: string;
  startedAt: string | null;
  complete: boolean[];
  dureeSecondes: number[];
  minutes: number;
  ressenti: string;
}

/** Une séance non enregistrée ne survit pas plus longtemps que ça. */
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const draftKey = (carnetContainerUrl: string) => `sst:recap:${carnetContainerUrl}`;

/**
 * Le récapitulatif est le seul endroit où la séance existe avant d'être écrite
 * sur le pod : un échec réseau ou une session expirée la perdrait. On le
 * conserve donc localement jusqu'à l'écriture réussie.
 */
function saveDraft(carnetContainerUrl: string, draft: RecapDraft): void {
  try {
    localStorage.setItem(draftKey(carnetContainerUrl), JSON.stringify(draft));
  } catch {
    // Stockage indisponible (mode privé, quota) : tant pis, on ne bloque pas.
  }
}

function loadDraft(carnetContainerUrl: string): RecapDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(carnetContainerUrl));
    if (!raw) return null;
    const draft = JSON.parse(raw) as RecapDraft;
    if (Date.now() - new Date(draft.savedAt).getTime() > DRAFT_MAX_AGE_MS) {
      clearDraft(carnetContainerUrl);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function clearDraft(carnetContainerUrl: string): void {
  try {
    localStorage.removeItem(draftKey(carnetContainerUrl));
  } catch {
    // Idem : l'absence de nettoyage n'est pas bloquante.
  }
}

/**
 * Pré-remplit le récapitulatif. Si le minuteur n'a jamais tourné (séance faite
 * sans l'app, puis loguée après coup), on part du programme prévu plutôt que
 * d'un relevé vide.
 */
function toRecapRows(steps: RunnableStep[], record: SessionRecord): RecapRow[] {
  const neverRan = record.startedAt === null;
  return steps.map((step, i) => ({
    step,
    complete: neverRan ? true : record.steps[i]?.completed ?? false,
    dureeSecondes: neverRan ? step.seconds : record.steps[i]?.elapsedSeconds ?? 0,
  }));
}

function renderRecapView(steps: RunnableStep[], ctx: SeanceContext, record: SessionRecord) {
  const rows = toRecapRows(steps, record);

  // Une séance déjà saisie mais jamais écrite reprend la main sur le relevé.
  const draft = loadDraft(ctx.carnetContainerUrl);
  const restored = draft !== null && draft.complete.length === rows.length;
  if (restored) {
    rows.forEach((row, i) => {
      row.complete = draft!.complete[i];
      row.dureeSecondes = draft!.dureeSecondes[i];
    });
  }

  const startedAt = restored && draft!.startedAt ? new Date(draft!.startedAt) : record.startedAt;
  // La durée de séance est la durée murale du minuteur (pauses et transitions
  // comprises), pas la somme des blocs chronométrés : une séance reste
  // mesurée même quand peu d'étapes le sont. Sans minuteur, on retombe sur
  // le programme prévu.
  const plannedSeconds = rows.reduce((sum, r) => sum + r.dureeSecondes, 0);
  const sessionSeconds = record.startedAt ? record.wallClockSeconds : plannedSeconds;
  const minutes = restored ? draft!.minutes : Math.round(sessionSeconds / 60);
  const ressentiValue = restored ? draft!.ressenti : "";

  app.innerHTML = `
    <main class="screen">
      <h1>Séance terminée</h1>
      <p class="lead">${ctx.carnetTitre}</p>
      ${restored ? `<p class="meta">Séance non enregistrée, restaurée depuis ce navigateur.</p>` : ""}
      <form id="recap-form">
        <fieldset class="recap-blocs">
          <legend>Étapes réalisées</legend>
          ${rows
            .map(
              (r, i) => `
            <label class="recap-bloc">
              <input type="checkbox" name="bloc" value="${i}" ${r.complete ? "checked" : ""} />
              <span>${r.step.label}</span>
              <span class="meta">${formatSeconds(r.dureeSecondes)}</span>
            </label>`
            )
            .join("")}
        </fieldset>
        <label for="duree">Durée réelle (minutes)</label>
        <input id="duree" name="duree" type="number" min="0" value="${minutes}" />
        <label for="ressenti">Ressenti</label>
        <textarea id="ressenti" name="ressenti" rows="3" placeholder="Fatigue, gêne, intensité…">${ressentiValue}</textarea>
        <p class="error" id="recap-error" hidden></p>
        <button type="submit" id="recap-save">Enregistrer sur le pod</button>
        <button type="button" id="recap-discard" class="ghost">Ne pas enregistrer</button>
      </form>
    </main>
  `;

  const form = document.querySelector<HTMLFormElement>("#recap-form")!;
  const dureeInput = document.querySelector<HTMLInputElement>("#duree")!;
  const ressentiInput = document.querySelector<HTMLTextAreaElement>("#ressenti")!;
  const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="bloc"]'));

  const readForm = () => ({
    complete: checkboxes.map((cb) => cb.checked),
    minutes: Number(dureeInput.value),
    ressenti: ressentiInput.value.trim(),
  });

  const persist = () => {
    const { complete, minutes: m, ressenti } = readForm();
    saveDraft(ctx.carnetContainerUrl, {
      savedAt: new Date().toISOString(),
      startedAt: startedAt ? startedAt.toISOString() : null,
      complete,
      dureeSecondes: rows.map((r) => r.dureeSecondes),
      minutes: m,
      ressenti,
    });
  };

  persist();
  form.addEventListener("input", persist);

  document.querySelector<HTMLButtonElement>("#recap-discard")!.addEventListener("click", () => {
    clearDraft(ctx.carnetContainerUrl);
    renderApp(ctx.webId).catch((err) => renderErrorView(ctx.webId, err));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = document.querySelector<HTMLButtonElement>("#recap-save")!;
    const errorEl = document.querySelector<HTMLParagraphElement>("#recap-error")!;
    const { complete, minutes: m, ressenti } = readForm();

    saveBtn.disabled = true;
    saveBtn.textContent = "Enregistrement…";
    errorEl.hidden = true;
    try {
      const duree = Math.max(0, Math.round(m * 60));
      if (ctx.legacy) {
        // Carnet d'avant les étapes typées : on continue d'écrire dans son
        // propre format plutôt que de mélanger deux vocabulaires dans un carnet.
        await logSeance(ctx.carnetContainerUrl, {
          modeleUrl: ctx.protocolUrl,
          dateRealisation: startedAt ?? new Date(),
          dureeReelleSecondes: duree,
          ressenti: ressenti || undefined,
          blocs: rows.map((r, i) => ({
            blocUrl: r.step.sourceStep.url,
            titre: r.step.label,
            complete: complete[i],
            dureeReelleSecondes: r.dureeSecondes,
          })),
        });
      } else {
        await logSession(ctx.carnetContainerUrl, {
          protocolUrl: ctx.protocolUrl || undefined,
          startedAt: startedAt ?? new Date(),
          durationSeconds: duree,
          feeling: ressenti || undefined,
          runs: rows.map((r, i) => ({
            ofStepUrl: r.step.sourceStep.url,
            title: r.step.label,
            completed: complete[i],
            durationSeconds: r.dureeSecondes,
          })),
        });
      }
      clearDraft(ctx.carnetContainerUrl);
      await renderApp(ctx.webId);
    } catch (err) {
      // La séance reste dans le brouillon : on ne perd rien en échouant ici.
      errorEl.textContent = isAuthError(err)
        ? `${describePodError(err)} La séance est gardée en local et te sera reproposée.`
        : describePodError(err);
      errorEl.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = "Enregistrer sur le pod";
    }
  });
}

main();
