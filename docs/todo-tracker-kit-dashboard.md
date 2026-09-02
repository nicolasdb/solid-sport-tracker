# Todo — tracker · kit · dashboard

_Sortie de la session du 2026-09-01. Trois chantiers, un seul chemin critique._

Le vocabulaire recette/carnet/session ne peut pas se découvrir par le design : il faut
l'exercer sur de vraies recettes. Tout le reste en dépend. C'est la seule contrainte
d'ordre réelle — le dashboard v0 et le kit peuvent avancer dès que le vocabulaire est posé.

---

## 1. Tracker — généralisation (chemin critique)

**Pourquoi maintenant :** produit le vocabulaire dont le dashboard et les bundles dépendent.
Falsification enregistrée : `st:` prédit cassant sur yoga/rangement, **cassé en réalité par
le sport lui-même** (échauffement, circuits, cycles marche/course). Le contre-exemple était
dans le domaine d'origine.

### Vocabulaire
- [ ] Trois niveaux distincts : **recette** (protocole, versionné, potentiellement sur un pod tiers) → **carnet** (engagement d'une personne dans une recette) → **session** (une exécution)
- [ ] Le carnet est l'unité de partage et la granularité d'ACL — un container par carnet
- [ ] Nommage générique EN pour le vocab publié : `Protocol` / `Logbook` / `Session`
- [ ] Étapes typées :
  - durée-cible (le timer signale la fin — on ne mesure pas le temps passé)
  - compte-cible (10 squats)
  - intervalle (métronome, ratios évolutifs et asymétriques 1:1 → 2:2 → 2:5)
  - checklist pure (aucune mesure)
- [ ] Imbrication réelle : `3× [10 squats, 10 fentes, 10 push-ups]` ≠ `3×10 squats`. La structure porte du sens pédagogique (rythme, mémorisation).
- [ ] Durée totale de session enregistrée **toujours**, même quand aucune étape n'est chronométrée

### Recettes
- [ ] Chargement par URI arbitraire (pas seulement le pod local) — indispensable dès la v1
- [ ] **Copie** dans le carnet à la création + conservation de l'URI d'origine comme provenance
- [ ] Pas de lien vivant : une v2 est une autre recette, ou un stage débloqué d'une recette multi-stages (`#fog-of-war`). Le carnet reste comparable à lui-même.
- [ ] Création de carnet (aujourd'hui TBD, exemple probablement hardcodé)
- [ ] Recette d'exemple publiée sur le master pod et chargée par URI dès le jour 1 — le chemin de découverte est testé par l'usage réel

### Hors périmètre, explicitement
- Pas d'analytics (part au dashboard)
- Pas d'écriture d'ACL (part au kit, appelé par le dashboard)

**Fini quand :** échauffement, circuit et cycles marche/course tournent sur le vocabulaire
généralisé, et la recette d'exemple vient d'une URI et non du code.

---

## 2. Kit — complétion (le repo existe déjà)

`nicolasdb/solid-kit`, branche `master`. Template repo, pas package (ADR 004). Contient
déjà `auth.ts`, `pod.ts`, `conditional.ts` (ETag/If-Match), `draft.ts`, le design system,
les patterns UX, `atlas.md`, `ux-principles.md`, 83 tests + audit de contraste,
`styleguide.html` et `guidelines.html`. C'est le SSOT charte graphique + principes UX.

### Le helper ACL — tranché
Le README dit : *« Not included, on purpose: no ACL/permission helpers, no data-format
helpers, no vocabulary. See the ADRs. »* On respecte : **le kit reste sans helper ACL.**
Les apps de process n'en ont pas besoin, et l'exclusion est saine.

- [ ] **Le dashboard porte le sien**, avec un scope limité aux bundles qu'il compose. Justifié : basculer vers le backoffice pour un partage qu'on vient de composer est une friction rédhibitoire.
- [ ] Sur `universalAccess`, encapsule la forme d'autorisation (agents listés, pas de groupes), et **écrit le reçu dans `access-log/`** au moment de l'exposition
- [ ] **Conséquence à écrire quelque part de visible :** le dashboard devient le second rayon d'explosion au switch ACP, avec le backoffice. Acceptable, mais la découverte ne doit pas se faire pendant la migration.

### Le reste
- [ ] `no vocabulary` vaut aussi pour les cartouches — elles ne vont pas dans le kit. Ce qu'il faut côté kit, c'est **une logique de module** : un point de branchement où l'app charge sa cartouche selon le contexte. Le kit reste neutre, les tokens de style et les règles UX y restent pré-intégrés.
- [ ] Mettre `docs/atlas.md` à jour depuis la v2
- [ ] Sport-tracker adopte le kit — c'est le test que le kit est juste
- [ ] Faire tourner `docs/manual-tests.md` contre le provider live avant d'adopter une version (une version n'est pas validée sans ça)

---

## 3. Dashboard v0 — validation du mécanisme (en parallèle, pas dans trois mois)

**Ce qui se valide sans données longitudinales**, sur le carnet *introduction à la course
à pied* : concret, répétable tel quel avec un buddy, et il exerce le type intervalle avec
ratios asymétriques et le multi-stage à débloquer.

- [ ] **Projeter** — adaptateur vocabulaire source → indicateurs. Un adaptateur par domaine, le reste ne bouge pas.
- [ ] UX/UI du contenu : à quoi ressemble une progression lisible
- [ ] **Composer** — l'écran de composition de bundle : quels indicateurs, quelle granularité
- [ ] **Exposer** — appel du helper ACL du kit sur le périmètre « bundles que j'ai composés »
- [ ] **Agréger** — lecture d'un bundle externe (buddy)
- [ ] Client-side, sans backend. Un backend lirait le pod avec *son* WebID : les ACL de l'utilisateur cesseraient de gouverner, et la frontière d'anonymisation deviendrait une promesse au lieu d'un mécanisme.

**Le jalon qui compte :** E2E avec un buddy réel = première cascade niveau 1 → 1+n avec une
deuxième personne, pas une simulation. C'est ce qui permet de corriger la cascade de
« maquetté » à « prouvé ».

---

## 4. Couche rollup — ce qui attend vraiment

Prématuré tant qu'il n'y a pas de données : les requêtes utiles se désigneront d'elles-mêmes.
Coût d'erreur faible — les rollups sont dérivés, donc recalculables.

- [ ] Cache de requête : SQLite-WASM ou IndexedDB, **dans le navigateur**, jetable, jamais sur le pod
- [ ] Rollups durables : documents Turtle sur le pod, adressables et permissionnables. On relit 12 rollups + le mois courant, pas 300 séances.
- [ ] Un bundle *est* un rollup avec une ACL dessus — un seul mécanisme, deux usages
- [ ] Provenance sur chaque rollup + capacité de régénération (dérive si une séance ancienne est éditée)

---

## 5. En parallèle, indépendant de tout

- [ ] **Tier 1 personnel** — document Turtle statique (`solid:oidcIssuer` + `pim:storage`) servi par nginx sur ton domaine, vhost via `hetzner-gateway`. Un après-midi. À documenter comme cas : *l'hébergeur lui-même n'est pas propriétaire de son identité.*
- [ ] **Décorateur d'access-log sur CSS** — prérequis WebID 1:1 par agent ✅ confirmé, donc l'audit est possible. Interception au point d'autorisation (seul endroit où coexistent identité, ressource et décision). Loguer aussi les **refus** — c'est l'indicateur de sécurité.
- [ ] **Corriger la cascade** : « la brique 01 tourne, 02–03 sont spécifiées et maquettées ». Cinq minutes, et le document devient plus solide.
- [ ] **Note de falsification `st:`** à pousser sur le pod

---

## 6. Skill d'écriture de recettes

**L'idée :** le langage naturel devient une recette valide sans embarquer d'IA dans l'app.
La création se fait au moment de l'écriture, pas de l'exécution — le tracker reste bête,
hors-ligne, sans dépendance à un modèle.

- [ ] Le skill lit le vocabulaire depuis sa source publiée (master pod / `/ontology`) plutôt que de l'avoir en dur — sinon il dérive du vocabulaire réel
- [ ] Entrée : description en langage naturel. Sortie : document recette valide, avec étapes typées et imbrication.
- [ ] **L'humain ne relit jamais du Turtle.** Le skill restitue un résumé lisible — « 3 tours de : 10 squats, 10 fentes, 10 push-ups ; 90 s de pause » — et c'est ça qu'on valide. Le Turtle est un détail d'implémentation, comme tu l'as dit : trop rude comme langue de relecture.
- [ ] Écriture sur le pod via le connecteur, après validation humaine explicite — *nothing automatic, but automated*
- [ ] **Cas ajustement** : lire une recette existante + les indicateurs de progression, proposer le stage suivant. C'est le level-up, et ça reste une proposition — le kiné ou l'usager décide.
- [ ] Cas professionnel : c'est l'ostéo qui utilise le skill, pas le patient. La recette part de son pod avec un grant.

**Ce que ça débloque :** le goulot d'étranglement du système n'est pas l'exécution, c'est
l'écriture de recettes. Sans ce skill, chaque recette est du travail manuel et l'écosystème
ne se remplit jamais. C'est aussi ce qui rend le créneau thérapeutique praticable — un
professionnel n'écrira pas du RDF.

---

## 7. Cartouche — le deep dive à résoudre en pratiquant

**Le principe :** l'architecture tient d'un domaine à l'autre, c'est la langue qui change.
Une cartouche est un module de contexte qu'on branche dans l'app — kiné, myofonctionnel,
pédagogie scolaire, évaluation fablab. Quatre cartouches, une architecture.

La cartouche porte trois choses :
1. les **termes et libellés** du domaine — la langue de l'interface
2. le **namespace** qu'elle lit
3. la **projection** : données du domaine → couche horizontale. C'est elle qui fait le travail.

Elle porte aussi les **alias et leur sens par silo** — « woodworking » et « wood shop » sont
la même chose. C'est déjà la Layer 2 du README de MoM. Ce que MoM appelait « ontologie
partagée entre réseaux » et ce qu'on appelle cartouche sont le même objet ; la cartouche dit
en plus *où* la réconciliation vit et *qui* la maintient.

**La cartouche est le livrable vendable.** « Un dashboard custom et ses requirements en
termes de bundle » est littéralement une cartouche. Et le skill d'écriture de recettes lit
la même cartouche, donc il parle la langue du domaine sans être réécrit.

### Le pattern de couches (issu de spaceAPI, à affiner en pratiquant)
Une couche est horizontale si **le champ garde le même sens pour quelqu'un d'un autre
secteur**. Test : « ouvert au public » oui ; « nombre de machines CNC » non. Définir une
couche par un secteur, c'est faire du vertical en l'appelant horizontal.

| Couche | Ce qu'elle est | État |
|---|---|---|
| `core:` | le minimum pour participer — identité, provenance, fraîcheur | **existe**, construit sur spaceAPI v15 simplifié (v15 véhicule trop de champs propres aux hackerspaces) |
| `mom:` | horizontal non-universel : **les lieux consultables sur une carte**. Pas « un secteur » — il n'aura pas de frère symétrique `health:` ou `edu:` qui ferait la même chose ailleurs. | existe |
| `activity:` ? | horizontal non-universel : **ce qui se passe dans le temps** — séances, protocoles, occurrences, progression. Une séance de kiné, un atelier scolaire et une induction laser sont structurellement la même chose. Ce serait le vocabulaire d'indicateurs qu'on cherche. | **hypothèse à valider** |
| `ext_*` | vertical, spécialisé, colle au silo | `ext_fab`, `ext_canary` existent |

Un fablab serait `core:` + `mom:` + `activity:` + `ext_fab`. Un kiné, `core:` + `activity:`
+ `ext_kine`. Les couches horizontales ne sont ni universelles ni exclusives.

- [ ] Valider ou invalider `activity:` en construisant la première cartouche
- [ ] Décider si la projection reste du code (adaptateur TS, version épinglée avec l'ontologie) ou devient déclarative — **ne pas chercher le déclaratif maintenant**, ça coûte cher et ne se justifie qu'à trois ou quatre cartouches, quand la répétition est visible
- [ ] Point de branchement côté kit : comment une app charge sa cartouche
- [ ] `core:` n'a pas besoin d'être re-conçu maintenant. Il ne devient contraignant qu'au premier franchissement réel de silo. Il faut juste **garder la projection dans la cartouche et pas dans le dashboard**, pour ne pas s'interdire de le faire plus tard.

### Correction : le vertical ne tombe qu'au franchissement de silo
Ma règle « le bundle vit dans le core » était trop rigide. Il n'y a pas de conflit
technique : un réseau homogène de fablabs peut parfaitement lire `ext_fab` directement.

**Ce qui force la réduction, c'est le consentement, pas la compatibilité de vocabulaire.**
L'individu risque de refuser. Un bundle peut donc porter n'importe quelle couche que les
deux parties partagent :

- 1 → 1+n : intra-silo, `core:` + `mom:`/`activity:` + `ext_*` — même langue, détail métier légitime
- 1+n → n+n : dépend. Réseau homogène, le vertical passe. Réseau hétérogène, retour à l'horizontal.
- n+n → public : `core:` seul

### La règle dure qui reste
**Un dashboard n'émet jamais un bundle qu'il a reçu. Il émet le sien, produit par sa propre
projection.** Vérifiable, n'empiète pas sur la décision de l'usager, et interdit la seule
chose vraiment dangereuse : le dashboard-relais qui fait transiter le bundle d'un membre
vers un étage auquel il n'a jamais consenti.

*(« Ne peut transmettre sans transformer » ne marche pas comme règle — l'usager décide,
ultimement. Et une guideline molle qu'on sait fausse ne se respecte pas.)*

La vraie raison pour laquelle input ≠ output n'est pas le vocabulaire : **la transformation
est une agrégation.** N individus deviennent une ligne. C'est là que l'information
individuelle disparaît, quelle que soit la couche.

---

## Correction — maps-of-making

Pas greenfield : déployé, réseaux pilotes (RFF, VOW), fédération Oxigraph, doc Diátaxis
complète, `/ontology`.

**Et ce n'est pas une app à part : c'est un dashboard dont la projection est géographique.**
Il lit des bundles horizontaux publics et les projette sur une carte au lieu d'un tableau,
avec la cartouche `mom:`. Ça consolide l'atlas au lieu de l'alourdir.

**C'est aussi le niveau 4 de la cascade, déjà en production.** Le « public » du bas de la
démo, qui n'a besoin d'aucun consentement puisque tout y est déjà public. Son argument
d'ouverture — *on pousse vers quinze annuaires, donc rien n'incite à maintenir, donc les
cartes pourrissent* — est structurellement celui de la cascade. Consentement et fraîcheur
sont le même problème structurel.

Donc les deux extrémités existent (capture au niveau 1, agrégat public au niveau 4) et
c'est le milieu qui manque — les étages où le consentement doit s'exprimer. À dire tel
quel : meilleure histoire que trois POC juxtaposés.

- [ ] L'ontologie MoM actuelle est reconnue comme une tentative naïve. La reformuler en cartouche `mom:` + `ext_fab`.

---

## Décisions figées

| Décision | Raison |
|---|---|
| Pas de `vcard:Group` pour l'autorisation | ACP n'a pas de matcher groupe. Les `acl:agentGroup` existants seraient **silencieusement ignorés** après le switch — pire mode d'échec possible. |
| Groupe comme *donnée* : oui | Un document de groupe lu par une app (avec la session utilisateur) fonctionne dans les deux modes. C'est un bundle. Le groupe lu par le *serveur* est ce qui meurt. |
| Agents listés sur les ressources sensibles | Se traduit proprement en WAC et en ACP. Bonus : les `.acl` ne sont lisibles que par les détenteurs de `acl:Control`, donc la liste des membres reste privée — contrairement au groupe qui doit être public (données à caractère personnel). |
| Pas de `pim:storage` vers un pod collectif | Le WebID déclare **qui tu es, pas ce à quoi tu as accès**. Sinon une app irait écrire tes données perso sur le pod de l'ASBL. Un container `openfab/<fonction>/` avec un grant à ton WebID fait le travail. |
| Carnet = unité de partage et d'ACL | Permet de partager « rééducation épaule » sans partager « course » |
| Copie de recette, pas de lien vivant | Une v2 casserait la correspondance données/protocole |
| Turtle pour les bundles, pas JSON/TOML | Le Turtle *est* le format d'échange — c'est ce qui permet au niveau 3 de lire un bundle de niveau 2 sans adaptateur. Un format parallèle recrée le problème que le RDF résout. |
| Dashboard client-side, sans backend | Sinon la cascade est une promesse de serveur, pas un mécanisme de protocole |
| Les couches horizontales ne se forkent pas | Les cartouches varient (produit vendable), l'horizontal converge. Une couche est horizontale si le champ garde le même sens dans un autre secteur. |
| Un dashboard n'émet jamais un bundle qu'il a reçu | Il émet le sien, produit par sa propre projection. Interdit le dashboard-relais sans empiéter sur la décision de l'usager. |
| Le kit reste sans helper ACL ; le dashboard porte le sien | On respecte l'ADR. Le scope du dashboard est limité aux bundles qu'il compose. Coût assumé : second rayon d'explosion ACP. |
| La cartouche porte la projection, pas le dashboard | C'est ce qui laisse la porte ouverte à un `core:` contraignant plus tard sans réécrire les dashboards. |
| L'app propose, l'humain décide | *Nothing automatic, but automated.* Pour du corps, c'est de la sécurité — et ça garde l'outil du bon côté de la frontière dispositif médical. |

---

## Fog of war — known unknowns

- **Point d'accroche exact dans CSS** pour décorer l'autorisation (Components.js — à lire dans le code)
- **Où atterrit l'access-log** : pod de l'utilisateur (souverain, mais écriture système dans un espace de consentement) vs côté provider avec vue backoffice (simple, moins souverain). Vrai arbitrage, pas tranché.
- **Transfert de compte collectif** : les multiples logins par compte règlent le cas nominal (ajouter son successeur, retirer son propre accès). Mais rien au niveau *compte* dans un CSS stock ne rend le transfert vérifiable ou irréversible. Feature backoffice à spécifier.
- **Coût réel de la migration `.acl` → `.acr`** : script + rollback à écrire, pas de conversion automatique
- **`activity:` existe-t-il ?** Hypothèse d'une seconde couche horizontale non-universelle pour « ce qui se passe dans le temps ». Se validera en construisant la première cartouche, pas en spécifiant.
- **Projection : code ou déclaratif ?** Adaptateur TS au début. La question ne se pose sérieusement qu'à trois ou quatre cartouches.
- **Point de branchement des cartouches côté kit** : comment une app charge la sienne sans que le kit connaisse les vocabulaires
- **Gouvernance des couches horizontales** : hébergement acquis (master pod, vocabulaires déréférençables, ou `/ontology` côté MoM). Qui arbitre un changement de `core:`, et comment un réseau propose un champ : ouvert.
- **Frontière dispositif médical** si le créneau thérapeutique se concrétise — et régime « données de santé » au sens RGPD
