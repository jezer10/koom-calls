import { describe, expect, it } from 'vitest';
import { createSignalingClient, defaultSignaling } from './signaling-client.js';
import { APP_CONFIG } from '../config.js';

describe('api/signaling-client', () => {
  it('builds a namespaced URL', () => {
    const client = createSignalingClient('http://example.com', '/signaling');
    expect(client.url).toBe('http://example.com/signaling');
    expect(client.namespace).toBe('/signaling');
  });

  it('exposes a default instance driven by APP_CONFIG', () => {
    expect(defaultSignaling.namespace).toBe(APP_CONFIG.signalingNamespace);
    expect(defaultSignaling.url).toBe(
      `${APP_CONFIG.signalingUrl}${APP_CONFIG.signalingNamespace}`,
    );
  });
});
