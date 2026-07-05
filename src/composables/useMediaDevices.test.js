import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useMediaDevices } from './useMediaDevices.js';

class FakeMediaStream {
  constructor(tracks) {
    this.tracks = tracks;
  }
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

class FakeTrack {
  constructor(kind) {
    this.kind = kind;
    this.enabled = true;
  }
  stop() {
    this.stopped = true;
  }
}

function mockedGetUserMedia() {
  return navigator.mediaDevices.getUserMedia;
}

describe('useMediaDevices', () => {
  let originalMediaDevices;

  beforeEach(() => {
    originalMediaDevices = global.navigator?.mediaDevices;
    Object.defineProperty(global.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(),
      },
    });
  });

  afterEach(() => {
    if (originalMediaDevices) {
      Object.defineProperty(global.navigator, 'mediaDevices', {
        configurable: true,
        value: originalMediaDevices,
      });
    } else {
      Object.defineProperty(global.navigator, 'mediaDevices', {
        configurable: true,
        value: undefined,
      });
    }
  });

  it('start() requests media and stores the stream', async () => {
    const stream = new FakeMediaStream([new FakeTrack('video')]);
    mockedGetUserMedia().mockResolvedValue(stream);
    const media = useMediaDevices();
    const result = await media.start();
    expect(result).toBe(stream);
    expect(media.stream.value).toBe(stream);
    expect(media.cameraOn.value).toBe(true);
    expect(media.microphoneOn.value).toBe(false);
  });

  it('start() surfaces the error message', async () => {
    mockedGetUserMedia().mockRejectedValue(new Error('NotAllowedError'));
    const media = useMediaDevices();
    await expect(media.start()).rejects.toThrow('NotAllowedError');
    expect(media.error.value).toBe('NotAllowedError');
  });

  it('start() retries without exact device ids when the selected device no longer exists', async () => {
    const stream = new FakeMediaStream([new FakeTrack('audio')]);
    const missing = new Error('Requested device not found');
    missing.name = 'NotFoundError';
    mockedGetUserMedia()
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce(stream);
    const media = useMediaDevices();
    const result = await media.start({
      audio: true,
      video: false,
      audioDeviceId: 'missing-mic',
    });
    expect(result).toBe(stream);
    expect(mockedGetUserMedia()).toHaveBeenNthCalledWith(1, {
      video: false,
      audio: { deviceId: { exact: 'missing-mic' } },
    });
    expect(mockedGetUserMedia()).toHaveBeenNthCalledWith(2, {
      video: false,
      audio: true,
    });
  });

  it('toggleCamera flips the video track enabled state', async () => {
    const videoTrack = new FakeTrack('video');
    const audioTrack = new FakeTrack('audio');
    const stream = new FakeMediaStream([videoTrack, audioTrack]);
    mockedGetUserMedia().mockResolvedValue(stream);
    const media = useMediaDevices();
    await media.start();
    expect(videoTrack.enabled).toBe(true);
    media.toggleCamera();
    expect(videoTrack.enabled).toBe(false);
    expect(media.cameraOn.value).toBe(false);
    media.toggleCamera();
    expect(videoTrack.enabled).toBe(true);
  });

  it('toggleMicrophone flips the audio track enabled state', async () => {
    const audioTrack = new FakeTrack('audio');
    const stream = new FakeMediaStream([audioTrack]);
    mockedGetUserMedia().mockResolvedValue(stream);
    const media = useMediaDevices();
    await media.start();
    media.toggleMicrophone();
    expect(audioTrack.enabled).toBe(false);
    expect(media.microphoneOn.value).toBe(false);
  });

  it('stop() releases the tracks and clears the state', async () => {
    const videoTrack = new FakeTrack('video');
    const stream = new FakeMediaStream([videoTrack]);
    mockedGetUserMedia().mockResolvedValue(stream);
    const media = useMediaDevices();
    await media.start();
    media.stop();
    expect(videoTrack.stopped).toBe(true);
    expect(media.stream.value).toBeNull();
  });
});
