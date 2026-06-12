import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import RoomView from './RoomView.vue';

const mocks = vi.hoisted(() => {
  const signaling = {
    socket: { value: { id: 'self-1' } },
    connected: { value: false },
    joined: { value: false },
    roomId: { value: null },
    selfSocketId: { value: 'self-1' },
    peers: { value: [] },
    error: { value: null },
    callState: { value: 'idle' },
    activeCallId: { value: null },
    sfuRoom: { value: null },
    connect: vi.fn(),
    disconnect: vi.fn(),
    joinRoom: vi.fn().mockResolvedValue({ socketIds: [], members: [] }),
    emitSfuJoinRoom: vi.fn(),
    emitSfuPublishTrack: vi.fn(),
    emitCallInvite: vi.fn(),
    onCallInvite: vi.fn(),
    onCallRinging: vi.fn(),
    onCallAccept: vi.fn(),
    onCallHangup: vi.fn(),
    onPeerJoined: vi.fn(),
    onPeerLeft: vi.fn(),
    onSfuJoinRoom: vi.fn(),
    onSfuPublishTrack: vi.fn(),
    onSfuSubscribeTrack: vi.fn(),
    offAll: vi.fn(),
  };
  const livekit = {
    room: { value: null },
    state: { value: 'idle' },
    remoteParticipants: { value: [] },
    cameraEnabled: { value: true },
    microphoneEnabled: { value: true },
    error: { value: null },
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    publishTrack: vi.fn().mockResolvedValue({ sid: 'pub-1' }),
    unpublishTrack: vi.fn().mockResolvedValue(undefined),
    setCameraEnabled: vi.fn().mockResolvedValue(undefined),
    setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
  };
  const media = {
    stream: { value: null },
    cameraOn: { value: false },
    microphoneOn: { value: false },
    error: { value: null },
    start: vi.fn(),
    stop: vi.fn(),
    toggleCamera: vi.fn().mockReturnValue(false),
    toggleMicrophone: vi.fn().mockReturnValue(false),
  };
  const auth = {
    getMe: vi.fn().mockResolvedValue({ userId: 'u1', displayName: 'Alice', provider: 'google' }),
    getWsToken: vi.fn().mockResolvedValue({ token: 'ws.jwt', expiresAt: 0 }),
    getToken: vi.fn().mockReturnValue(null),
    clearToken: vi.fn(),
  };
  const calls = {
    getIceServers: vi.fn().mockResolvedValue([{ urls: 'stun:stun.l.google.com:19302' }]),
    getSfuToken: vi.fn().mockResolvedValue({
      token: 'sfu.jwt',
      url: 'wss://lk.test',
      identity: 'guest-x',
      roomName: 'ABC-DEF-GHI',
      mocked: true,
    }),
    createCall: vi.fn(),
    joinCall: vi.fn().mockResolvedValue({ id: 'c-1', roomId: 'ABC-DEF-GHI', status: 'active', participants: [] }),
    getCall: vi.fn(),
  };
  return { signaling, livekit, media, auth, calls };
});

vi.mock('../composables/useSignaling.js', () => ({
  useSignaling: () => ({ ...mocks.signaling, connectWithToken: vi.fn() }),
  SIGNALING_EVENTS: {
    CallInvite: 'call:invite',
    CallRinging: 'call:ringing',
    CallAccept: 'call:accept',
    PeerJoined: 'peer:joined',
    PeerLeft: 'peer:left',
    SfuJoinRoom: 'sfu:join-room',
    SfuPublishTrack: 'sfu:publish-track',
    SfuSubscribeTrack: 'sfu:subscribe-track',
  },
}));

vi.mock('../composables/useLiveKitRoom.js', () => ({
  useLiveKitRoom: () => mocks.livekit,
  findPublication: vi.fn().mockReturnValue(null),
}));

vi.mock('../composables/useMediaDevices.js', () => ({
  useMediaDevices: () => mocks.media,
}));

vi.mock('../api/auth.js', () => ({
  getMe: mocks.auth.getMe,
  getWsToken: mocks.auth.getWsToken,
  getToken: mocks.auth.getToken,
  clearToken: mocks.auth.clearToken,
  anonymousLogin: vi.fn(),
  logout: vi.fn(),
  getProviders: vi.fn(),
  setToken: vi.fn(),
}));

vi.mock('../api/calls.js', () => ({
  getIceServers: mocks.calls.getIceServers,
  getSfuToken: mocks.calls.getSfuToken,
  createCall: mocks.calls.createCall,
  getCall: vi.fn(),
  joinCall: mocks.calls.joinCall,
}));

vi.mock('livekit-client', () => ({
  createLocalTracks: vi.fn().mockResolvedValue([
    { kind: 'video', sid: 'LV-1', attach: vi.fn(), detach: vi.fn(), stop: vi.fn() },
    { kind: 'audio', sid: 'LA-1', attach: vi.fn(), detach: vi.fn(), stop: vi.fn() },
  ]),
  Track: { Kind: { Video: 'video', Audio: 'audio' } },
  RoomEvent: {
    Connected: 'connected',
    Disconnected: 'disconnected',
    ParticipantConnected: 'participantConnected',
  },
  Room: vi.fn(),
}));

