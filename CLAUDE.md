# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev       # Vite dev server
npm run build     # tsc && vite build
npm run preview   # preview built output
```

No test suite or linter is configured. Testing the UI requires a real Solid pod to
log in against — see "Testing locally" below.

### Testing locally

The app has no mock/offline mode: `npm run dev` gives you the login screen, but
completing WebID login needs a reachable Solid Identity Provider that the WebID's
profile declares (`solid:oidcIssuer`) and a pod with `pim:storage`. The companion
repo [`pocpod0`](https://github.com/nicolasdb/pocpod0) runs a Community Solid
Server instance used for this in dev — it must be running for auth to complete.

If `npm` is wrapped to run inside a podman/distrobox container on this machine,
make sure the wrapper passes the current working directory through (e.g. `podman
exec -w "$PWD" ...`) — otherwise `npm run <script>` fails with "Missing script"
because it resolves `package.json` from the container's root instead of the
mounted repo path.

**Do not run `npm run build` from that wrapped npm.** Rootless podman maps the
container user to a subuid (524288 here), so everything vite writes into
`dist/` ends up owned by an id the host user cannot unlink. The next build from
a normal shell then dies on `EACCES: permission denied, rmdir '…/dist/assets'`,
and `rm -rf dist` cannot clean it either — only `podman unshare rm -rf dist`
can, which is what `make clean` falls back to. Use `npm run check` (`tsc
--noEmit`, writes nothing) to verify code from the wrapped environment, and
leave `make vps-push` to produce the build from the user's own shell.

## Deployment

`make` (no target) prints the help, generated from `## ` comments on target
lines — keep new targets self-documenting that way.

Static SPA, built locally; only `dist/`, `docker-compose.yml` and `deploy/` are
rsynced to the VPS (`make vps-deploy`). Nothing compiles on the server, so there
is no node toolchain to maintain there.

`sportr.nicolasdb.eu` → container `sportr-web` (nginx alpine, `gateway` network)
→ behind `nginx-gateway`, which terminates TLS. This deliberately does **not**
serve files from the gateway itself: that would mean editing the shared
`hetzner-gateway` compose and restarting the proxy in front of every other
service. Proxying to a container is the pattern every other `conf.d` file uses.

The gateway vhost is versioned here as `deploy/gateway-14-sportr.conf` but must
be installed into `hetzner-gateway/nginx/conf.d/14-sportr.conf` and deployed
from that repo — it stays the source of truth for routing.

`dist/` is a bind mount, so a new build is served without restarting the
container; `vps-restart` is only needed after changing `deploy/nginx-site.conf`.

## Architecture

Single-page app, no framework — `src/main.ts` drives everything by directly
mutating DOM elements in `index.html` based on auth/session state. There is no
router or component system; "pages" are just conditionally shown/hidden sections.

Data flow: WebID → pod discovery → RDF read/write, no backend of its own. The app
*is* the client for a user's Solid pod; all persistent state (carnets, séance
models, preferences) lives on the pod as Turtle documents, not in this app.

- `src/lib/auth.ts` — login without a hardcoded OIDC provider.
  `loginWithIdentifier` accepts either an OIDC issuer URL (used as-is; the
  provider returns the WebID after redirect) or a WebID (`discoverOidcIssuer`
  fetches its profile document and reads `solid:oidcIssuer`). An identifier
  containing `#` is treated as a WebID without probing. Wraps
  `@inrupt/solid-client-authn-browser` (`login`, `handleIncomingRedirect`,
  `getDefaultSession`) and re-exports its authenticated `fetch` for use by `pod.ts`.
- `src/lib/pod.ts` — all reads/writes to the pod, via `@inrupt/solid-client`.
  Key entry points: `getPrimaryPodUrl` (two-tier pod-root discovery, see below),
  `ensureTrackerScaffold` (idempotent: creates `/sport-tracker/` and
  `/sport-tracker/carnets/`), `listCarnetUrls`/`readCarnet`/`readSeanceModele`/
  `readPreferences` for reading. No ACL handling anywhere — new resources
  inherit access control from the nearest parent container.
  **Logging in writes nothing.** The scaffold is created only from an explicit
  user action (opening a carnet), never on login: connecting to a pod must
  leave it exactly as it was, and the create screen states what it will write.
  `preferences.ttl` is deliberately not part of the scaffold — `readPreferences`
  works without it, and an empty preferences document has no reason to exist
  before a preference is set. `listCarnetUrls` therefore treats a missing
  container as "no carnets", not as an error.
