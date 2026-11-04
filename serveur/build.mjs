#!/usr/bin/env node
/**
 * build.mjs : générateur des 3 fichiers JSON lus par les widgets Scriptable.
 *
 *   presence.json      présence d'après le dernier scrutin public + 3 derniers scrutins
 *   feuille-verte.json séances publiques à venir (ordre du jour)
 *   eliasse.json       texte en discussion, article, prochain amendement, restants
 *
 * Node 20 ou plus récent, aucune dépendance. Usage :
 *   node serveur/build.mjs --out public          (passage normal, décide seul s'il doit travailler)
 *   node serveur/build.mjs --out public --force  (force un passage complet)
 *
 * Sources (vérifiées le 4 novembre 2026, voir SOURCES.md) :
 *   - www.assemblee-nationale.fr/dyn/{lég}/scrutins            liste + pages des scrutins (HTML, temps quasi réel)
 *   - data.assemblee-nationale.fr .../loi/scrutins/Scrutins.json.zip  (repli : open data, mis à jour 1 fois/jour)
 *   - data.assemblee-nationale.fr .../vp/reunions/Agenda.json.zip     (agenda des séances)
 *   - data.assemblee-nationale.fr .../amo/...AMO10...json.zip        (députés en exercice → groupe)
 *   - eliasse.assemblee-nationale.fr/api-eliasse/...                  (API JSON de la nouvelle eLiasse)
 *
 * Chaque bloc est indépendant : si une source tombe, le fichier JSON correspondant n'est pas
 * réécrit (le widget affiche alors la dernière donnée et son heure en orange).
 */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------
const ARGS = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => a.startsWith('--')
    ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null).filter(Boolean));
const OUT = typeof ARGS.out === 'string' ? ARGS.out : 'public';
const FORCE = !!ARGS.force;

const AN = 'https://www.assemblee-nationale.fr';
const DATA = 'https://data.assemblee-nationale.fr';
const EL = 'https://eliasse.assemblee-nationale.fr';
const UA = 'widgets-seance/1.0 (usage interne, une requete toutes les 5 min)';

const SIEGES = 577;                       // nombre de sièges fixé par la loi (pas par la législature)
const URL_FEUILLE_VERTE = `${AN}/dyn/static/seance/conference.pdf`;
const MIN = 60_000, H = 60 * MIN;

/** Regroupement des groupes politiques en 4 blocs (par motif, car les sigles évoluent : UDR = « UDDPLR »). */
const BLOCS = [
  ['gauche', /^(LFI|SOC|ECO|GDR)/i, /insoumise|socialiste|écologiste|gauche démocrate/i],
  ['socle',  /^(EPR|DEM|HOR|DR)$/i,  /ensemble pour la république|démocrates|horizons|droite républicaine/i],
  ['rn',     /^(RN|UD)/i,            /rassemblement national|union des droites/i],
];
function blocDe(abrev = '', libelle = '') {
  for (const [bloc, reAbrev, reLib] of BLOCS) if (reAbrev.test(abrev) || reLib.test(libelle)) return bloc;
  return 'autres';                        // LIOT, NI, futurs groupes
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function get(url, { type = 'text', timeout = 30_000, essais = 3 } = {}) {
  let derniere;
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: type === 'json' ? 'application/json' : '*/*' },
        signal: AbortSignal.timeout(timeout),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
      if (type === 'json') return await r.json();
      if (type === 'buffer') return Buffer.from(await r.arrayBuffer());
      return await r.text();
    } catch (e) { derniere = e; if (i < essais - 1) await sleep(2000 * (i + 1)); }
  }
  throw derniere;
}

