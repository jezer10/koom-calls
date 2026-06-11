/**
 * Derive the socket.io base URL from the REST API base URL. Both live on
 * the same origin: REST is exposed at `<origin>/api/*` and socket.io's
 * `signaling-client.js` concatenates the namespace, so we strip the API
 * prefix here.
 */
function deriveSignalingUrl(apiBaseUrl) {
  try {
    const u = new URL(apiBaseUrl);
    u.pathname = u.pathname.replace(/\/api\/?$/, '');
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:8080';
  }
}

function deriveBackendOrigin(apiBaseUrl) {
  try {
    const u = new URL(apiBaseUrl);
    return u.origin;
  } catch {
    return '';
  }
}

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api';

function deriveFrontendOrigin() {
  if (typeof window === 'undefined') return '';
  if (import.meta.env.VITE_FRONTEND_ORIGIN) return import.meta.env.VITE_FRONTEND_ORIGIN;
  return window.location.origin;
}

export const APP_CONFIG = {
  apiBaseUrl: rawApiBaseUrl,
  signalingUrl: deriveSignalingUrl(rawApiBaseUrl),
  backendOrigin: deriveBackendOrigin(rawApiBaseUrl),
  signalingNamespace: '/signaling',
  sfuUrl: import.meta.env.VITE_SFU_URL ?? 'ws://localhost:7880',
  anonymousLoginEnabled:
    (import.meta.env.VITE_ANONYMOUS_LOGIN_ENABLED ?? 'true') === 'true',
  frontendOrigin: deriveFrontendOrigin(),
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

