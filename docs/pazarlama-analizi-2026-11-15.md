# Pazarlama ve reklam analizi: Outlet mağaza (mixoutlet)

15 Kasım 2026 · Almanya pazarı · 44.998 ürün, 10 kategori (Technik, Drucker & Büro, Wohnen & Haushalt, Mode, Uhren, Schmuck, Parfum & Düfte, Körperpflege, Genuss, Spielzeug & Freizeit)

## 1. Sonuç

1. **Kurduğumuz vitrin şu an arama motorlarına ve yapay zekâ asistanlarına görünmez.** Ürünlerin kendi adresi yok, sayfa içeriği tarayıcıda JavaScript ile çiziliyor, sayfada bilerek `noindex` var. Reklam ve sıralama işlerinin hepsi önce buna takılır.
2. **En yüksek getirili ilk adımlar ücretsiz:** ürün başına adres ve sunucu tarafı HTML, ürün yapılandırılmış verisi, Google Merchant Center ücretsiz listelemeleri, site haritası.
3. **Ücretli reklamda ilk kanal Google Shopping**, ikinci kanal Meta katalog reklamı (yeniden pazarlama). Instagram tek başına satış getirmez; duyuru ve güven kanalıdır.
4. **Rakiplerde gördüğümüz açık alan:** birçok kategoriyi tek outlet altında toplayan belirgin bir marka yok; güven puanı zayıf rakipler var; yapay zekâ görünürlüğüne özel çalışan rakip görmedik.
5. **Marj bilinmeden bütçe kararı verilemez.** Tıklama başına 0,5–0,9 € ödenen bir kanalda 40 € sepetle kâr, üründeki marja bağlı. *(Güncelleme: gerçek ortalama sepet ~78 €; yeniden hesap §7 "Bütçe senaryoları" altında.)*

Karar gerektiren soru: pazarlamayı **mevcut Shopify mağazası** üzerinden mi, **yeni vitrin** üzerinden mi yapacağız? Shopify ürün adresi, site haritası ve temel ürün verisini hazır verir; yeni vitrinde bunları yazmak gerekir (2–4 gün).

## 2. Kendi durumumuz (yeni vitrinin teknik denetimi)

| Öğe | Durum | Kanıt |
|---|---|---|
| Ürün ve kategori adresi | Yok | Gezinme `#katalog?...` ile (`demo/app.js:192`), ürün penceresi aynı adreste (`demo/app.js:362`) |
| Sunucu tarafı HTML | Yok | Tek `index.html`; ürünler `/api/shop/*` üzerinden geliyor (`demo/server.mjs:508`) |
| Başlık ve açıklama | Kısmen | Tek ve genel; "Design-Studie (kein echter Shop)" yazıyor (`demo/index.html:6`) |
| noindex | Var (bilerek) | `demo/index.html:7`; canlıya geçerken kaldırılmalı |
| canonical, hreflang, Open Graph, JSON-LD | Yok | |
| robots.txt, sitemap.xml | Yok | Canlıda 404 |
| Görsel alt metni | Kısmen | Ürün kartında var, öneri ve sepet görsellerinde boş |
| Impressum, Widerruf, Datenschutz, AGB | Yok | Alt bilgideki bağlantılar boş (`demo/index.html:665`) |
| Sayfa ağırlığı | Hafif | index.html 60 KB, app.js 54 KB |

Mevcut Shopify mağazasının (mixoutlet.de) kendisini denetlemedik.

## 3. Rakipler

