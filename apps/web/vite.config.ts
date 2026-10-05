import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:4000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const hostHeader = req.headers.host;
              if (!hostHeader) return;
              const hostname = hostHeader.split(':')[0]?.trim();
              if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
                return;
              }
              proxyReq.setHeader('X-Vault-Host', hostname);
            });
          },
        },
      },
    },
  };
});
