import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HERE } from './config.mjs';
import { store } from './store.mjs';

/* ───────── yönetici parolası ve oturum ───────── */
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PW_FILE = path.join(HERE, '.admin-password');
if (!ADMIN_PASSWORD && !process.env.RAILWAY_ENVIRONMENT) {
  // yalnız yerel geliştirme: rastgele parola üret, dosyaya yaz
  if (fs.existsSync(PW_FILE)) ADMIN_PASSWORD = fs.readFileSync(PW_FILE, 'utf8').trim();
  else {
    ADMIN_PASSWORD = crypto.randomBytes(12).toString('base64url');
    fs.writeFileSync(PW_FILE, ADMIN_PASSWORD + '\n', { mode: 0o600 });
  }
  console.log('Yerel yönetici parolası şu dosyada:', PW_FILE);
}
if (!process.env.SESSION_SECRET && (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production'))
  console.warn(
    'UYARI: SESSION_SECRET tanımlı değil; her yeniden başlatmada imzalı çerezler (mxv, mxc) geçersiz olur. Ortam değişkeni verin.',
  );
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
export const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
export const sigOk = (sig, value) => {
  const a = Buffer.from(String(sig)),
    b = Buffer.from(sign(value));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
export const sha = s => crypto.createHash('sha256').update(String(s)).digest();
/* Kullanıcılar ve roller: her kişi kendi hesabıyla girer. yonetici: her şey · duzenleyen: mağaza değişiklikleri · goruntuleyen: yalnız okuma */
export const ROLES = { yonetici: 'Yönetici', duzenleyen: 'Düzenleyen', goruntuleyen: 'Görüntüleyen' },
  PW_MIN = 10,
  USER_RE = /^[a-z0-9._-]{3,32}$/;
export const hashPw = pw => {
  const salt = crypto.randomBytes(16);
  return (
    'scrypt$' +
    salt.toString('base64url') +
    '$' +
    crypto.scryptSync(String(pw), salt, 32).toString('base64url')
  );
};
export const checkPw = (pw, stored) => {
  const [k, s, h] = String(stored).split('$');
  if (k !== 'scrypt' || !s || !h) return false;
  const a = Buffer.from(h, 'base64url'),
    b = crypto.scryptSync(String(pw), Buffer.from(s, 'base64url'), 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
export const DUMMY_PW = hashPw(crypto.randomBytes(16).toString('hex')); // bilinmeyen kullanıcıda da aynı süre harcansın
// Önyükleme ve acil durum yolu: ADMIN_PASSWORD ilk açılışta "admin" hesabını oluşturur. Ortamdaki parola sonradan değiştirilirse
// "admin" hesabı o parolaya sıfırlanır, yeniden etkinleştirilir ve oturumları düşer. Panelden değiştirilen parola, ortam değişmedikçe korunur.
if (ADMIN_PASSWORD && ADMIN_PASSWORD.length < 12)
  console.warn('UYARI: ADMIN_PASSWORD 12 karakterden kısa; güçlü bir parola kullanın (acil durum hesabı).');
if (ADMIN_PASSWORD) {
  const boot = store.doc('admin_boot', null),
    adm = store.users.byName('admin');
  if (!adm) {
    store.users.add('admin', 'yonetici', hashPw(ADMIN_PASSWORD));
    store.saveDoc('admin_boot', { h: hashPw(ADMIN_PASSWORD) });
    console.log('kullanıcı "admin" oluşturuldu (rol: yönetici)');
  } else if (!boot?.h || !checkPw(ADMIN_PASSWORD, boot.h)) {
    store.users.setPw(adm.id, hashPw(ADMIN_PASSWORD));
    store.users.setRole(adm.id, 'yonetici');
    store.users.setDisabled(adm.id, false);
    store.sessions.delUser(adm.id);
    store.saveDoc('admin_boot', { h: hashPw(ADMIN_PASSWORD) });
    console.warn('ADMIN_PASSWORD değişmiş: "admin" parolası sıfırlandı, oturumları kapatıldı');
  }
}
// Oturumlar veritabanında ve kullanıcıya bağlıdır: çıkışta ve parola değişince silinir, 12 saatte ya da 2 saat hareketsizlikte düşer. Çerez: bitiş.kimlik.imza
export const SESSION_MS = 12 * 3600e3,
  IDLE_MS = 2 * 3600e3;
export const makeSession = userId => {
  const exp = Date.now() + SESSION_MS,
    sid = crypto.randomBytes(12).toString('base64url'),
    v = exp + '.' + sid;
  store.sessions.put(sid, userId, exp);
  return v + '.' + sign(v);
};
// Dönüş: { sid, user: { id, username, role } } ya da null
const sessionOf = c => {
  if (!c) return null;
  const [exp, sid, sig] = c.split('.'),
    now = Date.now();
  if (!exp || !sid || !sig || !(Number(exp) > now) || !sigOk(sig, exp + '.' + sid)) return null;
  const s = store.sessions.get(sid);
  if (!s) return null;
  if (!(s.exp > now) || now - s.seen > IDLE_MS) {
    store.sessions.del(sid);
    return null;
  }
  const u = store.users.byId(s.user_id);
  if (!u || u.disabled || !Object.hasOwn(ROLES, u.role)) return null;
  if (now - s.seen > 60e3) store.sessions.touch(sid);
  return { sid, user: { id: u.id, username: u.username, role: u.role } };
};
export const endSession = sid => {
  if (sid) store.sessions.del(sid);
};
export const cookie = (req, name) =>
  (req.headers.cookie || '')
    .split(/;\s*/)
    .map(x => x.split('='))
    .find(x => x[0] === name)?.[1];
export const authOf = req => sessionOf(cookie(req, 'mxadm'));
// İstemci adresi: yalnız güvenilen vekilin yazdığı değer kullanılır. İstemcinin kendi gönderdiği X-Forwarded-For öğelerine güvenilmez;
// vekil arkasında değilsek (yerel) başlıklar hiç okunmaz. Railway dışında bir vekil kullanılıyorsa TRUST_PROXY=1 verin.
const BEHIND_PROXY = !!(process.env.RAILWAY_ENVIRONMENT || process.env.TRUST_PROXY);
export const clientIp = req => {
  if (BEHIND_PROXY) {
    // Vekilin eklediği SON X-Forwarded-For öğesi esas alınır; X-Real-IP istemci tarafından yazılabildiği için yalnız yedektir.
    const xff = String(req.headers['x-forwarded-for'] || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (xff.length) return xff[xff.length - 1].slice(0, 64);
    const real = String(req.headers['x-real-ip'] || '').trim();
    if (real) return real.slice(0, 64);
  }
  return req.socket.remoteAddress || '';
};
export const goodIps = new Set(
  store.logins
    .recent(200)
    .filter(x => x.ok)
    .map(x => x.ip),
); // daha önce başarıyla giriş yapılan adresler: genel kilitten muaf (adres başına sınır yine geçerli)
export const loginFails = []; // { t, ip }: adresten bağımsız genel kilit ve adres başına kilit için
export const FAIL_WINDOW = 15 * 60e3,
  FAIL_PER_IP = 10,
  FAIL_GLOBAL = 40;
const hits = new Map();
// Reddedilen çağrı kaydedilmez: liste en çok `max` öğe tutar, sınır aşılınca maliyet büyümez.
export function limited(key, max, windowMs) {
  const now = Date.now(),
    a = (hits.get(key) || []).filter(t => now - t < windowMs);
  hits.set(key, a);
  if (a.length >= max) return true;
  a.push(now);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of hits) if (!a.some(t => now - t < 600e3)) hits.delete(k);
}, 300e3).unref();
