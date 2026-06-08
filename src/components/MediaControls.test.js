import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaControls from './MediaControls.vue';

describe('MediaControls', () => {
  it.each([
    [true, true, 'bg-gray-600', 'bg-gray-600'],
    [false, false, 'bg-red-500', 'bg-red-500'],
  ])(
    'applies the correct colors for camera=%s, microphone=%s',
    (camOn, micOn, camClass, micClass) => {
      const wrapper = mount(MediaControls, {
        props: { cameraOn: camOn, microphoneOn: micOn },
      });
      const camBtn = wrapper.find('[data-testid="toggle-camera"]');
      const micBtn = wrapper.find('[data-testid="toggle-microphone"]');
      expect(camBtn.classes()).toContain(camClass);
      expect(micBtn.classes()).toContain(micClass);
    },
  );

  it('emits toggle-camera, toggle-microphone, and leave events', async () => {
    const wrapper = mount(MediaControls, {
      props: { cameraOn: true, microphoneOn: true },
    });
    await wrapper.find('[data-testid="toggle-camera"]').trigger('click');
    await wrapper.find('[data-testid="toggle-microphone"]').trigger('click');
    await wrapper.find('[data-testid="leave-room"]').trigger('click');

    expect(wrapper.emitted('toggle-camera')).toBeTruthy();
    expect(wrapper.emitted('toggle-microphone')).toBeTruthy();
    expect(wrapper.emitted('leave')).toBeTruthy();
  });
});
