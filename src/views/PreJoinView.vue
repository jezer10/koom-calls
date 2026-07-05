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
          <h2 class="text-2xl font-bold">
            Configurá tu audio y video
          </h2>
          <span
            class="text-sm text-gray-500"
            data-testid="pre-join-room"
          >
            Sala: {{ props.roomId }}
          </span>
        </header>

        <p
          v-if="bootStatus === 'guest'"
          class="text-sm text-gray-600"
          data-testid="pre-join-guest"
        >
          Vas a entrar como invitado. El organizador te verá con un nombre generado.
        </p>
        <p
          v-else-if="bootStatus === 'authenticating'"
          class="text-sm text-gray-500"
          data-testid="pre-join-boot"
        >
          Iniciando como invitado…
        </p>
        <p
          v-else-if="bootStatus === 'failed'"
          class="text-sm text-amber-700"
          data-testid="pre-join-boot-error"
        >
          No se pudo iniciar como invitado automáticamente.
        </p>

        <AuthPrompt
          v-if="bootStatus === 'failed' && !user.isAuthenticated"
          data-testid="pre-join-auth-fallback"
          title="Iniciá sesión para continuar"
          description="El ingreso como invitado no está disponible. Iniciá sesión con Google para entrar a la sala."
          :show-anonymous="false"
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
          <label
            class="flex flex-col gap-1 text-sm"
            data-testid="camera-select-wrap"
          >
            <span class="font-medium">Cámara</span>
            <select
              v-model="selectedCameraId"
              class="rounded border bg-white px-2 py-1"
              data-testid="camera-select"
              @change="onCameraChange"
            >
              <option
                v-if="cameras.length === 0"
                value=""
              >
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
          <label
            class="flex flex-col gap-1 text-sm"
            data-testid="microphone-select-wrap"
          >
            <span class="font-medium">Micrófono</span>
            <select
              v-model="selectedMicrophoneId"
              class="rounded border bg-white px-2 py-1"
              data-testid="microphone-select"
              @change="onMicrophoneChange"
            >
              <option
                v-if="microphones.length === 0"
                value=""
              >
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
            :disabled="!canEnter"
            @click="enter"
          >
            {{ canEnter ? 'Entrar a la sala' : bootButtonLabel }}
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
import { anonymousLogin } from '../api/auth.js';
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

const bootStatus = ref('idle');
const bootError = ref('');

const canEnter = computed(() => {
  if (bootStatus.value === 'authenticating') return false;
  if (bootStatus.value === 'failed') return Boolean(user.isAuthenticated);
  return Boolean(user.isAuthenticated);
});

const bootButtonLabel = computed(() => {
  if (bootStatus.value === 'authenticating') return 'Iniciando…';
  if (bootStatus.value === 'failed' && !user.isAuthenticated) {
    return 'Iniciá sesión para entrar';
  }
  return 'Entrar a la sala';
});

function onSignedIn() {
  // The auth prompt already wrote the profile into the user store; this
  // is a hook for any future view-level side effects (telemetry, etc).
}

function onAuthError(message) {
  if (message) {
    bootError.value = message;
    console.warn('[pre-join] auth error:', message);
  }
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
  const wantsVideo = cameras.value.length > 0;
  const wantsAudio = microphones.value.length > 0;
  if (!wantsVideo && !wantsAudio) {
    warningMessage.value =
      'No hay cámara ni micrófono disponibles. Podés entrar como oyente.';
    preview.stop();
    return;
  }
  const stream = await preview.start({
    videoDeviceId: wantsVideo ? selectedCameraId.value || undefined : undefined,
    audioDeviceId: wantsAudio ? selectedMicrophoneId.value || undefined : undefined,
  });
  if (!stream) {
    warningMessage.value =
      'No se pudo acceder a la cámara o al micrófono. Podés entrar igual como oyente.';
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

async function ensureSession() {
  // Resolve the session via the user store; the httpOnly cookie makes
  // the backend the source of truth, not sessionStorage. AppNav kicks
  // off the same call at app boot, so this is usually a cache hit.
  await user.loadSession();
  if (user.isAuthenticated) {
    bootStatus.value = 'guest';
    return;
  }
  // No session yet. Auto-login silently as a guest so the rest of the
  // flow (join call, get SFU token, signaling) can hit the protected
  // endpoints with a valid session cookie.
  bootStatus.value = 'authenticating';
  try {
    const profile = await anonymousLogin({ displayName: 'Guest' });
    user.setProfile(profile);
    bootStatus.value = 'guest';
  } catch (err) {
    const status = err?.response?.status;
    // 404 means anonymous login is disabled in this environment
    // (production-by-default). Fall back to a Google login prompt.
    bootStatus.value = 'failed';
    bootError.value =
      err?.response?.data?.message ??
      err?.message ??
      'No se pudo iniciar como invitado';
    if (status !== 404 && status !== 403) {
      console.warn('[pre-join] anonymous login failed:', err);
    }
  }
}

onMounted(async () => {
  startListening();
  await refresh();
  await ensureSession();
  // Only request camera/mic once we know the user has (or just got) a
  // session, so we don't burn a permission prompt on a still-anonymous
  // visitor who might bounce.
  if (user.isAuthenticated) await startPreview();
  if (deviceError.value) {
    warningMessage.value = deviceError.value;
  }
});

// If the user signs in via Google from the fallback prompt, kick the
// preview off and clear the failed state.
watch(
  () => user.isAuthenticated,
  async (signedIn, wasSignedIn) => {
    if (signedIn && !wasSignedIn) {
      bootStatus.value = 'guest';
      if (!preview.stream.value) {
        await startPreview();
      }
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
  if (!canEnter.value) return;
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
