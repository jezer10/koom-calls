import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Track, RoomEvent } from 'livekit-client';
import { useLiveKitRoom, findPublication } from '../useLiveKitRoom.js';

function makeFakeRoom() {
  const listeners = new Map();
  const remoteParticipants = new Map();
  return {
    listeners,
    remoteParticipants,
    _emit(event, payload) {
      for (const h of listeners.get(event) ?? []) h(payload);
    },
    on: vi.fn((event, handler) => {
      const arr = listeners.get(event) ?? [];
      arr.push(handler);
      listeners.set(event, arr);
    }),
    off: vi.fn((event, handler) => {
      const arr = listeners.get(event) ?? [];
      listeners.set(
        event,
        arr.filter((h) => h !== handler),
      );
    }),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    localParticipant: {
      publishTrack: vi.fn().mockResolvedValue({ sid: 'pub-1' }),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
      setCameraEnabled: vi.fn().mockResolvedValue(undefined),
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function makeRoomFactory(room) {
  return vi.fn(() => room);
}

describe('useLiveKitRoom', () => {
  let fakeRoom;
  let factory;
  let api;

  beforeEach(() => {
    fakeRoom = makeFakeRoom();
    factory = makeRoomFactory(fakeRoom);
    api = useLiveKitRoom({ roomFactory: factory, defaultUrl: 'wss://lk.test' });
  });

  it('connect() instantiates a Room, registers listeners, and calls Room.connect', async () => {
    await api.connect({ token: 'jwt-1' });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fakeRoom.on).toHaveBeenCalledWith(RoomEvent.Connected, expect.any(Function));
    expect(fakeRoom.on).toHaveBeenCalledWith(RoomEvent.Disconnected, expect.any(Function));
    expect(fakeRoom.on).toHaveBeenCalledWith(RoomEvent.ParticipantConnected, expect.any(Function));
    expect(fakeRoom.on).toHaveBeenCalledWith(RoomEvent.ParticipantDisconnected, expect.any(Function));
    expect(fakeRoom.on).toHaveBeenCalledWith(RoomEvent.TrackSubscribed, expect.any(Function));
    expect(fakeRoom.on).toHaveBeenCalledWith(RoomEvent.TrackUnsubscribed, expect.any(Function));
    expect(fakeRoom.on).toHaveBeenCalledWith(RoomEvent.MediaDevicesError, expect.any(Function));
    expect(fakeRoom.connect).toHaveBeenCalledWith('wss://lk.test', 'jwt-1');
    expect(api.state.value).toBe('connecting');
  });

  it('connect() marks the state as connected on the Connected event', async () => {
    await api.connect({ token: 'jwt-2' });
    fakeRoom._emit(RoomEvent.Connected, undefined);
    expect(api.state.value).toBe('connected');
  });

  it('connect() rejects and clears the room on failure', async () => {
    const err = new Error('connect-fail');
    fakeRoom.connect.mockRejectedValueOnce(err);
    await expect(api.connect({ token: 'jwt-3' })).rejects.toThrow('connect-fail');
    expect(api.state.value).toBe('disconnected');
    expect(api.error.value).toBe('connect-fail');
    expect(api.room.value).toBeNull();
  });

  it('connect() requires a token', async () => {
    await expect(api.connect({})).rejects.toThrow(/token is required/);
  });

  it('publishTrack() forwards to localParticipant.publishTrack', async () => {
    await api.connect({ token: 'jwt-4' });
    const track = { kind: Track.Kind.Video, sid: 'TR-1' };
    const pub = await api.publishTrack(track);
    expect(pub).toEqual({ sid: 'pub-1' });
    expect(fakeRoom.localParticipant.publishTrack).toHaveBeenCalledWith(track, undefined);
  });

  it('publishTrack() throws when the room is not connected', async () => {
    const track = { kind: Track.Kind.Video };
    await expect(api.publishTrack(track)).rejects.toThrow(/not connected/);
  });

  it('unpublishTrack() forwards to localParticipant.unpublishTrack', async () => {
    await api.connect({ token: 'jwt-5' });
    const track = { kind: Track.Kind.Audio, sid: 'TR-2' };
    await api.unpublishTrack(track);
    expect(fakeRoom.localParticipant.unpublishTrack).toHaveBeenCalledWith(track);
  });

  it('setCameraEnabled and setMicrophoneEnabled toggle local publish state', async () => {
    await api.connect({ token: 'jwt-6' });
    await api.setCameraEnabled(false);
    expect(fakeRoom.localParticipant.setCameraEnabled).toHaveBeenCalledWith(false);
    expect(api.cameraEnabled.value).toBe(false);
    await api.setMicrophoneEnabled(false);
    expect(fakeRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(api.microphoneEnabled.value).toBe(false);
  });

  it('setCameraEnabled still updates the flag when no room is connected', async () => {
    await api.setCameraEnabled(false);
    expect(api.cameraEnabled.value).toBe(false);
  });

  it('ParticipantConnected / Disconnected refresh remoteParticipants', async () => {
    await api.connect({ token: 'jwt-7' });
    const p1 = { identity: 'p1', sid: 'SP-1', trackPublications: new Map() };
    const p2 = { identity: 'p2', sid: 'SP-2', trackPublications: new Map() };
    fakeRoom.remoteParticipants.set(p1.identity, p1);
    fakeRoom._emit(RoomEvent.ParticipantConnected, p1);
    expect(api.remoteParticipants.value).toEqual([p1]);
    fakeRoom.remoteParticipants.set(p2.identity, p2);
    fakeRoom._emit(RoomEvent.ParticipantConnected, p2);
    expect(api.remoteParticipants.value).toHaveLength(2);
    fakeRoom.remoteParticipants.delete(p1.identity);
    fakeRoom._emit(RoomEvent.ParticipantDisconnected, p1);
    expect(api.remoteParticipants.value).toEqual([p2]);
  });

  it('disconnect() calls room.disconnect() and clears listeners + state', async () => {
    await api.connect({ token: 'jwt-8' });
    const offBefore = fakeRoom.off.mock.calls.length;
    await api.disconnect();
    expect(fakeRoom.disconnect).toHaveBeenCalled();
    expect(api.room.value).toBeNull();
    expect(api.state.value).toBe('disconnected');
    expect(api.remoteParticipants.value).toEqual([]);
    // The off() calls during teardown should outnumber the pre-disconnect off() calls.
    expect(fakeRoom.off.mock.calls.length).toBeGreaterThan(offBefore);
  });

  it('connect() after disconnect() creates a fresh Room instance', async () => {
    await api.connect({ token: 'jwt-9' });
    await api.disconnect();
    await api.connect({ token: 'jwt-10' });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe('findPublication', () => {
  it('returns undefined for a null participant', () => {
    expect(findPublication(null, 'video')).toBeUndefined();
  });

  it('finds a video publication for the given participant', () => {
    const videoPub = { kind: Track.Kind.Video, trackName: 'camera' };
    const audioPub = { kind: Track.Kind.Audio, trackName: 'mic' };
    const participant = {
      trackPublications: new Map([
        ['v1', videoPub],
        ['a1', audioPub],
      ]),
    };
    expect(findPublication(participant, 'video')).toBe(videoPub);
    expect(findPublication(participant, 'audio')).toBe(audioPub);
  });

  it('finds a screen-share video publication by name prefix', () => {
    const cam = { kind: Track.Kind.Video, trackName: 'camera' };
    const screen = { kind: Track.Kind.Video, trackName: 'screen-share' };
    const participant = {
      trackPublications: new Map([
        ['v1', cam],
        ['v2', screen],
      ]),
    };
    expect(findPublication(participant, 'screen')).toBe(screen);
  });
});
