import { getCurrentInstance, onBeforeUnmount, ref, shallowRef } from 'vue';
import { APP_CONFIG } from '../config.js';

function tryOnUnmount(fn) {
  const inst = getCurrentInstance();
  if (inst) onBeforeUnmount(fn);
}

export function useMediaDevices() {
  const stream = shallowRef(null);
  const cameraOn = ref(false);
  const microphoneOn = ref(false);
  const error = ref(null);

  /**
   * Build a getUserMedia constraints object from the requested video/audio
   * flags and the explicit deviceIds selected in the UI.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.video]
   * @param {boolean} [opts.audio]
   * @param {string} [opts.videoDeviceId]
   * @param {string} [opts.audioDeviceId]
   */
  function buildConstraints({
    video = true,
    audio = true,
    videoDeviceId,
    audioDeviceId,
  } = {}) {
    const v = video
      ? videoDeviceId
        ? { deviceId: { exact: videoDeviceId } }
        : true
      : false;
    const a = audio
      ? audioDeviceId
        ? { deviceId: { exact: audioDeviceId } }
        : true
      : false;
    return { video: v, audio: a };
  }

  async function start(opts = {}) {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('mediaDevices.getUserMedia is not available');
      }
      const constraints = buildConstraints(opts);
      const next = await navigator.mediaDevices.getUserMedia(constraints);
      stop();
      stream.value = next;
      cameraOn.value = next.getVideoTracks().length > 0;
      microphoneOn.value = next.getAudioTracks().length > 0;
      return next;
    } catch (err) {
      error.value = err?.message ?? String(err);
      throw err;
    }
  }

  /**
   * Replace the audio or video track in the local stream and stop the old
   * one. Returns the new MediaStreamTrack or `null` when video is being
   * disabled and no replacement is available.
   *
   * @param {'audio'|'video'} kind
   * @param {string} [deviceId]
   * @returns {Promise<MediaStreamTrack|null>}
   */
  async function switchDevice(kind, deviceId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('mediaDevices.getUserMedia is not available');
    }
    const audio = kind === 'audio';
    const video = kind === 'video';
    const constraints = buildConstraints({
      video,
      audio,
      videoDeviceId: video ? deviceId : undefined,
      audioDeviceId: audio ? deviceId : undefined,
    });
    const next = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = audio
      ? next.getAudioTracks()[0] ?? null
      : next.getVideoTracks()[0] ?? null;

    if (!stream.value) {
      stream.value = next;
      cameraOn.value = next.getVideoTracks().length > 0;
      microphoneOn.value = next.getAudioTracks().length > 0;
      return newTrack;
    }

    const currentTracks = audio
      ? stream.value.getAudioTracks()
      : stream.value.getVideoTracks();
    for (const old of currentTracks) {
      stream.value.removeTrack(old);
      try {
        old.stop();
      } catch {
        /* ignore */
      }
    }
    if (newTrack) stream.value.addTrack(newTrack);
    if (audio) microphoneOn.value = Boolean(newTrack);
    else cameraOn.value = Boolean(newTrack);
    return newTrack;
  }

  function stop() {
    if (stream.value) {
      stream.value.getTracks().forEach((track) => track.stop());
      stream.value = null;
    }
    cameraOn.value = false;
    microphoneOn.value = false;
  }

  function toggleCamera() {
    if (!stream.value) {
      return start();
    }
    const tracks = stream.value.getVideoTracks();
    if (tracks.length === 0) return false;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = next));
    cameraOn.value = next;
    return next;
  }

  function toggleMicrophone() {
    if (!stream.value) {
      return start();
    }
    const tracks = stream.value.getAudioTracks();
    if (tracks.length === 0) return false;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = next));
    microphoneOn.value = next;
    return next;
  }

  tryOnUnmount(() => stop());

  return { stream, cameraOn, microphoneOn, error, start, stop, switchDevice, toggleCamera, toggleMicrophone };
}

export function useWebRTC() {
  const peers = shallowRef(new Map());
  const localStream = shallowRef(null);
  const remoteStreams = shallowRef(new Map());
  const error = ref(null);

  function createPeerConnection(remoteSocketId) {
    const pc = new RTCPeerConnection({ iceServers: APP_CONFIG.iceServers });
    if (localStream.value) {
      localStream.value.getTracks().forEach((track) => pc.addTrack(track, localStream.value));
    }
    pc.ontrack = (event) => {
      const incoming = event.streams[0] ?? new MediaStream([event.track]);
      const next = new Map(remoteStreams.value);
      next.set(remoteSocketId, incoming);
      remoteStreams.value = next;
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        return event.candidate;
      }
      return null;
    };
    return pc;
  }

  async function createOffer(remoteSocketId) {
    const pc = createPeerConnection(remoteSocketId);
    const next = new Map(peers.value);
    next.set(remoteSocketId, pc);
    peers.value = next;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return { pc, offer };
  }

  async function handleOffer(remoteSocketId, offer) {
    const pc = createPeerConnection(remoteSocketId);
    const next = new Map(peers.value);
    next.set(remoteSocketId, pc);
    peers.value = next;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return { pc, answer };
  }

  async function handleAnswer(remoteSocketId, answer) {
    const pc = peers.value.get(remoteSocketId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async function addIceCandidate(remoteSocketId, candidate) {
    const pc = peers.value.get(remoteSocketId);
    if (!pc || !candidate) return;
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  function getIceCandidates(remoteSocketId) {
    const pc = peers.value.get(remoteSocketId);
    if (!pc) return [];
    const collected = [];
    pc.onicecandidate = (event) => {
      if (event.candidate) collected.push(event.candidate);
    };
    return collected;
  }

  function setLocalStream(stream) {
    localStream.value = stream;
  }

  /**
   * Replace the local audio/video track in every active peer connection.
   * Used when the user switches device in-call (P2P transport only).
   *
   * @param {'audio'|'video'} kind
   * @param {MediaStreamTrack|null} newTrack
   */
  async function replaceLocalTrack(kind, newTrack) {
    if (!newTrack && kind === 'video') {
      for (const pc of peers.value.values()) {
        const senders = pc.getSenders?.().filter((s) => s.track?.kind === 'video') ?? [];
        for (const sender of senders) {
          try {
            await sender.replaceTrack(null);
          } catch {
            /* ignore */
          }
        }
      }
      return;
    }
    for (const pc of peers.value.values()) {
      const senders = pc.getSenders?.() ?? [];
      for (const sender of senders) {
        if (sender.track?.kind === kind) {
          try {
            await sender.replaceTrack(newTrack);
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  function closePeer(remoteSocketId) {
    const pc = peers.value.get(remoteSocketId);
    if (pc) pc.close();
    const nextPeers = new Map(peers.value);
    nextPeers.delete(remoteSocketId);
    peers.value = nextPeers;
    const nextStreams = new Map(remoteStreams.value);
    nextStreams.delete(remoteSocketId);
    remoteStreams.value = nextStreams;
  }

  function closeAll() {
    for (const pc of peers.value.values()) pc.close();
    peers.value = new Map();
    remoteStreams.value = new Map();
  }

  tryOnUnmount(() => closeAll());

  return {
    peers,
    localStream,
    remoteStreams,
    error,
    setLocalStream,
    replaceLocalTrack,
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    getIceCandidates,
    closePeer,
    closeAll,
  };
}
