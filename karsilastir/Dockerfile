FROM node:22-alpine
WORKDIR /srv
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
# Node 22 zorunlu: yerleşik node:sqlite. Veritabanı DATA_DIR altında; Railway'de DATA_DIR kalıcı diske (volume) bağlanır.
RUN mkdir -p /data && chown -R node:node /data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 DATA_DIR=/data
CMD ["node","server.mjs"]
