FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production --no-fund --no-audit
COPY server.js .
EXPOSE 3015
CMD ["node", "server.js"]
