import { apiClient } from './client.js';

/**
 * Create a new call. The backend is the source of truth for the
 * `roomId` (the human-shareable code) and for the internal `id` (UUID);
 * the client only sends optional `invitees` and the `visibility` mode.
 *
 * @param {{
 *   invitees?: string[],
 *   visibility?: 'private' | 'link',
 * }} [payload]
 * @returns {Promise<{
 *   id: string,
 *   roomId: string,
 *   visibility: 'private' | 'link',
 *   createdAt?: string,
 * }>}
 */
export async function createCall(payload = {}) {
  const body = { visibility: 'link', ...payload };
  const { data } = await apiClient.post('/calls', body);
  return {
    ...normalizeCall(data),
    visibility: data?.visibility ?? 'link',
  };
}

/**
 * List the authenticated user's calls, sorted by createdAt desc.
 * Each entry is a lightweight summary; fetch the full record with
 * `getCall(id)` when needed.
 *
 * @param {{ status?: 'all' | 'pending' | 'active' | 'ended' }} [options]
 * @returns {Promise<Array<{
 *   id: string,
 *   roomId: string,
 *   status: 'pending' | 'active' | 'ended',
 *   visibility: 'private' | 'link',
 *   creatorId: string,
 *   createdAt: string,
 *   startedAt?: string,
 *   endedAt?: string,
 *   participantCount: number,
 * }>>}
 */
export async function listMyCalls(options = {}) {
  const params = {};
  if (options.status) params.status = options.status;
  const { data } = await apiClient.get('/calls/mine', { params });
  const calls = Array.isArray(data?.calls) ? data.calls : [];
  return calls.map((c) => ({
    id: c.id,
    roomId: c.roomId,
    status: c.status,
    visibility: c.visibility ?? 'link',
    creatorId: c.creatorId,
    createdAt: c.createdAt,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    participantCount: c.participantCount ?? 0,
  }));
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
 * Fetch ICE servers (TURN/STUN credentials) scoped to a call. Returns a
 * list of `{ urls, username?, credential? }` entries compatible with
 * WebRTC. Accepts several response shapes for forward compatibility.
 *
 * @param {string} callId
 * @returns {Promise<Array<{ urls: string|string[], username?: string, credential?: string }>>}
 */
export async function getIceServers(callId) {
  if (!callId) throw new Error('callId is required');
  const { data } = await apiClient.get(
    `/calls/${encodeURIComponent(callId)}/turn-credentials`,
  );
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
    const { data } = await apiClient.post(
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
