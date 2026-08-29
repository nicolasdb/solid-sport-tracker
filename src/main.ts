import "./style.css";
import { completeLogin, getSession, loginWithIdentifier, logout } from "./lib/auth";
import {
  carnetsContainer,
  createCarnet,
  ensureTrackerScaffold,
  describePodError,
  getPrimaryPodUrl,
  isAuthError,
  listCarnetUrls,
  listSeanceUrls,
  logSeance,
  readCarnet,
  readSeance,
  readSeanceModele,
  seanceDayFromUrl,
} from "./lib/pod";
import { echauffementSemaine1 } from "./lib/example-programme";
import {
  SequenceTimer,
  formatSeconds,
  type SessionRecord,
  type TimerState,
} from "./lib/timer";
import type { Bloc } from "./vocab/carnet";

const DEFAULT_IDENTIFIER = "https://pod.nicolasdb.eu/";
const app = document.querySelector<HTMLDivElement>("#app")!;

async function main() {
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

async function renderApp(webId: string) {
  const podUrl = await getPrimaryPodUrl(webId);
  console.info("[sport-tracker] WebID:", webId, "→ racine du pod:", podUrl);
  await ensureTrackerScaffold(podUrl);
  const carnetUrls = await listCarnetUrls(podUrl);

  if (carnetUrls.length === 0) {
    app.innerHTML = `
      <main class="screen">
        <p class="lead">Connecté en tant que <code>${webId}</code>.</p>
        <p>Aucun carnet trouvé sous <code>${carnetsContainer(podUrl)}</code>.</p>
        <button id="create-example">Créer le carnet d'exemple: "${echauffementSemaine1.titre}"</button>
        <button id="logout">Se déconnecter</button>
      </main>
    `;
    document.querySelector<HTMLButtonElement>("#create-example")!.addEventListener("click", async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = "Création en cours…";
      try {
        await createCarnet(podUrl, echauffementSemaine1);
        await renderApp(webId);
      } catch (err) {
        renderErrorView(webId, err);
      }
    });
    document.querySelector<HTMLButtonElement>("#logout")!.addEventListener("click", async () => {
      await logout();
      renderLoginView();
    });
    return;
  }

  const carnet = await readCarnet(carnetUrls[0]);
  const modele = carnet.seanceModeleUrl ? await readSeanceModele(carnet.seanceModeleUrl) : null;

  // Le minuteur ignore les blocs sans durée ; on filtre ici aussi pour que les
  // index de la liste affichée et ceux du minuteur restent alignés.
  const blocs = modele ? modele.blocs.filter((b) => b.dureeSecondes > 0) : [];

  const ctx: SeanceContext = {
    webId,
    carnetContainerUrl: carnetUrls[0],
    carnetTitre: carnet.titre,
    modeleUrl: carnet.seanceModeleUrl ?? "",
  };
  const hasDraft = loadDraft(ctx.carnetContainerUrl) !== null;

  app.innerHTML = `
    <main class="session">
      <header class="topbar">
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
        <h1>${carnet.titre}</h1>
        ${carnet.objectif ? `<p class="lead">${carnet.objectif}</p>` : ""}
        ${carnet.frequence ? `<p class="meta">Fréquence: ${carnet.frequence}</p>` : ""}
        ${
          blocs.length
            ? `<h2>${modele!.titre}</h2><ol class="blocs">${blocs.map(renderBloc).join("")}</ol>`
            : `<p>Ce carnet n'a pas encore de modèle de séance chronométrable.</p>`
        }
      </div>
      <div class="session-scroll" id="view-historique" hidden></div>
      ${blocs.length ? renderTimerBar(blocs[0].dureeSecondes) : ""}
    </main>
  `;

  wireTabs(ctx);

  document.querySelector<HTMLButtonElement>("#logout")!.addEventListener("click", async () => {
    await logout();
    renderLoginView();
  });

  if (hasDraft) {
    document.querySelector<HTMLButtonElement>("#resume-recap")!.addEventListener("click", () => {
      // Le brouillon fournit le relevé ; l'enregistrement vide sert juste de base.
      renderRecapView(blocs, ctx, { startedAt: null, totalElapsedSeconds: 0, steps: [] });
    });
  }

  if (blocs.length) {
    wireTimer(blocs, ctx);
  }
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
    const urls = await listSeanceUrls(ctx.carnetContainerUrl);
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
    const done = days.has(key);
    cells.push(
      done
        ? `<button class="day is-done" data-day="${key}">${d}</button>`
        : `<span class="day">${d}</span>`
    );
  }

  const monthCount = [...days].filter((d) => d.startsWith(`${year}-${String(monthIndex + 1).padStart(2, "0")}`)).length;

  container.innerHTML = `
    <div class="streak">
      <strong>${streak}</strong> jour${streak > 1 ? "s" : ""} d'affilée
      <span class="meta">· ${byDay.size} séance${byDay.size > 1 ? "s" : ""} au total</span>
    </div>
    <div class="cal-head">
      <button id="cal-prev" class="ghost">‹</button>
      <span>${MOIS[monthIndex]} ${year} <span class="meta">· ${monthCount}</span></span>
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
      showSeanceDetail(byDay.get(btn.dataset.day!)![0]);
    });
  });
}

