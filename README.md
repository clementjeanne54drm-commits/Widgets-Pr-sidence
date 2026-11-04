# Widgets séance : présence, feuille verte, eLiasse

Trois widgets iPhone (Scriptable) pour suivre la séance publique d'un coup d'œil.

```
 Sources Assemblée ──► serveur/build.mjs (toutes les 5 min en séance, 1 fois/heure sinon)
                           │
                           ├── presence.json       (~3 Ko)
                           ├── feuille-verte.json  (~30 Ko)
                           └── eliasse.json        (~2 Ko)
                                     │
                    iPhone (Scriptable) : lit uniquement ces 3 fichiers
```

| Dossier | Contenu |
|---|---|
| `serveur/build.mjs` | Script serveur (Node 20 ou plus récent, aucune dépendance) |
| `.github/workflows/widgets.yml` | Planification GitHub Actions + publication sur la branche `donnees` |
| `scriptable/` | Les 3 scripts à installer dans Scriptable |
| `GUIDE-INSTALLATION.md` | Guide pas à pas pour l'iPhone (personne non technique) |
| `SOURCES.md` | Vérification des sources : formats exacts et changements constatés |

## 1. Mettre en route le serveur

### Option A : GitHub Actions (gratuit, rien à héberger)

1. Créer un dépôt **public** (par exemple `widgets-seance`) et y pousser ce dossier.
   Il doit être public pour que l'iPhone lise les fichiers sans identifiant. Les données sont publiques de toute façon.
2. Onglet **Actions** : activer les workflows, ouvrir « Widgets séance », puis **Run workflow** pour un premier passage.
3. Au bout de 1 à 2 minutes, la branche `donnees` contient les 3 fichiers. Leurs adresses sont :
   `https://raw.githubusercontent.com/<compte>/widgets-seance/donnees/presence.json`
   (même chose pour `feuille-verte.json` et `eliasse.json`).
4. Reporter ces adresses dans la ligne `URL_DONNEES` en haut de chacun des 3 scripts Scriptable,
   **avant** de les envoyer sur l'iPhone.

Limites à connaître :
- GitHub décale parfois les tâches planifiées de 5 à 15 minutes aux heures chargées.
- `raw.githubusercontent.com` garde les fichiers en cache jusqu'à 5 minutes.
- GitHub suspend les tâches planifiées d'un dépôt sans activité pendant 60 jours. Une session
  parlementaire suffit à éviter ça, mais il faut vérifier à la rentrée.

### Option B : Perchoir Radar (cadence exacte)

Sur le serveur, avec Node 20 ou plus récent :

```bash
crontab -e
```

puis ajouter la ligne (en adaptant les chemins) :

```
*/5 * * * * cd /srv/widgets-seance && node serveur/build.mjs --out /var/www/perchoir-radar/widgets >> /var/log/widgets-seance.log 2>&1
```

Les widgets lisent alors `https://<votre-domaine>/widgets/presence.json`, etc. Aucun en-tête CORS n'est nécessaire, car Scriptable n'est pas un navigateur.
Le dossier de sortie contient aussi `_etat.json` (cache interne). Il peut rester public, mais on peut aussi le bloquer.

### Fonctionnement du script

- **Cadence** : le planificateur l'appelle toutes les 5 minutes. Le script se compare à l'agenda :
  en séance (avec 30 minutes de marge), il fait un passage complet ; sinon, il ne travaille
  qu'une fois par heure et sort aussitôt les autres fois. `--force` force un passage complet.
- **Législature** : jamais codée en dur. Le script croise trois sources : les chemins
  `/repository/{n}/` de l'open data, le libellé de l'organe « AN » dans eLiasse, et la présence
  de `/dyn/{n+1}/scrutins` sur le site. Il vérifie toutes les 12 heures.
- **Robustesse** : chaque fichier est produit indépendamment. Si une source tombe, l'ancien
  fichier reste en place, son champ `genereLe` vieillit, et le widget affiche
  « données de 13h38 » en orange. L'écriture est atomique (fichier temporaire puis renommage).
- **Tester le repli open data** : `SIMULER_PANNE_SITE=1 node serveur/build.mjs --out public --force`.

## 2. Limites à connaître (et à dire à la directrice de cabinet)

1. **La présence n'est pas mesurée en temps réel.** L'Assemblée ne publie rien de tel. Le widget
   affiche le nombre de **votants** au dernier scrutin public, **délégations comprises** : un député
   présent peut voter pour un collègue absent. Exemple sur le scrutin n° 9578 (open data) :
   96 votants, dont 83 physiquement présents.
2. **L'heure des scrutins n'est publiée nulle part**, ni dans l'open data ni sur le site, qui ne donne que
   la date et la séance. L'heure affichée (« d'après le scrutin de 14h35 ») est celle où le serveur
   a **repéré** le scrutin, à 5 minutes près. Si le serveur ne tournait pas à ce moment-là, le widget
   affiche le numéro du scrutin à la place de l'heure.
3. **iOS décide seul quand un widget se met à jour.** Scriptable demande une mise à jour toutes les
   5 minutes, mais en pratique iOS rafraîchit un widget toutes les 15 à 30 minutes environ, selon
   l'usage du téléphone. L'heure en bas de chaque widget dit toujours de quand date l'affichage.
