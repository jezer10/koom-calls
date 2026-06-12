import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useSignaling } from './useSignaling.js';

const socketMock = {
  connected: false,
  id: 'self-1',
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
};

vi.mock('../api/socket.js', () => ({
  getSocket: () => socketMock,
}));

describe('useSignaling', () => {
  beforeEach(() => {
    for (const fn of [
      'on',
      'off',
      'once',
      'emit',
      'connect',
      'disconnect',
      'removeAllListeners',
    ]) {
      socketMock[fn].mockClear();
    }
    socketMock.connected = false;
    socketMock.id = 'self-1';
  });

  it('attaches default listeners on creation', () => {
    useSignaling();
    expect(socketMock.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(socketMock.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(socketMock.on).toHaveBeenCalledWith(
      'connect_error',
      expect.any(Function),
    );
  });

  it('connect() forwards to the socket when not connected', () => {
    const api = useSignaling();
    api.connect();
    expect(socketMock.connect).toHaveBeenCalled();
  });

  it('joinRoom() rejects when required args are missing', async () => {
    const api = useSignaling();
    await expect(api.joinRoom('', 'u1')).rejects.toThrow(/required/);
    await expect(api.joinRoom('r', '')).rejects.toThrow(/required/);
  });

  it('joinRoom() emits "join" and resolves on "existing-users"', async () => {
    const api = useSignaling();
    const promise = api.joinRoom('r1', 'u1');
    expect(socketMock.emit).toHaveBeenCalledWith('join', {
      roomId: 'r1',
      userId: 'u1',
    });
    const onceCalls = socketMock.once.mock.calls;
    const existing = onceCalls.find((c) => c[0] === 'existing-users')?.[1];
    existing?.({
      socketIds: ['s-other'],
      members: [{ socketId: 's-other', userId: 'u2' }],
    });
    const result = await promise;
    expect(result.socketIds).toEqual(['s-other']);
    expect(api.joined.value).toBe(true);
    expect(api.peers.value).toHaveLength(2);
  });

  it('joinRoom() rejects on exception', async () => {
    const api = useSignaling();
    const promise = api.joinRoom('r1', 'u1');
    const onceCalls = socketMock.once.mock.calls;
    const onException = onceCalls.find((c) => c[0] === 'exception')?.[1];
    onException?.({ message: 'forbidden' });
    await expect(promise).rejects.toThrow('forbidden');
    expect(api.error.value).toBe('forbidden');
  });
});
