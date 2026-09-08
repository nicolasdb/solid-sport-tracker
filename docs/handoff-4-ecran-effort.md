# Handoff — l'écran pendant l'effort : exposition tactile et récupération

**Repo :** `nicolasdb/solid-sport-tracker`
**Origine :** séance du 2026-09-08 perdue en cours de route — retour à l'étape
1 pendant le 4e tour de course fractionnée, séance jamais consignée. Cause
identifiée, ce n'est pas un bug d'écriture : `timer.reset()` a été déclenché.

## Le constat

`#timer-reset` (`src/main.ts`, handler du bouton « Réinit. ») appelle
`SequenceTimer.reset()` (`src/lib/timer.ts`), qui remet `stepIndex` à 0 et
vide `elapsedMs`, `completed` et `startedAt`. Un seul tap, aucune
confirmation, et rien à récupérer derrière : le brouillon `localStorage`
n'existe qu'**à partir de l'ouverture du récap** (voir « Session logging »
dans `CLAUDE.md`). Avant ça, la seule copie de la séance est en mémoire.

Mais le bouton n'est que le symptôme le plus coûteux. Le vrai problème est en
amont :

- L'écran doit rester allumé pendant la séance — c'est tout le propos de
  `wake-lock.ts` — parce que `navigator.vibrate` ne fait rien quand la page est
  masquée. Sans écran allumé, plus de vocabulaire haptique.
- Écran allumé + téléphone en main + mouvement = **toute la barre du minuteur
  est une surface tactile armée**. Passer, Terminer, Réinit., les trois
  bascules d'options : chacun est à portée d'un frôlement, d'une manche, d'une
  poche.
- La barre est chargée de contrôles dont aucun n'est utile *pendant* un effort.
  Ce dont on a besoin en courant : l'étape en cours et le temps restant. Le
  reste sert avant, entre, ou après.

C'est le nœud : la fonctionnalité qui rend la séance suivable sans regarder
(écran allumé pour l'haptique) est exactement celle qui rend la séance
destructible sans le vouloir.

## Trois axes, indépendants

### 1. Rendre la perte récupérable — indépendant de tout choix d'UI

Le motif existe déjà : le récap est brouillonné dans `localStorage` (clé =
URL du container du carnet, expiration 24 h) parce qu'« un échec d'écriture,
une session expirée ou un onglet fermé perdraient sinon un travail
réellement fait ». Le même raisonnement s'applique un cran plus tôt.

Persister `timer.getRecord()` à chaque transition d'étape — pas à chaque tick
— couvre d'un coup **toute la classe** de pertes : réinitialisation
accidentelle, rechargement, onglet évincé par le système, crash du
navigateur. La récupération se présenterait comme le bandeau « Reprendre »
déjà rendu par `renderApp` pour un brouillon de récap.

À faire en premier : c'est mécanique, ça ne dépend d'aucune décision de
design, et ça transforme une perte définitive en simple contrariété.

### 2. Réduire l'exposition tactile — la vraie question de design

Un verrou de séance, explicite, sur le modèle de ce que font les applis de
course : une bascule à grande cible qui rend tout inerte jusqu'à un
déverrouillage délibéré (appui long). Ça traite la classe entière, pas un
bouton.

À décider dans la foulée, et c'est là qu'est le travail :

- Que montre l'écran pendant un effort ? Hypothèse : étape en cours + temps
  restant, rien d'autre. Le programme, les options et les contrôles
  secondaires se replient.
- Le verrou est-il un mode explicite, ou l'état par défaut dès qu'une étape
  chronométrée court ? Le second évite un tap de plus, mais surprend.
- Que reste-t-il actif sous verrou ? Probablement rien — « Passer » compris,
  puisque `skip()` porte du signal dans le log (voir « Capture is passive »).
  À trancher : un raté de tap sur Passer est moins coûteux qu'un raté sur
  Réinit., mais il fausse quand même la séance.
- Les cibles gagnantes sont grandes et loin des bords ; les cibles
  destructives, petites et hors du chemin — ou absentes de l'écran d'effort.

### 3. Un mode écran éteint, audio seul

L'arbitrage n'est pas symétrique, et ça ouvre une troisième voie : les bips
Web Audio survivent au passage en arrière-plan, la vibration non. Une séance
suivie **au son seul, écran éteint**, n'a aucune surface tactile — le
problème disparaît au lieu d'être atténué.

Ce n'est pas un repli dégradé : avec des écouteurs, ça peut être le meilleur
mode. Ça ne coûte rien à iOS Safari, qui n'a de toute façon pas
`navigator.vibrate`. À traiter comme une préférence d'appareil, aux côtés de
son/haptique/écran dans `localStorage` — pas comme un réglage de recette.

## Ce qui ne change pas

- Le verrou d'écran (`wake-lock.ts`) reste nécessaire dès qu'on veut
  l'haptique. L'axe 3 est une alternative offerte à l'usager, pas un
  remplacement.
- La capture reste passive et la confirmation explicite : rien de ce qui
  précède ne doit réintroduire des cases à cocher pendant l'effort.
- Une écriture unique en fin de séance (`logSession`). L'axe 1 écrit dans
  `localStorage`, jamais sur le pod — pas d'écritures réseau pendant l'effort.

## En suspens dans l'arbre de travail

Un garde-fou `confirm()` sur le bouton Réinit. (`src/main.ts` + clé
`timerResetConfirm` dans `src/lib/i18n.ts`, fr/en) est écrit et compile, mais
**non commité**. C'est un pansement sur un seul bouton, pas la réponse : à
garder comme filet si l'axe 2 tarde, à jeter si l'écran d'effort est
repensé pour que le bouton n'y soit plus.
