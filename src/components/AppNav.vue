<template>
  <nav class="h-16 w-full bg-red-900 flex items-center justify-between px-6">
    <router-link to="/" class="text-3xl font-bold text-white tracking-wide">
      KOOM
    </router-link>
    <div class="flex items-center gap-3 text-white" data-testid="app-nav-session">
      <template v-if="session">
        <img
          v-if="session.picture"
          :src="session.picture"
          :alt="session.displayName"
          class="h-10 w-10 rounded-full object-cover border border-white/30"
          data-testid="app-nav-avatar"
          referrerpolicy="no-referrer"
        />
        <div
          v-else
          class="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white"
          data-testid="app-nav-initial"
        >
          {{ initial }}
        </div>
        <div class="flex flex-col leading-tight">
          <span
            class="font-extrabold"
            data-testid="app-nav-name"
          >{{ session.displayName || 'Invitado' }}</span>
          <span
            v-if="session.email"
            class="text-xs text-white/70"
            data-testid="app-nav-email"
          >{{ session.email }}</span>
          <span
            v-else
            class="text-xs text-white/70"
            data-testid="app-nav-provider"
          >{{ providerLabel }}</span>
        </div>
        <button
          type="button"
          class="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white hover:bg-white/25"
          data-testid="app-nav-signout"
          @click="onSignOut"
        >
          Cambiar
        </button>
      </template>
      <template v-else>
        <div
          class="h-10 w-10 rounded-full bg-white bg-contain bg-center"
          :style="{ backgroundImage: `url(${logo})` }"
        />
        <span class="font-extrabold">Invitado</span>
      </template>
    </div>
  </nav>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useUserStore } from '../stores/user.js';
import { logout } from '../api/auth.js';
import logo from '../assets/logo.png';

const user = useUserStore();
const session = computed(() => user.profile);
const initial = computed(() => {
  const name = session.value?.displayName ?? session.value?.email ?? '?';
  return name.trim().charAt(0).toUpperCase() || '?';
});
const providerLabel = computed(() => {
  switch (session.value?.provider) {
    case 'google': return 'Google';
    case 'anonymous': return 'Invitado';
    default: return session.value?.provider ?? '';
  }
});

onMounted(() => {
  user.loadSession();
});

async function onSignOut() {
  await logout();
  user.clearProfile();
}
</script>
