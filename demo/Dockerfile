FROM node:22-alpine
WORKDIR /srv
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
# Node 22 zorunlu: sunucu yerleşik node:sqlite kullanır. Veritabanı (mixo.db) ve yedekler (backups/) DATA_DIR altındadır;
# DATA_DIR kalıcı diske bağlı değilse her dağıtımda sıfırlanır.
# Kök yerine yetkisiz kullanıcıyla çalış. Veri klasörü (varsayılan /srv/store) bu kullanıcıya ait olmalı.
# Railway'de DATA_DIR'e kalıcı disk bağlıysa disk root sahipliğinde gelir: o serviste RAILWAY_RUN_UID=0 verin.
RUN mkdir -p /srv/store && chown -R node:node /srv/store
USER node
ENV NODE_ENV=production
CMD ["node","server.mjs"]
