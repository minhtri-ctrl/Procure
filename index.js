// Entry point ở thư mục gốc — giúp nền tảng deploy nhận diện đây là app Node
// và khởi động server Express (nằm trong server/src/index.js).
import('./server/src/index.js').catch((e) => {
  console.error('Không khởi động được server:', e);
  process.exit(1);
});
