import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('axios', () => ({
  default: {
    create: () => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      post: vi.fn(),
      get: vi.fn(),
    }),
  },
}));

import {
  anonymousLogin,
  getMe,
  getProviders,
  getWsToken,
  logout,
  getToken,
  clearToken,
} from '../auth.js';
import { apiClient, setStoredToken } from '../client.js';

describe('api/auth', () => {
  beforeEach(() => {
    setStoredToken(null);
  });
  afterEach(() => {
    setStoredToken(null);
    vi.clearAllMocks();
  });

  it('anonymousLogin posts to /auth/anonymous/login and returns the profile', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        userId: 'anon-1',
        displayName: 'Anon',
        email: null,
        picture: null,
        provider: 'anonymous',
      },
    });
    const result = await anonymousLogin({ displayName: 'Anon' });
    expect(postSpy).toHaveBeenCalledWith('/auth/anonymous/login', {
      displayName: 'Anon',
    });
    expect(result).toEqual({
      userId: 'anon-1',
      displayName: 'Anon',
      email: null,
      picture: null,
      provider: 'anonymous',
    });
  });

  it('getProviders returns the providers list', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        providers: [
          { name: 'google', displayName: 'Google', enabled: true, startUrl: '/auth/google/start' },
          { name: 'anonymous', displayName: 'Guest', enabled: true },
        ],
      },
    });
    const list = await getProviders();
    expect(list).toEqual([
      { name: 'google', displayName: 'Google', enabled: true, startUrl: '/auth/google/start' },
      { name: 'anonymous', displayName: 'Guest', enabled: true },
    ]);
  });

  it('getProviders returns [] when response is malformed', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: {} });
    expect(await getProviders()).toEqual([]);
  });

  it('getMe returns the profile payload on 200', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        userId: 'u-1',
        displayName: 'Alice',
        email: 'a@x.com',
        picture: null,
        provider: 'google',
        lastLoginAt: null,
      },
    });
    const me = await getMe();
    expect(me.provider).toBe('google');
  });

  it('getMe returns null on 401/403', async () => {
    const err401 = { response: { status: 401 } };
    vi.spyOn(apiClient, 'get').mockRejectedValue(err401);
    expect(await getMe()).toBeNull();
    const err403 = { response: { status: 403 } };
    vi.spyOn(apiClient, 'get').mockRejectedValue(err403);
    expect(await getMe()).toBeNull();
  });

  it('getMe propagates other errors', async () => {
    const err500 = { response: { status: 500 } };
    vi.spyOn(apiClient, 'get').mockRejectedValue(err500);
    await expect(getMe()).rejects.toBe(err500);
  });

  it('getWsToken returns the WS token payload', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { token: 'ws.jwt', expiresAt: 12345 },
    });
    const result = await getWsToken();
    expect(result.token).toBe('ws.jwt');
  });

  it('logout posts to /auth/logout and clears the local token', async () => {
    setStoredToken('abc');
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { ok: true } });
    await logout();
    expect(postSpy).toHaveBeenCalledWith('/auth/logout');
    expect(getToken()).toBeNull();
  });

  it('logout swallows network errors but still clears the local token', async () => {
    setStoredToken('abc');
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('boom'));
    await logout();
    expect(getToken()).toBeNull();
  });

  it('clearToken removes the stored token', () => {
    setStoredToken('abc');
    expect(getToken()).toBe('abc');
    clearToken();
    expect(getToken()).toBeNull();
  });
});
