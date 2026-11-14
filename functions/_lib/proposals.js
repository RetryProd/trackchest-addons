// Propositions d'add-ons (pull requests du dépôt du catalogue) : lecture, contrôles, validation, refus.
//
// Règle de sécurité : on ne peut valider qu'une proposition qui ne touche QUE les fichiers
// addons/<id>/manifest.json et addons/<id>/script.js d'un seul add-on. Toute autre modification (scripts,
// workflows, README, registry.json, etc.) doit être relue et fusionnée à la main sur GitHub.
import { validateManifest, LIMITS } from './rules.js';
import { gh, repoOf, decodeText, toBase64 } from './github.js';
import { clearCatalogCache, parseRegistry } from './catalog.js';

const FILE_PATTERN = /^addons\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(manifest\.json|script\.js)$/;

function newerVersion(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/** Lit une proposition et la contrôle. Ne modifie rien. */
export async function loadProposal(env, number) {
  const repo = repoOf(env);
  const pull = await gh(env, 'GET', `/repos/${repo}/pulls/${number}`);
  if (!pull.ok) return { error: pull.status === 404 ? 'Proposition introuvable.' : `GitHub : lecture impossible (${pull.status}).` };
  const pr = pull.data;
  const result = {
    number: pr.number, title: pr.title, url: pr.html_url, author: pr.user?.login ?? '?', createdAt: pr.created_at,
    state: pr.state, headSha: pr.head.sha, headRef: pr.head.ref,
    sameRepo: pr.head.repo?.full_name === repo, fromSite: pr.head.ref.startsWith('proposition/'),
    mergeable: pr.mergeable, files: [], errors: [], warnings: [], id: null, manifest: null, manifestText: null, script: null,
    existing: null, ci: 'none', canApprove: false,
  };
  if (pr.state !== 'open') { result.errors.push('Cette proposition n’est plus ouverte.'); return result; }

  const changed = await gh(env, 'GET', `/repos/${repo}/pulls/${number}/files?per_page=100`);
  if (!changed.ok) { result.errors.push(`Liste des fichiers illisible (${changed.status}).`); return result; }
  result.files = changed.data.map((f) => ({ name: f.filename, status: f.status }));
  const ids = new Set();
  let onlyAddonFiles = changed.data.length > 0 && changed.data.length <= 2;
  for (const f of changed.data) {
    const match = FILE_PATTERN.exec(f.filename);
    if (!match || !['added', 'modified'].includes(f.status)) onlyAddonFiles = false;
    else ids.add(match[1]);
  }
  if (!onlyAddonFiles || ids.size !== 1) {
    result.errors.push('Cette proposition ne se limite pas aux fichiers manifest.json et script.js d’un seul add-on : relis-la et fusionne-la à la main sur GitHub.');
    return result;
  }
  const id = [...ids][0];
  result.id = id;

  // Contenu des fichiers, tel qu'il sera fusionné (au commit exact relu).
  const source = pr.head.repo?.full_name ?? repo;
  async function fetchFile(name) {
    const r = await gh(env, 'GET', `/repos/${source}/contents/addons/${id}/${name}?ref=${pr.head.sha}`);
    return r.ok && r.data?.content ? decodeText(r.data.content) : null;
  }
  const manifestText = await fetchFile('manifest.json');
  const script = changed.data.some((f) => f.filename.endsWith('script.js')) ? await fetchFile('script.js') : null;
  if (manifestText === null) { result.errors.push('manifest.json est introuvable dans la proposition.'); return result; }
  result.manifestText = manifestText;
  result.script = script;
  if (manifestText.charCodeAt(0) === 0xfeff) result.errors.push('manifest.json ne doit pas avoir de BOM.');
  if (script !== null && script.charCodeAt(0) === 0xfeff) result.errors.push('script.js ne doit pas avoir de BOM.');
  let manifest = null;
  try { manifest = JSON.parse(manifestText); } catch (err) { result.errors.push(`manifest.json n’est pas un JSON valide : ${err.message}`); }
  if (manifest) {
    result.manifest = manifest;
    result.errors.push(...validateManifest(manifest, script));
    if (manifest.id !== id) result.errors.push('Le dossier de l’add-on doit porter le même nom que son id.');
    if (new TextEncoder().encode(manifestText).length > LIMITS.manifest) result.errors.push('manifest.json est trop gros.');
    if (script !== null && new TextEncoder().encode(script).length > LIMITS.script) result.errors.push('script.js est trop gros.');
  }

  // Add-on déjà publié ? Une mise à jour doit augmenter la version.
  const published = await gh(env, 'GET', `/repos/${repo}/contents/addons/${id}/manifest.json?ref=main`);
  if (published.ok && published.data?.content) {
    try {
      const current = JSON.parse(decodeText(published.data.content));
      result.existing = { version: current.version, permissions: current.permissions ?? [] };
      if (manifest && !newerVersion(String(manifest.version), String(current.version)))
        result.errors.push(`Cet add-on existe déjà en version ${current.version} : la nouvelle version doit être plus grande.`);
      if (manifest && JSON.stringify(manifest.permissions ?? []) !== JSON.stringify(current.permissions ?? []))
        result.warnings.push('Les permissions ont changé par rapport à la version publiée.');
    } catch { /* ancienne version illisible : ignorée */ }
  }

  // Contrôle automatique GitHub (facultatif : le jeton peut ne pas avoir le droit de le lire).
  const checks = await gh(env, 'GET', `/repos/${repo}/commits/${pr.head.sha}/check-runs`);
  if (checks.ok && Array.isArray(checks.data?.check_runs) && checks.data.check_runs.length > 0) {
    const runs = checks.data.check_runs;
    result.ci = runs.some((r) => r.status !== 'completed') ? 'pending'
      : runs.every((r) => ['success', 'neutral', 'skipped'].includes(r.conclusion)) ? 'success' : 'failure';
  }
  if (result.ci === 'failure') result.errors.push('Le contrôle automatique GitHub a échoué.');
  if (result.ci === 'pending') result.warnings.push('Le contrôle automatique GitHub est en cours.');
  if (result.ci === 'none') result.warnings.push('Le contrôle automatique GitHub n’a pas encore répondu.');
  if (pr.mergeable === false) result.errors.push('Cette proposition est en conflit avec la branche main : elle ne peut pas être fusionnée.');
  if (script !== null) result.warnings.push('Cet add-on contient un script : lis-le en entier avant de valider.');

  result.canApprove = result.errors.length === 0;
  return result;
}

export async function listProposals(env) {
  const repo = repoOf(env);
  const list = await gh(env, 'GET', `/repos/${repo}/pulls?state=open&per_page=30&sort=created&direction=asc`);
  if (!list.ok) throw new Error(`GitHub : liste des propositions illisible (${list.status})`);
  return Promise.all(list.data.map((pr) => loadProposal(env, pr.number)));
}

/** Modifie registry.json (verified, revoked) avec un commit. mutate reçoit { verified, revoked } et les modifie. */
export async function editRegistry(env, message, mutate) {
  const repo = repoOf(env);
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await gh(env, 'GET', `/repos/${repo}/contents/registry.json?ref=main`);
    const registry = current.ok ? parseRegistry(decodeText(current.data.content)) : { verified: [], revoked: [] };
    mutate(registry);
    const clean = (list) => [...new Set(list)].sort();
    const text = JSON.stringify({ verified: clean(registry.verified), revoked: clean(registry.revoked) }, null, 2) + '\n';
    const put = await gh(env, 'PUT', `/repos/${repo}/contents/registry.json`, {
      message, branch: 'main', content: toBase64(new TextEncoder().encode(text)), ...(current.ok ? { sha: current.data.sha } : {}),
    });
    if (put.ok) { clearCatalogCache(); return; }
    if (put.status !== 409) break; // 409 : le fichier a changé entre-temps, on réessaie une fois
  }
  throw new Error('Impossible de modifier registry.json sur GitHub.');
}

