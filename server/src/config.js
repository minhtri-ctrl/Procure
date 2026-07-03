import dotenv from 'dotenv';
dotenv.config();

// Hỗ trợ cả DATABASE_URL (mysql://user:pass@host:port/db) lẫn biến rời.
function parseDatabaseUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
    };
  } catch {
    return null;
  }
}

const fromUrl = parseDatabaseUrl(process.env.DATABASE_URL);

export const config = {
  port: Number(process.env.PORT || 8080),
  jwtSecret: process.env.JWT_SECRET || 'procureos-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  allowedDomain: process.env.ALLOWED_DOMAIN || 'garena.vn',
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@garena.vn',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    name: process.env.ADMIN_NAME || 'Administrator',
  },
  db: {
    host: fromUrl?.host || process.env.DB_HOST || '127.0.0.1',
    port: fromUrl?.port || Number(process.env.DB_PORT || 3306),
    user: fromUrl?.user || process.env.DB_USER || 'root',
    password: fromUrl?.password ?? process.env.DB_PASSWORD ?? '',
    database: fromUrl?.database || process.env.DB_NAME || 'procureos',
  },
};
