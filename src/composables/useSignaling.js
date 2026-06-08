import { getCurrentInstance, onBeforeUnmount, ref, shallowRef } from 'vue';
import { getSocket } from '../api/socket.js';

function tryOnUnmount(fn) {
  const inst = getCurrentInstance();
  if (inst) onBeforeUnmount(fn);
}

export function useSignaling() {
  const socketRef = shallowRef(getSocket());
  const connected = ref(false);
  const joined = ref(false);
  const roomId = ref(null);
  const selfSocketId = ref(null);
  const peers = ref([]);
  const error = ref(null);

  function attach() {
    const s = socketRef.value;
    s.on('connect', () => {
      connected.value = true;
    });
    s.on('disconnect', () => {
      connected.value = false;
      joined.value = false;
    });
    s.on('connect_error', (err) => {
      error.value = err.message;
    });
  }

  function detach() {
    const s = socketRef.value;
    s.off('connect');
    s.off('disconnect');
    s.off('connect_error');
  }

  function connect() {
    if (socketRef.value.connected) return;
    socketRef.value.connect();
  }

  function disconnect() {
    socketRef.value.disconnect();
    joined.value = false;
    peers.value = [];
  }

  function joinRoom(targetRoomId, userId) {
    if (!targetRoomId || !userId) {
      error.value = 'roomId and userId are required';
      return Promise.reject(new Error(error.value));
    }
    roomId.value = targetRoomId;
    connect();
    return new Promise((resolve, reject) => {
      const s = socketRef.value;
      const onExisting = (payload) => {
        s.off('exception', onError);
        const members = (payload?.members ?? []).concat({
          socketId: s.id,
          userId,
        });
        peers.value = members;
        joined.value = true;
        selfSocketId.value = s.id;
        resolve(payload);
      };
      const onError = (err) => {
        s.off('existing-users', onExisting);
        error.value = err?.message ?? 'join failed';
        reject(new Error(error.value));
      };
      s.once('existing-users', onExisting);
      s.once('exception', onError);
      s.emit('join', { roomId: targetRoomId, userId });
    });
  }

  function emitSignal(type, to, signal) {
    if (!roomId.value) return;
    socketRef.value.emit(type, { roomId: roomId.value, to, signal });
  }

  function onUserJoined(handler) {
    socketRef.value.on('user-joined', handler);
  }

  function onUserLeft(handler) {
    socketRef.value.on('user-left', handler);
  }

  function onSignal(handler) {
    socketRef.value.on('signal', handler);
  }

  function onException(handler) {
    socketRef.value.on('exception', handler);
  }

  function offAll() {
    const s = socketRef.value;
    s.off('user-joined');
    s.off('user-left');
    s.off('signal');
    s.off('exception');
  }

  attach();

  onBeforeUnmount(() => {
    offAll();
    detach();
    disconnect();
  });

  tryOnUnmount(() => {
    offAll();
    detach();
    disconnect();
  });

  return {
    socket: socketRef,
    connected,
    joined,
    roomId,
    selfSocketId,
    peers,
    error,
    connect,
    disconnect,
    joinRoom,
    emitSignal,
    onUserJoined,
    onUserLeft,
    onSignal,
    onException,
    offAll,
  };
}
