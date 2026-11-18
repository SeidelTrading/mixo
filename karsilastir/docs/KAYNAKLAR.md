# Veri kaynakları: ne açık, neden, hangi anahtar gerekir

Hedef: Mixoutlet'in ~44.862 ürünü için rakip fiyat bulmak. Tüm bağlayıcılar **ortam değişkeni yokken kapalıdır**, hiç istek atmaz.
Fiyat/maliyet rakamları yaklaşıktır; kayıt öncesi sağlayıcının güncel fiyat sayfasından doğrulayın. Hesap açma, plan seçme ve ödeme sizin işinizdir.

## Anahtarsız, şu an açık olanlar

| Yol                | Durum                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mixoutlet kataloğu | `/products.json` (herkese açık, 250'şerli) yalnız fiyat/stok tazelemeye yarar: varyant `barcode` alanı bu uçta GELMİYOR ve sayfalama 100. sayfada biter (250 x 100 = 25.000 ürün; page=101 boş döner). Barkod ürün başına `/products/<handle>.json` içinde var; tam handle listesi mixoutlet.de ürün site haritasından (`sitemap_products_*.xml`) gelir. Mixoutlet ürün sayfaları artık `runCycle`'da taranmaz. |
| Hedefli tarama     | Rakip site haritalarında Mixoutlet'in GERÇEK parça numarası (iç kod değil) ya da EAN'ı geçen URL'ler önce taranır (`source = targeted`). Kısa (6 karakterden az) ya da yalnız rakamlı kod için URL'de markanın da geçmesi şart. Başlık benzerliği (`targeted-title`) yalnız tohum üretir; teklifi sayfadaki EAN ya da marka+MPN bağlar.                                                                         |
| EAN / MPN araması  | Arama şablonu olan mağazalarda (reichelt, secomp, pieper) Mixoutlet EAN'ı (EAN'sız ürünlerde marka + MPN) doğrudan aranır; robots denetimli, turda mağaza başına en çok 20, günde en çok `SEARCH_DAILY_CAP` (varsayılan 1000), aynı EAN 14 gün tekrar sorulmaz.                                                                                                                                                 |
| Yeni mağazalar     | uhrcenter.de eklendi (robots uygun, schema.org gtin var). 2026-11-18 saha denetiminden: reichelt.de, secomp.de, jacob.de, mindfactory.de, office-partner.de, uhrzeit.org, pieper.de (aşağıda).                                                                                                                                                                                                                  |
| Kendi sitemiz hızı | `OWN_DOMAINS=mixoutlet.de` ve `OWN_INTERVAL_MS=2000`: yalnızca sizin sitenizde 10 sn yerine 2 sn aralık. Tanımsızsa 10 sn kalır. Bu bir sunucu yükü kararıdır, sizde. Rakip mağazalarda aralık her zaman en az 10 sn'dir ve robots.txt `Crawl-delay` daha büyükse o uygulanır.                                                                                                                                  |

## Rakip mağaza kaydı (taranabilir olanlar)

Kayıt `lib/stores.mjs` içindedir; ek alanlar: `search` (arama yolu şablonu), `brands` (hedefleme ipucu), `priceNet` (fiyat x1,19), `eanFromText` (metindeki tek EAN).

| Mağaza            | Neden / nasıl taranır                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| reichelt.de       | Robots serbest, crawl-delay yok. 150 ürün haritası (devam imleciyle ~19 günde bir tam döner). Sayfada microdata gtin13 + mpn. Arama: `/de/de/shop/suche?search={q}`. DeLOCK, LogiLink, Digitus, Goobay ağırlıklı.                                                                                                                                                                                 |
| secomp.de         | **KAPALI (`crawl: false`).** Deneme 2026-11-18: EAN araması doğrudan ürüne yönlendirir ama ürün sayfasında schema.org Product yok (yalnız BreadcrumbList); EAN yalnız metinde, fiyat anonim sayfada görünmüyor (yalnız veri katmanında). 41 aramada 0 teklif. Sayfa biçimi değişirse yeniden açılır.                                                                                              |
| jacob.de          | Shopware, `meta itemprop` gtin13 ve mpn. Arama yolu robots'ta yasak: yalnız site haritası ve MPN/EAN hedeflemesi (Awin izi var, ileride besleme seçeneği).                                                                                                                                                                                                                                        |
| mindfactory.de    | Robots ürün sayfalarına serbest. URL'de marka ve model; EAN `itemprop="gtin8"` alanında 13 hane (EAN-13 sayılır); mpn yok. Arama yolu bulunamadı: yalnız URL hedeflemesi.                                                                                                                                                                                                                         |
| office-partner.de | **KAPALI (`crawl: false`, `net/brüt fiyat doğrulanamadı`).** JSON-LD yok: EAN sayfa metninde, fiyat `itemprop="price"`. Deneme 2026-11-18: bu fiyat zaten BRÜT (`4,51 € inkl. MwSt.` -> content=`4.51`; net 3,79 yalnız veri katmanında), `priceNet` x1,19 çift KDV verir (5,37). 3 üründe doğrulandı (4,51 / 42,98 / 15,29 brüt). `priceNet` kaldırılırsa fiyatlar doğru olur; açma kararı ayrı. |
| uhrzeit.org       | Saat mağazası, `sitemap.shop.xml` ~5.000 ürün, URL'de marka ve model no, JSON-LD gtin13 + mpn. Festina, Casio, Guess, Tommy Hilfiger.                                                                                                                                                                                                                                                             |
| pieper.de         | Parfüm/kozmetik, robots tamamen serbest, Shopware, JSON-LD gtin. Arama: `/search?sSearch={q}`. Afnan ve parfüm grubu için tek doğrulanmış EAN arama yolu.                                                                                                                                                                                                                                         |