| Rakip | Ne yapıyor | Kaynak |
|---|---|---|
| **Outlet46.de** (en yakın model; moda, ayakkabı, parfüm, saat) | "Alles unter X €" fiyat katmanları, marka A-Z dizini, bültene %7 ek indirim, Rechnungskauf, Google yorum puanı 4,8/5. eBay'de büyük satıcı (737 bin yorum). 2019 röportajına göre ücretli pazarlamayı bırakıp SEO, günlük bülten ve doğrudan trafiğe yaslanmış (trafiğin ~%70'i doğrudan, %23'ü organik; veri eski) | outlet46.de · ebay.de/usr/outlet46 · omr.com/en/daily/hidden-champion-outlet46 |
| **ALTERNATE Outlet** (teknik, ev, oyuncak) | "Restposten & Einzelstücke" ve ayrı "B-Ware" bölümü, üstü çizili eski fiyat, "Sofort verfügbar"; idealo, Geizhals, EHI mühürleri; PayPal, Klarna | alternate.de/Restposten-Einzelstücke |
| **OUTLETCITY METZINGEN** (marka moda) | Meta'da aktif katalog reklamı veriyor: aramamızda 19 aktif reklam, çoğu Eylül–Kasım 2026 başlangıçlı; ürün görseli + marka + "-50%" + "Shop Now" kalıbı | Meta Ad Library, DE, "outletcity" araması, 15.11.2026 |
| **RESTPOSTEN.de** | Trustpilot puanı düşük (1,6; arama özetinden, güncel olmayabilir) | trustpilot.com/review/www.restposten.de |
| **Retourenshop.net, Der Restpostenshop** | İade ve B-Ware ürünleri; ayrıntı doğrulanamadı | |

Meta reklam kütüphanesinde kendi baktıklarımız (Almanya, aktif reklamlar, 15.11.2026):

- "restposten" geçen ~490 aktif reklam var; verenler dağınık ve çoğu dar alanlı (yapı market, balıkçılık, mobilya, oyuncak). Genel outlet mağazası olarak öne çıkan yok.
- "outlet46" ve "mixoutlet" geçen aktif reklam yok. Bu arama reklam metnine bakar; adı metinde geçmeyen reklam varsa görünmez.

**Rakiplerin ortak yaptıkları:** fiyat katmanlı gezinme, üstü çizili fiyat ve stok ibaresi, bülten indirimi, üçüncü taraf güven mühürleri, faturayla ve taksitle ödeme, marka dizini, pazaryerlerinde paralel satış.

**Bizim için açık alanlar:**
1. Çok kategorili tek outlet konumu (Outlet46 moda ağırlıklı, Alternate teknik ağırlıklı).
2. Güven puanı: doğrulanmış yorum sistemi (Trusted Shops ya da Google müşteri yorumları) zayıf puanlı rakiplerden ayırır.
3. Meta'da genel outlet reklamı az; katalog reklamında Outletcity dışında güçlü oyuncu görmedik.
4. Fotoğraf kalitesi: 882 sorunlu ürünü zaten ayıkladık; Merchant Center ve katalog reklamları kötü görseli reddeder, bu iş doğrudan reklama hazırlık oldu.

Bakılamayanlar: Google Ads Transparency Center, rakiplerin Instagram ve TikTok takipçi ve gönderi sayıları, idealo/Geizhals mağaza profilleri, rakip sayfalarının yapılandırılmış verisi. Parfüm ve saat kategorisi liderleri (Flaconi, Parfumdreams, Notino, Christ) incelenmedi.

## 4. Aramada üst sıralar (ücretsiz)

| # | Adım | Emek | Kanıt |
|---|---|---|---|
| 1 | Ürün ve kategori başına kalıcı adres + sunucu tarafı HTML | 2–4 gün | Güçlü |
| 2 | Sayfa başına başlık, açıklama, canonical, Open Graph | 3–4 saat | Güçlü |
| 3 | Product + Offer + BreadcrumbList yapılandırılmış verisi (fiyat, stok, marka, varsa GTIN, kargo, iade) | 0,5–1 gün | Güçlü |
| 4 | robots.txt ve parçalı site haritası (45 bin adres) | 3–4 saat | Güçlü |
| 5 | Google Merchant Center + ücretsiz listelemeler; feed'de marka, stok, fiyat, Almanya kargo ücreti | 1–2 gün | Güçlü |
| 6 | Impressum, Widerruf, Versand, Datenschutz, AGB sayfaları | 0,5 gün | Yasal zorunluluk |
| 7 | Search Console ve Bing Webmaster Tools kaydı | 1–2 saat | Orta |
| 8 | Eksik alt metinler | 2–3 saat | Orta |

