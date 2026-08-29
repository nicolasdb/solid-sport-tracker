import "./style.css";
import { completeLogin, getSession, loginWithWebId, logout } from "./lib/auth";
import {
  carnetsContainer,
  createCarnet,
  ensureTrackerScaffold,
  getPrimaryPodUrl,
  listCarnetUrls,
  readCarnet,
  readSeanceModele,
} from "./lib/pod";
import { echauffementSemaine1 } from "./lib/example-programme";
import { SequenceTimer, formatSeconds, type TimerState } from "./lib/timer";
import type { SeanceModele } from "./vocab/carnet";

const DEFAULT_WEBID = "https://pod.nicolasdb.eu/nicolas/card#me";
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
      <p class="lead">Connecte-toi avec ton WebID — pas besoin de choisir un fournisseur, il est découvert depuis ton profil.</p>
      <form id="login-form">
        <label for="webid">WebID</label>
        <input id="webid" name="webid" type="url" value="${DEFAULT_WEBID}" required />
        <button type="submit">Se connecter</button>
      </form>
      ${message ? `<p class="error">${message}</p>` : ""}
    </main>
  `;

  const form = document.querySelector<HTMLFormElement>("#login-form")!;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const webId = (document.querySelector<HTMLInputElement>("#webid")!).value.trim();
    try {
      await loginWithWebId(webId);
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
  const msg = err instanceof Error ? err.message : String(err);
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

  app.innerHTML = `
    <main class="screen">
      <header class="topbar">
        <span>Connecté: <code>${webId}</code></span>
        <button id="logout">Se déconnecter</button>
      </header>
      <h1>${carnet.titre}</h1>
      ${carnet.objectif ? `<p class="lead">${carnet.objectif}</p>` : ""}
      ${carnet.frequence ? `<p class="meta">Fréquence: ${carnet.frequence}</p>` : ""}
      ${modele ? renderModeleSection(modele) : `<p>Ce carnet n'a pas encore de modèle de séance.</p>`}
    </main>
  `;

  document.querySelector<HTMLButtonElement>("#logout")!.addEventListener("click", async () => {
    await logout();
    renderLoginView();
  });

  if (modele) {
    wireTimer(modele);
  }
}

function renderModeleSection(modele: SeanceModele): string {
  const blocsList = modele.blocs
    .map(
      (b) => `
      <li>
        <strong>${b.titre}</strong> — ${formatSeconds(b.dureeSecondes)}
        ${
          b.exercices.length
            ? `<ul>${b.exercices
                .map((ex) => `<li>${ex.titre}${ex.repetitions ? ` — ${ex.repetitions}` : ""}</li>`)
                .join("")}</ul>`
            : ""
        }
      </li>`
    )
    .join("");

  return `
    <section>
      <h2>${modele.titre}</h2>
      <ol class="blocs">${blocsList}</ol>
    </section>
    <section id="timer" class="timer">
      <div class="timer-display">
        <span id="timer-label">Prêt</span>
        <span id="timer-remaining">${formatSeconds(modele.blocs[0]?.dureeSecondes ?? 0)}</span>
      </div>
      <div class="timer-controls">
        <button id="timer-toggle">Démarrer</button>
        <button id="timer-skip">Passer</button>
        <button id="timer-reset">Réinitialiser</button>
      </div>
    </section>
  `;
}

function wireTimer(modele: SeanceModele) {
  const timer = new SequenceTimer(modele.blocs.map((b) => ({ label: b.titre, seconds: b.dureeSecondes })));
  const label = document.querySelector<HTMLSpanElement>("#timer-label")!;
  const remaining = document.querySelector<HTMLSpanElement>("#timer-remaining")!;
  const toggleBtn = document.querySelector<HTMLButtonElement>("#timer-toggle")!;
  const skipBtn = document.querySelector<HTMLButtonElement>("#timer-skip")!;
  const resetBtn = document.querySelector<HTMLButtonElement>("#timer-reset")!;

  const render = (state: TimerState) => {
    label.textContent = state.done ? "Séance terminée !" : state.step?.label ?? "Prêt";
    remaining.textContent = formatSeconds(state.remaining);
    toggleBtn.textContent = state.running ? "Pause" : "Démarrer";
    toggleBtn.disabled = state.done;
    skipBtn.disabled = state.done;
  };

  timer.subscribe(render);

  toggleBtn.addEventListener("click", () => {
    const running = toggleBtn.textContent === "Pause";
    if (running) timer.pause();
    else timer.start();
  });
  skipBtn.addEventListener("click", () => timer.skip());
  resetBtn.addEventListener("click", () => timer.reset());
}

main();
