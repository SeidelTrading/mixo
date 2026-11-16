# Mixo — Güvenlik Konseyi Raporu (2026-11-16)

Kapsam: DOCK altındaki iki proje: Mixo sunucusu ve yönetim paneli (`demo/`, ~10,4 bin satır) ile Mixo mobil uygulaması (`mobile/`, ~7,5 bin satır).
Yöntem: 6 uzman ajan (A kimlik/yetki/HTTP, B asistan/sipariş, C Instagram/pazarlama, D web istemcisi/Docker, E mobil ağ/yapılandırma, F mobil ekranlar) kodu okudu. E ve F ilk turda bazı dosyaları atladığı için ek tur istendi. Her ajan önceki turların (§6-7, `guvenlik-raporu-2026-11-15.md`) düzeltmelerini de kodda kontrol etti.
Sınır: yalnız kod okuma. Hiçbir şey çalıştırılmadı, canlı siteye istek yapılmadı, hiçbir bulgu sömürülmedi, hiçbir dosya değiştirilmedi. Ajan çıktıları iddiadır; **"Doğrulandı"** yazanları ayrıca kodda kendim okudum, ötekiler ajan iddiası olarak kalıyor.
Bağımlılıklar (`npm audit`, üretim): `demo/` temiz; `mobile/` 3 orta (`minimatch` DoS, `expo` → `@expo/fingerprint` zincirinde, geliştirme aracı).

## 1. Özet

- Kritik bulgu yok. **2 Yüksek, ~15 Orta**, gerisi Düşük/Bilgi.
- Önceki turların düzeltmeleri kodda gerçekten duruyor (oturum, hız sınırı, onay mantığı, webhook imzası, geri alma çakışması). Atlatılanlar aşağıda: A1 §7'deki "görüntüleyen POST yapamaz" kuralını delip geçiyor.
- En büyük iki açık: **A1** (görüntüleyen rol PUT/PATCH/DELETE ile yazma uçlarını çağırabiliyor) ve **B1** (sahte siparişlerle sipariş tavanı doldurulup mağaza kapatılabiliyor).
- Mobil uygulama küçük bir yüzey: salt okunur, ödeme ve kişisel veri girişi yok. Ana risk sunucudan gelen verinin doğrulanmaması.

## 2. Yüksek

| ID | Yer | Bulgu | Durum |
|---|---|---|---|
| A1 | `routes/handler.mjs:50,69,83` · `marketing/admin.mjs:72-74` · `instagram/admin.mjs:11-13` | İçerik türü/Origin denetimi ve "görüntüleyen yazamaz" kapısı yalnız `POST`'ta. Ama yönetici dağıtıcıları `method === 'GET' ? GET : POST` seçiyor: PUT/PATCH/DELETE yazma işleyicilerine düşüyor, gövde `{}` oluyor. Görüntüleyen hesap `PUT /api/admin/instagram/draft`, `/simulate`, `/post-refresh`, `/marketing/reminders-simulate` çağırabilir (yazma ya da AI maliyeti). Tarayıcıdan CSRF zor (preflight + SameSite=Strict). | **Doğrulandı** (kod yolu). Her işleyicinin boş gövdeyle tam etkisi izlenmedi. |
| B1 | `services/orders.mjs:43,65-71` · `routes/public.mjs:45` | 5.000'lik sipariş tavanı doğrulanmamış siparişleri de sayıyor. E-posta başına 3 açık sınır, adresi değiştirerek aşılıyor (`a1@x.de`, `+etiket`). Genel sınır 60/10 dk: ~14 saatte 5.000 sahte sipariş, 48 saat boyunca gerçek müşteri sipariş veremez. | **Doğrulandı** (sınırlar kodda). |

Düzeltme önerisi A1: `/api/admin/*` için yalnız GET/HEAD/POST kabul et (diğerleri 405); Origin ve rol denetimini `method !== 'GET'` üzerinden yap. B1: tavanı yalnız canlı siparişlerle say, doğrulanmamışlara ayrı ve düşük tavan (örn. 300) koy, en eskisini düşür, e-postayı normalize et.

