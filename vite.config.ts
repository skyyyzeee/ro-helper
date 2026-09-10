import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // Tauri's dev window expects a fixed port.
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  // The server law packs are bundled on purpose (the app runs offline from disk); the full
  // Тверской corpus is a few megabytes of JSON, so the default 500 kB warning is just noise.
  build: { chunkSizeWarningLimit: 5000 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
