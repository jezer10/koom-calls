import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import RoomView from './RoomView.vue';
import { useUserStore } from '../stores/user.js';

const signalingMock = {
  socket: { value: { id: 'self-1' } },
  connected: { value: false },
  joined: { value: false },
  roomId: { value: null },
  selfSocketId: { value: 'self-1' },
  peers: { value: [] },
  error: { value: null },
  connect: vi.fn(),
  disconnect: vi.fn(),
  joinRoom: vi.fn().mockResolvedValue({ socketIds: [], members: [] }),
  emitSignal: vi.fn(),
  onUserJoined: vi.fn(),
  onUserLeft: vi.fn(),
  onSignal: vi.fn(),
  onException: vi.fn(),
  offAll: vi.fn(),
};

vi.mock('../composables/useSignaling.js', () => ({
  useSignaling: () => signalingMock,
}));

const rtcMock = {
  setLocalStream: vi.fn(),
  createOffer: vi.fn(),
  handleOffer: vi.fn(),
  handleAnswer: vi.fn(),
  addIceCandidate: vi.fn(),
  closePeer: vi.fn(),
  closeAll: vi.fn(),
  remoteStreams: { value: new Map() },
  peers: { value: new Map() },
};

vi.mock('../composables/useWebRTC.js', () => ({
  useMediaDevices: () => ({
    stream: { value: null },
    cameraOn: { value: false },
    microphoneOn: { value: false },
    error: { value: null },
    start: vi.fn().mockResolvedValue({ getTracks: () => [] }),
    stop: vi.fn(),
    toggleCamera: vi.fn(),
    toggleMicrophone: vi.fn(),
  }),
  useWebRTC: () => rtcMock,
}));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/room/:roomId', name: 'room', component: RoomView, props: true },
    ],
  });
}

describe('RoomView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    signalingMock.peers.value = [];
    signalingMock.selfSocketId.value = 'self-1';
    signalingMock.connected.value = false;
    signalingMock.joined.value = false;
    signalingMock.joinRoom.mockClear().mockResolvedValue({ socketIds: [], members: [] });
    signalingMock.onUserJoined.mockClear();
    signalingMock.onUserLeft.mockClear();
    signalingMock.onSignal.mockClear();
    signalingMock.disconnect.mockClear();
    rtcMock.closeAll.mockClear();
  });

  it('mounts and renders the room shell', async () => {
    const router = makeRouter();
    router.push('/room/ABC-DEF-GHI');
    await router.isReady();
    const wrapper = mount(RoomView, {
      global: { plugins: [router] },
      props: { roomId: 'ABC-DEF-GHI' },
    });
    expect(wrapper.find('[data-testid="room-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="media-controls"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true);
  });

  it('joins the signaling room on mount', async () => {
    const router = makeRouter();
    router.push('/room/ABC-DEF-GHI');
    await router.isReady();
    const user = useUserStore();
    user.setDisplayName('Alice');

    mount(RoomView, {
      global: { plugins: [router] },
      props: { roomId: 'ABC-DEF-GHI' },
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(signalingMock.joinRoom).toHaveBeenCalledWith('ABC-DEF-GHI', user.userId);
  });

  it('registers signal/peer listeners', () => {
    const router = makeRouter();
    router.push('/room/ABC-DEF-GHI');
    return router.isReady().then(() => {
      mount(RoomView, {
        global: { plugins: [router] },
        props: { roomId: 'ABC-DEF-GHI' },
      });
      expect(signalingMock.onUserJoined).toHaveBeenCalled();
      expect(signalingMock.onUserLeft).toHaveBeenCalled();
      expect(signalingMock.onSignal).toHaveBeenCalled();
    });
  });

  it('leave() closes the rtc peers and navigates home', async () => {
    const router = makeRouter();
    router.push('/room/ABC-DEF-GHI');
    await router.isReady();
    const pushSpy = vi.spyOn(router, 'push');

    const wrapper = mount(RoomView, {
      global: { plugins: [router] },
      props: { roomId: 'ABC-DEF-GHI' },
    });

    await wrapper.find('[data-testid="leave-room"]').trigger('click');

    expect(rtcMock.closeAll).toHaveBeenCalled();
    expect(signalingMock.disconnect).toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledWith({ name: 'home' });
  });
});
