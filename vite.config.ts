import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: './src/frontend',
  publicDir: false,
  build: {
    outDir: '../../dist/frontend',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    host: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/frontend'),
    },
  },
  define: {
    'process.env': process.env,
  },
});