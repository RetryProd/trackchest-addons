import { passwordMatches, tooManyFailures, recordFailure, clearFailures, sessionCookie, sleep, reply } from '../../_lib/auth.js';

// POST /api/admin/login { password } : ouvre une session administrateur (cookie de 8 h).
export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return reply(503, { error: 'L’administration n’est pas encore configurée (ADMIN_PASSWORD).' });
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return reply(403, { error: 'Requête refusée.' });
  if (tooManyFailures(request)) return reply(429, { error: 'Trop d’essais. Réessaie dans quelques minutes.' });

  let body;
  try { body = await request.json(); } catch { return reply(400, { error: 'Requête illisible.' }); }
  if (!(await passwordMatches(env, body?.password))) {
    recordFailure(request);
    await sleep(1200);
    return reply(401, { error: 'Mot de passe incorrect.' });
  }
  clearFailures(request);
  return reply(200, { ok: true }, { 'set-cookie': await sessionCookie(request, env) });
}
