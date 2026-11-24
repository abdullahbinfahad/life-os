import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work on GitHub Pages under /<repo>/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Stable vendor chunks download in parallel and stay cached across app deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase') || id.includes('iceberg-js') || id.includes('tslib')) return 'vendor-supabase';
          if (id.includes('react-router') || id.includes('@remix-run')) return 'vendor-router';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('@dnd-kit')) return 'vendor-dnd';
          return 'vendor';
        },
      },
    },
  },
});
