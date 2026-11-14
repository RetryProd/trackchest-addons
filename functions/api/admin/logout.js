import { endedCookie, reply } from '../../_lib/auth.js';

// POST /api/admin/logout : ferme la session.
export async function onRequestPost() {
  return reply(200, { ok: true }, { 'set-cookie': endedCookie() });
}
