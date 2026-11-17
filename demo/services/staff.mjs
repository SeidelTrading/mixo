import crypto from 'node:crypto';
import { recordSet, moveDocRows } from './records.mjs';

// SINIR: Bu modül YALNIZCA iş çıktısı metriklerini ölçer (ilk cevap süresi, çözüm süresi, ticket sayısı).
// Ekran görüntüsü, tuş kaydı, uygulama/süre takibi ya da herhangi bir gizli gözetim İÇERMEZ ve eklenmemelidir
// (GDPR, BetrVG §87). Ölçüm şeffaf olmalı, çalışanlara önceden bildirilmeli ve sözleşmeye/iş yeri anlaşmasına dayanmalıdır.

export const MIN_TEAM = 5;
const KINDS = ['first_reply', 'resolution'];

export class StaffError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new StaffError(code, msg);
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const MAX_RECORDS = 50000;

// İş kayıtları (sayısı kullanımla büyür) satır tablosunda durur; yazma yalnız yeni satıra dokunur.
// `staff` belgesinde artık kayıt listesi tutulmaz (eski kurulumlarda kalan liste aşağıda bir kez taşınır).
const records = recordSet('staff');
// Kimlik: rastgele UUID. 8 karakterlik kısaltma 50 bin kayıtta ≈ %25 çakışma verir ve çakışma kaydı SESSİZCE
// ezer; bu yüzden tam UUID kullanılır.
const newId = () => crypto.randomUUID();
// Eski belgedeki kayıtların kimliği yoktu: taşınırken üretilir; `t` zaten vardı, korunur.
export const legacyRows = d => (Array.isArray(d?.records) ? d.records : []).map(r => ({ ...r, id: newId() }));
export const legacyStrip = d => {
  delete d.records;
};
moveDocRows('staff', 'staff', { rows: legacyRows, strip: legacyStrip });

// recordWork({ user, kind, ms, ticketId }) → kayıt. Yalnız bu dört alan saklanır (+ zaman).
/** @param {{ user?: any, kind?: any, ms?: any, ticketId?: any }} [o] */
export function recordWork({ user, kind, ms, ticketId } = {}) {
  const u = str(user, 80),
    tid = str(typeof ticketId === 'number' ? String(ticketId) : ticketId, 80);
  if (!u) fail('invalid', 'user gerekli');
  if (!KINDS.includes(kind)) fail('invalid', `kind şunlardan biri olmalı: ${KINDS.join(', ')}`);
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) fail('invalid', 'ms pozitif sayı olmalı');
  if (!tid) fail('invalid', 'ticketId gerekli');
  // Tek `put` + tavan budaması: oku-değiştir-yaz dizisi yok, `tx` gerekmez. Tavan en eski kayıtları siler.
  const rec = records.put({ id: newId(), user: u, kind, ms, ticketId: tid, t: Date.now() });
  records.prune(MAX_RECORDS);
  const { id: _id, ...out } = rec;
  return out;
}

const avg = a => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
// En yakın sıra (nearest-rank) yöntemi: tek kayıtta p90 o kayıttır.
const p90 = a => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.ceil(0.9 * s.length) - 1];
};
const ts = (v, name) => {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(v);
  if (!Number.isFinite(n)) fail('invalid', `${name} geçerli bir tarih olmalı`);
  return n;
};

/** @param {{ from?: any, to?: any }} [o] */
export function performance({ from, to } = {}) {
  const f = ts(from, 'from'),
    e = ts(to, 'to');
  const by = new Map();
  for (const r of records.all()) {
    if ((f !== null && r.t < f) || (e !== null && r.t > e)) continue;
    if (!by.has(r.user)) by.set(r.user, { tickets: new Set(), fr: [], res: [] });
    const u = by.get(r.user);
    u.tickets.add(r.ticketId);
    (r.kind === 'first_reply' ? u.fr : u.res).push(r.ms);
  }
  const people = [...by.entries()]
    .map(([user, u]) => ({
      user,
      tickets: u.tickets.size,
      avgFirstReplyMs: avg(u.fr),
      avgResolutionMs: avg(u.res),
      p90ResolutionMs: p90(u.res),
    }))
    .sort((a, b) => a.user.localeCompare(b.user));
  const out = { people };
  if (people.length < MIN_TEAM)
    out.warning = `Ekipte ${people.length} kişi var (${MIN_TEAM}'ten az): kişi bazlı karşılaştırma yanıltıcıdır ve bireysel gözetime dönüşebilir. Ekip düzeyinde değerlendirin.`;
  return out;
}
