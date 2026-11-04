# Vérification des sources (4 novembre 2026)

Chaque source a été interrogée en direct avant d'écrire le code. Pour chacune : adresse exacte, format et
ce qui a changé par rapport au cahier des charges.

## Scrutins

| | |
|---|---|
| **Open data** | `https://data.assemblee-nationale.fr/static/openData/repository/{lég}/loi/scrutins/Scrutins.json.zip` |
| Format | ZIP de **30 Mo** contenant **9 578 fichiers** `json/VTANR5L17V{n}.json`, soit un fichier par scrutin (194 Mo décompressés) |
| Contenu utile | `scrutin.numero`, `dateScrutin` (date seule), `titre`, `sort.code`, `syntheseVote.{nombreVotants, decompte.pour/contre/abstentions}`, `ventilationVotes.organe.groupes.groupe[]` (par groupe : `organeRef`, `decompteVoix`, et la liste nominative avec `numPlace` et `parDelegation`) |
| **Constat** | **Mise à jour une fois par jour seulement.** Le 4 novembre à 12h, l'open data s'arrêtait au scrutin **n° 9578 (2 nov.)** alors que le site affichait déjà le **n° 9650 (3 nov.)**. L'open data ne peut donc pas servir de source principale pour « le dernier scrutin ». |
| **Site** | `https://www.assemblee-nationale.fr/dyn/{lég}/scrutins` (liste), `/dyn/{lég}/scrutins/{n}` (détail) |
| Format | HTML. La page de détail contient la synthèse (« Nombre de votants : 123 », « Pour l'adoption : 65 »…), la séance (« Deuxième séance du mardi 3 novembre 2026 ») et un bloc `<ul id="groupe{SIGLE}">` par groupe avec `data-organe-id` et « Pour : n », « Contre : n », « Abstention : n », « Non votant : n ». |
| **Décision** | J'**inverse l'ordre** prévu : le site passe en premier (parsé côté serveur, jamais sur le téléphone), et l'open data sert de repli. Le format JSON par scrutin n'existe pas sur le site (`/dyn/opendata/VTANR…json` renvoie 404). |
| **Heure du scrutin** | **Publiée nulle part** : ni dans l'open data (`dateScrutin` est une date), ni sur la page du scrutin. Le serveur note donc l'heure à laquelle il voit le scrutin pour la première fois (précision : 5 minutes). |
| Délégations | Seul l'open data distingue `parDelegation`. Exemple du n° 9578 : 96 votants, dont 83 présents physiquement. |
| Sigle UDR | Le site et l'open data l'abrègent **« UDDPLR »** (Union des droites pour la République). Le rattachement aux blocs se fait donc par motif. |

## Agenda / feuille verte

| | |
|---|---|
| **Open data** | `https://data.assemblee-nationale.fr/static/openData/repository/{lég}/vp/reunions/Agenda.json.zip` |
| Format | ZIP de **8,6 Mo**, 8 214 fichiers `json/reunion/RUANR5L17S{année}ID{S\|C}{n}.json` (`IDS` = séance publique, `IDC` = commission). Pour une séance : `@xsi:type = "seance_type"`, `timeStampDebut` (avec fuseau), `cycleDeVie.etat`, `identifiants.quantieme` (« Première »…), `ODJ.pointsODJ.pointODJ[]` avec `objet`, `typePointODJ` (« Questions au Gouvernement », « Suite de la discussion », « Vote solennel »…), `procedure` et `cycleDeVie.etat` (les points « Supprimé » sont filtrés). |
| Constat | Mise à jour une fois par jour (dernier fichier : 3 nov. 11h40). Les séances sont publiées plusieurs semaines à l'avance. Le stade (1re lecture, nouvelle lecture, CMP…) n'a pas de champ dédié : il est lu dans l'intitulé (« (première partie) », « en nouvelle lecture »…). |
| **Feuille verte officielle** | `https://www.assemblee-nationale.fr/dyn/static/seance/conference.pdf`. Adresse stable, PDF de la Conférence des présidents (vérifié : « Conférence des présidents du mardi 3 novembre 2026 »). C'est la cible du tap. |
| Note | La séance du mercredi commence à **14h00** (et non 15h00) : les heures viennent toujours des données, jamais d'une grille fixe. |

## eLiasse : **a changé**

| | |
|---|---|
| Ancien endpoint | `https://eliasse.assemblee-nationale.fr/eliasse/prochainADiscuter.do` répond **200, mais renvoie la page d'accueil** de la nouvelle application (Angular). **Il n'existe plus.** |
| **Nouvelle API** | Trouvée dans le code de l'application : base `https://eliasse.assemblee-nationale.fr/api-eliasse/`, JSON public sans authentification. |
| `organes` | Liste des organes. La séance publique est `{"uid":"PO838901","abreviation":"AN","libelle":"Assemblée nationale de la 17ème législature"}`. |
| `prochainadiscuter` | `[{"uidOrgane","uidTexte","uidExamen","uidAmendement"}]`, un élément par organe. Exemple pour la séance : `AMANR5L17PO838901B3210P1D1N000701`. |
| `examens` | `[{"uid","organeRef","statut":"En cours","texte":{"uid","libelle","bibard","partie"}}]` |
| `examens/{uidExamen}/statistiques` | `{"nombreAmendementsTotal":3391,"nombreAmendementsExamines":3022,"nombreAmendementsRestants":369}` |
| `examens/{uidExamen}/derouleur` | 1,5 Mo : `places[]` (articles : « Article 42 », « Après l'article 26 »…) contenant chacune `amendements[]` (`numero`, `sort`, `auteur.libelle`). |
| `textes/{uidTexte}/examens/{uidExamen}/amendements/{uidAmdt}/with_neighbors` | 2,5 Mo : l'amendement et ses 2 voisins de chaque côté, avec `numero` (« I-701 »), `division.titre`, `auteur.{ref, libelle, typeAuteur}`, `cosignatairesSuffixe` (« et les membres du groupe Rassemblement National »). |
| Temps réel | L'application reçoit aussi les mises à jour en WebSocket (`/topic/get-all-prochains-a-discuter`). Inutile ici : le serveur interroge l'API REST toutes les 5 minutes. |
| **Manques** | (1) **Aucun avis** commission ni Gouvernement dans l'API. (2) Le **groupe** de l'auteur n'est pas fourni : il est retrouvé grâce à `auteur.ref` (identifiant `PA…`) et à la liste des députés en exercice (open data AMO10). (3) **Pas de lien direct** vers un texte : l'application ne gère pas de paramètres d'URL, donc le tap ouvre la page d'accueil d'eLiasse. |

## Députés en exercice (pour le groupe des auteurs et la taille des blocs)

`https://data.assemblee-nationale.fr/static/openData/repository/{lég}/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes.json.zip`.
ZIP de 4,9 Mo : `json/acteur/PA….json` (mandats, dont `typeOrgane = "GP"` pour le groupe) et `json/organe/PO….json`
(`libelleAbrev`, `libelle`, `couleurAssociee`). Il y a aujourd'hui 574 députés rattachés à un groupe, dans 12 groupes. Le fichier est téléchargé une fois par jour.

## « Séance en cours » : pas de source directe

Aucune source publique ne dit « la séance est ouverte ou levée » (la page vidéo `direct.php` redirige ; le site n'affiche
pas d'état). Le serveur combine donc l'heure de début donnée par l'agenda, une durée estimée (fin vers 13h, 20h ou 1h, en
s'arrêtant au début de la séance suivante) et l'activité d'eLiasse : si le prochain amendement change, la séance est en cours.
