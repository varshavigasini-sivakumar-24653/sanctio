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
      // Local dev talks to the deployed Catalyst function so the frontend can be
      // developed against real Zoho Projects data without running the backend.
      '/api': {
        target:
          process.env.SANCTIO_API ||
          'https://sanctio-60083985672.development.catalystserverless.in',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
