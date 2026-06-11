import { describe, expect, it } from 'vitest';
import { useRoomStore } from './room.js';
import { createPinia, setActivePinia } from 'pinia';

describe('stores/room', () => {
  it('starts with no room and no peers', () => {
    setActivePinia(createPinia());
    const store = useRoomStore();
    expect(store.roomId).toBeNull();
    expect(store.peers).toEqual([]);
  });

  it('setRoom and setPeers update state', () => {
    setActivePinia(createPinia());
    const store = useRoomStore();
    store.setRoom('ABC-DEF-GHI');
    store.setPeers([{ socketId: 's1', userId: 'u1' }]);
    expect(store.roomId).toBe('ABC-DEF-GHI');
    expect(store.peers).toEqual([{ socketId: 's1', userId: 'u1' }]);
  });

  it('setCall stores the backend id and the human roomId', () => {
    setActivePinia(createPinia());
    const store = useRoomStore();
    store.setCall({ id: 'call-uuid-1', roomId: 'AAA-BBB-CCC' });
    expect(store.callId).toBe('call-uuid-1');
    expect(store.roomId).toBe('AAA-BBB-CCC');
  });

  it('clear resets the store', () => {
    setActivePinia(createPinia());
    const store = useRoomStore();
    store.setCall({ id: 'call-uuid-1', roomId: 'ABC' });
    store.setPeers([{ socketId: 's1', userId: 'u1' }]);
    store.clear();
    expect(store.roomId).toBeNull();
    expect(store.callId).toBeNull();
    expect(store.peers).toEqual([]);
  });
});
