import { getCurrentInstance, onBeforeUnmount, ref, shallowRef } from 'vue';
import { Room, RoomEvent, Track } from 'livekit-client';
import { APP_CONFIG } from '../config.js';

/**
 * @typedef {import('livekit-client').RemoteParticipant} RemoteParticipant
 * @typedef {import('livekit-client').LocalTrackPublication} LocalTrackPublication
 * @typedef {import('livekit-client').RemoteTrackPublication} RemoteTrackPublication
 * @typedef {import('livekit-client').Participant} Participant
 * @typedef {import('livekit-client').Track} LiveKitTrack
 */

/**
 * Create a reactive wrapper around a `livekit-client` Room.
 *
 * Lifecycle:
 *   - `connect({ url, token })` instantiates a `Room`, connects to the SFU,
 *     and subscribes to participant / track events.
 *   - `publishTrack(track, options?)` publishes a local track through the
 *     `LocalParticipant`.
 *   - `setCameraEnabled(enabled)` / `setMicrophoneEnabled(enabled)` toggle
 *     local publish state.
 *   - `disconnect()` releases all listeners, stops any local tracks it
 *     owns, and disconnects the room.
 *
 * The composable is SSR-safe: when no Vue instance is present, listeners
 * are still cleaned up by the caller via `disconnect()`.
 *
 * @param {object} [options]
 * @param {() => Room} [options.roomFactory] - factory for tests
 * @param {string} [options.defaultUrl] - default SFU URL
 * @returns {{
 *   room: import('vue').ShallowRef<Room|null>,
 *   state: import('vue').Ref<string>,
 *   remoteParticipants: import('vue').Ref<RemoteParticipant[]>,
 *   cameraEnabled: import('vue').Ref<boolean>,
 *   microphoneEnabled: import('vue').Ref<boolean>,
 *   error: import('vue').Ref<string|null>,
 *   connect: (opts: { url?: string, token: string }) => Promise<void>,
 *   disconnect: () => Promise<void>,
 *   publishTrack: (track: LiveKitTrack, options?: object) => Promise<LocalTrackPublication|undefined>,
 *   unpublishTrack: (track: LiveKitTrack) => Promise<void>,
 *   setCameraEnabled: (enabled: boolean) => Promise<void>,
 *   setMicrophoneEnabled: (enabled: boolean) => Promise<void>,
 * }}
 */
