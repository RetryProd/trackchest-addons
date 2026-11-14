import { guard, reply } from '../../_lib/auth.js';
import { listProposals, approveProposal, rejectProposal } from '../../_lib/proposals.js';

// GET  /api/admin/proposals                          les propositions ouvertes, avec leurs contrôles
// POST /api/admin/proposals { action, number, ... }  valider (approve : sha, verified) ou refuser (reject : reason)
export async function onRequestGet({ request, env }) {
  const denied = await guard(request, env);
  if (denied) return denied;
  try { return reply(200, { proposals: await listProposals(env) }); }
  catch (err) { return reply(502, { error: err.message }); }
}

export async function onRequestPost({ request, env }) {
  const denied = await guard(request, env);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return reply(400, { error: 'Requête illisible.' }); }
  const number = Number(body?.number);
  if (!Number.isInteger(number) || number < 1) return reply(400, { error: 'Numéro de proposition invalide.' });
  try {
    const result = body.action === 'approve' ? await approveProposal(env, number, String(body.sha || ''), body.verified === true)
      : body.action === 'reject' ? await rejectProposal(env, number, body.reason)
      : { status: 400, error: 'Action inconnue.' };
    return reply(result.status, result);
  } catch (err) { return reply(502, { error: err.message }); }
}