Emek sütunu bizim tahminimiz. 1. adım diğerlerinin ön koşulu.

## 5. Yapay zekâ asistanlarında görünme

- **ChatGPT araması:** dahil edilmeyi `OAI-SearchBot` belirler; `GPTBot` yalnız eğitim içindir. robots.txt'te OAI-SearchBot ve PerplexityBot'a izin verilmeli. (developers.openai.com/api/docs/bots)
- **ChatGPT ürün sonuçları:** ürün feed'i OpenAI'a gönderilir, taranmaz. Almanya'da erişim durumunu doğrulayamadık.
- **Google AI Overviews / AI Mode:** kaynağı Merchant Center feed'i ve ürün yapılandırılmış verisi; 4. bölümdeki işler buraya da hizmet eder. AI Mode alışveriş özelliklerinin Almanya'da açık olduğunu doğrulayamadık.
- **Yorumlar ve başka sitelerde anılma:** yaygın tavsiye, kontrollü kanıtı zayıf.
- **llms.txt:** yapmaya değmez. Ahrefs ve SE Ranking çalışmaları etkisini bulamamış; Google desteklemediğini söylemiş (ikincil kaynaklar).
- Perplexity ve Amazon Rufus'un mağaza önerme mekanizmasına bakılmadı.

## 6. Bölgesel görünürlük

- Google Business Profile yalnız müşteri kabul eden fiziksel yer için. Ziyaret kabul edilen depo ya da mağaza yoksa açılamaz; yerel envanter reklamı da fiziksel mağaza ister. (support.google.com/business/answer/7039811)
- Şehir bazlı açılış sayfalarının internet mağazasında işe yaradığına dair kanıt bulamadık; yapmayın.
- Bölgesel hedefleme reklamla yapılır: Meta ve Google'da şehir, yarıçap, posta kodu seçilir (Meta tarafı araştırmada kaynakla doğrulanmadı, reklam yöneticisinden bakılmalı).
- Almanya'daki Türkçe konuşanlara: etnik kökene göre hedefleme yasak (DSA md. 26/3, Meta politikası). Dil hedefleme mümkün, ama reklam metni gerçekten Türkçe olmalı; hukuki teyit alın.

## 7. Ücretli reklam kanalları

Sayılar ajans ve araç bloglarından alınmış kıyas değerleridir, garanti değil.

| Kanal | Ne için | Kıyas maliyet | En az anlamlı test | Risk |
|---|---|---|---|---|
| Google Shopping / Performance Max | Alışveriş niyetli arama; 45 bin ürün için doğal kanal | TBM ~0,15–1,20 € (Shopping), dönüşüm ~%2,2, ROAS ~4x | 300–500 €/ay, dar ürün seti | Feed kalitesi ve marj yönetimi şart |
| Google arama (marka + seçili) | Marka ve "outlet" aramaları | TBM ~0,85 € | 150–300 €/ay | Genel kelimeler pahalı |
| Meta katalog (Instagram + Facebook) | Yeniden pazarlama, keşif, bölgesel erişim | BGBM ~6–12 €, TBM ~0,30–0,90 € | ~50 €/gün, en az 7 gün (tek ajans önerisi) | Haftada ~50 dönüşüm olmazsa öğrenme tamamlanmaz; Kasım–Aralık'ta BGBM %25–50 yüksek |
| Fiyat karşılaştırma (idealo, Geizhals, billiger.de) | Fiyata bakan alıcı | idealo tıklama ~0,56 € (resmi rakam değil) | Marj hesabından sonra | Düşük marjlı üründe zarar |
| Pinterest | Ev, mutfak, moda | TBM 0,45–1,30 € (tek blog) | ~200 €/ay | Almanya verisi yok |
| TikTok Shop | İçerik ve canlı yayınla satış | Komisyon %9, elektronikte %7 | Önce organik | Outlet için uygunluğuna dair kaynak yok |
| Microsoft / Bing | Masaüstü ek hacim | Veri yok | Google bütçesinin ~%10'u | Almanya payı ~%9 |

