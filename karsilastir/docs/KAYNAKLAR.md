# Veri kaynakları: ne açık, neden, hangi anahtar gerekir

Hedef: Mixoutlet'in ~44.862 ürünü için rakip fiyat bulmak. Tüm bağlayıcılar **ortam değişkeni yokken kapalıdır**, hiç istek atmaz.
Fiyat/maliyet rakamları yaklaşıktır; kayıt öncesi sağlayıcının güncel fiyat sayfasından doğrulayın. Hesap açma, plan seçme ve ödeme sizin işinizdir.

## Anahtarsız, şu an açık olanlar

| Yol                | Durum                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mixoutlet kataloğu | `/products.json` (herkese açık) ile 250'şerli sayfa, ~180 istek. Varyant `barcode` alanı bu uçta GELMİYOR; yalnız sku (= model no), marka, başlık, fiyat gelir. EAN, ürün sayfasındaki schema.org `gtin`'den okunur (sayfa tohumu olarak kuyruğa alınır). |
| Hedefli tarama     | Rakip site haritalarında Mixoutlet model numarası geçen URL'ler önce taranır (`source = targeted`).                                                                                                                                                       |
| Yeni mağazalar     | uhrcenter.de eklendi (robots uygun, schema.org gtin var).                                                                                                                                                                                                 |
| Kendi sitemiz hızı | `OWN_DOMAINS=mixoutlet.de` ve `OWN_INTERVAL_MS=2000`: yalnızca sizin sitenizde 10 sn yerine 2 sn aralık. Tahmini: 45.000 sayfa ≈ 25-30 saat. Tanımsızsa 10 sn kalır (≈ 5 gün). Bu bir sunucu yükü kararıdır, sizde.                                       |

### Bot korumalı: dürüst kimliğimize bile 403 verenler (tarama yolu YOK, besleme gerekir)

douglas.de, cyberport.de, notebooksbilliger.de, conrad.de, coolblue.nl, flaconi.de, notino.de, tonerpartner.de, otto.de, saturn.de,
mediamarkt.de/.nl. Bunlar için tek meşru yol affiliate beslemesi (aşağıda). galaxus.de robots.txt'e yanıt vermedi. druckerzubehoer.de
site haritasında yalnız kategori listeliyor (ürün sayfası yok). bcc.nl ürün sayfalarında schema.org Product yok.

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
`FEED_AWIN_KEY` (ve diğer ağlar) · isteğe bağlı: `OWN_DOMAINS=mixoutlet.de` `OWN_INTERVAL_MS` `MIXO_CATALOG_TOTAL` `LOOKUP_BATCH`.
