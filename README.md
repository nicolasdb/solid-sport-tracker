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

Au chargement, l'app propose un champ WebID (préremplit
`https://pod.nicolasdb.eu/nicolas/card#me`). La connexion lit le profil
WebID pour trouver `solid:oidcIssuer`, puis redirige vers ce fournisseur —
aucun provider n'est codé en dur côté app.

## Architecture

- `src/lib/auth.ts` — découverte du fournisseur OIDC depuis le WebID +
  wrapper autour de `@inrupt/solid-client-authn-browser`.
- `src/lib/pod.ts` — lecture des ressources du pod (carnets, modèle de
  séance, préférences) via `@inrupt/solid-client`.
- `src/lib/timer.ts` — minuteur séquentiel, enchaîne les blocs d'une séance
  (`SequenceTimer`), indépendant du reste pour rester testable seul.
- `src/vocab/carnet.ts` — prédicats du vocabulaire `st:` + types TS
  correspondants.
- `docs/data-model.md` — schéma complet en Turtle, layout des containers sur
  le pod, exemple concret basé sur un vrai programme.

## État actuel (POC)

- ✅ Login WebID → découverte OIDC → session Solid.
- ✅ Lecture du premier carnet trouvé sous `/sport-tracker/carnets/` et de
  son modèle de séance.
- ✅ Timer séquentiel sur les blocs de la séance (démarrer/pause/passer/
  réinitialiser).
- ⏳ Écriture sur le pod (créer un carnet depuis un programme collé, logger
  une séance réalisée) — pas encore implémenté, lecture seule pour l'instant.
- ⏳ UI vraiment "dynamique selon les préférences" — aujourd'hui l'app
  affiche juste le premier carnet trouvé; le choix du carnet actif via
  `st:carnetActif` (préférences) reste à brancher.
- ⏳ Extraction d'un programme texte (comme celui de la semaine 1) vers la
  structure RDF `st:SeanceModele`/`st:Bloc`/`st:Exercice` — à faire en
  assisté (LLM + validation avant écriture), pas en automatique pur.

## Prérequis sur le pod

Le WebID doit déclarer un `pim:storage` (racine du pod) et un
`solid:oidcIssuer`, ce qui est standard sur Community Solid Server / NSS.
Le container `/sport-tracker/carnets/<id>/` avec `carnet.ttl` et
`modele.ttl` doit exister pour qu'un carnet s'affiche — voir
`docs/data-model.md` pour la structure exacte et un exemple.
