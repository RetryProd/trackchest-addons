import { getCatalog } from './_lib/catalog.js';

export async function onRequestGet({ request, env }) {
  try {
    const catalog = await getCatalog(env, new URL(request.url).origin);
    return new Response(catalog.index, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Catalogue indisponible : ${err.message}` }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
}
