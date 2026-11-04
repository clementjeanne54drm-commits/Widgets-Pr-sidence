// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: list-ol;

/* ==========================================================================
   WIDGET 3 : ELIASSE (amendements en séance)
   Tailles : petite, moyenne, et écran verrouillé (rectangulaire, en ligne, rond).

   Ce que montre le widget :
   - le texte en discussion, l'article en cours, le numéro du prochain amendement,
     son auteur et son groupe, le nombre d'amendements restants ;
   - les avis commission / Gouvernement s'ils sont publiés (la nouvelle eLiasse ne les diffuse plus :
     la ligne n'apparaît alors pas) ;
   - hors séance : « Séance levée · reprise à 15h00 ».

   Toucher le widget ouvre eLiasse (le site ne permet plus d'ouvrir directement un texte précis).
   ========================================================================== */

// ---------- RÉGLAGE : adresse des données ----------
const URL_DONNEES = "https://raw.githubusercontent.com/clementjeanne54drm-commits/Widgets-Pr-sidence/donnees/eliasse.json";

// ---------- Apparence ----------
const dyn = (clair, sombre) => Color.dynamic(new Color(clair), new Color(sombre));
const COULEURS = {
  fond:       dyn("#FFFFFF", "#1C1C1E"),
  texte:      dyn("#1C1C1E", "#F2F2F7"),
  secondaire: dyn("#6E6E73", "#AEAEB2"),
  alerte:     dyn("#C25E00", "#FF9F0A"),
  piste:      dyn("#E5E5EA", "#3A3A3C"),
  gauche:     dyn("#D62828", "#FF5A5F"),
  socle:      dyn("#C99700", "#FFD23F"),
  rn:         dyn("#1D4E9E", "#6D9BF1"),
  autres:     dyn("#8E8E93", "#98989D"),
};
const SEUIL_ANCIEN_MIN = 15;     // en séance, une donnée de plus de 15 min est signalée en orange

// ==========================================================================
// Outils communs (identiques dans les 3 widgets)
// ==========================================================================
const pad = n => String(n).padStart(2, "0");
const hm = iso => { const d = new Date(iso); return `${d.getHours()}h${pad(d.getMinutes())}`; };
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const milliers = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

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
  t.minimumScaleFactor = 0.6;
  return t;
}

const estAncien = (d, horsLigne) => horsLigne || (Date.now() - Date.parse(d.genereLe)) / 60000 > SEUIL_ANCIEN_MIN;

