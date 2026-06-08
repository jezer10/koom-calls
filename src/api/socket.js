import { io } from 'socket.io-client';
import { defaultSignaling } from './signaling-client.js';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(defaultSignaling.url, {
      transports: ['websocket'],
      autoConnect: false,
    });
  }
  return socket;
}

export function resetSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
