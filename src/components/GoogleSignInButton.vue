<script setup>
import { computed, watch } from 'vue';
import { useGoogleAuth } from '../composables/useGoogleAuth.js';

const props = defineProps({
  returnTo: { type: String, default: '' },
  label: { type: String, default: 'Continuar con Google' },
});
const emit = defineEmits(['signed-in', 'error']);

const { status, errorMessage, openPopup, lastUser } = useGoogleAuth();

const isLoading = computed(() => status.value === 'opening');

function onClick() {
  openPopup({ returnTo: props.returnTo });
}

// Surface successful sign-in to the parent (e.g. PreJoinView)
watch(lastUser, (u) => {
  if (u) emit('signed-in', u);
});

// Surface auth-flow errors to the parent so it can own the error display.
watch([status, errorMessage], ([next, msg]) => {
  if (next === 'error' && msg) emit('error', msg);
});
</script>

<template>
  <div class="koom-google-signin">
    <button
      type="button"
      class="koom-google-signin__btn"
      :disabled="isLoading"
      data-testid="google-signin-btn"
      @click="onClick"
    >
      <svg
        class="koom-google-signin__icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 48"
        aria-hidden="true"
      >
        <path
          fill="#FFC107"
          d="M43.611 20.083H42V20H24v8h11.303C33.834 32.91 29.34 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
        />
        <path
          fill="#FF3D00"
          d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
        />
        <path
          fill="#4CAF50"
          d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.317 0-9.798-3.069-11.291-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
        />
        <path
          fill="#1976D2"
          d="M43.611 20.083H42V20H24v8h11.303a12.043 12.043 0 0 1-4.087 5.57l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
        />
      </svg>
      <span>{{ isLoading ? 'Abriendo…' : label }}</span>
    </button>
  </div>
</template>

<style scoped>
.koom-google-signin {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: stretch;
}
.koom-google-signin__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.6rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #dadce0;
  background: #ffffff;
  color: #1f1f1f;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.koom-google-signin__btn:hover {
  background: #f7f8f8;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.koom-google-signin__btn:disabled {
  opacity: 0.6;
  cursor: progress;
}
.koom-google-signin__icon {
  width: 1.2rem;
  height: 1.2rem;
}
</style>
