import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import VideoTile from './VideoTile.vue';

function makeMediaStream() {
  return {
    getTracks: () => [{ kind: 'video', enabled: true }],
  };
}

describe('VideoTile', () => {
  it('attaches the stream to the video element on mount', () => {
    const stream = makeMediaStream();
    const playSpy = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.play = playSpy;

    const wrapper = mount(VideoTile, {
      props: { stream, label: 'Tú', muted: true },
    });
    const video = wrapper.find('video').element;
    expect(video.srcObject).toEqual(stream);
    expect(playSpy).toHaveBeenCalled();
    expect(wrapper.text()).toContain('Tú');
  });

  it('reacts to stream prop changes', async () => {
    const playSpy = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.play = playSpy;

    const wrapper = mount(VideoTile, { props: { stream: null, label: 'A' } });
    const stream = makeMediaStream();
    await wrapper.setProps({ stream });
    expect(wrapper.find('video').element.srcObject).toEqual(stream);
  });

  it('renders the label and respects the muted prop', () => {
    const wrapper = mount(VideoTile, {
      props: { stream: null, label: 'Bob', muted: true },
    });
    expect(wrapper.find('video').element.muted).toBe(true);
    expect(wrapper.text()).toContain('Bob');
  });
});
