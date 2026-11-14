// Connexion de l'administrateur : un mot de passe (secret ADMIN_PASSWORD) et un cookie de session signé.
//
// - Le mot de passe est comparé en temps constant ; chaque échec attend 1,2 s et, après 5 échecs en 10 minutes
//   depuis la même adresse, les tentatives suivantes sont refusées.
// - Le cookie contient une date d'expiration et sa signature HMAC. Il est HttpOnly, Secure et SameSite=Strict :
//   ni un script de page, ni un autre site ne peut s'en servir. Changer le mot de passe invalide toutes les sessions.
// - Les actions qui modifient quelque chose exigent en plus que la requête vienne d'une page du site.

const encoder = new TextEncoder();
const COOKIE = 'tc_admin';
const LIFETIME_MS = 8 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000;

const failures = new Map(); // adresse → [dates des échecs] (par instance du site : protection de base)

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function passwordMatches(env, given) {
  if (typeof given !== 'string' || given.length === 0 || given.length > 200) return false;
  return sameBytes(await digest(given), await digest(env.ADMIN_PASSWORD));
}

export function tooManyFailures(request) {
  const ip = request.headers.get('cf-connecting-ip') || 'inconnue';
  const recent = (failures.get(ip) || []).filter((t) => Date.now() - t < WINDOW_MS);
  failures.set(ip, recent);
  return recent.length >= MAX_FAILURES;
}

export function recordFailure(request) {
  const ip = request.headers.get('cf-connecting-ip') || 'inconnue';
  failures.set(ip, [...(failures.get(ip) || []), Date.now()]);
}

export function clearFailures(request) {
  failures.delete(request.headers.get('cf-connecting-ip') || 'inconnue');
}

export async function sessionCookie(request, env) {
  const expires = Date.now() + LIFETIME_MS;
  const signature = await hmacHex(`session|${env.ADMIN_PASSWORD}`, String(expires));
  const secure = new URL(request.url).protocol === 'https:' ? 'Secure; ' : '';
  return `${COOKIE}=${expires}.${signature}; HttpOnly; ${secure}SameSite=Strict; Path=/; Max-Age=${LIFETIME_MS / 1000}`;
}

export function endedCookie() {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

async function hasSession(request, env) {
  const header = request.headers.get('cookie') || '';
  const part = header.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
  if (!part) return false;
  const [expires, signature] = part.slice(COOKIE.length + 1).split('.');
  if (!/^\d{10,15}$/.test(expires || '') || !/^[0-9a-f]{64}$/.test(signature || '')) return false;
  if (Number(expires) < Date.now()) return false;
  const expected = await hmacHex(`session|${env.ADMIN_PASSWORD}`, expires);
  return sameBytes(encoder.encode(expected), encoder.encode(signature));
}

export function reply(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** À appeler au début de chaque route admin. Renvoie une réponse d'erreur, ou null si l'accès est autorisé. */
export async function guard(request, env) {
  if (!env.ADMIN_PASSWORD) return reply(503, { error: 'L’administration n’est pas encore configurée (ADMIN_PASSWORD).' });
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) return reply(403, { error: 'Requête refusée.' });
  }
  if (!(await hasSession(request, env))) return reply(401, { error: 'Connecte-toi.' });
  if (!env.GITHUB_TOKEN) return reply(503, { error: 'Le jeton GitHub n’est pas configuré (GITHUB_TOKEN).' });
  return null;
}
