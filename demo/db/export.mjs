import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Şifreli dış yedek: AES-256-GCM, anahtar scrypt ile paroladan türetilir.
// Biçim: "MXB1" | tuz(16) | iv(12) | etiket(16) | şifreli veri. Parola yoksa ya da yanlışsa açma başarısız olur (GCM etiketi).
const MAGIC = Buffer.from('MXB1');
const keyOf = (pass, salt) => crypto.scryptSync(String(pass), salt, 32);

export function encryptFile(src, dest, pass) {
  const salt = crypto.randomBytes(16),
    iv = crypto.randomBytes(12),
    c = crypto.createCipheriv('aes-256-gcm', keyOf(pass, salt), iv),
    enc = Buffer.concat([c.update(fs.readFileSync(src)), c.final()]);
  fs.writeFileSync(dest, Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), enc]), { mode: 0o600 });
  return fs.statSync(dest).size;
}

export function decryptFile(src, dest, pass) {
  const b = fs.readFileSync(src);
  if (b.length < 48 || !b.subarray(0, 4).equals(MAGIC)) throw new Error('şifreli yedek biçimi tanınmadı');
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(pass, b.subarray(4, 20)), b.subarray(20, 32));
  d.setAuthTag(b.subarray(32, 48));
  try {
    fs.writeFileSync(dest, Buffer.concat([d.update(b.subarray(48)), d.final()]), { mode: 0o600 });
  } catch {
    throw new Error('şifre çözülemedi: parola yanlış ya da dosya bozuk');
  }
}

// Dış klasöre şifreli kopya yazar (BACKUP_EXPORT_DIR bağlı bir disk/bulut klasörü olabilir); son `keep` kopya tutulur.
export function exportEncrypted(plainFile, exportDir, pass, keep = 14) {
  fs.mkdirSync(exportDir, { recursive: true, mode: 0o700 });
  const name = path.basename(plainFile) + '.enc';
  encryptFile(plainFile, path.join(exportDir, name), pass);
  const old = fs
    .readdirSync(exportDir)
    .filter(f => /^mixo-\d{8}-\d{6}\.db\.enc$/.test(f))
    .sort()
    .reverse()
    .slice(Math.max(1, keep));
  for (const f of old) fs.rmSync(path.join(exportDir, f), { force: true });
  return name;
}
