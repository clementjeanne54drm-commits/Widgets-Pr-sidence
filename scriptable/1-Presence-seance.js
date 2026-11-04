// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: users;

/* ==========================================================================
   WIDGET 1 : PRÉSENCE EN SÉANCE ET DERNIERS SCRUTINS
   Taille conseillée : moyenne (la petite taille marche aussi, en version réduite).

   Ce que montre le widget :
   - à gauche : le nombre de votants au dernier scrutin public, leur part des 577 sièges,
     un demi-cercle de 577 points (votants colorés par bloc) et le détail par bloc ;
   - à droite : les 3 derniers scrutins (objet abrégé, heure, résultat, pour/contre/abstention).
   L'Assemblée ne publie pas de présence en temps réel : le widget l'indique toujours.

   Toucher le widget ouvre la page du dernier scrutin sur assemblee-nationale.fr.
   ========================================================================== */

// ---------- RÉGLAGE : adresse des données (donnée par la personne qui a installé le serveur) ----------
const URL_DONNEES = "https://raw.githubusercontent.com/clementjeanne54drm-commits/Widgets-Pr-sidence/donnees/presence.json";

// ---------- Apparence (couleurs des blocs : à ajuster pour coller aux widgets existants) ----------
const dyn = (clair, sombre) => Color.dynamic(new Color(clair), new Color(sombre));
const COULEURS = {
  fond:       dyn("#FFFFFF", "#1C1C1E"),
  texte:      dyn("#1C1C1E", "#F2F2F7"),
  secondaire: dyn("#6E6E73", "#AEAEB2"),
  alerte:     dyn("#C25E00", "#FF9F0A"),   // orange « données anciennes »
  gauche:     dyn("#D62828", "#FF5A5F"),
  socle:      dyn("#C99700", "#FFD23F"),   // jaune assombri en mode clair pour rester lisible
  rn:         dyn("#1D4E9E", "#6D9BF1"),
  autres:     dyn("#8E8E93", "#98989D"),
};
// Couleurs « fixes » pour le demi-cercle (une image ne suit pas le mode sombre : teintes moyennes)
const POINTS = { gauche: "#E03A3E", socle: "#F2B705", rn: "#2F62C0", autres: "#8E8E93", vide: ["#8E8E93", 0.32] };
const ORDRE_BLOCS = ["gauche", "autres", "socle", "rn"];            // de gauche à droite dans l'hémicycle
const NOMS_BLOCS = { gauche: "Gauche", socle: "Socle", rn: "RN-UDR", autres: "Autres" };

// Au-delà de cet âge, les données sont jugées anciennes (heure affichée en orange)
const SEUIL_ANCIEN_MIN = 30;

// ==========================================================================
// Outils communs (identiques dans les 3 widgets)
// ==========================================================================
const pad = n => String(n).padStart(2, "0");
const hm = iso => { const d = new Date(iso); return `${d.getHours()}h${pad(d.getMinutes())}`; };
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const jourCourt = isoDate => { const [a, m, j] = isoDate.split("-"); return `${+j} ${MOIS_COURTS[+m - 1]}`; };

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
    : gras ? Font.boldSystemFont(taille) : Font.systemFont(taille);
  t.textColor = couleur;
  t.lineLimit = lignes;
  t.minimumScaleFactor = 0.7;
  return t;
}

