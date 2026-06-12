<template>
  <div class="flex h-screen w-screen flex-col bg-indigo-50">
    <AppNav />
    <main class="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto p-10">
      <h1 class="text-5xl font-bold">
        Welcome to Koom CALLS!
      </h1>

      <div class="flex w-full max-w-md flex-col gap-6">
        <p
          v-if="!user.isAuthenticated"
          class="text-center text-sm text-gray-600"
          data-testid="home-signed-out-hint"
        >
          Iniciá sesión con Google para crear una reunión. Para unirte solo
          necesitás el código de sala.
        </p>

        <div class="flex flex-col gap-4">
          <button
            class="rounded-full bg-red-900 py-4 text-2xl font-bold text-white hover:bg-red-800 focus:ring-4 focus:ring-purple-900"
            data-testid="open-join"
            :disabled="creating"
            @click="showJoin = true"
          >
            JOIN ROOM
          </button>
          <button
            class="rounded-full bg-red-900 py-4 text-2xl font-bold text-white hover:bg-red-800 focus:ring-4 focus:ring-purple-900"
            data-testid="create-room"
            :disabled="creating"
            @click="onCreateClick"
          >
            {{ creating ? 'CREANDO…' : 'CREATE NEW ROOM' }}
          </button>
        </div>

        <AuthPrompt
          v-if="showCreateAuth"
          data-testid="home-create-auth"
          title="Necesitás iniciar sesión para crear una reunión"
          description="Usá tu cuenta de Google para continuar."
          :show-anonymous="false"
          :return-to="returnTo"
          @signed-in="onCreateAuthSucceeded"
          @error="onCreateAuthError"
        />

        <p
          v-if="homeError"
          class="text-center text-sm text-red-600"
          data-testid="home-error"
        >
          {{ homeError }}
        </p>

        <section
          v-if="user.isAuthenticated"
          class="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4"
          data-testid="my-calls"
        >
          <header class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-gray-700">
              Tus reuniones activas
            </h2>
            <button
              type="button"
              class="text-xs text-indigo-600 hover:underline disabled:text-gray-400"
              data-testid="my-calls-refresh"
              :disabled="loadingCalls"
              @click="loadMyCalls"
            >
              {{ loadingCalls ? 'Cargando…' : 'Actualizar' }}
            </button>
          </header>
          <p
            v-if="loadingCalls && activeCalls.length === 0"
            class="text-xs text-gray-500"
          >
            Cargando reuniones…
          </p>
          <p
            v-else-if="activeCalls.length === 0"
            class="text-xs text-gray-500"
            data-testid="my-calls-empty"
          >
            No tenés reuniones activas. Creá una para empezar.
          </p>
          <ul
            v-else
            class="flex flex-col gap-2"
            data-testid="my-calls-list"
          >
            <li
              v-for="call in activeCalls"
              :key="call.id"
              class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3"
              :data-testid="`my-call-${call.id}`"
            >
              <div class="flex flex-col">
                <span class="font-mono text-sm">{{ call.roomId }}</span>
                <span class="text-xs text-gray-500">
                  {{ call.participantCount }} participante{{ call.participantCount === 1 ? '' : 's' }}
                  · {{ formatRelative(call.createdAt) }}
                </span>
              </div>
              <button
                type="button"
                class="rounded-full bg-red-900 px-3 py-1 text-xs font-bold text-white hover:bg-red-800"
                :data-testid="`my-call-enter-${call.id}`"
                @click="enterCall(call)"
              >
                Entrar
              </button>
            </li>
          </ul>
        </section>
      </div>
    </main>
    <JoinModal
      v-if="showJoin"
      :validate="validateRoomCode"
      @close="showJoin = false"
      @join="joinRoom"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppNav from '../components/AppNav.vue';
import AuthPrompt from '../components/AuthPrompt.vue';
import JoinModal from '../components/JoinModal.vue';
import { createCall, listMyCalls } from '../api/calls.js';
import { useRoomStore } from '../stores/room.js';
import { useUserStore } from '../stores/user.js';

const router = useRouter();
const route = useRoute();
const user = useUserStore();
const room = useRoomStore();
const showJoin = ref(false);
const showCreateAuth = ref(false);
const creating = ref(false);
const homeError = ref('');
const loadingCalls = ref(false);
const allCalls = ref([]);

const ROOM_CODE_RE = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;

const returnTo = computed(() => {
  const next = typeof route.query.next === 'string' ? route.query.next : route.fullPath;
  return next || '/';
});

const activeCalls = computed(() =>
  allCalls.value.filter((c) => c.status !== 'ended'),
);

function validateRoomCode(value) {
  return ROOM_CODE_RE.test(value) || 'Formato esperado: XXX-XXX-XXX';
}

function joinRoom(code) {
  showJoin.value = false;
  const upper = code.toUpperCase();
  if (!validateRoomCode(upper) === true) return;
  room.setCall({ id: null, roomId: upper });
  router.push({ name: 'prejoin', params: { roomId: upper } });
}

function onCreateClick() {
  if (creating.value) return;
  if (!user.isAuthenticated) {
    showCreateAuth.value = true;
    homeError.value = '';
    return;
  }
  createRoom();
}

async function createRoom() {
  if (creating.value) return;
  creating.value = true;
  homeError.value = '';
  try {
    const call = await createCall();
    room.setCall({ id: call.id, roomId: call.roomId });
    await loadMyCalls();
    router.push({ name: 'prejoin', params: { roomId: call.roomId } });
  } catch (err) {
    homeError.value =
      err?.response?.data?.message ?? err?.message ?? 'No se pudo crear la reunión';
  } finally {
    creating.value = false;
  }
}

function onCreateAuthSucceeded() {
  showCreateAuth.value = false;
  // Only kick off the create flow if the user explicitly asked for it;
  // other sign-ins (e.g. triggered by AppNav) should not auto-create a room.
  createRoom();
}

function onCreateAuthError(message) {
  if (message) homeError.value = message;
}

function enterCall(call) {
  room.setCall({ id: call.id, roomId: call.roomId });
  router.push({ name: 'prejoin', params: { roomId: call.roomId } });
}

async function loadMyCalls() {
  if (!user.isAuthenticated) return;
  loadingCalls.value = true;
  homeError.value = '';
  try {
    allCalls.value = await listMyCalls();
  } catch (err) {
    homeError.value =
      err?.response?.data?.message ?? err?.message ?? 'No se pudo obtener el listado';
  } finally {
    loadingCalls.value = false;
  }
}

// Refresh the meeting list whenever the user transitions to signed-in.
// We intentionally do NOT auto-resume a `?next=...` from the router here:
// the bouncer that used to redirect is gone now that prejoin/room are
// public, so the only reason to land on `?next=...` is a legacy link.
watch(
  () => user.isAuthenticated,
  async (signedIn, wasSignedIn) => {
    if (signedIn && !wasSignedIn) {
      await loadMyCalls();
    }
  },
);

function formatRelative(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.round(hr / 24);
  return `hace ${day} d`;
}

onMounted(async () => {
  await user.loadSession();
  if (user.isAuthenticated) {
    await loadMyCalls();
  }
});
</script>