### Bütçe senaryoları

Varsayım: dönüşüm ~%2, sepet ~40 €. Sipariş sayıları kıyaslardan türetilmiş tahmindir.

| Aylık bütçe | Dağılım | Kaba beklenti |
|---|---|---|
| ~500 € | %70 Google Shopping (yalnız yüksek marjlı ürünler), %30 Meta yeniden pazarlama | 8–14 sipariş; Meta öğrenme eşiğine ulaşmaz |
| ~2.000 € | %50 Google, %30 Meta, %10 Bing ya da Pinterest testi, %10 mikro-influencer | 50–80 sipariş |
| ~5.000 € | %45 Google, %30 Meta, %10 Pinterest/Bing, %15 influencer ve içerik | 130–200 sipariş; marj yetmezse zarar |

500 € senaryosunda sipariş başına reklam maliyeti ~35–60 € çıkar; 40 € sepetle bu, kârlı değildir. Küçük bütçe satış için değil, hangi ürün ve kanalın çalıştığını öğrenmek içindir.

#### Güncelleme (15.11.2026 akşamı): gerçek sepet ~78 € ile yeniden hesap

Yukarıdaki tablo 40 € sepet varsayımıyla yazılmıştı. WawiERP panelinden okunan gerçek veri farklı: 15.10–14.11.2026 arasında mixoutlet.de'de 737 sipariş, 57.813 EUR; ortalama sepet 57.813 / 737 ≈ **78,4 €** (`site-karari-2026-11-15.md` §4a). Sipariş tahminleri aynı bırakıldı (dönüşüm ~%2 kıyasından geliyor, sepetten bağımsız); yalnız ciro ve kârlılık 78 € ile yeniden hesaplandı.

| Aylık bütçe | Sipariş (aynı tahmin) | Ciro (78 € × sipariş) | ROAS | Sipariş başına reklam maliyeti |
|---|---|---|---|---|
| ~500 € | 8–14 | 624–1.092 € | 1,2–2,2 | 36–63 € |
| ~2.000 € | 50–80 | 3.900–6.240 € | 2,0–3,1 | 25–40 € |
| ~5.000 € | 130–200 | 10.140–15.600 € | 2,0–3,1 | 25–39 € |

**Başa baş noktası marja bağlı; marj hâlâ bilinmiyor.** Bir siparişten kalan brüt kâr = 78 € × marj. Reklam maliyeti bunun altındaysa ilk siparişte kâr vardır.

| Brüt marj | Sipariş başına brüt kâr (= katlanılabilir en yüksek reklam maliyeti) | Başa baş ROAS (1 / marj) |
|---|---|---|
| %15 | 11,70 € | 6,7 |
| %25 | 19,50 € | 4,0 |
| %35 | 27,30 € | 2,9 |

Reklam harcaması düşüldükten sonra ilk siparişlerden kalan (brüt kâr − bütçe; tahminin alt ucu … üst ucu):

| Aylık bütçe | %15 marj | %25 marj | %35 marj |
|---|---|---|---|
| ~500 € | −406 … −336 € | −344 … −227 € | −282 … −118 € |
| ~2.000 € | −1.415 … −1.064 € | −1.025 … −440 € | −635 … **+184 €** |
| ~5.000 € | −3.479 … −2.660 € | −2.465 … −1.100 € | −1.451 … **+460 €** |

