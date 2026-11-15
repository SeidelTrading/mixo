# Pazarlamayı hangi site üzerinden yürütelim? — Karar belgesi

15 Kasım 2026 · Kapsam: inceleme ve belge (kod değişikliği, yayın, hesap açma yok) · Önceki rapor: `docs/pazarlama-analizi-2026-11-15.md`

## 1. Öneri

**A seçeneği (mevcut Shopify mağazası mixoutlet.de pazarlamanın adresi olur), yanına D eklenerek: yeni vitrinin yönetim paneli, Shopify'a veri yazan bir iş aracına dönüşür.**

Gerekçe: mixoutlet.de bugün zaten arama motoru ve reklam kanalı için gerekenlerin çoğunu taşıyor: canonical, Open Graph, `Organization`/`WebSite` yapılandırılmış verisi, 51 parçalı ürün site haritası, Shopify'ın varsayılan robots.txt'i, yapay zekâ ajanları için `agents.md` + UCP (Universal Commerce Protocol) uç noktası, Klarna/PayPal/kart/havale ödemesi ve yasal sayfa bağlantıları. Yeni vitrinin gerçek mağaza olması (B) ise tahminen 6–9 haftalık iş, ödeme ve yasal sorumluluk ve SEO adres riski demek; pazarlama bu sürede başlayamaz. Yeni vitrindeki ürün verisi Shopify'ın `handle` alanıyla tutulduğu için (`_build.py:129`), fotoğraf ve başlık düzeltmeleri doğrudan Shopify'a geri yazılabilir. Yani yaptığımız işin çoğu kaybolmaz. Karma yapı (C) ancak Shopify teması gerçekten dönüşümü düşürüyorsa ve bunu ölçtükten sonra anlamlıdır. Bu karar, mağaza sahibinin bize Shopify yönetici erişimi (en az ürün, tema ve kanal yetkisi) vermesine bağlı. Erişim gelmezse önerimiz değişir (4. bölüm).

## 2. Seçeneklerin karşılaştırması

Emek değerleri bizim tahminimizdir; ölçülmüş değildir. "Gün", bir geliştiricinin tam iş günüdür.

