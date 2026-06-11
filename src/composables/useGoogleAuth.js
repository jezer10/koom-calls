import { onBeforeUnmount, onMounted, ref } from 'vue';
import { APP_CONFIG } from '../config.js';
import { setToken } from '../api/auth.js';

const OAUTH_MESSAGE_TYPE = 'koom-oauth-success';
const OAUTH_ERROR_TYPE = 'koom-oauth-error';
const POPUP_FEATURES = 'width=520,height=620,left=200,top=80';
const POPUP_TIMEOUT_MS = 5 * 60 * 1000;
// When the popup closes manually the parent regains focus; we give the
// postMessage a brief window to land before declaring the flow abandoned.
const FOCUS_GRACE_PERIOD_MS = 350;

/**
 * The OAuth callback runs on the back's origin (it serves
 * `/auth/google/callback`), so `event.origin` will be the back's origin,
 * not the front's. In dev both share an origin and `event.origin` matches
 * `frontendOrigin`; in cross-origin prod the popup is on
 * `APP_CONFIG.backendOrigin` while the front lives on
 * `APP_CONFIG.frontendOrigin`. The `targetOrigin` passed by the back in
 * `postMessage(data, FRONTEND_ORIGIN)` already restricts delivery to the
 * right window, so this check is a defense-in-depth filter that accepts
 * either the back or the front origin.
 */
function isTrustedSender(origin) {
  if (!origin) return false;
  if (origin === APP_CONFIG.frontendOrigin) return true;
  if (APP_CONFIG.backendOrigin && origin === APP_CONFIG.backendOrigin) return true;
  return false;
}

function popupCenter() {
  if (typeof window === 'undefined') return POPUP_FEATURES;
  const w = window.innerWidth || 1024;
  const h = window.innerHeight || 768;
  const left = Math.max(0, Math.floor((w - 520) / 2));
  const top = Math.max(0, Math.floor((h - 620) / 2));
  return `${POPUP_FEATURES},left=${left},top=${top}`;
}

export function useGoogleAuth() {
  const status = ref('idle'); // 'idle' | 'opening' | 'error'
  const errorMessage = ref('');
  const lastUser = ref(null);

  let listener = null;
  let focusListener = null;
  let timeoutTimer = null;
  let graceTimer = null;
  // Same-origin opener reference kept for documentation/future-proofing.
  // We never touch `popup.closed` cross-origin (COOP blocks it) — we rely
  // on `postMessage` from the callback page and on the parent window's
  // `focus` event to detect manual closure.
  let popupRef = null;

  function cleanupTimers() {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    if (graceTimer) {
      clearTimeout(graceTimer);
      graceTimer = null;
    }
  }

  function detachFocusListener() {
    if (focusListener && typeof window !== 'undefined') {
      window.removeEventListener('focus', focusListener);
      focusListener = null;
    }
  }

  function markError(message) {
    status.value = 'error';
    errorMessage.value = message;
    cleanupTimers();
    popupRef = null;
    detachFocusListener();
  }

  function markIdle() {
    status.value = 'idle';
    errorMessage.value = '';
    cleanupTimers();
    popupRef = null;
    detachFocusListener();
  }

  function handleMessage(event) {
    if (!isTrustedSender(event.origin)) return;
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type === OAUTH_MESSAGE_TYPE) {
      if (event.data.token) setToken(event.data.token);
      lastUser.value = event.data.user ?? null;
      markIdle();
      if (event.data.returnTo && typeof window !== 'undefined') {
        window.location.assign(event.data.returnTo);
      }
    } else if (event.data.type === OAUTH_ERROR_TYPE) {
      markError(event.data.message ?? 'Authentication failed');
    }
  }

  /**
   * The popup was almost certainly closed by the user without going
   * through our callback. We give the postMessage a short grace
   * period to arrive in case it was in flight.
   */
  function handleFocus() {
    if (status.value !== 'opening') return;
    cleanupTimers();
    graceTimer = setTimeout(() => {
      if (status.value === 'opening') {
        markError('La ventana de autenticación se cerró antes de completar.');
      } else {
        detachFocusListener();
      }
    }, FOCUS_GRACE_PERIOD_MS);
  }

  function openPopup({ returnTo } = {}) {
    if (typeof window === 'undefined') return null;
    if (status.value === 'opening') return null;
    status.value = 'opening';
    errorMessage.value = '';
    // The OAuth start/callback routes are excluded from the back's /api
    // prefix because Google's redirect_uri must match the URL verbatim.
    // Strip the /api suffix from apiBaseUrl before composing the popup URL.
    const backOrigin = APP_CONFIG.apiBaseUrl.replace(/\/api\/?$/, '');
    const startUrl = `${backOrigin}/auth/google/start${
      returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
    }`;
    const popup = window.open(startUrl, 'koom-oauth', popupCenter());
    if (!popup) {
      markError(
        'El navegador bloqueó la ventana emergente. Habilitá los popups para este sitio.',
      );
      return null;
    }
    popupRef = popup;
    // Register the focus listener while the popup is in flight. When the
    // user closes the popup manually the parent window regains focus and
    // we can short-circuit the long safety-net timeout.
    if (!focusListener) {
      focusListener = () => handleFocus();
      window.addEventListener('focus', focusListener);
    }
    // Safety net: if the user abandons the popup (closes it manually
    // without going through our callback), reset state after a long
    // timeout. The focus-based check above usually wins first.
    cleanupTimers();
    timeoutTimer = setTimeout(() => {
      if (status.value === 'opening') {
        markError('La ventana de autenticación se cerró sin completar.');
      }
    }, POPUP_TIMEOUT_MS);
    return popup;
  }

  onMounted(() => {
    if (typeof window === 'undefined') return;
    listener = (event) => handleMessage(event);
    window.addEventListener('message', listener);
  });

  onBeforeUnmount(() => {
    if (listener && typeof window !== 'undefined') {
      window.removeEventListener('message', listener);
    }
    detachFocusListener();
    cleanupTimers();
    popupRef = null;
  });

  return {
    status,
    errorMessage,
    lastUser,
    openPopup,
  };
}
