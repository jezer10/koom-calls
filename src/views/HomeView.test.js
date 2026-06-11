import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import HomeView from './HomeView.vue';
import PreJoinView from './PreJoinView.vue';
import { useRoomStore } from '../stores/room.js';
import { useUserStore } from '../stores/user.js';

const callsMock = vi.hoisted(() => ({
  createCall: vi.fn(),
  listMyCalls: vi.fn().mockResolvedValue([]),
}));
vi.mock('../api/calls.js', () => ({
  createCall: callsMock.createCall,
  listMyCalls: callsMock.listMyCalls,
}));

vi.mock('../api/auth.js', () => ({
  getMe: vi.fn().mockResolvedValue(null),
  getProviders: vi.fn().mockResolvedValue([]),
  anonymousLogin: vi.fn(),
  getToken: vi.fn().mockReturnValue(null),
}));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeView },
      {
        path: '/prejoin/:roomId',
        name: 'prejoin',
        component: PreJoinView,
        props: true,
      },
      { path: '/room/:roomId', name: 'room', component: { template: '<div />' } },
    ],
  });
}

async function setSignedIn() {
  const user = useUserStore();
  user.setProfile({
    userId: 'u-1',
    displayName: 'Alice',
    email: 'a@x.com',
    picture: null,
    provider: 'google',
  });
}

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    callsMock.createCall.mockReset();
    callsMock.listMyCalls.mockReset();
    callsMock.listMyCalls.mockResolvedValue([]);
  });

  it('renders the welcome heading', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomeView, {
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('Welcome to Koom CALLS!');
  });

  it('does not show the CTAs when the user is not signed in', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="open-join"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="create-room"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="home-auth"]').exists()).toBe(true);
  });

  it('shows the CTAs and the listing when the user is signed in', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    callsMock.listMyCalls.mockResolvedValue([
      {
        id: 'c-1',
        roomId: 'AAA-BBB-CCC',
        status: 'pending',
        creatorId: 'u-1',
        createdAt: new Date().toISOString(),
        participantCount: 1,
      },
    ]);
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    await setSignedIn();
    await wrapper.vm.$nextTick();
    // Wait for the watcher in onMounted/loadMyCalls.
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="open-join"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-room"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="my-calls-list"]').exists()).toBe(true);
  });

  it('opens the join modal when JOIN ROOM is clicked', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    await setSignedIn();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="join-modal"]').exists()).toBe(false);
    await wrapper.find('[data-testid="open-join"]').trigger('click');
    expect(wrapper.find('[data-testid="join-modal"]').exists()).toBe(true);
  });

  it('shows an error and does not navigate when room code is invalid', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    await setSignedIn();
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="open-join"]').trigger('click');
    const input = wrapper.find('[data-testid="room-code-input"]');
    await input.setValue('bad code');
    await wrapper.find('[data-testid="join-submit"]').trigger('click');
    expect(wrapper.find('[data-testid="join-error"]').exists()).toBe(true);
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('navigates to pre-join when a valid code is provided', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    await setSignedIn();
    await wrapper.vm.$nextTick();
    const room = useRoomStore();
    const pushSpy = vi.spyOn(router, 'push');

    await wrapper.find('[data-testid="open-join"]').trigger('click');
    await wrapper
      .find('[data-testid="room-code-input"]')
      .setValue('abc-def-ghi');
    await wrapper.find('[data-testid="join-submit"]').trigger('click');

    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'prejoin', params: { roomId: 'ABC-DEF-GHI' } }),
    );
    expect(room.roomId).toBe('ABC-DEF-GHI');
    expect(room.callId).toBeNull();
  });

  it('calls POST /calls and navigates with the server-generated roomId', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    callsMock.createCall.mockResolvedValue({
      id: 'call-uuid-9',
      roomId: 'XYZ-AAA-BBB',
      createdAt: '2026-01-01',
    });
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    await setSignedIn();
    await wrapper.vm.$nextTick();
    const room = useRoomStore();
    const pushSpy = vi.spyOn(router, 'push');

    await wrapper.find('[data-testid="create-room"]').trigger('click');
    // Wait for the async createCall() and the subsequent navigation.
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    expect(callsMock.createCall).toHaveBeenCalledWith();
    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'prejoin', params: { roomId: 'XYZ-AAA-BBB' } }),
    );
    expect(room.callId).toBe('call-uuid-9');
    expect(room.roomId).toBe('XYZ-AAA-BBB');
    expect(callsMock.listMyCalls).toHaveBeenCalled();
  });

  it('surfaces an error in the home view when the create call fails', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    callsMock.createCall.mockRejectedValue(new Error('boom'));
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    await setSignedIn();
    // Let the isAuthenticated watcher run and load the (empty) list.
    await flushPromises();

    await wrapper.find('[data-testid="create-room"]').trigger('click');
    await flushPromises();

    const err = wrapper.find('[data-testid="home-error"]');
    expect(err.exists()).toBe(true);
    expect(err.text()).toBe('boom');
  });

  it('shows the empty-state when the user has no active meetings', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    callsMock.listMyCalls.mockResolvedValue([]);
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    await setSignedIn();
    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="my-calls-empty"]').exists()).toBe(true);
  });

  it('hides ended meetings from the active listing', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    callsMock.listMyCalls.mockResolvedValue([
      { id: 'a', roomId: 'AAA-AAA-AAA', status: 'pending', creatorId: 'u-1', createdAt: '2026-01-01', participantCount: 1 },
      { id: 'b', roomId: 'BBB-BBB-BBB', status: 'active', creatorId: 'u-1', createdAt: '2026-01-02', participantCount: 2 },
      { id: 'c', roomId: 'CCC-CCC-CCC', status: 'ended', creatorId: 'u-1', createdAt: '2026-01-03', participantCount: 0 },
    ]);
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    await setSignedIn();
    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    const ids = wrapper
      .findAll('[data-testid^="my-call-"]')
      .map((el) => el.attributes('data-testid'))
      .filter(Boolean)
      // Drop the inner "Entrar" buttons and the section refresh button,
      // keep only the per-call container rows.
      .filter((id) => !id.includes('-enter-') && !id.endsWith('-refresh'));
    expect(ids).toEqual(['my-call-a', 'my-call-b']);
  });

  it('redirects to ?next after sign-in when the router query had a target', async () => {
    const router = makeRouter();
    router.push('/?next=/prejoin/ABC-DEF-GHI');
    await router.isReady();
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    await wrapper.vm.$nextTick();
    const replaceSpy = vi.spyOn(router, 'replace');
    // Simulate an anonymous-login style sign-in happening on this view.
    await setSignedIn();
    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    expect(replaceSpy).toHaveBeenCalledWith('/prejoin/ABC-DEF-GHI');
  });
});
