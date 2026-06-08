import { APP_CONFIG } from '../config.js';
import { apiClient, getStoredToken, setStoredToken } from './client.js';

/**
 * Dev login helper. Calls POST /auth/dev-login. If the backend is not
 * available we synthesize a token locally so the SPA can still mount during
 * offline development.
 *
 * @param {{ userId?: string, displayName?: string }} [payload]
 * @returns {Promise<{ token: string, userId: string, displayName: string }>}
 */
export async function devLogin(payload = {}) {
  const userId = payload.userId ?? `user-${Date.now().toString(36)}`;
  const displayName = payload.displayName ?? 'Guest';
  try {
    const { data } = await apiClient.post('/auth/dev-login', {
      userId,
      displayName,
    });
    const token = data?.token ?? synthesizeToken(userId);
    setStoredToken(token);
    return { token, userId, displayName };
  } catch (err) {
    if (!APP_CONFIG.devAuthEnabled) throw err;
    const token = synthesizeToken(userId);
    setStoredToken(token);
    return { token, userId, displayName };
  }
}

export function getToken() {
  return getStoredToken();
}

export function clearToken() {
  setStoredToken(null);
}

function synthesizeToken(userId) {
  const header = btoaSafe(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = btoaSafe(
    JSON.stringify({ sub: userId, iat: Math.floor(Date.now() / 1000) }),
  );
  return `${header}.${body}.local`;
}

function btoaSafe(value) {
  if (typeof btoa === 'function') {
    return btoa(value).replace(/=+$/, '');
  }
  return Buffer.from(value, 'utf-8').toString('base64').replace(/=+$/, '');
}
