import { apiClient } from './client.js';

/**
 * Create a new call (room). Backend may not implement this yet; if it 404s
 * the caller should treat it as "use existing call id".
 *
 * @param {{ displayName?: string }} [payload]
 * @returns {Promise<{ id: string, roomId: string, createdAt?: string }>}
 */
export async function createCall(payload = {}) {
  const { data } = await apiClient.post('/calls', payload);
  return normalizeCall(data);
}

/**
 * Fetch metadata for an existing call.
 *
 * @param {string} callId
 * @returns {Promise<{ id: string, roomId: string, createdAt?: string }>}
 */
export async function getCall(callId) {
  if (!callId) throw new Error('callId is required');
  const { data } = await apiClient.get(`/calls/${encodeURIComponent(callId)}`);
  return normalizeCall(data);
}

/**
 * Fetch ICE servers (TURN/STUN credentials). Returns a list of
 * `{ urls, username?, credential? }` entries compatible with WebRTC.
 *
 * @returns {Promise<Array<{ urls: string|string[], username?: string, credential?: string }>>}
 */
export async function getIceServers() {
  const { data } = await apiClient.get('/turn/credentials');
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.iceServers)) return data.iceServers;
  if (Array.isArray(data?.servers)) return data.servers;
  return [];
}

/**
 * Fetch a LiveKit access token for a call. The backend may not implement
 * this yet; when it 404s we generate a placeholder token locally so the SPA
 * can be developed and tested against a mock SFU or a non-authenticated
 * LiveKit dev server.
 *
 * @param {string} callId
 * @returns {Promise<{ token: string, url: string, identity: string, roomName: string, mocked: boolean }>}
 */
export async function getSfuToken(callId) {
  if (!callId) throw new Error('callId is required');
  try {
    const { data } = await apiClient.get(
      `/calls/${encodeURIComponent(callId)}/sfu-token`,
    );
    return {
      token: data?.token ?? '',
      url: data?.url ?? '',
      identity: data?.identity ?? '',
      roomName: data?.roomName ?? callId,
      mocked: false,
    };
  } catch (err) {
    const status = err?.response?.status;
    if (status === 404 || status === 501) {
      return synthesizeSfuToken(callId);
    }
    throw err;
  }
}

function normalizeCall(data) {
  if (!data) return { id: '', roomId: '' };
  const id = data.id ?? data.callId ?? data._id ?? '';
  const roomId = data.roomId ?? data.id ?? id;
  return { id, roomId, createdAt: data.createdAt };
}

function synthesizeSfuToken(callId) {
  const identity = `guest-${Math.random().toString(36).slice(2, 8)}`;
  const header = btoaSafe(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = btoaSafe(
    JSON.stringify({
      sub: identity,
      video: { room: callId, roomJoin: true, canPublish: true, canSubscribe: true },
      iat: Math.floor(Date.now() / 1000),
    }),
  );
  return {
    token: `${header}.${body}.mocked`,
    url: '',
    identity,
    roomName: callId,
    mocked: true,
  };
}

function btoaSafe(value) {
  if (typeof btoa === 'function') {
    return btoa(value).replace(/=+$/, '');
  }
  return Buffer.from(value, 'utf-8').toString('base64').replace(/=+$/, '');
}