/** Valide : fusionne la proposition (le catalogue la publie ensuite), la marque « Vérifié » si demandé. */
export async function approveProposal(env, number, reviewedSha, verified) {
  const repo = repoOf(env);
  const p = await loadProposal(env, number);
  if (p.error) return { status: 404, error: p.error };
  if (!p.canApprove) return { status: 400, error: 'Cette proposition ne peut pas être validée.', details: p.errors };
  if (reviewedSha !== p.headSha) return { status: 409, error: 'La proposition a changé depuis son affichage : recharge la page et relis-la.' };

  const id = p.id, version = p.manifest.version;
  const merged = await gh(env, 'PUT', `/repos/${repo}/pulls/${number}/merge`, {
    merge_method: 'squash',
    sha: p.headSha,
    commit_title: `${p.existing ? 'Mise à jour' : 'Ajout'} de l'add-on ${id} ${version}`,
  });
  if (!merged.ok) return { status: 502, error: `GitHub a refusé la fusion (${merged.status}) : ${merged.data?.message ?? 'raison inconnue'}.` };
  clearCatalogCache();

  if (p.sameRepo && p.fromSite) await gh(env, 'DELETE', `/repos/${repo}/git/refs/heads/${p.headRef}`);
  if (verified) await editRegistry(env, `Add-on ${id} marqué comme vérifié`, (r) => { r.verified.push(id); });
  return { status: 200, ok: true, id, version, verified: Boolean(verified) };
}

/** Refuse : ferme la proposition (avec un commentaire facultatif) et supprime sa branche. */
export async function rejectProposal(env, number, reason) {
  const repo = repoOf(env);
  const pull = await gh(env, 'GET', `/repos/${repo}/pulls/${number}`);
  if (!pull.ok) return { status: 404, error: 'Proposition introuvable.' };
  if (pull.data.state !== 'open') return { status: 409, error: 'Cette proposition n’est plus ouverte.' };
  const text = String(reason || '').trim().slice(0, 500);
  if (text) await gh(env, 'POST', `/repos/${repo}/issues/${number}/comments`, { body: `Proposition refusée : ${text}` });
  const closed = await gh(env, 'PATCH', `/repos/${repo}/pulls/${number}`, { state: 'closed' });
  if (!closed.ok) return { status: 502, error: `GitHub n’a pas fermé la proposition (${closed.status}).` };
  if (pull.data.head.repo?.full_name === repo && pull.data.head.ref.startsWith('proposition/'))
    await gh(env, 'DELETE', `/repos/${repo}/git/refs/heads/${pull.data.head.ref}`);
  return { status: 200, ok: true };
}
