// Destek servisi birim testleri (K-21, K-22, K-23). Çalıştır: node --test test/unit-support.mjs   (Node >= 22.13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mixo-unit-'));
process.env.ADMIN_PASSWORD = 'birim-test-parolasi-1';
process.env.SESSION_SECRET = 'birim-test-secret';
process.env.RAILWAY_ENVIRONMENT = '';
process.env.ORDER_VERIFY = 'off';

const sup = await import('../services/support.mjs');
const { store } = await import('../lib/store.mjs');
const { recordSet } = await import('../services/records.mjs');

test.after(() => {
  store.close?.();
});

const refundMail = () =>
  sup.intake({
    from: 'kunde@example.com',
    subject: 'Retoure',
    body: 'Ich möchte eine Rückgabe.',
    orderId: 'M-1',
  });
const offered = () => sup.autoReply(refundMail().id);

test('resmi kurum e-postası critical sınıflanır, cevap üretilmez, uyarı düşer', () => {
  const before = sup.alerts().length;
  const t = sup.intake({
    from: 'poststelle@finanzamt-berlin.de',
    subject: 'Anfrage',
    body: 'Bitte Unterlagen einreichen.',
  });
  assert.equal(t.kind, 'critical');
  assert.equal(t.escalated, true);
  assert.equal(t.status, 'needs_human');
  assert.ok(!t.thread.some(m => m.by === 'agent'));
  assert.equal(sup.alerts().length, before + 1);
  assert.equal(sup.alerts().at(-1).ticketId, t.id);
});

test('critical iade sözcüğünü ezer (avukat + iade)', () => {
  const c = sup.classify({
    from: 'x@kanzlei.de',
    subject: 'Rückgabe',
    body: 'Unser Rechtsanwalt fordert Erstattung. Abmahnung.',
  });
  assert.equal(c.kind, 'critical');
  assert.ok(c.signals.length > 0);
});

test('critical ticket üzerinde autoReply ve customerReply conflict verir', () => {
  const t = sup.intake({ from: 'a@amtsgericht.justiz.de', subject: 'Mahnbescheid', body: 'Zustellung' });
  assert.throws(
    () => sup.autoReply(t.id),
    e => e instanceof sup.SupportError && e.code === 'conflict',
  );
  assert.throws(
    () => sup.customerReply(t.id, 'ja'),
    e => e.code === 'conflict',
  );
  assert.ok(!sup.getTicket(t.id).thread.some(m => m.by === 'agent'));
});

test('iade talebine %20 kısmi iade teklifi üretilir', () => {
  const t = offered();
  assert.equal(t.status, 'offer_sent');
  const msg = t.thread.at(-1);
  assert.equal(msg.by, 'agent');
  assert.match(msg.text, /20 %/);
});

test('refund olmayan ticket için autoReply conflict verir; yok ticket notfound', () => {
  const t = sup.intake({ from: 'a@example.com', subject: 'Frage', body: 'Wann kommt meine Lieferung?' });
  assert.equal(t.kind, 'other');
  assert.throws(
    () => sup.autoReply(t.id),
    e => e.code === 'conflict',
  );
  assert.throws(
    () => sup.autoReply('t_yok'),
    e => e.code === 'notfound',
  );
});

test('açık kabul offer_accepted yapar', () => {
  assert.equal(sup.customerReply(offered().id, 'Ja, einverstanden.').status, 'offer_accepted');
});

test('açık ret label_required yapar ve etiket talebini işaretler', () => {
  const t = sup.customerReply(offered().id, 'Nein, ich möchte eine Retoure.');
  assert.equal(t.status, 'label_required');
  assert.equal(t.labelRequested, true);
});

test('belirsiz cevap needs_human yapar', () => {
  assert.equal(
    sup.customerReply(offered().id, 'Ich überlege noch, melde mich später.').status,
    'needs_human',
  );
  assert.equal(sup.customerReply(offered().id, 'Ich bin nicht einverstanden.').status, 'needs_human');
  assert.equal(sup.customerReply(offered().id, 'ja, nein, ok').status, 'needs_human');
});

test('eşik üstü şikayet raporda çıkar, altı çıkmaz', () => {
  for (let i = 0; i < 5; i++)
    sup.recordComplaint({ poolId: 'p_aaa', supplier: 'Tedarik GmbH', reason: i % 2 ? 'defekt' : 'kaputt' });
  for (let i = 0; i < 4; i++) sup.recordComplaint({ poolId: 'p_bbb', vendor: 'Marke X', reason: 'Mangel' });
  const r = sup.complaintReport();
  const hit = r.find(x => x.poolId === 'p_aaa');
  assert.equal(hit.count, 5);
  assert.equal(hit.supplier, 'Tedarik GmbH');
  assert.deepEqual(hit.reasons.sort(), ['defekt', 'kaputt']);
  assert.ok(hit.suggestion);
  assert.ok(!r.some(x => x.poolId === 'p_bbb'));
  assert.ok(sup.complaintReport({ minCount: 4 }).some(x => x.poolId === 'p_bbb'));
});

