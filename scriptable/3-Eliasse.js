// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: list-ol;

/* ==========================================================================
   WIDGET 3 : ELIASSE (amendements en séance)
   Tailles : petite, moyenne, et écran verrouillé (rectangulaire, en ligne, rond).

   Ce que montre le widget :
   - le texte en discussion, l'article en cours, le numéro du prochain amendement,
     son auteur et son groupe (pastille colorée), le nombre d'amendements restants ;
   - les avis commission / Gouvernement s'ils sont publiés (la nouvelle eLiasse ne les diffuse plus :
     la ligne n'apparaît alors pas) ;
   - hors séance : « Séance levée · reprise à 15h00 ».

   Toucher le widget ouvre eLiasse (le site ne permet plus d'ouvrir directement un texte précis).
   ========================================================================== */

// ---------- RÉGLAGE : adresse des données ----------
const URL_DONNEES = "https://raw.githubusercontent.com/clementjeanne54drm-commits/Widgets-Pr-sidence/donnees/eliasse.json";

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
  vert:       dyn("#248A3D", "#30D158"),
  gauche:     dyn("#E03A3E", "#FF6B6B"),
  socle:      dyn("#C99700", "#FFD23F"),
  rn:         dyn("#2154C4", "#6D9BF1"),
  autres:     dyn("#8E8E93", "#A1A1A6"),
};
const TAILLE_APERCU = "medium";
const SEUIL_ANCIEN_MIN = 15;     // en séance, une donnée de plus de 15 min est signalée en orange

// ==========================================================================
// Outils communs
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
    : poids === "lourd" ? Font.heavySystemFont(taille) : gras ? Font.boldSystemFont(taille) : Font.systemFont(taille);
  t.textColor = couleur;
  t.lineLimit = lignes;
  t.minimumScaleFactor = 0.6;
  return t;
}

function carte(pile, { padding = [8, 10, 8, 10] } = {}) {
  const c = pile.addStack();
  c.backgroundColor = COULEURS.carte;
  c.cornerRadius = 12;
  c.setPadding(...padding);
  c.layoutVertically();
  return c;
}

function pastille(pile, libelle, fond, encre = new Color("#FFFFFF"), taille = 9) {
  const p = pile.addStack();
  p.backgroundColor = fond;
  p.cornerRadius = 5;
  p.setPadding(1.5, 5, 1.5, 5);
  texte(p, libelle, taille, { gras: true, couleur: encre });
  return p;
}

/** Pastille de groupe aux couleurs du bloc (texte foncé sur le jaune, blanc sinon). */
const pastilleGroupe = (pile, p, taille = 10) =>
  pastille(pile, p.groupe, COULEURS[p.bloc] || COULEURS.autres, p.bloc === "socle" ? new Color("#1C1C1E") : new Color("#FFFFFF"), taille);

const estAncien = (d, horsLigne) => horsLigne || (Date.now() - Date.parse(d.genereLe)) / 60000 > SEUIL_ANCIEN_MIN;

/** En-tête : icône + titre, puis à droite la pastille d'état et l'heure de mise à jour. */
function entete(pile, titre, etat, d, horsLigne, avecHeure = true) {
  const l = pile.addStack();
  l.layoutHorizontally();
  l.centerAlignContent();
  const sym = SFSymbol.named("doc.text.fill");
  sym.applyFont(Font.boldSystemFont(10));
  const img = l.addImage(sym.image);
  img.imageSize = new Size(11, 11);
  img.tintColor = COULEURS.secondaire;
  l.addSpacer(4);
  if (titre) { texte(l, titre, 10, { gras: true, couleur: COULEURS.secondaire }); l.addSpacer(6); }
  if (etat === "seance") pastille(l, "EN SÉANCE", COULEURS.vert, new Color("#FFFFFF"), 8.5);
  else if (etat === "qag") pastille(l, "QAG", COULEURS.vert, new Color("#FFFFFF"), 8.5);
  else pastille(l, "SÉANCE LEVÉE", COULEURS.secondaire, new Color("#FFFFFF"), 8.5);
  l.addSpacer();
  if (avecHeure) {
    const ancien = estAncien(d, horsLigne);
    boutonActualiser(l, ancien ? `données de ${hm(d.genereLe)}` : `màj ${hm(d.genereLe)}`, ancien ? COULEURS.alerte : COULEURS.secondaire, "medium");
  }
}