function fakeStream() {
  return {
    getTracks: () => [
      { kind: 'video', enabled: true, getSettings: () => ({ deviceId: 'v1' }) },
      { kind: 'audio', enabled: true, getSettings: () => ({ deviceId: 'a1' }) },
    ],
    getVideoTracks: () => [{ kind: 'video' }],
    getAudioTracks: () => [{ kind: 'audio' }],
  };
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/room/:roomId', name: 'room', component: RoomView, props: true },
    ],
  });
}

async function mountRoom(propsOverride = {}) {
  const router = makeRouter();
  router.push(`/room/${propsOverride.roomId ?? 'ABC-DEF-GHI'}`);
  await router.isReady();
  const wrapper = mount(RoomView, {
    global: { plugins: [router] },
    props: { roomId: 'ABC-DEF-GHI', ...propsOverride },
  });
  // Bootstrap fires a chain of awaits (media.start → getIceServers/getSfuToken
  // → livekit.connect → createLocalTracks → signaling.joinRoom). Flush several
  // micro-tasks so the chain settles.
  for (let i = 0; i < 5; i += 1) {
    await flushPromises();
  }
  return { wrapper, router };
}

describe('RoomView (LiveKit SFU)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // jsdom's HTMLMediaElement.play raises "Not implemented". Override it with
    // a no-op stub so VideoTile's render path stays quiet.
    HTMLMediaElement.prototype.play = function play() {
      return Promise.resolve();
    };
    for (const m of [mocks.calls, mocks.auth, mocks.livekit, mocks.media, mocks.signaling]) {
      for (const v of Object.values(m)) {
        if (v && typeof v === 'object' && typeof v.mockClear === 'function') {
          v.mockClear();
        } else if (typeof v === 'function' && v.mockClear) {
          v.mockClear();
        }
      }
    }
    mocks.livekit.connect.mockResolvedValue(undefined);
    mocks.livekit.publishTrack.mockResolvedValue({ sid: 'pub-1' });
    mocks.livekit.disconnect.mockResolvedValue(undefined);
    mocks.livekit.state.value = 'idle';
    mocks.livekit.remoteParticipants.value = [];
    mocks.media.start.mockResolvedValue(fakeStream());
    mocks.signaling.joinRoom.mockResolvedValue({ socketIds: [], members: [] });
    mocks.signaling.selfSocketId.value = 'self-1';
    mocks.auth.getToken.mockReturnValue('jwt-1');
  });

  it('renders the room shell', async () => {
    const { wrapper } = await mountRoom();
    expect(wrapper.find('[data-testid="room-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="media-controls"]').exists()).toBe(true);
    // The local video tile should appear once bootstrap finishes.
    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('on mount: registers as participant, fetches ICE servers and SFU token, connects LiveKit, publishes tracks', async () => {
    const { wrapper } = await mountRoom();
    expect(mocks.calls.joinCall).toHaveBeenCalledWith('ABC-DEF-GHI');
    expect(mocks.calls.getIceServers).toHaveBeenCalled();
    expect(mocks.calls.getSfuToken).toHaveBeenCalledWith('ABC-DEF-GHI');
    expect(mocks.livekit.connect).toHaveBeenCalledWith({
      url: 'wss://lk.test',
      token: 'sfu.jwt',
    });
    expect(mocks.livekit.publishTrack).toHaveBeenCalled();
    expect(mocks.signaling.joinRoom).toHaveBeenCalledWith('ABC-DEF-GHI', expect.any(String));
    expect(mocks.signaling.emitSfuJoinRoom).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'ABC-DEF-GHI', mocked: true }),
    );
    expect(wrapper.find('[data-testid="room-error"]').exists()).toBe(false);
  });

  it('surfaces an error when joinCall rejects (e.g. private call without invite)', async () => {
    mocks.calls.joinCall.mockRejectedValueOnce(new Error('not a participant'));
    const { wrapper } = await mountRoom();
    expect(wrapper.find('[data-testid="room-error"]').text()).toContain('not a participant');
  });

  it('leave() disconnects the LiveKit room, the socket, and navigates home', async () => {
    const { wrapper, router } = await mountRoom();
    const pushSpy = vi.spyOn(router, 'push');
    await wrapper.find('[data-testid="leave-room"]').trigger('click');
    expect(mocks.livekit.disconnect).toHaveBeenCalled();
    expect(mocks.signaling.disconnect).toHaveBeenCalled();
    expect(mocks.media.stop).toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledWith({ name: 'home' });
  });

  it('surfaces an error message when LiveKit connect fails', async () => {
    mocks.livekit.connect.mockRejectedValueOnce(new Error('sfu-down'));
    const { wrapper } = await mountRoom();
    expect(wrapper.find('[data-testid="room-error"]').text()).toContain('sfu-down');
  });
});
