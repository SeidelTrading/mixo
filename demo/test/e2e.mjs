// Uçtan uca deneme (geçici DATA_DIR, atılacak parola, port 18791). Çalıştır: node test/e2e.mjs "$PWD"   (demo klasöründen, Node >= 22.13)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const DEMO = process.argv[2],
  NODE = process.execPath,
  PORT = 18791,
  BASE = `http://127.0.0.1:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mixo-test-')),
  PW1 = 'deneme-parola-1-xyz',
  PW2 = 'deneme-parola-2-xyz';
let pass = 0,
  failN = 0;
const ok = (c, name, extra = '') => {
  c ? pass++ : failN++;
  console.log((c ? '  ✔ ' : '  ✘ ') + name + (c ? '' : '   ← ' + extra));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let child,
  logs = '';
async function start(env = {}) {
  logs = '';
  child = spawn(NODE, ['--no-warnings', 'server.mjs'], {
    cwd: DEMO,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: DIR,
      ADMIN_PASSWORD: PW1,
      SESSION_SECRET: 'test-secret',
      SITE_URL: BASE,
      RAILWAY_ENVIRONMENT: '',
      ANTHROPIC_API_KEY: '',
      ...env,
    },
  });
  child.stdout.on('data', d => (logs += d));
  child.stderr.on('data', d => (logs += d));
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(BASE + '/api/config');
      return;
    } catch {
      await sleep(150);
    }
  }
  throw new Error('sunucu açılmadı:\n' + logs);
}
async function stop() {
  if (!child) return;
  const p = new Promise(r => child.on('exit', r));
  child.kill('SIGTERM');
  await p;
  child = null;
}
const jar = () => ({ c: '' });
async function call(j, p, body, opt = {}) {
  const h = {
    ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(j?.c ? { cookie: j.c } : {}),
    ...(opt.headers || {}),
  };
  const r = await fetch(BASE + p, {
    method: opt.method || (body !== undefined ? 'POST' : 'GET'),
    headers: h,
    body: body !== undefined ? (opt.raw ?? JSON.stringify(body)) : undefined,
    redirect: 'manual',
  });
  const sc = r.headers.getSetCookie?.() || [];
  if (j)
    for (const s of sc) {
      const kv = s.split(';')[0],
        k = kv.split('=')[0];
      j.c = j.c
        .split('; ')
        .filter(x => x && !x.startsWith(k + '='))
        .concat(kv.endsWith('=') ? [] : [kv])
        .join('; ');
    }
  const t = await r.text();
  let json = null;
  try {
    json = JSON.parse(t);
  } catch {}
  return { s: r.status, j: json, t };
}
const login = async (u, pw) => {
  const j = jar(),
    r = await call(j, '/api/admin/login', { username: u, password: pw });
  return { j, s: r.s };
};

try {
  /* eski JSON dosyaları */
  const now = Date.now();
  fs.writeFileSync(
    path.join(DIR, 'settings.json'),
    JSON.stringify({ announcement: 'Eski duyuru', approvalV2: true }),
  );
  fs.writeFileSync(
    path.join(DIR, 'orders.json'),
    JSON.stringify([
      {
        id: 'MX-OLD1',
        t: now - 1000,
        status: 'new',
        items: [{ id: 'x', title: 'Eski', vendor: 'v', price: 50, qty: 1, img: '' }],
        subtotal: 50,
        shipping: 0,
        total: 50,
        customer: { name: 'Eski Müşteri', email: 'eski@example.com', street: 'a', zip: '1', city: 'b' },
        history: [],
      },
    ]),
  );
  fs.writeFileSync(
    path.join(DIR, 'changes.jsonl'),
    JSON.stringify({
      id: 'old00001',
      t: now - 5000,
      by: 'yönetici',
      summary: 'Eski kayıt',
      undo: null,
      undone: false,
    }) + '\n',
  );
  fs.writeFileSync(
    path.join(DIR, 'events.jsonl'),
    [1, 2]
      .map(i => JSON.stringify({ t: now - i * 1000, vid: 'v-eski-' + i, s: 1, e: 'session', d: 'd' }))
      .join('\n') + '\n',
  );
  fs.writeFileSync(path.join(DIR, 'sessions.json'), '{}');

  console.log('1) İlk açılış: içe aktarma');
  await start();
  ok(/veritabanına aktarıldı/.test(logs), 'günlükte içe aktarma satırı', logs.slice(0, 400));
  ok(
    fs.existsSync(path.join(DIR, 'orders.json.tasindi')) && !fs.existsSync(path.join(DIR, 'orders.json')),
    'eski dosyalar .tasindi oldu',
  );
  ok((await call(null, '/api/config')).j.announcement === 'Eski duyuru', 'eski ayar okundu');

  console.log('2) Giriş ve roller');
  ok((await call(null, '/api/admin/me')).j.admin === false, 'oturumsuz: admin=false');
  ok((await call(null, '/api/admin/dashboard')).s === 401, 'oturumsuz uç 401');
  ok((await login('admin', 'yanlis-parola-000')).s === 401, 'yanlış parola 401');
  ok((await login('yok-boyle-biri', PW1)).s === 401, 'bilinmeyen kullanıcı 401');
  const A = await login('', PW1);
  ok(A.s === 200, 'kullanıcı adı boş → admin girişi');
  const me = (await call(A.j, '/api/admin/me')).j;
  ok(
    me.user?.username === 'admin' && me.user.role === 'yonetici',
    '/me kullanıcı ve rol',
    JSON.stringify(me),
  );
  const d0 = (await call(A.j, '/api/admin/dashboard')).j;
  ok(
    d0.orders === 1 && d0.revenue === 50,
    'eski sipariş ve ciro aktarıldı',
    JSON.stringify([d0.orders, d0.revenue]),
  );
  ok(
    (
      await call(A.j, '/api/admin/users', {
        action: 'add',
        username: 'ayse',
        role: 'goruntuleyen',
        password: 'kisa',
      })
    ).s === 400,
    'kısa parola reddedildi',
  );
  ok(
    (
      await call(A.j, '/api/admin/users', {
        action: 'add',
        username: 'ayse',
        role: 'goruntuleyen',
        password: 'ayse-parola-123',
      })
    ).s === 200,
    'görüntüleyen eklendi',
  );
  ok(
    (
      await call(A.j, '/api/admin/users', {
        action: 'add',
        username: 'mehmet',
        role: 'duzenleyen',
        password: 'mehmet-parola-123',
      })
    ).s === 200,
    'düzenleyen eklendi',
  );
  ok(
    (
      await call(A.j, '/api/admin/users', {
        action: 'add',
        username: 'ayse',
        role: 'duzenleyen',
        password: 'ayse-parola-123',
      })
    ).s === 400,
    'aynı ad ikinci kez reddedildi',
  );
  const adminId = (await call(A.j, '/api/admin/users')).j.users.find(u => u.username === 'admin').id;
  ok(
    (await call(A.j, '/api/admin/users', { action: 'role', id: adminId, role: 'duzenleyen' })).s === 400,
    'son yöneticinin rolü düşürülemedi',
  );
  ok(
    (await call(A.j, '/api/admin/users', { action: 'disable', id: adminId })).s === 400,
    'kendi hesabını kapatamadı',
  );
  const V = await login('ayse', 'ayse-parola-123');
  ok(V.s === 200, 'görüntüleyen girdi');
  ok((await call(V.j, '/api/admin/dashboard')).s === 200, 'görüntüleyen okuyabiliyor');
  ok((await call(V.j, '/api/admin/announcement', { text: 'x' })).s === 403, 'görüntüleyen POST → 403');
  ok(
    (await call(V.j, '/api/admin/users')).s === 403 &&
      (await call(V.j, '/api/admin/backups')).s === 403 &&
      (await call(V.j, '/api/admin/jobs')).s === 403,
    'görüntüleyen kullanıcı/yedek/iş uçları → 403',
  );
  const E = await login('mehmet', 'mehmet-parola-123');
  ok(E.s === 200, 'düzenleyen girdi');
  ok(
    (await call(E.j, '/api/admin/announcement', { text: 'Duyuru B' })).s === 200,
    'düzenleyen değişiklik yapabildi',
  );
  ok(
    (await call(E.j, '/api/admin/backup', {})).s === 403 &&
      (
        await call(E.j, '/api/admin/users', {
          action: 'add',
          username: 'zzz',
          role: 'yonetici',
          password: 'zzz-parola-12345',
        })
      ).s === 403,
    'düzenleyen yedek/kullanıcı → 403',
  );
  const ch = (await call(A.j, '/api/admin/settings')).j.changes;
  ok(
    ch.find(c => /Duyuru/.test(c.summary))?.user === 'mehmet',
    'günlükte kişi adı (mehmet)',
    JSON.stringify(ch[0]),
  );

  console.log('3) Eski korumalar');
  await call(A.j, '/api/admin/announcement', { text: 'Duyuru C' });
  const chB = (await call(A.j, '/api/admin/settings')).j.changes.find(c => c.user === 'mehmet' && c.undo);
  ok(
    (await call(A.j, '/api/admin/undo', { id: chB.id })).s === 409,
    'araya giren değişiklik varken geri alma 409',
  );
  ok(
    (await call(A.j, '/api/admin/announcement', { text: 'q' }, { headers: { 'content-type': 'text/plain' } }))
      .s === 415,
    'text/plain → 415',
  );
  ok(
    (
      await call(
        A.j,
        '/api/admin/announcement',
        { text: 'q' },
        { headers: { origin: 'https://evil.example' } },
      )
    ).s === 403,
    'yabancı Origin → 403',
  );
  ok((await call(A.j, '/api/admin/announcement', {}, { raw: 'null' })).s === 400, 'gövde null → 400');
  for (const m of ['PUT', 'PATCH', 'DELETE'])
    ok(
      (await call(A.j, '/api/admin/instagram/draft', { x: 1 }, { method: m })).s === 405,
      `yönetici ucunda ${m} → 405`,
    );
  ok((await call(A.j, '/api/admin/logout', undefined, { method: 'GET' })).s === 405, 'çıkış ucu GET → 405');

  console.log('4) Sipariş doğrulaması');
  const home = (await call(null, '/api/shop/home')).j,
    pid = (home.budget[0] || home.best[0]).id,
    cust = email => ({ name: 'Test Kunde', email, street: 'Musterstr. 1', zip: '10115', city: 'Berlin' });
  const o1 = await call(null, '/api/orders', {
    items: [{ id: pid, qty: 1 }],
    customer: cust('kunde@example.com'),
  });
  ok(o1.s === 200 && o1.j.order.verify === true, 'sipariş alındı, doğrulama bekliyor', o1.t.slice(0, 200));
  ok(!/token/i.test(o1.t), 'yanıtta belirteç yok');
  const d1 = (await call(A.j, '/api/admin/dashboard')).j;
  ok(
    d1.revenue === 50 && d1.liveOrders === 1 && d1.statuses.find(s => s.key === 'unverified').count === 1,
    'doğrulanmamış sipariş ciroya girmedi',
    JSON.stringify([d1.revenue, d1.liveOrders]),
  );
  let mail;
  for (let i = 0; i < 30 && !mail; i++) {
    await sleep(400);
    mail = (await call(A.j, '/api/admin/marketing/state')).j.sim.find(
      x => x.key === 'order-confirm:' + o1.j.order.id,
    );
  }
  ok(!!mail, 'onay e-postası iş kuyruğuyla simüle posta kutusuna düştü');
  const link = mail?.body.match(/http\S+/)?.[0] || '',
    u = new URL(link);
  ok(
    (await call(null, `/api/orders/confirm?id=${o1.j.order.id}&token=yanlis`)).s === 400,
    'yanlış belirteç reddedildi',
  );
  ok(
    (await call(null, `/api/orders/confirm?id=MX-YOK&token=${u.searchParams.get('token')}`)).s === 400,
    'başka sipariş numarası reddedildi',
  );
  const cf = await call(null, u.pathname + u.search);
  ok(cf.s === 200 && /bestätigt/.test(cf.t), 'doğru bağlantı siparişi doğruladı');
  ok((await call(null, u.pathname + u.search)).s === 200, 'ikinci tıklama: zaten doğrulanmış');
  const d2 = (await call(A.j, '/api/admin/dashboard')).j;
  ok(
    d2.liveOrders === 2 && d2.revenue > 50,
    'doğrulanınca ciroya girdi',
    JSON.stringify([d2.revenue, d2.liveOrders]),
  );
  const rs = [];
  for (let i = 0; i < 4; i++)
    rs.push(
      await call(null, '/api/orders', { items: [{ id: pid, qty: 1 }], customer: cust('cok@example.com') }),
    );
  ok(
    rs.slice(0, 3).every(r => r.s === 200) && rs[3].s === 400,
    'aynı e-postada 4. doğrulanmamış sipariş reddedildi',
    rs.map(r => r.s).join(),
  );
  ok(
    (await call(A.j, '/api/admin/order-status', { id: rs[0].j.order.id, status: 'new' })).s === 200,
    'yönetici elle doğrulayabildi',
  );
  ok(
    (
      await call(null, '/api/events', {
        consent: true,
        events: [
          { e: 'view', id: pid, s: 1 },
          { e: 'search', q: 'test', s: 1 },
        ],
      })
    ).j.ok === 2,
    'olaylar kaydedildi',
  );
  // Çerez onayı beyanı olmayan gönderim saklanmaz: istek 200 döner (vitrin kırılmasın) ama hiçbir olay yazılmaz.
  ok(
    (
      await call(null, '/api/events', {
        events: [{ e: 'view', id: pid, s: 1 }],
      })
    ).s === 200,
    'onaysız olay gönderimi 200 döner',
  );

  console.log('5) Yedek ve iş kuyruğu');
  const bk = await call(A.j, '/api/admin/backup', {});
  ok(bk.s === 200 && bk.j.backup.counts.orders === 5, 'elle yedek alındı (5 sipariş)', bk.t.slice(0, 300));
  const bl = (await call(A.j, '/api/admin/backups')).j.items;
  ok(bl.length >= 1, 'yedek listesi: ' + bl.length);
  await sleep(800);
  const jb = (await call(A.j, '/api/admin/jobs')).j.items;
  ok(
    ['backup', 'prune_events', 'housekeeping', 'expire_unverified_orders'].every(t =>
      jb.some(x => x.type === t),
    ),
    'yinelenen işler planlı',
  );
  ok(
    jb.filter(x => x.type === 'order_confirm_mail' && x.status === 'done').length === 4,
    'onay e-postası işleri tamamlandı',
  );
  const bkFile = path.join(DIR, 'backups', bk.j.backup.name);
  const vr = JSON.parse(
    execFileSync(NODE, ['--no-warnings', 'db.mjs', 'verify', bkFile], { cwd: DEMO }).toString(),
  );
  ok(vr.ok && vr.counts.users === 3, 'CLI verify: bütünlük ok, 3 kullanıcı', JSON.stringify(vr));

  console.log('6) Parola değişince oturum düşer');
  const mid = (await call(A.j, '/api/admin/users')).j.users.find(x => x.username === 'mehmet').id;
  ok(
    (await call(A.j, '/api/admin/users', { action: 'password', id: mid, password: 'mehmet-yeni-parola-9' }))
      .s === 200,
    'yönetici parolayı sıfırladı',
  );
  ok((await call(E.j, '/api/admin/dashboard')).s === 401, 'mehmet’in eski oturumu düştü');
  ok(
    (await call(V.j, '/api/admin/password', { current: 'yanlis', password: 'ayse-yeni-parola-77' })).s ===
      400,
    'kendi parolası: mevcut parola yanlış → 400',
  );
  const V2 = jar();
  V2.c = V.j.c;
  ok(
    (await call(V.j, '/api/admin/password', { current: 'ayse-parola-123', password: 'ayse-yeni-parola-77' }))
      .s === 200,
    'görüntüleyen kendi parolasını değiştirdi',
  );
  ok(
    (await call(V2, '/api/admin/dashboard')).s === 401 && (await call(V.j, '/api/admin/dashboard')).s === 200,
    'eski çerez düştü, yeni çerez geçerli',
  );
  await call(A.j, '/api/admin/announcement', { text: 'Yedekten SONRA' });

  console.log('7) Yeniden başlatma: kalıcılık, yarım iş, süresi dolan sipariş');
  await stop();
  {
    const db = new DatabaseSync(path.join(DIR, 'mixo.db'));
    db.prepare(
      "INSERT INTO jobs(type,payload,status,run_at,attempts,max_attempts,created) VALUES('housekeeping','{}','running',?,1,5,?)",
    ).run(Date.now(), Date.now());
    const row = db.prepare('SELECT data FROM orders WHERE id=?').get(rs[1].j.order.id),
      o = JSON.parse(row.data);
    o.verify.exp = Date.now() - 1000;
    db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(o), o.id);
    db.prepare("UPDATE jobs SET run_at=0 WHERE type='expire_unverified_orders' AND status='queued'").run();
    db.close();
  }
  await start();
  ok(!/veritabanına aktarıldı/.test(logs), 'ikinci açılışta yeniden içe aktarma yok');
  ok(/yarım kalmış iş yeniden sıraya alındı/.test(logs), 'yarım kalan iş sıraya döndü');
  ok((await call(null, '/api/config')).j.announcement === 'Yedekten SONRA', 'ayar kalıcı');
  const A2 = await login('admin', PW1);
  ok(A2.s === 200, 'admin yeniden girdi');
  ok(
    (await call(A.j, '/api/admin/dashboard')).s === 200,
    'eski oturum çerezi yeniden başlatmadan sonra da geçerli',
  );
  const d3 = (await call(A2.j, '/api/admin/dashboard')).j;
  ok(d3.orders === 5, 'siparişler kalıcı (5)', String(d3.orders));
  const an = (await call(A2.j, '/api/admin/analytics?days=1')).j;
  ok(JSON.stringify(an).length > 50, 'analiz açılıyor');
  ok(
    (await call(A2.j, '/api/admin/settings')).j.changes.some(c => c.user === 'mehmet'),
    'günlük ve kişi adı kalıcı',
  );
  ok(
    (await login('ayse', 'ayse-yeni-parola-77')).s === 200,
    'yeni kullanıcı yeniden başlatmadan sonra girebiliyor',
  );
  let exp;
  for (let i = 0; i < 30 && !exp; i++) {
    await sleep(400);
    exp = (await call(A2.j, '/api/admin/orders?status=cancelled')).j.items.find(
      x => x.id === rs[1].j.order.id,
    );
  }
  ok(!!exp, 'süresi dolan doğrulanmamış sipariş işle iptal edildi');
  const jb2 = (await call(A2.j, '/api/admin/jobs')).j.items;
  ok(
    !jb2.some(x => x.status === 'running') &&
      jb2.filter(x => x.type === 'housekeeping' && x.status === 'done').length >= 2,
    'yarım kalan iş tamamlandı',
  );
  const ev = new DatabaseSync(path.join(DIR, 'mixo.db'), { readOnly: true });
  ok(
    ev.prepare('SELECT COUNT(*) c FROM events').get().c === 4 &&
      ev.prepare('SELECT COUNT(*) c FROM logins').get().c >= 7,
    'olaylar (2 eski + 2 yeni) ve giriş kaydı veritabanında',
  );
  ev.close();

  console.log('8) Geri yükleme');
  await stop();
  const rr = JSON.parse(
    execFileSync(NODE, ['--no-warnings', 'db.mjs', 'restore', bkFile, DIR], { cwd: DEMO }).toString(),
  );
  ok(!!rr.previous, 'restore: mevcut veritabanı kenara alındı');
  await start();
  ok((await call(null, '/api/config')).j.announcement === 'Duyuru C', 'yedek anındaki duyuru geri geldi');
  const A3 = await login('admin', PW1);
  const d4 = (await call(A3.j, '/api/admin/dashboard')).j;
  ok(A3.s === 200 && d4.orders === 5, 'geri yüklemeden sonra giriş ve veri');
  ok(
    (await login('mehmet', 'mehmet-parola-123')).s === 200,
    'yedekteki eski parola geçerli (parola sıfırlama yedekten sonraydı)',
  );

  console.log('9) ADMIN_PASSWORD değişirse (acil durum)');
  await stop();
  await start({ ADMIN_PASSWORD: PW2 });
  ok(/parolası sıfırlandı/.test(logs), 'günlükte sıfırlama uyarısı');
  ok(
    (await login('admin', PW1)).s === 401 && (await login('admin', PW2)).s === 200,
    'eski parola reddedildi, yenisi geçerli',
  );

  console.log('10) ORDER_VERIFY=off');
  await stop();
  await start({ ADMIN_PASSWORD: PW2, ORDER_VERIFY: 'off' });
  const o9 = await call(null, '/api/orders', {
    items: [{ id: pid, qty: 1 }],
    customer: cust('off@example.com'),
  });
  ok(o9.s === 200 && o9.j.order.verify === false, 'doğrulama kapalıyken sipariş doğrudan "Yeni"');

  console.log('11) Hız sınırı');
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push((await login('admin', 'yanlis-' + i)).s);
  ok(codes.includes(429) && codes[0] === 401, 'art arda yanlış girişte 429: ' + codes.join(','));

  console.log('12) Instagram webhook: doğrulama, imza, boyut');
  await stop();
  await start({ ADMIN_PASSWORD: PW2, IG_APP_SECRET: 'wh-secret', IG_VERIFY_TOKEN: 'verif-1' });
  const whSign = raw => 'sha256=' + crypto.createHmac('sha256', 'wh-secret').update(raw).digest('hex');
  const wh = (raw, sig) =>
    call(null, '/api/instagram/webhook', {}, { raw, headers: sig ? { 'x-hub-signature-256': sig } : {} });
  ok(
    (await call(null, '/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=verif-1&hub.challenge=abc'))
      .t === 'abc',
    'abonelik doğrulaması doğru belirteçle yanıtı döndürür',
  );
  ok(
    (await call(null, '/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=yanlis&hub.challenge=abc'))
      .s === 403,
    'yanlış doğrulama belirteci 403',
  );
  const whBody = JSON.stringify({ object: 'instagram', entry: [] });
  ok((await wh(whBody)).s === 401, 'imzasız webhook 401');
  ok((await wh(whBody, whSign(whBody + 'x'))).s === 401, 'yanlış imzalı webhook 401');
  ok((await wh(whBody, whSign(whBody))).s === 200, 'doğru imzalı webhook 200');
  const big = JSON.stringify({ pad: 'x'.repeat(2e6) });
  let bigStatus = 0;
  try {
    bigStatus = (await wh(big, whSign(big))).s;
  } catch {
    bigStatus = 413; // sunucu bağlantıyı kesti: gövde sınırı çalıştı
  }
  ok(bigStatus === 413, 'aşırı büyük webhook gövdesi reddedilir', String(bigStatus));

  console.log('13) Sepet izni sahipliği (mxc çerezi)');
  const AD = await login('admin', PW2);
  const consent = async () => (await call(AD.j, '/api/admin/marketing/state')).j?.consent?.optins;
  const n0 = await consent();
  const own = jar(),
    other = jar();
  const cartBody = optin => ({
    email: 'sahip@example.com',
    name: 'Sahip',
    optin,
    items: [{ id: pid, qty: 1 }],
  });
  ok((await call(own, '/api/cart-save', cartBody(true))).s === 200, 'izin veren sepeti kaydetti');
  ok(own.c.includes('mxc='), 'izin veren tarayıcıya sahiplik çerezi verildi');
  ok((await consent()) === n0 + 1, 'izin kaydı oluştu');
  ok(
    (await call(other, '/api/cart-save', cartBody(false))).s === 200,
    'başka tarayıcıdan izin kaldırma isteği yanıtlandı',
  );
  ok(!other.c.includes('mxc='), 'başka tarayıcıya çerez verilmedi');
  ok((await consent()) === n0 + 1, 'çerezi olmayan, başkasının iznini silemez');
  await call(own, '/api/cart-save', cartBody(false));
  ok((await consent()) === n0, 'çerez sahibi izni kaldırabilir');
  await call(own, '/api/cart-save', cartBody(true));
  const thief = jar();
  await call(thief, '/api/cart-save', { ...cartBody(true), name: 'Hirsiz' });
  ok(!thief.c.includes('mxc='), 'kayıtlı e-posta için başka tarayıcıya sahiplik çerezi verilmez');
  ok((await consent()) === n0 + 1, 'kayıtlı e-postaya başkası ikinci kayıt açamaz');
  await call(own, '/api/cart-save', cartBody(false));

  console.log('14) CSRF ve içerik türü (yönetici uçları)');
  ok(
    (
      await call(
        AD.j,
        '/api/admin/announcement',
        { text: 'x' },
        { headers: { origin: 'https://evil.example' } },
      )
    ).s === 403,
    'yabancı Origin ile yönetici POST 403',
  );
  ok(
    (
      await call(
        AD.j,
        '/api/admin/announcement',
        {},
        { raw: 'text=1', headers: { 'content-type': 'text/plain' } },
      )
    ).s === 415,
    'yönetici ucu text/plain kabul etmez (415)',
  );
  ok((await call(null, '/api/admin/announcement', { text: 'x' })).s === 401, 'oturumsuz yönetici POST 401');

  console.log('15) Instagram ve pazarlama yönetici uçları (simülasyon)');
  for (const u of [
    'instagram/state',
    'instagram/suggest',
    'marketing/state',
    'marketing/suggestions',
    'marketing/reminders',
  ]) {
    const r = await call(AD.j, '/api/admin/' + u);
    ok(r.s === 200 && r.j?.ok === true, u + ' 200 ve ok');
  }
  ok((await call(null, '/api/admin/instagram/state')).s === 401, 'oturumsuz Instagram ucu 401');
  const sim = await call(AD.j, '/api/admin/instagram/simulate', {
    type: 'dm',
    text: 'Hallo, ist das lieferbar?',
    from: 'test',
  });
  ok(
    sim.s === 200 && sim.j?.item?.status === 'drafted',
    'simüle edilen mesaj için yanıt taslağı hazırlandı',
    sim.t.slice(0, 120),
  );
  const dr = await call(AD.j, '/api/admin/instagram/draft', { pid, kind: 'post' });
  ok(dr.s === 200 && dr.j?.ok === true, 'gönderi taslağı isteği 200', dr.t.slice(0, 120));
  ok(
    (await call(AD.j, '/api/admin/instagram/post-approve', { id: 'yok' })).s !== 500,
    'olmayan gönderiyi onaylamak 500 vermez',
  );

  console.log('16) Güvenlik düzeltmeleri: çerez sahipliği, dosya izni, vekil adresi, bağlantı süzgeci');
  const mj = jar();
  const c16 = await consent();
  const om = await call(mj, '/api/orders', {
    items: [{ id: pid, qty: 1 }],
    customer: cust('izinli@example.com'),
    marketing: true,
  });
  ok(om.s === 200 && om.j.order.verify === true, 'izinli sipariş doğrulama bekliyor');
  ok((await consent()) === c16, 'doğrulanmamış siparişle pazarlama izni kaydı açılmaz');
  ok(!mj.c.includes('mxc='), 'doğrulanmamış siparişte izin sahipliği çerezi verilmez');
  let mmail;
  for (let i = 0; i < 30 && !mmail; i++) {
    await sleep(400);
    mmail = (await call(AD.j, '/api/admin/marketing/state')).j.sim.find(
      x => x.key === 'order-confirm:' + om.j.order.id,
    );
  }
  const mu = new URL(mmail?.body.match(/http\S+/)?.[0] || 'http://x/');
  const cr = await fetch(BASE + '/api/orders/confirm' + mu.search, { redirect: 'manual' });
  ok(cr.status === 200, 'doğrulama bağlantısı çalıştı');
  ok((await consent()) === c16 + 1, 'izin kaydı e-posta doğrulamasından sonra açıldı');
  ok(
    (await call(AD.j, '/api/admin/order-status', { id: om.j.order.id, status: 'unverified' })).s === 400,
    'sipariş "Doğrulanmadı" durumuna geri alınamaz',
  );
  ok(
    (cr.headers.getSetCookie?.() || []).some(x => x.startsWith('mxc=')),
    'çerez doğrulamadan sonra verildi',
  );
  for (const f of ['mixo.db', 'backups']) {
    const mode = fs.statSync(path.join(DIR, f)).mode & 0o777;
    ok((mode & 0o077) === 0, f + ' yalnız sahibine açık', mode.toString(8));
  }
  const sim2 = await call(AD.j, '/api/admin/instagram/simulate', { type: 'dm', text: 'Preis?', from: 'x' });
  const iid = sim2.j?.item?.id;
  await call(AD.j, '/api/admin/instagram/reply-edit', { id: iid, text: 'Hier: https://evil.example/x' });
  const rsend = await call(AD.j, '/api/admin/instagram/reply-send', { id: iid });
  ok(rsend.s === 409, 'taslakta mağaza dışı bağlantı varsa gönderim reddedilir', rsend.t.slice(0, 120));
  await call(AD.j, '/api/admin/instagram/reply-edit', { id: iid, text: `Hier: ${BASE}/?p=x` });
  ok(
    (await call(AD.j, '/api/admin/instagram/reply-send', { id: iid })).s === 200,
    'mağaza bağlantılı taslak gönderilir',
  );

  await stop();
  await start({ ADMIN_PASSWORD: PW2, TRUST_PROXY: '1' });
  const sp = [];
  for (let i = 0; i < 12; i++)
    sp.push(
      (
        await call(
          null,
          '/api/orders',
          { items: [], customer: cust('s@example.com') },
          { headers: { 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '198.51.100.' + i } },
        )
      ).s,
    );
  ok(sp.includes(429), 'X-Real-IP sahteciliği adres başı sınırı aşmaya yetmez: ' + sp.join(','));

  console.log('17) Webhook tekrarı: kalıcı kimlik listesi ve eski zaman damgası');
  await stop();
  await start({ ADMIN_PASSWORD: PW2, IG_APP_SECRET: 'wh-secret', IG_VERIFY_TOKEN: 'verif-1' });
  const AW = await login('admin', PW2);
  const inboxN = async () => (await call(AW.j, '/api/admin/instagram/state')).j?.inbox?.length;
  const dm = (mid, t) =>
    JSON.stringify({
      object: 'instagram',
      entry: [
        {
          messaging: [
            { sender: { id: 'kullanici-1' }, message: { mid, text: 'Ist das lieferbar?' }, timestamp: t },
          ],
        },
      ],
    });
  const n0i = await inboxN();
  const p1 = dm('m-tekrar-1', Date.now());
  const whSign2 = raw => 'sha256=' + crypto.createHmac('sha256', 'wh-secret').update(raw).digest('hex');
  const post = raw =>
    call(null, '/api/instagram/webhook', {}, { raw, headers: { 'x-hub-signature-256': whSign2(raw) } });
  ok((await post(p1)).s === 200, 'webhook DM kabul edildi');
  ok((await inboxN()) === n0i + 1, 'DM gelen kutusuna düştü');
  await post(p1);
  ok((await inboxN()) === n0i + 1, 'aynı webhook kimliği tekrar işlenmez');
  await stop();
  await start({ ADMIN_PASSWORD: PW2, IG_APP_SECRET: 'wh-secret', IG_VERIFY_TOKEN: 'verif-1' });
  const AW2 = await login('admin', PW2);
  await post(p1);
  ok(
    ((await call(AW2.j, '/api/admin/instagram/state')).j?.inbox?.length ?? -1) === n0i + 1,
    'yeniden başlatmadan sonra da tekrar işlenmez',
  );
  await post(dm('m-eski-1', Date.now() - 30 * 864e5));
  ok(
    ((await call(AW2.j, '/api/admin/instagram/state')).j?.inbox?.length ?? -1) === n0i + 1,
    '30 günlük eski zaman damgalı yük yok sayılır',
  );

  console.log('18) /sunum koruması (SUNUM_PROTECT=1)');
  ok((await call(null, '/sunum/')).s === 200, 'varsayılan: sunum herkese açık');
  await stop();
  await start({ ADMIN_PASSWORD: PW2, SUNUM_PROTECT: '1' });
  ok((await call(null, '/sunum/')).s === 401, 'koruma açıkken oturumsuz sunum 401');
  ok((await call(null, '/')).s === 200, 'vitrin yine herkese açık');
  const AS = await login('admin', PW2);
  ok((await call(AS.j, '/sunum/')).s === 200, 'oturumlu yönetici sunumu görür');

  console.log('19) Sağlık ucu');
  const AH = await login('admin', PW2);
  const hl = await call(AH.j, '/api/admin/health');
  ok(
    hl.s === 200 && hl.j.orders.max === 5000 && hl.j.events.max === 200000 && Array.isArray(hl.j.warnings),
    'sağlık ucu sayaçları ve tavanları döndürür',
    hl.t.slice(0, 120),
  );
  ok(hl.j.memory.rssMb > 0 && hl.j.dbMb >= 0, 'bellek ve veritabanı boyutu raporlanır');
  // Belge boyutu ve satır sayıları: hangi belgenin şiştiği ve hangi modülün kaç kaydı olduğu görünür olmalı.
  ok(
    Array.isArray(hl.j.docs) && hl.j.docs.some(d => d.key === 'settings' && typeof d.kb === 'number'),
    'belge boyutları raporlanır',
    JSON.stringify(hl.j.docs || []).slice(0, 160),
  );
  ok(Array.isArray(hl.j.recs), 'satır tablosu sayıları raporlanır');
  ok((await call(null, '/api/admin/health')).s === 401, 'oturumsuz sağlık ucu 401');

  console.log(
    '20) Yeni iş modülü uçları (havuz, kiracı, feed, kural, lojistik, iade, destek, pano, reklam, analiz, B2B)',
  );
  for (const u of [
    'pool',
    'tenants',
    'feed?market=idealo',
    'rules',
    'shipping',
    'refunds',
    'support',
    'dashboard',
    'ads',
    'insights',
    'b2b',
  ]) {
    const r = await call(AH.j, '/api/admin/' + u);
    ok(r.s === 200, u + ' ucu oturumla 200', r.t.slice(0, 120));
    ok((await call(null, '/api/admin/' + u)).s === 401, u + ' ucu oturumsuz 401');
  }
  // Havuz: iki kaynaktan gelen aynı ürün tek kayda bağlanır (K-01), EAN ile eşleşir (K-02).
  const ing = async (src, ref, title, eans) =>
    await call(AH.j, '/api/admin/pool/ingest', { src, ref, title, vendor: 'E2E', eans });
  const hp1 = await ing('wawi', 'E-1', 'E2E Toner', ['4111111111111']);
  const hp2 = await ing('amazon', 'E-2', 'Baska Baslik', ['4111111111111']);
  ok(hp1.j?.id && hp1.j.id === hp2.j?.id, 'aynı EAN iki kaynaktan tek havuz kaydına bağlanır');
  const e2po = await call(AH.j, '/api/admin/pool/' + hp1.j.id);
  ok(e2po.s === 200 && e2po.j.sources.length === 2, 'havuz kaydı iki kaynağı taşır');
  // Kural motoru: yasak kuralı eklenince toplu yükleme o markayı hariç tutar (K-05).
  const e2rl = await call(AH.j, '/api/admin/rules/add', {
    vendor: 'E2E',
    market: 'idealo',
    reason: 'E2E denemesi: bu marka Idealo’da satılmaz',
  });
  ok(e2rl.s === 200 || e2rl.s === 201, 'satış yasağı kuralı eklendi', e2rl.t.slice(0, 120));
  const e2ev = await call(AH.j, '/api/admin/rules/preview', { market: 'idealo', vendors: ['E2E'] });
  ok(
    e2ev.s === 200 && JSON.stringify(e2ev.j).includes('false'),
    'kural önizlemesi markayı yasaklı gösterir',
    e2ev.t.slice(0, 160),
  );
  // Rıza kaydı: onaysız adres hiçbir gönderim listesine girmez (K-30).
  const e2au = await call(AH.j, '/api/admin/ads/audience?kind=cart');
  ok(e2au.s === 200, 'retargeting listesi döndü', e2au.t.slice(0, 120));
  // Sipariş kaydı artık kaynak alanlarını taşıyor: pano kırılımı 'bilinmiyor' altında toplanmıyor.
  const e2rev = await call(AH.j, '/api/admin/dashboard/revenue?groupBy=shop');
  ok(
    e2rev.s === 200 && e2rev.j.rows.some(r => r.key === 'mixoutlet'),
    'pano mağaza kırılımı gerçek mağazayı gösteriyor',
    e2rev.t.slice(0, 160),
  );
  const e2ori = await call(AH.j, '/api/admin/tenants/origin', { shop: 'depo-1', market: 'kaufland' });
  ok(
    e2ori.s === 200 && e2ori.j.origin.shop === 'depo-1',
    'vitrin kimliği değiştirildi',
    e2ori.t.slice(0, 120),
  );
  // Geri al: sonraki denetimler varsayılan kimlikle çalışsın.
  await call(AH.j, '/api/admin/tenants/origin', { shop: 'mixoutlet', market: 'shop' });
  // Karşılaştırma sitesi feed'i: ayar yöneticide, platform dosyayı anahtarla çeker; anahtarsız/yanlış anahtar 404.
  ok((await call(AH.j, '/api/admin/channel-feed')).s === 200, 'kanal feed ayarı okunur');
  const cfNr = await call(AH.j, '/api/admin/channel-feed/build', { target: 'idealo-de' });
  ok(cfNr.s === 409, 'ayarı eksik ülkenin feedi 409', cfNr.t.slice(0, 120));
  const cfSet = await call(AH.j, '/api/admin/channel-feed/config', {
    countries: { de: { deliveryMin: 1, deliveryMax: 3, shipping: { dhl: 4.9 }, payments: { paypal: 0 } } },
  });
  ok(cfSet.s === 200, 'kanal feed ayarı kaydedildi', cfSet.t.slice(0, 120));
  const cfTok = await call(AH.j, '/api/admin/channel-feed/token', { target: 'idealo-de' });
  ok(cfTok.s === 200 && typeof cfTok.j.token === 'string', 'feed anahtarı üretildi');
  const cfGet = await call(null, '/api/feeds/idealo-de.csv?key=' + encodeURIComponent(cfTok.j.token));
  ok(
    cfGet.s === 200 && cfGet.t.includes('"deliveryCosts_dhl"') && cfGet.t.includes('"paymentCosts_paypal"'),
    'idealo CSV anahtarla çekildi',
    cfGet.t.slice(0, 160),
  );
  const cfBasic = await call(null, '/api/feeds/idealo-de.csv', undefined, {
    headers: { authorization: 'Basic ' + Buffer.from('idealo:' + cfTok.j.token).toString('base64') },
  });
  ok(cfBasic.s === 200, 'Basic auth parolasıyla da çekilir');
  ok(
    (await call(null, '/api/feeds/idealo-de.csv?key=yanlis-anahtar-123456')).s === 404,
    'yanlış anahtar 404',
  );
  ok((await call(null, '/api/feeds/idealo-de.xml?key=' + cfTok.j.token)).s === 404, 'yanlış uzantı 404');
  ok((await call(null, '/api/feeds/idealo-de.csv')).s === 404, 'anahtarsız 404');
  // Yönetici uçlarında yöntem kısıtı yeni modüllerde de geçerli.
  ok((await call(AH.j, '/api/admin/pool', {}, { method: 'PUT' })).s === 405, 'yeni uçlarda PUT 405');
} catch (e) {
  failN++;
  console.error('DENEME ÇÖKTÜ:', e, '\n--- sunucu günlüğü ---\n' + logs.slice(-1500));
} finally {
  await stop();
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(`\nSONUÇ: ${pass} geçti, ${failN} kaldı`);
  process.exit(failN ? 1 : 0);
}
