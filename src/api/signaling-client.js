import { APP_CONFIG } from '../config.js';

export function createSignalingClient(url, namespace) {
  const target = `${url}${namespace}`;
  return {
    url: target,
    namespace,
  };
}

export const defaultSignaling = createSignalingClient(
  APP_CONFIG.signalingUrl,
  APP_CONFIG.signalingNamespace,
);
