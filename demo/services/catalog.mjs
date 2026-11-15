import fs from 'node:fs';
import path from 'node:path';
import { HERE } from '../lib/config.mjs';

/* ───────── ürün dizini (statik katalogdan) ───────── */
export const CATS = JSON.parse(
  fs.readFileSync(path.join(HERE, 'data/index.js'), 'utf8').split('=').slice(1).join('='),
).cats;
export const P = new Map();
for (const f of fs.readdirSync(path.join(HERE, 'data')).filter(f => /^all-\d+\.js$/.test(f))) {
  const s = fs.readFileSync(path.join(HERE, 'data', f), 'utf8');
  for (const r of JSON.parse(s.slice(s.indexOf('[['), -1))) {
    const c = CATS[r[6]];
    P.set(r[0], {
      id: r[0],
      title: r[1],
      vendor: r[2],
      price: r[3],
      was: r[4],
      img: r[5],
      cat: c.k,
      catLabel: c.label,
      si: r[7],
      sub: c.subs[r[7]].name,
      na: r[8] === 0,
    });
  }
}
export const PROBLEMS = fs.existsSync(path.join(HERE, 'admin-data/problems.json'))
  ? JSON.parse(fs.readFileSync(path.join(HERE, 'admin-data/problems.json'), 'utf8'))
  : [];
export const TUR = {
  KUTU: 'Ürün yerine kutu',
  LOGO: 'Ürün yerine logo/simge',
  YANLIS: 'Başka ürünün fotoğrafı',
  BOS: 'Boş ya da ürünsüz görsel',
};
export const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
console.log(`katalog: ${P.size} ürün, ${PROBLEMS.length} sorunlu kayıt`);
