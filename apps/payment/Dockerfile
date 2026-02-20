# Build from repo root: docker build -f apps/payment/Dockerfile -t payment .
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
RUN npm ci && npm run build --workspace=payment

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/apps/payment/dist ./dist
COPY --from=builder /app/apps/payment/package.json ./
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