## 3. Orta

| ID | Yer | Bulgu | Durum |
|---|---|---|---|
| A2 | `services/orders.mjs:100` · `db/jobs.mjs:240,258,276` | Sipariş onay belirteci iş kuyruğunda (`jobs.payload`) düz metin, iş bitince silinmiyor, 7 gün kalıyor ve 14 günlük yedeklere giriyor (rapor "yalnız özet saklanır" diyor). | **Doğrulandı** (`enqueue` belirteçle). Etki: yedeğe erişen 48 saatlik siparişleri doğrulayabilir. |
| A3 | `routes/admin-auth.mjs:26-31` · `lib/auth.mjs:124-133` | Genel giriş kilidi (15 dk'da 40 hata) yöneticiyi dışarıda bırakabilir; farklı adreslerden (IPv6) tekrarlanarak kalıcı DoS. | Ajan iddiası, güven orta. |
| B2 | `services/actions.mjs:186-198` · `services/tool-handlers.mjs:42-51` | Sipariş durumları arasında geçiş kuralı yok: `unverified→new` ve sistemin iptal ettiği `cancelled→new` mümkün; sahte sipariş doğrulamasız ciroya girer. Geri alma `new→unverified` de yapabiliyor. | **Doğrulandı.** |
| B3 | `services/assistant-gate.mjs:39-44` · `marketing/suggest.mjs:56-57` · `analytics.mjs:69` | `get_settings` "kirli konuşma" bayrağı koymuyor; ziyaretçinin gönderdiği serbest metin (`ev.b`) kampanya başlığına ve `recentChanges` özetine geçip asistan bağlamına girebilir. | Ajan iddiası, güven orta. |
| B5 | `services/orders.mjs:103-104,157-178` | Doğrulanmamış sipariş müşteri adını/sayısını değiştiriyor, `orderPlaced` ve `optIn` doğrulamadan önce çalışıyor. | Kısmen doğrulandı (`optIn` satırı). |
| C1 | `marketing/consent.mjs:25-46` · `routes/public.mjs:22-41` | `optin:true` ile herkes başkasının e-postasına izin kaydı açabilir; zaten izni olanın sepet ve adının üzerine yazar (`consent.mjs:44`). Çift onay yok. | **Doğrulandı.** |
| C2 | `services/orders.mjs:104` | `marketing:true` sipariş, doğrulanmamışken bile `optIn` çağırıyor; sipariş iptal olsa da izin kaydı kalıyor. | **Doğrulandı.** |
| C3 | `marketing/reminders.mjs:77-87` · `rules.mjs:59-61` | `{name}` (müşteri girdisi, 80 kr) konu satırına CR/LF süzülmeden giriyor. Bugün e-posta simülasyon; gerçek SMTP'de başlık enjeksiyonu (Yüksek olur). | **Doğrulandı** (süzme yok). |
| C5 | `instagram/inbox.mjs:48,117-137` · `replies.mjs:59-91` | Gelen her DM/yorum için webhook içinde sıralı Claude çağrısı; günlük AI sınırı yalnız yönetici asistanını kapsıyor. Bot yorumlarıyla maliyet DoS. | Ajan iddiası, güven yüksek. |
| C7 | `marketing/reminders.mjs:86` · `consent.mjs:30-35` | `{abmelden}` sabit `SITE/abmelden` metnine dönüşüyor; bu yolu karşılayan uç yok. İzin yalnız veren tarayıcıdan geri çekilebiliyor (GDPR md. 7/3). Saklama süresi ve "kişiyi sil/dışa aktar" ucu yok. | **Doğrulandı** (uç yok). |
| D1 | `lib/http.mjs:63` | `script-src 'unsafe-inline'`: CSP XSS'e karşı etkisiz (panel tek satır içi betik, `onerror` öznitelikleri). Bugün somut XSS bulunamadı. | Ajan iddiası, güven yüksek. |
| D4 | `index.html:9-11` · `sunum/maetech.html` | Google Fonts rıza öncesi yükleniyor (IP Google'a gidiyor; Almanya'da LG München 2022 emsali). | Ajan iddiası, güven yüksek. |
| E1/F5 | mobil `src/api/shop.ts:82,200-250` · `hooks.ts:384-414` | Sunucu JSON'u yalnız `as T`: `price`/`was`/`freeShip`/`hidden` doğrulanmıyor. Negatif/NaN fiyat sepeti "NaN €" yapar, `freeShip<=0` kargoyu bedava gösterir. Ödeme yok, zarar yanıltıcı gösterim. | Ajan iddiası, güven orta. |
| E2/F2/D6 | mobil `shop.ts:86-91` · `lib/http.mjs:63` (`img-src https:`) | Görsel adresi `http://` dahil her adres olabiliyor (override ile zehirlenirse izleme pikseli, IP sızıntısı). | Ajan iddiası. |

## 4. Düşük ve bilgi

- **A4** vekil arkasında istemci adresi Railway'e bağlı (çifte vekil olursa herkes tek anahtarda toplanır); belge (§6: önce `X-Real-IP`) ile kod (`X-Forwarded-For` son öğe) uyuşmuyor. · **A5** `/api/admin/logout` her yöntemi kabul ediyor. · **A6** yavaş gövde için kısa zaman aşımı yok. · **A7** sipariş listesi `verify.h` özetini döndürüyor.
- **B4** analiz olay alanları aralıksız. · **B6** sipariş numarası tarih + 1 bayt (256 olasılık). · **B7** `settings.approved[id]` için `Object.hasOwn` yok (`constructor` gibi kimlikler süzgeçten geçer). · **B8** günlük tavan model çağrısı başına değil mesaj başına (≈12× maliyet) ve bellekte; geri alma çakışması kullanıcıya "değişiklik yok" diye görünüyor.
- **C4** webhook tekrar penceresinde boşluklar (yorum olaylarında `t` yok). · **C6** yabancı bağlantı süzgeci şemasız (`evil.example/x`) adresi kaçırıyor. · **C8** görüntüleyen rol tam e-postaları görüyor.
- **D2** panel/vitrinde bazı `data-*`/`src` değerleri `esc()`'siz (bugün sunucu üretimli). · **D3** `href` şeması denetlenmiyor. · **D5** izin kutusu kaldırılınca ad+e-posta yine `cart-save`'e gidiyor. · **D7** parolasız `/sunum/` WaviERP paneli adresini ve rakip fiyat taramasının (`analiz.html`) tamamını açıkta bırakıyor (önceki rapor #16, karar bekliyor). · **D8** imaja gereksiz dosyalar giriyor, temel imaj özetle sabitlenmemiş, HEALTHCHECK yok. · **D9** testler istemci XSS kaçışını denetlemiyor.
- **E3** `shop.ts:201` parça yolu kodlanmıyor (zararı `scopeInfo` sınırlıyor). · **E4** `de.example.mixooutletdemo` yer tutucu kimlik. · **E5** özel şema (`mixodemo://`) başka uygulamalarca da kaydedilebilir, App/Universal Links yok. · **E6** `http://` API adresi üretim derlemesinde reddedilmiyor. · **E7** `tools/dev-proxy.mjs` tüm arayüzlerde dinliyor, `ACAO: *`. · **E8** bozuk kayıt yedeği (`mixo.v2.corrupt`) "verileri sil"de silinmiyor. · **E9/F1** arama kaydında ve kutusunda uzunluk sınırı yok. · **E10** `hooks.ts:321-327` düz nesnede `__proto__` anahtarı. · **F6** duyuru metni uzunluk/bidi süzgeçsiz. · **F7** görsel yeniden denemesi sınırsız. · **F8** `produkt/[id]` kimlik yokken `"undefined"` istiyor.

## 5. Temiz bulunanlar (özet)

SQL tamamen parametreli · statik dosya yol gezintisi kapalı, `.admin-password` ve `store/` sunulmuyor · parola scrypt + sabit süreli karşılaştırma, oturum sunucuda, çerez imzalarında ön ek ayrımı · webhook HMAC ham gövdede ve sabit sürede, imza yoksa uç kapalı · Graph token'ı `Authorization` başlığında, SSRF yok · Instagram yanıt/yayın yalnız yönetici onayıyla · sipariş fiyatı/miktarı/kargo sunucuda, belirteç 24 rastgele bayt ve 48 saat · onay (`tainted`/`gate`) mantığı çalışıyor, bekleyen onaylar sahibine bağlı · panelde yönetici içerikleri `textContent`/`esc` ile, asistan yanıtı önce kaçışlanıp sonra yalnız `**kalın**` dönüştürülüyor · mobilde `Linking`/`WebView`/`eval`/`console` yok, kasada veri girişi yok (demo), rota parametreleri doğrulanıyor, depolama okuması sıkı, `package-lock` 809 kaynağın tamamı npm registry.

## 6. Kapsam boşlukları (dürüst not)

- Mobil: `hooks.ts` 1-295 ve 346-414, `strings.ts` metinlerinin çoğu, `README.md`/`package-lock.json` gövdeleri, `(tabs)/_layout.tsx`, `ueber.tsx`, `zuletzt.tsx`, `ContextRail.tsx`, `SavedPriceNote.tsx`, `ListIntro.tsx`, `theme.ts` satır satır okunmadı (yalnız grep/kısmi).
- Sunucu: B her işleyicinin boş gövdeyle tam etkisini (A1) satır satır izlemedi; `demo/data/*.js` ürün verisi güvenlik açısından incelenmedi (üç dosyadaki anahtar-kalıbı isabeti görsel dosya adıydı).
- Canlı davranış (Railway başlıkları dışında) ve Docker imajı yeniden denenmedi. Bu rapor bir sızma testi değil, kod incelemesidir.

## 7. Önerilen sıra

1. **A1** (tek dosyada 405 kuralı) ve **B1** (tavan mantığı) — küçük, riski yüksek.
2. **B2, C1, C2, C3** — sipariş/izin akışının sahtecilik kapıları; C3 gerçek e-posta bağlanmadan kapanmalı.
3. **A2, B3** — belirteç temizliği, asistan bayrağı.
4. **C7** — abonelikten çıkış ucu ve saklama (yasal gereklilik, gerçek gönderimden önce).
5. **D1/D4** — CSP sıkılaştırma ve yazı tiplerini kendi sunucudan verme (daha büyük iş).
6. Mobil: `shop.ts`'te sayı/https doğrulaması (E1, E2, F5), arama uzunluğu (E9).

## 8. Düzeltme durumu

| ID | Durum | Ne yapıldı | Nasıl denendi |
|---|---|---|---|
| A1 | ✔ düzeltildi (yayınlanmadı) | `routes/handler.mjs`: `/api/admin/*` yalnız GET, HEAD, POST kabul eder, diğer yöntemler 405. Çıkış ucu (A5) yalnız POST. | e2e'ye PUT/PATCH/DELETE → 405 ve GET çıkış → 405 testleri eklendi; süit 120 geçti, birim 17 geçti (Node 22.22). |
| B1 | ✔ düzeltildi (yayınlanmadı) | `services/orders.mjs`: 5.000'lik tavan yalnız doğrulanmış siparişleri sayar; doğrulanmamışlara ayrı tavan (1.000), dolunca en eskisi sistemce iptal edilir. E-posta başına 3 açık sınır artık `+etiket` ve Gmail noktalarını yok sayar. | Geçici sunucuda: `evil+1..3` kabul, `evil+4` 400; Gmail `e.v.il`, `evil`, `ev.il` kabul, `e.vil` 400. Tavan dolma yolu (1.000 sipariş) çalıştırılmadı, yalnız kodla okundu. |

Not: B1'de tavan dolunca en eski doğrulanmamış sipariş iptal edildiği için, saldırgan yeterince hızlı davranırsa gerçek bir müşterinin bekleyen siparişini de düşürebilir (genel sınır 60/10 dk olduğundan 1.000'i doldurmak ≈ 3 saat). Mağazayı kapatmaktan çok daha hafif, ama sıfır değil; kalıcı çözüm istemci/IP başına doğrulanmamış sipariş sınırıdır.
