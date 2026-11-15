# Hedef siteler analizi: idealo, Kaufland, ParfumArena, Douglas

15 Kasım 2026 · Kapsam: inceleme ve belge (hesap açma, başvuru, kod değişikliği yok) · Önceki raporlar: `pazarlama-analizi-2026-11-15.md`, `site-karari-2026-11-15.md`

**Yöntemin sınırı:** idealo.de, kaufland.de ve douglas.de otomatik erişimi engelledi (403). Bu üç sitenin fiyatları arama motoru özetlerinden, ücretleri üçüncü taraf kaynaklardan geldi; tarihsizdir ve canlı sayfada doğrulanmalıdır. Yalnız parfumarena.com doğrudan okundu. "Doğrulanamadı" yazan her şey açık sorudur.

## 1. Sonuç

Dört site aynı türden değil; her biri için "hedef" farklı bir anlam taşıyor:

| Site | Türü | Bizim için rolü | Girilebilir mi |
|---|---|---|---|
| **idealo.de** | Fiyat karşılaştırma, tıklama başı ücret | Trafik kanalı | Evet, feed ile; yalnız EAN'lı ve fiyatı rekabetçi ürünlerde anlamlı |
| **kaufland.de** | Pazaryeri, komisyon | Satış kanalı | Evet; grup JTL üzerinden zaten bağlı görünüyor |
| **parfumarena.com** | Küçük parfüm pazaryeri (~40 ürün) | Büyük olasılıkla grubun kendi sitesi (aşağıda) | Sahibine sorulmalı |
| **douglas.de** | Parfüm perakendecisi + kapalı pazaryeri | Örnek ve fiyat referansı | Düşük ihtimal (seçici, yetkili kanal) |

**En önemli bulgu fiyat:** Örnek aldığımız parfümlerin çoğunda mixoutlet.de fiyatı piyasanın üstünde (4. bölüm). idealo ve Kaufland, toplam fiyata (ürün + kargo) göre sıralar; bu fiyatlarla oraya çıkmak tıklama ücreti ödeyip satış alamamak demek. Önce fiyat ve EAN denetimi, sonra kanal.

## 2. Site site

### idealo.de
- Axel Springer'e bağlı fiyat karşılaştırma sitesi; gelir mağazaların ödediği tıklama ücretinden. Ölçek rakamları kaynaklar arasında çelişkili (aylık 10–18 milyon kullanıcı, 39–70 bin mağaza); doğrulanamadı.
- Tıklama ücreti üçüncü taraf kaynaklarda 0,42–0,56 € arası; kategoriye göre resmi tablo okunamadı. Aylık asgari tutar iddiası ~20 €. Direktkauf'un 2022 sonunda kapandığı tek kaynakta yazıyor; satın alma mağazanın sitesinde biter.
- Feed: CSV/TXT/XML; alanlar sku, başlık, url, fiyat, teslim süresi, kargo ücreti, EAN. Shopify için "idealo Connect" uygulaması var (12–36 $/ay; 45 bin ürün için en üst plan; yorumlarda feed gecikmesi ve indirimli fiyatın geçmemesi şikâyeti). JTL için hazır bağlantı bulunamadı.
- EAN'sız teklif ana ürün sayfasına eşleşmez. Kablo, yazıcı, sarf gibi EAN'lı üretici ürünleri uygun; B-ware, takı ve EAN'sız saatler uygun değil.
- MixOutlet idealo'da var mı: doğrulanamadı. Lady Empire GmbH, Preissuchmaschine.de'de tek yorumla 1 yıldız görünüyor (idealo puanı değil).
- Risk hesabı (tahmin): tıklama 0,5 €, dönüşüm %1–2 ise satış başına 25–50 € reklam maliyeti. 53 €'luk parfümde marjı siler; sepeti büyük ya da marjı yüksek ürünlerde dener.

