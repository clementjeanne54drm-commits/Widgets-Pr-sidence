// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: users;

/* ==========================================================================
   WIDGET 1 : PRÉSENCE EN SÉANCE
   Tailles : moyenne (conseillée), grande (avec les 3 derniers scrutins), petite.

   Ce que montre le widget :
   - le nombre de votants au dernier scrutin public et leur part des 577 sièges ;
   - un demi-cercle de 577 points : votants colorés par bloc, autres sièges estompés ;
   - le détail des 12 groupes politiques : votants / effectif du groupe ;
   - en grande taille : les 3 derniers scrutins (objet, heure, résultat, pour/contre/abstention).
   L'Assemblée ne publie pas de présence en temps réel : le widget l'indique toujours.

   Toucher le widget ouvre la page du dernier scrutin sur assemblee-nationale.fr.
   ========================================================================== */

// ---------- RÉGLAGE : adresse des données ----------
const URL_DONNEES = "https://raw.githubusercontent.com/clementjeanne54drm-commits/Widgets-Pr-sidence/donnees/presence.json";

// ==========================================================================
// Apparence (identique dans les 3 widgets)
// ==========================================================================
const dyn = (clair, sombre) => Color.dynamic(new Color(clair), new Color(sombre));
const COULEURS = {
  fond:       dyn("#FFFFFF", "#1C1C1E"),
  carte:      dyn("#F2F2F7", "#2C2C2E"),   // cartes arrondies à l'intérieur du widget
  texte:      dyn("#1C1C1E", "#F2F2F7"),
  secondaire: dyn("#8A8A8E", "#98989D"),
  alerte:     dyn("#C25E00", "#FF9F0A"),   // orange « données anciennes »
  vert:       dyn("#248A3D", "#30D158"),
  gauche:     dyn("#E03A3E", "#FF6B6B"),
  socle:      dyn("#C99700", "#FFD23F"),   // jaune assombri en mode clair pour rester lisible
  rn:         dyn("#2154C4", "#6D9BF1"),
  autres:     dyn("#8E8E93", "#A1A1A6"),
};
// Couleurs des points du demi-cercle (une image ne suit pas le mode sombre : teintes moyennes)
const POINTS = { gauche: "#E03A3E", socle: "#F2B705", rn: "#2F62C0", autres: "#8E8E93", vide: ["#8E8E93", 0.28] };
const ORDRE_HEMICYCLE = ["gauche", "autres", "socle", "rn"];           // de gauche à droite
const ORDRE_BLOCS = ["gauche", "socle", "rn", "autres"];
const NOMS_BLOCS = { gauche: "Gauche", socle: "Socle commun", rn: "RN-UDR", autres: "Autres" };
// Sigles affichés (le site utilise des sigles longs pour certains groupes)
const SIGLES = { "LFI-NFP": "LFI", "UDDPLR": "UDR" };

const SEUIL_ANCIEN_MIN = 30;   // au-delà, l'heure de mise à jour passe en orange

// ==========================================================================
// Outils communs
// ==========================================================================
const pad = n => String(n).padStart(2, "0");
const hm = iso => { const d = new Date(iso); return `${d.getHours()}h${pad(d.getMinutes())}`; };
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const jourCourt = isoDate => { const [, m, j] = isoDate.split("-"); return `${+j} ${MOIS_COURTS[+m - 1]}`; };
const virgule = n => String(n).replace(".", ",");

/** Télécharge le JSON ; en cas d'échec, relit la dernière version gardée sur le téléphone. */
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
  t.minimumScaleFactor = 0.7;
  return t;
}

/** Carte arrondie (fond légèrement teinté). */
function carte(pile, { padding = [8, 10, 8, 10], vertical = true } = {}) {
  const c = pile.addStack();
  c.backgroundColor = COULEURS.carte;
  c.cornerRadius = 12;
  c.setPadding(...padding);
  if (vertical) c.layoutVertically(); else c.layoutHorizontally();
  return c;
}

/** Pastille colorée (petit fond arrondi). */
function pastille(pile, libelle, fond, encre = new Color("#FFFFFF"), taille = 9) {
  const p = pile.addStack();
  p.backgroundColor = fond;
  p.cornerRadius = 5;
  p.setPadding(1.5, 5, 1.5, 5);
  texte(p, libelle, taille, { gras: true, couleur: encre });
  return p;
}

