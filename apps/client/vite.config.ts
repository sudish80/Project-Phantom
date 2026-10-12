import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const server = process.env.PHANTOM_SERVER ?? 'http://127.0.0.1:3000';

export default defineConfig({
  root,
  plugins: [react()],
  publicDir: path.resolve(root, '../../public'),
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/socket.io': { target: server, ws: true, changeOrigin: true },
      '/api': { target: server, changeOrigin: true },
    },
  },
  build: {
    outDir: path.resolve(root, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: { output: { manualChunks: { three: ['three'], react: ['react', 'react-dom'] } } },
  },
});
