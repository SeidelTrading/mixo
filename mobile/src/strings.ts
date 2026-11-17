import type { BestSource } from './api/shop';
import { num } from './theme';

/** Almanca sözlüğün koddaki tek kaynağı (sözleşme bölüm 4). {x} yer tutucuları fmt ile doldurulur. */
export const T = {
  tabStart: "Start",
  tabMerkliste: "Merkliste",
  tabWarenkorb: "Warenkorb",
  tabBereich: "Mein Bereich",
  tabKategorien: "Kategorien",
  searchPlaceholder: "Im Outlet suchen",
  a11ySearchOpen: "Suche öffnen",
  a11yBack: "Zurück",
  a11ySearchInput: "Suchbegriff",
  a11yClearInput: "Eingabe löschen",
  chooseCategory: "Kategorie wählen",
  addToCart: "In den Warenkorb",
  addedToCart: "Zum Warenkorb hinzugefügt",
  favAdd: "Auf die Merkliste",
  favRemove: "Von der Merkliste entfernen",
  favLongPressHint: "Lange drücken, um eine Liste zu wählen",
  notAvailable: "Nicht verfügbar",
  available: "Verfügbar",
  dataNote: "Preis und Bestand wie zum Zeitpunkt der Datenübernahme (Demo).",
  vatNote: "inkl. MwSt., zzgl. Versand",
  productNotFoundTitle: "Produkt nicht gefunden",
  productNotFoundText: "Dieses Produkt gibt es im Shop nicht (mehr).",
  unavailableText: "Dieses Produkt wird derzeit nicht angeboten. Angezeigt ist der zuletzt bekannte Stand.",
  staleText: "Aktuelle Daten konnten nicht geladen werden. Angezeigt ist der zuletzt bekannte Stand.",
  inCartQty: "Menge im Warenkorb: {n}",
  backToShop: "Zur Startseite",
  close: "Schließen",
  productsN: "{n} Produkte",
  // Sıra yalnız ürün sayısından gelir: popülerlik ima eden "Top" yok
  topBrands: "Marken mit großer Auswahl",
  largestSubs: "Größte Unterkategorien",
  recentlyViewed: "Zuletzt angesehen",
  recentEmpty: "Noch nichts angesehen",
  deals: "Aktionen",
  bestBehavior: "Beliebt",
  // Sunucunun "curated" listesi gerçek bir editör seçimi değil: küratörlük ima etmeyen dürüst ad
  bestCurated: "Aus dem Sortiment",
  budget: "Preiswert unter 25 €",
  from120: "Ab 120 €",
  freeShipFrom: "Gratisversand ab {x}",
  filter: "Filter",
  sort: "Sortieren",
  brand: "Marke",
  price: "Preis",
  onlyAvailable: "Nur verfügbar",
  reduced: "Reduziert",
  subcategory: "Unterkategorie",
  category: "Kategorie",
  availability: "Verfügbarkeit",
  reset: "Zurücksetzen",
  resetFilters: "Filter zurücksetzen",
  show: "Ergebnisse anzeigen",
  showN: "{n} Ergebnisse anzeigen",
  sortStandard: "Standard",
  sortAscShort: "Preis ↑",
  sortDescShort: "Preis ↓",
  sortAsc: "Preis aufsteigend",
  sortDesc: "Preis absteigend",
  sortNeedsSub: "Für die Preissortierung bitte zuerst eine Unterkategorie wählen.",
  sortNeedsCat: "Für die Preissortierung bitte zuerst eine Kategorie wählen.",
  chooseSub: "Unterkategorie wählen",
  allSubs: "Alle Unterkategorien",
  loadMoreProducts: "Weitere Produkte laden",
  scopeUnknown: "Diese Kategorie ist nicht verfügbar.",
  allIn: "Alle in {k}",
  offers: "Angebote",
  loadingAll: "Alle Produkte werden geladen … {p} %",
  brandsTotal: "{nb} Marken",
  moreBrands: "Weitere Marken",
  brandsPartial: "Nur Marken aus den durchsuchten {p} %",
  hitsPartial: "mind. {n} Treffer",
  moreLoading: "weitere werden geladen",
  moreOnScroll: "weitere beim Scrollen",
  hitsExact: "{n} Treffer",
  noProducts: "Keine Produkte für diese Auswahl",
  recentSearches: "Letzte Suchen",
  clearHistory: "Verlauf löschen",
  a11yRemoveSearch: "Suche „{q}“ entfernen",
  clearSearchHistory: "Suchverlauf löschen",
  sugCategories: "Kategorien",
  sugBrands: "Marken",
  searchRunning: "Suche läuft … {p} %",
  searchStopped: "Suche bei {p} % angehalten",
  searchResume: "Fortsetzen",
  sortAfterFull: "Sortieren ist möglich, sobald die Suche fertig ist.",
  filterPartial: "Filter gilt nur für die durchsuchten {p} % des Katalogs",
  resultsN: "{n} Ergebnisse",
  noHits: "Keine Treffer für „{q}“",
  noHitsText: "Prüfe die Schreibweise oder stöbere in den Kategorien.",
  showCategories: "Kategorien ansehen",
  searchFor: "Nach „{q}“ suchen",
  allFromBrand: "Alle Produkte von {m}",
  allInScope: "Alle Produkte in {k}",
  didYouMean: "Meintest du „{name}“?",
  min2: "Gib mindestens 2 Zeichen ein.",
  shipping: "Versand",
  shippingRule: "{fee} · gratis ab {x}",
  freeShipping: "Kostenloser Versand",
  details: "Details",
  moreFromSub: "Mehr aus {sub}",
  moreFromBrand: "Mehr von {brand}",
  inCart: "Im Warenkorb",
  inCartN: "Im Warenkorb ({n})",
  addedTitle: "Hinzugefügt",
  toCart: "Zum Warenkorb",
  continueShopping: "Weiter einkaufen",
  enlargeImage: "Bild vergrößern",
  cartTitle: "Warenkorb ({n} Artikel)",
  cartClear: "Warenkorb leeren",
  cartClearConfirm: "Alle Artikel aus dem Warenkorb entfernen?",
  cancel: "Abbrechen",
  itemRemoved: "Artikel entfernt",
  undo: "Rückgängig",
  subtotal: "Zwischensumme",
  shippingAssumed: "Versand (Annahme)",
  free: "kostenlos",
  total: "Gesamt",
  toCheckout: "Zur Kasse",
  missingFree: "Noch {x} bis zum Gratisversand.",
  freeReached: "Gratisversand erreicht!",
  cartEmpty: "Dein Warenkorb ist leer",
  cartEmptyText: "Tippe bei einem Produkt auf „In den Warenkorb“.",
  selectAll: "Alle auswählen",
  selectLine: "Artikel auswählen",
  selectedOf: "{n} von {m} Artikeln ausgewählt",
  qtyLess: "Weniger",
  qtyMore: "Mehr",
  remove: "Entfernen",
  qtyN: "Menge {n}",
  myLists: "Meine Listen",
  newList: "Neue Liste",
  listName: "Listenname",
  listNameTaken: "Eine Liste mit diesem Namen gibt es schon.",
  rename: "Umbenennen",
  delete: "Löschen",
  save: "Speichern",
  done: "Fertig",
  addToList: "Zu Liste hinzufügen",
  nowCheaper: "Jetzt {x} günstiger",
  nowDearer: "Jetzt {x} teurer",
  currentlyUnavailable: "Derzeit nicht verfügbar",
  listEmpty: "Diese Liste ist leer",
  listEmptyHint: "Halte bei einem Produkt das Herz gedrückt, um es hier abzulegen.",
  listNotFound: "Diese Liste gibt es nicht mehr",
  listDeleteConfirm: "Liste „{name}“ löschen?",
  removeFromList: "Aus Liste entfernen",
  listsN: "{n} Listen",
  clearSearchHistoryConfirm: "Suchverlauf auf diesem Gerät löschen?",
  yourSelection: "Deine Auswahl ({n} Artikel)",
  discoverProducts: "Produkte entdecken",
  merklisteHint: "Herz lange gedrückt halten: in eine eigene Liste legen.",
  listLimitReached: "Höchstzahl an Listen erreicht",
  listNewSub: "Eigene Liste anlegen",
  listEmptySub: "Noch leer",
  aboutIntroTitle: "Eine Demo zum Stöbern",
  aboutIntro: "Diese App zeigt den Katalog des Outlets auf dem Handy. Bestellt oder bezahlt wird hier nichts.",
  savedPriceWas: "Gemerkt: {x}",
  merklisteEmpty: "Deine Merkliste ist leer. Tippe auf das Herz bei einem Produkt.",
  aboutDemo: "Über diese Demo",
  deleteDeviceData: "Daten auf diesem Gerät löschen",
  deleteDeviceDataConfirm: "Warenkorb, Merkliste, Listen, Suchverlauf und zuletzt angesehene Produkte werden von diesem Gerät gelöscht.",
  dataDeleted: "Daten gelöscht",
  loadError: "Daten konnten nicht geladen werden.",
  categoriesLoadError: "Kategorien konnten nicht geladen werden.",
  retry: "Erneut versuchen",
  loading: "Wird geladen",
  demoBanner: "Demo-App: Bestellung und Zahlung sind nicht echt. Preise und Bestand wie zum Zeitpunkt der Datenübernahme.",
  checkoutTitle: "Kasse",
  demoShort: "Demo: Bestellung und Zahlung sind nicht echt.",
  more: "Mehr",
  seeAll: "Alle",
  seeAllA11y: "{k}: alle anzeigen",
  appName: "Mixo Outlet",
  allCategories: "Alle Kategorien",
  heroEyebrowShop: "Unser Sortiment",
  heroEyebrowCategory: "Kategorie",
  heroEyebrowNote: "Hinweis",
  heroShopSub: "in {n} Kategorien",
  heroCatBrands: "{nb} Marken",
  heroCtaCategories: "Alle Kategorien",
  heroCtaCategory: "Jetzt entdecken",
  slideOf: "Banner {i} von {n}",
  a11yPriceWas: (price: string, was: string): string => `${price}, statt ${was}`,
  cartFull: "Warenkorb voll (max. 100 Positionen)",
  maxQty: "Maximale Menge erreicht",
  priceUpdated: "Preis aktualisiert",
  freeShipFallback: "Gratisversand ab {x} (Annahme, Server nicht erreichbar)",
  totalEstimated: "Gesamt (geschätzt)",
  checkoutDemoTitle: "Dies ist eine Demo",
  checkoutDemoText: "Hier wird nichts bestellt oder bezahlt, und es werden keine Daten gesendet.",
  payUnavailable: "Bezahlen",
  backToCart: "Zurück zum Warenkorb",
  perPiece: "{x} pro Stück",
  payWhy: "Bezahlen ist in dieser Demo nicht möglich.",
  nothingSelected: "Nichts ausgewählt",
  nothingSelectedText: "Wähle im Warenkorb die Artikel für die Kasse aus.",
  freeShipLabel: "Gratisversand",
  hitsPartialSearch: "{n} Treffer in den durchsuchten {p} % des Sortiments",
  allProducts: "Alle Produkte",
  priceUpTo: "bis {x} €",
  priceBetween: "{a}–{b} €",
  priceFrom: "ab {x} €",
  aboutRealTitle: "Echt",
  aboutReal1: "Katalog und Preise stammen aus dem Datenbestand des Outlets und zeigen den Stand zum Zeitpunkt der Datenübernahme.",
  aboutReal2: "Die Schwelle für den kostenlosen Versand wird vom Server geliefert. Ist der Server nicht erreichbar, steht dort ein angenommener Wert mit dem Hinweis „Annahme“.",
  aboutDemoTitle: "Demo",
  aboutDemo1: "Bestellung und Zahlung sind nicht echt: Es wird nichts bestellt und nichts bezahlt.",
  aboutDemo2: "Die Versandkosten sind eine Annahme für diese Demo.",
  onDevice: "Auf diesem Gerät",
  listsShort: "Listen",
  aboutDemo3: "Warenkorb, Merkliste, Listen, Suchverlauf und zuletzt angesehene Produkte liegen nur auf diesem Gerät.",
} as const;

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export const nProdukte = (n: number): string => (n === 1 ? '1 Produkt' : fmt(T.productsN, { n: num(n) }));
export const nErgebnisse = (n: number): string => (n === 1 ? '1 Ergebnis' : fmt(T.resultsN, { n: num(n) }));
export const showNLabel = (n: number): string => (n === 1 ? '1 Ergebnis anzeigen' : fmt(T.showN, { n: num(n) }));
export const nListen = (n: number): string => (n === 1 ? '1 Liste' : fmt(T.listsN, { n: num(n) }));
export const selectedOfLabel = (n: number, m: number): string =>
  (m === 1 ? `${num(n)} von 1 Artikel ausgewählt` : fmt(T.selectedOf, { n: num(n), m: num(m) }));
