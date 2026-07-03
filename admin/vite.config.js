import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Build ra thẳng server/public để Express phục vụ tĩnh.
// Dùng spa.html làm entry (KHÔNG đặt tên index.html ở repo để nền tảng deploy
// nhận diện đây là app Node, không phải STATIC_HTML). Sau build sẽ đổi tên
// spa.html -> index.html (xem script postinstall ở root package.json).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../server/public',
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
