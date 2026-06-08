import { describe, expect, it } from 'vitest';
import { useUserStore } from './user.js';
import { createPinia, setActivePinia } from 'pinia';

describe('stores/user', () => {
  beforeEachInit();

  function beforeEachInit() {
    return;
  }

  it('initializes displayName from localStorage when present', () => {
    localStorage.setItem('koom:displayName', 'Alice');
    setActivePinia(createPinia());
    const store = useUserStore();
    expect(store.displayName).toBe('Alice');
  });

  it('falls back to empty displayName and generates a userId', () => {
    localStorage.clear();
    setActivePinia(createPinia());
    const store = useUserStore();
    expect(store.displayName).toBe('');
    expect(store.userId).toMatch(/^user-/);
    expect(store.isAuthenticated).toBe(false);
  });

  it('setDisplayName persists to localStorage and updates isAuthenticated', () => {
    localStorage.clear();
    setActivePinia(createPinia());
    const store = useUserStore();
    store.setDisplayName('Bob');
    expect(store.displayName).toBe('Bob');
    expect(localStorage.getItem('koom:displayName')).toBe('Bob');
    expect(store.isAuthenticated).toBe(true);
  });

  it('setUserId persists the new id', () => {
    localStorage.clear();
    setActivePinia(createPinia());
    const store = useUserStore();
    store.setUserId('user-42');
    expect(store.userId).toBe('user-42');
    expect(localStorage.getItem('koom:userId')).toBe('user-42');
  });
});
