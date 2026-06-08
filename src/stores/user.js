import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { generateUserId } from '../utils/id.js';

export const useUserStore = defineStore('user', () => {
  const displayName = ref(localStorage.getItem('koom:displayName') ?? '');
  const userId = ref(localStorage.getItem('koom:userId') ?? generateUserId());

  const isAuthenticated = computed(() => Boolean(displayName.value));

  function setDisplayName(name) {
    displayName.value = name;
    localStorage.setItem('koom:displayName', name);
  }

  function setUserId(id) {
    userId.value = id;
    localStorage.setItem('koom:userId', id);
  }

  return { displayName, userId, isAuthenticated, setDisplayName, setUserId };
});
