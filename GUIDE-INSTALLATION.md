# Installer les widgets « séance » sur votre iPhone

Comptez environ 10 minutes. Rien à configurer : les scripts que vous recevez sont déjà réglés.

Vous allez installer 3 widgets :

| Widget | Ce qu'il montre | Taille conseillée | Si vous le touchez |
|---|---|---|---|
| **1 – Présence** | Nombre de députés qui ont voté au dernier scrutin, et les 3 derniers scrutins | Moyen | Ouvre la page du dernier scrutin |
| **2 – Feuille verte** | Les séances du jour et les textes inscrits | Moyen ou Grand | Ouvre la feuille verte officielle |
| **3 – Eliasse** | Le prochain amendement discuté en séance | Petit ou Moyen, et écran verrouillé | Ouvre eLiasse |

---

## Étape 1 : Installer l'application Scriptable

1. Ouvrez l'**App Store**.
2. Recherchez **Scriptable** (application gratuite, icône noire avec un symbole blanc).
3. Touchez **Obtenir**, puis confirmez.
4. Ouvrez Scriptable une première fois, puis refermez-la. L'application est en anglais, c'est normal.

## Étape 2 : Ajouter les 3 scripts

Vous avez reçu 3 fichiers : `1-Presence-seance.js`, `2-Feuille-verte.js` et `3-Eliasse.js`.

**Méthode simple (fichiers reçus par AirDrop ou par e-mail)** : faites ceci pour chacun des 3 fichiers.

1. Touchez le fichier pour l'ouvrir.
2. Touchez le bouton **Partager** (carré avec une flèche vers le haut).
3. Choisissez **Enregistrer dans Fichiers**.
4. Choisissez **iCloud Drive**, puis le dossier **Scriptable**.
5. Touchez **Enregistrer**.

Ouvrez ensuite Scriptable : les 3 scripts apparaissent sous forme de tuiles.

> Si le dossier « Scriptable » n'apparaît pas dans iCloud Drive, utilisez la méthode ci-dessous.

**Autre méthode (copier-coller)**

1. Ouvrez le fichier reçu, touchez longuement le texte, puis **Tout sélectionner** et **Copier**.
2. Dans Scriptable, touchez le **+** en haut à droite.
3. Touchez la page vide, puis **Coller**.
4. Touchez le titre « Untitled Script » tout en haut et renommez-le (par exemple `1-Presence-seance`).
5. Touchez **Done** en haut à gauche.

## Étape 3 : Vérifier que tout fonctionne

Dans Scriptable, touchez une tuile. Un aperçu du widget s'affiche au bout de quelques secondes.
Touchez **Close** pour revenir.

- **Vous voyez des chiffres** : c'est bon.
- **Vous voyez « Données indisponibles »** : vérifiez que vous avez du réseau, puis réessayez. Si le message persiste, prévenez le cabinet.

## Étape 4 : Placer les widgets sur l'écran d'accueil

1. Sur l'écran d'accueil, **appuyez longuement sur un espace vide** jusqu'à ce que les icônes bougent.
2. Touchez **Modifier** en haut à gauche, puis **Ajouter un widget**.
3. Dans la barre de recherche, tapez **Scriptable** et touchez le résultat.
4. **Faites glisser** pour choisir la taille (petit, moyen, grand), puis touchez **Ajouter le widget**.
5. Le widget apparaît avec un message en anglais (« Select script… »). C'est normal.
6. Touchez **OK** en haut à droite pour arrêter le mode modification.
7. **Appuyez longuement sur le nouveau widget**, puis touchez **Modifier le widget**.
8. Sur la ligne **Script**, choisissez le script voulu (voir le tableau ci-dessous).
9. Laissez les autres lignes telles quelles (**When Interacting** et **Parameter**).
10. Touchez à côté de la fenêtre pour la fermer.

Recommencez pour chaque widget :

| Taille choisie à l'étape 4 | Script à choisir à l'étape 8 |
|---|---|
| Moyen | `1-Presence-seance` |
| Moyen (ou Grand pour voir aussi les jours suivants) | `2-Feuille-verte` |
| Petit ou Moyen | `3-Eliasse` |

> Astuce : vous pouvez empiler plusieurs widgets de même taille. Faites glisser un widget sur un autre pour créer une pile, puis faites défiler du doigt pour passer de l'un à l'autre.

## Étape 5 (facultatif) : Eliasse sur l'écran verrouillé