async function showSeanceDetail(url: string) {
  const panel = document.querySelector<HTMLElement>("#seance-detail")!;
  panel.innerHTML = `<p class="lead">Lecture…</p>`;
  try {
    const seance = await readSeance(url);
    const date = seance.dateRealisation;
    panel.innerHTML = `
      <section class="detail">
        <h3>${date ? date.toLocaleDateString("fr-FR", { dateStyle: "full" }) : "Séance"}</h3>
        <p class="meta">Durée réelle : ${formatSeconds(seance.dureeReelleSecondes)}</p>
        <ul class="detail-blocs">
          ${seance.blocs
            .map(
              (b) => `<li class="${b.complete ? "is-done" : "is-skipped"}">
                <span>${b.complete ? "✓" : "✗"}</span>
                <span>${b.titre}</span>
                <span class="meta">${formatSeconds(b.dureeReelleSecondes)}</span>
              </li>`
            )
            .join("")}
        </ul>
        ${seance.ressenti ? `<p class="ressenti">${seance.ressenti}</p>` : ""}
      </section>
    `;
  } catch (err) {
    panel.innerHTML = `<p class="error">${describePodError(err)}</p>`;
  }
}

interface SeanceContext {
  webId: string;
  carnetContainerUrl: string;
  carnetTitre: string;
  modeleUrl: string;
}

function renderBloc(bloc: Bloc, index: number): string {
  const exercices = bloc.exercices.length
    ? `<ul>${bloc.exercices
        .map((ex) => `<li>${ex.titre}${ex.repetitions ? ` — ${ex.repetitions}` : ""}</li>`)
        .join("")}</ul>`
    : "";
  return `
    <li class="bloc" data-index="${index}">
      <strong>${bloc.titre}</strong> <span class="meta">${formatSeconds(bloc.dureeSecondes)}</span>
      ${exercices}
    </li>`;
}

function renderTimerBar(firstDuration: number): string {
  return `
    <section id="timer" class="timer">
      <div class="timer-display">
        <span id="timer-label">Prêt</span>
        <span id="timer-remaining">${formatSeconds(firstDuration)}</span>
      </div>
      <div class="timer-controls">
        <button id="timer-toggle">Démarrer</button>
      </div>
      <div class="timer-controls secondary">
        <button id="timer-skip" class="ghost">Passer</button>
        <button id="timer-reset" class="ghost">Réinit.</button>
        <button id="timer-finish" class="ghost">Terminer</button>
      </div>
    </section>
  `;
}

/** Nombre de blocs suivants gardés visibles sur petit écran, en plus du bloc courant. */
const LOOKAHEAD = 2;

