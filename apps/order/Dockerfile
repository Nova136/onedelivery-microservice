# Build from repo root: docker build -f apps/order/Dockerfile -t order .
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
RUN npm ci && npm run build --workspace=order

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/apps/order/dist ./dist
COPY --from=builder /app/apps/order/package.json ./
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
