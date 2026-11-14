import { getCatalog } from '../_lib/catalog.js';

// GET /addons/<id>-<version>.zip : le paquet d'un add-on du catalogue, fabriqué depuis le dépôt.
export async function onRequestGet({ request, env, params }) {
  const name = String(params.file || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*-\d{1,4}\.\d{1,4}\.\d{1,4}\.zip$/.test(name)) return new Response('Introuvable', { status: 404 });
  try {
    const catalog = await getCatalog(env, new URL(request.url).origin);
    const zip = catalog.zips.get(name);
    if (!zip) return new Response('Introuvable', { status: 404 });
    return new Response(zip, { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-cache' } });
  } catch (err) {
    return new Response(`Catalogue indisponible : ${err.message}`, { status: 503 });
  }
}
