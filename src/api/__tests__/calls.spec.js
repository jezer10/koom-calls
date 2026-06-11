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

import { getIceServers, getSfuToken, getCall, createCall, listMyCalls } from '../calls.js';
import { apiClient, setStoredToken } from '../client.js';

describe('api/calls', () => {
  beforeEach(() => {
    setStoredToken('jwt-abc');
  });
  afterEach(() => {
    setStoredToken(null);
    vi.clearAllMocks();
  });

  it('createCall POSTs to /calls and normalizes the response (server picks the roomId)', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        id: 'call-1',
        roomId: 'CALL-1',
        status: 'pending',
        visibility: 'link',
        creatorId: 'u-1',
        createdAt: '2026-01-01',
      },
    });
    const result = await createCall({ invitees: ['u-2'] });
    expect(postSpy).toHaveBeenCalledWith('/calls', {
      visibility: 'link',
      invitees: ['u-2'],
    });
    expect(result).toEqual({
      id: 'call-1',
      roomId: 'CALL-1',
      createdAt: '2026-01-01',
      visibility: 'link',
    });
  });

  it('createCall defaults to "link" visibility even if no payload is given', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { id: 'call-1', roomId: 'CALL-1', visibility: 'link' },
    });
    await createCall();
    expect(postSpy).toHaveBeenCalledWith('/calls', { visibility: 'link' });
  });

  it('createCall forwards an explicit "private" visibility', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { id: 'call-1', roomId: 'CALL-1', visibility: 'private' },
    });
    await createCall({ visibility: 'private' });
    expect(postSpy).toHaveBeenCalledWith('/calls', { visibility: 'private' });
  });

  it('listMyCalls GETs /calls/mine with no params by default', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { calls: [] },
    });
    const result = await listMyCalls();
    expect(getSpy).toHaveBeenCalledWith('/calls/mine', { params: {} });
    expect(result).toEqual([]);
  });

  it('listMyCalls forwards the status filter as a query param', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        calls: [
          {
            id: 'c-1',
            roomId: 'AAA-BBB-CCC',
            status: 'pending',
            visibility: 'link',
            creatorId: 'u-1',
            createdAt: '2026-01-01',
            participantCount: 1,
          },
        ],
      },
    });
    const result = await listMyCalls({ status: 'pending' });
    expect(getSpy).toHaveBeenCalledWith('/calls/mine', { params: { status: 'pending' } });
    expect(result).toEqual([
      {
        id: 'c-1',
        roomId: 'AAA-BBB-CCC',
        status: 'pending',
        visibility: 'link',
        creatorId: 'u-1',
        createdAt: '2026-01-01',
        participantCount: 1,
        startedAt: undefined,
        endedAt: undefined,
      },
    ]);
  });

  it('listMyCalls returns an empty array when the response is missing the calls key', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: {} });
    const result = await listMyCalls();
    expect(result).toEqual([]);
  });

  it('getCall throws when callId is missing', async () => {
    await expect(getCall()).rejects.toThrow(/required/);
  });

  it('getCall GETs /calls/:id and normalizes the response', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { _id: 'call-2', createdAt: '2026-01-01' },
    });
    const result = await getCall('call-2');
    expect(getSpy).toHaveBeenCalledWith('/calls/call-2');
    expect(result).toEqual({ id: 'call-2', roomId: 'call-2', createdAt: '2026-01-01' });
  });

  it('getIceServers throws when callId is missing', async () => {
    await expect(getIceServers()).rejects.toThrow(/required/);
  });

  it('getIceServers GETs /calls/:id/turn-credentials and extracts servers from multiple response shapes', async () => {
    const getSpy = vi.spyOn(apiClient, 'get');
    getSpy.mockResolvedValueOnce({ data: [{ urls: 'stun:x' }] });
    expect(await getIceServers('room-1')).toEqual([{ urls: 'stun:x' }]);
    expect(getSpy).toHaveBeenCalledWith('/calls/room-1/turn-credentials');

    getSpy.mockResolvedValueOnce({ data: { iceServers: [{ urls: 'turn:y' }] } });
    expect(await getIceServers('room-1')).toEqual([{ urls: 'turn:y' }]);

    getSpy.mockResolvedValueOnce({ data: { servers: [{ urls: 'stun:z' }] } });
    expect(await getIceServers('room-1')).toEqual([{ urls: 'stun:z' }]);

    getSpy.mockResolvedValueOnce({ data: { unrelated: true } });
    expect(await getIceServers('room-1')).toEqual([]);
  });

  it('getSfuToken returns the server response when available', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        token: 'real.jwt.token',
        url: 'wss://livekit.example.com',
        identity: 'user-1',
        roomName: 'room-1',
      },
    });
    const result = await getSfuToken('room-1');
    expect(postSpy).toHaveBeenCalledWith('/calls/room-1/sfu-token');
    expect(result).toEqual({
      token: 'real.jwt.token',
      url: 'wss://livekit.example.com',
      identity: 'user-1',
      roomName: 'room-1',
      mocked: false,
    });
  });

  it('getSfuToken synthesizes a mocked token on 404', async () => {
    const err = new Error('not found');
    err.response = { status: 404 };
    vi.spyOn(apiClient, 'post').mockRejectedValue(err);
    const result = await getSfuToken('room-2');
    expect(result.mocked).toBe(true);
    expect(result.token).toMatch(/^[\w-]+\.[\w-]+\.mocked$/);
    expect(result.identity).toMatch(/^guest-/);
    expect(result.roomName).toBe('room-2');
  });

  it('getSfuToken synthesizes a mocked token on 501', async () => {
    const err = new Error('not implemented');
    err.response = { status: 501 };
    vi.spyOn(apiClient, 'post').mockRejectedValue(err);
    const result = await getSfuToken('room-3');
    expect(result.mocked).toBe(true);
  });

  it('getSfuToken rethrows other errors', async () => {
    const err = new Error('boom');
    err.response = { status: 500 };
    vi.spyOn(apiClient, 'post').mockRejectedValue(err);
    await expect(getSfuToken('room-4')).rejects.toThrow('boom');
  });

  it('getSfuToken throws when callId is missing', async () => {
    await expect(getSfuToken()).rejects.toThrow(/required/);
  });
});
