# ---- Stage 1: build admin (React/Vite) ----
FROM node:20-alpine AS admin-build
WORKDIR /app/admin
COPY admin/package*.json ./
RUN npm install --no-fund --no-audit
COPY admin/ ./
RUN npm run build   # xuất ra /app/server/public

# ---- Stage 2: server runtime ----
FROM node:20-alpine AS server
WORKDIR /app/server
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm install --omit=dev --no-fund --no-audit
COPY server/ ./
# lấy bản build admin từ stage 1
COPY --from=admin-build /app/server/public ./public

EXPOSE 8080
CMD ["node", "src/index.js"]
