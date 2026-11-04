// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: calendar-alt;

/* ==========================================================================
   WIDGET 2 : FEUILLE VERTE (ordre du jour de la séance publique)
   Taille conseillée : moyenne (jour en cours) ou grande (jour en cours + jours suivants).

   Ce que montre le widget :
   - la date, les séances (9h00, 15h00, 21h30…) et pour chacune les points inscrits :
     textes abrégés avec leur stade (1re lecture, CMP, nouvelle lecture…), questions au Gouvernement ;
   - la séance en cours en vert, les séances terminées en gris ;
   - « Pas de séance » s'il n'y a rien ce jour-là, avec la date de la prochaine séance.
   Après 22h00, le widget passe automatiquement au lendemain.

   Toucher le widget ouvre la feuille verte officielle (PDF de la Conférence des présidents).
   ========================================================================== */

// ---------- RÉGLAGE : adresse des données ----------
const URL_DONNEES = "https://raw.githubusercontent.com/clementjeanne54drm-commits/Widgets-Pr-sidence/donnees/feuille-verte.json";
const HEURE_BASCULE = 22;              // à partir de cette heure, on affiche le lendemain

// ==========================================================================
// Apparence (identique dans les 3 widgets)
// ==========================================================================
const dyn = (clair, sombre) => Color.dynamic(new Color(clair), new Color(sombre));
const COULEURS = {
  fond:       dyn("#FFFFFF", "#1C1C1E"),
  carte:      dyn("#F2F2F7", "#2C2C2E"),
  texte:      dyn("#1C1C1E", "#F2F2F7"),
  secondaire: dyn("#8A8A8E", "#98989D"),
  alerte:     dyn("#C25E00", "#FF9F0A"),
  vert:       dyn("#248A3D", "#30D158"),   // « feuille verte » et séance en cours
  vertPale:   dyn("#E3F4E7", "#1E3A26"),
};
// L'agenda est publié une fois par jour : au-delà de 26 h, il est jugé ancien
const SEUIL_ANCIEN_MIN = 26 * 60;

// ==========================================================================
// Outils communs
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
    : poids === "lourd" ? Font.heavySystemFont(taille) : gras ? Font.boldSystemFont(taille) : Font.systemFont(taille);
  t.textColor = couleur;
  t.lineLimit = lignes;
  t.minimumScaleFactor = 0.75;
  return t;
}

function pastille(pile, libelle, fond, encre, taille = 9) {
  const p = pile.addStack();
  p.backgroundColor = fond;
  p.cornerRadius = 5;
  p.setPadding(1.5, 5, 1.5, 5);
  texte(p, libelle, taille, { gras: true, couleur: encre });
  return p;
}

