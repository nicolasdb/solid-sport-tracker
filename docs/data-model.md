# Modèle de données

Deux vocabulaires coexistent :

- **`act:`** (`https://vocab.nicolasdb.eu/activity#`) — le modèle courant,
  généralisé et indépendant du domaine sportif. C'est celui décrit ci-dessous
  et implémenté dans `src/vocab/protocol.ts`.
- **`st:`** (`https://vocab.nicolasdb.eu/sport-tracker#`) — le premier modèle,
  spécifique au sport et limité à des blocs chronométrés. Il reste lu pour les
  carnets déjà écrits (voir « Modèle historique `st:` » plus bas), mais rien
  ne l'écrit plus. Il n'y a pas de migration : un carnet ancien reste
  consultable tel quel.

Ni l'un ni l'autre n'est encore publié comme document résolvable — à faire une
fois le modèle stabilisé par l'usage.

## Modèle courant `act:`

Trois niveaux, et les distinguer est tout le propos :

- `act:Protocol` — la **recette** : le protocole lui-même, versionné,
  potentiellement hébergé sur le pod d'un tiers (kiné, coach). `act:title`,
  `act:goal`, `act:cadence`, `act:hasStep`.
- `act:Logbook` — le **carnet** : l'engagement d'une personne dans un
  protocole. Unité de partage et granularité d'ACL — un container par carnet.
  `act:title`, `act:protocol` (→ la copie locale), `act:sourceProtocol`
  (l'URI d'origine, comme provenance).
- `act:Session` — une **exécution**. `act:startedAt`, `act:durationSeconds`,
  `act:feeling`, `act:hasRun` (→ `act:StepRun`).

Le carnet **copie** son protocole au lieu d'y pointer : une v2 publiée par
l'auteur changerait rétroactivement le protocole des séances déjà consignées,
et le carnet cesserait d'être comparable à lui-même. Une v2 est une autre
recette.

### Étapes typées

Une étape porte son type en `rdf:type`, et `act:order` pour le rang :

- `act:TimedStep` — durée-cible : `act:targetSeconds`. Le minuteur signale la
  fin ; il ne mesure pas une performance.
- `act:CountedStep` — compte-cible : `act:targetCount` + `act:unit`
  (« répétitions », « par jambe »). C'est l'usager qui clôt l'étape, pas
  l'horloge.
- `act:IntervalStep` — métronome : `act:hasPhase` (→ `act:Phase`, chacune
  `act:title` + `act:targetSeconds`) répété `act:rounds` fois. Les ratios
  asymétriques et évolutifs (1:1 → 2:2 → 2:5) sont des phases explicites, pas
  une notion de ratio dans le modèle.
- `act:ChecklistStep` — aucune mesure.
- `act:RecordStep` — le seul type qui **collecte** au lieu d'imposer : EVA
  douleur, degrés de flexion, RPE, ressenti libre. `act:valueKind`
  (`"scale"` | `"number"` | `"text"`), `act:prompt` (la question, si elle
  diffère du titre), `act:minValue`/`act:maxValue` pour `"scale"`, `act:unit`
  réutilisé tel quel pour `"number"`. `act:targetSeconds` optionnel en fait un
  compte plafonné dans le temps : l'horloge borne l'effort, la valeur saisie
  ensuite est le résultat — deux `act:StepRun` pour la même étape à
  l'exécution (l'effort, puis la saisie), pas une troisième mécanique dans le
  minuteur. Règle d'écriture : une `RecordStep` se place en début ou fin de
  séance, jamais au milieu d'un effort — saisir oblige à regarder l'écran.
- `act:RepeatStep` — imbrication : `act:times` + `act:hasStep`.
  `3× [10 squats, 10 fentes, 10 push-ups]` n'est pas `3×10 squats` ; la
  structure porte du sens pédagogique (rythme, mémorisation), et l'aplatir le
  perdrait.

Un type inconnu à la lecture est traité comme une checklist plutôt qu'ignoré :
mieux vaut afficher une étape qu'en perdre une du protocole. Les `rdf:type`
d'origine sont conservés sur cette checklist de repli, pour que la copie du
protocole dans un carnet (`createLogbookFromProtocol`) ne les aplatisse pas
en `act:ChecklistStep` — sinon la perte devient définitive dès la création du
carnet, avant même que l'app apprenne le type.

