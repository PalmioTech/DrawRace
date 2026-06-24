import { defineConfig } from 'vite';

// Vite config. `base: './'` keeps asset paths relative so the build can be
// served from any sub-path (useful for itch.io / static hosting / Capacitor).
export default defineConfig({
  base: './',
  server: {
    host: true, // expose on LAN so you can test on a real phone
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
