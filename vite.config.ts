import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // ローカル開発時 `/api` を wrangler pages dev (8788) に転送する。
      // 本番では同一オリジンでサーブされるので proxy 不要。
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