export const brandsTotalLabel = (nb: number): string => (nb === 1 ? '1 Marke' : fmt(T.brandsTotal, { nb: num(nb) }));
export const heroShopSubLabel = (n: number): string => (n === 1 ? 'in 1 Kategorie' : fmt(T.heroShopSub, { n: num(n) }));
/** Kısmi sayı: süzgeçten geçen ürünler yalnız yüklenen kısımda sayıldı → alt sınır ("mind."). */
export const hitsPartialLabel = (n: number): string => fmt(T.hitsPartial, { n: num(n) });
export const hitsExactLabel = (n: number): string => fmt(T.hitsExact, { n: num(n) });
/** Liste silme onayının gövdesi: kaç ürünün listeyle birlikte gittiği. */
export const listDeleteText = (n: number): string =>
  (n === 0 ? 'Die Liste ist leer.' : n === 1 ? '1 Produkt wird aus dieser Liste entfernt.' : `${num(n)} Produkte werden aus dieser Liste entfernt.`);

/** Fiyat aralığı kapsülü (config PRICE_RANGES): "bis 25 €", "25–100 €", "ab 500 €". */
export const priceRangeLabel = (r: { min: number; max: number }): string =>
  r.min <= 0
    ? fmt(T.priceUpTo, { x: num(r.max) })
    : r.max === Infinity
      ? fmt(T.priceFrom, { x: num(r.min) })
      : fmt(T.priceBetween, { a: num(r.min), b: num(r.max) });

