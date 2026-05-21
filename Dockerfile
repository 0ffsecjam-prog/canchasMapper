FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ sqlite

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend ./
COPY frontend ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["node", "server.js"]
