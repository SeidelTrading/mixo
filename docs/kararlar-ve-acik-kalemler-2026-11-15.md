# Hesaplar, mobil uygulama, Instagram ajanı: kararlar ve açık kalemler

15 Kasım 2026 · Kapsam: Mixoutlet + WawiERP için hesap ayrımı, mobil uygulama, Instagram yönetimi, reklam kalemleri.
Dayanak: `site-karari-2026-11-15.md`, `pazarlama-analizi-2026-11-15.md`, `guvenlik-raporu-2026-11-15.md`, `DOCKS-teklif-2026-11-15.pdf`, `~/Desktop/Urunler/WaviERP/kararlar/0001–0008`.

## 1. Bu oturumda verilen kararlar

| Konu | Karar | Not |
|---|---|---|
| Mobil uygulama | **React Native (Expo), TypeScript** | Hazır Shopify uygulama oluşturucuları reddedildi |
| Mağaza ve reklam hesaplarının sahibi | **Lady Empire GmbH** | Apple Developer, Google Play, Meta Business, Google Ads/Merchant Center; D-U-N-S bu şirket için alınır |
| Instagram | **Tam hesap yönetimi** | Yayın, yorum, mesaj, istatistik; yalnız gönderi önerisi değil |

Önceki kararlar geçerli: mağaza Shopify'da kalır (site kararı, A + D); WawiERP AWS Frankfurt üzerinde (0005).

## 2. Mobil uygulama mimarisi (öneri; uygulanmadı)

Uygulama ayrı mağaza değildir, Shopify'ın önünde ikinci vitrindir.