**Düzeltilen yargı.** "40 € sepetle bu, kârlı değildir" cümlesi yanlış sepet varsayımına dayanıyordu. 78 € ile durum şöyle:

- Ciro ve ROAS yaklaşık iki katına çıkıyor, ama tahmin edilen sipariş başına reklam maliyeti (25–63 €), %15–35 marjın bıraktığı brüt kârın (12–27 €) çoğu durumda hâlâ üstünde.
- İlk siparişte başa baş yalnız iki koşul birlikte sağlanırsa görünüyor: marj %35 dolayında **ve** sipariş başına reklam maliyeti aralığın alt ucunda (~25 €). Bu, 2.000 € ve üstü bütçede, tahminin iyimser ucunda oluyor.
- 500 € senaryosu her marjda ekside kalıyor. Bu bütçenin amacı değişmedi: satış değil, hangi ürün grubunun ve kanalın çalıştığını öğrenmek.
- Karar için asıl iki sayı **kategori bazında marj** ve **tekrar sipariş oranı**. Kataloğun büyük kısmı sarf malzemesi (toner, mürekkep); müşteri yılda ikinci kez sipariş verirse katlanılabilir reklam maliyeti kabaca iki katına çıkar ve tablo artıya dönebilir. Tekrar oranı elimizde yok.

Sınırlar:

1. Sipariş tahminleri ikincil kaynak kıyaslarıdır, garanti değildir; gerçek dönüşüm ilk testte ölçülür.
2. 78,4 €'nun KDV dahil mi hariç mi olduğu WawiERP verisinden anlaşılmıyor. KDV dahilse (%19) net sepet ~66 € olur ve brüt kâr satırları yaklaşık %16 küçülür.
3. Hesapta kargo (39 € üstü ücretsiz DHL satıcıda kalır), ödeme komisyonu ve iade maliyeti yok. Bunlar marjın içinde sayılmadıysa sonuç daha kötüdür.
4. 78 € bugünkü trafiğin sepetidir; reklamla gelen yeni müşterinin sepeti farklı çıkabilir.

## 8. Instagram

- **Organik:** indirim duyurusu ve güven için. İçerik türü ve paylaşım sıklığı hakkında güvenilir kaynak bulamadık; rakip hesapları elle sayılmadı.
- **Ürün etiketleme:** kullanımda görünüyor, kaynak zayıf. Uygulama içi ödemenin kapatıldığı iddiası tek bir blogdan; Meta'nın resmi sayfasından doğrulanmalı.
- **Katalog reklamı:** Outletcity'nin kullandığı kalıp (ürün görseli + marka + indirim yüzdesi) doğrudan uygulanabilir; ürün feed'i 4. bölümdeki feed ile aynı.
- **Mikro-influencer:** nano hesaplar 10–100 €, story ~200 €, gönderi ~400 € (blog fiyatları, aralık geniş). Karşılık varsa reklam etiketi zorunlu (UWG §5a/4).
- **Panelde hazır olan:** Instagram gönderi taslakları ve kampanya önerileri. Şu an simülasyon; gerçek hesap ve Meta uygulaması bağlı değil.

## 9. Yasal kontrol listesi (Almanya)

- **PAngV §11:** indirim duyurusunda son 30 günün en düşük fiyatı esas alınır. 45 bin üründe fiyat geçmişi sistemle tutulmalı; üstü çizili fiyat bu kurala uymalı.
- **Çerez rızası (§25 TDDDG, DSGVO):** analiz ve reklam etiketleri rızadan önce çalışmamalı.
- **Hedefleme:** özel nitelikli verilere dayalı profilleme yasak (DSA md. 26/3).
- **Influencer etiketleme:** UWG §5a/4; ihlalde Abmahnung riski.
- **Impressum ve yasal sayfalar:** zorunlu; şu an vitrinde yok.

Bu liste hukuki görüş değildir; yayına çıkmadan bir Alman e-ticaret avukatına teyit ettirin.

