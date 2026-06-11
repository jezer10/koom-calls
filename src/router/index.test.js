import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { router } from './index.js';
import { useUserStore } from '../stores/user.js';

vi.mock('../views/HomeView.vue', () => ({
  default: { name: 'HomeView', template: '<div>home</div>' },
}));
vi.mock('../views/PreJoinView.vue', () => ({
  default: { name: 'PreJoinView', template: '<div>prejoin</div>' },
}));
vi.mock('../views/RoomView.vue', () => ({
  default: { name: 'RoomView', template: '<div>room</div>' },
}));

async function pushAndWait(to) {
  await router.push(to);
  // The beforeEach guard runs synchronously; nextTick lets the resolved
  // route propagate through the router.
  await router.isReady();
}

describe('router auth guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('allows access to / without a session', async () => {
    await pushAndWait('/');
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('redirects /prejoin/:roomId to home with ?next when not signed in', async () => {
    await pushAndWait('/prejoin/ABC-DEF-GHI');
    const r = router.currentRoute.value;
    expect(r.name).toBe('home');
    expect(r.query.next).toBe('/prejoin/ABC-DEF-GHI');
  });

  it('redirects /room/:roomId to home with ?next when not signed in', async () => {
    await pushAndWait('/room/ABC-DEF-GHI');
    const r = router.currentRoute.value;
    expect(r.name).toBe('home');
    expect(r.query.next).toBe('/room/ABC-DEF-GHI');
  });

  it('allows /prejoin/:roomId when the user store has a profile', async () => {
    useUserStore().setProfile({
      userId: 'u-1',
      displayName: 'Alice',
      provider: 'google',
    });
    await pushAndWait('/prejoin/ABC-DEF-GHI');
    expect(router.currentRoute.value.name).toBe('prejoin');
    expect(router.currentRoute.value.params.roomId).toBe('ABC-DEF-GHI');
  });

  it('allows /room/:roomId when the user store has a profile', async () => {
    useUserStore().setProfile({
      userId: 'u-1',
      displayName: 'Alice',
      provider: 'google',
    });
    await pushAndWait('/room/ABC-DEF-GHI');
    expect(router.currentRoute.value.name).toBe('room');
  });
});
