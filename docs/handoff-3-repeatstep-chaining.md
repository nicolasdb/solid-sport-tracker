# Handoff — chaînage optionnel pour `act:RepeatStep`

**Repo :** `nicolasdb/solid-sport-tracker`
**Origine :** test réel d'une recette d'échauffement course à pied (session
du 2026-09-07), voir note de séance : *"La série squat > gainage pourrait
s'enchaîner sans le 'prêt'."*

## Le problème

`act:RepeatStep` (ex. 3 tours de squats + montées de genoux + talons-fesses +
montées sur pointes + gainage) attend une validation manuelle entre chaque
étape enfant, y compris entre deux `act:CountedStep`/`act:TimedStep`
consécutifs dans le même tour. Pour un circuit voulu comme un enchaînement
fluide, ça casse le rythme — chaque transition demande un tap.

`act:IntervalStep` n'a pas ce problème : ses phases s'enchaînent seules
(`chain: true` dans `flattenSteps`), sauf à l'entrée du tout premier
intervalle. C'est délibéré (voir le commentaire sur `chain` dans
`src/vocab/protocol.ts`) — mais ce comportement n'existe que pour
`IntervalStep`, pas pour `RepeatStep`.

Aujourd'hui, la seule façon de forcer un enchaînement fluide est de
modéliser le circuit comme un `IntervalStep` — ce qui oblige à convertir
chaque exercice compté en une phase chronométrée, perdant l'information
« 10 répétitions » au profit d'une durée arbitraire. Pas un bon compromis.

## Proposition

Étendre `act:RepeatStep` avec un flag optionnel de chaînage, symétrique à ce
qu'`IntervalStep` fait déjà pour ses phases.

### 1. `src/vocab/protocol.ts`

- Ajouter le prédicat `act.chain` (ou réutiliser un terme existant si un
  meilleur nom se dégage) à l'objet `act`.
- `RepeatStep` interface : ajouter un champ optionnel, ex. `chain?: boolean`
  (défaut `false` — comportement actuel inchangé si absent, pas de rupture
  pour les recettes existantes).
- `flattenSteps` — cas `"repeat"` : quand `step.chain` est vrai, propager
  `chain: true` sur toutes les occurrences sauf la toute première de la
  toute première itération (même logique que pour `IntervalStep` : seule
  l'entrée dans le groupe attend le feu vert, tout le reste s'enchaîne,
  frontière de tour comprise).
- Attention à `RecordStep` imbriquée dans un `RepeatStep` chaîné : une
  `RecordStep` a déjà sa propre logique de `chain` interne (effort
  chronométré → saisie enchaînée). Le chaînage du parent ne doit pas casser
  ça ; il s'agit seulement de ne plus réintroduire un "prêt" *entre* les
  étapes du groupe.

### 2. Turtle / lecture

- Nouveau prédicat `act:chain` (ou nom retenu), booléen, optionnel sur
  `act:RepeatStep`. Absence = comportement actuel (validation entre
  chaque étape).
- Mettre à jour le parseur Turtle → `RepeatStep` pour lire ce prédicat.

### 3. Diagnostic

`public/recipes/diagnostic-app.ttl` distingue déjà explicitement
`IntervalStep` (chaîné) de `RepeatStep` (non chaîné) au test #5 — le
commentaire dit *"le contraste : mêmes durées, structure imbriquée... jamais
phase, c'est le contraste qui prouve 4"*. Une fois `chain` ajouté à
`RepeatStep`, ce test de contraste reste valide tel quel (chaînage absent =
comportement actuel), mais un nouveau cas de test devrait être ajouté : un
`RepeatStep` avec `chain: true`, pour vérifier qu'il s'enchaîne bien seul,
frontière de tour comprise, sans confondre le résultat avec un
`IntervalStep`.

### 4. Doc

`docs/data-model.md`, section `act:RepeatStep` — ajouter une ligne sur le
chaînage optionnel, sur le modèle de ce qui est déjà écrit pour
`IntervalStep`.

## Ce qui ne change pas

- Comportement par défaut (`chain` absent ou `false`) : identique à
  aujourd'hui, aucune recette existante n'est affectée.
- `act:CountedStep` reste validé par l'usager, pas par l'horloge — chaîner
  le groupe ne transforme pas un exercice compté en exercice chronométré ;
  ça retire seulement le "prêt" *entre* les étapes.
- Recette de test associée (celle qui a servi de cas réel) :
  `echauffement-course-a-pied-v1-1-1-1-1-1-1` — le `act:RepeatStep`
  « Activation musculaire » (squats + genoux + talons + pointes + gainage,
  3 tours) est le candidat naturel pour activer `chain: true` une fois
  implémenté, et pour valider en usage réel.
