import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Catalyst Slate serves this directory; catalyst.json points at client/dist.
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      // Defaults to the local BFF (functions/sanctio_api/local.js on :3001) so sign-in
      // works without deploying. Point SANCTIO_API at the Catalyst URL to develop the
      // frontend against the deployed backend instead.
      '/api': {
        target: process.env.SANCTIO_API || 'http://localhost:3001',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