Not: christ.de ve uhren4you.de yerel denetimde (bu makineden) 403 verdi, üretimde başarıyla taranıyor (günlükte 283 ve 295 ok): kapatılmadı. Engel gelirse mevcut 24 saatlik host beklemesi devreye girer.

### Eklenmeyenler ve ikinci dalga

- **druckerzubehoer.de EKLENMEZ:** uyumlu toner satıyor, GTIN orijinal ürünle eşleşmez; site haritasında da yalnız kategori listeliyor.
- **B2B net/adet fiyat riski:** bechtle.com ve industry-electronics.com net fiyat, bürklin adet fiyatı (1,05 €) gösteriyor; `priceNet` doğrulanmadan eklenmez.
- **İkinci dalga (denetim bekliyor, `crawl: true` YAPILMADI):** wlan-shop24.de, visunext.de, bechtle.com, discounto.de, toneroffice.de, tonermacher.de, hd-toner.de, helveti.eu, lyko.com/de, industry-electronics.com, talk-point.de. Önce robots, site haritası, arama yolu ve net/brüt fiyat denetimi gerekir.

### Bot korumalı: dürüst kimliğimize bile 403 verenler (tarama yolu YOK, besleme gerekir)

douglas.de, cyberport.de, computeruniverse.de, notebooksbilliger.de, conrad.de, proshop.de, tonerpartner.de (Cloudflare 403), bueromarkt-ag.de (Incapsula), kaufland.de, coolblue.nl, flaconi.de, notino.de, otto.de, saturn.de, mediamarkt.de/.nl.
Bunlar için tek meşru yol affiliate beslemesi (aşağıda). galaxus.de ve kmelektronik.de robots.txt'e yanıt vermedi (bağlantı hatası). Bunlar `lib/stores.mjs`'e kaydedilmedi: kayıt yalnız var olan mağazayı pasife çeker, besleme ile çalışan mağazaları kapatmamak için yalnızca burada belgelenir. bcc.nl ürün sayfalarında schema.org Product yok.

### Web Data Commons / Common Crawl (değerlendirme, UYGULANMADI)

Fikir: çevrimdışı derlemlerden "hangi rakip URL'si hangi GTIN'i taşıyor" çıkarıp o sayfaların canlı fiyatını çekmek.

- Web Data Commons Product derlemi onlarca-yüzlerce GB; Common Crawl ise ayda ~petabayt ölçeğinde ve ürün başına WARC aralık isteği (2-3 istek) gerekir.
- Derlem fiyatı bayat olur; yalnızca URL↔GTIN eşlemesi işe yarar. Ancak bot korumalı mağazaların (yukarıdaki liste) canlı fiyatını yine çekemeyiz, yani kazanç yalnızca zaten taranabilen mağazalarda: onlarda hedefli tarama aynı işi yapıyor.
- Bu makineden `index.commoncrawl.org` yanıt vermedi (ölçemedim). Sonuç: şimdilik değmez; taranabilir mağaza sayısı artarsa yeniden bakılır.

## Anahtar/hesap gerektirenler (kodda hazır, kapalı)

