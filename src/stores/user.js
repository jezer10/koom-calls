import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { generateUserId } from '../utils/id.js';
import { getMe } from '../api/auth.js';

export const useUserStore = defineStore('user', () => {
  const displayName = ref(localStorage.getItem('koom:displayName') ?? '');
  const userId = ref(localStorage.getItem('koom:userId') ?? generateUserId());
  const profile = ref(null);
  const isReady = ref(false);

  const isAuthenticated = computed(() => Boolean(profile.value));

  function setDisplayName(name) {
    displayName.value = name;
    localStorage.setItem('koom:displayName', name);
  }

  function setUserId(id) {
    userId.value = id;
    localStorage.setItem('koom:userId', id);
  }

  function setProfile(p) {
    profile.value = p;
    if (p?.displayName) setDisplayName(p.displayName);
    if (p?.userId) setUserId(p.userId);
  }

  function clearProfile() {
    profile.value = null;
  }

  async function loadSession() {
    if (isReady.value) return profile.value;
    try {
      const me = await getMe();
      if (me) profile.value = me;
    } catch {
      /* not signed in */
    } finally {
      isReady.value = true;
    }
    return profile.value;
  }

  return {
    displayName,
    userId,
    profile,
    isReady,
    isAuthenticated,
    setDisplayName,
    setUserId,
    setProfile,
    clearProfile,
    loadSession,
  };
});
