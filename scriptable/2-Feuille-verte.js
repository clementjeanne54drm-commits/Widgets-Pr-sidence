// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: calendar-alt;

/* ==========================================================================
   WIDGET 2 : FEUILLE VERTE (ordre du jour de la séance publique)
   Taille conseillée : moyenne (jour en cours) ou grande (jour en cours, plus de détail).

   Ce que montre le widget :
   - la date, les séances (9h00, 15h00, 21h30…) et pour chacune les points inscrits :
     textes abrégés avec leur stade (1re lecture, CMP, nouvelle lecture…), questions au Gouvernement ;
   - « Pas de séance » s'il n'y a rien ce jour-là, avec la date de la prochaine séance.
   Après 22h00, le widget passe automatiquement au lendemain.

   Toucher le widget ouvre la feuille verte officielle (PDF de la Conférence des présidents).
   ========================================================================== */

// ---------- RÉGLAGE : adresse des données ----------
const URL_DONNEES = "https://raw.githubusercontent.com/clementjeanne54drm-commits/Widgets-Pr-sidence/donnees/feuille-verte.json";
const HEURE_BASCULE = 22;              // à partir de cette heure, on affiche le lendemain

// ---------- Apparence ----------
const dyn = (clair, sombre) => Color.dynamic(new Color(clair), new Color(sombre));
const COULEURS = {
  fond:       dyn("#FFFFFF", "#1C1C1E"),
  texte:      dyn("#1C1C1E", "#F2F2F7"),
  secondaire: dyn("#6E6E73", "#AEAEB2"),
  alerte:     dyn("#C25E00", "#FF9F0A"),
  filet:      dyn("#E5E5EA", "#38383A"),
  accent:     dyn("#2E7D32", "#66BB6A"),     // vert « feuille verte » pour le titre seulement
};
// L'agenda est publié une fois par jour : au-delà de 26 h, il est jugé ancien
const SEUIL_ANCIEN_MIN = 26 * 60;

// ==========================================================================
// Outils communs (identiques dans les 3 widgets)
// ==========================================================================
const pad = n => String(n).padStart(2, "0");
const hm = iso => { const d = new Date(iso); return `${d.getHours()}h${pad(d.getMinutes())}`; };
const isoJour = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const capitale = s => s.charAt(0).toUpperCase() + s.slice(1);
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const dateEnLettres = iso => { const d = new Date(iso + "T12:00:00"); return capitale(`${JOURS[d.getDay()]} ${d.getDate() === 1 ? "1er" : d.getDate()} ${MOIS[d.getMonth()]}`); };

async function chargerDonnees(url, nomCache) {
  const fm = FileManager.local();
  const chemin = fm.joinPath(fm.documentsDirectory(), nomCache);
  try {
    const req = new Request(url + (url.includes("?") ? "&" : "?") + "t=" + Math.floor(Date.now() / 60000));
    req.timeoutInterval = 12;
    const d = await req.loadJSON();
    if (req.response.statusCode !== 200 || !d || !d.genereLe) throw new Error("réponse invalide");
    fm.writeString(chemin, JSON.stringify(d));
    return { d, horsLigne: false };
  } catch (e) {
    if (fm.fileExists(chemin)) return { d: JSON.parse(fm.readString(chemin)), horsLigne: true };
    return { d: null, horsLigne: true };
  }
}

function texte(pile, contenu, taille, { gras = false, couleur = COULEURS.texte, lignes = 1, poids } = {}) {
  const t = pile.addText(String(contenu));
  t.font = poids === "semi" ? Font.semiboldSystemFont(taille) : poids === "medium" ? Font.mediumSystemFont(taille)
    : gras ? Font.boldSystemFont(taille) : Font.systemFont(taille);
  t.textColor = couleur;
  t.lineLimit = lignes;
  t.minimumScaleFactor = 0.75;
  return t;
}

function piedDePage(pile, d, horsLigne, gauche) {
  const ligne = pile.addStack();
  ligne.layoutHorizontally();
  ligne.centerAlignContent();
  if (gauche) texte(ligne, gauche, 8.5, { couleur: COULEURS.secondaire });
  ligne.addSpacer();
  // pour l'agenda, on date la donnée par le jour de publication de l'open data
  const ref = d.agendaDu || d.genereLe;
  const ancien = horsLigne || (Date.now() - Date.parse(ref)) / 60000 > SEUIL_ANCIEN_MIN;
  texte(ligne, ancien ? `données de ${hm(d.genereLe)}` : `màj ${hm(d.genereLe)}`, 9,
    { couleur: ancien ? COULEURS.alerte : COULEURS.secondaire, poids: ancien ? "semi" : undefined });
}

function widgetErreur(message) {
  const w = new ListWidget();
  w.backgroundColor = COULEURS.fond;
  texte(w, "Données indisponibles", 13, { gras: true });
  w.addSpacer(4);
  texte(w, message, 11, { couleur: COULEURS.secondaire, lignes: 3 });
  return w;
}

// ==========================================================================
// Choix du jour et mise en forme des points
// ==========================================================================
function jourAffiche(d) {
  const maintenant = new Date();
  const cible = new Date(maintenant);
  if (maintenant.getHours() >= HEURE_BASCULE) cible.setDate(cible.getDate() + 1);
  const iso = isoJour(cible);
  const demain = cible.getDate() !== maintenant.getDate();
  return {
    iso, quand: demain ? "Demain" : "Aujourd'hui",
    jour: d.jours.find(j => j.date === iso) || null,
    prochain: d.jours.find(j => j.date > iso) || null,
  };
}