/**
 * Marka baş harfi (monogram): addaki ilk harf; rakam ve noktalama atlanır ("3DPLady" → "D").
 * Hiç harf yoksa boş döner; çağıran o zaman harf yerine ikon çizer.
 */
export const monogram = (name: string): string => (/\p{L}/u.exec(name)?.[0] ?? '').toLocaleUpperCase('de-DE');

/** Model kodu gibi görünen sözcük: küçük harf yok, en az bir rakam ve bir büyük harf, en az 4 karakter ("32A5P", "6H400V", "C_F-91W-1YEG"). */
const CODE_WORD = /^(?=[^a-zäöüß]*\d)(?=[^a-zäöüß]*[A-ZÄÖÜ])[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9./+_-]{3,}$/;
/** Model öneki: "Mod." / "MOD." / "Art." / "Ref.", bitişik yazılmış hâli de ("Mod.EVO", "MOD.R825"); "Mod.masse" gibi küçük harfli devam sayılmaz. */
const CODE_PREFIX = /^(?:[Mm]od|MOD|[Aa]rt|ART|[Rr]ef|REF)\.(?:[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9./+_-]*)?$/;
/** Yalnız büyük harf ve rakamdan oluşan sözcük ("WATCH", "POTENZA", "DESIGN"). */
const CAPS_WORD = /^[A-ZÄÖÜ][A-ZÄÖÜ0-9&./+_-]*$/;
/** Başlıktaki bölüm ayırıcı: boşluklu uzun tire ("Mod. RT371KX9 – Herrenuhr – Stilvolle Eleganz"). */
const SEGMENT_SEP = /\s+[–—]\s+/;
/** Gerçek bir sözcükle başlıyor mu: en az 3 harf ve küçük harf içerir ("Herrenuhr", "Aufbaustecker"). */
const realWord = (w: string | undefined): boolean => !!w && /^\p{L}{3,}/u.test(w) && /\p{Ll}/u.test(w);

