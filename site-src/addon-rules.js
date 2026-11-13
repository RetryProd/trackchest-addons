// Règles des add-ons TrackChest et lecture / écriture de .zip, partagées par les pages du site et par la fonction
// serveur qui reçoit les propositions (functions/api/proposer.js). Mêmes règles que TrackChest (Addons.cs) et que
// scripts/Validate-Addon.ps1 : si une règle change, modifie les trois.

export const PERMISSIONS = ['stats.read', 'overlay.rows', 'overlay.theme', 'overlay.script'];
export const METRICS = ['chests', 'opened', 'destroyed', 'sprites', 'wanted', 'cannons', 'treasures', 'matches'];
export const SCOPES = ['total', 'last', 'session'];
export const THEME_KEYS = ['background', 'border', 'line', 'muted', 'text', 'accent', 'treasure'];
export const LIMITS = { zip: 64 * 1024, manifest: 16 * 1024, script: 32 * 1024, counters: 8 };

const MANIFEST_KEYS = ['schema', 'id', 'name', 'version', 'description', 'permissions', 'counters', 'theme'];
const COUNTER_KEYS = ['label', 'metric', 'scope', 'showLast', 'icon'];

export const PERMISSION_TEXT = {
  'stats.read': 'Lire les statistiques (coffres, parties, trésors)',
  'overlay.rows': 'Ajouter des lignes à l’overlay',
  'overlay.theme': 'Changer les couleurs de l’overlay',
  'overlay.script': 'Script : peut tout modifier dans l’overlay (bac à sable)',
};

function text(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

/** Toutes les erreurs d'un manifeste (tableau vide = valide). scriptSource : contenu de script.js, ou null. */
export function validateManifest(m, scriptSource) {
  const e = [];
  if (m === null || typeof m !== 'object' || Array.isArray(m)) return ['manifest.json doit contenir un objet JSON.'];
  for (const key of Object.keys(m)) if (!MANIFEST_KEYS.includes(key)) e.push(`Clé inconnue : ${key}.`);
  if (m.schema !== 1) e.push('schema doit valoir 1.');
  if (typeof m.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.id) || m.id.length < 3 || m.id.length > 40)
    e.push('Identifiant (id) : 3 à 40 caractères, minuscules, chiffres et tirets (ex. mon-addon).');
  if (!text(m.name, 1, 40)) e.push('Nom (name) : 1 à 40 caractères.');
  if (typeof m.version !== 'string' || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(m.version)) e.push('Version : format 1.0.0.');
  if (!text(m.description ?? '', 0, 200)) e.push('Description : 200 caractères maximum.');

  const permissions = Array.isArray(m.permissions) ? m.permissions : [];
  if (!Array.isArray(m.permissions)) e.push('permissions doit être une liste.');
  for (const p of permissions) if (!PERMISSIONS.includes(p)) e.push(`Permission inconnue : ${p}.`);
  if (new Set(permissions).size !== permissions.length) e.push('Permission en double.');

  const counters = m.counters === undefined ? [] : m.counters;
  if (!Array.isArray(counters)) e.push('counters doit être une liste.');
  else {
    if (counters.length > LIMITS.counters) e.push(`${LIMITS.counters} compteurs au maximum.`);
    counters.forEach((c, i) => {
      const n = i + 1;
      if (c === null || typeof c !== 'object') { e.push(`Compteur ${n} : objet attendu.`); return; }
      for (const key of Object.keys(c)) if (!COUNTER_KEYS.includes(key)) e.push(`Compteur ${n} : clé inconnue ${key}.`);
      if (!text(c.label, 1, 24)) e.push(`Compteur ${n} : texte de la ligne de 1 à 24 caractères.`);
      if (!METRICS.includes(c.metric)) e.push(`Compteur ${n} : metric inconnue (${c.metric}).`);
      if (!SCOPES.includes(c.scope ?? 'total')) e.push(`Compteur ${n} : scope inconnu (${c.scope}).`);
      if (c.showLast !== undefined && typeof c.showLast !== 'boolean') e.push(`Compteur ${n} : showLast doit être true ou false.`);
      if (c.icon !== undefined && (typeof c.icon !== 'string' || !/^[A-Za-z0-9_-]{1,32}(\.png)?$/.test(c.icon))) e.push(`Compteur ${n} : icône invalide (${c.icon}).`);
    });
  }
  const counterCount = Array.isArray(counters) ? counters.length : 0;
  const script = permissions.includes('overlay.script');
  if (counterCount > 0 && !(permissions.includes('stats.read') && permissions.includes('overlay.rows')))
    e.push('Les compteurs demandent les permissions stats.read et overlay.rows.');
  if (counterCount === 0 && permissions.includes('overlay.rows')) e.push('Permission overlay.rows sans compteur.');
  if (counterCount === 0 && !script && permissions.includes('stats.read')) e.push('Permission stats.read sans compteur ni script.');

  if (m.theme !== undefined && m.theme !== null) {
    if (typeof m.theme !== 'object' || Array.isArray(m.theme)) e.push('theme doit être un objet.');
    else {
      if (!permissions.includes('overlay.theme')) e.push('Le thème demande la permission overlay.theme.');
      const keys = Object.keys(m.theme);
      if (keys.length === 0) e.push('Le thème est vide.');
      for (const key of keys) {
        if (!THEME_KEYS.includes(key)) e.push(`Couleur inconnue : ${key}.`);
        else if (typeof m.theme[key] !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(m.theme[key])) e.push(`Couleur invalide pour ${key} (format #RRGGBB).`);
      }
    }
  } else if (permissions.includes('overlay.theme')) e.push('Permission overlay.theme sans thème.');

  const hasScript = typeof scriptSource === 'string';
  if (script && !hasScript) e.push('La permission overlay.script demande un fichier script.js.');
  if (hasScript && !script) e.push('script.js demande la permission overlay.script.');
  if (script && !permissions.includes('stats.read')) e.push('Le script demande aussi la permission stats.read.');
  if (hasScript) {
    if (!scriptSource.trim()) e.push('script.js est vide.');
    else if (!/\boverlay\b/.test(scriptSource)) e.push('script.js doit définir une fonction overlay(view, data).');
  }
  if (counterCount === 0 && (m.theme === undefined || m.theme === null) && !script) e.push('L’add-on ne contient ni compteur, ni thème, ni script.');
  return e;
}

