import { parse } from './util.mjs';

// Kalıcı iş kuyruğu: sunucu yeniden başlasa da bekleyen işler sürer.
export function makeJobs({ q, tx }) {
  /* iş kuyruğu: kalıcıdır; sunucu yeniden başlasa da bekleyen işler sürer */
  const jobs = {
    // unique: aynı türde bekleyen/çalışan iş varsa yenisi eklenmez (yinelenen işlerin çoğalmaması için)
    enqueue: (type, payload = {}, { runAt = Date.now(), maxAttempts = 5, unique = false } = {}) => {
      if (
        unique &&
        q("SELECT 1 x FROM jobs WHERE type=? AND status IN ('queued','running') LIMIT 1").get(type)
      )
        return null;
      return Number(
        q("INSERT INTO jobs(type,payload,status,run_at,max_attempts,created) VALUES(?,?,'queued',?,?,?)").run(
          type,
          JSON.stringify(payload),
          runAt,
          maxAttempts,
          Date.now(),
        ).lastInsertRowid,
      );
    },
    claim: (now = Date.now()) =>
      tx(() => {
        const j = q("SELECT * FROM jobs WHERE status='queued' AND run_at<=? ORDER BY run_at, id LIMIT 1").get(
          now,
        );
        if (!j) return null;
        q("UPDATE jobs SET status='running', attempts=attempts+1 WHERE id=?").run(j.id);
        return { ...j, attempts: j.attempts + 1, payload: parse(j.payload, {}) };
      }),
    done: id => {
      // Tamamlanan işin yükü silinir: onay belirteci gibi gizli değerler veritabanında ve yedeklerde kalmasın.
      q("UPDATE jobs SET status='done', done_at=?, last_error=NULL, payload='{}' WHERE id=?").run(
        Date.now(),
        id,
      );
    },
    // retryAt verilirse iş yeniden sıraya girer; verilmezse 'failed' olarak kalır
    fail: (id, err, retryAt) => {
      q(
        "UPDATE jobs SET status=?, run_at=COALESCE(?,run_at), last_error=?, done_at=?, payload=CASE WHEN ? IS NULL THEN '{}' ELSE payload END WHERE id=?",
      ).run(
        retryAt ? 'queued' : 'failed',
        retryAt ?? null,
        String(err).slice(0, 300),
        retryAt ? null : Date.now(),
        retryAt ?? null,
        id,
      );
    },
    recover: () => Number(q("UPDATE jobs SET status='queued' WHERE status='running'").run().changes),
    list: (limit = 60) =>
      q(
        'SELECT id,type,status,run_at,attempts,max_attempts,last_error,created,done_at FROM jobs ORDER BY id DESC LIMIT ?',
      ).all(limit),
    prune: days => {
      q("DELETE FROM jobs WHERE status IN ('done','failed') AND done_at < ?").run(Date.now() - days * 864e5);
    },
  };
  return { jobs };
}
