import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dev server proxies the WebSocket and the setup screen's data to the setlist server, which
// runs on its own port.
const serverPort = process.env.SERVER_HTTP_PORT ?? '8080';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/ws': { target: `ws://127.0.0.1:${serverPort}`, ws: true },
      '/api': { target: `http://127.0.0.1:${serverPort}` },
    },
  },
});
