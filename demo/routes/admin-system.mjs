import { send } from '../lib/http.mjs';
import { PW_MIN, ROLES, USER_RE, checkPw, hashPw, limited, makeSession } from '../lib/auth.mjs';
import { store } from '../lib/store.mjs';
import { logChange } from '../services/settings.mjs';
import { BACKUP_KEEP } from '../lib/config.mjs';

// Hesap (parola), kullanıcılar, yedekler, iş kuyruğu.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
export async function adminSystemRoutes(c) {
  const { req, res, p, secure, body, me } = c;
  if (p === '/api/admin/password') {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' });
    if (limited('pw' + me.id, 5, 600e3))
      return send(res, 429, { error: 'Çok fazla deneme. Biraz bekleyin.' });
    const u = store.users.byId(me.id),
      np = body.password;
    if (typeof body.current !== 'string' || !checkPw(body.current.slice(0, 200), u.pw))
      return send(res, 400, { error: 'Mevcut parola hatalı.' });
    if (typeof np !== 'string' || np.length < PW_MIN || np.length > 200)
      return send(res, 400, { error: `Yeni parola en az ${PW_MIN} karakter olmalı.` });
    store.users.setPw(me.id, hashPw(np));
    store.sessions.delUser(me.id);
    console.log(`parola değişti kullanıcı=${me.username}`); // tüm oturumlar düşer; bu tarayıcıya yenisi verilir
    return send(
      res,
      200,
      { ok: true },
      {
        'set-cookie': `mxadm=${makeSession(me.id)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure}`,
      },
    );
  }
  if (p === '/api/admin/users' && req.method === 'GET')
    return send(res, 200, {
      users: store.users
        .all()
        .map(u => ({ ...u, disabled: !!u.disabled, roleLabel: ROLES[u.role], self: u.id === me.id })),
      roles: ROLES,
      pwMin: PW_MIN,
      logins: store.logins.recent(40),
    });
  if (p === '/api/admin/users') {
    const act = String(body.action || ''),
      t = act === 'add' ? null : store.users.byId(Number(body.id)),
      lastBoss = u => u.role === 'yonetici' && !u.disabled && store.users.activeAdmins() <= 1;
    const pwOk = v => typeof v === 'string' && v.length >= PW_MIN && v.length <= 200;
    if (act === 'add') {
      const name = String(body.username || '')
          .trim()
          .toLowerCase(),
        role = String(body.role || '');
      if (!USER_RE.test(name))
        return send(res, 400, {
          error: 'Kullanıcı adı 3–32 karakter olmalı: küçük harf, rakam, nokta, tire, alt çizgi.',
        });
      if (!Object.hasOwn(ROLES, role)) return send(res, 400, { error: 'Rol geçersiz.' });
      if (!pwOk(body.password)) return send(res, 400, { error: `Parola en az ${PW_MIN} karakter olmalı.` });
      if (store.users.byName(name)) return send(res, 400, { error: 'Bu kullanıcı adı zaten var.' });
      store.users.add(name, role, hashPw(body.password));
      return send(res, 200, {
        ok: true,
        change: logChange('yönetici', `Kullanıcı eklendi: ${name} (${ROLES[role]})`, null).summary,
      });
    }
    if (!t) return send(res, 404, { error: 'Kullanıcı bulunamadı.' });
    if (act === 'role') {
      const role = String(body.role || '');
      if (!Object.hasOwn(ROLES, role)) return send(res, 400, { error: 'Rol geçersiz.' });
      if (role !== 'yonetici' && lastBoss(t))
        return send(res, 400, { error: 'Son yöneticinin rolü düşürülemez.' });
      store.users.setRole(t.id, role);
      store.sessions.delUser(t.id);
      return send(res, 200, {
        ok: true,
        change: logChange('yönetici', `Kullanıcı rolü değişti: ${t.username} → ${ROLES[role]}`, null).summary,
      });
    }
    if (act === 'disable') {
      const d = body.disabled !== false;
      if (d && t.id === me.id) return send(res, 400, { error: 'Kendi hesabınızı kapatamazsınız.' });
      if (d && lastBoss(t)) return send(res, 400, { error: 'Son yönetici hesabı kapatılamaz.' });
      store.users.setDisabled(t.id, d);
      if (d) store.sessions.delUser(t.id);
      return send(res, 200, {
        ok: true,
        change: logChange('yönetici', `Kullanıcı ${d ? 'kapatıldı' : 'yeniden açıldı'}: ${t.username}`, null)
          .summary,
      });
    }
    if (act === 'password') {
      if (!pwOk(body.password)) return send(res, 400, { error: `Parola en az ${PW_MIN} karakter olmalı.` });
      store.users.setPw(t.id, hashPw(body.password));
      store.sessions.delUser(t.id);
      return send(res, 200, {
        ok: true,
        change: logChange('yönetici', `Kullanıcı parolası sıfırlandı: ${t.username}`, null).summary,
      });
    }
    return send(res, 400, { error: 'Bilinmeyen işlem.' });
  }
  if (p === '/api/admin/backups')
    return send(res, 200, {
      items: store.listBackups(),
      keep: BACKUP_KEEP,
      note: 'Yedekler veritabanıyla aynı diskte durur; disk dışı kopya ayrıca alınmalıdır.',
    });
  if (p === '/api/admin/backup') {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' });
    if (limited('bk', 6, 3600e3)) return send(res, 429, { error: 'Saatte en çok 6 elle yedek alınabilir.' });
    const b = store.backup(BACKUP_KEEP);
    console.log(`yedek alındı (elle, ${me.username}): ${b.name}`);
    return send(res, 200, { ok: true, backup: b });
  }
  if (p === '/api/admin/jobs') return send(res, 200, { items: store.jobs.list(80) });
}
