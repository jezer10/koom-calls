import { getCurrentInstance, onBeforeUnmount, ref, shallowRef } from 'vue';
import { getSocket, resetSocket } from '../api/socket.js';

/**
 * The set of socket event names used by the M2 control plane. Kept as a
 * frozen object so consumers can reference named constants instead of
 * typing strings.
 */
export const SIGNALING_EVENTS = Object.freeze({
  CallInvite: 'call:invite',
  CallRinging: 'call:ringing',
  CallAccept: 'call:accept',
  CallReject: 'call:reject',
  CallHangup: 'call:hangup',
  PeerJoined: 'peer:joined',
  PeerLeft: 'peer:left',
  SfuJoinRoom: 'sfu:join-room',
  SfuPublishTrack: 'sfu:publish-track',
  SfuSubscribeTrack: 'sfu:subscribe-track',
});

/**
 * Build the useSignaling composable.
 *
 * Wires the M2 control plane (`call:invite`, `peer:joined`, `sfu:join-room`, …)
 * listeners that simply populate reactive state for the rest of the SPA to
 * consume. Media goes through LiveKit SFU; there is no P2P fallback.
 *
 * @param {object} [options]
 * @param {string|null} [options.token=null] - JWT for namespace handshake
 * @returns {object}
 */
export function useSignaling(options = {}) {
  const token = options.token ?? null;
  const socketRef = shallowRef(getSocket({ token }));
  const connected = ref(false);
  const joined = ref(false);
  const roomId = ref(null);
  const selfSocketId = ref(null);
  const peers = ref([]);
  const error = ref(null);
  const callState = ref('idle');
  const activeCallId = ref(null);
  const sfuRoom = ref(null);

  function attach() {
    const s = socketRef.value;
    s.on('connect', () => {
      connected.value = true;
      selfSocketId.value = s.id ?? null;
    });
    s.on('disconnect', () => {
      connected.value = false;
      joined.value = false;
    });
    s.on('connect_error', (err) => {
      error.value = err?.message ?? 'connect_error';
    });
    s.on(SIGNALING_EVENTS.PeerJoined, (payload) => {
      if (!payload) return;
      const id = payload.userId ?? payload.identity ?? payload.socketId;
      if (!id) return;
      if (!peers.value.find((p) => p.userId === id || p.socketId === id)) {
        peers.value = [...peers.value, { socketId: id, userId: id }];
      }
    });
    s.on(SIGNALING_EVENTS.PeerLeft, (payload) => {
      const id = payload?.userId ?? payload?.identity ?? payload?.socketId;
      if (!id) return;
      peers.value = peers.value.filter(
        (p) => p.userId !== id && p.socketId !== id,
      );
    });
    s.on(SIGNALING_EVENTS.CallRinging, (payload) => {
      if (payload?.callId) activeCallId.value = payload.callId;
      callState.value = 'ringing';
    });
    s.on(SIGNALING_EVENTS.CallAccept, (payload) => {
      if (payload?.callId) activeCallId.value = payload.callId;
      callState.value = 'accepted';
    });
    s.on(SIGNALING_EVENTS.CallReject, () => {
      callState.value = 'rejected';
    });
    s.on(SIGNALING_EVENTS.CallHangup, () => {
      callState.value = 'ended';
      activeCallId.value = null;
    });
    s.on(SIGNALING_EVENTS.SfuJoinRoom, (payload) => {
      if (payload?.room) sfuRoom.value = payload.room;
    });
  }

  function detach() {
    const s = socketRef.value;
    s.off('connect');
    s.off('disconnect');
    s.off('connect_error');
    for (const evt of Object.values(SIGNALING_EVENTS)) {
      s.off(evt);
    }
  }

  function connect() {
    const s = socketRef.value;
    if (s.connected) return;
    s.connect();
  }

  function connectWithToken(token) {
    if (!token) return connect();
    resetSocket();
    socketRef.value = getSocket({ token });
    attach();
    return connect();
  }

  function disconnect() {
    socketRef.value.disconnect();
    joined.value = false;
    peers.value = [];
    callState.value = 'idle';
    activeCallId.value = null;
    sfuRoom.value = null;
  }

  /**
   * Join a room on the control plane.
   *
   * @param {string} targetRoomId
   * @param {string} userId
   * @returns {Promise<object>}
   */
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

  function onCallInvite(handler) {
    socketRef.value.on(SIGNALING_EVENTS.CallInvite, handler);
  }
  function onCallRinging(handler) {
    socketRef.value.on(SIGNALING_EVENTS.CallRinging, handler);
  }
  function onCallAccept(handler) {
    socketRef.value.on(SIGNALING_EVENTS.CallAccept, handler);
  }
  function onCallHangup(handler) {
    socketRef.value.on(SIGNALING_EVENTS.CallHangup, handler);
  }
  function onPeerJoined(handler) {
    socketRef.value.on(SIGNALING_EVENTS.PeerJoined, handler);
  }
  function onPeerLeft(handler) {
    socketRef.value.on(SIGNALING_EVENTS.PeerLeft, handler);
  }
  function onSfuJoinRoom(handler) {
    socketRef.value.on(SIGNALING_EVENTS.SfuJoinRoom, handler);
  }
  function onSfuPublishTrack(handler) {
    socketRef.value.on(SIGNALING_EVENTS.SfuPublishTrack, handler);
  }
  function onSfuSubscribeTrack(handler) {
    socketRef.value.on(SIGNALING_EVENTS.SfuSubscribeTrack, handler);
  }
  function offAll() {
    const s = socketRef.value;
    for (const evt of Object.values(SIGNALING_EVENTS)) {
      s.off(evt);
    }
  }

  function emitSfuJoinRoom(payload) {
    socketRef.value.emit(SIGNALING_EVENTS.SfuJoinRoom, payload);
  }
  function emitSfuPublishTrack(payload) {
    socketRef.value.emit(SIGNALING_EVENTS.SfuPublishTrack, payload);
  }
  function emitCallInvite(payload) {
    socketRef.value.emit(SIGNALING_EVENTS.CallInvite, payload);
  }

  attach();

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      offAll();
      detach();
      disconnect();
    });
  }

  return {
    socket: socketRef,
    connected,
    joined,
    roomId,
    selfSocketId,
    peers,
    error,
    callState,
    activeCallId,
    sfuRoom,
    connect,
    connectWithToken,
    disconnect,
    joinRoom,
    onCallInvite,
    onCallRinging,
    onCallAccept,
    onCallHangup,
    onPeerJoined,
    onPeerLeft,
    onSfuJoinRoom,
    onSfuPublishTrack,
    onSfuSubscribeTrack,
    offAll,
    emitSfuJoinRoom,
    emitSfuPublishTrack,
    emitCallInvite,
  };
}

export { resetSocket };
