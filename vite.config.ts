import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// package.json holds the version for both the app (tauri.conf.json points at it) and the settings' «о программе».
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  // Tauri's dev window expects a fixed port.
  // Rust builds under src-tauri lock files the watcher would trip over.
  server: { host: '127.0.0.1', port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  // The server law packs are bundled on purpose (the app runs offline from disk); the full
  // Тверской corpus is a few megabytes of JSON, so the default 500 kB warning is just noise.
  build: { chunkSizeWarningLimit: 5000 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // UI tests type into the whole app over the real 49-document pack; in jsdom, and with every file
    // running at once, the longest (opening a document's table of contents) take several seconds.
    testTimeout: 15_000,
  },
});
