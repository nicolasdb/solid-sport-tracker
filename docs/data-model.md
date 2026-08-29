# Modèle de données

Vocabulaire provisoire (`https://vocab.nicolasdb.eu/sport-tracker#`, préfixe
`st:`), pas encore publié comme document JSON-LD/Turtle résolvable — à faire
une fois le modèle stabilisé par l'usage.

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