/** En-tête : icône calendrier, « FEUILLE VERTE », pastille Aujourd'hui/Demain, heure de mise à jour. */
function entete(pile, quand, d, horsLigne) {
  const l = pile.addStack();
  l.layoutHorizontally();
  l.centerAlignContent();
  const sym = SFSymbol.named("calendar");
  sym.applyFont(Font.boldSystemFont(10));
  const img = l.addImage(sym.image);
  img.imageSize = new Size(12, 12);
  img.tintColor = COULEURS.vert;
  l.addSpacer(4);
  texte(l, "FEUILLE VERTE", 10, { gras: true, couleur: COULEURS.vert });
  l.addSpacer(6);
  pastille(l, quand.toUpperCase(), COULEURS.carte, COULEURS.secondaire, 8.5);
  l.addSpacer();
  const ancien = horsLigne || (Date.now() - Date.parse(d.agendaDu || d.genereLe)) / 60000 > SEUIL_ANCIEN_MIN;
  texte(l, ancien ? `données de ${hm(d.genereLe)}` : `màj ${hm(d.genereLe)}`, 9.5,
    { poids: ancien ? "semi" : "medium", couleur: ancien ? COULEURS.alerte : COULEURS.secondaire });
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
// Choix du jour et mise en forme des séances
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

/** État d'une séance : en cours, passée ou à venir (fin estimée au début de la suivante, ou +5 h). */
function etatSeance(jour, i) {
  const s = jour.seances[i];
  const debut = Date.parse(s.debut);
  const fin = jour.seances[i + 1] ? Date.parse(jour.seances[i + 1].debut) : debut + 5 * 3600e3;
  return Date.now() >= fin ? "passee" : Date.now() >= debut ? "encours" : "avenir";
}

/** Un point de l'ordre du jour : « QAG » en pastille, ou « Suite · PLF 2027 » + stade en pastille grise. */
function lignePoint(pile, p, taille, estompe) {
  const l = pile.addStack();
  l.layoutHorizontally();
  l.centerAlignContent();
  const principal = estompe ? COULEURS.secondaire : COULEURS.texte;
  if (p.type === "qag" || p.type === "qosd") {
    pastille(l, p.type === "qag" ? "QAG" : "QOSD", estompe ? COULEURS.carte : COULEURS.vert, estompe ? COULEURS.secondaire : new Color("#FFFFFF"), taille - 3);
    l.addSpacer(5);
    texte(l, p.court, taille, { poids: "semi", couleur: principal });
    return;
  }
  if (p.prefixe) { texte(l, p.prefixe, taille, { couleur: COULEURS.secondaire }); l.addSpacer(4); }
  texte(l, p.court, taille, { gras: true, couleur: principal });
  if (p.stade) { l.addSpacer(5); pastille(l, p.stade, COULEURS.carte, COULEURS.secondaire, taille - 3.5); }
}

/** Les séances d'un jour : heure dans une pastille à gauche, points à droite. Renvoie les lignes utilisées. */
function afficherSeances(w, jour, taille, lignesMax) {
  let lignes = 0;
  for (const [i, s] of jour.seances.entries()) {
    if (lignes >= lignesMax) break;
    if (i) w.addSpacer(5);
    const etat = etatSeance(jour, i);
    const rang = w.addStack();
    rang.layoutHorizontally();
    rang.topAlignContent();
    if (etat === "encours") { rang.backgroundColor = COULEURS.vertPale; rang.cornerRadius = 8; rang.setPadding(3, 4, 3, 4); }

    // heure : pastille verte si en cours, grise si passée
    const col = rang.addStack();
    col.size = new Size(taille * 3.9, 0);
    col.layoutVertically();
    const h = col.addStack();
    h.cornerRadius = 6;
    h.setPadding(2, 5, 2, 5);
    h.backgroundColor = etat === "encours" ? COULEURS.vert : COULEURS.carte;
    texte(h, s.heure, taille - 0.5, { gras: true, couleur: etat === "encours" ? new Color("#FFFFFF") : etat === "passee" ? COULEURS.secondaire : COULEURS.texte });
    if (etat === "encours") texte(col, "EN COURS", 7, { gras: true, couleur: COULEURS.vert });

    rang.addSpacer(6);
    const pts = rang.addStack();
    pts.layoutVertically();
    pts.addSpacer(1.5);
    const points = s.points.length ? s.points : [{ type: "autre", court: "Ordre du jour à venir" }];
    const place = Math.max(1, lignesMax - lignes);
    const visibles = points.length > place ? points.slice(0, place - 1) : points;
    visibles.forEach((p, k) => { if (k) pts.addSpacer(3); lignePoint(pts, p, taille, etat === "passee"); });
    if (visibles.length < points.length) texte(pts, `+ ${points.length - visibles.length} autre(s) point(s)`, taille - 2, { couleur: COULEURS.secondaire });
    rang.addSpacer();
    lignes += Math.min(points.length, place);
  }
  return lignes;
}

// ==========================================================================
// Construction du widget
// ==========================================================================
function construire(d, horsLigne, grand) {
  const w = new ListWidget();
  w.backgroundColor = COULEURS.fond;
  w.setPadding(12, 13, 11, 13);
  w.url = d.urlFeuilleVerte;
  const { iso, quand, jour, prochain } = jourAffiche(d);

  entete(w, quand, d, horsLigne);
  w.addSpacer(4);
  texte(w, jour ? capitale(jour.libelle) : dateEnLettres(iso), grand ? 21 : 18, { poids: "lourd" });
  w.addSpacer(grand ? 9 : 6);

  if (!jour) {
    const c = w.addStack();
    c.backgroundColor = COULEURS.carte;
    c.cornerRadius = 12;
    c.setPadding(10, 12, 10, 12);
    c.layoutVertically();
    texte(c, "Pas de séance", grand ? 20 : 17, { gras: true });
    if (prochain) {
      c.addSpacer(2);
      texte(c, `Prochaine : ${prochain.libelle} à ${prochain.seances[0].heure}`, 11.5, { couleur: COULEURS.secondaire, lignes: 2 });
    }
    c.addSpacer();
    w.addSpacer();
    return w;
  }

  const lignesMax = grand ? 14 : 4;
  const taille = grand ? 12.5 : 12;
  let lignes = afficherSeances(w, jour, taille, lignesMax);

  // Grand format : on enchaîne sur les jours suivants tant qu'il reste de la place
  if (grand) {
    for (const j of d.jours.filter(x => x.date > jour.date)) {
      if (lignes > lignesMax - 4) break;
      w.addSpacer(10);
      texte(w, capitale(j.libelle).toUpperCase(), 9.5, { gras: true, couleur: COULEURS.secondaire });
      w.addSpacer(4);
      lignes += 2 + afficherSeances(w, j, taille - 1, lignesMax - lignes - 2);
    }
  }
  w.addSpacer();
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