export function useLiveKitRoom(options = {}) {
  const roomFactory = options.roomFactory ?? defaultRoomFactory;
  const defaultUrl = options.defaultUrl ?? APP_CONFIG.sfuUrl;

  const room = shallowRef(null);
  const state = ref('idle');
  const remoteParticipants = ref([]);
  const cameraEnabled = ref(true);
  const microphoneEnabled = ref(true);
  const error = ref(null);

  const unsubscribers = [];

  function defaultRoomFactory() {
    return new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        simulcast: true,
      },
    });
  }

  function on(event, handler) {
    const r = room.value;
    if (!r) return;
    r.on(event, handler);
    unsubscribers.push(() => r.off(event, handler));
  }

  function clearListeners() {
    while (unsubscribers.length) {
      const off = unsubscribers.pop();
      try {
        off();
      } catch {
        /* ignore listener teardown errors */
      }
    }
  }

  function snapshotParticipants(r) {
    if (!r) return [];
    return Array.from(r.remoteParticipants?.values?.() ?? []);
  }

  /**
   * Connect to the SFU.
   * @param {{ url?: string, token: string }} opts
   */
  async function connect(opts) {
    if (!opts?.token) {
      throw new Error('LiveKit token is required');
    }
    if (room.value) {
      await disconnect();
    }
    const r = roomFactory();
    room.value = r;
    state.value = 'connecting';
    error.value = null;

    on(RoomEvent.Connected, () => {
      state.value = 'connected';
    });
    on(RoomEvent.Disconnected, () => {
      state.value = 'disconnected';
    });
    on(RoomEvent.Reconnecting, () => {
      state.value = 'reconnecting';
    });
    on(RoomEvent.Reconnected, () => {
      state.value = 'connected';
    });
    on(RoomEvent.ConnectionStateChanged, (next) => {
      state.value = String(next);
    });
    on(RoomEvent.ParticipantConnected, () => {
      remoteParticipants.value = snapshotParticipants(r);
    });
    on(RoomEvent.ParticipantDisconnected, () => {
      remoteParticipants.value = snapshotParticipants(r);
    });
    on(RoomEvent.TrackSubscribed, () => {
      remoteParticipants.value = snapshotParticipants(r);
    });
    on(RoomEvent.TrackUnsubscribed, () => {
      remoteParticipants.value = snapshotParticipants(r);
    });
    on(RoomEvent.MediaDevicesError, (err) => {
      error.value = err?.message ?? 'media devices error';
    });

    try {
      await r.connect(opts.url ?? defaultUrl, opts.token);
      remoteParticipants.value = snapshotParticipants(r);
    } catch (err) {
      state.value = 'disconnected';
      error.value = err?.message ?? String(err);
      clearListeners();
      room.value = null;
      throw err;
    }
  }

  /**
   * Publish a local track.
   * @param {LiveKitTrack} track
   * @param {object} [options]
   * @returns {Promise<LocalTrackPublication|undefined>}
   */
  async function publishTrack(track, options) {
    const r = room.value;
    if (!r) throw new Error('LiveKit room is not connected');
    if (!track) return undefined;
    return r.localParticipant.publishTrack(track, options);
  }

  async function unpublishTrack(track) {
    const r = room.value;
    if (!r || !track) return;
    await r.localParticipant.unpublishTrack(track);
  }

  async function setCameraEnabled(enabled) {
    const r = room.value;
    if (!r) {
      cameraEnabled.value = enabled;
      return;
    }
    await r.localParticipant.setCameraEnabled(enabled);
    cameraEnabled.value = enabled;
  }

  async function setMicrophoneEnabled(enabled) {
    const r = room.value;
    if (!r) {
      microphoneEnabled.value = enabled;
      return;
    }
    await r.localParticipant.setMicrophoneEnabled(enabled);
    microphoneEnabled.value = enabled;
  }

  async function disconnect() {
    const r = room.value;
    room.value = null;
    state.value = 'disconnected';
    remoteParticipants.value = [];
    clearListeners();
    if (r) {
      try {
        await r.disconnect();
      } catch {
        /* swallow disconnect errors during teardown */
      }
    }
  }

  const inst = getCurrentInstance();
  if (inst) {
    onBeforeUnmount(() => {
      disconnect();
    });
  }

  return {
    room,
    state,
    remoteParticipants,
    cameraEnabled,
    microphoneEnabled,
    error,
    connect,
    disconnect,
    publishTrack,
    unpublishTrack,
    setCameraEnabled,
    setMicrophoneEnabled,
  };
}

/**
 * Find a video or audio publication for a participant.
 *
 * @param {Participant} participant
 * @param {'video'|'audio'|'screen'} [source]
 * @returns {RemoteTrackPublication|LocalTrackPublication|undefined}
 */
export function findPublication(participant, source = 'video') {
  if (!participant) return undefined;
  const publications = Array.from(participant.trackPublications?.values?.() ?? []);
  if (source === 'video') {
    return (
      publications.find((p) => p.kind === Track.Kind.Video && !p.trackName?.startsWith?.('screen')) ??
      publications.find((p) => p.kind === Track.Kind.Video)
    );
  }
  if (source === 'screen') {
    return publications.find(
      (p) => p.kind === Track.Kind.Video && p.trackName?.startsWith?.('screen'),
    );
  }
  return publications.find((p) => p.kind === Track.Kind.Audio);
}
