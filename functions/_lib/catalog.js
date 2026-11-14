// Catalogue d'add-ons fabriqué et signé par le site, à partir du dépôt GitHub (branche main).
//
// Source de vérité : le dossier addons/<id>/ (manifest.json, script.js) et registry.json (verified, revoked).
// Accepter une proposition = la fusionner dans main : le catalogue change dans la minute (cache de 30 s).
//
//   GET /index.json        le catalogue
//   GET /index.json.sig    sa signature (ECDSA P-256 / SHA-256, la clé publique est dans TrackChest)
//   GET /addons/<id>-<version>.zip   les paquets
//
// Secret SIGNING_KEY : la clé privée de signature (contenu de addon-private.key). Voir le README du catalogue.
import { validateManifest, makeZip, LIMITS } from './rules.js';
import { gh, repoOf, decodeText, fromBase64, toBase64 } from './github.js';

const TTL_MS = 30_000;
let cache = null;
let keyCache = null;

export function clearCatalogCache() { cache = null; }

async function sha256Hex(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signingKey(env) {
  if (!env.SIGNING_KEY) throw new Error('la clé de signature n’est pas configurée (SIGNING_KEY)');
  if (!keyCache || keyCache.source !== env.SIGNING_KEY) {
    keyCache = {
      source: env.SIGNING_KEY,
      key: crypto.subtle.importKey('pkcs8', fromBase64(env.SIGNING_KEY.trim()), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']),
    };
  }
  return keyCache.key;
}

/** Signature au format attendu par TrackChest (r‖s, 64 octets, en base64). */
export async function sign(env, bytes) {
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(env), bytes);
  return toBase64(new Uint8Array(signature));
}

async function blobText(env, repo, sha) {
  const response = await gh(env, 'GET', `/repos/${repo}/git/blobs/${sha}`);
  if (!response.ok) throw new Error(`lecture d’un fichier impossible sur GitHub (${response.status})`);
  return decodeText(response.data.content);
}

/** Lit registry.json : { verified: [...], revoked: [...] }. */
export function parseRegistry(text) {
  let data = {};
  try { data = JSON.parse(text); } catch { /* fichier absent ou illisible */ }
  const list = (value) => (Array.isArray(value) ? value.filter((x) => typeof x === 'string') : []);
  return { verified: list(data.verified), revoked: list(data.revoked) };
}

export async function buildCatalog(env, origin) {
  const repo = repoOf(env);
  const head = await gh(env, 'GET', `/repos/${repo}/commits/main`);
  if (!head.ok) throw new Error(`GitHub : branche main introuvable (${head.status})`);
  const tree = await gh(env, 'GET', `/repos/${repo}/git/trees/${head.data.commit.tree.sha}?recursive=1`);
  if (!tree.ok) throw new Error(`GitHub : arbre du dépôt illisible (${tree.status})`);

  const files = new Map();
  for (const item of tree.data.tree) if (item.type === 'blob') files.set(item.path, item.sha);
  const registry = files.has('registry.json') ? parseRegistry(await blobText(env, repo, files.get('registry.json'))) : { verified: [], revoked: [] };

  const ids = [...new Set([...files.keys()].map((p) => /^addons\/([^/]+)\/(?:manifest\.json|script\.js)$/.exec(p)?.[1]).filter(Boolean))].sort();
  const entries = [], invalid = [], zips = new Map();

  async function load(id) {
    const errors = [];
    const manifestSha = files.get(`addons/${id}/manifest.json`);
    if (!manifestSha) return { id, errors: ['manifest.json absent'] };
    const manifestText = await blobText(env, repo, manifestSha);
    const scriptSha = files.get(`addons/${id}/script.js`);
    const script = scriptSha ? await blobText(env, repo, scriptSha) : null;
    if (manifestText.charCodeAt(0) === 0xfeff) errors.push('manifest.json a un BOM');
    if (script !== null && script.charCodeAt(0) === 0xfeff) errors.push('script.js a un BOM');
    let manifest = null;
    try { manifest = JSON.parse(manifestText); } catch (err) { errors.push(`manifest.json invalide : ${err.message}`); }
    if (manifest) {
      errors.push(...validateManifest(manifest, script));
      if (manifest.id !== id) errors.push('le nom du dossier doit être égal à l’id');
      if (new TextEncoder().encode(manifestText).length > LIMITS.manifest) errors.push('manifest.json trop gros');
      if (script !== null && new TextEncoder().encode(script).length > LIMITS.script) errors.push('script.js trop gros');
    }
    if (errors.length > 0) return { id, errors };
    const zip = new Uint8Array(await makeZip([{ name: 'manifest.json', text: manifestText }, ...(script !== null ? [{ name: 'script.js', text: script }] : [])]).arrayBuffer());
    if (zip.length > LIMITS.zip) return { id, errors: ['paquet trop gros (64 Ko maximum)'] };
    return { id, manifest, zip };
  }

  const loaded = [];
  for (let i = 0; i < ids.length; i += 6) loaded.push(...(await Promise.all(ids.slice(i, i + 6).map(load))));
  for (const item of loaded) {
    if (!item.manifest) { invalid.push({ id: item.id, errors: item.errors }); continue; }
    const m = item.manifest;
    const file = `${m.id}-${m.version}.zip`;
    zips.set(file, item.zip);
    entries.push({
      id: m.id,
      name: m.name,
      version: m.version,
      description: m.description ?? '',
      permissions: m.permissions,
      tier: registry.verified.includes(m.id) ? 'verified' : 'community',
      url: `${origin}/addons/${file}`,
      sha256: await sha256Hex(item.zip),
      size: item.zip.length,
    });
  }

  const index = JSON.stringify({
    version: 1,
    updatedUtc: head.data.commit.committer.date,
    addons: entries,
    revoked: registry.revoked,
  }, null, 2) + '\n';
  const signature = await sign(env, new TextEncoder().encode(index));
  return { commit: head.data.sha, index, signature, zips, entries, invalid, registry };
}

/** Catalogue en cache 30 s (le même contenu pour index.json et index.json.sig). */
export async function getCatalog(env, origin, { fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS && cache.origin === origin) return cache.value;
  const value = await buildCatalog(env, origin);
  cache = { at: Date.now(), origin, value };
  return value;
}
