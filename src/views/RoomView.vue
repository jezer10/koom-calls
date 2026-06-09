<template>
  <div class="flex h-screen w-screen flex-col bg-indigo-50" data-testid="room-view">
    <AppNav />
    <div class="flex flex-1 flex-col items-center gap-4 p-6">
      <div class="flex w-full items-center justify-between text-sm text-gray-700">
        <span data-testid="room-id">Sala: {{ props.roomId }}</span>
        <label class="flex items-center gap-2" data-testid="transport-toggle">
          <span>Transporte:</span>
          <select
            v-model="transportState"
            class="rounded border bg-white px-2 py-1"
            data-testid="transport-select"
          >
            <option value="livekit">LiveKit (SFU)</option>
            <option value="p2p">P2P (legacy)</option>
          </select>
        </label>
      </div>
      <div
        class="flex w-full flex-1 items-center justify-center gap-4 overflow-auto"
        data-testid="video-grid"
      >
        <VideoTile
          v-if="hasLocalVideo"
          :stream="localStream"
          :attachment="localAttachment"
          label="Tú"
          :muted="true"
          class="max-w-xl flex-1"
        />
        <VideoTile
          v-for="entry in remoteEntries"
          :key="entry.key"
          :stream="entry.stream"
          :attachment="entry.attachment"
          :label="entry.label"
          class="max-w-xl flex-1"
        />
        <p v-if="!hasAnyVideo" class="text-gray-500" data-testid="empty-state">
          Esperando a que alguien se une a la sala...
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
      <p
        v-else-if="transportState === 'livekit' && livekitStateLabel"
        class="text-xs text-gray-500"
        data-testid="livekit-state"
      >
        LiveKit: {{ livekitStateLabel }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppNav from '../components/AppNav.vue';
import MediaControls from '../components/MediaControls.vue';
import VideoTile from '../components/VideoTile.vue';
import { createLocalTracks } from 'livekit-client';
import { useSignaling } from '../composables/useSignaling.js';
import { useLiveKitRoom, findPublication } from '../composables/useLiveKitRoom.js';
import { useMediaDevices, useWebRTC } from '../composables/useWebRTC.js';
import { useUserStore } from '../stores/user.js';
import { useRoomStore } from '../stores/room.js';
import { devLogin, getToken } from '../api/auth.js';
import { getIceServers, getSfuToken } from '../api/calls.js';

const props = defineProps({
  roomId: { type: String, required: true },
  transport: { type: String, default: 'livekit' },
});

const router = useRouter();
const user = useUserStore();
const room = useRoomStore();
const errorMessage = ref('');
const transportState = ref(props.transport === 'p2p' ? 'p2p' : 'livekit');

const media = useMediaDevices();
const rtc = useWebRTC();
const livekit = useLiveKitRoom();
const signaling = useSignaling({ transport: transportState.value });

const cameraOn = ref(false);
const microphoneOn = ref(false);
const localStream = ref(null);
const localAttachment = ref(null);

const livekitStateLabel = computed(() => {
  const s = livekit.state.value;
  if (!s || s === 'idle' || s === 'disconnected') return '';
  return s;
});

const hasLocalVideo = computed(
  () => Boolean(localStream.value) || Boolean(localAttachment.value),
);

const remoteEntries = computed(() => {
  if (transportState.value === 'livekit') {
    return livekit.remoteParticipants.value.map((p) => {
      const pub = findPublication(p, 'video');
      const audioPub = findPublication(p, 'audio');
      return {
        key: p.identity ?? p.sid,
        label: p.name || p.identity || 'Invitado',
        attachment: pub?.videoTrack ?? pub?.track ?? null,
        stream: null,
        audioAttachment: audioPub?.audioTrack ?? audioPub?.track ?? null,
      };
    });
  }
  const list = [];
  for (const peer of signaling.peers.value) {
    if (peer.socketId === signaling.selfSocketId.value) continue;
    const stream = rtc.remoteStreams.value.get(peer.socketId);
    list.push({ key: peer.socketId, label: 'Invitado', stream, attachment: null });
  }
  return list;
});

const hasAnyVideo = computed(
  () => hasLocalVideo.value || remoteEntries.value.length > 0,
);

watch(transportState, async (next, prev) => {
  if (next === prev) return;
  await teardown();
  await bootstrap();
});

onBeforeUnmount(() => {
  teardown();
});

onMounted(() => {
  bootstrap();
});

async function bootstrap() {
  errorMessage.value = '';
  try {
    const stream = await media.start();
    localStream.value = stream;
    cameraOn.value = stream.getVideoTracks().length > 0;
    microphoneOn.value = stream.getAudioTracks().length > 0;
    room.setRoom(props.roomId);
    if (transportState.value === 'livekit') {
      await bootstrapLiveKit(stream);
    } else {
      await bootstrapP2P(stream);
    }
  } catch (err) {
    errorMessage.value = err?.message ?? 'No se pudo iniciar la sala';
  }
}

async function bootstrapP2P(stream) {
  rtc.setLocalStream(stream);
  await signaling.joinRoom(props.roomId, user.userId);
  room.setPeers(signaling.peers.value);
  setupLegacyListeners();
}

async function bootstrapLiveKit(stream) {
  let token = getToken();
  if (!token) {
    const result = await devLogin({ userId: user.userId, displayName: user.displayName });
    token = result.token;
  }
  const [, sfu] = await Promise.all([
    getIceServers(),
    getSfuToken(props.roomId),
  ]);
  await livekit.connect({ url: sfu.url || undefined, token: sfu.token });
  await publishLocalTracks(stream);
  await signaling.joinRoom(props.roomId, user.userId);
  room.setPeers(signaling.peers.value);
  signaling.emitSfuJoinRoom({
    roomId: props.roomId,
    callId: props.roomId,
    sfuUrl: sfu.url,
    mocked: sfu.mocked,
  });
}

async function publishLocalTracks(stream) {
  const [videoTrack] = stream.getVideoTracks();
  const [audioTrack] = stream.getAudioTracks();
  if (!videoTrack && !audioTrack) return;
  const tracks = await createLocalTracks({
    audio: audioTrack ? { deviceId: audioTrack.getSettings?.().deviceId } : false,
    video: videoTrack
      ? { deviceId: videoTrack.getSettings?.().deviceId }
      : false,
  });
  const published = [];
  for (const t of tracks) {
    try {
      const pub = await livekit.publishTrack(t);
      if (pub) published.push(t);
    } catch (err) {
      errorMessage.value = err?.message ?? `No se pudo publicar ${t.kind}`;
    }
  }
  localAttachment.value =
    published.find((t) => t.kind === 'video') ??
    published.find((t) => t.kind === 'audio') ??
    null;
}

let legacyListenersBound = false;
function setupLegacyListeners() {
  if (legacyListenersBound) return;
  legacyListenersBound = true;
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

async function toggleCamera() {
  if (transportState.value === 'livekit') {
    const next = !cameraOn.value;
    await livekit.setCameraEnabled(next);
    cameraOn.value = next;
  } else {
    cameraOn.value = media.toggleCamera();
  }
}

async function toggleMicrophone() {
  if (transportState.value === 'livekit') {
    const next = !microphoneOn.value;
    await livekit.setMicrophoneEnabled(next);
    microphoneOn.value = next;
  } else {
    microphoneOn.value = media.toggleMicrophone();
  }
}

async function teardown() {
  try {
    await livekit.disconnect();
  } catch {
    /* ignore */
  }
  try {
    rtc.closeAll();
  } catch {
    /* ignore */
  }
  try {
    signaling.disconnect();
  } catch {
    /* ignore */
  }
  localStream.value = null;
  localAttachment.value = null;
  cameraOn.value = false;
  microphoneOn.value = false;
}

async function leave() {
  await teardown();
  media.stop();
  room.clear();
  router.push({ name: 'home' });
}
</script>
