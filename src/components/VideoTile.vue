<template>
  <div
    class="relative h-full w-full overflow-hidden rounded-3xl bg-black text-white"
    data-testid="video-tile"
  >
    <video
      ref="videoEl"
      autoplay
      playsinline
      class="h-full w-full object-cover"
      :muted="muted"
    />
    <div class="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs">
      {{ label }}
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';

const props = defineProps({
  stream: { type: Object, default: null },
  label: { type: String, default: '' },
  muted: { type: Boolean, default: false },
});

const videoEl = ref(null);

function attachStream() {
  if (videoEl.value && props.stream) {
    videoEl.value.srcObject = props.stream;
    videoEl.value.play().catch(() => undefined);
  }
}

onMounted(attachStream);
watch(() => props.stream, attachStream);
</script>
