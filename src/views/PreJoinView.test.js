import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

const authMock = vi.hoisted(() => ({
  getMe: vi.fn(),
  getProviders: vi.fn().mockResolvedValue([]),
  anonymousLogin: vi.fn(),
}));
vi.mock('../api/auth.js', () => ({
  getMe: authMock.getMe,
  getProviders: authMock.getProviders,
  anonymousLogin: authMock.anonymousLogin,
}));

vi.mock('../composables/useDeviceList.js', () => ({
  useDeviceList: () => ({
    cameras: { value: [] },
    microphones: { value: [] },
    selectedCameraId: { value: '' },
    selectedMicrophoneId: { value: '' },
    error: { value: null },
    refresh: vi.fn().mockResolvedValue(undefined),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    selectCamera: vi.fn(),
    selectMicrophone: vi.fn(),
  }),
  useDevicePreview: () => ({
    stream: { value: null },
    start: vi.fn().mockResolvedValue(null),
    stop: vi.fn(),
  }),
}));

import PreJoinView from './PreJoinView.vue';

async function mountView({ signedIn = false } = {}) {
  setActivePinia(createPinia());
  if (signedIn) {
    const { useUserStore } = await import('../stores/user.js');
    useUserStore().setProfile({
      userId: 'u-1',
      displayName: 'Alice',
      email: 'a@x.com',
      picture: 'http://x/p.png',
      provider: 'google',
    });
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'home', path: '/', component: { template: '<div/>' } },
      { name: 'room', path: '/room/:roomId', component: { template: '<div/>' } },
    ],
  });
  await router.push('/pre-join/ABC-DEF-GHI');
  await router.isReady();
  return mount(PreJoinView, {
    props: { roomId: 'ABC-DEF-GHI' },
    global: { plugins: [router] },
  });
}

describe('PreJoinView', () => {
  beforeEach(() => {
    authMock.getMe.mockReset();
    authMock.anonymousLogin.mockReset();
  });

  it('silently logs in as a guest when no session exists', async () => {
    authMock.getMe.mockResolvedValue(null);
    authMock.anonymousLogin.mockResolvedValue({
      userId: 'anon-1',
      displayName: 'Guest',
      provider: 'anonymous',
    });
    const wrapper = await mountView();
    await flushPromises();
    expect(authMock.anonymousLogin).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Guest' }),
    );
    // Once auto-login completes the enter button is enabled.
    const enter = wrapper.find('[data-testid="pre-join-enter"]');
    expect(enter.attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="pre-join-guest"]').exists()).toBe(true);
    // The big blocking auth prompt must NOT be shown just for joining.
    expect(wrapper.find('[data-testid="pre-join-auth-fallback"]').exists()).toBe(false);
  });

  it('skips anonymous login when the user store already has a profile', async () => {
    authMock.getMe.mockResolvedValue(null);
    const wrapper = await mountView({ signedIn: true });
    await flushPromises();
    expect(authMock.anonymousLogin).not.toHaveBeenCalled();
    const enter = wrapper.find('[data-testid="pre-join-enter"]');
    expect(enter.attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="pre-join-guest"]').exists()).toBe(true);
  });

  it('falls back to a Google prompt when anonymous login is disabled (404)', async () => {
    authMock.getMe.mockResolvedValue(null);
    const err = new Error('not found');
    err.response = { status: 404 };
    authMock.anonymousLogin.mockRejectedValue(err);
    const wrapper = await mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="pre-join-boot-error"]').exists()).toBe(true);
    const fallback = wrapper.find('[data-testid="pre-join-auth-fallback"]');
    expect(fallback.exists()).toBe(true);
    // The fallback prompt must only offer Google (no anonymous option),
    // otherwise we'd loop on the same disabled endpoint.
    expect(wrapper.find('[data-testid="auth-prompt-anonymous"]').exists()).toBe(false);
    // Enter button must be disabled until they sign in with Google.
    const enter = wrapper.find('[data-testid="pre-join-enter"]');
    expect(enter.attributes('disabled')).toBeDefined();
  });

  it('surfaces Google button errors through the shared error display', async () => {
    authMock.getProviders.mockResolvedValue([
      { name: 'google', displayName: 'Google', enabled: true, startUrl: '/auth/google/start' },
    ]);
    authMock.getMe.mockResolvedValue(null);
    authMock.anonymousLogin.mockRejectedValue(Object.assign(new Error('nope'), { response: { status: 404 } }));
    const wrapper = await mountView();
    await flushPromises();
    const googleBtn = wrapper.findComponent({ name: 'GoogleSignInButton' });
    googleBtn.vm.$emit('error', 'access_denied');
    await flushPromises();
    expect(wrapper.find('[data-testid="auth-prompt-error"]').text()).toBe('access_denied');
  });
});
