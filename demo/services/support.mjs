import crypto from 'node:crypto';
import { store } from '../lib/store.mjs';
import { recordSet, moveDocRows } from './records.mjs';

// Destek: ticket ve e-posta otomatik cevabı (K-21), kritik e-posta uyarısı (K-22), tekrarlayan şikayet raporu (K-23).
// HTTP bilmez. Gerçek e-posta GÖNDERİLMEZ: cevaplar yalnız ticket'ın `thread` listesine yazılan simülasyon metnidir.
// Depolama: ticket, uyarı ve şikayetler BÜYÜYEN koleksiyonlardır; satır tablosunda durur (services/records.mjs):
// support_tickets, support_alerts, support_complaints. Belgede (store.doc('support')) yalnız küçük ayar kalır: { minCount }.
// Eskiden hepsi tek JSON belgesiydi ve her yazma tüm belgeyi yeniden yazıyordu.

export const REFUND_PERCENT = 20;
// VARSAYIM: sunumda şikayet eşiği için sayı verilmedi; 5 varsayılan alınmıştır, belgedeki `minCount` ile değiştirilir.
export const DEFAULT_MIN_COMPLAINTS = 5;
// TAVANLAR: ticket'lar TAVANSIZDIR (eskiden 5000'de en eski ticket siliniyordu; kritik/resmi yazışma ve müşteri
// talebi kaybolmamalı). Yardımcı koleksiyonlar tavanlıdır: uyarı listesi (bildirim kopyası; asıl kayıt ticket'ta)
// ve şikayet günlüğü (rapor yalnız son şikayetleri sayar; eskiden de 5000'di).
const MAX_ALERTS = 500,
  MAX_COMPLAINTS = 5000;
const ticketRows = recordSet('support_tickets'),
  alertRows = recordSet('support_alerts'),
  complaintRows = recordSet('support_complaints');

// Hata türleri: invalid (girdi), notfound, conflict (durum uygun değil / kritik ticket'a otomatik cevap yasağı).
export class SupportError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new SupportError(code, msg);
};

/* ───────── sınıflandırma kalıpları (tek tablo; genişletmek için buraya satır ekle) ───────── */
// Küçük harfe çevrilmiş metin üzerinde aranır. `sender`: gönderen adresinde, `text`: konu + gövdede.
export const PATTERNS = {
  critical: {
    sender: [
      /\.bund\.de\b/,
      /\.justiz\b/,
      /zollamt/,
      /finanzamt/,
      /rechtsanwalt/,
      /anwalt/,
      /gericht/,
      /bafa\b/,
    ],
    text: [
      /rechtsanwalt/,
      /anwalt/,
      /avukat/,
      /gericht/,
      /mahkeme/,
      /mahnbescheid/,
      /abmahnung/,
      /widerspruch/,
      /datenschutzbeh(?:ö|oe)rde/,
      /zollamt/,
      /finanzamt/,
      /\bbafa\b/,
      /\bbundesnetzagentur\b/,
      /verbraucherzentrale/,
    ],
  },
  refund: [
    /retoure/,
    /r(?:ü|ue)ckgabe/,
    /erstattung/,
    /r(?:ü|ue)ckzahlung/,
    /widerruf/,
    /zur(?:ü|ue)ckgeben/,
    /refund/,
    /geld zur(?:ü|ue)ck/,
    /iade/,
  ],
  complaint: [
    /beschwerde/,
    /reklamation/,
    /defekt/,
    /kaputt/,
    /mangel/,
    /besch(?:ä|ae)digt/,
    /şikayet/,
    /sikayet/,
  ],
};
const anyMatch = (list, s) => list.filter(re => re.test(s));

// classify({from, subject, body}) → { kind, signals }. `critical` ÖNCE bakılır ve diğer her şeyi ezer.
export function classify({ from, subject, body } = /** @type {any} */ ({})) {
  const sender = String(from ?? '').toLowerCase();
  const text = `${subject ?? ''}\n${body ?? ''}`.toLowerCase();
  const crit = [
    ...anyMatch(PATTERNS.critical.sender, sender).map(re => `sender:${re.source}`),
    ...anyMatch(PATTERNS.critical.text, text).map(re => `text:${re.source}`),
  ];
  if (crit.length) return { kind: 'critical', signals: crit };
  const refund = anyMatch(PATTERNS.refund, text);
  if (refund.length) return { kind: 'refund', signals: refund.map(re => re.source) };
  const comp = anyMatch(PATTERNS.complaint, text);
  if (comp.length) return { kind: 'complaint', signals: comp.map(re => re.source) };
  return { kind: 'other', signals: [] };
}

