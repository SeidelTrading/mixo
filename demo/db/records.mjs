import { parse, isObj } from './util.mjs';

// Siparişler, değişiklik günlüğü ve ziyaretçi olayları.
export function makeRecords({ q, tx }) {
  /* siparişler */
  const allOrders = () =>
    q('SELECT data FROM orders ORDER BY t, rowid')
      .all()
      .map(r => parse(r.data, null))
      .filter(isObj);
  const delOrder = id => {
    q('DELETE FROM orders WHERE id=?').run(id);
  };
  const putOrder = o => {
    q(
      'INSERT INTO orders(id,t,status,email,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, email=excluded.email, data=excluded.data',
    ).run(o.id, o.t, o.status, o.customer?.email || '', JSON.stringify(o));
  };
  /* değişiklik günlüğü */
  const allChanges = () =>
    q('SELECT id,t,by,user,summary,undo,undone FROM changes ORDER BY n')
      .all()
      .map(r => ({
        id: r.id,
        t: r.t,
        by: r.by,
        ...(r.user ? { user: r.user } : {}),
        summary: r.summary,
        undo: r.undo ? parse(r.undo, null) : null,
        undone: !!r.undone,
      }));
  const addChange = c => {
    q('INSERT INTO changes(id,t,by,user,summary,undo,undone) VALUES(?,?,?,?,?,?,?)').run(
      c.id,
      c.t,
      String(c.by),
      c.user || null,
      String(c.summary),
      c.undo ? JSON.stringify(c.undo) : null,
      c.undone ? 1 : 0,
    );
  };
  const setUndone = id => {
    q('UPDATE changes SET undone=1 WHERE id=?').run(id);
  };
  /* ziyaretçi olayları */
  const allEvents = () =>
    q('SELECT data FROM events ORDER BY n')
      .all()
      .map(r => parse(r.data, null))
      .filter(isObj);
  const addEvents = list => {
    if (list.length)
      tx(() => {
        const s = q('INSERT INTO events(t,data) VALUES(?,?)');
        for (const e of list) s.run(e.t, JSON.stringify(e));
      });
  };
  // from'dan eski olanlar ve max üstündeki en eski kayıtlar silinir; silinen sayı döner.
  const pruneEvents = (from, max) =>
    tx(() => {
      let n = Number(q('DELETE FROM events WHERE t < ?').run(from).changes);
      const c = q('SELECT COUNT(*) c FROM events').get().c;
      if (c > max)
        n += Number(
          q('DELETE FROM events WHERE n IN (SELECT n FROM events ORDER BY n LIMIT ?)').run(c - max).changes,
        );
      return n;
    });
  return {
    allOrders,
    delOrder,
    putOrder,
    allChanges,
    addChange,
    setUndone,
    allEvents,
    addEvents,
    pruneEvents,
  };
}
