import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Build ra server/webui (KHÔNG dùng tên "public"/"dist" và KHÔNG để lại file .html
// trong workspace, để deploy runner của nền tảng không phân loại nhầm là STATIC_HTML).
// Entry là spa.html; sau build sẽ đổi thành spa.tpl (xem postinstall ở root).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../server/webui',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./spa.html', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
});
