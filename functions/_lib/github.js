// Accès à l'API GitHub avec le jeton du site (secret GITHUB_TOKEN).
//   GITHUB_REPO     (option) « propriétaire/dépôt », par défaut RetryProd/trackchest-addons
//   GITHUB_API_URL  (option) adresse de l'API : sert aux tests avec un faux GitHub

export const DEFAULT_REPO = 'RetryProd/trackchest-addons';
export const repoOf = (env) => env.GITHUB_REPO || DEFAULT_REPO;

export async function gh(env, method, path, body) {
  const base = env.GITHUB_API_URL || 'https://api.github.com';
  let response;
  try {
    response = await fetch(base + path, {
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
  } catch {
    return { ok: false, status: 0, data: null };
  }
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* réponse sans JSON */ }
  return { ok: response.ok, status: response.status, data };
}

export function fromBase64(value) {
  const binary = atob(String(value).replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Contenu d'un fichier renvoyé par l'API (base64) en texte UTF-8. */
export function decodeText(base64) {
  return new TextDecoder().decode(fromBase64(base64));
}
