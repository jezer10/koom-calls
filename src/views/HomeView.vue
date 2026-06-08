<template>
  <div class="flex h-screen w-screen flex-col bg-indigo-50">
    <AppNav />
    <main class="flex flex-1 flex-col items-center justify-center gap-12 p-10">
      <h1 class="text-5xl font-bold">Welcome to Koom CALLS!</h1>
      <div class="flex w-full max-w-md flex-col gap-12">
        <button
          class="rounded-full bg-red-900 py-4 text-2xl font-bold text-white hover:bg-red-800 focus:ring-4 focus:ring-purple-900"
          data-testid="open-join"
          @click="showJoin = true"
        >
          JOIN ROOM
        </button>
        <button
          class="rounded-full bg-red-900 py-4 text-2xl font-bold text-white hover:bg-red-800 focus:ring-4 focus:ring-purple-900"
          data-testid="create-room"
          @click="createRoom"
        >
          CREATE NEW ROOM
        </button>
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
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppNav from '../components/AppNav.vue';
import JoinModal from '../components/JoinModal.vue';
import { generateRoomCode } from '../utils/id.js';
import { useRoomStore } from '../stores/room.js';

const router = useRouter();
const room = useRoomStore();
const showJoin = ref(false);

const ROOM_CODE_RE = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;

function validateRoomCode(value) {
  return ROOM_CODE_RE.test(value) || 'Formato esperado: XXX-XXX-XXX';
}

function joinRoom(code) {
  showJoin.value = false;
  room.setRoom(code);
  router.push({ name: 'room', params: { roomId: code } });
}

function createRoom() {
  const code = generateRoomCode();
  room.setRoom(code);
  router.push({ name: 'room', params: { roomId: code } });
}
</script>
