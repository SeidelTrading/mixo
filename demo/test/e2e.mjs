// Uçtan uca deneme (geçici DATA_DIR, atılacak parola, port 18791). Çalıştır: node test/e2e.mjs "$PWD"   (demo klasöründen, Node >= 22.13)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
const DEMO = process.argv[2], NODE = process.execPath, PORT = 18791, BASE = `http://127.0.0.1:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mixo-test-')), PW1 = 'deneme-parola-1-xyz', PW2 = 'deneme-parola-2-xyz';
let pass = 0, failN = 0; const ok = (c, name, extra = '') => { c ? pass++ : failN++; console.log((c ? '  ✔ ' : '  ✘ ') + name + (c ? '' : '   ← ' + extra)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let child, logs = '';
async function start(env = {}) { logs = ''; child = spawn(NODE, ['--no-warnings', 'server.mjs'], { cwd: DEMO, env: { ...process.env, PORT: String(PORT), DATA_DIR: DIR, ADMIN_PASSWORD: PW1, SESSION_SECRET: 'test-secret', SITE_URL: BASE, RAILWAY_ENVIRONMENT: '', ANTHROPIC_API_KEY: '', ...env } });
  child.stdout.on('data', d => logs += d); child.stderr.on('data', d => logs += d);
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/api/config'); return; } catch { await sleep(150); } } throw new Error('sunucu açılmadı:\n' + logs); }
async function stop() { if (!child) return; const p = new Promise(r => child.on('exit', r)); child.kill('SIGTERM'); await p; child = null; }
const jar = () => ({ c: '' });
async function call(j, p, body, opt = {}) { const h = { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(j?.c ? { cookie: j.c } : {}), ...(opt.headers || {}) };
  const r = await fetch(BASE + p, { method: body !== undefined ? 'POST' : 'GET', headers: h, body: body !== undefined ? (opt.raw ?? JSON.stringify(body)) : undefined, redirect: 'manual' });
  const sc = r.headers.getSetCookie?.() || []; if (j) for (const s of sc) { const kv = s.split(';')[0], k = kv.split('=')[0]; j.c = j.c.split('; ').filter(x => x && !x.startsWith(k + '=')).concat(kv.endsWith('=') ? [] : [kv]).join('; '); }
  const t = await r.text(); let json = null; try { json = JSON.parse(t); } catch {} return { s: r.status, j: json, t }; }
const login = async (u, pw) => { const j = jar(), r = await call(j, '/api/admin/login', { username: u, password: pw }); return { j, s: r.s }; };

try {
  /* eski JSON dosyaları */
  const now = Date.now();
  fs.writeFileSync(path.join(DIR, 'settings.json'), JSON.stringify({ announcement: 'Eski duyuru', approvalV2: true }));
  fs.writeFileSync(path.join(DIR, 'orders.json'), JSON.stringify([{ id: 'MX-OLD1', t: now - 1000, status: 'new', items: [{ id: 'x', title: 'Eski', vendor: 'v', price: 50, qty: 1, img: '' }], subtotal: 50, shipping: 0, total: 50, customer: { name: 'Eski Müşteri', email: 'eski@example.com', street: 'a', zip: '1', city: 'b' }, history: [] }]));
  fs.writeFileSync(path.join(DIR, 'changes.jsonl'), JSON.stringify({ id: 'old00001', t: now - 5000, by: 'yönetici', summary: 'Eski kayıt', undo: null, undone: false }) + '\n');
  fs.writeFileSync(path.join(DIR, 'events.jsonl'), [1, 2].map(i => JSON.stringify({ t: now - i * 1000, vid: 'v-eski-' + i, s: 1, e: 'session', d: 'd' })).join('\n') + '\n');
  fs.writeFileSync(path.join(DIR, 'sessions.json'), '{}');

  console.log('1) İlk açılış: içe aktarma'); await start();
  ok(/veritabanına aktarıldı/.test(logs), 'günlükte içe aktarma satırı', logs.slice(0, 400));
  ok(fs.existsSync(path.join(DIR, 'orders.json.tasindi')) && !fs.existsSync(path.join(DIR, 'orders.json')), 'eski dosyalar .tasindi oldu');
  ok((await call(null, '/api/config')).j.announcement === 'Eski duyuru', 'eski ayar okundu');

  console.log('2) Giriş ve roller');
  ok((await call(null, '/api/admin/me')).j.admin === false, 'oturumsuz: admin=false');
  ok((await call(null, '/api/admin/dashboard')).s === 401, 'oturumsuz uç 401');
  ok((await login('admin', 'yanlis-parola-000')).s === 401, 'yanlış parola 401');
  ok((await login('yok-boyle-biri', PW1)).s === 401, 'bilinmeyen kullanıcı 401');
  const A = await login('', PW1); ok(A.s === 200, 'kullanıcı adı boş → admin girişi');
  const me = (await call(A.j, '/api/admin/me')).j; ok(me.user?.username === 'admin' && me.user.role === 'yonetici', '/me kullanıcı ve rol', JSON.stringify(me));
  const d0 = (await call(A.j, '/api/admin/dashboard')).j; ok(d0.orders === 1 && d0.revenue === 50, 'eski sipariş ve ciro aktarıldı', JSON.stringify([d0.orders, d0.revenue]));
  ok((await call(A.j, '/api/admin/users', { action: 'add', username: 'ayse', role: 'goruntuleyen', password: 'kisa' })).s === 400, 'kısa parola reddedildi');
  ok((await call(A.j, '/api/admin/users', { action: 'add', username: 'ayse', role: 'goruntuleyen', password: 'ayse-parola-123' })).s === 200, 'görüntüleyen eklendi');
  ok((await call(A.j, '/api/admin/users', { action: 'add', username: 'mehmet', role: 'duzenleyen', password: 'mehmet-parola-123' })).s === 200, 'düzenleyen eklendi');
  ok((await call(A.j, '/api/admin/users', { action: 'add', username: 'ayse', role: 'duzenleyen', password: 'ayse-parola-123' })).s === 400, 'aynı ad ikinci kez reddedildi');
  const adminId = (await call(A.j, '/api/admin/users')).j.users.find(u => u.username === 'admin').id;
  ok((await call(A.j, '/api/admin/users', { action: 'role', id: adminId, role: 'duzenleyen' })).s === 400, 'son yöneticinin rolü düşürülemedi');
  ok((await call(A.j, '/api/admin/users', { action: 'disable', id: adminId })).s === 400, 'kendi hesabını kapatamadı');
  const V = await login('ayse', 'ayse-parola-123'); ok(V.s === 200, 'görüntüleyen girdi');
  ok((await call(V.j, '/api/admin/dashboard')).s === 200, 'görüntüleyen okuyabiliyor');
  ok((await call(V.j, '/api/admin/announcement', { text: 'x' })).s === 403, 'görüntüleyen POST → 403');
  ok((await call(V.j, '/api/admin/users')).s === 403 && (await call(V.j, '/api/admin/backups')).s === 403 && (await call(V.j, '/api/admin/jobs')).s === 403, 'görüntüleyen kullanıcı/yedek/iş uçları → 403');
  const E = await login('mehmet', 'mehmet-parola-123'); ok(E.s === 200, 'düzenleyen girdi');
  ok((await call(E.j, '/api/admin/announcement', { text: 'Duyuru B' })).s === 200, 'düzenleyen değişiklik yapabildi');
  ok((await call(E.j, '/api/admin/backup', {})).s === 403 && (await call(E.j, '/api/admin/users', { action: 'add', username: 'zzz', role: 'yonetici', password: 'zzz-parola-12345' })).s === 403, 'düzenleyen yedek/kullanıcı → 403');
  const ch = (await call(A.j, '/api/admin/settings')).j.changes; ok(ch.find(c => /Duyuru/.test(c.summary))?.user === 'mehmet', 'günlükte kişi adı (mehmet)', JSON.stringify(ch[0]));

  console.log('3) Eski korumalar');
  await call(A.j, '/api/admin/announcement', { text: 'Duyuru C' });
  const chB = (await call(A.j, '/api/admin/settings')).j.changes.find(c => c.user === 'mehmet' && c.undo);
  ok((await call(A.j, '/api/admin/undo', { id: chB.id })).s === 409, 'araya giren değişiklik varken geri alma 409');
  ok((await call(A.j, '/api/admin/announcement', { text: 'q' }, { headers: { 'content-type': 'text/plain' } })).s === 415, 'text/plain → 415');
  ok((await call(A.j, '/api/admin/announcement', { text: 'q' }, { headers: { origin: 'https://evil.example' } })).s === 403, 'yabancı Origin → 403');
  ok((await call(A.j, '/api/admin/announcement', {}, { raw: 'null' })).s === 400, 'gövde null → 400');

  console.log('4) Sipariş doğrulaması');
  const home = (await call(null, '/api/shop/home')).j, pid = (home.budget[0] || home.best[0]).id, cust = (email) => ({ name: 'Test Kunde', email, street: 'Musterstr. 1', zip: '10115', city: 'Berlin' });
  const o1 = await call(null, '/api/orders', { items: [{ id: pid, qty: 1 }], customer: cust('kunde@example.com') });
  ok(o1.s === 200 && o1.j.order.verify === true, 'sipariş alındı, doğrulama bekliyor', o1.t.slice(0, 200));
  ok(!/token/i.test(o1.t), 'yanıtta belirteç yok');
  const d1 = (await call(A.j, '/api/admin/dashboard')).j; ok(d1.revenue === 50 && d1.liveOrders === 1 && d1.statuses.find(s => s.key === 'unverified').count === 1, 'doğrulanmamış sipariş ciroya girmedi', JSON.stringify([d1.revenue, d1.liveOrders]));
  let mail; for (let i = 0; i < 30 && !mail; i++) { await sleep(400); mail = (await call(A.j, '/api/admin/marketing/state')).j.sim.find(x => x.key === 'order-confirm:' + o1.j.order.id); }
  ok(!!mail, 'onay e-postası iş kuyruğuyla simüle posta kutusuna düştü');
  const link = mail?.body.match(/http\S+/)?.[0] || '', u = new URL(link);
  ok((await call(null, `/api/orders/confirm?id=${o1.j.order.id}&token=yanlis`)).s === 400, 'yanlış belirteç reddedildi');
  ok((await call(null, `/api/orders/confirm?id=MX-YOK&token=${u.searchParams.get('token')}`)).s === 400, 'başka sipariş numarası reddedildi');
  const cf = await call(null, u.pathname + u.search); ok(cf.s === 200 && /bestätigt/.test(cf.t), 'doğru bağlantı siparişi doğruladı');
  ok((await call(null, u.pathname + u.search)).s === 200, 'ikinci tıklama: zaten doğrulanmış');
  const d2 = (await call(A.j, '/api/admin/dashboard')).j; ok(d2.liveOrders === 2 && d2.revenue > 50, 'doğrulanınca ciroya girdi', JSON.stringify([d2.revenue, d2.liveOrders]));
  const rs = []; for (let i = 0; i < 4; i++) rs.push(await call(null, '/api/orders', { items: [{ id: pid, qty: 1 }], customer: cust('cok@example.com') }));
  ok(rs.slice(0, 3).every(r => r.s === 200) && rs[3].s === 400, 'aynı e-postada 4. doğrulanmamış sipariş reddedildi', rs.map(r => r.s).join());
  ok((await call(A.j, '/api/admin/order-status', { id: rs[0].j.order.id, status: 'new' })).s === 200, 'yönetici elle doğrulayabildi');
  ok((await call(null, '/api/events', { events: [{ e: 'view', id: pid, s: 1 }, { e: 'search', q: 'test', s: 1 }] })).j.ok === 2, 'olaylar kaydedildi');

  console.log('5) Yedek ve iş kuyruğu');
  const bk = await call(A.j, '/api/admin/backup', {}); ok(bk.s === 200 && bk.j.backup.counts.orders === 5, 'elle yedek alındı (5 sipariş)', bk.t.slice(0, 300));
  const bl = (await call(A.j, '/api/admin/backups')).j.items; ok(bl.length >= 1, 'yedek listesi: ' + bl.length);
  await sleep(800); const jb = (await call(A.j, '/api/admin/jobs')).j.items; ok(['backup', 'prune_events', 'housekeeping', 'expire_unverified_orders'].every(t => jb.some(x => x.type === t)), 'yinelenen işler planlı');
  ok(jb.filter(x => x.type === 'order_confirm_mail' && x.status === 'done').length === 4, 'onay e-postası işleri tamamlandı');
  const bkFile = path.join(DIR, 'backups', bk.j.backup.name);
  const vr = JSON.parse(execFileSync(NODE, ['--no-warnings', 'db.mjs', 'verify', bkFile], { cwd: DEMO }).toString()); ok(vr.ok && vr.counts.users === 3, 'CLI verify: bütünlük ok, 3 kullanıcı', JSON.stringify(vr));

  console.log('6) Parola değişince oturum düşer');
  const mid = (await call(A.j, '/api/admin/users')).j.users.find(x => x.username === 'mehmet').id;
  ok((await call(A.j, '/api/admin/users', { action: 'password', id: mid, password: 'mehmet-yeni-parola-9' })).s === 200, 'yönetici parolayı sıfırladı');
  ok((await call(E.j, '/api/admin/dashboard')).s === 401, 'mehmet’in eski oturumu düştü');
  ok((await call(V.j, '/api/admin/password', { current: 'yanlis', password: 'ayse-yeni-parola-77' })).s === 400, 'kendi parolası: mevcut parola yanlış → 400');
  const V2 = jar(); V2.c = V.j.c; ok((await call(V.j, '/api/admin/password', { current: 'ayse-parola-123', password: 'ayse-yeni-parola-77' })).s === 200, 'görüntüleyen kendi parolasını değiştirdi');
  ok((await call(V2, '/api/admin/dashboard')).s === 401 && (await call(V.j, '/api/admin/dashboard')).s === 200, 'eski çerez düştü, yeni çerez geçerli');
  await call(A.j, '/api/admin/announcement', { text: 'Yedekten SONRA' });

  console.log('7) Yeniden başlatma: kalıcılık, yarım iş, süresi dolan sipariş');
  await stop();
  { const db = new DatabaseSync(path.join(DIR, 'mixo.db'));
    db.prepare("INSERT INTO jobs(type,payload,status,run_at,attempts,max_attempts,created) VALUES('housekeeping','{}','running',?,1,5,?)").run(Date.now(), Date.now());
    const row = db.prepare('SELECT data FROM orders WHERE id=?').get(rs[1].j.order.id), o = JSON.parse(row.data); o.verify.exp = Date.now() - 1000; db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(o), o.id); db.prepare("UPDATE jobs SET run_at=0 WHERE type='expire_unverified_orders' AND status='queued'").run(); db.close(); }
  await start();
  ok(!/veritabanına aktarıldı/.test(logs), 'ikinci açılışta yeniden içe aktarma yok');
  ok(/yarım kalmış iş yeniden sıraya alındı/.test(logs), 'yarım kalan iş sıraya döndü');
  ok((await call(null, '/api/config')).j.announcement === 'Yedekten SONRA', 'ayar kalıcı');
  const A2 = await login('admin', PW1); ok(A2.s === 200, 'admin yeniden girdi');
  ok((await call(A.j, '/api/admin/dashboard')).s === 200, 'eski oturum çerezi yeniden başlatmadan sonra da geçerli');
  const d3 = (await call(A2.j, '/api/admin/dashboard')).j; ok(d3.orders === 5, 'siparişler kalıcı (5)', String(d3.orders));
  const an = (await call(A2.j, '/api/admin/analytics?days=1')).j; ok(JSON.stringify(an).length > 50, 'analiz açılıyor');
  ok((await call(A2.j, '/api/admin/settings')).j.changes.some(c => c.user === 'mehmet'), 'günlük ve kişi adı kalıcı');
  ok((await login('ayse', 'ayse-yeni-parola-77')).s === 200, 'yeni kullanıcı yeniden başlatmadan sonra girebiliyor');
  let exp; for (let i = 0; i < 30 && !exp; i++) { await sleep(400); exp = (await call(A2.j, '/api/admin/orders?status=cancelled')).j.items.find(x => x.id === rs[1].j.order.id); }
  ok(!!exp, 'süresi dolan doğrulanmamış sipariş işle iptal edildi');
  const jb2 = (await call(A2.j, '/api/admin/jobs')).j.items; ok(!jb2.some(x => x.status === 'running') && jb2.filter(x => x.type === 'housekeeping' && x.status === 'done').length >= 2, 'yarım kalan iş tamamlandı');
  const ev = new DatabaseSync(path.join(DIR, 'mixo.db'), { readOnly: true }); ok(ev.prepare('SELECT COUNT(*) c FROM events').get().c === 4 && ev.prepare('SELECT COUNT(*) c FROM logins').get().c >= 7, 'olaylar (2 eski + 2 yeni) ve giriş kaydı veritabanında'); ev.close();

  console.log('8) Geri yükleme'); await stop();
  const rr = JSON.parse(execFileSync(NODE, ['--no-warnings', 'db.mjs', 'restore', bkFile, DIR], { cwd: DEMO }).toString()); ok(!!rr.previous, 'restore: mevcut veritabanı kenara alındı');
  await start();
  ok((await call(null, '/api/config')).j.announcement === 'Duyuru C', 'yedek anındaki duyuru geri geldi');
  const A3 = await login('admin', PW1); const d4 = (await call(A3.j, '/api/admin/dashboard')).j; ok(A3.s === 200 && d4.orders === 5, 'geri yüklemeden sonra giriş ve veri');
  ok((await login('mehmet', 'mehmet-parola-123')).s === 200, 'yedekteki eski parola geçerli (parola sıfırlama yedekten sonraydı)');

  console.log('9) ADMIN_PASSWORD değişirse (acil durum)'); await stop(); await start({ ADMIN_PASSWORD: PW2 });
  ok(/parolası sıfırlandı/.test(logs), 'günlükte sıfırlama uyarısı');
  ok((await login('admin', PW1)).s === 401 && (await login('admin', PW2)).s === 200, 'eski parola reddedildi, yenisi geçerli');

  console.log('10) ORDER_VERIFY=off'); await stop(); await start({ ADMIN_PASSWORD: PW2, ORDER_VERIFY: 'off' });
  const o9 = await call(null, '/api/orders', { items: [{ id: pid, qty: 1 }], customer: cust('off@example.com') }); ok(o9.s === 200 && o9.j.order.verify === false, 'doğrulama kapalıyken sipariş doğrudan "Yeni"');

  console.log('11) Hız sınırı'); const codes = []; for (let i = 0; i < 8; i++) codes.push((await login('admin', 'yanlis-' + i)).s); ok(codes.includes(429) && codes[0] === 401, 'art arda yanlış girişte 429: ' + codes.join(','));
} catch (e) { failN++; console.error('DENEME ÇÖKTÜ:', e, '\n--- sunucu günlüğü ---\n' + logs.slice(-1500)); }
finally { await stop(); fs.rmSync(DIR, { recursive: true, force: true }); console.log(`\nSONUÇ: ${pass} geçti, ${failN} kaldı`); process.exit(failN ? 1 : 0); }
