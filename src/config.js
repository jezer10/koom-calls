export const APP_CONFIG = {
  signalingUrl:
    import.meta.env.VITE_SIGNALING_URL ?? 'http://localhost:8080',
  signalingNamespace:
    import.meta.env.VITE_SIGNALING_NAMESPACE ?? '/signaling',
  apiBaseUrl:
    import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api',
  sfuUrl:
    import.meta.env.VITE_SFU_URL ?? 'ws://localhost:7880',
  devAuthEnabled:
    (import.meta.env.VITE_DEV_AUTH_ENABLED ?? 'true') === 'true',
  peerConfig: {
    host: import.meta.env.VITE_PEER_HOST ?? 'localhost',
    port: Number(import.meta.env.VITE_PEER_PORT ?? 9000),
    path: import.meta.env.VITE_PEER_PATH ?? '/',
    key: import.meta.env.VITE_PEER_KEY ?? 'peerjs',
  },
  iceServers: import.meta.env.VITE_ICE_SERVERS
    ? import.meta.env.VITE_ICE_SERVERS.split(',').map((s) => {
        const [url, ...rest] = s.trim().split('|');
        const urls = url
          .split(';')
          .map((u) => u.trim())
          .filter(Boolean);
        const creds = {};
        for (const part of rest) {
          const [k, v] = part.split('=');
          if (k && v) creds[k.trim()] = v.trim();
        }
        return { urls, ...creds };
      })
    : [{ urls: 'stun:stun.l.google.com:19302' }],
};