/* ───────── durum ───────── */
// Eski kurulum: üç liste belgedeydi. Modül yüklenirken BİR KEZ satırlara taşınır (store.tx dışında: putMany kendi işlemini açar).
const legacy = key => d => (Array.isArray(d[key]) ? d[key] : []);
moveDocRows('support_tickets', 'support', { rows: legacy('tickets'), strip: d => delete d.tickets });
moveDocRows('support_alerts', 'support', { rows: legacy('alerts'), strip: d => delete d.alerts });
moveDocRows('support_complaints', 'support', { rows: legacy('complaints'), strip: d => delete d.complaints });

const minCountOf = () => {
  /** @type {any} */
  const d = store.doc('support', null) || {};
  return Number.isInteger(d.minCount) && d.minCount > 0 ? d.minCount : DEFAULT_MIN_COMPLAINTS;
};
// Oku-değiştir-yaz dizisi tek işlemde (kayıp güncelleme olmasın). store.tx iç içe açılamaz: fn içinde başka tx açılmaz.
const run = fn => store.tx(fn);
const uid = prefix => prefix + crypto.randomUUID().replaceAll('-', '').slice(0, 12);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const mustFind = id => ticketRows.get(id) || fail('notfound', 'Ticket yok');

// KESİNTİ KURALI (K-22): kritik (resmi kurum / avukat / düzenleyici) yazışmaya ajan ASLA kendi başına cevap yazmaz.
// Ajanın metin ürettiği HER yol (autoReply, customerReply) bu tek işlevden geçer; ihlal denemesi hata fırlatır.
function assertNoAgentReply(t) {
  if (t.kind === 'critical' || t.escalated)
    fail('conflict', 'Kritik yazışmaya otomatik cevap yazılamaz; yetkili insan cevaplamalıdır');
}

const addMsg = (t, by, text) => t.thread.push({ t: Date.now(), by, text });

// intake(mail) → ticket. Kritikse: escalated, needs_human, otomatik cevap YOK, uyarı kaydı düşer.
export function intake(mail) {
  const m = mail && typeof mail === 'object' ? mail : {};
  const from = str(m.from, 200),
    subject = str(m.subject, 300),
    body = str(m.body, 10000);
  if (!from) fail('invalid', 'from gerekli');
  if (!subject && !body) fail('invalid', 'subject ya da body gerekli');
  const orderId = str(typeof m.orderId === 'number' ? String(m.orderId) : m.orderId, 60) || null;
  const { kind, signals } = classify({ from, subject, body });
  return run(() => {
    const now = Date.now();
    const t = {
      id: uid('t_'),
      t: now,
      from,
      subject,
      body,
      kind,
      signals,
      status: 'open',
      orderId,
      thread: [{ t: now, by: 'customer', text: body || subject }],
      escalated: false,
      assignedTo: null,
    };
    if (kind === 'critical') {
      t.escalated = true;
      t.status = 'needs_human';
      addMsg(t, 'system', 'Kritik yazışma: otomatik cevap üretilmedi, yetkiliye bildirim gönderildi.');
      alertRows.put({
        id: uid('a_'),
        t: now,
        ticketId: t.id,
        from,
        subject,
        signals,
        notified: true,
        simulated: true,
      });
      alertRows.prune(MAX_ALERTS);
    }
    return ticketRows.put(t);
  });
}

// autoReply(ticketId) → yalnız iade talebine %20 kısmi iade teklifi.
export function autoReply(ticketId) {
  return run(() => {
    const t = mustFind(ticketId);
    assertNoAgentReply(t);
    if (t.kind !== 'refund') fail('conflict', 'Otomatik cevap yalnız iade talepleri için');
    if (t.status !== 'open') fail('conflict', `Ticket durumu uygun değil: ${t.status}`);
    const ref = t.orderId ? ` (Bestellung ${t.orderId})` : '';
    addMsg(
      t,
      'agent',
      `Guten Tag,\n\nvielen Dank für Ihre Nachricht${ref}. Als Entgegenkommen bieten wir Ihnen eine Teilerstattung von ${REFUND_PERCENT} % des Kaufpreises an, ohne dass Sie die Ware zurücksenden müssen. Wenn Sie einverstanden sind, antworten Sie bitte mit "Ja". Wenn Sie die Ware lieber zurücksenden möchten, antworten Sie mit "Retoure" und wir senden Ihnen ein DHL-Rücksendeetikett.\n\nFreundliche Grüße`,
    );
    t.status = 'offer_sent';
    return ticketRows.put(t);
  });
}

