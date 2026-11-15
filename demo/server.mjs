// Outlet demo sunucusu: statik mağaza + olay toplama + yönetici API'si + AI asistanı. Çalıştır: node server.mjs
// Node >= 22.13. Ortam değişkenleri: PORT, ADMIN_PASSWORD, SESSION_SECRET, DATA_DIR, ASSISTANT_MODEL, ORDER_VERIFY, BACKUP_KEEP, SITE_URL.
// Yapı: lib/ (yapılandırma, kimlik, http) · services/ (iş mantığı) · routes/ (uçlar) · jobs/ (iş kuyruğu).
import http from 'node:http';
import { MODEL, PORT } from './lib/config.mjs';
import { store } from './lib/store.mjs';
import { handle } from './routes/handler.mjs';
import './jobs/index.mjs';

// Yakalanmayan söz reddi süreci düşürmesin: günlüğe yazılır, sunucu ayakta kalır.
const server = http.createServer(handle);
process.on('unhandledRejection', (/** @type {any} */ e) =>
  console.error('yakalanmayan söz reddi:', e?.stack || e),
);
for (const sig of ['SIGTERM', 'SIGINT'])
  process.on(sig, () => {
    console.log(sig + ': kapanıyor');
    server.close(() => {
      try {
        store.close();
      } catch {}
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  });
server.listen(PORT, () =>
  console.log(`Outlet demo: http://127.0.0.1:${PORT}  ·  panel: /admin  ·  asistan modeli: ${MODEL}`),
);