/**
 * Kart başlığı: baştaki model kodları sona alınır; iki satırlık kartta önce ürünün ne olduğu okunur, kesilen kısım kod olur.
 * - Uzun tireli başlıkta ilk bölüm yalnız kod/önek/büyük harfli sözcüklerden oluşuyor ve en az bir kod ya da önek taşıyorsa
 *   bölüm sona gider: "Mod. RT371KX9 – Herrenuhr – Stilvolle Eleganz" → "Herrenuhr – Stilvolle Eleganz · Mod. RT371KX9".
 * - Tiresiz başlıkta baştaki kodlar (önekten sonraki sözcük de kod sayılır) sona gider:
 *   "32A5P 6H400V Aufbaustecker 330 IP44" → "Aufbaustecker 330 IP44 · 32A5P 6H400V".
 * Yalnız ardından gerçek bir sözcük geliyorsa uygulanır; başka hiçbir şey değişmez.
 * Tam başlık erişilebilirlik etiketinde ve ürün sayfasında aynen kalır.
 */
export function codesLast(title: string): string {
  const t = title.trim().replace(/\s+/g, ' ');
  const segs = t.split(SEGMENT_SEP);
  if (segs.length > 1) {
    const head = segs[0].split(' ');
    const codeish = head.every(w => CODE_WORD.test(w) || CODE_PREFIX.test(w) || CAPS_WORD.test(w));
    const hasCode = head.some(w => CODE_WORD.test(w) || CODE_PREFIX.test(w));
    if (codeish && hasCode && realWord(segs[1].split(' ')[0])) return `${segs.slice(1).join(' – ')} · ${segs[0]}`;
  }
  const words = t.split(' ');
  let i = 0;
  while (i < words.length - 1) {
    if (CODE_WORD.test(words[i])) i++;
    else if (CODE_PREFIX.test(words[i])) {
      i++;
      // önekten sonraki model adı/kodu ("Mod. RT371KX9", "MOD. POTENZA")
      if (i < words.length - 1 && (CODE_WORD.test(words[i]) || CAPS_WORD.test(words[i]))) i++;
    } else break;
  }
  if (i === 0 || !realWord(words[i])) return t;
  return `${words.slice(i).join(' ')} · ${words.slice(0, i).join(' ')}`;
}

