FROM node:25-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:25-alpine
WORKDIR /app

# node:25-alpine bundles npm 11.12.1 whose vendored deps carry CVE-2026-59873
# (tar, CRITICAL), CVE-2026-59874, CVE-2026-13149 (brace-expansion),
# CVE-2026-48815 (sigstore), CVE-2026-33671 (picomatch). npm 12 requires
# node ^22.22.2 || ^24.15.0 || >=26 (node 25 excluded), so pin npm 11.18.0
# (vendors tar 7.5.19, brace-expansion 5.0.7, sigstore 4.1.1).
# (CVE-2026-14257 needs brace-expansion 5.0.8, which no npm release vendors yet.)
RUN npm install -g npm@11.18.0

# CVE-2026-45447 (libcrypto3/libssl3 3.5.6-r0 -> 3.5.7-r0): pick up patched
# Alpine base packages instead of waiting for a node:25-alpine rebuild.
RUN apk upgrade --no-cache

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
