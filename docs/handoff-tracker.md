# Handoff — solid-sport-tracker

Constats issus de la conception de `diagnostic-app.ttl`, lecture faite de
`src/vocab/protocol.ts`, `src/lib/timer.ts`, `src/lib/signals.ts`,
`src/lib/protocol-pod.ts` et `src/main.ts` (branche `main`).

L'objectif qui ordonne tout ce qui suit : **dérouler une séance entière au
retour haptique seul, sans regarder l'écran.** Aujourd'hui c'est impossible,
et une seule ligne en est la cause.

---

## 1. Bloquant — `awaitingReady` est inconditionnel — **traité**

> `chain` posé dans `flattenSteps` (`vocab/protocol.ts`), lu par `SequenceTimer`
> et par `endSignal` (`main.ts`). Voir `docs/../CLAUDE.md` (paragraphe
> `SequenceTimer`) pour le détail. §5 ci-dessous devient testable.

`SequenceTimer.advance()` termine par `this.awaitingReady = true` sans
condition. Toute fin d'étape arrête l'horloge et attend un tap sur « Je suis
prêt » — **y compris entre deux phases d'un intervalle.**

Conséquences :

- `3 × (10 s rapide + 20 s normale)` demande six taps. Ce n'est pas un
  métronome.
- `IntervalStep` n'a plus aucune différence d'exécution avec un `RepeatStep`
  de `TimedStep`. La seule chose qui subsiste est le motif de bip choisi par
  `endSignal()`. Un type qui ne se distingue que par son bip n'est pas un
  type.
- L'objectif « sans regarder l'écran » tombe pour **toutes** les recettes,
  pas seulement les intervalles.

**Correctif proposé.** L'enchaînement est une propriété de la transition, pas
une constante globale. `SequenceTimer` ne connaît que `{label, seconds}` ;
lui donner de quoi décider :

```ts
export interface TimerStep {
  label: string;
  seconds: number;
  /** Démarre sans attendre de validation quand l'étape précédente se clôt. */
  chain?: boolean;
}
```

Dans `advance()` : `this.awaitingReady = !this.steps[this.stepIndex]?.chain`.

Le calcul de `chain` se fait dans `main.ts` au passage `RunnableStep[] →
TimerStep[]`, avec exactement la condition que `endSignal()` calcule déjà :
`chain = next.sourceStep === current.sourceStep && current.sourceStep.kind === "interval"`.
Les deux devraient partager un seul prédicat plutôt que le dupliquer.

Point de vérification : un enchaînement automatique ne doit pas court-circuiter
`foldElapsed()` ni la comptabilité de `elapsedMs` — l'étape suivante démarre
son `stepStartedAt` dans la foulée, sans repasser par `start()`.

Une fois ceci fait, l'étape 4 du diagnostic passe sans aucun tap et l'étape 5
en demande quatre. Le contraste prouve le type.

---

## 2. Le parseur avale silencieusement les types inconnus — **traité**

> `readStep` (`protocol-pod.ts`) teste désormais `act:ChecklistStep`
> explicitement, marque `unrecognized: true` sur la retombée, `console.warn`,
> et `renderApp` affiche un bandeau. Pas d'aperçu avant écriture — hors
> périmètre, noté dans le plan.

`parseStep` teste Repeat → Interval → Counted → Timed puis tombe sur
`return { kind: "checklist", ...common }`. Un `act:RecordStep` — ou une
faute de frappe dans un type — devient une checklist muette. Rien dans
l'interface ne le signale.

C'est tenable tant que le vocabulaire est figé ; ça ne l'est plus dès qu'on
en ajoute. Minimum : un `console.warn` avec l'IRI non reconnue, et idéalement
un bandeau dans l'écran de programme (« 2 étapes non reconnues »). Le skill
`recipe-author` peut produire du Turtle valide et pourtant faux — il faut que
l'app le dise.

---

## 3. `CountedStep` et `ChecklistStep` sont identiques à l'exécution

`flattenSteps` donne `seconds: 0` aux deux, et le minuteur ne pose qu'une
question : `seconds > 0`. Même bouton, même signal, même enregistrement. Ils
ne diffèrent que dans `describeStep()`, donc à l'affichage du programme.

Il y a donc **quatre comportements exécutables, pas cinq**. À trancher :

- soit c'est voulu, et l'étape 3 du diagnostic sert juste de non-régression ;
- soit `CountedStep` doit acquérir un comportement propre — voir §4.

---

## 4. Ouvert — métronome de répétitions sur `CountedStep`

Idée à instruire, pas à implémenter tel quel. « 10 cercles à droite, 10 à
gauche, 10 poussées » gagnerait à être cadencé par un bip léger par
répétition, avec une courte respiration entre exercices pour se replacer.

