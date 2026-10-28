import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work on GitHub Pages under /<repo>/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    manifest: 'asset-manifest.json',
  },
});
