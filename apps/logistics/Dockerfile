# Build from repo root: docker build -f apps/logistics/Dockerfile -t logistics .
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
RUN npm ci && npm run build --workspace=logistics

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/apps/logistics/dist ./dist
COPY --from=builder /app/apps/logistics/package.json ./
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
