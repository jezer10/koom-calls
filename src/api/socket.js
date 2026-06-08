import { io } from 'socket.io-client';
import { defaultSignaling } from './signaling-client.js';

let socket = null;

/**
 * Get the singleton socket instance. If a `token` is provided (and no socket
 * exists yet) it is forwarded to socket.io's `auth` handshake so the
 * `/signaling` namespace can authenticate the JWT.
 *
 * @param {{ token?: string|null }} [options]
 * @returns {import('socket.io-client').Socket}
 */
export function getSocket(options = {}) {
  if (socket) return socket;
  socket = io(defaultSignaling.url, {
    transports: ['websocket'],
    autoConnect: false,
    auth: options.token ? { token: options.token } : {},
  });
  return socket;
}

export function resetSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
