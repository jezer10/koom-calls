import { getCurrentInstance, onBeforeUnmount, ref, shallowRef } from 'vue';

function tryOnUnmount(fn) {
  const inst = getCurrentInstance();
  if (inst) onBeforeUnmount(fn);
}

export function useMediaDevices() {
  const stream = shallowRef(null);
  const cameraOn = ref(false);
  const microphoneOn = ref(false);
  const error = ref(null);

  function isMissingDeviceError(err) {
    return (
      err?.name === 'NotFoundError' ||
      err?.name === 'OverconstrainedError' ||
      err?.message === 'Requested device not found'
    );
  }

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
      let next;
      try {
        next = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        const shouldRetry =
          isMissingDeviceError(err) && (opts.videoDeviceId || opts.audioDeviceId);
        if (!shouldRetry) throw err;
        next = await navigator.mediaDevices.getUserMedia({
          video: opts.video ?? true,
          audio: opts.audio ?? true,
        });
      }
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
    let next;
    try {
      next = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (!isMissingDeviceError(err)) throw err;
      next = await navigator.mediaDevices.getUserMedia({ video, audio });
    }
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