### Ce qui est consigné

`act:StepRun` — ce qu'une étape a donné : `act:ofStep` (→ l'étape du
protocole), `act:title` **recopié** pour que le log reste lisible si le
protocole change ensuite, `act:completed` (0/1), `act:durationSeconds`,
`act:value` (chaîne, seulement présent si une valeur a été saisie — une étape
passée n'a ni `act:value` ni valeur vide).

`act:ofStep` est ce qui rend un carnet exploitable sans rien ajouter au
modèle : toutes les occurrences d'une même étape à travers les séances d'un
carnet forment une série temporelle par mesure. C'est la lecture qui manquait
pour suivre une progression ou décider d'un déblocage de stage.

`act:durationSeconds` sur la `act:Session` est la **durée murale** depuis le
premier démarrage, pauses et transitions comprises — pas la somme des étapes
chronométrées. Une séance reste ainsi mesurée même quand presque rien n'y est
chronométré.

### Layout

```
<pod>/sport-tracker/carnets/<carnet-id>/
├── logbook.ttl               # act:Logbook — métadonnées + provenance
├── protocol.ttl              # act:Protocol — copie locale, étapes typées
└── sessions/
    └── <date>.ttl            # act:Session + act:StepRun
```

Les fragments du protocole copié sont positionnels (`#step-1-0`) : les slugs
de la recette d'origine ne sont pas garantis uniques une fois copiés, et un
chemin positionnel est stable pour une copie donnée.

La recette d'exemple, en Turtle et versionnée dans le repo, est
`public/recipes/echauffement.ttl` — chargée par son URI, pas importée depuis
le code, pour que le chemin de découverte soit exercé dès le premier carnet.

---

## Modèle historique `st:`

Ce qui suit décrit les carnets écrits avant les étapes typées. Ils restent
lisibles ; l'app les convertit à la lecture (un bloc chronométré devient une
`act:TimedStep`) et continue d'écrire leurs séances dans `seances/` au même
format, pour ne pas mélanger deux vocabulaires dans un même carnet.

## Layout sur le pod

```
<pod>/sport-tracker/
├── preferences.ttl                  # st:Preferences — pilote l'UI dynamique
└── carnets/
    └── <carnet-id>/
        ├── carnet.ttl               # st:Carnet — métadonnées + lien vers le modèle
        ├── modele.ttl               # st:SeanceModele — blocs + exercices
        └── seances/
            └── <date>.ttl           # st:SeanceInstance — un log par séance réalisée
```

Un carnet = un container. Ça permet de poser un `.acl` par carnet plus tard
(par ex. partager un carnet avec un coach sans exposer les autres).

## Classes et prédicats

- `st:Carnet` — instance d'un programme suivi (ex: "Échauffement quotidien").
  `st:titre`, `st:objectif`, `st:frequence`, `st:dateDebut`, `st:dateFin`,
  `st:seanceModele` (→ `st:SeanceModele`).
- `st:SeanceModele` — structure type d'une séance, réutilisée à chaque
  occurrence. `st:titre`, `st:contientBloc` (→ `st:Bloc`, plusieurs valeurs).
- `st:Bloc` — une phase de la séance (ex: "Mobilité articulaire").
  `st:titre`, `st:ordre` (entier, pour trier), `st:dureeSecondes` (pilote le
  timer), `st:contientExercice` (→ `st:Exercice`, plusieurs valeurs).
- `st:Exercice` — un mouvement dans un bloc. `st:titre`, `st:repetitions`
  (texte libre, ex: "3 séries de 10"), `st:dureeSecondes` (optionnel, pour un
  exercice chronométré comme un équilibre), `st:note` (variante/astuce).
- `st:SeanceInstance` — log d'une séance réalisée. `st:baseSurModele` (→
  `st:SeanceModele`), `st:dateRealisation`, `st:dureeReelleSecondes`,
  `st:ressenti` (texte libre — fatigue, gêne, etc.), `st:blocRealise` (→
  `st:BlocRealise`, plusieurs valeurs).
- `st:BlocRealise` — ce qu'un bloc est devenu lors d'une séance donnée.
  `st:baseSurBloc` (→ `st:Bloc` du modèle), `st:titre` (recopié pour que le
  log reste lisible si le modèle change ensuite), `st:complete` (0/1),
  `st:dureeReelleSecondes`.