- `src/vocab/protocol.ts` — the `act:` vocabulary and the TS types behind it:
  `Protocol` (recipe) → `Logbook` (one person's engagement in it) → `Session`
  (one run), plus the typed steps (`TimedStep`, `CountedStep`, `IntervalStep`,
  `ChecklistStep`, `RepeatStep`). Change the vocabulary here first, then
  `docs/data-model.md`, then the read/write code in `protocol-pod.ts`.
  `flattenSteps` expands repeats and explodes intervals into per-phase steps —
  that flattened list is what the timer and the programme list both consume, so
  their indices stay aligned by construction.
- `src/lib/protocol-pod.ts` — everything `act:`: `readProtocol` (any URI),
  `createLogbookFromProtocol` (**copies** the protocol into the logbook and
  keeps the origin URI as provenance only), `logSession`/`readSession`.
- `src/vocab/carnet.ts` — the older `st:` vocabulary. Read-only in practice:
  carnets written before typed steps are converted on read (`legacyToSteps` in
  `main.ts`), and their sessions keep being written in their own format so a
  single carnet never mixes two vocabularies. No migration exists, on purpose.
- `src/lib/timer.ts` — `SequenceTimer`, a sequential timer over a séance's
  blocks (start/pause/skip/reset). Deliberately independent of pod/DOM code so
  it can be tested/reasoned about in isolation. It does **not** auto-chain: when
  a block's time runs out it arms the next one and sets `awaitingReady`, waiting
  for `start()` as the user's go-ahead, so there's a breather between blocks.
  `getSnapshot()` exposes state for click handlers; `subscribe()` for rendering.
  `getRecord()` returns what actually happened (start time, per-block elapsed
  and completed/skipped) — the session log is a byproduct of running the timer,
  not separate data entry.
  **Time is measured as `Date.now()` deltas, never by counting ticks.** Android
  throttles a backgrounded tab's `setInterval` to ~1/min and freezes it after a
  few minutes: a tick-counting timer silently under-reported real durations by
  more than half. The interval only drives repainting; `resync()` recomputes
  from the clock and is called on `visibilitychange`. `wallClockSeconds` (whole
  session, pauses included) is what gets logged as the session duration, so a
  séance is measured even when few steps are timed.
- `src/lib/wake-lock.ts` — `ScreenWakeLock`, keeps the screen on during a
  session. The browser drops the lock whenever the page is hidden, hence
  `reacquire()` on `visibilitychange`; unsupported (Firefox mobile, insecure
  contexts) degrades silently rather than erroring.
- `src/lib/signals.ts` — `SessionSignals`: beeps (Web Audio, no asset to
  load) and vibration, so a session can be followed without looking at the
  screen. `PATTERNS` maps event → tones + vibration and is the single place to
  refine the haptic vocabulary; the intent is a pattern per step type, today
  it is a pattern per event. Two constraints that shape the code: `navigator.
  vibrate` does not exist on iOS Safari and does nothing while the page is
  hidden (which is why the screen lock matters), and an `AudioContext` starts
  suspended unless created from a user gesture — hence `arm()` on the
  Démarrer tap.
  Sound/haptic/screen toggles are stored in `localStorage`, **not** on the
  pod: they describe the device and the room (silent yoga class vs running
  with headphones), not the user.
- `public/recipes/echauffement.ttl` — the example recipe, in Turtle, served by
  the app itself. Loaded **by URI**, never imported from code: the discovery
  path a third-party recipe would take is exercised from the first carnet on.
  It deliberately uses all four step types and nesting.

### Session logging

Design decisions worth preserving:

- **Capture is passive, confirmation is explicit.** The timer records
  everything mechanical; the recap screen (`renderRecapView`) asks only what the
  timer cannot infer — whether a skipped block was actually skipped, and how it
  felt. Deliberately *not* per-step checkboxes during the session: that is
  friction exactly when the user's hands are busy, and `skip()` already carries
  the signal.
- **One recap screen serves both entry paths.** Reached automatically when the
  last block ends, or via "Terminer". If the timer never ran (`startedAt ===
  null`), `toRecapRows` prefills from the planned programme instead of an empty
  record — that is the "did it this morning, logging it now" path. Do not build
  a second logger for it.
- **A single write at the end** (`logSeance`), not incremental. Mid-workout
  writes mean network failures during exercise and half-written records.
- `st:BlocRealise` copies `st:titre` alongside `st:baseSurBloc` so a log stays
  readable if the model is edited later.
- Booleans are integers 0/1 (`st:complete`, `st:afficherTimer`) to stay on
  `getInteger`/`setInteger`; see the note in `docs/data-model.md`.

- **The recap is drafted to `localStorage`** (keyed by carnet container URL, 24h
  expiry) from the moment it opens and on every edit, cleared only after a
  successful write or an explicit discard. Until `logSeance` succeeds, that
  draft is the only copy of the séance — a failed write, an expired session, or
  a closed tab would otherwise lose work the user actually did. `renderApp`
  surfaces a pending draft as a "Reprendre" banner, without which the draft is
  invisible.

On a private pod **every** request fails with 401 once the token expires,
including the existence probes in `ensureContainer`/`exists` — so a raw 401
says nothing about the resource. Route those through `isAuthError` and report
an expired session rather than surfacing the server's error graph.

### History read-back

CSS has **no SPARQL SELECT endpoint** — it supports SPARQL/N3 PATCH for updating
a single resource, but nothing queries across resources. So aggregates are the
client's job, and reads are tiered by cost:

1. **Container listing** (1 request) — `listSeanceUrls` plus `seanceDayFromUrl`
   yields every trained day from the *filenames*, with no document fetches. The
   calendar and streak are built entirely from this.
2. **One document** (on demand) — `readSeance`, only when a day is tapped.
3. **A window of documents** — needed for per-block adherence stats. Not built;
   the plan is a client-side fold over the most recent ~30 séances rather than
   mirroring into Oxigraph, to keep the pod the only dependency.

Filenames are a *hint*, not truth: they can carry an `-HHMMSS` collision suffix
and encode a local date. `st:dateRealisation` is authoritative once a document
is open. A day can hold several séances, hence `Map<day, url[]>`.

`wireTabs` toggles `hidden` on two coexisting views rather than re-rendering.
Re-rendering would destroy a running timer and its listeners — do not "simplify"
this into a render-per-tab.

### Mobile layout constraints

The session view is built mobile-first and there are a few things not to undo:

- `.session` uses `height: 100dvh`, not `vh` — `vh` ignores retracting browser
  bars and pushes the timer controls underneath them.
- The timer bar and `.screen` carry `env(safe-area-inset-*)` padding; `index.html`
  sets `viewport-fit=cover`, without which those insets always resolve to zero.
- On screens ≤540px the program list shows only the current block plus
  `LOOKAHEAD` (2) upcoming ones. `wireTimer` sets `is-current`/`is-past`/`is-far`
  on each `li.bloc` and CSS hides the latter two.

The programme list and the timer are both built from the same `flattenSteps`
output, in the same order. Any filtering or expansion must happen there and
nowhere else: doing it in one place only would desynchronize the list indices
from the timer's `stepIndex`, and the wrong step would be highlighted.

### Pod-root discovery

`getPrimaryPodUrl` resolves the pod root in two tiers, and this ordering matters:

1. `getPodUrlAll` — the `pim:storage` triple in the WebID profile. Canonical,
   one fetch.
2. `findStorageByLinkHeaders` — walk up the URI path hierarchy issuing `HEAD`
   requests, stopping at the first ancestor advertising
   `Link: <http://www.w3.org/ns/pim/space#Storage>; rel="type"`. The Solid
   protocol requires every server to advertise this, so it works on pods whose
   profile predates automatic `pim:storage` writing (older CSS versions did not
   write it at signup).

**Stop at the first match when walking up.** A multi-pod CSS advertises
`pim:Storage` on its own server root as well, so continuing past the first hit
yields the server root instead of the user's pod — wrong, and not writable.

Do not fall back to deriving the pod root by string-parsing the WebID URL: it
happens to work for CSS's `/<user>/profile/card` layout but has no spec basis,
since identity and storage are deliberately decoupled in Solid.

**The app currently assumes the discovered storage root is writable, and that
assumption breaks for any identity that does not own a pod.** An agent WebID
hosted inside someone's pod (`…/nicolas_claude/agents/agent-pink2#me`) resolves
to that person's storage, where it holds no rights: the server answers 403 at
the root even though the session is perfectly valid. Such an identity is not an
alias on the hosting pod — it only has what it was granted, container by
container. Making the tracker usable from a delegated or shared identity means
a **configurable working container** rather than one derived from
`pim:storage`, which is also what the `docs/todo-tracker-kit-dashboard.md`
decision "no `pim:storage` to a collective pod" already implies. Not built.

### Data model

Full schema, container layout, and a worked Turtle example are in
`docs/data-model.md`. Summary of the pod layout under `<pod>/sport-tracker/`:

```
preferences.ttl        # st:Preferences — drives dynamic UI (active carnet, etc.)
carnets/<carnet-id>/
  logbook.ttl           # act:Logbook — metadata + provenance of the recipe
  protocol.ttl          # act:Protocol — local copy, typed steps
  sessions/<date>.ttl   # act:Session + act:StepRun
```

Carnets written before typed steps instead hold `carnet.ttl` / `modele.ttl` /
`seances/<date>.ttl` in the `st:` vocabulary; both layouts are read, and the
history view merges the two session containers so continuity stays readable
across the change.

One carnet = one container, so a per-carnet `.acl` can later scope sharing
(e.g. with a coach) without exposing other carnets.

## Current state (POC) — not yet implemented

The focus is UX/UI and authoring: exercising the recipe → carnet → session
vocabulary on real recipes is what the rest depends on. See
`docs/todo-tracker-kit-dashboard.md` §1.

- **Analytics is out of scope on purpose** — adherence stats and progression
  belong to the dashboard, not here. The calendar stays as a continuity
  overview and as the way to check a session actually reached the pod without
  switching apps.
- Writing a recipe from natural language — a skill that runs outside the app,
  so the tracker stays dumb, offline-capable and free of any model dependency.
  The human validates a readable summary, never Turtle.
- UI actually driven by preferences — today the app just shows the first carnet
  found; wiring `st:carnetActif` to choose the active carnet is pending.
- Picking among several carnets, and unlocking a further stage of a
  multi-stage recipe.
