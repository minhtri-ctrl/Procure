// Sinh file entry HTML cho Vite ngay trước khi build.
// Không commit file .html vào repo để nền tảng deploy KHÔNG phân loại là STATIC_HTML.
import fs from 'node:fs';

const html = `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ProcureOS Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;

fs.writeFileSync(new URL('./spa.html', import.meta.url), html);
console.log('[gen-entry] đã tạo admin/spa.html');
