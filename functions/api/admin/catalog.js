import { guard, reply } from '../../_lib/auth.js';
import { getCatalog } from '../../_lib/catalog.js';
import { editRegistry } from '../../_lib/proposals.js';
import { clearCatalogCache } from '../../_lib/catalog.js';

// GET  /api/admin/catalog                    les add-ons publiés (et les dossiers invalides)
// POST /api/admin/catalog { action, id }     verify / unverify (badge Vérifié), revoke / unrevoke (retrait chez les joueurs)
export async function onRequestGet({ request, env }) {
  const denied = await guard(request, env);
  if (denied) return denied;
  try {
    const catalog = await getCatalog(env, new URL(request.url).origin, { fresh: true });
    return reply(200, {
      addons: catalog.entries.map((e) => ({ ...e, revoked: catalog.registry.revoked.includes(e.id) })),
      invalid: catalog.invalid,
      updatedUtc: JSON.parse(catalog.index).updatedUtc,
    });
  } catch (err) { return reply(502, { error: err.message }); }
}

export async function onRequestPost({ request, env }) {
  const denied = await guard(request, env);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return reply(400, { error: 'Requête illisible.' }); }
  const id = String(body?.id || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return reply(400, { error: 'Identifiant invalide.' });
  const actions = {
    verify: (r) => { r.verified.push(id); },
    unverify: (r) => { r.verified = r.verified.filter((x) => x !== id); },
    revoke: (r) => { r.revoked.push(id); },
    unrevoke: (r) => { r.revoked = r.revoked.filter((x) => x !== id && !x.startsWith(`${id}@`)); },
  };
  if (!actions[body.action]) return reply(400, { error: 'Action inconnue.' });
  try {
    await editRegistry(env, `Add-on ${id} : ${body.action}`, actions[body.action]);
    clearCatalogCache();
    return reply(200, { ok: true });
  } catch (err) { return reply(502, { error: err.message }); }
}
