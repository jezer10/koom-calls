import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import GoogleSignInButton from './GoogleSignInButton.vue';

const setTokenMock = vi.hoisted(() => vi.fn());
vi.mock('../api/auth.js', () => ({ setToken: setTokenMock }));

vi.mock('../config.js', () => ({
  APP_CONFIG: {
    frontendOrigin: 'http://localhost:5173',
    backendOrigin: 'http://localhost:8080',
    apiBaseUrl: 'http://localhost:8080/api',
  },
}));

function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    setTokenMock.mockReset();
    if (!('open' in window)) {
      window.open = () => null;
    } else {
      vi.restoreAllMocks();
    }
  });

  it('opens a popup pointed at the startUrl with returnTo', async () => {
    const popup = { focus: vi.fn(), closed: false };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup);
    const wrapper = mount(GoogleSignInButton, {
      props: { returnTo: '/pre-join/ABC' },
    });
    await nextTick();
    await flush();
    wrapper.find('button').trigger('click');
    await flush();
    expect(openSpy).toHaveBeenCalled();
    const [url, name, features] = openSpy.mock.calls[0];
    expect(url).toContain('/auth/google/start');
    expect(url).toContain('returnTo=%2Fpre-join%2FABC');
    expect(name).toBe('koom-oauth');
    expect(features).toMatch(/width=520/);
  });

  it('emits signed-in when the postMessage callback delivers a token', async () => {
    vi.spyOn(window, 'open').mockReturnValue({ closed: false });
    const wrapper = mount(GoogleSignInButton, { props: { returnTo: '/x' } });
    await nextTick();
    await flush();
    wrapper.find('button').trigger('click');
    await flush();

    // The OAuth callback is served by the back, so event.origin is the
    // back's origin (cross-origin postMessage from the popup).
    const event = new MessageEvent('message', {
      origin: 'http://localhost:8080',
      data: {
        type: 'koom-oauth-success',
        token: 'jwt',
        user: { userId: 'u-1', displayName: 'A' },
        returnTo: '/x',
      },
    });
    window.dispatchEvent(event);
    await nextTick();

    expect(setTokenMock).toHaveBeenCalledWith('jwt');
    const emitted = wrapper.emitted('signed-in');
    expect(emitted).toBeTruthy();
    expect(emitted[0][0]).toEqual({ userId: 'u-1', displayName: 'A' });
  });

  it('ignores messages from a foreign origin', async () => {
    vi.spyOn(window, 'open').mockReturnValue({ closed: false });
    const wrapper = mount(GoogleSignInButton, { props: { returnTo: '/x' } });
    await nextTick();
    await flush();
    const event = new MessageEvent('message', {
      origin: 'https://attacker.example',
      data: { type: 'koom-oauth-success', token: 'evil' },
    });
    window.dispatchEvent(event);
    await nextTick();
    expect(setTokenMock).not.toHaveBeenCalled();
    expect(wrapper.emitted('signed-in')).toBeFalsy();
  });

  it('emits an error event when the popup was blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const wrapper = mount(GoogleSignInButton, { props: { returnTo: '/x' } });
    await nextTick();
    await flush();
    wrapper.find('button').trigger('click');
    await flush();
    const emitted = wrapper.emitted('error');
    expect(emitted).toBeTruthy();
    expect(emitted[0][0]).toMatch(/bloqueó|popup/);
  });

  it('emits an error event when the OAuth flow reports an error', async () => {
    vi.spyOn(window, 'open').mockReturnValue({});
    const wrapper = mount(GoogleSignInButton, { props: { returnTo: '/x' } });
    await nextTick();
    await flush();
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'http://localhost:8080',
        data: { type: 'koom-oauth-error', message: 'access_denied' },
      }),
    );
    await nextTick();
    const emitted = wrapper.emitted('error');
    expect(emitted).toBeTruthy();
    expect(emitted[0][0]).toBe('access_denied');
  });

  it('does not read popup.closed (COOP-safe)', async () => {
    // Returning a proxy whose `closed` getter throws proves the composable
    // never touches it. If a future change reintroduces polling, this test
    // will fail loudly.
    const trap = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'closed') {
            throw new Error('SecurityError: COOP blocks cross-origin closed access');
          }
          return undefined;
        },
      },
    );
    vi.spyOn(window, 'open').mockReturnValue(trap);
    const wrapper = mount(GoogleSignInButton, { props: { returnTo: '/x' } });
    await nextTick();
    await flush();
    expect(() => wrapper.find('button').trigger('click')).not.toThrow();
    await flush();
  });

  it('emits an error when the popup is closed manually (window focus)', async () => {
    vi.spyOn(window, 'open').mockReturnValue({ closed: false });
    const wrapper = mount(GoogleSignInButton, { props: { returnTo: '/x' } });
    await nextTick();
    await flush();
    wrapper.find('button').trigger('click');
    await flush();

    // Simulate the user closing the popup; the parent regains focus.
    window.dispatchEvent(new Event('focus'));
    // The composable's grace period is 350ms; wait a bit more.
    await new Promise((r) => setTimeout(r, 450));
    await nextTick();

    const emitted = wrapper.emitted('error');
    expect(emitted).toBeTruthy();
    expect(emitted.at(-1)[0]).toMatch(/cerró|antes/i);
    // The button must NOT stay stuck in "Abriendo…".
    expect(wrapper.text()).not.toMatch(/Abriendo/);
  });

  it('does not flip to error if a postMessage arrives during the focus grace period', async () => {
    vi.spyOn(window, 'open').mockReturnValue({ closed: false });
    const wrapper = mount(GoogleSignInButton, { props: { returnTo: '/x' } });
    await nextTick();
    await flush();
    wrapper.find('button').trigger('click');
    await flush();

    // Focus fires (user is interacting with the parent).
    window.dispatchEvent(new Event('focus'));
    // Within the grace period the OAuth callback delivers a token.
    await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'http://localhost:8080',
        data: {
          type: 'koom-oauth-success',
          token: 'jwt',
          user: { userId: 'u-1', displayName: 'A' },
        },
      }),
    );
    // Past the grace period; the focus handler should NOT re-flip to error.
    await new Promise((r) => setTimeout(r, 450));
    await nextTick();

    expect(wrapper.emitted('signed-in')).toBeTruthy();
    expect(wrapper.emitted('error')).toBeFalsy();
  });
});
