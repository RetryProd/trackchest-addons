// POST /api/proposer : reçoit un add-on (.zip) envoyé depuis le site, sans compte, le vérifie et ouvre une
// proposition (pull request) sur le dépôt GitHub du catalogue. Le mainteneur la relit avant de l'accepter.
//
// Configuration (Cloudflare Pages → projet trackchest-addons) :
//   GITHUB_TOKEN  (secret)  jeton GitHub limité au dépôt du catalogue : Contents et Pull requests en écriture.
//   GITHUB_REPO   (option)  « propriétaire/dépôt », par défaut RetryProd/trackchest-addons.
import { readAddonZip, LIMITS } from '../../site-src/addon-rules.js';

const DEFAULT_REPO = 'RetryProd/trackchest-addons';

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function github(env, method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'trackchest-addons-site',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

export async function onRequestPost({ request, env }) {
  if (!env.GITHUB_TOKEN) return reply(503, { error: 'L’envoi d’add-ons n’est pas encore configuré sur ce site.' });

  // Requêtes venues d'une page du site seulement (protection simple contre les envois automatisés d'autres sites).
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply(403, { error: 'Envoi refusé.' });
  const length = Number(request.headers.get('content-length') || 0);
  if (length > LIMITS.zip * 2) return reply(413, { error: 'Fichier trop gros (64 Ko maximum).' });

  let form;
  try { form = await request.formData(); } catch { return reply(400, { error: 'Envoi illisible.' }); }
  if (form.get('site_web')) return reply(400, { error: 'Envoi refusé.' }); // champ piège invisible pour les robots
  const file = form.get('zip');
  if (!file || typeof file === 'string') return reply(400, { error: 'Choisis un fichier .zip.' });
  if (file.size > LIMITS.zip) return reply(413, { error: 'Fichier trop gros (64 Ko maximum).' });

  const addon = await readAddonZip(await file.arrayBuffer());
  if (addon.errors.length > 0) return reply(400, { error: 'Add-on invalide.', details: addon.errors });
  const { manifest, manifestText, script } = addon;

  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const base = await github(env, 'GET', `/repos/${repo}/git/ref/heads/main`);
  if (!base.ok) {
    return [401, 403, 404].includes(base.status)
      ? reply(503, { error: 'L’envoi est mal configuré sur ce site (jeton GitHub invalide ou sans accès au dépôt).' })
      : reply(502, { error: 'GitHub ne répond pas, réessaie plus tard.' });
  }
  const existing = await github(env, 'GET', `/repos/${repo}/contents/addons/${manifest.id}/manifest.json?ref=main`);
  const update = existing.ok;

  const branch = `proposition/${manifest.id}-${manifest.version}-${Date.now().toString(36)}`;
  const created = await github(env, 'POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: base.data.object.sha });
  if (!created.ok) return reply(502, { error: 'Impossible de préparer la proposition sur GitHub.' });

  const encoder = new TextEncoder();
  const files = [['manifest.json', manifestText]];
  if (script !== null) files.push(['script.js', script]);
  for (const [name, content] of files) {
    const path = `addons/${manifest.id}/${name}`;
    const current = update ? await github(env, 'GET', `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`) : { ok: false };
    const put = await github(env, 'PUT', `/repos/${repo}/contents/${path}`, {
      message: `${update ? 'Mise à jour' : 'Ajout'} de l'add-on ${manifest.id} ${manifest.version}`,
      content: toBase64(encoder.encode(content)),
      branch,
      ...(current.ok && current.data?.sha ? { sha: current.data.sha } : {}),
    });
    if (!put.ok) return reply(502, { error: 'Impossible d’envoyer les fichiers sur GitHub.' });
  }

  const permissions = manifest.permissions.map((p) => `\`${p}\``).join(', ');
  const body = [
    `Proposition envoyée depuis le site, sans compte.`,
    '',
    `- **Add-on** : ${manifest.name} (\`${manifest.id}\`) ${manifest.version}${update ? ' — mise à jour d’un add-on existant' : ''}`,
    `- **Permissions** : ${permissions}`,
    `- **Description** : ${manifest.description || '—'}`,
    script !== null ? '- **Contient un script** (`script.js`) : à lire entièrement.' : '',
    '',
    'Avant d’accepter (voir la checklist du README) :',
    '- [ ] Les contrôles automatiques passent.',
    '- [ ] Le nom, la description et les libellés sont honnêtes.',
    script !== null ? '- [ ] Le script est lu en entier et testé : `.\\scripts\\addon.ps1 empaqueter ' + manifest.id + ' -Exe …\\TrackChest.exe`' : '',
    '- [ ] Après fusion : `.\\scripts\\addon.ps1 publier` pour le mettre en ligne.',
  ].filter((line) => line !== '').join('\n');

  const pull = await github(env, 'POST', `/repos/${repo}/pulls`, {
    title: `${update ? 'Mise à jour' : 'Nouvel add-on'} : ${manifest.name} ${manifest.version}`,
    head: branch,
    base: 'main',
    body,
  });
  if (!pull.ok) return reply(502, { error: 'Impossible de créer la proposition sur GitHub.' });
  return reply(200, { ok: true, url: pull.data.html_url, number: pull.data.number, update });
}

export function onRequestGet() {
  return reply(405, { error: 'Utilise le formulaire du site pour poster un add-on.' });
}