function wireTimer(blocs: Bloc[], ctx: SeanceContext) {
  const timer = new SequenceTimer(blocs.map((b) => ({ label: b.titre, seconds: b.dureeSecondes })));
  const label = document.querySelector<HTMLSpanElement>("#timer-label")!;
  const remaining = document.querySelector<HTMLSpanElement>("#timer-remaining")!;
  const toggleBtn = document.querySelector<HTMLButtonElement>("#timer-toggle")!;
  const skipBtn = document.querySelector<HTMLButtonElement>("#timer-skip")!;
  const resetBtn = document.querySelector<HTMLButtonElement>("#timer-reset")!;
  const finishBtn = document.querySelector<HTMLButtonElement>("#timer-finish")!;
  const timerSection = document.querySelector<HTMLElement>("#timer")!;
  const blocItems = Array.from(document.querySelectorAll<HTMLLIElement>("li.bloc"));

  let recapOpened = false;
  const openRecap = () => {
    if (recapOpened) return;
    recapOpened = true;
    timer.pause();
    renderRecapView(blocs, ctx, timer.getRecord());
  };

  const render = (state: TimerState) => {
    if (state.done) {
      label.textContent = "Séance terminée !";
      toggleBtn.textContent = "Démarrer";
      // Dernier bloc fini : on bascule directement sur le récapitulatif.
      queueMicrotask(openRecap);
    } else if (state.awaitingReady) {
      label.textContent = `Prêt pour : ${state.step?.label ?? ""} ?`;
      toggleBtn.textContent = "Je suis prêt";
    } else {
      label.textContent = state.step?.label ?? "Prêt";
      toggleBtn.textContent = state.running ? "Pause" : "Démarrer";
    }

    remaining.textContent = formatSeconds(state.remaining);
    toggleBtn.disabled = state.done;
    skipBtn.disabled = state.done;
    timerSection.classList.toggle("is-awaiting", state.awaitingReady);

    // Sur petit écran on ne garde que le bloc courant et les suivants proches :
    // le reste du programme est masqué par CSS via ces classes.
    blocItems.forEach((item, index) => {
      const offset = index - state.stepIndex;
      item.classList.toggle("is-current", !state.done && offset === 0);
      item.classList.toggle("is-past", !state.done && offset < 0);
      item.classList.toggle("is-far", !state.done && offset > LOOKAHEAD);
    });
  };

  timer.subscribe(render);

  toggleBtn.addEventListener("click", () => {
    if (timer.getSnapshot().running) timer.pause();
    else timer.start();
  });
  skipBtn.addEventListener("click", () => timer.skip());
  resetBtn.addEventListener("click", () => {
    recapOpened = false;
    timer.reset();
  });
  finishBtn.addEventListener("click", openRecap);
}

interface RecapRow {
  bloc: Bloc;
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
function toRecapRows(blocs: Bloc[], record: SessionRecord): RecapRow[] {
  const neverRan = record.startedAt === null;
  return blocs.map((bloc, i) => ({
    bloc,
    complete: neverRan ? true : record.steps[i]?.completed ?? false,
    dureeSecondes: neverRan ? bloc.dureeSecondes : record.steps[i]?.elapsedSeconds ?? 0,
  }));
}

function renderRecapView(blocs: Bloc[], ctx: SeanceContext, record: SessionRecord) {
  const rows = toRecapRows(blocs, record);

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
  const totalSeconds = rows.reduce((sum, r) => sum + r.dureeSecondes, 0);
  const minutes = restored ? draft!.minutes : Math.round(totalSeconds / 60);
  const ressentiValue = restored ? draft!.ressenti : "";

  app.innerHTML = `
    <main class="screen">
      <h1>Séance terminée</h1>
      <p class="lead">${ctx.carnetTitre}</p>
      ${restored ? `<p class="meta">Séance non enregistrée, restaurée depuis ce navigateur.</p>` : ""}
      <form id="recap-form">
        <fieldset class="recap-blocs">
          <legend>Blocs réalisés</legend>
          ${rows
            .map(
              (r, i) => `
            <label class="recap-bloc">
              <input type="checkbox" name="bloc" value="${i}" ${r.complete ? "checked" : ""} />
              <span>${r.bloc.titre}</span>
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
      await logSeance(ctx.carnetContainerUrl, {
        modeleUrl: ctx.modeleUrl,
        dateRealisation: startedAt ?? new Date(),
        dureeReelleSecondes: Math.max(0, Math.round(m * 60)),
        ressenti: ressenti || undefined,
        blocs: rows.map((r, i) => ({
          blocUrl: r.bloc.url,
          titre: r.bloc.titre,
          complete: complete[i],
          dureeReelleSecondes: r.dureeSecondes,
        })),
      });
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