1. Verrouillez l'iPhone, puis rallumez l'écran **sans aller sur l'écran d'accueil**. Restez sur l'écran avec l'heure.
2. **Appuyez longuement** sur l'écran, puis touchez **Personnaliser** et choisissez **Écran verrouillé**.
3. Touchez la **zone des widgets**, sous l'heure.
4. Cherchez **Scriptable** et choisissez le format **rectangulaire** (le plus large, le plus lisible).
5. Touchez le widget ajouté, puis sur la ligne **Script**, choisissez `3-Eliasse`.
6. Fermez, puis touchez **OK** en haut à droite.

Sur l'écran verrouillé, le widget affiche trois lignes : le texte et l'article, puis le numéro de l'amendement et le groupe, puis le nombre d'amendements restants.

---

## Comment lire les widgets

**En haut à droite de chaque widget, l'heure de mise à jour :**
- `màj 14h40` en gris : les données sont récentes.
- `données de 13h38` en **orange** : le téléphone n'a pas pu récupérer de nouvelles données (réseau coupé, ou panne côté Assemblée). Le widget montre la dernière information connue, avec son heure.

**Widget 1 – Présence**
- Le grand chiffre est le nombre de députés qui ont voté au dernier scrutin public, sur 577 sièges.
- Le demi-cercle est le **vrai plan de l'hémicycle** : chaque point est le siège réel d'un député. Couleur vive : il a voté. Couleur pâle : il n'a pas voté.
- La carte de droite détaille les 12 groupes : votants / effectif du groupe (par exemple `SOC 16 / 68`).
- Les 4 chiffres colorés donnent la répartition par bloc : **Gauche** (rouge), **Socle commun** (jaune), **RN-UDR** (bleu) et **Autres** (gris).
- **Important :** l'Assemblée ne publie pas de présence en temps réel. Le chiffre vient du **dernier scrutin public**
  (« d'après le scrutin de 14h32 »), et un député peut voter pour un collègue absent (délégation).
  C'est donc un ordre de grandeur, pas un comptage dans l'hémicycle.

**Widget 2 – Feuille verte**
- Il affiche les séances du jour et, pour chaque séance, les textes inscrits avec leur stade (1re lecture, nouvelle lecture, CMP…).
- À partir de **22h00**, il affiche automatiquement le lendemain.
- « Pas de séance » indique aussi la date de la prochaine séance.

**Widget 3 – Eliasse**
- Il affiche le texte en discussion, l'article, le **numéro du prochain amendement**, son auteur et son groupe, et le nombre d'amendements restants.
- Hors séance, il affiche par exemple « Séance levée · reprise à 15h00 ».
- Les avis de la commission et du Gouvernement ne sont plus publiés par eLiasse : ils ne s'affichent donc pas.

## Actualiser un widget à la demande

En taille **moyenne** et **grande**, l'heure en haut à droite (« màj 14h40 ») est un **bouton** :

1. Touchez-le.
2. Scriptable s'ouvre et affiche aussitôt le widget avec les dernières données.
3. Revenez à l'écran d'accueil : le widget se met en général à jour dans la foulée.

Partout ailleurs, toucher le widget ouvre la page du scrutin, la feuille verte ou eLiasse, comme avant.

Sur un **petit** widget, iOS n'autorise qu'une seule action au toucher. Pour qu'il actualise au lieu d'ouvrir le site :
1. Appuyez longuement sur le widget, puis **Modifier le widget**.
2. Dans **Parameter**, écrivez `actualiser`.

## Questions fréquentes

**Le widget ne change pas toutes les 5 minutes.**
Pendant les séances, les données sont bien produites toutes les 5 minutes. Mais c'est l'iPhone qui décide quand il redessine
un widget, en général toutes les 15 à 30 minutes. Pour avoir les données tout de suite, touchez le bouton « màj » en haut à droite.

**Le widget affiche « Select script in widget configurator ».**
L'étape 4 (points 7 à 9) n'a pas été terminée : appuyez longuement sur le widget, puis **Modifier le widget**, puis choisissez le script.

**Toucher le widget ouvre Scriptable au lieu du site.**
Appuyez longuement sur le widget, puis **Modifier le widget**, et vérifiez que **When Interacting** est réglé sur **Open App** (le réglage par défaut). Le script se charge ensuite d'ouvrir la bonne page.

**L'heure est en orange depuis longtemps.**
Vérifiez votre connexion. Si le réseau fonctionne, prévenez le cabinet : une source de l'Assemblée a peut-être changé.

**Je change d'iPhone.**
Si les scripts sont dans iCloud Drive (méthode simple de l'étape 2), ils réapparaissent seuls dans Scriptable. Il suffit de refaire l'étape 4.
