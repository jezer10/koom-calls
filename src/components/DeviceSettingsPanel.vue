<template>
  <div
    class="flex w-full flex-col gap-2 rounded-2xl bg-white/70 p-3 text-sm"
    data-testid="device-settings-panel"
  >
    <div class="flex flex-col gap-1">
      <label
        class="flex items-center gap-2"
        data-testid="device-panel-camera-wrap"
      >
        <span class="w-24 text-gray-600">Cámara</span>
        <select
          class="flex-1 rounded border bg-white px-2 py-1 disabled:opacity-50"
          :value="selectedCameraId"
          :disabled="disabled || cameras.length === 0"
          data-testid="device-panel-camera"
          @change="$emit('select-camera', $event.target.value)"
        >
          <option
            v-if="cameras.length === 0"
            value=""
          >
            No hay cámaras
          </option>
          <option
            v-for="cam in cameras"
            :key="cam.deviceId"
            :value="cam.deviceId"
          >
            {{ cam.label || 'Cámara sin nombre' }}
          </option>
        </select>
      </label>
    </div>
    <div class="flex flex-col gap-1">
      <label
        class="flex items-center gap-2"
        data-testid="device-panel-microphone-wrap"
      >
        <span class="w-24 text-gray-600">Micrófono</span>
        <select
          class="flex-1 rounded border bg-white px-2 py-1 disabled:opacity-50"
          :value="selectedMicrophoneId"
          :disabled="disabled || microphones.length === 0"
          data-testid="device-panel-microphone"
          @change="$emit('select-microphone', $event.target.value)"
        >
          <option
            v-if="microphones.length === 0"
            value=""
          >
            No hay micrófonos
          </option>
          <option
            v-for="mic in microphones"
            :key="mic.deviceId"
            :value="mic.deviceId"
          >
            {{ mic.label || 'Micrófono sin nombre' }}
          </option>
        </select>
      </label>
    </div>
  </div>
</template>

<script setup>
defineProps({
  cameras: { type: Array, required: true },
  microphones: { type: Array, required: true },
  selectedCameraId: { type: String, default: '' },
  selectedMicrophoneId: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});

defineEmits(['select-camera', 'select-microphone']);
</script>
