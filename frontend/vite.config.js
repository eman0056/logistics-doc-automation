import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['pdfjs-dist']
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // ── n8n CORS proxy ──────────────────────────────────────────────────
      // Must come BEFORE the general /api rule so it matches first.
      // Browser calls /api/n8n/webhook/... → forwarded to n8n without CORS.
      '/api/n8n': {
        target: 'https://n8n.provelopers.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/n8n/, ''),
      },
      // ── Backend (Python server.py) ──────────────────────────────────────
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
