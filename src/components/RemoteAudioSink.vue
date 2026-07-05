<template>
  <audio
    ref="audioEl"
    autoplay
    playsinline
    hidden
  />
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  attachment: { type: Object, default: null },
  sinkId: { type: String, default: '' },
});

const audioEl = ref(null);

function resolveSource() {
  const source = props.attachment;
  if (!source) return null;
  if (typeof source.attach === 'function' && typeof source.detach === 'function') {
    return source;
  }
  if (source.mediaStreamTrack) return source.mediaStreamTrack;
  if (source.track) return source.track;
  if (source.getTracks) return source;
  return null;
}

function detachSource() {
  const el = audioEl.value;
  const source = resolveSource();
  if (!el || !source) return;
  if (typeof source.detach === 'function') {
    source.detach(el);
    return;
  }
  el.srcObject = null;
}

async function applySink() {
  const el = audioEl.value;
  if (!el || !props.sinkId) return;
  if (typeof el.setSinkId !== 'function') return;
  await el.setSinkId(props.sinkId);
}

async function applySource() {
  const el = audioEl.value;
  if (!el) return;
  detachSource();
  const source = resolveSource();
  if (!source) {
    el.srcObject = null;
    return;
  }
  if (typeof source.attach === 'function') {
    source.attach(el);
  } else {
    el.srcObject = source;
  }
  await applySink();
  const result = el.play?.();
  if (result && typeof result.catch === 'function') {
    result.catch(() => undefined);
  }
}

onMounted(() => {
  applySource();
});

watch(() => props.attachment, () => {
  applySource();
});

watch(() => props.sinkId, () => {
  applySink();
});

onBeforeUnmount(() => {
  detachSource();
});
</script>
