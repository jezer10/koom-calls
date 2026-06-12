<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-red-900/60"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="w-96 rounded bg-white p-6 shadow-lg space-y-4"
      data-testid="join-modal"
    >
      <div class="flex justify-end">
        <button
          class="w-6 focus:outline-black"
          aria-label="Cerrar"
          @click="$emit('close')"
        >
          <img
            :src="closeIcon"
            alt="close"
          >
        </button>
      </div>
      <div class="flex flex-col items-center gap-2">
        <label
          for="roomcode"
          class="text-xl font-bold"
        >ROOM CODE</label>
        <input
          id="roomcode"
          v-model="code"
          data-testid="room-code-input"
          class="w-full rounded-full border text-center text-xl font-medium focus:outline-none"
          placeholder="XXX-XXX-XXX"
        >
        <p
          v-if="error"
          class="text-sm text-red-600"
          data-testid="join-error"
        >
          {{ error }}
        </p>
      </div>
      <div class="flex items-center justify-center">
        <button
          class="bg-red-900 text-white px-4 py-1 rounded disabled:opacity-50"
          data-testid="join-submit"
          :disabled="!canSubmit"
          @click="submit"
        >
          Join
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import closeIcon from '../assets/close.svg';

const props = defineProps({
  initialCode: { type: String, default: '' },
  validate: { type: Function, default: null },
});
const emit = defineEmits(['close', 'join']);

const code = ref(props.initialCode);
const error = ref('');

const canSubmit = computed(() => code.value.trim().length > 0);

function submit() {
  const value = code.value.trim().toUpperCase();
  if (props.validate) {
    const result = props.validate(value);
    if (result !== true) {
      error.value = typeof result === 'string' ? result : 'Código inválido';
      return;
    }
  }
  error.value = '';
  emit('join', value);
}
</script>