/** Une ligne par point : « Suite · PLF 2027 » + stade en gris. */
function lignePoint(pile, p, taille, estompe = false) {
  const l = pile.addStack();
  l.layoutHorizontally();
  l.bottomAlignContent();
  // séance déjà terminée : tout le texte passe en gris
  const principal = estompe ? COULEURS.secondaire : COULEURS.texte;
  if (p.type === "qag" || p.type === "qosd") {
    texte(l, p.court, taille, { poids: "semi", couleur: principal });
    return;
  }
  if (p.prefixe) { texte(l, p.prefixe, taille, { couleur: COULEURS.secondaire }); l.addSpacer(4); }
  texte(l, p.court, taille, { poids: "semi", couleur: principal });
  if (p.stade) { l.addSpacer(5); texte(l, p.stade, taille - 1.5, { couleur: COULEURS.secondaire }); }
}

/** Affiche les séances d'un jour ; renvoie le nombre de lignes utilisées. */
function afficherSeances(w, jour, taille, lignesMax, filets) {
  let lignes = 0;
  for (const [i, s] of jour.seances.entries()) {
    if (lignes >= lignesMax) break;
    if (i && filets) { w.addSpacer(5); const filet = w.addStack(); filet.size = new Size(0, 1); filet.backgroundColor = COULEURS.filet; w.addSpacer(5); }
    else if (i) w.addSpacer(3);
    const rang = w.addStack();
    rang.layoutHorizontally();
    rang.topAlignContent();
    // état de la séance : en cours (vert), terminée (grisée), à venir (normale)
    const debut = Date.parse(s.debut), suivante = jour.seances[i + 1] ? Date.parse(jour.seances[i + 1].debut) : debut + 5 * 3600e3;
    const etat = Date.now() >= suivante ? "passee" : Date.now() >= debut ? "encours" : "avenir";
    const col = rang.addStack();
    col.layoutVertically();
    col.size = new Size(taille >= 13 ? 50 : 44, 0);
    texte(col, s.heure, taille, { gras: true, couleur: etat === "encours" ? COULEURS.accent : etat === "passee" ? COULEURS.secondaire : COULEURS.texte });
    if (etat === "encours") texte(col, "en cours", 8, { poids: "semi", couleur: COULEURS.accent });
    const pts = rang.addStack();
    pts.layoutVertically();
    const points = s.points.length ? s.points : [{ type: "autre", court: "Ordre du jour à venir" }];
    const place = Math.max(1, lignesMax - lignes);
    const visibles = points.length > place ? points.slice(0, place - 1) : points;
    for (const p of visibles) lignePoint(pts, p, taille, etat === "passee");
    if (visibles.length < points.length) texte(pts, `+ ${points.length - visibles.length} autre(s) point(s)`, taille - 2, { couleur: COULEURS.secondaire });
    lignes += Math.min(points.length, place);
  }
  return lignes;
}

function construire(d, horsLigne, grand) {
  const w = new ListWidget();
  w.backgroundColor = COULEURS.fond;
  w.setPadding(12, 14, 9, 14);
  w.url = d.urlFeuilleVerte;
  const { iso, quand, jour, prochain } = jourAffiche(d);

  // En-tête : FEUILLE VERTE · Aujourd'hui / mercredi 4 novembre
  const tete = w.addStack();
  tete.layoutHorizontally();
  tete.bottomAlignContent();
  texte(tete, "FEUILLE VERTE", 10, { gras: true, couleur: COULEURS.accent });
  tete.addSpacer(6);
  texte(tete, quand, 10, { poids: "semi", couleur: COULEURS.secondaire });
  tete.addSpacer();
  w.addSpacer(1);
  texte(w, jour ? capitale(jour.libelle) : dateEnLettres(iso), grand ? 19 : 16, { gras: true });
  w.addSpacer(grand ? 8 : 5);

  if (!jour) {
    texte(w, "Pas de séance", grand ? 22 : 18, { gras: true });
    w.addSpacer(3);
    if (prochain) {
      const s = prochain.seances[0];
      texte(w, `Prochaine : ${prochain.libelle} à ${s.heure}`, 12, { couleur: COULEURS.secondaire, lignes: 2 });
    }
    w.addSpacer();
    piedDePage(w, d, horsLigne, "Agenda open data AN");
    return w;
  }

  // Séances : heure en gras à gauche, points à droite, nombre de lignes limité par la taille
  const lignesMax = grand ? 15 : 5;
  const taille = grand ? 13 : 12;
  let lignes = afficherSeances(w, jour, taille, lignesMax, grand);

  // Grand format : on enchaîne sur les jours suivants tant qu'il reste de la place
  if (grand) {
    for (const j of d.jours.filter(x => x.date > jour.date)) {
      if (lignes > lignesMax - 4) break;
      w.addSpacer(10);
      texte(w, capitale(j.libelle), 13, { gras: true, couleur: COULEURS.secondaire });
      w.addSpacer(4);
      lignes += 2 + afficherSeances(w, j, taille - 1, lignesMax - lignes - 2, false);
    }
  }
  w.addSpacer();
  piedDePage(w, d, horsLigne, "Toucher pour la feuille verte officielle");
  return w;
}

// ==========================================================================
// Lancement
// ==========================================================================
const { d, horsLigne } = await chargerDonnees(URL_DONNEES, "widget-feuille-verte.json");
const famille = config.widgetFamily || "medium";
const widget = !d ? widgetErreur("Vérifiez la connexion. Le widget réessaiera tout seul.")
  : construire(d, horsLigne, famille === "large" || famille === "extraLarge");
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