/**
 * Başlık marka adıyla başlıyorsa (büyük/küçük harf ve ardından gelen tire yok sayılır) kalın markanın ardından tekrar yazılmaz.
 * Bileşik marka korunur: marka başlıkta farklı biçimde BÜYÜK harfle yazılmış ve ardından yine büyük harfli bir sözcük
 * geliyorsa ("Momo" → "MOMO DESIGN Mod.TEMPEST …") başlık bölünmez, tamamı döner.
 */
export function titleAfterBrand(vendor: string, title: string): string {
  const t = title.trim();
  const full = vendor.trim();
  // "Lucaffe'" gibi sonda noktalama taşıyan marka adları da yakalanır ("Lucaffe MAMMA …")
  for (const v of new Set([full, full.replace(/['’.]+$/, '')])) {
    if (!v || t.length <= v.length || t.slice(0, v.length).toLowerCase() !== v.toLowerCase()) continue;
    const rest = t.slice(v.length);
    // Yalnız sözcük sınırında kes: "HP" markası "HPE …" başlığını bölmez
    const sep = /^\s*[-–—:]?\s*/.exec(rest)?.[0] ?? '';
    if (!sep) continue;
    const out = rest.slice(sep.length).trim();
    if (!out) continue;
    const head = t.slice(0, v.length);
    const first = out.split(/\s+/)[0];
    const capsBrand = head !== v && head === head.toUpperCase() && /\p{L}/u.test(head);
    if (capsBrand && /^\p{Lu}{2,}$/u.test(first) && !CODE_PREFIX.test(first)) return t;
    return out;
  }
  return t;
}

/** Katalogdaki bileşik adların son parçaları (uzundan kısaya denenir). */
const COMPOUND_TAILS = [
  'installation', 'füllungen', 'patronen', 'speicher', 'zubehör', 'geräte', 'watches', 'phones', 'hüllen', 'bänder', 'pflege',
  'ketten', 'bedarf', 'waren', 'düfte', 'uhren', 'druck',
].sort((a, b) => b.length - a.length);

/**
 * Dar daire etiketi için yumuşak tire (U+00AD): `min` harften uzun bileşik sözcük, bilinen son parçanın önünden
 * bölünebilir olur ("Handyzubehör" → "Handy·zubehör"; satır sığarsa tire görünmez). Sözcük ortasından rastgele bölünme olmaz.
 */
export function softBreak(name: string, min = 10): string {
  return name.split(' ').map(w => {
    if (w.length <= min) return w;
    const low = w.toLocaleLowerCase('de-DE');
    const tail = COMPOUND_TAILS.find(t => low.endsWith(t) && w.length - t.length >= 4);
    return tail ? `${w.slice(0, w.length - tail.length)}\u00AD${w.slice(w.length - tail.length)}` : w;
  }).join(' ');
}

/** Kartta, sepette ve başlıkta gösterilen kısa ad: marka tekrarı yok, baştaki kodlar sonda. */
export const cardTitle = (vendor: string, title: string): string => codesLast(titleAfterBrand(vendor, title));

/** "Beliebt" yalnız gerçek davranış sinyali olan listede yazılır. */
export const bestTitle = (src: BestSource): string => (src === 'behavior' ? T.bestBehavior : T.bestCurated);
