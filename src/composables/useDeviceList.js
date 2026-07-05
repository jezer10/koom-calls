import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { getCurrentInstance } from 'vue';

function tryOnUnmount(fn) {
  const inst = getCurrentInstance();
  if (inst) onBeforeUnmount(fn);
}

/**
 * Reactive list of media input devices.
 *
 * `enumerateDevices()` returns devices with empty `deviceId` until the
 * user has granted at least one media permission, so the composable keeps a
 * transient `previewStream` that callers can start with `getUserMedia` to
 * reveal the real deviceIds. Once permission is granted we keep refreshing
 * the list on `devicechange`.
 *
 * @returns {{
 *   cameras: import('vue').Ref<MediaDeviceInfo[]>,
 *   microphones: import('vue').Ref<MediaDeviceInfo[]>,
 *   selectedCameraId: import('vue').Ref<string>,
 *   selectedMicrophoneId: import('vue').Ref<string>,
 *   ready: import('vue').Ref<boolean>,
 *   error: import('vue').Ref<string|null>,
 *   refresh: () => Promise<void>,
 *   selectCamera: (deviceId: string) => void,
 *   selectMicrophone: (deviceId: string) => void,
 * }}
 */
export function useDeviceList() {
  const cameras = ref([]);
  const microphones = ref([]);
  const speakers = ref([]);
  const selectedCameraId = ref('');
  const selectedMicrophoneId = ref('');
  const selectedSpeakerId = ref('');
  const selectedSpeakerLabel = ref('');
  const ready = ref(false);
  const error = ref(null);

  let listening = false;

  function syncSelection(selected, devices) {
    const current = selected.value;
    const hasCurrent = current && devices.some((device) => device.deviceId === current);
    if (hasCurrent) return;
    selected.value = devices[0]?.deviceId ?? '';
  }

  async function refresh() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      error.value = 'mediaDevices.enumerateDevices is not available';
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameras.value = devices.filter((d) => d.kind === 'videoinput');
      microphones.value = devices.filter((d) => d.kind === 'audioinput');
      speakers.value = devices.filter((d) => d.kind === 'audiooutput');

      syncSelection(selectedCameraId, cameras.value);
      syncSelection(selectedMicrophoneId, microphones.value);
      syncSelection(selectedSpeakerId, speakers.value);
      ready.value = true;
      error.value = null;
    } catch (err) {
      error.value = err?.message ?? String(err);
    }
  }

  function startListening() {
    if (listening) return;
    if (!navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    listening = true;
  }

  function stopListening() {
    if (!listening) return;
    if (!navigator.mediaDevices?.removeEventListener) return;
    navigator.mediaDevices.removeEventListener('devicechange', refresh);
    listening = false;
  }

  function selectCamera(deviceId) {
    selectedCameraId.value = deviceId;
  }

  function selectMicrophone(deviceId) {
    selectedMicrophoneId.value = deviceId;
  }

  function selectSpeaker(deviceId) {
    selectedSpeakerId.value = deviceId;
    const selected = speakers.value.find((device) => device.deviceId === deviceId);
    selectedSpeakerLabel.value = selected?.label ?? '';
  }

  function supportsSpeakerSelection() {
    return typeof navigator.mediaDevices?.selectAudioOutput === 'function';
  }

  async function pickSpeaker() {
    if (!supportsSpeakerSelection()) {
      throw new Error('mediaDevices.selectAudioOutput is not available');
    }
    const device = await navigator.mediaDevices.selectAudioOutput();
    selectedSpeakerId.value = device.deviceId ?? '';
    selectedSpeakerLabel.value = device.label ?? '';
    if (!speakers.value.some((speaker) => speaker.deviceId === device.deviceId)) {
      speakers.value = [...speakers.value, device];
    }
    return device;
  }

  tryOnUnmount(stopListening);

  return {
    cameras,
    microphones,
    speakers,
    selectedCameraId,
    selectedMicrophoneId,
    selectedSpeakerId,
    selectedSpeakerLabel,
    ready,
    error,
    refresh,
    startListening,
    stopListening,
    supportsSpeakerSelection,
    selectCamera,
    selectMicrophone,
    selectSpeaker,
    pickSpeaker,
  };
}

/**
 * Start a temporary preview stream using the given deviceIds. The stream
 * is used to (a) show a preview in the pre-join screen and (b) unlock real
 * `deviceId` values from `enumerateDevices()`. Callers must `stopPreview()`
 * when leaving the pre-join view.
 *
 * @returns {{
 *   stream: import('vue').ShallowRef<MediaStream|null>,
 *   start: (opts?: { videoDeviceId?: string, audioDeviceId?: string }) => Promise<MediaStream|null>,
 *   stop: () => void,
 * }}
 */
export function useDevicePreview() {
  const stream = shallowRef(null);

  async function start({ videoDeviceId, audioDeviceId } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    const constraints = {
      video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : false,
      audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : false,
    };
    try {
      const next = await navigator.mediaDevices.getUserMedia(constraints);
      stop();
      stream.value = next;
      return next;
    } catch {
      stop();
      return null;
    }
  }

  function stop() {
    if (stream.value) {
      stream.value.getTracks().forEach((t) => t.stop());
      stream.value = null;
    }
  }

  return { stream, start, stop };
}