Bağlayıcılar `lookup/connectors.mjs`, çalıştırıcı `lookup/run.mjs`. Yalnızca Mixoutlet'in EAN'lı ürünleri sorulur; aynı EAN 7 günde bir yeniden sorulur.
Ortak ayarlar: `LOOKUP_BATCH` (bağlayıcı başına 30 dk'da en çok sorgu, 50), `LOOKUP_DELAY_MS` (1100), `LOOKUP_RECHECK_DAYS` (7).

### 1. eBay Browse API (en iyi başlangıç)

- Kayıt: https://developer.ebay.com (ücretsiz geliştirici hesabı, uygulama anahtarı oluştur).
- Değişkenler: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`.
- Maliyet: ücretsiz. Varsayılan kota yaklaşık günde 5.000 çağrı → 44.862 ürün ≈ 9 gün; kota artışı istenebilir.
- Kapsam: GTIN'li yeni ürün ilanları (`item_summary/search?gtin=`, EBAY_DE). Marketplace ilanı olduğundan fiyatlar mağaza fiyatı değil satıcı ilanıdır.

### 2. Amazon PA-API 5 (DE)

- Kayıt: Amazon Partnernet (https://partnernet.amazon.de), ardından PA-API anahtarı. Şart: son 180 günde en az 3 nitelikli satış; yoksa erişim kapanır.
- Değişkenler: `AMAZON_ACCESS_KEY`, `AMAZON_SECRET_KEY`, `AMAZON_PARTNER_TAG`.
- Maliyet: ücretsiz; hız 1 istek/sn ile başlar, kazanca göre artar. Fiyat gösterim şartları (güncellik, Amazon bağlantısı) sözleşmede.
- Kapsam: SearchItems anahtar sözcük olarak EAN ile aranır (GetItems yalnız ASIN alır).

### 3. Affiliate beslemeleri (Otto, Saturn, MediaMarkt, Douglas, Cyberport, notebooksbilliger ... için doğru yol)

Admin > Networks sayfasından eklenir. `{key}` URL'de gizli değişkenle değişir. Önerilen değişken adları `FEED_<AĞ>_KEY`.

| Ağ           | Kayıt                          | Değişken                | Not                                                                    |
| ------------ | ------------------------------ | ----------------------- | ---------------------------------------------------------------------- |
| Awin         | https://www.awin.com (yayıncı) | `FEED_AWIN_KEY`         | Kodda doğrulanmış sütunlar. Mağaza programına başvuru ve onay gerekir. |
| Daisycon     | https://www.daisycon.com       | `FEED_DAISYCON_KEY`     | Sütunlar doğrulanmadı.                                                 |
| Tradedoubler | https://www.tradedoubler.com   | `FEED_TRADEDOUBLER_KEY` | XML yerleşimi doğrulanmadı.                                            |
| Webgains     | https://www.webgains.com       | `FEED_WEBGAINS_KEY`     | YENİ, sütunlar tahmin.                                                 |
| TradeTracker | https://tradetracker.com       | `FEED_TRADETRACKER_KEY` | YENİ, alanlar tahmin.                                                  |
| ADCELL       | https://www.adcell.de          | `FEED_ADCELL_KEY`       | YENİ, alanlar tahmin.                                                  |
| belboon      | https://www.belboon.com        | `FEED_BELBOON_KEY`      | YENİ, alanlar tahmin.                                                  |
| CJ           | https://www.cj.com             | `FEED_CJ_KEY`           | YENİ, alanlar tahmin.                                                  |

- Maliyet: yayıncı hesabı ücretsiz. Kapsama, mağazanın programa katılması ve sizi onaylamasına bağlı (Otto, Saturn, MediaMarkt, Douglas'ın hangi ağda olduğunu ağların program listesinden kontrol edin).
- "Tahmin" sütunlar gerçek dosya gelince admin'deki mapping JSON ile düzeltilir.
- Sınır: bu beslemeler ürünün EAN'ını da verdiği için Mixoutlet EAN'larıyla doğrudan eşleşir (en yüksek kapsama bu yoldan gelir).

### 4. Ücretli Google Shopping sonuçları

- **SerpAPI** (kodda hazır): https://serpapi.com, değişken `SERPAPI_KEY`. Yaklaşık $0,01-0,015/sorgu → 44.862 EAN ≈ **$450-670** (tek tur). Haftalık yenileme için aylık ~4× maliyet. Sonuçlar tüm satıcıların en ucunu verir.
- **DataForSEO** (bağlayıcı YOK; eşzamansız görev API'si, yazılırsa `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`): kabaca $0,001-0,003/sorgu → ≈ $45-135 (doğrulayın).
- **Oxylabs Web Scraper API** (bağlayıcı YOK; `OXYLABS_USER`, `OXYLABS_PASS`): kabaca $1-2 / 1.000 sonuç → ≈ $45-90 (doğrulayın), ancak Google kullanım şartları ve satıcı sitesi şartlarına uyum sizin sorumluluğunuzda.
- Not: Google'ın kendi HTML'ini biz kazımıyoruz; bunlar ücretli üçüncü taraf API'lerdir.

### 5. bol.com Partner API (NL)

- Kayıt: https://partner.bol.com (ortaklık programı), API erişimi için istemci anahtarı.
- Değişkenler: `BOL_CLIENT_ID`, `BOL_CLIENT_SECRET`.
- Maliyet: ücretsiz. Kodda uç nokta ve yanıt alanları UNVERIFIED (belge hesap gerektiriyor); gerçek yanıtla `lookup/connectors.mjs` içindeki `bol` ayrıştırması doğrulanmalı.
- Kapsam: NL pazarı için bol.com teklifi.

## Gerekli değişkenler (özet)

`EBAY_CLIENT_ID EBAY_CLIENT_SECRET` · `AMAZON_ACCESS_KEY AMAZON_SECRET_KEY AMAZON_PARTNER_TAG` · `BOL_CLIENT_ID BOL_CLIENT_SECRET` · `SERPAPI_KEY` ·
`FEED_AWIN_KEY` (ve diğer ağlar) · isteğe bağlı: `OWN_DOMAINS=mixoutlet.de` `OWN_INTERVAL_MS` `MIXO_CATALOG_TOTAL` `LOOKUP_BATCH` `SEARCH_DAILY_CAP` (mağaza başına günlük arama tavanı, 1000).