// ---- .zip -------------------------------------------------------------------------------------------------------

const decoder = new TextDecoder('utf-8', { fatal: true });

async function inflateRaw(data, limit) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel(); throw new Error('fichier trop gros une fois décompressé'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

/** Lit les fichiers d'un .zip (méthodes « stockée » et « deflate »). Renvoie un Map nom → octets. */
export async function readZip(buffer, limits = { [`manifest.json`]: LIMITS.manifest, 'script.js': LIMITS.script }) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || bytes.length > LIMITS.zip) throw new Error(`le .zip doit faire entre 1 octet et ${LIMITS.zip / 1024} Ko`);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ce fichier n’est pas un .zip valide');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  if (count > 4) throw new Error('trop de fichiers dans le .zip');
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new Error('.zip endommagé');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue; // dossier vide ignoré, refusé plus bas s'il contient des fichiers
    if (flags & 1) throw new Error('les .zip chiffrés ne sont pas acceptés');
    if (!(name in limits)) throw new Error(`fichier non autorisé dans le .zip : ${name} (seulement manifest.json et script.js, à la racine)`);
    if (files.has(name)) throw new Error(`fichier en double : ${name}`);
    if (size > limits[name]) throw new Error(`${name} est trop gros`);
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('.zip endommagé');
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(start, start + compressed);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflateRaw(raw, limits[name]);
    else throw new Error(`méthode de compression non prise en charge (${method})`);
    if (data.length !== size) throw new Error(`${name} : taille incohérente`);
    files.set(name, data);
  }
  return files;
}

/** Lit et vérifie un add-on (.zip). Renvoie { manifest, manifestText, script, errors }. */
export async function readAddonZip(buffer) {
  let files;
  try { files = await readZip(buffer); }
  catch (err) { return { errors: [`Fichier refusé : ${err.message}.`] }; }
  const errors = [];
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) return { errors: ['Le .zip doit contenir manifest.json à la racine.'] };
  const scriptBytes = files.get('script.js') ?? null;
  for (const [name, b] of [['manifest.json', manifestBytes], ['script.js', scriptBytes]]) {
    if (b && b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) errors.push(`${name} ne doit pas avoir de BOM (UTF-8 sans BOM).`);
  }
  let manifestText, script = null, manifest;
  try {
    manifestText = decoder.decode(manifestBytes);
    if (scriptBytes) script = decoder.decode(scriptBytes);
  } catch { return { errors: ['Les fichiers doivent être en UTF-8.'] }; }
  try { manifest = JSON.parse(manifestText.replace(/^﻿/, '')); }
  catch (err) { return { errors: [`manifest.json n’est pas un JSON valide : ${err.message}`] }; }
  errors.push(...validateManifest(manifest, script));
  return { manifest, manifestText, script, errors };
}

// ---- Création d'un .zip (méthode « stockée », sans compression) -------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files : [{ name, text }]. Renvoie un Blob .zip. */
export function makeZip(files) {
  const encoder = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  // Date fixe (1er janvier 1980) : un même contenu donne toujours le même .zip, donc la même empreinte SHA-256.
  const time = 0;
  const date = (0 << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = encoder.encode(f.name);
    const data = encoder.encode(f.text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, time, true); local.setUint16(12, date, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true); dir.setUint16(12, time, true); dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true); dir.setUint32(20, data.length, true); dir.setUint32(24, data.length, true);
    dir.setUint16(28, name.length, true); dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
