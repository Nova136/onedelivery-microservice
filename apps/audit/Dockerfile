# Build from repo root: docker build -f apps/audit/Dockerfile -t audit .
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
RUN npm ci && npm run build --workspace=audit

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/apps/audit/dist ./dist
COPY --from=builder /app/apps/audit/package.json ./
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
