import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import JoinModal from './JoinModal.vue';

describe('JoinModal', () => {
  it('renders an input and a submit button', () => {
    const wrapper = mount(JoinModal);
    expect(wrapper.find('[data-testid="room-code-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="join-submit"]').exists()).toBe(true);
  });

  it('disables the submit button when the input is empty', () => {
    const wrapper = mount(JoinModal);
    const button = wrapper.find('[data-testid="join-submit"]');
    expect(button.element.disabled).toBe(true);
  });

  it('emits "close" when the close icon is clicked', async () => {
    const wrapper = mount(JoinModal);
    await wrapper.find('button[aria-label="Cerrar"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('uses the validate prop and surfaces its error message', async () => {
    const validate = (v) => (v === 'ABC' ? true : 'use ABC');
    const wrapper = mount(JoinModal, {
      props: { validate },
    });
    await wrapper.find('[data-testid="room-code-input"]').setValue('XXX');
    await wrapper.find('[data-testid="join-submit"]').trigger('click');
    const error = wrapper.find('[data-testid="join-error"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toBe('use ABC');
  });

  it('emits "join" with the trimmed uppercase value when valid', async () => {
    const validate = () => true;
    const wrapper = mount(JoinModal, { props: { validate } });
    await wrapper
      .find('[data-testid="room-code-input"]')
      .setValue('  abc-def-ghi  ');
    await wrapper.find('[data-testid="join-submit"]').trigger('click');
    expect(wrapper.emitted('join')?.[0]).toEqual(['ABC-DEF-GHI']);
  });
});
