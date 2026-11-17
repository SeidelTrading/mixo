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
    // Belge boyutu doğrudan gecikme demektir: her yazma TÜM belgeyi yeniden yazar (ölçüm: 4-5 MB ≈ 150 ms,
    // 35 MB ≈ 640 ms olay döngüsü bloke). Eşiği aşan belge, kayıtlarının recs tablosuna taşınması gerektiğini söyler.
    const DOC_WARN_MB = 2,
      sizes = store.docSizes(),
      bigDocs = sizes.filter(d => d.bytes > DOC_WARN_MB * 1048576);
    return send(res, 200, {
      uptimeS: Math.round(process.uptime()),
      memory: { rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576) },
      orders: { n: orders.length, max: MAX_ORDERS },
      events: { n: events.length, max: EVENT_MAX },
      dbMb: Math.round((fs.statSync(store.file).size / 1048576) * 10) / 10,
      backups: { n: bk.length, last: bk[0]?.t || null },
      docs: sizes.slice(0, 10).map(d => ({ key: d.key, kb: Math.round(d.bytes / 1024) })),
      recs: store.recs.counts(),
      warnings: [
        ...Object.entries(ratio)
          .filter(([, r]) => r >= 0.8)
          .map(
            ([k]) =>
              `${k} tavanın %80'ini aştı: bellekte tutma modeli gözden geçirilmeli (bkz. ARCHITECTURE.md)`,
          ),
        ...bigDocs.map(
          d =>
            `kv/${d.key} belgesi ${Math.round(d.bytes / 1048576)} MB: her yazma tüm belgeyi yeniden yazıyor, kayıtları recs tablosuna taşınmalı (bkz. services/records.mjs)`,
        ),
      ],
    });
  }
}
