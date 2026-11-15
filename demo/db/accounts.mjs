// Kullanıcılar, oturumlar ve giriş kaydı.
export function makeAccounts({ q }) {
  /* kullanıcılar, oturumlar, giriş kaydı */
  const users = {
    all: () => q('SELECT id,username,role,disabled,created,pw_changed FROM users ORDER BY id').all(),
    byName: name => q('SELECT * FROM users WHERE username=?').get(name),
    byId: id => q('SELECT * FROM users WHERE id=?').get(id),
    add: (username, role, pw) => {
      const now = Date.now();
      return Number(
        q('INSERT INTO users(username,role,pw,created,pw_changed) VALUES(?,?,?,?,?)').run(
          username,
          role,
          pw,
          now,
          now,
        ).lastInsertRowid,
      );
    },
    setPw: (id, pw) => {
      q('UPDATE users SET pw=?, pw_changed=? WHERE id=?').run(pw, Date.now(), id);
    },
    setRole: (id, role) => {
      q('UPDATE users SET role=? WHERE id=?').run(role, id);
    },
    setDisabled: (id, d) => {
      q('UPDATE users SET disabled=? WHERE id=?').run(d ? 1 : 0, id);
    },
    activeAdmins: () => q("SELECT COUNT(*) c FROM users WHERE role='yonetici' AND disabled=0").get().c,
  };
  const sessions = {
    put: (sid, userId, exp) => {
      q('INSERT INTO sessions(sid,user_id,exp,seen) VALUES(?,?,?,?)').run(sid, userId, exp, Date.now());
    },
    get: sid => q('SELECT sid,user_id,exp,seen FROM sessions WHERE sid=?').get(sid),
    touch: sid => {
      q('UPDATE sessions SET seen=? WHERE sid=?').run(Date.now(), sid);
    },
    del: sid => {
      q('DELETE FROM sessions WHERE sid=?').run(sid);
    },
    delUser: userId => Number(q('DELETE FROM sessions WHERE user_id=?').run(userId).changes),
    purge: idleMs => {
      const now = Date.now();
      q('DELETE FROM sessions WHERE exp < ? OR seen < ?').run(now, now - idleMs);
    },
  };
  const logins = {
    add: (ip, username, ok) => {
      q('INSERT INTO logins(t,ip,username,ok) VALUES(?,?,?,?)').run(
        Date.now(),
        String(ip || '').slice(0, 64),
        String(username || '').slice(0, 40),
        ok ? 1 : 0,
      );
    },
    recent: (limit = 50) =>
      q('SELECT t,ip,username,ok FROM logins ORDER BY n DESC LIMIT ?')
        .all(limit)
        .map(r => ({ ...r, ok: !!r.ok })),
    prune: days => {
      q('DELETE FROM logins WHERE t < ?').run(Date.now() - days * 864e5);
    },
  };
  return { users, sessions, logins };
}