### kaufland.de
- Kaufland beyanına göre ayda 32 milyona kadar ziyaret, 13–15 bin satıcı, 8–9 ülke vitrini.
- Ücretler (17.10.2026 tarihli üçüncü taraf tablosu; resmi sayfa açılmadı): aylık 39,95 € (Basic) / 59,95 € (Plus). Komisyon: tüketici elektroniği ve bilgisayar %7, parfüm %10, güzellik %13, kol saati %14, takı %16. Yazıcı/sarf oranı doğrulanamadı. Komisyon kargo dahil brüt tutardan.
- EAN başına tek ürün sayfası; EAN zorunlu. Kazanan teklif: toplam fiyat, bildirilen teslim süresi, servis performansı. Sponsorlu ürün reklamı yalnız kazanan teklif için gösterilir.
- Veri: başlık 50–80 karakter, görsel en az 1024 px ve ilk görsel beyaz fon, makine çevirisi açıklama kabul edilmiyor. 882 sorunlu görsel işi burada da işe yarar.
- JTL-eazyAuction üzerinden yerel bağlantı var; mevcut JTL kanalı kullanılırsa ek Shopify uygulaması gerekmeyebilir (çıkarım).
- Askı nedenleri: iptal oranı, geç kargo, düşük puan, izinsiz marka/görsel. Parfüm ve saatte marka itirazı riski var. Eşik değerleri doğrulanamadı.
- Lady Empire/MixOutlet satıcı profili bulunamadı; "yok" demek değil.

### parfumarena.com
- İşleten: Woida UG (haftungsbeschränkt), Geldern; temsilci Fatih Kilinc (Impressum). **"Woida" adı, mağaza sahibinin JTL panelinde gördüğümüz hesaplar arasında geçiyor** (`site-karari-2026-11-15.md`, pazaryerleri notu). Yani bu site büyük olasılıkla rakip değil, aynı çevrenin kendi girişimi. Teyit edilmeli.
- Pazaryeri modeli: satıcı ürün sayfasında görünüyor (örnek: Gamma Trade GmbH), en ucuz stoklu teklif öne çıkıyor. Katalog ~40 ürün.
- Zayıf yanlar: ödeme yalnız havale (kart, PayPal, Klarna yok); ml başına fiyat (Grundpreis) yok; ürün yorumu yok ama "4,9/5, 10.000+ yorum" iddiası var ve dışarıda karşılığı bulunamadı; incelenen üründe açıklama başka ürüne ait. Web aramasında siteye dair sonuç çıkmadı.
- İyi fikirler: Duftfinder (koku ailesi ve nota filtresi), indirim kademesi sayfaları, ürün başına "14:00'e kadar aynı gün kargo", bültene %5 kod, Duftjournal.
- Uyarı: Grundpreis eksikliği ve kanıtlanamayan yorum iddiası Almanya'da ihtar (Abmahnung) riskidir. Site gruba aitse bunu sahibine söylemek gerekir.

### douglas.de
- 9 aylık grup cirosu 3,61 milyar €, e-ticaret payı %33,7; Beauty Card 64 milyon+ üye (grup geneli).
- Pazaryeri (Partner Programm) Mirakl üzerinde, kapalı ve seçici; başvuru e-postayla; komisyon pazarlıklı, oran bulunamadı. Outlet/paralel ithalat satıcısının kabulü düşük ihtimal (çıkarım; resmi şart bulunamadı).
- Örnek alınacaklar: ürün sayfasında UVP + "30-Tage-Tiefstpreis" + litre fiyatı; marka sayfaları altında koku notası, kadın/erkek, set alt sayfaları; "Beauty Storys" rehberleri; eşik üstü numune/hediye; kampanya takvimi (Beauty Friday 27.11.2026).

## 3. Kanal uygunluğu (ürün grubuna göre)

| Ürün grubu | idealo | Kaufland | Not |
|---|---|---|---|
| Kablo, ağ, bilgisayar aksesuarı (DeLOCK, LogiLink vb.) | Uygun, EAN var | Uygun, komisyon %7 | En düşük riskli başlangıç; birim fiyat düşükse tıklama ücreti ağır gelir |
| Yazıcı ve sarf (HP, Epson) | Uygun | Uygun, oran teyitsiz | Fiyat şeffaf pazar; marj kontrolü şart |
| Parfüm (~500) | Bugünkü fiyatlarla uygun değil | Bugünkü fiyatlarla kazanamaz | Önce fiyat denetimi |
| Saat (~7 bin) | EAN'a bağlı | Komisyon %14, marka riski | EAN kapsamı ölçülmeli |
| Takı | Zayıf | Komisyon %16 | Sona bırak |

## 4. Fiyat kıyası (örnek 6 parfüm)

