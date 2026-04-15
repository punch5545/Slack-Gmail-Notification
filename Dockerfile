# --- Build stage ---
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# --- Production stage ---
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Token file will be stored in a volume
VOLUME /app/data
ENV TOKEN_PATH=/app/data/google-token.json

EXPOSE 3195

CMD ["node", "dist/index.js"]
