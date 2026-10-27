import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['maplibre-gl']
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true
      }
    }
  },
  define: {
    global: 'globalThis'
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/maplibre-gl/')) return 'maplibre';
          if (id.includes('/node_modules/@deck.gl/') || id.includes('/node_modules/@luma.gl/')) return 'deckgl';
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react-router/')) return 'react-vendor';
        }
      }
    }
  }
});
