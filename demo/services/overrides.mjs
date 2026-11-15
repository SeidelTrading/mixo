import { CATS } from './catalog.mjs';
import { settings } from './settings.mjs';

/* ürün düzenlemeleri (overrides), içerik ve kategori ayarları: doğrulama */
const OV_KEYS = ['title', 'price', 'was', 'na', 'img'];
export const baseOf = p => ({ title: p.title, price: p.price, was: p.was || 0, na: !!p.na, img: p.img });
const toNum = v =>
  typeof v === 'number'
    ? v
    : typeof v === 'string' && v.trim() !== ''
      ? Number(v.trim().replace(',', '.'))
      : NaN;
// fields: {title?, price?, was?, na?, img?}; null = bu alanın düzenlemesini kaldır. Dönüş: { fields } ya da { err }
export function cleanOverride(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return { err: 'Geçersiz alanlar.' };
  const out = {};
  for (const k of Object.keys(f)) {
    const v = f[k];
    if (!OV_KEYS.includes(k)) return { err: `Bilinmeyen alan: ${k}` };
    if (v === null) {
      out[k] = null;
      continue;
    }
    if (k === 'title') {
      const t = typeof v === 'string' ? v.trim() : '';
      if (t.length < 1 || t.length > 200) return { err: 'Başlık 1–200 karakter olmalı.' };
      out.title = t;
    } else if (k === 'price' || k === 'was') {
      const n = k === 'was' && v === '' ? 0 : toNum(v);
      if (!Number.isFinite(n) || n < 0 || n > 1e7)
        return { err: (k === 'price' ? 'Fiyat' : 'Eski fiyat') + ' 0 veya daha büyük bir sayı olmalı.' };
      out[k] = Math.round(n * 100) / 100;
    } else if (k === 'na') {
      if (typeof v !== 'boolean') return { err: 'Stok durumu true/false olmalı.' };
      out.na = v;
    } else if (k === 'img') {
      const u = typeof v === 'string' ? v.trim() : '';
      if (!u) {
        out.img = null;
        continue;
      }
      if (
        u.length > 500 ||
        !(/^https:\/\/[^\s"'<>\\]+$/.test(u) || (/^img\/[\w./%() -]+$/.test(u) && !u.includes('..')))
      )
        return { err: 'Görsel adresi https:// ile başlamalı ya da img/… yolu olmalı.' };
      out.img = u;
    }
  }
  return { fields: out };
}
export const CONTENT_KEYS = {
  announce2: ['Duyuru şeridi 2', 160],
  heroTitle: ['Ana başlık', 120],
  heroSub: ['Alt metin', 400],
  demobar: ['Demo şeridi', 300],
  freeShip: ['Ücretsiz kargo eşiği'],
};
export function cleanContent(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { err: 'Geçersiz içerik.' };
  const out = {};
  for (const k of Object.keys(patch)) {
    const def = CONTENT_KEYS[k];
    if (!def) return { err: `Bilinmeyen içerik alanı: ${k}` };
    const v = patch[k];
    if (v === null || v === '') {
      out[k] = null;
      continue;
    }
    if (k === 'freeShip') {
      const n = toNum(v);
      if (!Number.isFinite(n) || n < 0 || n > 10000)
        return { err: 'Ücretsiz kargo eşiği 0–10000 arası bir sayı olmalı.' };
      out[k] = Math.round(n * 100) / 100;
    } else {
      const t = typeof v === 'string' ? v.trim() : '';
      if (!t) {
        out[k] = null;
        continue;
      }
      if (t.length > def[1]) return { err: `${def[0]} en çok ${def[1]} karakter olabilir.` };
      out[k] = t;
    }
  }
  return { patch: out };
}
export const effP = p => {
  const o = settings.overrides[p.id];
  if (!o) return p;
  const r = { ...p };
  for (const k of OV_KEYS) if (k in o) r[k] = o[k];
  return r;
};
export const catDefaultLabel = k => CATS.find(c => c.k === k)?.label;