function piedDePage(pile, d, horsLigne, gauche) {
  const ligne = pile.addStack();
  ligne.layoutHorizontally();
  ligne.centerAlignContent();
  if (gauche) texte(ligne, gauche, 8.5, { couleur: COULEURS.secondaire });
  ligne.addSpacer();
  const ancien = estAncien(d, horsLigne);
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
// État de la séance (recalculé sur le téléphone si les données ont vieilli)
// ==========================================================================
function etatSeance(d, horsLigne) {
  if (!estAncien(d, horsLigne)) return { etat: d.etat, reprise: d.prochaineSeance && d.prochaineSeance.debut };
  const now = Date.now();
  const dansFenetre = (d.fenetres || []).some(f => now >= Date.parse(f.debut) && now < Date.parse(f.fin));
  const suivante = (d.fenetres || []).find(f => Date.parse(f.debut) > now);
  return { etat: dansFenetre ? "seance" : "levee", reprise: suivante ? suivante.debut : null };
}

/** « à 15h00 », « demain à 9h00 », « jeudi 5 nov. à 9h00 » */
function quandReprise(iso) {
  if (!iso) return null;
  const r = new Date(iso), auj = new Date();
  const demain = new Date(auj); demain.setDate(auj.getDate() + 1);
  const meme = (a, b) => a.toDateString() === b.toDateString();
  if (meme(r, auj)) return `à ${hm(iso)}`;
  if (meme(r, demain)) return `demain à ${hm(iso)}`;
  return `${JOURS[r.getDay()]} ${r.getDate()} ${MOIS_COURTS[r.getMonth()]} à ${hm(iso)}`;
}

/** Barre de progression (amendements examinés / total) */
function barre(examines, total, largeur) {
  const ctx = new DrawContext();
  ctx.size = new Size(largeur, 4);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setFillColor(new Color("#8E8E93", 0.3));
  const fond = new Path(); fond.addRoundedRect(new Rect(0, 0, largeur, 4), 2, 2); ctx.addPath(fond); ctx.fillPath();
  ctx.setFillColor(new Color("#8E8E93"));
  const plein = new Path(); plein.addRoundedRect(new Rect(0, 0, Math.max(4, largeur * examines / Math.max(1, total)), 4), 2, 2);
  ctx.addPath(plein); ctx.fillPath();
  return ctx.getImage();
}

// ==========================================================================
// Écran d'accueil : petite et moyenne tailles
// ==========================================================================
function entete(pile, libelle, droite) {
  const l = pile.addStack();
  l.layoutHorizontally();
  texte(l, libelle, 9.5, { gras: true, couleur: COULEURS.secondaire });
  l.addSpacer();
  if (droite) texte(l, droite, 9.5, { poids: "semi", couleur: COULEURS.secondaire });
}

function blocAmendement(pile, d, grand) {
  const p = d.prochain;
  texte(pile, d.texte ? d.texte.court : "Texte en discussion", grand ? 13 : 12, { poids: "semi" });
  texte(pile, d.article || "", grand ? 12 : 11, { couleur: COULEURS.secondaire });
  pile.addSpacer(grand ? 5 : 3);
  if (!p) { texte(pile, "Pas d'amendement en attente", 13, { gras: true, lignes: 2 }); return; }
  const n = pile.addStack();
  n.layoutHorizontally();
  n.bottomAlignContent();
  texte(n, "n°", 11, { couleur: COULEURS.secondaire, poids: "medium" });
  n.addSpacer(3);
  texte(n, p.numero, grand ? 34 : 28, { gras: true });
  pile.addSpacer(1);
  const a = pile.addStack();
  a.layoutHorizontally();
  a.centerAlignContent();
  texte(a, p.auteur || "", 11.5, { poids: "medium" });
  if (p.groupe) { a.addSpacer(6); pastille(a, p.groupe, p.bloc); }
}

/** Petite pastille arrondie aux couleurs du bloc (texte foncé sur le jaune, blanc sinon). */
function pastille(pile, libelle, bloc) {
  const b = pile.addStack();
  b.backgroundColor = COULEURS[bloc] || COULEURS.autres;
  b.cornerRadius = 4;
  b.setPadding(1, 5, 1, 5);
  texte(b, libelle, 10, { gras: true, couleur: bloc === "socle" ? new Color("#1C1C1E") : new Color("#FFFFFF") });
}

function construirePetit(d, horsLigne) {
  const w = new ListWidget();
  w.backgroundColor = COULEURS.fond;
  w.setPadding(11, 12, 8, 12);
  w.url = d.urlEliasse;
  const { etat, reprise } = etatSeance(d, horsLigne);
  if (etat === "levee" || etat === "qag") {
    entete(w, etat === "qag" ? "EN SÉANCE" : "SÉANCE LEVÉE");
    w.addSpacer(5);
    if (etat === "qag") texte(w, "Questions au Gouvernement", 17, { gras: true, lignes: 2 });
    else { texte(w, "Reprise", 12, { couleur: COULEURS.secondaire }); texte(w, (quandReprise(reprise) || "à préciser").replace(/^à /, ""), 20, { gras: true, lignes: 2 }); }
    w.addSpacer();
    if (d.texte) texte(w, d.texte.court, 11, { poids: "semi" });
    if (d.restants != null) texte(w, `${milliers(d.restants)} amendements restants`, 10, { couleur: COULEURS.secondaire });
  } else {
    entete(w, "EN SÉANCE", d.restants != null ? `${milliers(d.restants)} rest.` : null);
    w.addSpacer(4);
    blocAmendement(w, d, false);
    w.addSpacer();
  }
  w.addSpacer(2);
  piedDePage(w, d, horsLigne);
  return w;
}

function construireMoyen(d, horsLigne) {
  const w = new ListWidget();
  w.backgroundColor = COULEURS.fond;
  w.setPadding(12, 14, 9, 14);
  w.url = d.urlEliasse;
  const { etat, reprise } = etatSeance(d, horsLigne);

  if (etat === "levee") {
    entete(w, "ELIASSE · SÉANCE LEVÉE");
    w.addSpacer(6);
    texte(w, `Séance levée · reprise ${quandReprise(reprise) || "à préciser"}`, 18, { gras: true, lignes: 2 });
    w.addSpacer(6);
    if (d.texte) texte(w, `Dernier texte : ${d.texte.court}`, 12, { poids: "semi" });
    if (d.article && d.prochain) texte(w, `Reprendra : ${d.article}, amendement n° ${d.prochain.numero}`, 11, { couleur: COULEURS.secondaire });
    if (d.restants != null) texte(w, `${milliers(d.restants)} amendements restants`, 11, { couleur: COULEURS.secondaire });
    w.addSpacer();
    piedDePage(w, d, horsLigne);
    return w;
  }

  entete(w, etat === "qag" ? "ELIASSE · QUESTIONS AU GOUVERNEMENT" : "ELIASSE · EN SÉANCE");
  w.addSpacer(4);
  const corps = w.addStack();
  corps.layoutHorizontally();
  const g = corps.addStack();
  g.layoutVertically();
  blocAmendement(g, d, true);
  corps.addSpacer();

  const dr = corps.addStack();
  dr.layoutVertically();
  dr.size = new Size(118, 0);
  if (d.restants != null) {
    texte(dr, milliers(d.restants), 24, { gras: true });
    texte(dr, "amendements restants", 10, { couleur: COULEURS.secondaire });
    if (d.total) {
      dr.addSpacer(3);
      const img = dr.addImage(barre(d.examines || 0, d.total, 118));
      img.imageSize = new Size(118, 4);
      texte(dr, `${milliers(d.examines)} examinés sur ${milliers(d.total)}`, 9, { couleur: COULEURS.secondaire });
    }
  }
  const p = d.prochain;
  if (p && (p.avisCommission || p.avisGouvernement)) {
    dr.addSpacer(4);
    if (p.avisCommission) texte(dr, `Commission : ${p.avisCommission}`, 10, { poids: "medium" });
    if (p.avisGouvernement) texte(dr, `Gouvernement : ${p.avisGouvernement}`, 10, { poids: "medium" });
  } else if (p && p.suivants && p.suivants.length) {
    dr.addSpacer(4);
    texte(dr, `Puis : ${p.suivants.join(", ")}`, 10, { couleur: COULEURS.secondaire });
  }
  dr.addSpacer();
  w.addSpacer();
  piedDePage(w, d, horsLigne, "Avis commission / Gouvernement non publiés par eLiasse");
  return w;
}

// ==========================================================================
// Écran verrouillé (monochrome : iOS applique sa propre teinte)
// ==========================================================================
function construireVerrouille(d, horsLigne, famille) {
  const w = new ListWidget();
  w.url = d.urlEliasse;
  const { etat, reprise } = etatSeance(d, horsLigne);
  const p = d.prochain;
  const ancien = estAncien(d, horsLigne) ? ` (${hm(d.genereLe)})` : "";

  if (famille === "accessoryInline") {
    texte(w, etat === "levee" ? `Séance levée · reprise ${quandReprise(reprise) || ""}`
      : p ? `n° ${p.numero} · ${d.article || ""} · ${d.restants ?? "?"} rest.` : "En séance", 12);
    return w;
  }
  if (famille === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const t1 = texte(w, etat === "levee" ? (reprise ? hm(reprise) : "--") : (d.restants ?? "--"), 14, { gras: true });
    t1.centerAlignText();
    const t2 = texte(w, etat === "levee" ? "reprise" : "rest.", 9);
    t2.centerAlignText();
    return w;
  }
  // accessoryRectangular : 3 lignes
  if (etat === "levee") {
    texte(w, "Séance levée", 14, { gras: true });
    texte(w, `Reprise ${quandReprise(reprise) || "à préciser"}`, 12);
    texte(w, `${d.texte ? d.texte.court : ""}${ancien}`, 11);
  } else if (etat === "qag") {
    texte(w, "Questions au Gouv.", 14, { gras: true });
    texte(w, d.texte ? `Puis ${d.texte.court}` : "", 12);
    texte(w, `${d.restants ?? "?"} amendements restants${ancien}`, 11);
  } else {
    texte(w, `${d.texte ? d.texte.court.replace(/ · .*$/, "") : ""} · ${d.article || ""}`, 12);
    texte(w, p ? `n° ${p.numero}${p.groupe ? " · " + p.groupe : ""}` : "En séance", 15, { gras: true });
    texte(w, `${d.restants ?? "?"} restants${ancien}`, 11);
  }
  return w;
}

// ==========================================================================
// Lancement
// ==========================================================================
const { d, horsLigne } = await chargerDonnees(URL_DONNEES, "widget-eliasse.json");
const famille = config.widgetFamily || "medium";
let widget;
if (!d) widget = widgetErreur("Vérifiez la connexion. Le widget réessaiera tout seul.");
else if (famille.startsWith("accessory")) widget = construireVerrouille(d, horsLigne, famille);
else if (famille === "small") widget = construirePetit(d, horsLigne);
else widget = construireMoyen(d, horsLigne);
widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
