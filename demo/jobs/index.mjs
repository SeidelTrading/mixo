import { store } from '../lib/store.mjs';
import { BACKUP_KEEP } from '../lib/config.mjs';
import { hooks } from '../services/settings.mjs';
import { IDLE_MS } from '../lib/auth.mjs';
import { VERIFY_HOURS, expireUnverified, orders } from '../services/orders.mjs';
import { SITE_URL } from '../lib/config.mjs';
import { pruneEvents } from '../services/analytics.mjs';
import { mk } from '../services/channels.mjs';

/* ───────── iş kuyruğu: kalıcı (jobs tablosu); 5 saniyede bir sıradaki işler çalışır ───────── */
// İşleyici { again: ms } dönerse iş o süre sonra yeniden planlanır. Hata olursa üstel beklemeyle yeniden denenir (max_attempts'e kadar).
const HOUR = 3600e3;
const JOBS = {
  backup() {
    const b = store.backup(BACKUP_KEEP);
    console.log(`yedek alındı: ${b.name} (${b.size} bayt)`);
    return { again: 24 * HOUR };
  },
  prune_events() {
    pruneEvents();
    return { again: 6 * HOUR };
  },
  housekeeping() {
    store.sessions.purge(IDLE_MS);
    store.logins.prune(90);
    store.jobs.prune(7);
    return { again: HOUR };
  },
  expire_unverified_orders() {
    expireUnverified();
    return { again: HOUR };
  },
  // Onay e-postası: e-posta sağlayıcısı bağlı olmadığı için simülasyon; panelde Pazarlama → simüle posta kutusuna düşer.
  order_confirm_mail({ id, token }) {
    const o = orders.find(x => x.id === id);
    if (!o || o.status !== 'unverified' || !token) return;
    mk.simMail({
      kind: 'order-confirm:' + o.id,
      name: 'Sipariş onayı',
      to: o.customer.email,
      subject: `Bitte bestätigen Sie Ihre Bestellung ${o.id}`,
      body: `Hallo ${o.customer.name},\n\nbitte bestätigen Sie Ihre Bestellung ${o.id} über diesen Link (gültig ${VERIFY_HOURS} Stunden):\n${SITE_URL}/api/orders/confirm?id=${encodeURIComponent(o.id)}&token=${token}\n\nOhne Bestätigung wird die Bestellung automatisch storniert.`,
    });
  },
};
const RECURRING = ['backup', 'prune_events', 'housekeeping', 'expire_unverified_orders'];
let jobBusy = false;
export async function runJobs() {
  if (jobBusy) return;
  jobBusy = true;
  try {
    for (let i = 0; i < 25; i++) {
      const j = store.jobs.claim();
      if (!j) break;
      try {
        const h = JOBS[j.type];
        if (!h) throw new Error('bilinmeyen iş türü: ' + j.type);
        const r = await h(j.payload);
        store.jobs.done(j.id);
        if (r?.again) store.jobs.enqueue(j.type, {}, { runAt: Date.now() + r.again, unique: true });
      } catch (e) {
        const retry = j.attempts < j.max_attempts;
        store.jobs.fail(
          j.id,
          e?.message || e,
          retry ? Date.now() + Math.min(HOUR, 30e3 * 2 ** (j.attempts - 1)) : null,
        );
        console.error(
          `iş hatası #${j.id} ${j.type} (deneme ${j.attempts}/${j.max_attempts}): ${e?.message || e}`,
        );
        if (!retry && RECURRING.includes(j.type))
          store.jobs.enqueue(j.type, {}, { runAt: Date.now() + HOUR, unique: true });
      }
    }
  } finally {
    jobBusy = false;
  }
}
{
  const back = store.jobs.recover();
  if (back) console.log(`${back} yarım kalmış iş yeniden sıraya alındı`);
  // Son 24 saatte yedek yoksa hemen alınır; varsa bir sonraki yedek son yedekten 24 saat sonraya planlanır.
  const last = store.listBackups()[0]?.t || 0;
  for (const t of RECURRING)
    store.jobs.enqueue(
      t,
      {},
      { runAt: t === 'backup' ? Math.max(Date.now(), last + 24 * HOUR) : Date.now(), unique: true },
    );
}
hooks.runJobs = runJobs;
setInterval(runJobs, 5000).unref();
setTimeout(runJobs, 500).unref();
