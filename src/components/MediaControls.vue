<template>
  <div
    class="w-full flex justify-center gap-4"
    data-testid="media-controls"
  >
    <button
      class="w-14 h-14 rounded-full text-white"
      :class="cameraOn ? 'bg-gray-600' : 'bg-red-500'"
      :aria-pressed="!cameraOn"
      data-testid="toggle-camera"
      @click="$emit('toggle-camera')"
    >
      <i
        class="fas"
        :class="cameraOn ? 'fa-video' : 'fa-video-slash'"
      />
    </button>
    <button
      class="w-14 h-14 rounded-full text-white"
      :class="microphoneOn ? 'bg-gray-600' : 'bg-red-500'"
      :aria-pressed="!microphoneOn"
      data-testid="toggle-microphone"
      @click="$emit('toggle-microphone')"
    >
      <i
        class="fas"
        :class="microphoneOn ? 'fa-microphone' : 'fa-microphone-slash'"
      />
    </button>
    <button
      class="w-14 h-14 rounded-full text-white bg-red-700"
      data-testid="leave-room"
      @click="$emit('leave')"
    >
      <i class="fas fa-phone-slash" />
    </button>
  </div>
</template>

<script setup>
defineProps({
  cameraOn: { type: Boolean, required: true },
  microphoneOn: { type: Boolean, required: true },
});

defineEmits(['toggle-camera', 'toggle-microphone', 'leave']);
</script>
