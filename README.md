# Solid Sport Tracker

App de tracking sportif qui vit sur ton Solid Pod : login via WebID
(découverte automatique du fournisseur OIDC, pas de sélecteur de provider),
préférences et carnets de suivi stockés et lus directement sur le pod, UI
composée dynamiquement à partir de ces données.

Décorrélée de [`pocpod0`](https://github.com/nicolasdb/pocpod0) — celui-ci
fait tourner l'infra pod (Community Solid Server) utilisée en dev, mais
l'app elle-même est un projet à part.

## Démarrer

```bash
npm install
npm run dev
```

Au chargement, l'app propose un champ acceptant indifféremment l'adresse
d'un pod ou un WebID. Donner directement le fournisseur (ex:
`https://pod.nicolasdb.eu/`) évite la lecture du profil — c'est lui qui
rend le WebID après redirection. Donner un WebID fait lire son profil pour
y trouver `solid:oidcIssuer`, utile quand on ne connaît pas le fournisseur.
Dans les deux cas aucun provider n'est codé en dur côté app.

## Déploiement

`make` seul liste les cibles. L'app est un SPA statique : le build est produit
localement, seul `dist/` part sur le VPS — rien n'y est compilé.

```bash
make vps-diff     # montre ce qu'un push changerait, sans rien écrire
make vps-deploy   # build + rsync + docker compose up -d
```

`sportr.nicolasdb.eu` est servi par le conteneur `sportr-web`
(`docker-compose.yml`, nginx alpine sur le réseau `gateway`), derrière
`nginx-gateway` qui assure TLS et routage. Le vhost à installer dans
[`hetzner-gateway`](https://github.com/nicolasdb/hetzner-gateway) est versionné
ici : `deploy/gateway-12-sportr.conf` — à copier en `nginx/conf.d/12-sportr.conf`
puis déployer depuis ce dépôt-là, qui reste la source de vérité du routage.

`dist/` est monté en volume : un simple `make vps-push` suffit à publier un
nouveau build, sans redémarrer le conteneur.

## Architecture

- `src/lib/auth.ts` — résolution du fournisseur OIDC (URL de fournisseur
  donnée telle quelle, ou découverte via `solid:oidcIssuer` dans le profil
  WebID) + wrapper autour de `@inrupt/solid-client-authn-browser`.
- `src/lib/pod.ts` — lecture des ressources du pod (carnets, modèle de
  séance, préférences) via `@inrupt/solid-client`. La racine du pod est
  trouvée via `pim:storage`, avec repli sur la remontée par en-têtes
  `Link: <pim:Storage>; rel="type"` (voir ci-dessous).
- `src/lib/timer.ts` — minuteur séquentiel, enchaîne les blocs d'une séance
  (`SequenceTimer`), indépendant du reste pour rester testable seul.
- `src/vocab/carnet.ts` — prédicats du vocabulaire `st:` + types TS
  correspondants.
- `src/lib/example-programme.ts` — le programme "Échauffement quotidien"
  (semaine 1) encodé en `NewCarnet`, utilisé pour tester l'écriture de bout
  en bout.
- `docs/data-model.md` — schéma complet en Turtle, layout des containers sur
  le pod, exemple concret basé sur un vrai programme.

## État actuel (POC)

- ✅ Login WebID → découverte OIDC → session Solid.
- ✅ Lecture du premier carnet trouvé sous `/sport-tracker/carnets/` et de
  son modèle de séance.
- ✅ Timer séquentiel sur les blocs de la séance (démarrer/pause/passer/
  réinitialiser). En fin de bloc il n'enchaîne pas tout seul : il arme le
  bloc suivant et attend le feu vert, pour laisser souffler.
- ✅ UI pensée mobile : colonne pleine hauteur en `dvh`, minuteur ancré en
  bas avec marges `env(safe-area-inset-*)` pour ne pas passer sous les
  barres du navigateur, et programme réduit au bloc courant + 2 suivants
  sur petit écran.
- ✅ Écriture sur le pod : `ensureTrackerScaffold` crée `/sport-tracker/`,
  `/sport-tracker/carnets/` et `preferences.ttl` s'ils n'existent pas encore
  (appelé automatiquement au login) ; `createCarnet` écrit un carnet complet
  (container + `carnet.ttl` + `modele.ttl`). Rien n'écrit d'ACL — les
  ressources créées héritent du contrôle d'accès du container parent le plus
  proche, privé par défaut sur un pod perso.
- ✅ Logger une séance réalisée (`st:SeanceInstance` + `st:BlocRealise`).
  Le minuteur relève passivement ce qui s'est passé (heure de départ, durée
  réelle par bloc, blocs passés) ; en fin de séance — ou via « Terminer » —
  un récapitulatif pré-rempli laisse corriger les blocs faits, ajuster la
  durée et saisir un ressenti, puis écrit `seances/<date>.ttl` en un seul
  write. Sans minuteur lancé, le récapitulatif part du programme prévu :
  c'est le chemin pour loguer une séance faite sans l'app.
- ✅ Brouillon local du récapitulatif (`localStorage`, 24 h) : une séance
  saisie mais non écrite survit à un échec réseau, une session expirée ou
  une fermeture d'onglet, et un bandeau « Reprendre » la repropose.
- ✅ Relecture de l'historique : onglet « Historique » avec série de jours
  d'affilée et calendrier mensuel des séances, un jour cliquable ouvrant le
  détail (blocs faits/passés, durée, ressenti). Lecture en paliers — le
  calendrier ne coûte qu'un listing de container, le détail n'est chargé
  qu'à la demande.
- ⏳ Statistiques d'assiduité par bloc (« je saute la mobilité 40 % du
  temps ») — nécessite d'agréger plusieurs séances, prévu côté client sur
  une fenêtre glissante.
- ⏳ UI vraiment "dynamique selon les préférences" — aujourd'hui l'app
  affiche juste le premier carnet trouvé; le choix du carnet actif via
  `st:carnetActif` (préférences) reste à brancher.
- ⏳ Extraction d'un programme texte (comme celui de la semaine 1) vers la
  structure RDF `st:SeanceModele`/`st:Bloc`/`st:Exercice` — à faire en
  assisté (LLM + validation avant écriture), pas en automatique pur. En
  attendant, `src/lib/example-programme.ts` sert de cas de test écrit à la
  main pour valider le chemin d'écriture de bout en bout.

## Prérequis sur le pod

Le WebID doit déclarer un `solid:oidcIssuer` (standard sur Community Solid
Server / NSS), sauf si on se connecte en donnant directement l'adresse du
fournisseur.

Pour trouver la racine du pod, l'app lit d'abord `pim:storage` dans le
profil WebID. Si le triple est absent — cas des pods créés par un serveur
antérieur à son écriture automatique — elle remonte la hiérarchie d'URI en
`HEAD` jusqu'au premier ancêtre annonçant
`Link: <http://www.w3.org/ns/pim/space#Storage>; rel="type"`, ce que le
protocole Solid impose à tout serveur. On s'arrête au **premier** ancêtre :
un CSS multi-pods annonce aussi sa racine serveur, qui n'est pas le pod de
l'usager. Aucune saisie manuelle n'est donc nécessaire sur un serveur
conforme.

Rien d'autre n'est requis à l'avance : au premier login, l'app crée
`/sport-tracker/`, `/sport-tracker/carnets/` et `preferences.ttl` s'ils
n'existent pas, et propose de créer le carnet d'exemple si aucun carnet
n'est trouvé. Voir `docs/data-model.md` pour la structure exacte.
