<template>
  <nav class="h-16 w-full bg-red-900 flex items-center justify-between px-6">
    <router-link to="/" class="text-3xl font-bold text-white tracking-wide">
      KOOM
    </router-link>
    <div class="flex items-center gap-3 text-white">
      <div
        class="h-10 w-10 rounded-full bg-white bg-contain bg-center"
        :style="{ backgroundImage: `url(${logo})` }"
      />
      <span class="font-extrabold">{{ user.displayName || 'Invitado' }}</span>
    </div>
  </nav>
</template>

<script setup>
import { useUserStore } from '../stores/user.js';
import logo from '../assets/logo.png';

const user = useUserStore();
</script>