| Ölçüt | **A. Shopify pazarlama adresi** (+D: panel Shopify'a yazar) | **B. Yeni vitrin gerçek mağaza** | **C. Headless: Shopify arka uç, yeni vitrin ön yüz** |
|---|---|---|---|
| Pazarlamaya başlama süresi | 1–2 hafta (Merchant Center ve Meta kataloğu Shopify uygulamalarıyla bağlanır) | 6–9 hafta (aşağıdaki eksikler yazılıp test edilmeden reklam verilemez) | 3–5 hafta |
| Emek (tahmin) | 5–10 gün: tema iyileştirmeleri, veri geri yazma, ölçüm, feed temizliği | 30–45 gün (döküm aşağıda) | 12–20 gün |
| Aylık maliyet kalemleri | Mevcut Shopify planı (değişmez), varsa ek uygulamalar (rıza bandı, feed, yorum) | Sunucu + veritabanı + yedek, ödeme sağlayıcı komisyonları, yasal metin hizmeti, e-posta gönderimi, bizim bakım saatimiz; Shopify bırakılmazsa onun ücreti de sürer | Mevcut Shopify planı + vitrin barındırma + bizim bakım saatimiz |
| SEO riski | Yok: adresler, sıralama ve dizin aynen kalır | **Yüksek**: aynı alan adında bile ~45 bin ürün ve kategori adresi değişir; eksiksiz 301 haritası şart, geçişte sıralama düşüşü olası | Orta–düşük: `/products/{handle}` ve `/collections/{handle}` yolları birebir korunursa düşük; korunmazsa B kadar risk |
| Ödeme ve yasal uyum (Almanya) | Mevcut ödeme akışı ve yasal sayfalar kullanılır; içeriklerinin doğruluğu ayrıca kontrol edilmeli | Hepsi bizde: ödeme entegrasyonu, Widerruf akışı, fatura, sipariş e-postaları, PAngV 30 gün fiyat geçmişi, veri koruma; yeni hukuki sorumluluk | Ödeme ve sipariş Shopify'da kalır; vitrindeki yasal metinler, rıza ve fiyat beyanları bizde |
| Bakım yükü | Düşük: barındırma, güvenlik ve ödeme Shopify'da | Yüksek ve sürekli: sunucu, güvenlik, ödeme hataları, stok eşitleme, yedek | Orta: iki sistemin uyumu, API sürüm değişiklikleri |
| Yeni vitrin işinin korunması | Arama/filtre ve ücretsiz kargo çubuğu temaya yeniden yazılır; fotoğraf/başlık düzeltmeleri, onay kuyruğu, kampanya önerileri panelde kalır ve Shopify'a yazar. Vitrin arayüzü kamuya açık olmaz | Tamamı korunur | Ön yüz ve panel korunur; veri katmanı Storefront API'ye taşınır |
| Merchant Center / Meta kataloğu | En kolay: Shopify'ın Google & YouTube ve Facebook & Instagram uygulamaları | Feed'leri biz üretir, biz güncel tutarız | Shopify uygulamaları feed'i üretir; ürün bağlantılarının headless alan adını göstermesi ayrıca ayarlanmalı (doğrulanmadı) |
| Yapay zekâ alışveriş kanalları | Shopify'ın Agentic Storefronts/UCP altyapısı mağazada zaten açık görünüyor (Almanya'da ChatGPT içi satış doğrulanmadı) | Kendimiz kurarız; şu an yok | Shopify kataloğu üzerinden kısmen sürer (doğrulanmadı) |
| Geri dönüş kolaylığı | Çok kolay: tema sürümü geri alınır, uygulama kaldırılır | Zor: adres ve ödeme geçişi geri alınırsa ikinci bir SEO kesintisi | Orta: alan adı yeniden Shopify temasına yönlendirilir |

### Ek seçenek D: Panel Shopify için iş aracı

Vitrin kamuya açık mağaza olmaz. Yönetim panelimiz (sorunlu ürün onay kuyruğu, fotoğraf/başlık düzeltmeleri, kampanya ve Instagram önerileri, yapay zekâ asistanı) Shopify Admin API'den okur ve onaylanan değişiklikleri Shopify'a yazar. Erişim verilmezse aynı çıktılar CSV olarak mağaza sahibine teslim edilir. A ile birlikte önerdiğimiz yol budur.

### B için eksikler ve emek tahmini

Kanıtlar `demo/` altındaki koddan; emek bizim tahminimizdir.

