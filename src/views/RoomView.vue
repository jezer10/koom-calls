<template>
  <div class="flex h-screen w-screen flex-col bg-indigo-50" data-testid="room-view">
    <AppNav />
    <div class="flex flex-1 flex-col items-center gap-4 p-6">
      <div
        class="flex w-full flex-1 items-center justify-center gap-4 overflow-auto"
        data-testid="video-grid"
      >
        <VideoTile
          v-if="localStream"
          :stream="localStream"
          label="Tú"
          :muted="true"
          class="max-w-xl flex-1"
        />
        <VideoTile
          v-for="peer in remoteEntries"
          :key="peer.socketId"
          :stream="peer.stream"
          :label="peer.label"
          class="max-w-xl flex-1"
        />
        <p v-if="!hasAnyVideo" class="text-gray-500" data-testid="empty-state">
          Esperando a que alguien se una a la sala...
        </p>
      </div>
      <MediaControls
        :camera-on="cameraOn"
        :microphone-on="microphoneOn"
        @toggle-camera="toggleCamera"
        @toggle-microphone="toggleMicrophone"
        @leave="leave"
      />
      <p
        v-if="errorMessage"
        class="text-sm text-red-600"
        data-testid="room-error"
      >
        {{ errorMessage }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppNav from '../components/AppNav.vue';
import MediaControls from '../components/MediaControls.vue';
import VideoTile from '../components/VideoTile.vue';
import { useSignaling } from '../composables/useSignaling.js';
import { useMediaDevices, useWebRTC } from '../composables/useWebRTC.js';
import { useUserStore } from '../stores/user.js';
import { useRoomStore } from '../stores/room.js';

const props = defineProps({ roomId: { type: String, required: true } });

const router = useRouter();
const user = useUserStore();
const room = useRoomStore();
const errorMessage = ref('');

const media = useMediaDevices();
const rtc = useWebRTC();
const signaling = useSignaling();

const localStream = computed(() => media.stream.value);
const cameraOn = computed(() => media.cameraOn.value);
const microphoneOn = computed(() => media.microphoneOn.value);

const remoteEntries = computed(() => {
  const list = [];
  for (const peer of signaling.peers.value) {
    if (peer.socketId === signaling.selfSocketId.value) continue;
    const stream = rtc.remoteStreams.value.get(peer.socketId);
    list.push({ ...peer, stream });
  }
  return list;
});

const hasAnyVideo = computed(
  () => Boolean(localStream.value) || remoteEntries.value.length > 0,
);

async function bootstrap() {
  try {
    const stream = await media.start();
    rtc.setLocalStream(stream);
    room.setRoom(props.roomId);
    await signaling.joinRoom(props.roomId, user.userId);
    room.setPeers(signaling.peers.value);
  } catch (err) {
    errorMessage.value = err?.message ?? 'No se pudo iniciar la sala';
  }
}

function setupListeners() {
  signaling.onUserJoined(async ({ socketId, userId: joinedUserId }) => {
    signaling.peers.value = [
      ...signaling.peers.value,
      { socketId, userId: joinedUserId },
    ];
    try {
      const { offer } = await rtc.createOffer(socketId);
      signaling.emitSignal('offer', socketId, offer);
    } catch (err) {
      errorMessage.value = err?.message ?? 'Error al crear oferta';
    }
  });

  signaling.onUserLeft(({ socketId }) => {
    rtc.closePeer(socketId);
    signaling.peers.value = signaling.peers.value.filter(
      (p) => p.socketId !== socketId,
    );
  });

  signaling.onSignal(async (payload) => {
    const { from, to, signal, type } = payload;
    if (to !== signaling.selfSocketId.value) return;
    try {
      if (type === 'offer') {
        const { answer } = await rtc.handleOffer(from, signal);
        signaling.emitSignal('answer', from, answer);
      } else if (type === 'answer') {
        await rtc.handleAnswer(from, signal);
      } else if (type === 'ice-candidate') {
        await rtc.addIceCandidate(from, signal);
      }
    } catch (err) {
      errorMessage.value = err?.message ?? 'Error en señalización';
    }
  });
}

function toggleCamera() {
  media.toggleCamera();
}

function toggleMicrophone() {
  media.toggleMicrophone();
}

function leave() {
  rtc.closeAll();
  signaling.disconnect();
  room.clear();
  router.push({ name: 'home' });
}

onMounted(() => {
  setupListeners();
  bootstrap();
});
</script>