| Ürün | mixoutlet.de | Bulunan piyasa fiyatı | Durum |
|---|---|---|---|
| Versace Versense EDT 100 ml | 52,93 € | Kaufland 48,15–68,25 €; Douglas ~74–90 €; eBay ~53 €; ParfumArena 40 € (boy teyitsiz) | Ortada |
| Coach EDT 50 ml (kadın) | 54,72 € | Douglas 49,19 € | Biraz pahalı |
| Lattafa Eclaire EDP 100 ml | 69,00 € | Kaufland 24,99 € (kargo dahil) | ~2,8 kat pahalı |
| Bleu de Chanel EDP 150 ml | 225,00 € | Douglas 133–143 €; Chanel resmi 180 € | Belirgin pahalı |
| Coco Mademoiselle EDP Intense 200 ml | 304,00 € | Douglas 215–219 € (UVP 284 €) | UVP'nin de üstünde |
| Rabanne Million Gold For Her EDP 90 ml | 247,20 € | Douglas 86–99 € (UVP 141,50 €) | ~2,5 kat; veri hatası olabilir |

Örnek küçük (6 ürün) ve karşı fiyatlar tarihsiz arama özetleri. Yine de dördünde fark büyük; 69,00 € fiyatının birçok Arap parfümünde tekrarlanması toplu/varsayılan fiyat girişi izlenimi veriyor (çıkarım).

## 5. Önerilen sıra

1. **Sahibine üç soru:** ParfumArena sizin mi (Woida)? Kaufland'da hangi hesapla, kaç ürünle, ne ciroyla satıyorsunuz? Parfüm fiyatları nasıl belirleniyor (JTL'de kural mı, elle mi)?
2. **Fiyat ve EAN denetimi:** 45 bin üründe EAN kapsamını ölç; parfüm ve saatlerde piyasa fiyatıyla kıyas listesi çıkar. Ham veride (`_raw/all`) barkod alanı yok; Shopify ya da JTL dışa aktarımı gerekir.
3. **Kaufland'ı önce düzelt:** mevcut bağlantı üzerinden teknik ürünlerde kazanan teklif oranına bak; yeni kanal açmadan önce var olanı ölç.
4. **idealo'yu küçük dene:** EAN'lı, marjı yeterli teknik alt kümeyle, aylık sınırlı bütçe ve satış başına maliyet ölçümüyle. Resmi tıklama fiyat tablosu iş hesabı açılınca görülür.
5. **Douglas ve ParfumArena'dan alınacaklar mixoutlet.de'ye:** Grundpreis, UVP ve 30 günlük en düşük fiyat gösterimi, koku notası koleksiyonları, marka sayfaları.

## 6. Doğrulanamayanlar

- idealo: resmi koşullar, kategori tıklama fiyatları, MixOutlet profili, örnek ürünlerin idealo fiyatları.
- Kaufland: resmi ücret sayfası, performans eşikleri, satıcı profilimiz, güncel ürün sayısı.
- Douglas: komisyon oranı, kabul şartları, kargo eşiği, aylık ziyaret.
- ParfumArena: Woida ile mağaza sahibinin ilişkisi, platform, satış yapılan ülkeler, yorum iddiası.

## Kaynaklar

- idealo: idealo.github.io/csv-importer/en/csv · apps.shopify.com/idealo-integration · snapsoft.de/en/blog-en/price-comparison-sites · channelpilot.com/en/resources/connect-google-feed-with-idealo · wisepim.com/de/guides/product-feed-optimization/idealo · monsterdealz.de/magazin/idealo-test · preissuchmaschine.de/haendlerdetail--109900.html
- Kaufland: wisepim.com/de/reports/marketplace-fees-europe · wisepim.com/de/guides/marketplace-listing/kaufland · kauflandglobalmarketplace.com/en/seller-university (smart-pricing, sponsored-product-ads) · schwarz-digits.de/en/marken/kaufland-e-commerce · haendlerbund.de (kaufland-account-gesperrt) · kaufland.de/product/23078431 · kaufland.de/product/549821546
- ParfumArena: parfumarena.com/impressum · /zahlung-versand · /product/3616306679498 · /robots.txt
- Douglas: douglas.group (9M FY 2025/26 Zwischenmitteilung; Q2 2025/26 basın bülteni) · mirakl.com (Douglas marketplace haberi) · helpcenter.channable.com (Douglas kanalı kurulumu) · support.channelengine.com/hc/en-us/articles/4409514733725 · douglas.de/de/p/3001042367 · /p/3001004983 · /p/3000030075
