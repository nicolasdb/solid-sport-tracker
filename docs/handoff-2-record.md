# Handoff 2 — `act:RecordStep`

Suite du premier handoff, dont les points §1, §2, §6 et §7 sont traités.
Reste §3 (comptée et checklist identiques à l'exécution), §5 (aucun signal
d'entrée d'étape) et §8 (types manquants).

Ce document ne traite que §8, parce qu'il absorbe §3 et rouvre §5.

Lecture faite de `src/vocab/protocol.ts`, `src/lib/timer.ts`,
`src/lib/protocol-pod.ts`, `src/lib/signals.ts` et `src/main.ts` sur `main`.

---

## Pourquoi ce type, et pourquoi lui d'abord

Les cinq types existants ont tous la même direction : la recette **impose**
une consigne, l'app vérifie qu'elle est tenue. Rien ne remonte. Un `StepRun`
ne dit que `completed` et `durationSeconds` — c'est-à-dire *si* et *combien de
temps*, jamais *combien* ni *comment*.

Trois conséquences concrètes :

- La section « ajuster une recette existante » du skill demande de lire les
  indicateurs de progression. Il n'y en a aucun à lire.
- Le déblocage d'un stage suivant (⏳ au README) n'a pas de critère mesurable
  sur lequel s'appuyer.
- Les domaines transversaux visés par le préfixe `activity:` — habitudes
  alimentaires, thérapie myofonctionnelle — sont *majoritairement* de
  l'observation. Une intolérance alimentaire ne se suit pas avec un
  chronomètre ; elle se suit en consignant. Sans ce type, l'app reste un
  minuteur sportif malgré son vocabulaire.

Et il résout §3 au passage : aujourd'hui `CountedStep` et `ChecklistStep` sont
le même objet à l'exécution parce qu'aucun des deux ne produit rien. Dès qu'un
type peut *retourner* une valeur, « 10 squats visés » et « combien tu en as
réellement fait » deviennent deux choses différentes, et la distinction
comptée/checklist redevient lisible.

---

## Vocabulaire

Ajouter dans `act` :

```ts
RecordStep: `${ACT}RecordStep`,

prompt:    `${ACT}prompt`,     // la question posée, si elle diffère du titre
valueKind: `${ACT}valueKind`,  // "scale" | "number" | "text"
minValue:  `${ACT}minValue`,
maxValue:  `${ACT}maxValue`,
value:     `${ACT}value`,      // sur le StepRun, pas sur l'étape
```

`act:unit` et `act:targetSeconds` sont réutilisés tels quels — pas de nouveau
terme là où l'existant dit déjà la chose.

```ts
/**
 * Une étape qui **collecte** au lieu d'imposer : EVA douleur, degrés de
 * flexion, RPE, ressenti libre. Le seul type où l'app écrit une donnée que la
 * recette ne connaissait pas.
 *
 * `targetSeconds` en fait un compte plafonné dans le temps (« un max de
 * squats en 40 s ») : l'horloge borne l'effort, la valeur est le résultat.
 */
export interface RecordStep {
  kind: "record";
  url?: string;
  title: string;
  note?: string;
  prompt?: string;
  valueKind: "scale" | "number" | "text";
  unit?: string;
  minValue?: number;
  maxValue?: number;
  /** Si présent : l'effort est chronométré, puis la valeur est saisie. */
  targetSeconds?: number;
}
```

Trois `valueKind` suffisent pour l'instant. `"choice"` avec une liste de
libellés est la quatrième évidente, mais elle demande un terme de plus
(`act:choice`) et une UI de plus — à ajouter quand une vraie recette la
réclame, pas avant.

`StepRun` gagne `value?: string`. **Stocker en chaîne**, y compris pour les
nombres : le typage utile est porté par `valueKind` sur l'étape d'origine, et
une échelle EVA notée `7` ou `7/10` selon les jours ne doit pas casser la
lecture d'un carnet. La conversion se fait à l'analyse, côté dashboard, où on
sait déjà ce qu'on lit.

---

## Exécution — la partie qui demande une décision

