import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppNav from './AppNav.vue';

const logoutMock = vi.hoisted(() => vi.fn());
const getMeMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock('../api/auth.js', () => ({
  logout: logoutMock,
  getMe: getMeMock,
}));

function nextTick() {
  return new Promise((r) => setTimeout(r, 0));
}

async function mountNav() {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'home', path: '/', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  return mount(AppNav, { global: { plugins: [router] } });
}

describe('AppNav', () => {
  beforeEach(() => {
    logoutMock.mockReset();
  });

  it('shows "Invitado" and the default logo when no session', async () => {
    const wrapper = await mountNav();
    expect(wrapper.find('[data-testid="app-nav-session"]').text()).toContain('Invitado');
    expect(wrapper.find('[data-testid="app-nav-avatar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="app-nav-initial"]').exists()).toBe(false);
  });

  it('shows the Google avatar, name and email when session is set', async () => {
    const wrapper = await mountNav();
    const { useUserStore } = await import('../stores/user.js');
    const store = useUserStore();
    store.setProfile({
      userId: 'g-1',
      displayName: 'Alice',
      email: 'alice@example.com',
      picture: 'http://x/p.png',
      provider: 'google',
    });
    await nextTick();
    expect(wrapper.find('[data-testid="app-nav-avatar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="app-nav-name"]').text()).toBe('Alice');
    expect(wrapper.find('[data-testid="app-nav-email"]').text()).toBe('alice@example.com');
  });

  it('shows initial and provider label when the user has no picture (anonymous)', async () => {
    const wrapper = await mountNav();
    const { useUserStore } = await import('../stores/user.js');
    const store = useUserStore();
    store.setProfile({
      userId: 'a-1',
      displayName: 'Guest',
      email: null,
      picture: null,
      provider: 'anonymous',
    });
    await nextTick();
    const initial = wrapper.find('[data-testid="app-nav-initial"]');
    expect(initial.exists()).toBe(true);
    expect(initial.text()).toBe('G');
    expect(wrapper.find('[data-testid="app-nav-email"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="app-nav-provider"]').text()).toBe('Invitado');
  });

  it('calls logout and clears the profile on "Cambiar"', async () => {
    logoutMock.mockResolvedValue(undefined);
    const wrapper = await mountNav();
    const { useUserStore } = await import('../stores/user.js');
    const store = useUserStore();
    store.setProfile({
      userId: 'g-1',
      displayName: 'Alice',
      email: 'a@x.com',
      picture: null,
      provider: 'google',
    });
    await nextTick();
    await wrapper.find('[data-testid="app-nav-signout"]').trigger('click');
    await nextTick();
    expect(logoutMock).toHaveBeenCalled();
    expect(store.profile).toBeNull();
  });
});
