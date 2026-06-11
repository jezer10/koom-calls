import { APP_CONFIG } from '../config.js';
import { apiClient, getStoredToken, setStoredToken } from './client.js';

/**
 * List auth providers configured on the backend.
 *
 * @returns {Promise<Array<{ name: string, displayName: string, enabled: boolean, startUrl?: string }>>}
 */
export async function getProviders() {
  const { data } = await apiClient.get('/auth/providers');
  return Array.isArray(data?.providers) ? data.providers : [];
}

/**
 * Fetch the current user profile. Returns null if not signed in.
 *
 * @returns {Promise<{ userId: string, displayName: string, email: string|null, picture: string|null, provider: string, lastLoginAt: string|null }|null>}
 */
export async function getMe() {
  try {
    const { data } = await apiClient.get('/auth/me');
    return data;
  } catch (err) {
    if (err?.response?.status === 401 || err?.response?.status === 403) {
      return null;
    }
    throw err;
  }
}

/**
 * Anonymous login (no password, no email). Returns the new user profile.
 * The session cookie is set automatically by the backend.
 *
 * @param {{ displayName?: string }} [payload]
 * @returns {Promise<{ userId: string, displayName: string, provider: string, email: string|null, picture: string|null }>}
 */
export async function anonymousLogin(payload = {}) {
  const { data } = await apiClient.post('/auth/anonymous/login', {
    displayName: payload.displayName,
  });
  return data;
}

/**
 * Fetch a short-lived single-use JWT for connecting to the signaling
 * WebSocket. The back's JwtAuthGuard accepts both the httpOnly session
 * cookie and an Authorization header; socket.io-client cannot read
 * httpOnly cookies, so we obtain a token first.
 *
 * @returns {Promise<{ token: string, expiresAt: number }>}
 */
export async function getWsToken() {
  const { data } = await apiClient.get('/auth/ws-token');
  return data;
}

/**
 * Clear the local session token. Note: the httpOnly cookie on the
 * backend is cleared via `POST /auth/logout` (best-effort), which the
 * caller should invoke before this.
 */
export function clearToken() {
  setStoredToken(null);
}

/**
 * Best-effort logout: clears the httpOnly cookie on the back, then
 * drops the local token.
 */
export async function logout() {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    /* ignore network errors; we still clear local state */
  }
  setStoredToken(null);
}

/**
 * @deprecated kept for backwards-compat. Returns the locally cached
 * token (delivered via postMessage from the OAuth popup) or null.
 */
export function getToken() {
  return getStoredToken();
}

/**
 * @deprecated kept for backwards-compat. The token is delivered by the
 * backend via postMessage + httpOnly cookie, not assigned here.
 */
export function setToken(token) {
  setStoredToken(token);
}

export const APP_CONFIG_AUTH = APP_CONFIG;
