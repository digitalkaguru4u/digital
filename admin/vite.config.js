import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The admin SPA is served by the Node server at /admin. In dev, API calls are proxied.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
