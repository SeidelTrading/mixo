/**
 * Üretici parça numarası (MPN) çıkarımı.
 *
 * Sözleşme (imzalar sabit; uygulayıcı A gövdeleri doldurur, tarayıcı tarafı yalnız içe aktarır):
 *   extractMpn({ title, brand, sku, bodyHtml, ean }) -> string | null
 *   mpnCandidates(mpn) -> string[]   URL eşleştirmesi için küçük harf, yalnız harf-rakam varyantlar
 *   isInternalSku(sku) -> boolean    Mixoutlet/tedarikçi iç kodları (BA-, arp-, OT-, UHREN1- ...)
 *
 * İç kodlar hiçbir zaman MPN sayılmaz: rakip sayfalarında geçmezler, eşleştirmeyi yalnızca boşa çıkarırlar.
 * Belirsiz durumda null tercih edilir: yanlış MPN yanlış ürün eşleşmesi demektir.
 */

/** Tedarikçi / mağaza iç kodu mu? (bueroarena BA-, parfüm arp-, OT-, saat tedarikçisi UHREN1- ...) */
export function isInternalSku(sku) {
  return /^(ba-|arp-|ot-|uhren\d*-)/i.test(String(sku ?? '').trim());
}

/** Yalnız küçük harf ve rakam. */
const alnum = v =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/** EAN/GTIN uzunluğunda salt rakam mı? (8/12/13/14 hane: parça numarası değil, barkod) */
const looksLikeEan = n => /^\d+$/.test(n) && [8, 12, 13, 14].includes(n.length);

/** Eşleştirmeye elverişli parça numarası: en az 5 harf-rakam, en az bir rakam, barkod ya da iç kod değil. */
export function isUsableMpn(v) {
  const n = alnum(v);
  return n.length >= 5 && /\d/.test(n) && !looksLikeEan(n) && !isInternalSku(v);
}

/**
 * Ölçü ve teknik belirteçler (parça numarası değildir): 0,5m 128GB 60Hz 4K, cat6a, usb3, rj45, v1.4, ddr5 ...
 * Başlıktaki token'dan MPN seçilirken elenir.
 */
const TECH_TOKEN = new RegExp(
  '^(?:' +
    [
      '\\d+(?:[.,]\\d+)?(?:cm|mm|m|km|gb|tb|mb|hz|khz|mhz|ghz|w|kw|wh|ah|mah|ml|l|g|kg|v|a|p|k|zoll|inch|mp|fps|db|mbit|gbit|mbps|gbps|rpm|pin|port|ports)',
      'cat\\.?\\d+[a-z]?',
      'usb\\d*(?:[.,]\\d+)?[a-z]?',
      'rj\\d+',
      'v\\d+(?:[.,]\\d+)*',
      'ddr\\d+[a-z]?',
      'sata\\d*',
      'pcie?\\d*(?:x\\d+)?',
      'd-?sub\\d*',
      'ip\\d{2}',
      'ipv\\d',
      'wifi\\d*',
      'wlan\\d*',
      'am\\d',
      'lga\\d+',
      'hdmi\\d*(?:[.,]\\d+)?',
      'dp\\d*(?:[.,]\\d+)?',
      '\\d+x\\d+(?:x\\d+)?(?:[a-z]+)?',
      'x\\d+',
      // paket ve adet ifadeleri (deneme 2026-11-18: "4er-Pack" MPN seçilmişti): 4er-Pack, 10er, 5-pack, 100stk, 12-teilig
      '\\d+er|\\d+-?(?:er-?)?(?:pack|packung|set|stk|st|stueck|stück|teilig|pcs|pc)',
      // bileşik ölçüler: 4K60Hz, 1080p60, 2160p30hz; işlemci modelleri: i7-14700K, i5 12400F
      '\\d+k\\d+hz',
      '\\d{3,4}p\\d{2,3}(?:hz)?',
      'i[3579][- ]?\\d{4,5}[a-z]{0,2}',
    ].join('|') +
    ')$',
  'i',
);

/** Marka kelimeleri (karşılaştırma için normalize). */
const brandWords = brand =>
  String(brand ?? '')
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/)
    .filter(Boolean);

/** Açıklama metni: etiketler ve temel HTML varlıkları atılır. */
function plainText(html) {
  return String(html ?? '')
    .replace(/<\s*(br|\/p|\/li|\/tr|\/div|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\u00a0]+/g, ' ');
}

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** sku başlıkta (harf-rakam sınırlarına saygıyla, ayırıcı farklarını yok sayarak) geçiyor mu? */
function inTitle(sku, title) {
  const runs = String(sku)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (!runs.length || !title) return false;
  const re = new RegExp(`(?<![A-Za-z0-9])${runs.map(escRe).join('[\\s\\-/._]*')}(?![A-Za-z0-9])`, 'i');
  return re.test(title);
}