Ce qui bloque : le tempo est propre à chaque personne et à chaque jour. Donc
la cadence n'est probablement **pas** une donnée de recette — c'est une
préférence d'appareil, comme `sound` / `haptic` / `screenOn`, éventuellement
surchargeable par un `act:note`. Une recette qui impose un tempo de
répétition serait inutilisable par la moitié des gens qui la chargent.

Piste minimale : préférence globale « bip par répétition » + un tempo réglable
dans les réglages, et le `targetCount` de la recette borne le nombre de bips.
La recette dit *combien*, l'appareil dit *à quelle vitesse*. Cette séparation
vaut d'être écrite quelque part, elle reviendra.

Note : si ceci se fait, §3 se résout de lui-même — comptée et checklist
divergent enfin.

---

## 5. Le vocabulaire des signaux ne couvre pas le départ — **testé, suffisant**

> Écouté en vrai sur `diagnostic-app.ttl` étape 4, deux passes (son seul,
> haptique seul) : `phase, phase, phase` suffit à savoir dans quelle phase on
> est sans compter. Pas de motif distinct par phase à ajouter pour l'instant —
> à revisiter si un métronome à plus de deux phases s'avère moins lisible.

`SignalKind` est `tick | phase | step | session` : quatre événements de
**fin**. Rien ne marque le *début* d'une étape.

Aujourd'hui ça passe, parce que le tap « Je suis prêt » sert de repère
kinesthésique. Dès que §1 est corrigé, l'entrée en phase n'est plus signalée
que par le bip de sortie de la précédente — ce qui suffit peut-être, mais doit
être testé plutôt que supposé. L'étape 4 du diagnostic est faite pour ça :
écouter si `phase, phase, phase` se suit assez clairement pour savoir *dans
quelle* phase on est sans compter.

Si ça ne suffit pas, la piste n'est pas un cinquième signal mais des motifs
distincts par phase (A grave, B aigu), ce que `PATTERNS` permet déjà —
le commentaire du fichier annonce d'ailleurs « à terme, un motif par type
d'étape ».

---

## 6. Cas limite — `tick` sur les phases courtes — **traité**

> Plancher retenu : pas de tick sous 5 s (`TICK_MIN_SECONDS`, `main.ts`).

`tick` se déclenche quand `remaining <= 3`. Une phase de 3 s tique donc dès
sa première seconde, immédiatement après le bip `phase` qui l'a ouverte : deux
signaux qui se chevauchent presque. La phase B du diagnostic dure exactement
3 s pour exposer ce cas.

À décider : plancher (`pas de tick sous 5 s`), ou tick désactivé à l'intérieur
d'un intervalle puisque la cadence y est déjà portée par les phases.

---

## 7. Contrainte de plateforme à documenter — **traité**

> Écrit dans `README.md`, puce « suivre la séance sans regarder l'écran ».

`navigator.vibrate` n'existe pas sur iOS Safari — c'est déjà noté dans
`signals.ts`, et `hapticSupported` masque proprement le bouton. Mais cela veut
dire que **l'objectif « suivre au haptique seul » est inatteignable sur
iPhone**, quoi qu'on fasse dans le code.

Ce n'est pas un bug à corriger, c'est une limite à assumer et à écrire dans le
README : sur iOS, le canal utilisable est le son. Ça change la façon de
concevoir les motifs — un motif pensé pour le poignet et un motif pensé pour
l'oreille au casque ne sont pas les mêmes.

---

## 8. Manques de vocabulaire, à ne pas ajouter maintenant

Repérés en cherchant un sixième type, hors périmètre du diagnostic mais à
garder en vue. Aucun n'existe dans `protocol.ts`.

- **`act:RecordStep`** — capturer une valeur au lieu d'en imposer une :
  EVA douleur 0–10, degrés de flexion, RPE. C'est le seul type où l'app
  *écrirait* quelque chose que la recette ne savait pas. Sans lui, la section
  « ajuster une recette existante » du skill n'a pas d'indicateurs de
  progression à lire. C'est aussi ce qui ouvre les domaines transversaux
  (habitudes alimentaires, thérapie myofonctionnelle) où l'observation est le
  livrable.
- **Compte plafonné dans le temps** — « un max de squats en 40 s ». Ni timed
  ni counted. Serait sans doute un `RecordStep` avec `targetSeconds`, ce qui
  serait élégant.
- **Repos non chronométré** — « reprends quand tu es prêt ». Passe aujourd'hui
  en checklist ; se lit mal et mériterait un autre retour haptique. Se
  résoudrait peut-être en réutilisant le `chain` du §1 en négatif.

Ordre suggéré si ça se fait : `RecordStep` d'abord, il porte à lui seul
l'élargissement hors du sport.

---

## Comment utiliser `diagnostic-app.ttl`

Le déroulé attendu est écrit en commentaire en tête du fichier. Servi en
statique à côté de `echauffement.ttl`, ou publié sur un pod public.

Deux passes utiles : une avec son seul, une au haptique seul. Le critère
n'est pas « est-ce que ça marche » mais « est-ce que je sais où j'en suis
sans regarder ».