Le point délicat : le minuteur ne connaît que `seconds > 0` (fin automatique)
ou `seconds === 0` (l'usager clôt). Une étape chronométrée *puis* saisie
n'entre dans aucune des deux.

**Ne pas ajouter un troisième mode au minuteur.** Découper dans
`flattenSteps`, comme les intervalles le sont déjà :

```
RecordStep sans targetSeconds  →  1 runnable, seconds: 0
RecordStep avec targetSeconds  →  2 runnables :
    a) l'effort   — seconds: targetSeconds
    b) la saisie  — seconds: 0, chain: true
```

`chain: true` sur (b) est exactement le mécanisme déjà en place pour les
phases d'intervalle : la fin de l'effort enchaîne sans demander « Je suis
prêt », et l'écran de saisie apparaît immédiatement. Aucune nouvelle machinerie
dans `SequenceTimer`.

Le `RunnableStep` a besoin de savoir qu'il attend une valeur — un
`capture?: boolean`, ou la lecture de `sourceStep.kind === "record"` couplée à
`seconds === 0`. La seconde est plus économe mais implicite ; préférer le
drapeau explicite, `flattenSteps` étant déjà l'endroit qui décide.

**UI.** C'est le premier type qui demande une saisie et non un bouton.
Minimum viable, dans le bloc minuteur, en remplacement de « C'est fait » :

- `scale` — une rangée de boutons `minValue`..`maxValue` (défaut 0–10). Un tap
  saisit *et* valide. C'est le seul kind utilisable presque sans regarder.
- `number` — champ numérique + bouton, `unit` affiché à côté.
- `text` — zone de texte + bouton.

**Passer une étape doit rester possible** : `skip()` enregistre
`completed: false, value: undefined`. Une valeur non saisie n'est pas un zéro,
et le dashboard doit pouvoir faire la différence.

---

## Écriture sur le pod

Dans `protocol-pod.ts`, au bloc `StepRun` (≈ ligne 381) :

```ts
.setInteger(act.completed, run.completed ? 1 : 0)
.setInteger(act.durationSeconds, run.durationSeconds)
```

ajouter, conditionnellement, `.setStringNoLocale(act.value, run.value)` — et
la relecture symétrique en face (≈ ligne 416).

`act:ofStep` existe déjà et pointe vers l'étape du protocole. C'est lui qui
rend la progression lisible : toutes les occurrences d'une même étape à
travers les séances d'un carnet, donc une série temporelle par mesure, sans
rien ajouter au modèle. Vaut d'être écrit dans `docs/data-model.md` — c'est le
point où le carnet devient exploitable.

---

## Ce que ça rouvre côté signaux (§5)

Une `RecordStep` **casse le suivi sans écran** : il faut regarder pour saisir.
Ce n'est pas un défaut à corriger, c'est une propriété du type — mais elle a
deux conséquences.

1. Il lui faut un signal distinct, du genre `prompt`, nettement différent de
   `step` : « arrête-toi et regarde » n'est pas « bloc suivant ». C'est le
   cinquième `SignalKind`, et c'est la première fois qu'il y a une vraie raison
   d'en ajouter un.
2. Cela devient une **règle d'écriture de recette**, pas une contrainte de
   code : une `RecordStep` se place en début ou en fin de séance, jamais au
   milieu d'un effort. À faire figurer dans `SKILL.md`.

Le reste de §5 (motifs par phase A/B) reste ouvert et indépendant.

---

## Les deux autres manques, après

**Compte plafonné dans le temps** — résolu gratuitement par
`RecordStep` + `targetSeconds`, comme prévu. Rien à faire de plus.

**Repos non chronométré** — reste en checklist. Ne pas en faire un type :
c'est une propriété de transition, pas une étape, et le drapeau `chain` du
premier handoff est déjà le bon endroit conceptuel (`chain: false` explicite =
« souffle, reprends quand tu veux »). À traiter le jour où une recette réelle
le réclame, et probablement comme un `act:rest true` sur une checklist plutôt
que comme un `RestStep`.

---

## Ordre de travail suggéré

1. Vocabulaire + `parseStep` (une branche avant le fallback `unrecognized`).
2. `flattenSteps` + `describeStep`.
3. UI de saisie, `scale` d'abord — c'est le kind qui porte l'usage clinique.
4. Persistance `act:value` aller-retour.
5. Signal `prompt`.
6. Charger `diagnostic-record.ttl`.

Avant l'étape 1, `diagnostic-record.ttl` est déjà utile tel quel : il doit
afficher le bandeau « 5 étapes de type non reconnu » et les exécuter comme
checklists. C'est une non-régression du §2 gratuite, et ça vérifie que le
fallback fait bien ce qu'on croit avant qu'on le contourne.
