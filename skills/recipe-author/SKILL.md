---
name: recipe-author
description: Écrit une recette (protocole d'activité) en Turtle `act:` à partir d'une description en langage naturel — séance de sport, protocole de kiné, atelier, routine. Produit un résumé lisible à valider et le document Turtle correspondant, prêt à publier sur un pod Solid.
---

# Écrire une recette

Une recette est un **protocole** : une suite d'étapes qu'une personne exécute
et consigne. Le vocabulaire est générique — une séance de kiné, un atelier
scolaire et un échauffement sont structurellement la même chose.

Ce skill est délibérément hors de l'app : le tracker qui exécute la recette
reste bête, hors-ligne et sans dépendance à un modèle. L'écriture est le
goulot d'étranglement, pas l'exécution.

## La règle qui prime

**L'humain ne relit jamais du Turtle.** Restitue d'abord un résumé lisible :

> **Échauffement quotidien** — chaque matin
> 1. Activation cardiovasculaire — 5 min
> 2. Mobilité articulaire — 2 tours de : 10 cercles de chevilles, 12
>    balancements de jambe, 10 cercles d'épaules
> 3. Activation musculaire — 3 tours de : 10 squats, 10 fentes par jambe,
>    20 s de gainage, 1 min d'équilibre
> 4. Transition vers la course — 3 × (10 s marche très rapide + 20 s marche
>    normale)

C'est **ça** qu'on valide. Le Turtle ne vient qu'après accord explicite, et
n'est jamais écrit sur un pod sans ce feu vert : *nothing automatic, but
automated*.

## Source du vocabulaire

Lis le vocabulaire depuis sa source plutôt que de le supposer, sinon ce skill
dérive du modèle réel :

- `docs/data-model.md` du repo `solid-sport-tracker` — section « Modèle
  courant `act:` »
- `src/vocab/protocol.ts` — les types et les IRIs effectivement écrits et lus
- `public/recipes/echauffement.ttl` — l'exemple de référence, à imiter

Quand le vocabulaire sera publié comme document résolvable, c'est cette URI
qui deviendra la source.

## Choisir le bon type d'étape

Le choix du type est tout le travail. Une étape mal typée redevient du texte
libre inexploitable, ce que le modèle précédent faisait déjà.

| La description dit… | Type |
|---|---|
| « 5 minutes de… », « tenir 30 s » | `act:TimedStep` (`act:targetSeconds`) |
| « 10 squats », « 12 par jambe » | `act:CountedStep` (`act:targetCount` + `act:unit`) |
| « 3 × (30 s rapide + 1 min lent) », tout métronome | `act:IntervalStep` (`act:hasPhase` × `act:rounds`) |
| « vérifier que… », « penser à… », sans mesure | `act:ChecklistStep` |
| « 3 tours de : A, B, C » | `act:RepeatStep` (`act:times` + `act:hasStep`) |

Deux pièges :

- **`3× [A, B, C]` n'est pas `3×A, 3×B, 3×C`.** Ne déplie jamais un circuit en
  étapes consécutives : la structure porte du sens pédagogique (rythme,
  mémorisation), et l'app sait la dérouler seule.
- **Un ratio d'intervalle s'écrit en phases explicites.** 1:1, 2:2, 2:5 sont
  des durées, pas un ratio à modéliser. Un protocole qui progresse
  (1:1 → 2:2 → 2:5) donne plusieurs `act:IntervalStep`, ou plusieurs recettes
  si ce sont des stages à débloquer.

Une durée dans le titre (« gainage 30 s ») appartient à `act:targetSeconds`,
pas au titre.

## Forme du document

- Un document par recette, sujet `<#it>` de type `act:Protocol`.
- `act:title` obligatoire ; `act:goal` et `act:cadence` si la description les
  donne — ne les invente pas.
- Chaque étape porte `act:order` (1-indexé, dans son parent) et un fragment
  lisible (`<#mobilite>`).
- Un `act:RepeatStep` lie ses enfants par `act:hasStep` ; un
  `act:IntervalStep` ses phases par `act:hasPhase`.
- `act:note` pour ce qui est une consigne et non une mesure (« yeux ouverts »,
  « respiration nasale »).

Vérifie avant de rendre : chaque étape référencée existe, chaque `act:order`
est unique dans son parent, chaque durée est en **secondes entières**.

## Publier

La publication est un geste humain, après validation du résumé. Le document
va sur un pod, en lecture publique s'il doit être partagé, et c'est **son
URI** qu'on donne à l'app — pas le fichier. Un protocole écrit par un
professionnel part de *son* pod avec un grant, pas de celui du patient.

## Ajuster une recette existante

Cas du level-up : lire la recette en cours et les indicateurs de progression,
puis **proposer** le stage suivant. Ça reste une proposition — le kiné ou
l'usager décide. Une v2 est une **autre recette**, jamais une modification en
place : les carnets déjà ouverts sur la v1 doivent rester comparables à
eux-mêmes.