- `st:Preferences` — pilote l'UI. `st:carnetActif` (→ `st:Carnet`),
  `st:tenueParDefaut` (ex: "Feiyue", "pieds nus"), `st:afficherTimer`
  (booléen encodé en entier 0/1 — voir note ci-dessous).

## Exemple : "Échauffement quotidien" (semaine 1)

`carnets/echauffement-s1/carnet.ttl` :

```turtle
@prefix st: <https://vocab.nicolasdb.eu/sport-tracker#> .

<#it> a st:Carnet ;
  st:titre "Échauffement quotidien" ;
  st:objectif "15-20 min par jour, 7j/7, Feiyue ou pieds nus" ;
  st:frequence "7x/semaine" ;
  st:seanceModele <modele.ttl#seance> .
```

`carnets/echauffement-s1/modele.ttl` (extrait — 2 des 4 blocs) :

```turtle
@prefix st: <https://vocab.nicolasdb.eu/sport-tracker#> .

<#seance> a st:SeanceModele ;
  st:titre "Séance d'échauffement" ;
  st:contientBloc <#activation-cardio>, <#mobilite>, <#activation-musculaire>, <#transition-course> .

<#activation-cardio> a st:Bloc ;
  st:titre "Activation cardiovasculaire" ;
  st:ordre 1 ;
  st:dureeSecondes 300 ;
  st:contientExercice <#marche-rapide> .

<#marche-rapide> a st:Exercice ;
  st:titre "Marche rapide" ;
  st:repetitions "3-5 min" ;
  st:note "Focus roulade du pied, bras qui balancent naturellement" .

<#mobilite> a st:Bloc ;
  st:titre "Mobilité articulaire" ;
  st:ordre 2 ;
  st:dureeSecondes 300 ;
  st:contientExercice <#cercles-chevilles>, <#cercles-hanches>, <#fentes-marchees> .

<#cercles-chevilles> a st:Exercice ;
  st:titre "Cercles de chevilles" ;
  st:repetitions "10 dans chaque sens, par pied" .

<#cercles-hanches> a st:Exercice ;
  st:titre "Cercles de hanches" ;
  st:repetitions "10 dans chaque sens" .

<#fentes-marchees> a st:Exercice ;
  st:titre "Fentes marchées" ;
  st:repetitions "5 par jambe" .
```

`carnets/echauffement-s1/seances/2026-08-29.ttl` (log d'une occurrence) :

```turtle
@prefix st: <https://vocab.nicolasdb.eu/sport-tracker#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<#it> a st:SeanceInstance ;
  st:baseSurModele <../modele.ttl#seance> ;
  st:dateRealisation "2026-08-29T07:30:00Z"^^xsd:dateTime ;
  st:dureeReelleSecondes 1080 ;
  st:ressenti "Légère gêne au mollet droit, intensité réduite sur les squats" ;
  st:blocRealise <#bloc-0>, <#bloc-1> .

<#bloc-0> a st:BlocRealise ;
  st:baseSurBloc <../modele.ttl#bloc-0> ;
  st:titre "Activation cardiovasculaire" ;
  st:complete 1 ;
  st:dureeReelleSecondes 305 .

<#bloc-1> a st:BlocRealise ;
  st:baseSurBloc <../modele.ttl#bloc-1> ;
  st:titre "Mobilité articulaire" ;
  st:complete 0 ;
  st:dureeReelleSecondes 120 .
```

Un log par jour : `<date>.ttl`, suffixé de l'heure (`<date>-HHMMSS.ttl`) si
la journée porte déjà une séance.

## Notes d'implémentation

- `st:dureeSecondes` sur chaque `st:Bloc` est ce qui alimente directement le
  timer côté app (`src/lib/timer.ts`) — un bloc sans durée n'apparaît pas
  dans la séquence.
- `st:afficherTimer` est lu comme un entier (0/1) plutôt qu'un booléen RDF
  strict, pour rester simple avec `getInteger` de `@inrupt/solid-client`; à
  revoir si on introduit un vrai `xsd:boolean`.
- Aucune contrainte SHACL/ShEx pour l'instant — le POC lit défensivement
  (valeurs manquantes → `undefined` / valeurs par défaut) plutôt que de
  valider strictement.
