<template>
  <section
    class="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4"
    data-testid="auth-prompt"
  >
    <h3 class="text-sm font-semibold text-gray-700">
      {{ title }}
    </h3>
    <p
      v-if="description"
      class="text-xs text-gray-500"
    >
      {{ description }}
    </p>
    <p
      v-if="!providers.length && !loadingProviders"
      class="text-xs text-gray-500"
    >
      No hay providers de autenticación configurados.
    </p>
    <GoogleSignInButton
      v-if="googleProvider"
      :return-to="returnTo"
      data-testid="auth-prompt-google"
      @signed-in="onSignedIn"
      @error="onAuthError"
    />
    <button
      v-if="showAnonymous && anonymousProvider"
      class="rounded-full bg-gray-200 px-4 py-2 text-sm font-medium"
      data-testid="auth-prompt-anonymous"
      :disabled="loading"
      @click="onAnonymousLogin"
    >
      {{ anonymousLabel }}
    </button>
    <p
      v-if="errorMessage"
      class="text-sm text-red-600"
      data-testid="auth-prompt-error"
      role="alert"
    >
      {{ errorMessage }}
    </p>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import GoogleSignInButton from './GoogleSignInButton.vue';
import { anonymousLogin, getProviders } from '../api/auth.js';
import { useUserStore } from '../stores/user.js';

defineProps({
  title: { type: String, default: 'Iniciá sesión para entrar' },
  description: { type: String, default: '' },
  anonymousLabel: { type: String, default: 'Continuar como invitado' },
  returnTo: { type: String, default: '' },
  showAnonymous: { type: Boolean, default: true },
});
const emit = defineEmits(['signed-in', 'error']);

const user = useUserStore();
const providers = ref([]);
const loading = ref(false);
const loadingProviders = ref(false);
const errorMessage = ref('');

const googleProvider = computed(() => providers.value.find((p) => p.name === 'google'));
const anonymousProvider = computed(() =>
  providers.value.find((p) => p.name === 'anonymous'),
);

async function loadProviders() {
  loadingProviders.value = true;
  try {
    providers.value = await getProviders();
  } catch {
    providers.value = [];
  } finally {
    loadingProviders.value = false;
  }
}

function onSignedIn(u) {
  errorMessage.value = '';
  emit('signed-in', u ?? user.profile);
}

function onAuthError(message) {
  errorMessage.value = message || 'No se pudo iniciar sesión con Google';
  emit('error', errorMessage.value);
}

async function onAnonymousLogin() {
  if (loading.value) return;
  loading.value = true;
  try {
    const u = await anonymousLogin({ displayName: 'Guest' });
    user.setProfile(u);
    errorMessage.value = '';
    emit('signed-in', u);
  } catch (err) {
    errorMessage.value =
      err?.response?.data?.message ?? err?.message ?? 'No se pudo iniciar sesión como invitado';
    emit('error', errorMessage.value);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadProviders();
});

// Clear stale errors when the parent swaps the prompt or the user signs in.
watch(
  () => user.isAuthenticated,
  (signedIn) => {
    if (signedIn) errorMessage.value = '';
  },
);
</script>
