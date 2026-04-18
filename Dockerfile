FROM node:25-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:25-alpine
WORKDIR /app

# Install server dependencies
COPY server/package.json ./server/
RUN cd server && npm install --production

# Copy server code
COPY server/ ./server/

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Data directory for SQLite
RUN mkdir -p /data

ENV PORT=80
ENV DATA_DIR=/data
ENV NODE_ENV=production

EXPOSE 80
CMD ["node", "server/index.js"]
