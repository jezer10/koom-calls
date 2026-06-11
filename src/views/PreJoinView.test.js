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

async function mountView() {
  setActivePinia(createPinia());
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

describe('PreJoinView auth', () => {
  beforeEach(() => {
    authMock.getMe.mockReset();
    authMock.anonymousLogin.mockReset();
  });

  it('shows the login section when not signed in', async () => {
    authMock.getProviders.mockResolvedValue([
      { name: 'google', displayName: 'Google', enabled: true, startUrl: '/auth/google/start' },
      { name: 'anonymous', displayName: 'Invitado', enabled: true, startUrl: '/auth/anonymous/login' },
    ]);
    authMock.getMe.mockResolvedValue(null);
    const wrapper = await mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="pre-join-auth"]').exists()).toBe(true);
  });

  it('hides the login section when the user store already has a profile', async () => {
    authMock.getProviders.mockResolvedValue([
      { name: 'google', displayName: 'Google', enabled: true, startUrl: '/auth/google/start' },
    ]);
    const wrapper = await mountView();
    await flushPromises();
    const { useUserStore } = await import('../stores/user.js');
    useUserStore().setProfile({
      userId: 'g-1',
      displayName: 'Alice',
      email: 'a@x.com',
      picture: 'http://x/p.png',
      provider: 'google',
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="pre-join-auth"]').exists()).toBe(false);
  });

  it('renders the auth section before the device preview when not signed in', async () => {
    authMock.getProviders.mockResolvedValue([
      { name: 'google', displayName: 'Google', enabled: true, startUrl: '/auth/google/start' },
    ]);
    authMock.getMe.mockResolvedValue(null);
    const wrapper = await mountView();
    await flushPromises();
    const auth = wrapper.find('[data-testid="pre-join-auth"]');
    const preview = wrapper.find('[data-testid="preview-container"]');
    expect(auth.exists()).toBe(true);
    expect(preview.exists()).toBe(true);
    // In the rendered DOM, the auth block must appear above the preview,
    // so a user is never asked for camera/mic before signing in.
    expect(auth.element.compareDocumentPosition(preview.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('surfaces Google button errors through the shared error display', async () => {
    authMock.getProviders.mockResolvedValue([
      { name: 'google', displayName: 'Google', enabled: true, startUrl: '/auth/google/start' },
    ]);
    authMock.getMe.mockResolvedValue(null);
    const wrapper = await mountView();
    await flushPromises();
    const googleBtn = wrapper.findComponent({ name: 'GoogleSignInButton' });
    googleBtn.vm.$emit('error', 'access_denied');
    await flushPromises();
    expect(wrapper.find('[data-testid="auth-prompt-error"]').text()).toBe('access_denied');
  });

  it('surfaces anonymous login errors through the shared error display', async () => {
    authMock.getProviders.mockResolvedValue([
      { name: 'anonymous', displayName: 'Invitado', enabled: true },
    ]);
    authMock.getMe.mockResolvedValue(null);
    authMock.anonymousLogin.mockRejectedValue(new Error('boom'));
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="auth-prompt-anonymous"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="auth-prompt-error"]').text()).toBe('boom');
  });
});