const word = list => new RegExp(`(?<![\\p{L}\\d])(?:${list.join('|')})(?![\\p{L}\\d])`, 'u');
const ACCEPT = word(['ja', 'einverstanden', 'akzeptiere', 'ok']);
const REJECT = word(['nein', 'retoure', 'zurücksenden', 'rücksendung']);
const NEGATE = word(['nicht', 'kein', 'keine', 'nie']);

// customerReply(ticketId, text): açık kabul → offer_accepted; açık ret → label_required (DHL etiketi);
// belirsiz (hiçbiri, ikisi birden, olumsuzlama) → needs_human. Tahmin edilmez, devredilir.
export function customerReply(ticketId, text) {
  const s = str(text, 5000);
  if (!s) fail('invalid', 'text gerekli');
  return run(() => {
    const t = mustFind(ticketId);
    assertNoAgentReply(t);
    if (t.status !== 'offer_sent') fail('conflict', `Teklif beklenmiyor (durum: ${t.status})`);
    addMsg(t, 'customer', s);
    const low = s.toLowerCase();
    const yes = ACCEPT.test(low),
      no = REJECT.test(low),
      neg = NEGATE.test(low);
    if (yes && !no && !neg) t.status = 'offer_accepted';
    else if (no && !yes) {
      t.status = 'label_required';
      t.labelRequested = true;
      addMsg(t, 'system', 'DHL iade etiketi talep edildi.');
    } else {
      t.status = 'needs_human';
      addMsg(t, 'system', 'Müşteri cevabı net yorumlanamadı; insana devredildi.');
    }
    return ticketRows.put(t);
  });
}

/* ───────── K-23: tekrarlayan şikayetler ───────── */
export function recordComplaint(input) {
  const o = input && typeof input === 'object' ? input : {};
  const poolId = str(o.poolId, 60),
    vendor = str(o.vendor, 120),
    supplier = str(o.supplier, 120) || vendor,
    reason = str(o.reason, 300);
  if (!poolId) fail('invalid', 'poolId gerekli');
  if (!supplier) fail('invalid', 'supplier ya da vendor gerekli');
  return run(() => {
    const c = complaintRows.put({ id: uid('c_'), t: Date.now(), poolId, vendor, supplier, reason });
    complaintRows.prune(MAX_COMPLAINTS);
    return c;
  });
}

export function setMinCount(n) {
  if (!Number.isInteger(n) || n < 1 || n > 1000) fail('invalid', 'minCount 1-1000 arası tam sayı olmalı');
  return run(() => {
    /** @type {any} */
    const d = store.doc('support', null) || {};
    d.minCount = n;
    store.saveDoc('support', d);
    return n;
  });
}

// complaintReport({ minCount? }) → eşiğe ulaşan (count >= minCount) ürün/tedarikçi çiftleri, çoktan aza.
export function complaintReport({ minCount } = /** @type {any} */ ({})) {
  let min = minCountOf();
  if (minCount !== undefined && minCount !== null && minCount !== '') {
    min = Number(minCount);
    if (!Number.isInteger(min) || min < 1) fail('invalid', 'minCount pozitif tam sayı olmalı');
  }
  const groups = new Map();
  for (const c of complaintRows.all()) {
    const k = c.supplier + '|' + c.poolId;
    const g = groups.get(k) || { supplier: c.supplier, poolId: c.poolId, count: 0, reasons: new Set() };
    g.count++;
    if (c.reason) g.reasons.add(c.reason);
    groups.set(k, g);
  }
  return [...groups.values()]
    .filter(g => g.count >= min)
    .sort((a, b) => b.count - a.count)
    .map(g => ({
      supplier: g.supplier,
      poolId: g.poolId,
      count: g.count,
      reasons: [...g.reasons],
      suggestion: `${g.supplier}: ${g.poolId} ürününde ${g.count} şikayet birikti; tedarikçiden indirim/tazminat talep edin.`,
    }));
}

/* ───────── okuma ───────── */
export const alerts = () => alertRows.all();
export const getTicket = id => ticketRows.get(id);
export function listTickets({ status, kind } = /** @type {any} */ ({})) {
  return ticketRows
    .all({ desc: true })
    .filter(t => (!status || t.status === status) && (!kind || t.kind === kind));
}