| Katman | Seçim |
|---|---|
| Uygulama | React Native + Expo |
| Katalog, arama, sepet | Shopify Storefront API |
| Ödeme | Shopify Checkout Sheet Kit (Mollie, Klarna, PayPal Shopify'da kalır) |
| Müşteri girişi | Shopify Customer Account API |
| Bildirim | Firebase Cloud Messaging + Apple APNs |
| Kendi sunucumuz | Yönetim paneli servisi: bildirim kayıtları, öneriler, olay toplama |
| Ölçüm | GA4 / Firebase Analytics; rıza ekranı; iOS'ta izleme izni |
| Derleme ve yayın | Expo EAS Build + Submit (Mac gerekmez) |
| Hata takibi | Sentry (React Native) |

Dikkat: yalnız siteyi saran "webview" uygulaması Apple'da reddedilebilir. Evrensel bağlantı doğrulama dosyasının Shopify'da nasıl sunulacağı **doğrulanmadı**.

## 3. Instagram ajanı mimarisi (öneri; `demo/instagram.mjs` şu an simülasyon)

```
Olaylar (yeni ürün, fiyat düşüşü, yorum, mesaj, takvim)
   → iş kuyruğu → ajan (Claude API + araçlar) → onay kuyruğu (panel) → Graph API → denetim kaydı
```

- Üç düzey: yalnız öner · önce sor (varsayılan) · kendiliğinden. Yayın ve mesaj yanıtı "önce sor" ile başlar.
- Araç verilmez: fiyat değiştirme, iade/para işlemi, silme.
- Yorum ve mesaj metni veridir, talimat değildir.
- Sipariş, iade ve şikâyet mesajları insana devredilir (kime devredileceği **tanımlı değil**).
- Meta'nın 24 saatlik mesaj penceresi dışına otomatik mesaj atılmaz.
- Otomatik yanıtlarda karşı tarafa yanıtın otomatik olduğu bildirilir (hukuki teyit gerekli).
- Ajan ayrı servis olmaz; yönetim panelinin içinde çalışır.

## 4. Lady Empire GmbH'den istenecekler

| # | İstenen | Ne için |
|---|---|---|
| 1 | Şirket alan adında e-posta (kişisel + grup adresi) | Tüm hesapların temeli |
| 2 | D-U-N-S numarası, tüzel kişi bilgileri, imza yetkilisi | Apple Developer, Google Play |
| 3 | Apple Developer (99 $/yıl) ve Google Play Console (25 $) kuruluş hesabı; bize yönetici rolü | Uygulama yayını |
| 4 | Shopify personel/iş ortağı erişimi: ürün, tema, kanal, rapor | Pazarlama kurulumu, panel |
| 5 | Shopify Admin API ve Storefront API anahtarları | Panel, mobil uygulama |
| 6 | Shopify geliştirme (test) mağazası onayı | Canlıda denememek için |
| 7 | JTL-Wawi / WawiERP erişimi ve "düzeltme nerede yapılır" yanıtı | Tek doğruluk kaynağı |
| 8 | Search Console, GA4, Merchant Center, Google Ads erişimi | Ölçüm ve reklam |
| 9 | Meta Business portföyü (doğrulanmış), reklam hesabı, piksel, katalog | Reklam, Instagram |
| 10 | Instagram profesyonel hesap + bağlı Facebook Sayfası | Ajan |
| 11 | Kategori bazında brüt marj, aylık reklam bütçesi tavanı | Bütçe kararı |
| 12 | Müşteri hizmetlerinde devir alacak kişi ve mesai kuralı | Ajan devri |
| 13 | Yasal metinler ve avukat teyidi (BFSG, yapay zekâ bildirimi, PAngV, bülten çift onayı) | Yayın öncesi |
| 14 | Marka tescil durumu ("MixOutlet") | Mağaza hesapları, uygulama adı |
| 15 | Veri işleme sözleşmesi (AVV) | Müşteri verisine erişim |
| 16 | WawiERP pilotu için: eski kaynak kod, veritabanı şeması, Trendyol/N11/Ozon erişimi | Pilot |

Bizim tarafta açılacaklar: GitHub organizasyonu, AWS Organization (Frankfurt), Cloudflare, Sentry, Claude Console organizasyonu, Expo organizasyonu, Meta geliştirici uygulaması, Shopify Partners hesabı.

## 5. Reklam ve pazarlama kalemleri

Ayrıntı `pazarlama-analizi-2026-11-15.md` §7–§11'de. Özet:

- Tek seferlik kurulum: Merchant Center, akış temizliği, 882 sorunlu ürün, rıza + GA4, Meta pikseli + Conversions API, katalog, tema, panel bağlantısı, ilk Shopping testi (teklifte 6.000 €).
- Aylık reklam bütçesi (şirket kartından): Google Shopping 300–500 €, marka araması 150–300 €, Meta katalog ~50 €/gün en az 7 gün; sonra fiyat karşılaştırma, Pinterest, Bing, influencer.
- Aylık hizmet: pazarlama yönetimi 750 € (teklif). **Tam Instagram yönetimi bu kalemden geniştir; yeniden fiyatlanmalı.**
- Rapordaki bütçe senaryoları 40 € sepetle hesaplandı; WawiERP verisinde ortalama sepet ~78 €. Senaryolar yeniden hesaplanmalı.

## 6. Açık kalemler (15.11.2026 akşamı itibarıyla)

✔ yapıldı · ◐ kısmen · ✗ açık · ? buradan görülemiyor

| # | Kalem | Durum | Not |
|---|---|---|---|
| 1 | Mixo'ya ayrı depo | ✔ | `wpu-research/mixo`; şirket organizasyonuna taşıma bekliyor. Ana depoda (`/home/wpu`) Mixo ve WaviERP yerel olarak dışlandı |
| 2 | Güvenlik bulguları | ◐ | Çoğu düzeltildi; yayınlandığı doğrulanmadı. Açık: `/sunum/` kararı, sipariş doğrulaması, yedekleme, kişiye bağlı hesap, yasal sayfalar. Docker imajı hâlâ derlenmedi (bu makinede Docker yetkisi yok) |
| 3 | Anahtarların yenilenmesi | ✗ | Claude API anahtarı, yönetici parolası, `SESSION_SECRET` |
| 4 | Shopify test mağazası | ? | |
| 5 | Teklifin güncellenmesi | ✗ | Mobil uygulama ve tam Instagram yönetimi teklifte yok; teklif DOCKS'a yazılı, hesaplar Lady Empire adına |
| 6 | Erişilebilirlik (BFSG) | ✗ | Mobil uygulama tasarımına girmeli |
| 7 | Yapay zekâ bildirimi | ✗ | Ajan tasarımına yazıldı (§3), hukuki teyit yok |
| 8 | Bülten çift onayı | ◐ | İzin kaydı var, onay e-postası yok |
| 9 | Marka tescili | ? | |
| 10 | Veri işleme sözleşmeleri | ✗ | Lady Empire, Anthropic, Sentry, bülten aracı |
| 11 | İnsana devir | ✗ | |
| 12 | JTL-Wawi mi Shopify mı | ✗ | Site kararı soru 5 |
| 13 | Panelin veri katmanı | ◐ | Hâlâ JSON dosyası; veritabanı, yedek, iş kuyruğu yok |
| 14 | İzleme | ✗ | Mixo paneli ve mobil uygulama için hata takibi yok |
| 15 | E-posta alan adı ayarları (SPF, DKIM, DMARC) | ? | |
| 16 | Mağaza incelemesi hazırlığı | — | Uygulama başlamadı |
| 17 | Tek kişi riski | ✗ | Panelde tek ortak parola; acil durum erişimi yok |
| 18 | Grubun öteki mağazaları kapsamda mı | ✗ | |
| 19 | Uygulamaya özel indirim / pazaryeri fiyat eşitliği | ✗ | |
| 20 | Faturalama (kime, KDV) | ✗ | Muhasebeciye sorulacak |

Yerel hesap ayrımı (ayrı git kimliği, SSH takma adı, ayrı Claude profili) kurulmadı: şirket e-postası ve organizasyon adı bekleniyor.