/** Açıklamadaki etiketli parça numarası alanı (Herstellernummer, MPN, Modell ...). */
const BODY_LABEL =
  /(?<![A-Za-zäöüÄÖÜ])(?:Hersteller[\s-]*(?:art(?:ikel)?\.?[\s-]*)?(?:nummer|nr\.?)|Art\.?[\s-]*Nr\.?\s+des\s+Herstellers|MPN|Modell(?:[\s-]*(?:nummer|nr\.?))?|Model(?:[\s-]*(?:number|no\.?))?|Part[\s-]*(?:number|no\.?))(?![A-Za-zäöüÄÖÜ])\s*[:#.]?\s*([A-Za-z0-9][A-Za-z0-9\-/._]{3,30}[A-Za-z0-9])/gi;

/** Etiketten hemen önce uyumluluk ifadesi: etiketin değeri başka ürünün numarasıdır. */
const COMPAT_BEFORE =
  /(?:für|fuer|passend|kompatibel|compatible|compatibel|fits|geeignet|ersetzt|for)\s+(?:\S+\s+){0,2}$/i;

/** DeLOCK: EAN 4043619 ile başlıyorsa parça numarası ean[7..12] (66556, 80785 ...). */
function delockFromEan(brand, ean) {
  if (alnum(brand) !== 'delock') return null;
  const e = String(ean ?? '').replace(/\D+/g, '');
  if (e.length !== 13 || !e.startsWith('4043619')) return null;
  const m = e.slice(7, 12);
  return /^\d{5}$/.test(m) ? m : null;
}

/** Başlıkta markadan sonraki ilk uygun karışık harf-rakam token'ı (en çok 4 token ileriye bakılır). */
function fromTitle(title, brand) {
  const words = String(title ?? '')
    .split(/[\s,;]+/)
    .map(w => w.replace(/^[("'“”„–—-]+|[)"'“”„–—.:!?-]+$/g, ''))
    .filter(Boolean);
  const bw = brandWords(brand);
  let start = 0;
  if (bw.length) {
    // marka sözcüklerinin başlıkta (ilk 6 token içinde) son geçtiği yerden sonrası
    for (let i = 0; i < words.length && i < 6; i++) {
      const w = words[i].toLowerCase().replace(/[^a-z0-9äöüß]+/g, '');
      if (bw.includes(w)) start = i + 1;
    }
  }
  for (const w of words.slice(start, start + 4)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9\-._+]*[A-Za-z0-9]$/.test(w)) continue; // '/' içeren birleşik ölçüler elenir
    const n = alnum(w);
    if (n.length < 5 || n.length > 25) continue;
    if (!/\d/.test(n) || !/[a-z]/.test(n)) continue; // yalnız rakam ya da yalnız harf: karışık değil
    if (TECH_TOKEN.test(w) || TECH_TOKEN.test(n)) continue;
    if (!isUsableMpn(w)) continue;
    return w;
  }
  return null;
}

/**
 * Yalnız varyanta özgü kaynaktan (sku) parça numarası: kural a ve b (extractMpn). Çok varyantlı üründe başlık ya da
 * açıklama ürün düzeyindedir, hangi varyantın fiyatı olduğunu söylemez; yalnız sku varyantı belirler.
 * @param {{ title?: string, sku?: string }} [p]
 * @returns {string | null}
 */
export function mpnFromSku({ title, sku } = {}) {
  const t = String(title ?? '');
  const s = String(sku ?? '').trim();
  if (!s) return null;
  const pre = /^(?:uhren\d*-|ot-)(.+)$/i.exec(s);
  if (pre) return isUsableMpn(pre[1]) && inTitle(pre[1], t) ? pre[1] : null;
  return isUsableMpn(s) && inTitle(s, t) ? s : null;
}

/**
 * Ürün verisinden gerçek üretici parça numarası; emin değilse null. Kurallar sırayla:
 *  a) tedarikçi önekli sku (UHREN\d*-, OT-): önek atılır, kalan başlıkta geçiyorsa MPN
 *  b) öneksiz, iç kod olmayan sku başlıkta birebir geçiyorsa sku
 *  c) açıklamada Herstellernummer / MPN / Modell ... etiketi
 *  d) DeLOCK EAN kuralı (4043619...)
 *  e) başlıkta markadan sonraki karışık harf-rakam token'ı (ölçü ve teknik token'lar elenir)
 * BA-, arp- gibi iç kodlar ASLA MPN olmaz.
 * @param {{ title?: string, brand?: string, sku?: string, bodyHtml?: string, ean?: string }} [p]
 * @returns {string | null}
 */
export function extractMpn({ title, brand, sku, bodyHtml, ean } = {}) {
  const t = String(title ?? '');
  const fromSku = mpnFromSku({ title: t, sku });
  if (fromSku) return fromSku;
  if (bodyHtml) {
    const text = plainText(bodyHtml);
    BODY_LABEL.lastIndex = 0;
    for (let m; (m = BODY_LABEL.exec(text));) {
      // "Passend für Modell HP2000X": uyumlu model, ürünün kendi parça numarası değildir.
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      if (COMPAT_BEFORE.test(before)) continue;
      if (isUsableMpn(m[1])) return m[1];
    }
  }
  return delockFromEan(brand, ean) ?? fromTitle(t, brand);
}

/**
 * URL token eşleştirmesi için varyantlar: küçük harf, yalnız harf-rakam, en az 5 karakter ve bir rakam.
 * Tam değer; '/' ya da boşlukla bölünen parçalar; sondaki ondalık ek atılmış gövde (K8104GN.0,5 -> k8104gn05, k8104gn).
 * @param {string | null | undefined} mpn
 * @returns {string[]}
 */
export function mpnCandidates(mpn) {
  const raw = String(mpn ?? '').trim();
  const out = new Set();
  const add = v => {
    const n = alnum(v);
    if (n.length >= 5 && /\d/.test(n) && !looksLikeEan(n)) out.add(n);
  };
  add(raw);
  const parts = raw.split(/[/\s]+/).filter(Boolean);
  if (parts.length > 1) for (const p of parts) add(p);
  const dot = /^([A-Za-z0-9-]{5,})[.,]\d+(?:[.,]\d+)?$/.exec(raw);
  if (dot) add(dot[1]);
  return [...out].slice(0, 4);
}
