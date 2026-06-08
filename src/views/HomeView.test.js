import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import HomeView from './HomeView.vue';
import { useRoomStore } from '../stores/room.js';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeView },
      { path: '/room/:roomId', name: 'room', component: { template: '<div />' } },
    ],
  });
}

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders the welcome heading and the two CTAs', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomeView, {
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('Welcome to Koom CALLS!');
    expect(wrapper.find('[data-testid="open-join"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-room"]').exists()).toBe(true);
  });

  it('opens the join modal when JOIN ROOM is clicked', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    expect(wrapper.find('[data-testid="join-modal"]').exists()).toBe(false);
    await wrapper.find('[data-testid="open-join"]').trigger('click');
    expect(wrapper.find('[data-testid="join-modal"]').exists()).toBe(true);
  });

  it('shows an error and does not navigate when room code is invalid', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    await wrapper.find('[data-testid="open-join"]').trigger('click');
    const input = wrapper.find('[data-testid="room-code-input"]');
    await input.setValue('bad code');
    await wrapper.find('[data-testid="join-submit"]').trigger('click');
    expect(wrapper.find('[data-testid="join-error"]').exists()).toBe(true);
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('navigates to the room when a valid code is provided', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    const room = useRoomStore();
    const pushSpy = vi.spyOn(router, 'push');

    await wrapper.find('[data-testid="open-join"]').trigger('click');
    await wrapper
      .find('[data-testid="room-code-input"]')
      .setValue('abc-def-ghi');
    await wrapper.find('[data-testid="join-submit"]').trigger('click');

    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'room', params: { roomId: 'ABC-DEF-GHI' } }),
    );
    expect(room.roomId).toBe('ABC-DEF-GHI');
  });

  it('creates a new room and navigates with a generated code', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    const room = useRoomStore();
    const pushSpy = vi.spyOn(router, 'push');

    await wrapper.find('[data-testid="create-room"]').trigger('click');

    expect(pushSpy).toHaveBeenCalledTimes(1);
    const target = pushSpy.mock.calls[0][0];
    expect(target.name).toBe('room');
    expect(target.params.roomId).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    expect(room.roomId).toBe(target.params.roomId);
  });
});