/** Point de couleur (repère de groupe ou de bloc). */
function point(pile, couleur, taille = 7) {
  const s = pile.addStack();
  s.size = new Size(taille, taille);
  s.cornerRadius = taille / 2;
  s.backgroundColor = couleur;
}

/** En-tête commun : icône + titre en capitales à gauche, heure de mise à jour à droite. */
function entete(pile, symbole, titre, d, horsLigne) {
  const l = pile.addStack();
  l.layoutHorizontally();
  l.centerAlignContent();
  const sym = SFSymbol.named(symbole);
  sym.applyFont(Font.boldSystemFont(10));
  const img = l.addImage(sym.image);
  img.imageSize = new Size(12, 12);
  img.tintColor = COULEURS.secondaire;
  l.addSpacer(4);
  texte(l, titre, 10, { gras: true, couleur: COULEURS.secondaire });
  l.addSpacer();
  const ancien = horsLigne || (Date.now() - Date.parse(d.genereLe)) / 60000 > SEUIL_ANCIEN_MIN;
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
// Demi-cercle de 577 sièges
// ==========================================================================
/** Place les sièges sur des rangées concentriques, puis les attribue aux blocs de gauche à droite. */
function dessinerHemicycle(d, largeur, hauteur) {
  const total = d.sieges;
  const rangs = 10, rMin = 0.36;
  const rayons = [...Array(rangs)].map((_, i) => rMin + (1 - rMin) * i / (rangs - 1));
  const somme = rayons.reduce((a, b) => a + b, 0);
  const parRang = rayons.map(r => Math.round(total * r / somme));
  parRang[rangs - 1] += total - parRang.reduce((a, b) => a + b, 0);

  const sieges = [];
  rayons.forEach((r, i) => {
    for (let k = 0; k < parRang[i]; k++) sieges.push({ r, angle: Math.PI * (1 - k / (parRang[i] - 1)) });
  });
  sieges.sort((a, b) => b.angle - a.angle || a.r - b.r);

  // Chaque bloc reçoit une part de l'éventail égale à son nombre de membres ; dans sa part,
  // rangée par rangée, la même proportion de sièges est colorée (les votants), le reste estompé.
  let debut = 0;
  for (const bloc of ORDRE_HEMICYCLE) {
    const membres = d.siegesParBloc[bloc] || 0;
    const tranche = sieges.slice(debut, debut + membres);
    const part = membres ? Math.min(1, (d.dernier.blocs[bloc] || 0) / membres) : 0;
    const parRangee = {};
    for (const s of tranche) (parRangee[s.r] = parRangee[s.r] || []).push(s);
    let reste = Math.round(part * membres);
    const rangees = Object.values(parRangee);
    rangees.forEach((liste, i) => {
      liste.sort((a, b) => b.angle - a.angle);
      const n = i === rangees.length - 1 ? reste : Math.min(reste, Math.round(part * liste.length));
      liste.forEach((s, k) => { s.couleur = k < n ? bloc : "vide"; });
      reste -= n;
    });
    debut += membres;
  }

  const ctx = new DrawContext();
  ctx.size = new Size(largeur, hauteur);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const R = Math.min(largeur / 2, hauteur) - 2;
  const cx = largeur / 2, cy = hauteur - 1;
  const rayonPoint = Math.max(1.6, R * (1 - rMin) / rangs * 0.46);
  for (const s of sieges) {
    ctx.setFillColor(s.couleur && s.couleur !== "vide" ? new Color(POINTS[s.couleur]) : new Color(POINTS.vide[0], POINTS.vide[1]));
    const x = cx + Math.cos(s.angle) * R * s.r, y = cy - Math.sin(s.angle) * R * s.r;
    ctx.fillEllipse(new Rect(x - rayonPoint, y - rayonPoint, rayonPoint * 2, rayonPoint * 2));
  }
  return ctx.getImage();
}

// ==========================================================================
// Briques d'affichage
// ==========================================================================
/** Libellé honnête de la source : « d'après le scrutin de 14h32 » (ou son numéro si l'heure est inconnue). */
const libelleScrutin = d => d.dernier.vuA
  ? `d'après le scrutin de ${hm(d.dernier.vuA)}`
  : `d'après le scrutin n° ${d.dernier.numero} (${jourCourt(d.dernier.date)})`;

/** Total en grand + pourcentage. */
function blocTotal(pile, d, taille) {
  const l = pile.addStack();
  l.layoutHorizontally();
  l.bottomAlignContent();
  texte(l, d.dernier.votants, taille, { poids: "lourd" });
  l.addSpacer(4);
  const c = l.addStack();
  c.layoutVertically();
  texte(c, `${virgule(d.dernier.pourcentage)} %`, taille * 0.42, { gras: true, couleur: COULEURS.texte });
  texte(c, `des ${d.sieges} députés`, taille * 0.32, { couleur: COULEURS.secondaire });
  c.addSpacer(taille * 0.08);
}

/** Groupes triés par bloc (gauche, socle, RN-UDR, autres), puis par effectif. */
function groupesTries(d) {
  return [...d.dernier.groupes].sort((a, b) =>
    ORDRE_BLOCS.indexOf(a.bloc) - ORDRE_BLOCS.indexOf(b.bloc) || b.membres - a.membres);
}

/** Une ligne de groupe : point coloré, sigle, votants en gras, effectif en gris. */
function ligneGroupe(pile, g, taille) {
  const l = pile.addStack();
  l.layoutHorizontally();
  l.centerAlignContent();
  point(l, COULEURS[g.bloc] || COULEURS.autres, taille * 0.6);
  l.addSpacer(5);
  const sigle = l.addStack();
  sigle.size = new Size(taille * 3.2, 0);
  texte(sigle, SIGLES[g.abrev] || g.abrev, taille, { poids: "semi" });
  sigle.addSpacer();
  l.addSpacer();
  texte(l, g.votants, taille, { gras: true, couleur: g.votants ? COULEURS.texte : COULEURS.secondaire });
  texte(l, ` / ${g.membres}`, taille - 1.5, { couleur: COULEURS.secondaire });
}

/** Grille des groupes sur N colonnes (remplissage colonne par colonne). */
function grilleGroupes(pile, d, colonnes, taille, interligne) {
  const groupes = groupesTries(d);
  const parCol = Math.ceil(groupes.length / colonnes);
  const g = pile.addStack();
  g.layoutHorizontally();
  for (let c = 0; c < colonnes; c++) {
    if (c) g.addSpacer();          // espace souple : la grille occupe toute la largeur de la carte
    const col = g.addStack();
    col.layoutVertically();
    groupes.slice(c * parCol, (c + 1) * parCol).forEach((x, i) => {
      if (i) col.addSpacer(interligne);
      ligneGroupe(col, x, taille);
    });
  }
}

/** Totaux des 4 blocs en pastilles colorées. */
function ligneBlocs(pile, d, taille) {
  const l = pile.addStack();
  l.layoutHorizontally();
  l.centerAlignContent();
  ORDRE_BLOCS.forEach((b, i) => {
    if (i) l.addSpacer(8);
    point(l, COULEURS[b], taille * 0.6);
    l.addSpacer(3);
    texte(l, d.dernier.blocs[b], taille, { gras: true });
  });
}

/** Un scrutin : objet abrégé, heure, pastille Adopté/Rejeté, décompte. */
function ligneScrutin(pile, s) {
  const c = carte(pile, { padding: [6, 9, 6, 9] });
  const l1 = c.addStack();
  l1.layoutHorizontally();
  l1.centerAlignContent();
  texte(l1, s.titreCourt, 11.5, { poids: "semi" });
  l1.addSpacer();
  texte(l1, s.vuA ? hm(s.vuA) : `n° ${s.numero}`, 10, { poids: "medium", couleur: COULEURS.secondaire });
  c.addSpacer(3);
  const l2 = c.addStack();
  l2.layoutHorizontally();
  l2.centerAlignContent();
  const adopte = s.sort === "adopté";
  pastille(l2, adopte ? "ADOPTÉ" : "REJETÉ", adopte ? COULEURS.vert : COULEURS.secondaire);
  l2.addSpacer(6);
  texte(l2, `${s.pour} pour · ${s.contre} contre · ${s.abstention} abst.`, 10, { couleur: COULEURS.secondaire });
}

// ==========================================================================
// Les 3 tailles
// ==========================================================================
function nouveauWidget(d, padding) {
  const w = new ListWidget();
  w.backgroundColor = COULEURS.fond;
  w.setPadding(...padding);
  w.url = d.dernier.url;
  return w;
}

/** Moyen : demi-cercle et total à gauche, les 12 groupes à droite. */
function construireMoyen(d, horsLigne) {
  const w = nouveauWidget(d, [11, 13, 10, 13]);
  entete(w, "person.3.fill", "PRÉSENCE EN SÉANCE", d, horsLigne);
  w.addSpacer(6);

  const corps = w.addStack();
  corps.layoutHorizontally();
  corps.topAlignContent();

  const g = corps.addStack();
  g.layoutVertically();
  g.size = new Size(120, 0);
  const img = g.addImage(dessinerHemicycle(d, 240, 120));
  img.imageSize = new Size(120, 60);
  g.addSpacer(3);
  // total compact : le nombre en grand, le pourcentage dessous
  const t = g.addStack();
  t.layoutHorizontally();
  t.bottomAlignContent();
  texte(t, d.dernier.votants, 26, { poids: "lourd" });
  t.addSpacer(4);
  texte(t, `${virgule(d.dernier.pourcentage)} %`, 13, { gras: true });
  texte(g, `votants sur ${d.sieges}`, 9.5, { couleur: COULEURS.secondaire });

  corps.addSpacer(10);
  const dr = carte(corps, { padding: [7, 9, 7, 9] });
  grilleGroupes(dr, d, 2, 10.5, 2.5);

  w.addSpacer();
  texte(w, `${libelleScrutin(d).replace(/^d/, "D")} · délégations comprises · pas de temps réel`, 8.5, { couleur: COULEURS.secondaire });
  return w;
}

/** Grand : demi-cercle centré, total, groupes sur 3 colonnes, puis les 3 derniers scrutins. */
function construireGrand(d, horsLigne) {
  const w = nouveauWidget(d, [13, 14, 12, 14]);
  entete(w, "person.3.fill", "PRÉSENCE EN SÉANCE", d, horsLigne);
  w.addSpacer(6);

  const haut = w.addStack();
  haut.layoutHorizontally();
  haut.centerAlignContent();
  const img = haut.addImage(dessinerHemicycle(d, 300, 150));
  img.imageSize = new Size(150, 75);
  haut.addSpacer(12);
  const t = haut.addStack();
  t.layoutVertically();
  blocTotal(t, d, 34);
  t.addSpacer(4);
  ligneBlocs(t, d, 11);
  t.addSpacer(3);
  texte(t, libelleScrutin(d), 9.5, { couleur: COULEURS.secondaire });

  w.addSpacer(8);
  const grille = carte(w, { padding: [7, 10, 7, 10] });
  grilleGroupes(grille, d, 3, 10.5, 3);

  w.addSpacer(8);
  texte(w, "DERNIERS SCRUTINS", 9.5, { gras: true, couleur: COULEURS.secondaire });
  w.addSpacer(4);
  d.scrutins.slice(0, 3).forEach((s, i) => { if (i) w.addSpacer(4); ligneScrutin(w, s); });
  w.addSpacer();
  texte(w, "Votants, délégations comprises · l'Assemblée ne publie pas de présence en temps réel", 8, { couleur: COULEURS.secondaire });
  return w;
}

/** Petit : demi-cercle, total, totaux des blocs. */
function construirePetit(d, horsLigne) {
  const w = nouveauWidget(d, [11, 12, 10, 12]);
  entete(w, "person.3.fill", "PRÉSENCE", d, horsLigne);
  w.addSpacer(5);
  const img = w.addImage(dessinerHemicycle(d, 264, 132));
  img.imageSize = new Size(132, 66);
  img.centerAlignImage();
  w.addSpacer(4);
  blocTotal(w, d, 26);
  w.addSpacer(3);
  ligneBlocs(w, d, 10);
  w.addSpacer();
  texte(w, d.dernier.vuA ? `scrutin de ${hm(d.dernier.vuA)}` : `scrutin n° ${d.dernier.numero}`, 8.5, { couleur: COULEURS.secondaire });
  return w;
}

// ==========================================================================
// Lancement
// ==========================================================================
const { d, horsLigne } = await chargerDonnees(URL_DONNEES, "widget-presence.json");
const famille = config.widgetFamily || "medium";
const widget = !d ? widgetErreur("Vérifiez la connexion. Le widget réessaiera tout seul.")
  : famille === "small" ? construirePetit(d, horsLigne)
  : famille === "large" || famille === "extraLarge" ? construireGrand(d, horsLigne)
  : construireMoyen(d, horsLigne);
widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);    // iOS décide du moment exact

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();                                  // aperçu quand on lance le script dans l'app
Script.complete();
