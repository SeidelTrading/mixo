import { store } from '../lib/store.mjs';
import { readBody, send } from '../lib/http.mjs';
import {
  DUMMY_PW,
  FAIL_GLOBAL,
  FAIL_PER_IP,
  FAIL_WINDOW,
  checkPw,
  goodIps,
  limited,
  loginFails,
  makeSession,
} from '../lib/auth.mjs';

// Yönetici girişi (oturumsuz).
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
export async function adminAuthRoutes(c) {
  const { req, res, p, ip, secure } = c;
  if (p === '/api/admin/login' && req.method === 'POST') {
    if (!store.users.activeAdmins())
      return send(res, 503, { error: 'Yönetici hesabı tanımlı değil (ADMIN_PASSWORD).' });
    const now = Date.now();
    while (loginFails.length && now - loginFails[0].t > FAIL_WINDOW) loginFails.shift();
    if (limited('login' + ip, 6, 60e3))
      return send(res, 429, { error: 'Çok fazla deneme. Bir dakika bekleyin.' });
    if (
      (loginFails.length >= FAIL_GLOBAL && !goodIps.has(ip)) ||
      loginFails.filter(f => f.ip === ip).length >= FAIL_PER_IP
    ) {
      console.warn(`giriş KİLİTLİ ip=${ip} (son 15 dk hatalı deneme: ${loginFails.length})`);
      return send(res, 429, { error: 'Çok fazla hatalı deneme. 15 dakika sonra yeniden deneyin.' });
    }
    const b = await readBody(req, 2e3),
      username = (
        typeof b.username === 'string' && b.username.trim() ? b.username.trim().toLowerCase() : 'admin'
      ).slice(0, 40),
      password = b.password;
    // Parola scrypt ile doğrulanır; bilinmeyen ya da kapatılmış kullanıcıda da aynı hesap yapılır (kullanıcı adı süreden anlaşılmaz).
    const u = store.users.byName(username),
      live = !!u && !u.disabled,
      good =
        typeof password === 'string' &&
        password.length <= 200 &&
        checkPw(password, live ? u.pw : DUMMY_PW) &&
        live;
    if (!good) {
      loginFails.push({ t: now, ip });
      store.logins.add(ip, username, false);
      console.warn(`giriş BAŞARISIZ ip=${ip} kullanıcı=${JSON.stringify(username)}`);
      return send(res, 401, { error: 'Kullanıcı adı ya da parola hatalı.' });
    }
    store.logins.add(ip, username, true);
    goodIps.add(ip);
    console.log(`giriş başarılı ip=${ip} kullanıcı=${username}`);
    return send(
      res,
      200,
      { ok: true },
      {
        'set-cookie': `mxadm=${makeSession(u.id)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure}`,
      },
    );
  }
}
