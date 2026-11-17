import { store, isObj } from '../lib/store.mjs';

// Büyüyen iş kayıtları için servis katmanı girişi (db/recs.mjs üstünde ince bir sarmalayıcı).
//
// Kural (bkz. ARCHITECTURE.md): küçük ve tavanlı durum (ayar, yapılandırma, sayaç) `store.doc` belgesinde
// kalır; SAYISI KULLANIMLA BÜYÜYEN kayıt (iade, bilet, anlaşma, personel kaydı, pazar verisi, feed raporu)
// burada, satır olarak durur. Belgede her yazma tüm belgeyi yeniden yazar; burada yalnız değişen satır yazılır.
//
// Kullanım:
//   const kayitlar = recordSet('refunds');
//   kayitlar.put({ id, status, ... });   kayitlar.get(id);   kayitlar.all({ desc: true, limit: 50 });
//
// Kayıt gövdesi JSON'dur; `id` zorunludur, `t` verilmezse yazma anı kullanılır. Her ikisi de ayrı sütunda
// durduğu için sıralama ve tekillik veritabanındadır, bellekte değil.
export function recordSet(kind) {
  const k = String(kind);
  if (!k) throw new Error('recordSet: kind gerekli');
  return {
    kind: k,
    get: id => store.recs.get(k, id),
    put: rec => store.recs.put(k, rec),
    del: id => store.recs.del(k, id),
    all: (opt = {}) => store.recs.all(k, opt),
    count: () => store.recs.count(k),
    prune: max => store.recs.prune(k, max),
    putMany: list => store.recs.putMany(k, list),
    clear: () => store.recs.clear(k),
  };
}

// Eski kurulumlarda bu kayıtlar belgede duruyordu. Taşıma bir kez çalışır: satırlar yazılır, belgedeki
// kopyaları temizlenir ve belgeye damga konur. Damga belgede durur (satırda değil), çünkü soru "bu BELGE
// taşındı mı" sorusudur. İkinci çağrı hiçbir şey yapmaz; veri iki kez yazılmaz, satırdaki güncel hâli ezilmez.
const DAMGA = '__recsMoved';
export function moveDocRows(kind, docName, { rows, strip }) {
  const k = String(kind),
    d = store.doc(String(docName), {});
  if (!isObj(d)) return 0;
  const damga = isObj(d[DAMGA]) ? d[DAMGA] : (d[DAMGA] = {});
  if (damga[k]) return 0;
  const list = (typeof rows === 'function' ? rows(d) : []) || [];
  const n = store.recs.putMany(k, list);
  if (typeof strip === 'function') strip(d);
  damga[k] = Date.now();
  store.saveDoc(String(docName), d);
  if (n) console.log(`kayıtlar belgeden satır tablosuna taşındı: ${docName} → recs(${k}), ${n} kayıt`);
  return n;
}
