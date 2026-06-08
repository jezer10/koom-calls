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

  async function start({ video = true, audio = true } = {}) {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('mediaDevices.getUserMedia is not available');
      }
      const next = await navigator.mediaDevices.getUserMedia({ video, audio });
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

  return { stream, cameraOn, microphoneOn, error, start, stop, toggleCamera, toggleMicrophone };
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
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    getIceCandidates,
    closePeer,
    closeAll,
  };
}
