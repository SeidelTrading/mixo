import fs from 'node:fs';
import path from 'node:path';
import { verifyFile } from './verify.mjs';

// Yedek: VACUUM INTO ile tutarlı tek dosyalık kopya (sunucu çalışırken alınabilir).
export function makeBackup({ db, dataDir }) {
  /* yedek: VACUUM INTO tutarlı, tek dosyalık bir kopya üretir (sunucu çalışırken alınabilir) */
  const backupDir = path.join(dataDir, 'backups');
  const listBackups = () =>
    fs.existsSync(backupDir)
      ? fs
          .readdirSync(backupDir)
          .filter(f => /^mixo-\d{8}-\d{6}\.db$/.test(f))
          .sort()
          .reverse()
          .map(f => {
            const st = fs.statSync(path.join(backupDir, f));
            return { name: f, size: st.size, t: Math.round(st.mtimeMs) };
          })
      : [];
  const backup = (keep = 14) => {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const d = new Date(),
      p2 = n => String(n).padStart(2, '0'),
      name = `mixo-${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}-${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}.db`,
      dest = path.join(backupDir, name);
    if (fs.existsSync(dest)) fs.rmSync(dest);
    db.prepare('VACUUM INTO ?').run(dest);
    fs.chmodSync(dest, 0o600);
    const v = verifyFile(dest);
    if (!v.ok) {
      fs.rmSync(dest, { force: true });
      throw new Error('yedek doğrulanamadı: ' + v.integrity);
    }
    for (const old of listBackups().slice(Math.max(1, keep)))
      fs.rmSync(path.join(backupDir, old.name), { force: true });
    return { name, size: fs.statSync(dest).size, counts: v.counts };
  };
  return { backupDir, listBackups, backup };
}