4. **eLiasse ne publie plus les avis** de la commission et du Gouvernement (le champ n'existe
   pas dans la nouvelle API). La ligne s'affichera automatiquement si l'API les rétablit.
5. **L'agenda open data est publié une fois par jour.** Un changement d'ordre du jour décidé
   le jour même peut n'apparaître que le lendemain. Le tap ouvre toujours la feuille verte officielle.

## 3. Format des 3 fichiers JSON

Les champs sont stables (`schema: 1`). Les dates sont au format ISO 8601 UTC, et les heures affichées sont déjà converties à l'heure de Paris.

<details><summary><code>presence.json</code></summary>

```json
{
 "schema": 1, "genereLe": "2026-11-04T13:40:02Z", "legislature": 17, "source": "site",
 "sieges": 577, "siegesParBloc": { "gauche": 197, "autres": 36, "socle": 212, "rn": 140, "vacants": 0 },
 "avertissement": "L'Assemblée ne publie pas la présence en temps réel : …",
 "dernier": {
  "numero": 9650, "url": "https://www.assemblee-nationale.fr/dyn/17/scrutins/9650",
  "titre": "l'amendement n° 3550 de Mme Coggia …", "titreCourt": "Amdt 3550 Coggia · art. 42 · PLF 2027",
  "seance": "Deuxième séance du mardi 3 novembre 2026", "date": "2026-11-03", "vuA": "2026-11-03T22:48:00Z",
  "votants": 123, "pourcentage": 21.3, "blocs": { "gauche": 40, "socle": 38, "rn": 40, "autres": 5 },
  "groupes": [{ "abrev": "RN", "bloc": "rn", "votants": 38, "membres": 121 }, "…"],
  "presentsPhysiquement": null
 },
 "scrutins": [{ "numero": 9650, "url": "…", "titreCourt": "…", "date": "2026-11-03", "vuA": "…",
                "sort": "adopté", "pour": 65, "contre": 58, "abstention": 0, "votants": 123 }, "…"]
}
```
`source` vaut `"open data (J-1)"` en cas de repli. `presentsPhysiquement` n'est connu qu'en repli open data.
</details>

<details><summary><code>feuille-verte.json</code></summary>

```json
{
 "schema": 1, "genereLe": "…", "agendaDu": "…", "legislature": 17,
 "urlFeuilleVerte": "https://www.assemblee-nationale.fr/dyn/static/seance/conference.pdf",
 "jours": [{
  "date": "2026-11-04", "libelle": "mercredi 4 novembre",
  "seances": [{ "heure": "14h00", "debut": "2026-11-04T13:00:00.000Z", "numero": "Première",
   "points": [
    { "type": "qag", "court": "Questions au Gouvernement", "stade": null },
    { "type": "texte", "court": "PLF 2027", "stade": "1re partie", "prefixe": "Suite",
      "libelle": "Suite de la discussion du projet de loi de finances pour 2027 (première partie)" }
   ]}]
 }]
}
```
`type` vaut `qag`, `qosd`, `texte`, `vote` (vote solennel) ou `autre`. `stade` peut valoir : 1re lecture, 2e lecture,
Nouvelle lecture, CMP, Lecture définitive, 1re partie, 2de partie, éventuellement complété par « proc. simplifiée » ou « LEC ».
</details>

<details><summary><code>eliasse.json</code></summary>

```json
{
 "schema": 1, "genereLe": "…", "legislature": 17, "etat": "seance",
 "texte": { "uid": "PRJLANR5L17B3210P1D1", "bibard": "3210", "libelle": "Projet de loi de finances pour 2027", "court": "PLF 2027 · 1re partie" },
 "article": "Article 42",
 "prochain": { "numero": "I-701", "auteur": "M. Renault", "groupe": "RN", "bloc": "rn",
               "avisCommission": null, "avisGouvernement": null, "suivants": ["I-3386", "I-4009"] },
 "restants": 369, "total": 3391, "examines": 3022, "dernierMouvement": "…",
 "prochaineSeance": { "debut": "…", "heure": "14h00", "date": "2026-11-04", "jour": "mercredi 4 novembre" },
 "fenetres": [{ "debut": "…", "fin": "…" }],
 "urlEliasse": "https://eliasse.assemblee-nationale.fr/"
}
```
`etat` vaut `seance`, `qag` (début de séance consacré aux questions au Gouvernement) ou `levee`.
L'agenda ne donne que l'heure de début des séances. Le champ `fenetres` contient donc des plages estimées
(fin vers 13h, 20h et 1h), prolongées tant que eLiasse bouge. Le widget s'en sert pour recalculer lui-même
l'état de la séance quand ses données ont vieilli.
</details>

## 4. Personnaliser

- **Couleurs des blocs** : constante `COULEURS` en haut de chaque script. Je n'ai pas reçu la capture des
  2 widgets existants : les teintes actuelles sont une approximation, à recaler sur les codes de ces widgets.
- **Rattachement des groupes aux blocs** : constante `BLOCS` dans `serveur/build.mjs`. Le classement se fait par motif
  (`^UD` couvre le sigle « UDDPLR » actuellement utilisé par le site pour l'UDR). Tout groupe non reconnu va dans « Autres ».