test('girdi doğrulaması invalid verir', () => {
  assert.throws(
    () => sup.intake({}),
    e => e.code === 'invalid',
  );
  assert.throws(
    () => sup.recordComplaint({ supplier: 'x' }),
    e => e.code === 'invalid',
  );
});

test('listTickets süzer', () => {
  assert.ok(sup.listTickets({ kind: 'critical' }).every(t => t.kind === 'critical'));
  assert.ok(sup.listTickets({ status: 'needs_human' }).length >= 1);
});

test("prototip anahtarlı kimlik/tedarikçi/poolId Object.prototype'ı kirletmez", () => {
  assert.throws(
    () => sup.autoReply('__proto__'),
    e => e instanceof sup.SupportError && e.code === 'notfound',
  );
  assert.throws(
    () => sup.customerReply('constructor', 'Ja'),
    e => e instanceof sup.SupportError && e.code === 'notfound',
  );
  sup.setMinCount(1);
  sup.recordComplaint({ poolId: '__proto__', supplier: '__proto__', reason: 'kırık' });
  sup.recordComplaint({ poolId: 'constructor', supplier: 'prototype' });
  const rep = sup.complaintReport();
  assert.ok(rep.some(g => g.poolId === '__proto__' && g.supplier === '__proto__' && g.count === 1));
  assert.equal(/** @type {any} */ ({}).count, undefined);
  assert.equal('reasons' in {}, false);
  assert.equal(sup.getTicket('__proto__'), null);
});

test('çok sayıda recordComplaint çağrısı sonrası kayıt sayısı tam', () => {
  sup.setMinCount(1000);
  const before = sup.complaintReport({ minCount: 1 }).reduce((n, g) => n + g.count, 0);
  for (let i = 0; i < 200; i++) sup.recordComplaint({ poolId: 'p-yaris', supplier: 'S-yarış' });
  const after = sup.complaintReport({ minCount: 1 }).reduce((n, g) => n + g.count, 0);
  assert.equal(after, before + 200);
});

test("uyarı tavanı en eski uyarıları siler, ticket'ları silmez; belgede liste kalmaz", () => {
  const tickets0 = recordSet('support_tickets').count();
  const first = sup.alerts()[0];
  for (let i = 0; i < 520; i++)
    sup.intake({ from: `a${i}@finanzamt-x.de`, subject: 'Anfrage ' + i, body: 'Finanzamt Schreiben' });
  const al = sup.alerts();
  assert.equal(al.length, 500);
  assert.ok(!al.some(a => a.id === first.id), 'en eski uyarı silindi');
  assert.equal(al.at(-1).subject, 'Anfrage 519');
  // 520 yeni ticket'ın hepsi yerinde: ticket tavanı yok
  assert.equal(recordSet('support_tickets').count(), tickets0 + 520);
  assert.equal(
    sup.listTickets({ kind: 'critical' }).filter(t => t.subject.startsWith('Anfrage ')).length,
    520,
  );
  const d = store.doc('support', {});
  for (const k of ['tickets', 'alerts', 'complaints']) assert.equal(k in d, false, `belgede ${k} kalmamalı`);
});

test('ticket ve uyarı satırları eski şekli korur (id, t alanları; sıralama yeniden eskiye)', () => {
  const t = sup.intake({ from: 'k@example.com', subject: 'Frage', body: 'Hallo' });
  const got = sup.getTicket(t.id);
  assert.equal(got.id, t.id);
  assert.equal(typeof got.t, 'number');
  assert.equal(sup.listTickets()[0].id, t.id);
});

test('eski belge biçimi (tickets/alerts/complaints) satırlara taşınır, ikinci kez taşınmaz', async () => {
  const { moveDocRows } = await import('../services/records.mjs');
  store.saveDoc('support-eski', {
    tickets: [{ id: 't_eski1', t: 5, kind: 'other', status: 'open', thread: [] }],
    alerts: [],
  });
  const n = moveDocRows('support_tickets', 'support-eski', {
    rows: d => d.tickets,
    strip: d => delete d.tickets,
  });
  assert.equal(n, 1);
  assert.equal(recordSet('support_tickets').get('t_eski1').status, 'open');
  assert.equal('tickets' in store.doc('support-eski', {}), false);
  assert.equal(moveDocRows('support_tickets', 'support-eski', { rows: d => d.tickets, strip: () => {} }), 0);
});