## 10. Ölçüm

- Rıza yönetimi + Google Consent Mode v2 (GA4 ve Google Ads için).
- Meta pikseli ve Conversions API birlikte; Consent Mode Meta'yı kapsamaz, ayrı rıza mantığı gerekir.
- Sunucu taraflı etiketleme sonraya bırakılabilir.
- Panelimizdeki müşteri analizi yalnız ziyaretçi izniyle çalışıyor; reklam ölçümüyle aynı rıza kaydına bağlanmalı.

## 11. Önerilen sıra

| Dönem | İş | Maliyet |
|---|---|---|
| 1. hafta | Karar: Shopify mi yeni vitrin mi. Marj verisi (ürün ya da kategori bazında). Yasal sayfalar | Ücretsiz |
| 1.–2. hafta | Ürün adresleri, yapılandırılmış veri, site haritası, robots.txt, Search Console, Bing | Ücretsiz, 4–6 gün emek |
| 2.–3. hafta | Merchant Center feed'i ve ücretsiz listelemeler; aynı feed ile Meta kataloğu | Ücretsiz |
| 3.–4. hafta | Rıza yönetimi, GA4, Meta pikseli + Conversions API | Ücretsiz ya da düşük |
| 2. ay | Google Shopping testi: en yüksek marjlı ürün grubu | 300–500 € |
| 2.–3. ay | Meta katalog yeniden pazarlama; bülten indirimi; yorum sistemi | 300–1.500 € |
| Sonra | idealo, Pinterest, influencer denemeleri; sonuçlara göre | Değişken |

## 12. Bu raporun sınırları

- Maliyet ve dönüşüm sayıları ikincil kaynaklardan; Google, Meta ve TikTok'un resmi sayfalarından doğrulanmadı.
- Rakip listesi kısa (hedef 5–7, sağlam veri 3'ünde). Google reklam şeffaflık merkezi, sosyal hesap sayıları ve fiyat karşılaştırma profilleri eksik.
- Mağazanın gerçek satış, trafik, marj ve dönüşüm verisi elimizde yok; senaryolar varsayıma dayanıyor.
- mixoutlet.de'nin kendi SEO durumu incelenmedi.

## Kaynaklar

- Google Merchant Center: support.google.com/merchants/answer/13889434 · support.google.com/merchants/answer/7052112
- OpenAI botları ve ürün feed'i: developers.openai.com/api/docs/bots · developers.openai.com/commerce/guides/key-concepts
- llms.txt: optimizely.com/field-notes/articles/does-llms-txt-work
- Google Business Profile uygunluk: support.google.com/business/answer/7039811
- Fiyat karşılaştırma: snapsoft.de/en/blog-en/price-comparison-sites · shopify.com/de/blog/preisvergleichsportale
- Reklam kıyasları: braverytechnology.com/de/?p=3080 · ?p=2788 · ?p=3098 · ostend.digital/meta-ads-kosten-kompass · trackbee.io/blog/pinterest-ads-cost
- TikTok Shop: ohn.haendlerbund.de/themen/marktplaetze/gebuehrenerhoehung-tiktok-shop-haendler-zahlen-2026-mehr
- Influencer: kolsquare.com/de/blog/wie-viel-kostet-influencer-marketing-wirklich-so-budgetiert-man-richtig · influee.co/de/blog/influencer-marketing-budget
- Yasal: gesetze-im-internet.de/pangv_2022/__11.html · transparency.meta.com/de-de/policies/ad-standards/unacceptable-content/discriminatory-practices · datenschutz-generator.de/influencer-werbung
- Ölçüm: weltpixel.com/blogs/news/google-consent-mode-v2-on-shopify-complete-implementation-guide
- Rakipler: outlet46.de · omr.com/en/daily/hidden-champion-outlet46 · alternate.de/Restposten-Einzelstücke · Meta Ad Library (facebook.com/ads/library, DE, 15.11.2026)
