import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// base 由部署环境决定：GitHub Pages 子路径用 '/gecao/'，根域名用 '/'。
// 通过 VITE_BASE 覆盖，默认 '/'。
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
