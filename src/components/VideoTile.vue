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
  attachment: { type: Object, default: null },
  label: { type: String, default: '' },
  muted: { type: Boolean, default: false },
});

const videoEl = ref(null);

/**
 * Resolve the input to a value suitable for `HTMLMediaElement.srcObject`.
 * Accepts:
 *   - a MediaStream (legacy `stream` prop, or `attachment.mediaStreamTrack`
 *     wrapped by a caller)
 *   - a LiveKit `Track` (calls `attach` and detaches on swap)
 *   - a `MediaStreamTrack` directly
 *   - `null` to clear
 *
 * @returns {MediaStream|MediaStreamTrack|null}
 */
function resolveSource() {
  if (props.attachment) {
    const a = props.attachment;
    if (typeof a.attach === 'function' && typeof a.detach === 'function') {
      return a;
    }
    if (a.mediaStreamTrack) return a.mediaStreamTrack;
    if (a.track) return a.track;
    if (a.getTracks) return a;
  }
  if (props.stream) return props.stream;
  return null;
}

function applySource() {
  const el = videoEl.value;
  if (!el) return;
  const source = resolveSource();
  if (!source) {
    el.srcObject = null;
    return;
  }
  if (typeof source.attach === 'function') {
    source.attach(el);
    if (typeof el.play === 'function') {
      const result = el.play();
      if (result && typeof result.catch === 'function') {
        result.catch(() => undefined);
      }
    }
    return;
  }
  el.srcObject = source;
  if (typeof el.play === 'function') {
    const result = el.play();
    if (result && typeof result.catch === 'function') {
      result.catch(() => undefined);
    }
  }
}

onMounted(applySource);
watch(() => [props.stream, props.attachment], applySource, { flush: 'post' });
</script>