/**
 * Bouton « actualiser » : ouvre Scriptable, relance ce script et affiche aussitôt les données fraîches.
 * (iOS n'autorise pas un vrai bouton qui recharge le widget sans ouvrir d'application.)
 * Disponible en tailles moyenne et grande : sur un petit widget, iOS n'accepte qu'un seul lien.
 */
const URL_ACTUALISER = taille => `scriptable:///run/${encodeURIComponent(Script.name())}?taille=${taille}`;
function boutonActualiser(pile, libelle, couleur, taille) {
  const b = pile.addStack();
  b.layoutHorizontally();
  b.centerAlignContent();
  b.backgroundColor = COULEURS.carte;
  b.cornerRadius = 7;
  b.setPadding(2, 6, 2, 6);
  b.url = URL_ACTUALISER(taille);
  const sym = SFSymbol.named("arrow.clockwise");
  sym.applyFont(Font.boldSystemFont(9));
  const img = b.addImage(sym.image);
  img.imageSize = new Size(9, 9);
  img.tintColor = couleur;
  b.addSpacer(3);
  texte(b, libelle, 9.5, { poids: "semi", couleur });
}



/** Heure de mise à jour seule (petit format, en bas). */
function heureMaj(pile, d, horsLigne) {
  const ancien = estAncien(d, horsLigne);
  texte(pile, ancien ? `données de ${hm(d.genereLe)}` : `màj ${hm(d.genereLe)}`, 9,
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
// État de la séance (recalculé sur le téléphone si les données ont vieilli)
// ==========================================================================
function etatSeance(d, horsLigne) {
  if (!estAncien(d, horsLigne)) return { etat: d.etat, reprise: d.prochaineSeance && d.prochaineSeance.debut };
  const now = Date.now();
  const dansFenetre = (d.fenetres || []).some(f => now >= Date.parse(f.debut) && now < Date.parse(f.fin));
  const suivante = (d.fenetres || []).find(f => Date.parse(f.debut) > now);
  return { etat: dansFenetre ? "seance" : "levee", reprise: suivante ? suivante.debut : null };
}

/** Moment de la reprise : { jour: "" | "demain" | "jeudi 5 nov.", heure: "15h00" } */
function reprise(iso) {
  if (!iso) return null;
  const r = new Date(iso), auj = new Date();
  const demain = new Date(auj); demain.setDate(auj.getDate() + 1);
  const meme = (a, b) => a.toDateString() === b.toDateString();
  const jour = meme(r, auj) ? "" : meme(r, demain) ? "demain" : `${JOURS[r.getDay()]} ${r.getDate()} ${MOIS_COURTS[r.getMonth()]}`;
  return { jour, heure: hm(iso) };
}
const repriseEnClair = iso => { const r = reprise(iso); return r ? `${r.jour ? r.jour + " " : ""}à ${r.heure}` : "à préciser"; };

/** Barre de progression (amendements examinés / total), en vert. */
function barre(examines, total, largeur, hauteur = 5) {
  const ctx = new DrawContext();
  ctx.size = new Size(largeur, hauteur);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setFillColor(new Color("#8E8E93", 0.3));
  const fond = new Path(); fond.addRoundedRect(new Rect(0, 0, largeur, hauteur), hauteur / 2, hauteur / 2); ctx.addPath(fond); ctx.fillPath();
  ctx.setFillColor(new Color("#34C759"));
  const plein = new Path(); plein.addRoundedRect(new Rect(0, 0, Math.max(hauteur, largeur * examines / Math.max(1, total)), hauteur), hauteur / 2, hauteur / 2);
  ctx.addPath(plein); ctx.fillPath();
  return ctx.getImage();
}

// ==========================================================================
// Briques d'affichage
// ==========================================================================
/** « PLF 2027 · 1re partie » en gras, « Article 42 » en gris. */
function ligneTexte(pile, d, taille) {
  const l = pile.addStack();
  l.layoutHorizontally();
  l.bottomAlignContent();
  texte(l, d.texte ? d.texte.court : "Texte en discussion", taille, { gras: true });
  if (d.article) { l.addSpacer(6); texte(l, d.article, taille - 1, { poids: "medium", couleur: COULEURS.secondaire }); }
}

/** Le prochain amendement : numéro en très grand, auteur et pastille du groupe. */
function blocAmendement(pile, d, tailleNumero) {
  const p = d.prochain;
  if (!p) { texte(pile, "Pas d'amendement en attente", 13, { gras: true, lignes: 2 }); return; }
  texte(pile, "PROCHAIN AMENDEMENT", 8.5, { gras: true, couleur: COULEURS.secondaire });
  texte(pile, p.numero, tailleNumero, { poids: "lourd" });
  const a = pile.addStack();
  a.layoutHorizontally();
  a.centerAlignContent();
  texte(a, p.auteur || "", 11, { poids: "medium" });
  if (p.groupe) { a.addSpacer(5); pastilleGroupe(a, p, 9.5); }
  if (p.avisCommission || p.avisGouvernement) {
    pile.addSpacer(3);
    if (p.avisCommission) texte(pile, `Commission : ${p.avisCommission}`, 9.5, { poids: "medium" });
    if (p.avisGouvernement) texte(pile, `Gouvernement : ${p.avisGouvernement}`, 9.5, { poids: "medium" });
  }
}

/** Carte « amendements restants » avec barre de progression. */
function carteRestants(pile, d, largeur) {
  const c = carte(pile, { padding: [8, 10, 8, 10] });
  c.size = new Size(largeur, 0);
  texte(c, "RESTANTS", 8.5, { gras: true, couleur: COULEURS.secondaire });
  texte(c, d.restants != null ? milliers(d.restants) : "--", 26, { poids: "lourd" });
  if (d.total) {
    c.addSpacer(3);
    const img = c.addImage(barre(d.examines || 0, d.total, largeur - 20));
    img.imageSize = new Size(largeur - 20, 5);
    c.addSpacer(3);
    texte(c, `${milliers(d.examines)} / ${milliers(d.total)} examinés`, 8.5, { couleur: COULEURS.secondaire });
  }
  const p = d.prochain;
  if (p && p.suivants && p.suivants.length) { c.addSpacer(2); texte(c, `Puis ${p.suivants.join(", ")}`, 8.5, { couleur: COULEURS.secondaire }); }
  c.addSpacer();
}

// ==========================================================================
// Écran d'accueil
// ==========================================================================
function nouveauWidget(d, padding) {
  const w = new ListWidget();
  w.backgroundColor = COULEURS.fond;
  w.setPadding(...padding);
  w.url = d.urlEliasse;
  return w;
}

function construireMoyen(d, horsLigne) {
  const w = nouveauWidget(d, [11, 13, 11, 13]);
  const { etat, reprise: rep } = etatSeance(d, horsLigne);
  entete(w, "ELIASSE", etat, d, horsLigne);
  w.addSpacer(6);

  const corps = w.addStack();
  corps.layoutHorizontally();
  const g = corps.addStack();
  g.layoutVertically();

  if (etat === "levee") {
    const r = reprise(rep);
    texte(g, r && r.jour ? `Reprise ${r.jour}` : "Reprise", 11, { poids: "semi", couleur: COULEURS.secondaire });
    texte(g, r ? r.heure : "--", 38, { poids: "lourd" });
    g.addSpacer(2);
    ligneTexte(g, d, 12);
    if (d.prochain) texte(g, `Reprendra au n° ${d.prochain.numero}`, 10, { couleur: COULEURS.secondaire });
  } else if (etat === "qag") {
    texte(g, "Questions", 22, { poids: "lourd" });
    texte(g, "au Gouvernement", 22, { poids: "lourd" });
    g.addSpacer(4);
    texte(g, d.texte ? `Ensuite : ${d.texte.court}` : "", 11, { couleur: COULEURS.secondaire });
  } else {
    ligneTexte(g, d, 12.5);
    g.addSpacer(4);
    blocAmendement(g, d, 32);
  }
  g.addSpacer();
  corps.addSpacer();               // pousse la carte « restants » contre le bord droit
  carteRestants(corps, d, 112);

  w.addSpacer(4);
  texte(w, "Avis commission / Gouvernement non publiés par eLiasse", 8, { couleur: COULEURS.secondaire });
  return w;
}

function construirePetit(d, horsLigne) {
  const w = nouveauWidget(d, [11, 12, 10, 12]);
  // petit widget : un seul lien possible. Paramètre « actualiser » → le toucher actualise au lieu d'ouvrir eLiasse
  if ((args.widgetParameter || "").toLowerCase().includes("actualiser")) w.url = URL_ACTUALISER("small");
  const { etat, reprise: rep } = etatSeance(d, horsLigne);
  entete(w, null, etat, d, horsLigne, false);
  w.addSpacer(6);
  if (etat === "levee") {
    const r = reprise(rep);
    texte(w, r && r.jour ? `Reprise ${r.jour}` : "Reprise", 11, { poids: "semi", couleur: COULEURS.secondaire });
    texte(w, r ? r.heure : "--", 34, { poids: "lourd" });
    w.addSpacer();
    texte(w, d.texte ? d.texte.court : "", 11, { gras: true });
    if (d.restants != null) texte(w, `${milliers(d.restants)} amendements restants`, 9.5, { couleur: COULEURS.secondaire });
  } else if (etat === "qag") {
    texte(w, "Questions au Gouvernement", 18, { poids: "lourd", lignes: 3 });
    w.addSpacer();
    texte(w, d.texte ? `Ensuite : ${d.texte.court}` : "", 10, { couleur: COULEURS.secondaire });
  } else {
    texte(w, d.texte ? d.texte.court : "", 11, { gras: true });
    texte(w, d.article || "", 10, { poids: "medium", couleur: COULEURS.secondaire });
    w.addSpacer(2);
    const p = d.prochain;
    texte(w, p ? p.numero : "--", 30, { poids: "lourd" });
    if (p) {
      const a = w.addStack();
      a.layoutHorizontally();
      a.centerAlignContent();
      texte(a, p.auteur || "", 10.5, { poids: "medium" });
      if (p.groupe) { a.addSpacer(4); pastilleGroupe(a, p, 9); }
    }
    w.addSpacer();
    if (d.total) {
      const img = w.addImage(barre(d.examines || 0, d.total, 134, 4));
      img.imageSize = new Size(134, 4);
      w.addSpacer(3);
    }
    if (d.restants != null) texte(w, `${milliers(d.restants)} restants`, 9.5, { poids: "semi", couleur: COULEURS.secondaire });
  }
  w.addSpacer(2);
  heureMaj(w, d, horsLigne);
  return w;
}

// ==========================================================================
// Écran verrouillé (monochrome : iOS applique sa propre teinte)
// ==========================================================================
function construireVerrouille(d, horsLigne, famille) {
  const w = new ListWidget();
  w.url = d.urlEliasse;
  const { etat, reprise: rep } = etatSeance(d, horsLigne);
  const p = d.prochain;
  const ancien = estAncien(d, horsLigne) ? ` (${hm(d.genereLe)})` : "";

  if (famille === "accessoryInline") {
    texte(w, etat === "levee" ? `Séance levée · reprise ${repriseEnClair(rep)}`
      : p ? `n° ${p.numero} · ${d.article || ""} · ${d.restants ?? "?"} rest.` : "En séance", 12);
    return w;
  }
  if (famille === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const t1 = texte(w, etat === "levee" ? (rep ? hm(rep) : "--") : (d.restants ?? "--"), 14, { gras: true });
    t1.centerAlignText();
    const t2 = texte(w, etat === "levee" ? "reprise" : "rest.", 9);
    t2.centerAlignText();
    return w;
  }
  // accessoryRectangular : 3 lignes
  if (etat === "levee") {
    texte(w, "Séance levée", 14, { gras: true });
    texte(w, `Reprise ${repriseEnClair(rep)}`, 12);
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
else {
  // lancé depuis l'app ou par le bouton « actualiser » : aperçu à la taille du widget
  const t = (args.queryParameters || {}).taille || TAILLE_APERCU;
  if (t === "small") await widget.presentSmall();
  else if (t === "large") await widget.presentLarge();
  else await widget.presentMedium();
}
Script.complete();