/** Pied de page : « màj 14h40 », ou « données de 13h38 » en orange si réseau en échec ou données vieilles. */
function piedDePage(pile, d, horsLigne, gauche) {
  const ligne = pile.addStack();
  ligne.layoutHorizontally();
  ligne.centerAlignContent();
  if (gauche) texte(ligne, gauche, 8.5, { couleur: COULEURS.secondaire });
  ligne.addSpacer();
  const ancien = horsLigne || (Date.now() - Date.parse(d.genereLe)) / 60000 > SEUIL_ANCIEN_MIN;
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
// Demi-cercle de 577 sièges
// ==========================================================================
/** Place les sièges sur des rangées concentriques, puis les attribue aux blocs de gauche à droite. */
function dessinerHemicycle(d, largeur, hauteur) {
  const total = d.sieges;
  const rangs = 10, rMin = 0.38;
  const rayons = [...Array(rangs)].map((_, i) => rMin + (1 - rMin) * i / (rangs - 1));
  const somme = rayons.reduce((a, b) => a + b, 0);
  const parRang = rayons.map(r => Math.round(total * r / somme));
  parRang[rangs - 1] += total - parRang.reduce((a, b) => a + b, 0);

  const sieges = [];
  rayons.forEach((r, i) => {
    for (let k = 0; k < parRang[i]; k++) {
      const angle = Math.PI * (1 - k / (parRang[i] - 1));        // de π (gauche) à 0 (droite)
      sieges.push({ r, angle });
    }
  });
  sieges.sort((a, b) => b.angle - a.angle || a.r - b.r);

  // Attribution : chaque bloc reçoit une part de l'éventail égale à son nombre de membres.
  // Dans sa part, les votants (colorés) remplissent l'éventail depuis le bord gauche, le reste est estompé.
  // Les sièges vacants restent estompés à droite.
  const ctx = new DrawContext();
  ctx.size = new Size(largeur, hauteur);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const R = Math.min(largeur / 2, hauteur) - 2;
  const cx = largeur / 2, cy = hauteur - 1;
  const point = Math.max(1.6, R * (1 - rMin) / rangs * 0.47);
  let debut = 0;
  for (const bloc of ORDRE_BLOCS) {
    const membres = d.siegesParBloc[bloc] || 0;
    const tranche = sieges.slice(debut, debut + membres);
    const part = membres ? Math.min(1, (d.dernier.blocs[bloc] || 0) / membres) : 0;
    // rangée par rangée, on colore la même proportion de sièges (depuis le bord gauche du bloc) :
    // les votants forment ainsi un sous-éventail régulier dans la part du bloc
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
  for (const s of sieges) {
    const c = s.couleur && s.couleur !== "vide" ? new Color(POINTS[s.couleur]) : new Color(POINTS.vide[0], POINTS.vide[1]);
    ctx.setFillColor(c);
    const x = cx + Math.cos(s.angle) * R * s.r, y = cy - Math.sin(s.angle) * R * s.r;
    ctx.fillEllipse(new Rect(x - point, y - point, point * 2, point * 2));
  }
  return ctx.getImage();
}

// ==========================================================================
// Construction du widget
// ==========================================================================
const LEGENDE = { gauche: "Gauche", socle: "Socle", rn: "RN-UDR", autres: "Autres" };
/** Chiffre de chaque bloc en couleur ; avec légende, un libellé discret dessous. */
function ligneBlocs(pile, d, taille, legende = false) {
  const l = pile.addStack();
  l.layoutHorizontally();
  for (const bloc of ["gauche", "socle", "rn", "autres"]) {
    const c = l.addStack();
    c.layoutVertically();
    texte(c, d.dernier.blocs[bloc], taille, { gras: true, couleur: COULEURS[bloc] });
    if (legende) texte(c, LEGENDE[bloc], 7.5, { couleur: COULEURS.secondaire });
    if (bloc !== "autres") l.addSpacer(legende ? 6 : 7);
  }
}

function libelleScrutin(d) {
  return d.dernier.vuA
    ? `D'après le scrutin de ${hm(d.dernier.vuA)}`
    : `D'après le scrutin n° ${d.dernier.numero} (${jourCourt(d.dernier.date)})`;
}

function construireMoyen(d, horsLigne) {
  const w = new ListWidget();
  w.backgroundColor = COULEURS.fond;
  w.setPadding(11, 13, 9, 13);
  w.url = d.dernier.url;

  const corps = w.addStack();
  corps.layoutHorizontally();

  // ----- colonne gauche : présence -----
  const g = corps.addStack();
  g.layoutVertically();
  g.size = new Size(118, 0);
  const img = g.addImage(dessinerHemicycle(d, 236, 118));
  img.imageSize = new Size(118, 59);
  g.addSpacer(3);
  const total = g.addStack();
  total.layoutHorizontally();
  total.bottomAlignContent();
  texte(total, d.dernier.votants, 25, { gras: true });
  total.addSpacer(4);
  texte(total, `/ ${d.sieges} · ${String(d.dernier.pourcentage).replace(".", ",")} %`, 11, { couleur: COULEURS.secondaire, poids: "medium" });
  g.addSpacer(1);
  ligneBlocs(g, d, 13, true);

  corps.addSpacer(10);

  // ----- colonne droite : derniers scrutins -----
  const dr = corps.addStack();
  dr.layoutVertically();
  // si les 3 scrutins portent sur le même texte (« PLF 2027 »), on ne l'écrit qu'une fois, en tête
  const fins = d.scrutins.slice(0, 3).map(s => s.titreCourt.includes(" · ") ? s.titreCourt.split(" · ").pop() : null);
  const commun = fins[0] && fins.every(f => f === fins[0]) ? fins[0] : null;
  texte(dr, libelleScrutin(d) + (commun ? ` · ${commun}` : ""), 10, { poids: "semi", couleur: COULEURS.secondaire });
  dr.addSpacer(4);
  d.scrutins.slice(0, 3).forEach((s, i) => {
    if (i) dr.addSpacer(4);
    // ligne 1 : objet abrégé + heure (ou n° du scrutin si l'heure est inconnue)
    const l1 = dr.addStack();
    l1.layoutHorizontally();
    l1.bottomAlignContent();
    texte(l1, commun ? s.titreCourt.slice(0, -(commun.length + 3)) : s.titreCourt, 11.5, { poids: "semi" });
    l1.addSpacer(4);
    texte(l1, s.vuA ? hm(s.vuA) : `n° ${s.numero}`, 10, { couleur: COULEURS.secondaire, poids: "medium" });
    // ligne 2 : résultat + décompte
    const l2 = dr.addStack();
    l2.layoutHorizontally();
    texte(l2, s.sort === "adopté" ? "Adopté" : "Rejeté", 10, { gras: true, couleur: s.sort === "adopté" ? COULEURS.texte : COULEURS.secondaire });
    l2.addSpacer(5);
    texte(l2, `${s.pour} pour · ${s.contre} contre · ${s.abstention} abst.`, 10, { couleur: COULEURS.secondaire });
  });
  dr.addSpacer();

  w.addSpacer();
  piedDePage(w, d, horsLigne, "Pas de présence en temps réel : votants, délégations comprises");
  return w;
}

function construirePetit(d, horsLigne) {
  const w = new ListWidget();
  w.backgroundColor = COULEURS.fond;
  w.setPadding(10, 11, 8, 11);
  w.url = d.dernier.url;
  const img = w.addImage(dessinerHemicycle(d, 266, 133));
  img.imageSize = new Size(133, 66);
  img.centerAlignImage();
  w.addSpacer(3);
  const total = w.addStack();
  total.bottomAlignContent();
  texte(total, d.dernier.votants, 24, { gras: true });
  total.addSpacer(4);
  texte(total, `${String(d.dernier.pourcentage).replace(".", ",")} %`, 12, { couleur: COULEURS.secondaire, poids: "medium" });
  ligneBlocs(w, d, 11);
  w.addSpacer(2);
  texte(w, d.dernier.vuA ? `scrutin de ${hm(d.dernier.vuA)}` : `scrutin n° ${d.dernier.numero}`, 9, { couleur: COULEURS.secondaire });
  w.addSpacer();
  piedDePage(w, d, horsLigne);
  return w;
}

// ==========================================================================
// Lancement
// ==========================================================================
const { d, horsLigne } = await chargerDonnees(URL_DONNEES, "widget-presence.json");
const famille = config.widgetFamily || "medium";
const widget = !d ? widgetErreur("Vérifiez la connexion. Le widget réessaiera tout seul.")
  : famille === "small" ? construirePetit(d, horsLigne) : construireMoyen(d, horsLigne);
widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);    // iOS décide du moment exact

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();                                  // aperçu quand on lance le script dans l'app
Script.complete();
