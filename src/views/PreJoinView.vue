<template>
  <div
    class="flex h-screen w-screen flex-col bg-indigo-50"
    data-testid="pre-join-view"
  >
    <AppNav />
    <main class="flex flex-1 items-center justify-center p-6">
      <div
        class="flex w-full max-w-3xl flex-col gap-6 rounded-3xl bg-white p-6 shadow"
      >
        <header class="flex items-baseline justify-between">
          <h2 class="text-2xl font-bold">Configurá tu audio y video</h2>
          <span class="text-sm text-gray-500" data-testid="pre-join-room">
            Sala: {{ props.roomId }}
          </span>
        </header>

        <AuthPrompt
          v-if="!user.isAuthenticated"
          data-testid="pre-join-auth"
          :return-to="returnTo"
          @signed-in="onSignedIn"
          @error="onAuthError"
        />

        <div
          class="relative aspect-video w-full overflow-hidden rounded-2xl bg-black"
          data-testid="preview-container"
        >
          <video
            ref="videoEl"
            autoplay
            playsinline
            muted
            class="h-full w-full object-cover"
            data-testid="preview-video"
          />
          <p
            v-if="!hasVideoPreview"
            class="absolute inset-0 flex items-center justify-center text-sm text-gray-200"
            data-testid="preview-empty"
          >
            Sin vista previa de video
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1 text-sm" data-testid="camera-select-wrap">
            <span class="font-medium">Cámara</span>
            <select
              v-model="selectedCameraId"
              class="rounded border bg-white px-2 py-1"
              data-testid="camera-select"
              @change="onCameraChange"
            >
              <option v-if="cameras.length === 0" value="">
                No se detectaron cámaras
              </option>
              <option
                v-for="cam in cameras"
                :key="cam.deviceId"
                :value="cam.deviceId"
              >
                {{ cam.label || 'Cámara sin nombre' }}
              </option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm" data-testid="microphone-select-wrap">
            <span class="font-medium">Micrófono</span>
            <select
              v-model="selectedMicrophoneId"
              class="rounded border bg-white px-2 py-1"
              data-testid="microphone-select"
              @change="onMicrophoneChange"
            >
              <option v-if="microphones.length === 0" value="">
                No se detectaron micrófonos
              </option>
              <option
                v-for="mic in microphones"
                :key="mic.deviceId"
                :value="mic.deviceId"
              >
                {{ mic.label || 'Micrófono sin nombre' }}
              </option>
            </select>
          </label>
        </div>

        <p
          v-if="warningMessage"
          class="text-sm text-amber-600"
          data-testid="pre-join-warning"
        >
          {{ warningMessage }}
        </p>

        <div class="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            class="rounded-full bg-gray-300 px-5 py-2 font-medium"
            data-testid="pre-join-cancel"
            @click="cancel"
          >
            Cancelar
          </button>
          <button
            class="rounded-full bg-red-900 px-5 py-2 font-bold text-white hover:bg-red-800"
            data-testid="pre-join-enter"
            :disabled="!user.isAuthenticated"
            @click="enter"
          >
            Entrar a la sala
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppNav from '../components/AppNav.vue';
import AuthPrompt from '../components/AuthPrompt.vue';
import { useDeviceList, useDevicePreview } from '../composables/useDeviceList.js';
import { useUserStore } from '../stores/user.js';

const props = defineProps({
  roomId: { type: String, required: true },
});

const route = useRoute();
const router = useRouter();
const user = useUserStore();
const deviceList = useDeviceList();
const preview = useDevicePreview();
const returnTo = computed(() => route.fullPath);

function onSignedIn() {
  // The auth prompt already wrote the profile into the user store; this
  // is a hook for any future view-level side effects (telemetry, etc).
}

function onAuthError(message) {
  // The auth prompt already displays the error. We log it here so the
  // view-level `warning` channel stays free for non-auth issues.
  if (message) console.warn('[pre-join] auth error:', message);
}

const {
  cameras,
  microphones,
  selectedCameraId,
  selectedMicrophoneId,
  error: deviceError,
  refresh,
  startListening,
  selectCamera,
  selectMicrophone,
} = deviceList;

const videoEl = ref(null);
const warningMessage = ref('');

const hasVideoPreview = computed(() => Boolean(preview.stream.value));

watch(preview.stream, (next) => {
  const el = videoEl.value;
  if (!el) return;
  el.srcObject = next ?? null;
});

async function startPreview() {
  const stream = await preview.start({
    videoDeviceId: selectedCameraId.value || undefined,
    audioDeviceId: selectedMicrophoneId.value || undefined,
  });
  if (!stream) {
    warningMessage.value =
      'No se pudo acceder a la cámara o al micrófono. Podés entrar igual y configurar más tarde.';
    return;
  }
  const hasVideo = stream.getVideoTracks().length > 0;
  if (!hasVideo) {
    warningMessage.value =
      'No hay cámara disponible. Podés entrar igual y usar solo audio.';
  } else {
    warningMessage.value = '';
  }
}

async function onCameraChange() {
  selectCamera(selectedCameraId.value);
  await startPreview();
}

async function onMicrophoneChange() {
  selectMicrophone(selectedMicrophoneId.value);
  await startPreview();
}

onMounted(async () => {
  startListening();
  await refresh();
  // Resolve the session via the user store; the httpOnly cookie makes
  // the backend the source of truth, not sessionStorage. AppNav kicks
  // off the same call at app boot, so this is usually a cache hit.
  await user.loadSession();
  // Only request camera/mic once the user has a session, so we don't
  // burn a permission prompt on someone who still has to authenticate.
  if (user.isAuthenticated) await startPreview();
  if (deviceError.value) {
    warningMessage.value = deviceError.value;
  }
});

// If the user signs in via anonymous login (no page reload), start the
// preview as soon as the session is available. OAuth goes through a
// hard reload via `returnTo`, so this branch mainly covers guest flow.
watch(
  () => user.isAuthenticated,
  async (signedIn, wasSignedIn) => {
    if (signedIn && !wasSignedIn && !preview.stream.value) {
      await startPreview();
    }
  },
);

onBeforeUnmount(() => {
  preview.stop();
  deviceList.stopListening();
});

function cancel() {
  router.push({ name: 'home' });
}

function enter() {
  preview.stop();
  router.push({
    name: 'room',
    params: { roomId: props.roomId },
    query: {
      videoDeviceId: selectedCameraId.value,
      audioDeviceId: selectedMicrophoneId.value,
    },
  });
}
</script>