| Eksik | Kanıt | Emek (tahmin) |
|---|---|---|
| Ürün ve kategori adresi + sunucu tarafı HTML | Gezinme `#katalog?...` (`demo/app.js:192`); tek `index.html` (`demo/server.mjs:482`) | 2–4 gün |
| Başlık/açıklama/canonical/OG, Product JSON-LD | Yok; `noindex` var (`demo/index.html:7`) | 1–1,5 gün |
| robots.txt, parçalı site haritası | Canlıda 404 | 0,5 gün |
| Gerçek ödeme (PayPal, Klarna, kart; Almanya'da faturayla ödeme beklentisi) | Sipariş yalnız `orders.json`'a yazılıyor (`demo/server.mjs:57-59`, `:213`), ödeme yok | 5–8 gün |
| Kalıcı veritabanı (şu an JSON dosyaları, tek süreç) | `DATA_DIR` + `orders.json` (`demo/server.mjs:14`, `:57`) | 2–3 gün |
| Stok ve fiyat eşitleme (mağaza büyük olasılıkla JTL-Wawi ile yönetiliyor; kategori adları `mixoutlet-jtl-category-*`) | Veri bir kez çekilmiş, güncellenmiyor (`_fetchall.py`) | 3–6 gün |
| Sipariş e-postaları, fatura, Widerruf/iade akışı, müşteri hesabı | Yok | 4–6 gün |
| Yasal sayfalar (Impressum, AGB, Widerruf, Versand, Datenschutz) | Alt bilgi bağlantıları boş (`demo/index.html:665`) | 0,5 gün + metinler mağaza sahibinden/avukattan |
| PAngV §11: son 30 günün en düşük fiyat geçmişi | Yok | 1–2 gün |
| Rıza bandı + GA4/Consent Mode + Meta piksel/CAPI | Yalnız kendi analiz olaylarımız var | 1–2 gün |
| Merchant Center ve Meta feed üretimi | Yok | 1–2 gün |
| ~45 bin adres için 301 yönlendirme haritası + test | Yok | 1–2 gün |
| Güvenlik incelemesi, yük testi, yayın | Paralel güvenlik oturumu sürüyor | 3–5 gün |
| **Toplam** | | **~25–45 gün; takvimde 6–9 hafta** |

## 3. Önerilen yol (A + D) için ilk 30 gün

"Biz" = geliştirici ekibimiz; "Sahip" = mağaza sahibi. Emek tahmindir.

| Gün | Adım | Kim | Emek |
|---|---|---|---|
| 1–3 | Kararı ve 4. bölümdeki soruları sahiple konuş; Shopify'da bize personel/iş ortağı erişimi (ürün, tema, kanal, rapor) | Sahip | 1 toplantı |
| 1–3 | Marj verisi (en azından kategori bazında) ve son 3–6 ayın trafik/satış özeti; Search Console erişimi | Sahip | 0,5 gün |
| 3–5 | Mevcut durumu içeriden denetle: tema ürün sayfasında Product JSON-LD var mı (`structured_data` filtresi), Search Console'da dizinlenen sayfa sayısı, hız raporu, yasal sayfaların içeriği | Biz | 1–1,5 gün |
| 4–7 | Google & YouTube uygulamasıyla Merchant Center bağlantısı (varsa mevcut olanı kontrol), ücretsiz listelemeler; GTIN/marka eksiklerini çıkar | Biz + Sahip (Google hesabı sahibin olmalı) | 1–2 gün |
| 5–10 | 882 sorunlu ürün listesini ve onaylanmış fotoğraf/başlık düzeltmelerini Shopify'a aktar (Admin API ya da CSV); düşük kaliteli görseli olan ürünleri feed'den hariç tut | Biz; toplu değişikliği Sahip onaylar | 1–2 gün |
| 7–12 | Rıza bandının Consent Mode v2 sinyali verdiğini doğrula; GA4 + Google Ads dönüşüm; Meta pikseli + Conversions API | Biz | 1–2 gün |
| 10–14 | Facebook & Instagram uygulamasıyla Meta kataloğu; aynı ürün hariç tutma kuralları | Biz + Sahip (Meta işletme hesabı sahibin) | 0,5–1 gün |
| 10–20 | Yeni vitrinden temaya taşınacaklar: arama/filtre iyileştirmesi (önce Shopify Search & Discovery ile ne yapılabildiğine bak), ücretsiz kargo çubuğu (mağaza zaten "39 € üstü ücretsiz DHL" diyor) | Biz; tema yayını Sahip onayıyla | 3–5 gün |
| 15–25 | Paneli (D) Shopify Admin API'ye bağla: okuma, onay kuyruğu, onaylanan değişikliği yazma, geri alma kaydı | Biz | 4–6 gün |
| 20–30 | İlk ücretli test: Google Shopping, yalnız yüksek marjlı ürün grubu, 300–500 €/ay | Sahip bütçeyi onaylar; Biz kurar | 1 gün + izleme |
| 30 | İlk değerlendirme: feed onay oranı, dizin, dönüşüm; C'ye gerek var mı kararı | Biz + Sahip | 0,5 gün |

## 4. Kararı değiştirebilecek bilinmeyenler ve sahibe sorular

**Kararı değiştirebilecekler:**

- **Yönetici erişimi verilmezse:** A'da tema ve kanal işlerini sahibin ekibi yapar, biz yalnız öneri ve CSV veririz. Sahibin kendi kontrolünde ayrı bir mağaza istemesi durumunda B konuşulabilir, ama SEO kaybı ve süre aynen geçerli.
- **Mağaza JTL-Wawi ile yönetiliyorsa** (kategori adları buna işaret ediyor; doğrulanmadı): ürün değişiklikleri Shopify'da yapılırsa JTL'nin üzerine yazma riski var. Düzeltmelerin JTL'de mi yapılacağı netleşmeli. B ve C'de de JTL bağlantısı ayrı bir iş olur.
- **Tema başka bir ajansın elindeyse** (tema adı `MixOutlet-Flat-20261013`, mağaza teması değil, özel): tema değişiklikleri onlarla koordine edilir.
- **Mevcut trafik ve dizin çok düşükse:** A'nın "SEO riski yok" avantajı küçülür; o zaman C'nin süresi daha kabul edilebilir olur. Yine de B'nin ödeme ve yasal yükü değişmez.
- **Shopify planı ve 50 bin varyant sınırı:** Plus olmayan mağazada 50 bin varyant üstünde günde en fazla 1.000 yeni varyant eklenebiliyor (ikincil kaynak). 45 bin ürünle sınıra yakınız; katalog büyüyecekse planlanmalı.

**Mağaza sahibine sorular** (WawiERP projesinden yanıtı bulunanlar çıkarıldı; bkz. 4a):

1. Shopify planınız hangisi (Basic, Grow, Advanced, Plus)?
2. Bize Shopify'da hangi yetkilerle erişim verebilirsiniz (ürünler, tema, satış kanalları, raporlar)?
3. Google Merchant Center, Google Ads, Meta Business ve Search Console hesaplarınız var mı, kimin adına açık? Şu an reklam veriyor musunuz?
4. mixoutlet.de'de Shopify Markets ile hangi ülkelere satış açık? Pazarlama yalnız Almanya için mi?
5. Ürün başlığı, fotoğraf ve fiyat düzeltmelerini nerede yapmalıyız: JTL-Wawi'de mi, WawiERP panelinde mi, Shopify'da mı? Shopify'da yapılan değişiklik bir sonraki eşitlemede eziliyor mu?
6. Kategori ya da ürün bazında brüt marj nedir? (WawiERP'de kâr/zarar kutusu "maliyet, komisyon, kargo ve iade verisi bekleniyor" diyor; marj oradan okunamıyor.)
7. Aynı ürün eBay, Kaufland, OTTO, METRO ve Amazon'da da satılıyor. mixoutlet.de fiyatı pazaryerlerinden düşük olabilir mi, yoksa fiyat eşitliği mi istiyorsunuz?
8. mixoutlet.de'ye trafik nereden geliyor (arama, doğrudan, reklam)? Aylık ziyaretçi sayısı nedir?
9. Reklam için aylık bütçe tavanınız nedir?
10. Temayı kim yaptı, bakımını kim yapıyor? Değişiklik onay süreciniz nedir?
11. Yasal metinleri (Impressum, AGB, Widerruf, Datenschutz) kim hazırladı, güncel mi?
12. İade oranınız nedir, en çok hangi kategoriler iade ediliyor?
13. Pazarlama yalnız mixoutlet.de için mi, yoksa grubun öteki mağazaları (LadyToner.de, Parfymonline.de, Parfumverkoop.nl) da kapsamda mı?

## 4a. WawiERP projesinden öğrendiklerimiz (15.11.2026 eki)

Kaynak: `~/Desktop/Urunler/WaviERP/docs/panel/03-satis-kanallari.md`, `06-yeniden-denenen-ekranlar.md`, `raw/siparis-dagilimi-30gun.json`. Bunlar WawiERP panelinden (wawib2b.com) okunmuş değerlerdir.

- **Sahip şirket:** Lady Empire GmbH. Ürün verisi kaynağı JTL-Wawi; satış kanalları WawiERP panelinden yönetiliyor. 4. ve 5. bölümdeki "JTL-Wawi kullanımı doğrulanmadı" notu böylece doğrulanmış oldu.
- **mixoutlet.de zaten çalışan ve en büyük kanal:** 15.10–14.11.2026 arasında 737 sipariş, 57.813 EUR (panelde okunan 2.505 siparişin içinde en yüksek; 101 sayfadan 2'si eksik). Ortalama sepet yaklaşık 78 EUR. Pazarlama raporundaki 40 EUR sepet varsayımı düşük kalıyor.
- **Pazaryerleri:** Lady Empire'a atanmış 13 kanal var: Shopify ×3, JTL-Shop, eBay ×2, Amazon ×2, JTL-Wawi, XML-Import, Dealclub, Kaufland, METRO. Panelde ayrıca OTTO, Ozon, Trendyol, N11 ve başka şirketlerin (Woida, Technowelt) hesapları görünüyor.
- **Ödeme:** Mollie üzerinden (kart, Klarna, PayPal, SEPA, Apple Pay, iDEAL, Bancontact) + Shopify'da manuel banka havalesi. Shopify Payments değil.
- **Katalog:** WawiERP'de Mixoutlet.de Shopify kanalında 65.692 ürün kaydı; bizim çektiğimiz yayındaki ürün 44.998. Aradaki fark açıklanmadı (yayında olmayan ya da stoksuz ürünler olabilir; doğrulanmadı).
- **Sonuç:** "Yeni vitrin mağaza olsun" (B) ve headless (C) seçenekleri gündemden çıkar; karar A'dır. Asıl pazarlama sorusu artık şudur: komisyonsuz kendi kanalımız olan mixoutlet.de'nin payını pazaryerlerine karşı nasıl büyütürüz. Düzeltmelerin yazılacağı yer de Shopify değil, büyük olasılıkla JTL-Wawi/WawiERP tarafıdır (soru 5).

## 5. Doğrulananlar, doğrulanamayanlar ve kaynaklar

### mixoutlet.de'de gördüklerimiz (15.11.2026, 6 sayfa isteği)

| Öğe | Durum |
|---|---|
| Ana sayfa | 200; ilk bayt ~0,18 s, HTML 313 KB (tek ölçüm, hız izlenimi; Lighthouse/PageSpeed çalıştırılmadı) |
| Başlık / açıklama | Var, Almanca: "MixOutlet – Parfum, Technik & gute Funde für deinen Alltag"; açıklamada "kostenloser DHL-Versand ab 39 €" |
| canonical, `lang="de"` | Var |
| Open Graph | `og:title`, `og:type`, `og:image` var |
| JSON-LD (ana sayfa) | `Organization`, `WebSite` + `SearchAction` |
| Tema | Özel tema `MixOutlet-Flat-20261013` (mağaza teması değil) |
| robots.txt | Shopify varsayılanı; site haritasını gösteriyor; `adsbot-google` için ayrı blok; yapay zekâ botlarına özel engel yok |
| sitemap.xml | Var: 51 ürün, 1 sayfa, 1 koleksiyon, blog ve makale haritası + `sitemap_agentic_discovery.xml` |
| Yapay zekâ ajanları | `/agents.md` var; mağazanın UCP (Universal Commerce Protocol) ve MCP uç noktası sunduğunu, Shop Pay ile ödeme yaptırılabildiğini söylüyor |
| Yasal sayfa bağlantıları | Alt bilgide: `/policies/legal-notice` (Impressum), `refund-policy`, `shipping-policy`, `terms-of-service`, `privacy-policy`, `contact-information`. İçerikleri okunmadı |
| Ödeme simgeleri | Klarna, PayPal, Visa, Mastercard, Maestro, American Express, Cartes Bancaires, havale |
| Güven işaretleri | Trusted Shops, Trustpilot ya da yorum uygulaması izine ana sayfa HTML'inde rastlamadık |
| Blog | "geschenkideen" blogu var (Atom beslemesi robots.txt'te) |

### Doğrulanmadı

- **Kategori ve ürün sayfası:** `/collections/damenuhren` isteği **429 (hız sınırı)** döndü. Talimat gereği durduk, tekrar denemedik. Bu yüzden ürün sayfasında Product/Offer JSON-LD, ürün başlık/açıklama kalitesi ve kategori sayfası canonical'ı **erişilemedi**. Sayfa haritası alt dosyası da (`sitemap_pages_1.xml`) boş döndü.
- **Google dizinlenmesi:** `site:mixoutlet.de` aramamız (kullandığımız arama aracı) mixoutlet.de'den hiç sonuç döndürmedi. Bu "dizinlenmemiş" demek değildir; araç site kısıtını uygulamadı. Gerçek sayı için Search Console gerekli.
- Mağazanın Shopify planı, Merchant Center/Meta bağlantısının zaten var olup olmadığı, ödeme sağlayıcısı, JTL-Wawi kullanımı.
- Shopify Agentic Storefronts / ChatGPT içi satışın Almanya'daki alıcılar için açık olup olmadığı: kaynaklar ABD alıcısı şartını söylüyor, Almanya için bilgi yok.
- Shopify'ın Google & YouTube ve Facebook & Instagram uygulamalarında ürün sayısı sınırı: resmi rakam bulamadık.
- Shopify fiyatları Almanya: kaynaklar birbirini tutmuyor (Basic ~25–36 €, Grow ~66–105 €, Advanced ~289–384 €/ay; ikincil kaynaklar). Resmi fiyat sayfasından bakılmalı.
- Headless'ta Merchant Center ürün bağlantılarının özel alan adına yönlenmesi.
- Shopify'ın yerleşik rıza bandının Google'ın AB rıza politikası için yeterli olup olmadığı (bir satıcı yeterli olmadığını iddia ediyor).

### Kaynaklar

- Shopify `structured_data` Liquid filtresi: https://shopify.dev/docs/api/liquid/filters/structured_data · ProductGroup değişikliği: https://shopify.dev/changelog/liquid-structured_data-filter-supports-productgroup
- Headless ve Hydrogen/Oxygen: https://shopify.dev/docs/storefronts/headless/overview · https://shopify.dev/docs/storefronts/headless/getting-started/build-options · https://shopify.dev/docs/storefronts/headless/hydrogen/fundamentals
- Merchant Center + Shopify: https://support.google.com/merchants/answer/16267554 · https://support.google.com/merchants/answer/13693394
- Meta kataloğu entegrasyonu: https://developers.facebook.com/documentation/ads-commerce/commerce-platform/partners/catalog-integration.md · https://community.shopify.com/t/shopify-catalogue-incomplete-sync-with-meta-instagram-facebook/234744
- Rıza: https://help.shopify.com/en/manual/privacy-and-security/privacy/consent · https://www.consentmo.com/blog-posts/store-compliance-google-eu-user-consent-policy (satıcı kaynağı)
- Agentic Storefronts: https://shopify.com/news/agentic-commerce-momentum · https://www.shopify.com/blog/how-agentic-commerce-works · https://shopify.com/legal/terms-agentic-storefronts · https://digiday.com/marketing/shopify-says-purchases-are-coming-inside-chatgpt-through-agentic-storefronts-as-openai-retreats-on-instant-checkout/
- 50 bin varyant / günlük 1.000 sınırı (ikincil): https://community.shopify.com/t/how-to-handle-the-1000-variant-per-day-limit-on-api-uploads/3355/5 · https://community.shopify.dev/t/50-000-product-variant-limit/14927
- Shopify fiyatları (ikincil, çelişkili): https://finom.co/de-de/blog/shopify-kosten/ · https://qualimero.com/blog/shopify-preise
- JTL-Wawi ↔ Shopify: https://apps.shopify.com/jtl-connector-erp-integration · https://ebakery.de/en/?p=59167
- mixoutlet.de: https://mixoutlet.de/ · /robots.txt · /sitemap.xml · /sitemap_agentic_discovery.xml · /agents.md (15.11.2026)