/** Lecteur ZIP minimal (méthodes 0 et 8, ZIP64 géré) pour éviter toute dépendance. */
function ouvrirZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP illisible');
  let nb = buf.readUInt16LE(eocd + 10), dir = buf.readUInt32LE(eocd + 16);
  if (nb === 0xffff || dir === 0xffffffff) {                     // ZIP64
    const loc = eocd - 20;
    const z64 = Number(buf.readBigUInt64LE(loc + 8));
    nb = Number(buf.readBigUInt64LE(z64 + 32)); dir = Number(buf.readBigUInt64LE(z64 + 48));
  }
  const entrees = [];
  for (let k = 0, p = dir; k < nb; k++) {
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    entrees.push({
      nom: buf.toString('utf8', p + 46, p + 46 + nl), methode: buf.readUInt16LE(p + 10),
      taille: buf.readUInt32LE(p + 20), offset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nl + xl + cl;
  }
  const lire = e => {
    const n = buf.readUInt16LE(e.offset + 26), x = buf.readUInt16LE(e.offset + 28);
    const d = buf.subarray(e.offset + 30 + n + x, e.offset + 30 + n + x + e.taille);
    return (e.methode === 0 ? d : inflateRawSync(d)).toString('utf8');
  };
  return { entrees, json: e => JSON.parse(lire(e)) };
}

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' };
const decoder = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITES[n.toLowerCase()] ?? m);
const texteBrut = html => decoder(html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const liste = x => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** Date/heure à Paris, quel que soit le fuseau de la machine (GitHub Actions tourne en UTC). */
const PARIS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long',
});
function paris(d) {
  const p = Object.fromEntries(PARIS.formatToParts(new Date(d)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, heure: `${+p.hour}h${p.minute}`, h: +p.hour, jourSemaine: p.weekday };
}
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const libelleJour = (dateIso, jourSemaine) => `${jourSemaine} ${+dateIso.slice(8, 10) === 1 ? '1er' : +dateIso.slice(8, 10)} ${MOIS[+dateIso.slice(5, 7) - 1]}`;

async function ecrireJSON(nom, objet) {
  const cible = path.join(OUT, nom);
  await writeFile(cible + '.tmp', JSON.stringify(objet));
  await rename(cible + '.tmp', cible);                               // écriture atomique
}

// ---------------------------------------------------------------------------
// Abréviations (objets de scrutin, points de l'ordre du jour)
// ---------------------------------------------------------------------------
const SIGLES = [
  [/projet de loi de finances rectificative pour (\d{4})/i, 'PLFR $1'],
  [/projet de loi de finances pour (\d{4})/i, 'PLF $1'],
  [/projet de loi de financement (rectificative )?de la sécurité sociale pour (\d{4})/i, 'PLFSS $2'],
  [/projet de loi constitutionnelle/i, 'PJL const.'],
  [/projet de loi organique/i, 'PJLO'],
  [/projet de loi/i, 'PJL'],
  [/proposition de loi constitutionnelle/i, 'PPL const.'],
  [/proposition de loi organique/i, 'PPLO'],
  [/proposition de loi/i, 'PPL'],
  [/proposition de résolution/i, 'PPRE'],
];
const STADES = [
  [/commission mixte paritaire|\bCMP\b/i, 'CMP'],
  [/lecture définitive/i, 'Lecture définitive'],
  [/nouvelle lecture/i, 'Nouvelle lecture'],
  [/troisième lecture/i, '3e lecture'],
  [/deuxième lecture/i, '2e lecture'],
  [/première lecture/i, '1re lecture'],
  [/première partie/i, '1re partie'],
  [/(seconde|deuxième) partie/i, '2de partie'],
];
const stadeDe = (texte = '', procedure = '') => {
  const s = STADES.find(([re]) => re.test(texte))?.[1] ?? null;
  const p = /simplifiée/i.test(procedure) ? 'proc. simplifiée' : /législation en commission/i.test(procedure) ? 'LEC' : null;
  return [s, p].filter(Boolean).join(' · ') || null;
};

/** Ex. : « l'amendement n° 3550 de Mme Coggia … à l'article 42 du projet de loi de finances pour 2027 » → « Amdt 3550 Coggia · art. 42 · PLF 2027 ». */
function abregerScrutin(titre) {
  const t = titre.replace(/\s+/g, ' ');
  const morceaux = [];
  let m;
  if (/^l'ensemble/i.test(t)) morceaux.push('Ensemble');
  else if (/motion de rejet préalable/i.test(t)) morceaux.push('Motion de rejet');
  else if (/motion de censure/i.test(t)) morceaux.push('Motion de censure');
  else if ((m = /sous-amendement n°\s*([\w-]+)/i.exec(t))) morceaux.push(`Ss-amdt ${m[1]}`);
  else if ((m = /amendement n°\s*([\w-]+)/i.exec(t))) morceaux.push(`Amdt ${m[1]}`);
  // nom de l'auteur, particules comprises (« Le Gac », « de Courson »)
  if ((m = /de (?:M\.|Mme) ((?:(?:de|du|des|d') ?)?[A-ZÉÈÀÂÎ][^\s,]*(?: [A-ZÉÈÀÂÎ][^\s,]*)*)/.exec(t)) && morceaux[0]?.includes('mdt')) morceaux[0] += ` ${m[1]}`;
  const ART = "l'article ((?:premier|liminaire|[\\dA-Z]+)(?: (?:bis|ter|quater|quinquies|sexies|[A-Z]))*)";
  if ((m = new RegExp(`([Aa]près|[Aa]vant) ${ART}`).exec(t))) morceaux.push(`${m[1].toLowerCase() === 'après' ? 'ap.' : 'av.'} art. ${m[2]}`);
  else if ((m = new RegExp(`(?:à |^)${ART}`).exec(t))) morceaux.push(`art. ${m[1]}`);
  const sigle = SIGLES.find(([re]) => re.test(t));
  if (sigle) {
    const brut = t.match(sigle[0])[0].replace(sigle[0], sigle[1]);
    // pour un PJL/PPL « ordinaire », on garde les 4 premiers mots de l'intitulé
    const suite = /^(PJL|PPL|PJLO|PPLO)$/.test(brut)
      ? ' ' + t.slice(t.search(sigle[0])).replace(sigle[0], '').replace(/\(.*$/, '').trim().split(' ').slice(0, 4).join(' ')
      : '';
    morceaux.push((brut + suite).trim());
  }
  return morceaux.length ? morceaux.join(' · ') : t.replace(/^l[ae'] ?/i, '').slice(0, 60);
}

/** « Suite de la discussion du projet de loi de finances pour 2027 (première partie) » → « PLF 2027 ». */
function abregerPoint(objet) {
  let t = objet.replace(/\s*\((?:n°|n°)?[^)]*\d{3,}[^)]*\)/g, '')            // retire « (3210, 3291) »
    .replace(/\s*\((première|deuxième|nouvelle|troisième) [^)]*\)/gi, '')
    .replace(/^(suite de la )?discussion,?\s*(en [^,]+,\s*)?(du|de la|des|de l')\s*/i, '')
    .replace(/^vote solennel sur (le|la|l')\s*/i, '')
    .replace(/^(la )?(première|seconde|deuxième) partie (du|de la|de l')\s*/i, '')   // la partie est déjà dans le stade
    .trim();
  for (const [re, rep] of SIGLES) if (re.test(t)) { t = t.replace(re, rep); break; }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------------------
// État persistant (cache entre deux passages)
// ---------------------------------------------------------------------------
const FICHIER_ETAT = () => path.join(OUT, '_etat.json');
async function lireEtat() {
  try { return JSON.parse(await readFile(FICHIER_ETAT(), 'utf8')); } catch { return {}; }
}

// ---------------------------------------------------------------------------
// 1. Législature (jamais codée en dur)
// ---------------------------------------------------------------------------
async function detecterLegislature(etat) {
  if (etat.legislature && Date.now() - (etat.legislatureVerifieeLe ?? 0) < 12 * H) return etat.legislature;
  const candidats = [etat.legislature ?? 0];
  try {   // l'open data range ses fichiers dans /repository/{législature}/
    const h = await get(`${DATA}/travaux-parlementaires/votes`);
    candidats.push(...[...h.matchAll(/repository\/(\d+)\//g)].map(m => +m[1]));
  } catch (e) { log('législature (open data) :', e.message); }
  try {   // eLiasse : « Assemblée nationale de la 17ème législature »
    const org = await get(`${EL}/api-eliasse/organes`, { type: 'json' });
    for (const o of org) { const m = /(\d+)\s*(?:e|è|ème)\s+législature/i.exec(o.libelle ?? ''); if (m) candidats.push(+m[1]); }
  } catch (e) { log('législature (eLiasse) :', e.message); }
  let n = Math.max(...candidats);
  if (!n) throw new Error('législature introuvable');
  // une nouvelle législature apparaît d'abord sur le site : on teste n+1
  try { if ((await fetch(`${AN}/dyn/${n + 1}/scrutins`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })).ok) n += 1; } catch {}
  etat.legislature = n; etat.legislatureVerifieeLe = Date.now();
  return n;
}

// ---------------------------------------------------------------------------
// 2. Députés en exercice → groupe (AMO10, rafraîchi une fois par jour)
// ---------------------------------------------------------------------------
async function chargerDeputes(leg, etat) {
  if (etat.amo?.leg === leg && etat.amo.places && Date.now() - etat.amo.le < 24 * H) return etat.amo;
  const zip = ouvrirZip(await get(`${DATA}/static/openData/repository/${leg}/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes.json.zip`, { type: 'buffer', timeout: 120_000 }));
  const groupes = {}, deputes = {}, places = {};
  let assemblee = null;
  for (const e of zip.entrees) {
    if (/\/organe\/PO\d+\.json$/.test(e.nom)) {
      const o = zip.json(e).organe;
      if (o.codeType === 'GP' && !o.viMoDe?.dateFin) groupes[o.uid] = { abrev: o.libelleAbrev, libelle: o.libelle, bloc: blocDe(o.libelleAbrev, o.libelle), membres: 0 };
    }
  }
  for (const e of zip.entrees) {
    if (!/\/acteur\/PA\d+\.json$/.test(e.nom)) continue;
    const a = zip.json(e).acteur;
    for (const m of liste(a.mandats?.mandat)) {
      if (m.dateFin) continue;
      if (m.typeOrgane === 'ASSEMBLEE') {
        assemblee = liste(m.organes?.organeRef)[0];
        const place = m.mandature?.placeHemicycle;      // n° de siège, ex. « 089 »
        if (place) places[a.uid?.['#text'] ?? a.uid] = +place;
      }
      if (m.typeOrgane === 'GP' && groupes[liste(m.organes?.organeRef)[0]]) {
        const g = liste(m.organes.organeRef)[0];
        deputes[a.uid?.['#text'] ?? a.uid] = g; groupes[g].membres++;
      }
    }
  }
  etat.amo = { leg, le: Date.now(), groupes, deputes, places, assemblee };
  log(`députés : ${Object.keys(deputes).length} en exercice, ${Object.keys(groupes).length} groupes`);
  return etat.amo;
}

/**
 * Plan officiel de l'hémicycle : la page « hémicycle » du site dessine chaque siège (<path id="p89">).
 * On en tire le centre de chaque siège. Rafraîchi une fois par semaine.
 */
async function chargerPlan(etat) {
  if (etat.plan && Date.now() - etat.plan.le < 7 * 24 * H) return etat.plan;
  const html = await get(`${AN}/dyn/vos-deputes/hemicycle`);
  const centres = {};
  for (const m of html.matchAll(/d="([^"]+)"\s*class="place"\s*id="p(\d+)"/g)) {
    const jetons = m[1].match(/[MmLlHhVvCcZz]|-?\d*\.?\d+(?:e-?\d+)?/g);
    let x = 0, y = 0, cmd = null, debut = true;
    const pts = [];
    for (let i = 0; i < jetons.length;) {
      if (/[A-Za-z]/.test(jetons[i])) { cmd = jetons[i++]; if (/[Zz]/.test(cmd)) continue; }
      const n = k => +jetons[i + k];
      if (/[Mm]/.test(cmd)) { [x, y] = cmd === 'm' && !debut ? [x + n(0), y + n(1)] : [n(0), n(1)]; i += 2; cmd = cmd === 'm' ? 'l' : 'L'; }
      else if (/[Ll]/.test(cmd)) { [x, y] = cmd === 'l' ? [x + n(0), y + n(1)] : [n(0), n(1)]; i += 2; }
      else if (/[Hh]/.test(cmd)) { x = cmd === 'h' ? x + n(0) : n(0); i += 1; }
      else if (/[Vv]/.test(cmd)) { y = cmd === 'v' ? y + n(0) : n(0); i += 1; }
      else if (/[Cc]/.test(cmd)) { [x, y] = cmd === 'c' ? [x + n(4), y + n(5)] : [n(4), n(5)]; i += 6; }
      else { i++; continue; }
      debut = false;
      pts.push([x, y]);
    }
    if (pts.length) centres[+m[2]] = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  }
  if (Object.keys(centres).length < 500) throw new Error(`plan de l'hémicycle illisible (${Object.keys(centres).length} sièges)`);
  etat.plan = { le: Date.now(), centres };
  log(`plan de l'hémicycle : ${Object.keys(centres).length} sièges`);
  return etat.plan;
}

/**
 * Sièges réels des députés en exercice, pour le dessin du widget :
 * [x, y, bloc, a voté] avec x, y ramenés sur une largeur de 1000. Bloc : g, s, r ou a.
 */
function hemicycleReel(amo, plan, votants) {
  if (!plan || !votants) return null;
  const pts = [];
  for (const [uid, place] of Object.entries(amo.places ?? {})) {
    const c = plan.centres[place];
    const g = amo.groupes[amo.deputes[uid]];
    if (c) pts.push([c[0], c[1], ({ gauche: 'g', socle: 's', rn: 'r' })[g?.bloc] ?? 'a', votants.has(uid) ? 1 : 0]);
  }
  if (pts.length < 500) return null;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), k = 1000 / (Math.max(...xs) - x0);
  return {
    largeur: 1000, hauteur: Math.round((Math.max(...ys) - y0) * k),
    sieges: pts.map(([x, y, b, v]) => [Math.round((x - x0) * k), Math.round((y - y0) * k), b, v]),
  };
}

/** Sièges par bloc pour le demi-cercle (ordre gauche → droite de l'hémicycle). */
function siegesParBloc(amo) {
  const s = { gauche: 0, autres: 0, socle: 0, rn: 0 };
  for (const g of Object.values(amo.groupes)) s[g.bloc] += g.membres;
  s.vacants = Math.max(0, SIEGES - s.gauche - s.autres - s.socle - s.rn);
  return s;
}

// ---------------------------------------------------------------------------
// 3. Scrutins → presence.json
// ---------------------------------------------------------------------------
const JOUR_FR = /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) (\d{1,2})(?:er)? (\w+) (\d{4})/i;

function lirePageScrutin(html, numero, leg) {
  const txt = texteBrut(html);
  const nb = re => { const m = re.exec(txt); return m ? +m[1] : null; };
  const titre = (/Scrutin public[^n]*n°\s*\d+\s+sur\s+(.+?)\s+Synthèse du vote/i.exec(txt)?.[1] ?? '').trim();
  const seance = /((?:Première|Deuxième|Troisième|Quatrième|Unique)?\s*séance du \S+ \d{1,2}(?:er)? \S+ \d{4})/i.exec(txt)?.[1]?.trim() ?? null;
  const j = JOUR_FR.exec(seance ?? txt);
  const date = j ? `${j[4]}-${String(MOIS.indexOf(j[3].toLowerCase()) + 1).padStart(2, '0')}-${j[2].padStart(2, '0')}` : null;

  // ventilation par groupe : un <ul id="groupeXXX"> par groupe ; le dernier s'arrête à « Mises au point »
  const groupes = [], votantsIds = [];
  const morceaux = html.split('<ul id="groupe').slice(1);
  morceaux.forEach((m, i) => {
    if (i === morceaux.length - 1) m = m.split(/Mises au point|Votes des groupes/)[0];
    const abrev = m.slice(0, m.indexOf('"'));
    const organe = /data-organe-id="(PO\d+)"/.exec(m)?.[1] ?? null;
    const t = texteBrut('<x id="' + m);
    const n = re => { let s = 0; for (const x of t.matchAll(re)) s += +x[1]; return s; };
    const pour = n(/\bPour\s*:\s*(\d+)/g), contre = n(/\bContre\s*:\s*(\d+)/g), abst = n(/\bAbstentions?\s*:\s*(\d+)/g);
    // liste nominative : chaque position (« Pour », « Contre »…) est suivie des députés (data-acteur-id="PA…")
    for (const section of m.split('<span class="h6').slice(1)) {
      const position = section.slice(section.indexOf('>') + 1, section.indexOf('<'));
      if (/^(Pour|Contre|Abstention)/i.test(position.trim()))
        for (const x of section.matchAll(/data-acteur-id="(PA\d+)/g)) votantsIds.push(x[1]);
    }
    groupes.push({
      abrev, organe, membres: +(/\((\d+)(?: membres?)?\)/.exec(t)?.[1] ?? 0),
      pour, contre, abstention: abst, votants: pour + contre + abst, nonVotants: n(/Non votants?\s*:\s*(\d+)/g),
    });
  });
  return {
    numero, url: `${AN}/dyn/${leg}/scrutins/${numero}`, titre, titreCourt: abregerScrutin(titre), seance, date,
    votants: nb(/Nombre de votants\s*:\s*(\d+)/i), exprimes: nb(/suffrages exprimés\s*:\s*(\d+)/i),
    pour: nb(/Pour l.adoption\s*:\s*(\d+)/i), contre: nb(/Contre\s*:\s*(\d+)/i), abstention: nb(/Abstentions?\s*:\s*(\d+)/i),
    sort: /n.a pas adopté|a rejeté/i.test(txt) ? 'rejeté' : /a adopté/i.test(txt) ? 'adopté' : null,
    groupes, votantsIds, delegationsConnues: false,
  };
}

async function scrutinsDepuisSite(leg, etat) {
  const page = await get(`${AN}/dyn/${leg}/scrutins`);
  const nums = [...new Set([...page.matchAll(new RegExp(`/dyn/${leg}/scrutins/(\\d+)`, 'g'))].map(m => +m[1]))]
    .sort((a, b) => b - a).slice(0, 3);
  if (!nums.length) throw new Error('liste des scrutins vide (page modifiée ?)');
  etat.scrutins ??= {};
  const res = [];
  for (const n of nums) {
    const cle = `${leg}-${n}`;
    if (!etat.scrutins[cle] || (res.length === 0 && !etat.scrutins[cle].votantsIds)) {
      const s = lirePageScrutin(await get(`${AN}/dyn/${leg}/scrutins/${n}`), n, leg);
      if (s.votants == null || !s.groupes.length) throw new Error(`scrutin ${n} : page illisible`);
      etat.scrutins[cle] = s;
    }
    res.push(etat.scrutins[cle]);
  }
  return res;
}

/** Repli : open data (zip de ~30 Mo, publié une fois par jour : peut avoir un jour de retard). */
async function scrutinsDepuisOpenData(leg, amo) {
  const zip = ouvrirZip(await get(`${DATA}/static/openData/repository/${leg}/loi/scrutins/Scrutins.json.zip`, { type: 'buffer', timeout: 180_000 }));
  const derniers = zip.entrees.map(e => ({ e, n: +(/V(\d+)\.json$/.exec(e.nom)?.[1] ?? 0) }))
    .sort((a, b) => b.n - a.n).slice(0, 3);
  return derniers.map(({ e, n }) => {
    const s = zip.json(e).scrutin, d = s.syntheseVote.decompte;
    let presents = 0;
    const votantsIds = [];
    const groupes = liste(s.ventilationVotes?.organe?.groupes?.groupe).map(g => {
      const v = g.vote.decompteVoix;
      for (const cat of ['pours', 'contres', 'abstentions'])
        for (const x of liste(g.vote.decompteNominatif?.[cat]?.votant)) { votantsIds.push(x.acteurRef); if (x.parDelegation === 'false') presents++; }
      return {
        abrev: amo.groupes[g.organeRef]?.abrev ?? g.organeRef, organe: g.organeRef, membres: +g.nombreMembresGroupe,
        pour: +v.pour, contre: +v.contre, abstention: +v.abstentions,
        votants: +v.pour + +v.contre + +v.abstentions, nonVotants: +v.nonVotants,
      };
    });
    return {
      numero: n, url: `${AN}/dyn/${leg}/scrutins/${n}`, titre: s.titre, titreCourt: abregerScrutin(s.titre),
      seance: null, date: s.dateScrutin, votants: +s.syntheseVote.nombreVotants, exprimes: +s.syntheseVote.suffragesExprimes,
      pour: +d.pour, contre: +d.contre, abstention: +d.abstentions,
      sort: /adopt/i.test(s.sort.code) ? 'adopté' : 'rejeté', groupes,
      votantsIds, delegationsConnues: true, presentsPhysiquement: presents,
    };
  });
}

async function construirePresence(leg, amo, plan, etat) {
  let scrutins, source = 'site';
  try {
    if (process.env.SIMULER_PANNE_SITE) throw new Error('panne simulée');   // pour tester le repli
    scrutins = await scrutinsDepuisSite(leg, etat);
  }
  catch (e) { log('scrutins (site) en échec, repli open data :', e.message); scrutins = await scrutinsDepuisOpenData(leg, amo); source = 'open data (J-1)'; }

  // Heure du scrutin : l'Assemblée ne la publie pas. On note l'heure à laquelle le serveur l'a VU
  // pour la première fois, seulement si le passage précédent date de moins de 12 min (sinon : inconnue).
  etat.vus ??= {};
  const suivi = etat.dernierPassage && Date.now() - etat.dernierPassage < 12 * MIN;
  for (const s of scrutins) {
    const cle = `${leg}-${s.numero}`;
    if (!(cle in etat.vus)) etat.vus[cle] = suivi ? new Date().toISOString() : null;
    s.vuA = etat.vus[cle];
  }
  const d = scrutins[0];
  const blocs = { gauche: 0, socle: 0, rn: 0, autres: 0 };
  for (const g of d.groupes) {
    const grp = Object.values(amo.groupes).find(x => x.abrev === g.abrev) ?? amo.groupes[g.organe];
    g.bloc = grp?.bloc ?? blocDe(g.abrev);
    blocs[g.bloc] += g.votants;
  }
  return {
    schema: 1, genereLe: new Date().toISOString(), legislature: leg, source, sieges: SIEGES,
    siegesParBloc: siegesParBloc(amo),
    hemicycle: hemicycleReel(amo, plan, d.votantsIds ? new Set(d.votantsIds) : null),
    avertissement: "L'Assemblée ne publie pas la présence en temps réel : il s'agit des votants du dernier scrutin public, délégations de vote comprises.",
    dernier: {
      numero: d.numero, url: d.url, titre: d.titre, titreCourt: d.titreCourt, seance: d.seance, date: d.date, vuA: d.vuA,
      votants: d.votants, pourcentage: Math.round(1000 * d.votants / SIEGES) / 10, blocs,
      groupes: d.groupes.map(({ abrev, bloc, votants, membres }) => ({ abrev, bloc, votants, membres })),
      presentsPhysiquement: d.presentsPhysiquement ?? null,
    },
    scrutins: scrutins.map(({ numero, url, titreCourt, date, vuA, sort, pour, contre, abstention, votants }) =>
      ({ numero, url, titreCourt, date, vuA, sort, pour, contre, abstention, votants })),
  };
}

// ---------------------------------------------------------------------------
// 4. Agenda → feuille-verte.json
// ---------------------------------------------------------------------------
async function chargerAgenda(leg, etat, now) {
  const ttl = etat.seanceActive ? 1 * H : 3 * H;                 // zip de ~9 Mo, publié une fois par jour
  if (etat.agenda?.leg === leg && now - etat.agenda.le < ttl) return etat.agenda;
  const zip = ouvrirZip(await get(`${DATA}/static/openData/repository/${leg}/vp/reunions/Agenda.json.zip`, { type: 'buffer', timeout: 180_000 }));
  const debutFenetre = now - 36 * H, finFenetre = now + 21 * 24 * H;
  const seances = [];
  for (const e of zip.entrees) {
    if (!/RUANR5L\d+S\d+IDS\d+\.json$/.test(e.nom)) continue;      // « IDS » = séance publique, « IDC » = commission
    const r = zip.json(e).reunion;
    if (r['@xsi:type'] !== 'seance_type') continue;
    const t = Date.parse(r.timeStampDebut);
    if (t < debutFenetre || t > finFenetre) continue;
    if (/annul|supprim|report/i.test(r.cycleDeVie?.etat ?? '')) continue;
    const points = liste(r.ODJ?.pointsODJ?.pointODJ)
      .filter(p => !/supprim|annul/i.test(p.cycleDeVie?.etat ?? ''))
      .map(p => {
        const type = p.typePointODJ ?? '';
        if (/questions au gouvernement/i.test(type)) return { type: 'qag', court: 'Questions au Gouvernement', stade: null };
        if (/questions orales sans débat/i.test(type)) return { type: 'qosd', court: 'Questions orales sans débat', stade: null };
        return {
          type: /vote solennel/i.test(type) ? 'vote' : /discussion/i.test(type) ? 'texte' : 'autre',
          court: abregerPoint(p.objet ?? type), libelle: p.objet, stade: stadeDe(p.objet, p.procedure ?? ''),
          prefixe: /^suite/i.test(type) ? 'Suite' : /vote solennel/i.test(type) ? 'Vote solennel' : null,
        };
      });
    const p = paris(t);
    seances.push({ debut: new Date(t).toISOString(), date: p.date, heure: p.heure, jourSemaine: p.jourSemaine, numero: r.identifiants?.quantieme ?? null, points });
  }
  seances.sort((a, b) => a.debut.localeCompare(b.debut));
  etat.agenda = { leg, le: now, seances };
  log(`agenda : ${seances.length} séances sur 3 semaines`);
  return etat.agenda;
}

/** Fenêtre probable d'une séance (l'agenda ne donne que l'heure de début). */
function fenetres(seances) {
  return seances.map((s, i) => {
    const debut = Date.parse(s.debut), h = paris(debut).h;
    const duree = h >= 20 ? 3.5 * H : h < 12 ? 4 * H : 5.5 * H;       // soir → ~1h, matin → ~13h, après-midi → ~20h
    const suivante = seances[i + 1] ? Date.parse(seances[i + 1].debut) : Infinity;
    return { debut, fin: Math.min(debut + duree, suivante) };
  });
}

function construireFeuilleVerte(leg, agenda) {
  const jours = [];
  for (const s of agenda.seances) {
    let j = jours.find(x => x.date === s.date);
    if (!j) jours.push(j = { date: s.date, libelle: libelleJour(s.date, s.jourSemaine), seances: [] });
    j.seances.push({ heure: s.heure, debut: s.debut, numero: s.numero, points: s.points });
  }
  return {
    schema: 1, genereLe: new Date().toISOString(), agendaDu: new Date(agenda.le).toISOString(),
    legislature: leg, urlFeuilleVerte: URL_FEUILLE_VERTE, jours,
  };
}

// ---------------------------------------------------------------------------
// 5. eLiasse → eliasse.json
// ---------------------------------------------------------------------------
async function construireEliasse(leg, amo, agenda, etat, now) {
  const api = p => get(`${EL}/api-eliasse/${p}`, { type: 'json', timeout: 60_000 });
  const organes = await api('organes');
  const seance = organes.find(o => o.abreviation === 'AN')?.uid ?? amo.assemblee;
  const [prochains, examens] = await Promise.all([api('prochainadiscuter'), api('examens')]);
  const pad = prochains.find(p => p.uidOrgane === seance);
  const examen = examens.find(e => e.uid === pad?.uidExamen) ?? examens.find(e => e.organeRef === seance && /cours/i.test(e.statut));
  const el = etat.eliasse ??= {};

  let texte = null, stats = null, prochain = null, article = null;
  if (examen) {
    const t = examen.texte;
    texte = { uid: t.uid, bibard: t.bibard, libelle: t.libelle, court: abregerPoint(t.libelle) + (t.partie ? ` · ${t.partie === 1 ? '1re' : '2de'} partie` : '') };
    stats = await api(`examens/${examen.uid}/statistiques`);
  }
  if (pad?.uidAmendement) {
    if (el.uid !== pad.uidAmendement) {
      // l'amendement a changé : on recharge le détail (dérouleur ~1,5 Mo + fiche ~2,5 Mo, côté serveur uniquement)
      const der = await api(`examens/${examen.uid}/derouleur`);
      const place = der.places.find(p => p.amendements.some(a => a.uid === pad.uidAmendement));
      const voisins = await api(`textes/${examen.texte.uid}/examens/${examen.uid}/amendements/${pad.uidAmendement}/with_neighbors`);
      const i = voisins.findIndex(a => a.uid === pad.uidAmendement), a = voisins[i];
      const gUid = amo.deputes[a?.auteur?.ref];
      const grp = gUid ? amo.groupes[gUid] : null;
      const grpSuffixe = /membres du groupe (.+)$/i.exec(a?.cosignatairesSuffixe ?? '')?.[1];
      el.prochain = {
        uid: pad.uidAmendement, numero: a?.numero ?? pad.uidAmendement.replace(/^.*N0*/, ''),
        auteur: a?.auteur?.libelle ?? null, typeAuteur: a?.auteur?.typeAuteur ?? null,
        groupe: grp?.abrev ?? (a?.auteur?.typeAuteur === 'Gouvernement' ? 'Gouv.' : a?.auteur?.typeAuteur && a.auteur.typeAuteur !== 'Député' ? 'Commission' : null),
        bloc: grp?.bloc ?? (grpSuffixe ? blocDe('', grpSuffixe) : 'autres'),
        deGroupe: !!grpSuffixe,
        // eLiasse ne publie plus les avis commission / Gouvernement (champ absent de l'API) : laissés à null
        avisCommission: a?.avisCommission ?? null, avisGouvernement: a?.avisGouvernement ?? null,
        suivants: voisins.slice(i + 1).filter(x => !x.sort).map(x => x.numero).slice(0, 2),
      };
      el.article = place?.libelle?.trim() ?? a?.division?.titre ?? null;
      // au tout premier passage, on ne sait pas depuis quand l'amendement est affiché : pas d'« activité »
      el.changeLe = el.uid ? now : null;
      el.uid = pad.uidAmendement;
    }
    prochain = el.prochain; article = el.article;
  }

  // État de la séance : agenda (fenêtres) + activité récente d'eLiasse
  const fen = fenetres(agenda.seances);
  const enCours = fen.findIndex(f => now >= f.debut && now < f.fin);
  const actif = el.changeLe && now - el.changeLe < 20 * MIN;
  let etatSeance = enCours >= 0 || actif ? 'seance' : 'levee';
  if (enCours >= 0 && agenda.seances[enCours].points[0]?.type === 'qag' && now - fen[enCours].debut < 70 * MIN && !actif) etatSeance = 'qag';
  const suivante = agenda.seances.find(s => Date.parse(s.debut) > now);

  return {
    schema: 1, genereLe: new Date(now).toISOString(), legislature: leg, etat: etatSeance,
    texte, article, prochain,
    restants: stats?.nombreAmendementsRestants ?? null, total: stats?.nombreAmendementsTotal ?? null, examines: stats?.nombreAmendementsExamines ?? null,
    dernierMouvement: el.changeLe ? new Date(el.changeLe).toISOString() : null,
    prochaineSeance: suivante ? { debut: suivante.debut, heure: suivante.heure, date: suivante.date, jour: libelleJour(suivante.date, suivante.jourSemaine) } : null,
    // fenêtres des prochaines séances : le widget recalcule « en séance / levée » seul si les données vieillissent
    fenetres: fen.filter(f => f.fin > now - 12 * H).slice(0, 8).map(f => ({ debut: new Date(f.debut).toISOString(), fin: new Date(f.fin).toISOString() })),
    urlEliasse: `${EL}/`,
  };
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------
async function main() {
  await mkdir(OUT, { recursive: true });
  const etat = await lireEtat();
  const now = Date.now();

  // Cadence : le planificateur appelle toutes les 5 min ; hors séance on ne travaille qu'une fois par heure.
  const enSeance = fenetres(etat.agenda?.seances ?? []).some(f => now >= f.debut - 30 * MIN && now < f.fin + 30 * MIN);
  etat.seanceActive = enSeance;
  if (!FORCE && !enSeance && etat.dernierPassage && now - etat.dernierPassage < 55 * MIN) {
    log('hors séance : passage horaire déjà fait, rien à faire.');
    return;
  }

  const erreurs = [];
  const etape = async (nom, f) => { try { return await f(); } catch (e) { erreurs.push(`${nom}: ${e.message}`); log(`ÉCHEC ${nom} :`, e.message); return null; } };

  const leg = await detecterLegislature(etat);
  log(`législature détectée : ${leg}e`);
  const amo = await etape('députés', () => chargerDeputes(leg, etat)) ?? etat.amo;
  if (!amo) throw new Error('aucune liste de députés disponible (premier passage ?)');
  const agenda = await etape('agenda', () => chargerAgenda(leg, etat, now)) ?? etat.agenda ?? { seances: [] };

  const plan = await etape('plan', () => chargerPlan(etat)) ?? etat.plan;
  const presence = await etape('presence', () => construirePresence(leg, amo, plan, etat));
  if (presence) await ecrireJSON('presence.json', presence);
  if (agenda.seances.length) await ecrireJSON('feuille-verte.json', construireFeuilleVerte(leg, agenda));
  const eliasse = await etape('eliasse', () => construireEliasse(leg, amo, agenda, etat, now));
  if (eliasse) await ecrireJSON('eliasse.json', eliasse);

  // ménage du cache : on ne garde que les 30 derniers scrutins
  for (const k of ['scrutins', 'vus']) {
    const cles = Object.keys(etat[k] ?? {}).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]);
    for (const c of cles.slice(30)) delete etat[k][c];
  }
  etat.dernierPassage = now; etat.erreurs = erreurs;
  // séance en cours (ou dans moins de 30 min) d'après l'agenda à jour : le planificateur boucle alors toutes les 5 min
  const actif = fenetres(agenda.seances).some(f => Date.now() >= f.debut - 30 * MIN && Date.now() < f.fin + 30 * MIN);
  etat.seanceActive = actif;
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `actif=${actif ? 1 : 0}\n`, { flag: 'a' });
  await writeFile(FICHIER_ETAT(), JSON.stringify(etat));
  log(erreurs.length ? `terminé avec ${erreurs.length} erreur(s)` : 'terminé sans erreur');
  if (erreurs.length === 3) process.exitCode = 1;                    // tout est tombé : on le signale au planificateur
}

main().catch(e => { console.error(e); process.exit(1); });
