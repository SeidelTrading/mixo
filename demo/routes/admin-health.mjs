import fs from 'node:fs';
import { send } from '../lib/http.mjs';
import { store } from '../lib/store.mjs';
import { MAX_ORDERS, orders } from '../services/orders.mjs';
import { EVENT_MAX, events } from '../services/analytics.mjs';

// Sağlık ucu (tüm roller okuyabilir).
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
export async function adminHealthRoutes(c) {
  const { res, p } = c;
  // Bellekte tutulan veri ve disk durumu: tavanlara yaklaşılırsa (≥%80) uyarı bayrağı döner; ölçek kararının girdisi.
  if (p === '/api/admin/health') {
    const mem = process.memoryUsage(),
      bk = store.listBackups(),
      ratio = { orders: orders.length / MAX_ORDERS, events: events.length / EVENT_MAX };
    return send(res, 200, {
      uptimeS: Math.round(process.uptime()),
      memory: { rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576) },
      orders: { n: orders.length, max: MAX_ORDERS },
      events: { n: events.length, max: EVENT_MAX },
      dbMb: Math.round((fs.statSync(store.file).size / 1048576) * 10) / 10,
      backups: { n: bk.length, last: bk[0]?.t || null },
      warnings: Object.entries(ratio)
        .filter(([, r]) => r >= 0.8)
        .map(
          ([k]) =>
            `${k} tavanın %80'ini aştı: bellekte tutma modeli gözden geçirilmeli (bkz. ARCHITECTURE.md)`,
        ),
    });
  }
}
