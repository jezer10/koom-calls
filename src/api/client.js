import axios from 'axios';
import { APP_CONFIG } from '../config.js';

const TOKEN_STORAGE_KEY = 'koom:authToken';

function tokenStore() {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch {
    /* fall through */
  }
  return null;
}

export function getStoredToken() {
  const store = tokenStore();
  if (!store) return null;
  try {
    return store.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  const store = tokenStore();
  if (!store) return;
  try {
    if (token) {
      store.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      store.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    /* storage unavailable (SSR or disabled cookies); ignore */
  }
}

export const apiClient = axios.create({
  baseURL: APP_CONFIG.apiBaseUrl,
  timeout: 15000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      setStoredToken(null);
    }
    return Promise.reject(error);
  },
);

export default apiClient;
