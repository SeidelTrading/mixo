# DOCK / Mixo genel konsey raporu

15 Kasım 2026 · Yöntem: 5 ajanlı konsey (mimari, kod, güvenlik, ürün, ticari). Yalnızca kod ve belge okuma; hiçbir şey çalıştırılmadı, dış istek yok, dosya değişmedi.
Doğrulama notu: ajan çıktıları iddia sayıldı. Güvenlik bulguları G1, G2, G3, G7, G8 ile mimari iddialar (Amazon kodu yok, `SESSION_SECRET`, `.dockerignore`) kodda ayrıca kontrol edildi. Doğrulanamayanlar "doğrulanmadı" diye işaretli.

## 1. Yönetici özeti

1. Elimizde çalışan bir **demo-sınıfı yönetim paneli** var: SQLite, kalıcı iş kuyruğu, yedek, kişiye bağlı hesaplar, sipariş doğrulaması, Claude asistanı, kampanya önerisi, Instagram modülü (simülasyon), salt okunur mobil uygulama.
2. Güvenlik durumu demo için **iyi**: Kritik/Yüksek bulgu yok; önceki turların düzeltmeleri kodda gerçekten var. 10 Orta/Düşük bulgu açık.
3. Kod kalitesi **6,5/10**. Asıl sorun bakım: `server.mjs` 799 satır/104 KB, 300 karakteri aşan satırlar, test yalnız sunucu e2e.
4. **Amazon sipariş entegrasyonu kodda yok** (`server.mjs`, `db.mjs`, `instagram.mjs`, `marketing.mjs` içinde "amazon" geçmiyor; doğrulandı). Başka bir oturumun işi bu depoya girmemiş olabilir.
5. Gerçek satış için eksikler: ödeme, gerçek e-posta, Shopify/JTL iki yönlü akış, anahtar yenileme, disk dışı yedek, izleme, hukuk teyitleri.
6. Ticari tarafta çalışan bir kanal var (737 sipariş, 57.813 €, sepet ~78 €, bir aylık). Teklif makul fiyatlı; teklif içi hesap sahipliği çelişkisi ve eksik kalemler düzeltilmeli.
7. En büyük risk teknik değil **bağımlılık**: hesaplar ve erişimler Lady Empire GmbH'de, tek kişi riski sürüyor.

## 2. Neler yaptık (envanter)

| Özellik | Durum | Kanıt |
|---|---|---|
| Yönetici girişi: scrypt, roller, DB'de oturum, giriş kilidi | Çalışıyor | `server.mjs:40-69, 659-670` |
| SQLite katmanı (WAL, `user_version`), yedek (`VACUUM INTO`, son 14) | Çalışıyor | `db.mjs:99-106` |
| Kalıcı iş kuyruğu, yeniden deneme, açılışta kurtarma | Çalışıyor | `server.mjs:774-795` |
| Katalog (~45 bin ürün), vitrin, olay toplama, analiz | Çalışıyor | `server.mjs:336-397` |
| Görsel sorun onay kuyruğu, düzenleme, geri alma günlüğü | Çalışıyor | `server.mjs:107-150` |
| Claude yönetici asistanı (~20 araç, toplu işlemde onay) | Çalışıyor (API anahtarı gerekir) | `server.mjs:405-583` |
| Sipariş oluşturma + e-posta doğrulama bağlantısı | Çalışıyor; ödeme yok, e-posta simülasyon | `server.mjs:648-658` |
| Kampanya önerileri | Çalışıyor; veri azsa üretmiyor | `marketing.mjs:36-71` |
| Sepet/yeniden sipariş hatırlatması | Simülasyon | `marketing.mjs:2` |
| Instagram: taslak, onay kuyruğu, yanıt taslağı | Simülasyon; webhook kodu var, canlıda denenmedi (doğrulanmadı) | `instagram.mjs` |
| Mobil (Expo/RN): ana sayfa, kategori, arama, ürün, favori, sepet | Çalışıyor, salt okunur | `mobile/src/app/**` |
| Mobil kasa | Demo; sunucuya sipariş gitmiyor | `mobil-uygulama` §4 |
| Amazon sipariş entegrasyonu | **Kodda yok** | grep boş |
| Shopify'a geri yazma, JTL-Wawi eşitleme, pazaryeri feed'leri | Plan/analiz | `site-karari`, `hedef-siteler` |
| Analiz belgeleri (güvenlik, kod, pazarlama, Hepsiburada, mobil, teklif PDF) | Hazır | `docs/` |

Not: Hepsiburada belgesi arayüz analizi; satıcı fırsatı analizi değil.

## 3. Mimari

**Özet:** Modüler olmayan tek süreçli monolit. Tek `http.createServer`, tek SQLite dosyası, `setInterval` ile kuyruk. `instagram.mjs` ve `marketing.mjs` `initX({...~30 bağımlılık})` ile enjekte ediliyor.

**Güçlü:** tutarlı canlı yedek, kuyrukta geri çekilme + kurtarma, simülasyon/canlı ayrımı (Instagram, e-posta), yetkisiz Docker kullanıcısı, SIGTERM'de düzgün kapanış.

**Sorunlar:**
- Y: `server.mjs` tek dosya; yönlendirici 628-772 arası tek fonksiyon. Öneri: `routes/`, `services/`, `jobs/`.
- Y: `DATA_DIR` kalıcı diskte değilse her dağıtımda DB + yedek silinir; yedek aynı diskte (`Dockerfile:6-9`).
- O: Siparişler (5000) ve olaylar (200 bin) bellekte; açılış süresi/bellek veriyle büyür (`server.mjs:95, 340`).
- O: `settings` tek JSON belge olarak yazılıyor; eşzamanlı yönetici düzenlemesinde son yazan kazanır (`server.mjs:103`).
- O: Kuyruk `setInterval` ile; ikinci kopya aynı işi çift çalıştırabilir (iş `claim` ile kilitli olduğu için etki sınırlı olabilir; doğrulanmadı).
- O: Mobil kargo/eşik sabitleri sunucudan kopya (`config.ts:12-13`, `shipping.ts:4`).
- D: Canlı Railway adresi birden çok yerde sabit (`server.mjs:99`, `instagram.mjs:17`, `marketing.mjs:16`, `config.ts:8`).
- D: `SESSION_SECRET` yoksa rastgele üretiliyor (`server.mjs:36`, doğrulandı). Oturumlar DB'de olduğu için etkisi kısmen sınırlı, ama imzalı çerezler (`mxv`, `mxc`) her yeniden başlatmada geçersiz olur.

**Ölçek tavanı:** Tek süreç, tek yazıcı. Günde birkaç bin siparişe kadar yeterli (tahmin, ölçülmedi). PostgreSQL + dış kuyruk şu durumlarda gerekir: ikinci kopya, sürekli webhook/senkron yükü, sıfır kesintili dağıtım, dakika düzeyinde geri dönüş hedefi.

**Hedef mimari:** modüler monolit; Amazon/Instagram/e-posta için ortak `ChannelAdapter` (simülasyon ve canlı sürücü aynı arayüz, dış çağrılar yalnız kuyruk işi); repository katmanı (PostgreSQL'e geçiş tek dosya); disk dışı şifreli yedek; `SESSION_SECRET`/`DATA_DIR` doğrulanmadan açılmama; mobil için `/api/config` + OpenAPI sözleşmesi.

## 4. Kod kalitesi

**Genel: 6,5/10.** Doğruluk 7 · Hata yönetimi 7 · Test 5 · Okunabilirlik 5 · Bakım 5.

Kanıt (seçilmiş):
- O `mobile/src/api/shop.ts:55-60,83-96`: `getConfig` hatada boş yapılandırma döndürüyor (kod `cfgP = null` ile önbelleği sıfırlıyor, yani kalıcı değil; yine de kullanıcı hatalı veriyi o istekte görür).
- O `server.mjs:446,550`: ajan, `undo_last_change`'in onay kapısından geçmediğini söylüyor; **güvenlik ajanı ise `:551`'de kapıdan geçtiğini doğruluyor. Çelişki; güvenlik ajanının okuması daha ayrıntılı, doğrulanmadı.**
- O `test/e2e.mjs`: 11 senaryo; asistan onay kapısı, `/api/cart-save` çerez sahipliği, webhook imza/boyut, `limited()` için test yok.
- O mobil ve `app.js`'te birim testi yok; `makeMatcher`, `shippingFor`, sepet/favori store saf mantık, kolay test edilir.
- D `instagram.mjs:148`: aşırı büyük gövde 413 yerine genel hata döndürüyor.
- D `server.mjs:274`: her sipariş oluşturmada tüm liste taranıyor.
- D `mobile/src/api/shop.ts:106`: `as Product` çalışma zamanı doğrulaması yok; `suche.tsx:36`, `kategorie/[key].tsx:51` boş `catch {}`.
- D `server.mjs:70-72`: hız sınırı ve giriş kilidi aynı deseni ayrı ayrı uyguluyor.

Önceki incelemeden doğrulananlar: webhook `await` + `unhandledRejection` (`server.mjs:641, 797`), `limited()` reddedilen çağrıyı saymıyor (`:72`), `optin:false` çerez açığı kapandı, çift yayın engeli (`instagram.mjs:210,232`), statik akış hatası. Mobildeki bazı bulgular (kargo eşiği) hâlâ açık. Testler çalıştırılmadı.

## 5. Güvenlik (önem sıralı)

Kritik: yok · Yüksek: yok (güvenlik ajanı; kod okuması, çalışma zamanı denemesi yok).

| ID | Önem | Yer | Sorun | Düzeltme | Doğrulama |
|---|---|---|---|---|---|
| G1 | Orta | `server.mjs:64-66` | Vekil arkasında önce `X-Real-IP` okunuyor; Railway bu başlığı ezmiyorsa istemci yazabilir → adres başı sipariş/giriş sınırı atlanır, `hits` haritası büyür | Yalnız XFF son öğesi ya da Railway davranışını canlıda doğrula | Kod doğrulandı; Railway davranışı **doğrulanmadı** |
| G2 | Orta | `server.mjs:651`, `marketing.mjs:170-181` | Doğrulanmamış e-posta için `mxc` sahiplik çerezi ve izin kaydı oluşuyor (çift onay yok) | Çerez/izin yalnız `confirmOrder` veya çift onay sonrası | Doğrulandı. Hafifletici: kayıtlar `confirmed:false` ile açılıyor; "yalnız confirmed alıcı olur" kuralı ajan tarafından tam doğrulanmadı |
| G3 | Orta | `db.mjs:29-31, 102-107` | DB ve yedekler şifresiz, varsayılan izin, aynı diskte; scrypt özetleri, kişisel veri, oturum, onay belirteçleri (`jobs.payload`) içinde | 0600 izin, şifreli disk dışı kopya, belirteci iş yükünden çıkar | `chmod`/mode yok: doğrulandı |
| G4 | Düşük | `server.mjs:557, 751-754` | Asistan konuşmaları ve bekleyen onaylar kullanıcıya bağlı değil | Anahtar `me.id:cid` | Ajan |
| G5 | Düşük | `instagram.mjs:140-170` | Webhook imzasında zaman damgası yok; tekrar denetimi yalnız son 500 kayıt | Süreli kalıcı `ext` listesi | Ajan |
| G6 | Düşük | `instagram.mjs:133-135, 230-231` | Müşteri metninden üretilen taslağa yabancı bağlantı girebilir; gönderimde yalnız fiyat denetimi | `reply-send`'de SITE dışı adresleri reddet | Ajan |
| G7 | Düşük | `server.mjs:631, 348` | `Secure` bayrağı `x-forwarded-proto`'ya bağlı | Üretimde her zaman `Secure` | Doğrulandı |
| G8 | Düşük | `.dockerignore` | `.env*`, `sunum/`, `ara/` imaj dışı değil; `sunum/` herkese açık | `.dockerignore`'a ekle | Doğrulandı (listede yok) |
| G9 | Düşük | `server.mjs:29,47,663` | `ADMIN_PASSWORD` alt sınırı yok; genel kilit DoS yolu | ≥12 karakter zorunlu | Ajan |
| G10 | Düşük | `server.mjs:604, 36` | CSP'de `'unsafe-inline'`; `SESSION_SECRET` sessiz rastgele | Nonce CSP; üretimde secret zorunlu | `:36` doğrulandı |

Doğrulanan olumlu noktalar: scrypt + sabit sürede karşılaştırma + sahte özet, DB'de iptal edilebilir oturum, webhook imzası sabit sürede, JSON/Origin/415 denetimi, gövde sınırı, statik yol beyaz listesi, `Object.create(null)`, CSV formül süzgeci, `USER node`, `.admin-password` git ve Docker dışında (izni 0600, içeriği okunmadı).

Bakılamayan: Railway başlık davranışı, canlı ortam değişkenleri, **eski açık: sızan Claude anahtarı/yönetici parolası/`SESSION_SECRET` hâlâ yenilenmedi (kararlar #3)**, `mobile/tools/dev-proxy.mjs`, Amazon/Shopify webhook (kod yok).

## 6. Nereye götürebiliriz

**Kısa (0-4 hafta)**
- Anahtar yenileme, disk dışı şifreli yedek, Sentry (değer yüksek, efor S)
- Shopify test mağazası + Admin API erişimi; panelden Shopify'a yalnız yazma (fotoğraf/başlık düzeltmesi, CSV yedeği) (yüksek, M)
- E-posta sağlayıcısı, SPF/DKIM/DMARC, çift onay (yüksek, M) — G2'yi de kapatır
- Mobilde sunucu tarafı arama ve sayfalama ucu (orta, S)
- Güvenlik G1, G3, G7, G8, G10 düzeltmeleri (yüksek, S)

**Orta (1-3 ay)**
- Mobil: Storefront API, Checkout Kit, Customer Account (yüksek, L)
- JTL-Wawi → panel stok/fiyat eşitleme; EAN ve marj alanları (yüksek, L)
- Merchant Center + Meta katalog feed'i, GA4 rıza (yüksek, M)
- Instagram canlı pilot ("önce sor" + insana devir kuralı) (orta, M)
- Kaufland pilotu: EAN'lı kablo/ağ ürünleri (yüksek, M)
- `server.mjs` bölünmesi + ChannelAdapter + birim testleri

**Uzun (3-12 ay)**
- Çok kanallı fiyat/stok motoru: Amazon.de, Otto, eBay, Kaufland (yüksek, XL); Otto kabul koşulu doğrulanmadı
- Fiyat izleme, kural bazlı yeniden fiyatlama, PAngV 30 gün geçmişi (yüksek, L)
- Toner/mürekkep için yazıcı modeline göre yeniden sipariş otomasyonu (yüksek, M)
- PostgreSQL + dış kuyruk (ikinci kopya gerekince)
- Türkiye pazaryerleri (Trendyol/N11/Hepsiburada): Almanya ile ilgisi ve satıcı erişimi doğrulanmadı

Riskler: sahip (Lady Empire) erişimlerine bağımlılık, tek kişi riski, hukuk teyitleri (Abmahnung/DSA/UWG/yapay zekâ bildirimi), pazaryeri komisyonu marjı silebilir (komisyon oranları üçüncü taraf, doğrulanmadı), mobilin satışa katkısı ölçülmedi.

## 7. Ticari fırsatlar

- **Temel veri:** 15.10–14.11 arası 737 sipariş, 57.813 €, sepet ~78,4 € (`site-karari` §4a). 78,4 €'nun KDV dahil olup olmadığı belirsiz; dahilse net sepet ~66 €. Marj, tekrar sipariş oranı ve reklam tavanı bilinmiyor; reklamın kârlılığı bugün **bilinmiyor**.
- **Fiyat:** Tamamlanan işler 14.500 € (≈238–345 €/gün, teklif günlüğü 350 €'nun altı). Kurulum 6.000 € ≈ 17 gün × 350 €, makul. Aylık 750 € ≈ 2,1 iş günü; reklam bütçesi 300–500 € ile oran yüksek.
- **Öneri (varsayım):** temel paket 750 € yalnız reklam+feed+rapor; tam Instagram yönetimi ayrı kalem (500–900 €/ay); mobil sabit fiyatlı ayrı proje; kanıtlanmış artımlı cirodan %2–3 performans payı.
- **Konumlandırma:** bugün satılabilir olan **hizmet**; ürün olarak panel/WawiERP ikinci bir canlı müşteri olmadan satılabilir sayılmaz. Hedef: Shopify + JTL kullanan 5–50 bin SKU'lu Alman outlet/Restposten satıcıları (pazar büyüklüğü doğrulanmadı).
- **Pazaryeri:**

| Pazar | Fırsat | Efor | Risk |
|---|---|---|---|
| Kaufland | Kanal zaten bağlı; komisyon %7–14 (doğrulanmadı) | Düşük | Parfümde fiyat 2,8× yüksek; marka itirazı |
| idealo | Yalnız EAN'lı kablo/yazıcı/sarf | Orta | Tıklama başı maliyet doğrulanmadı |
| Amazon, eBay, OTTO, METRO | Kanallar atanmış/görünüyor | Düşük–orta | Fiyat eşitliği sorusu açık |
| Trendyol, N11, Hepsiburada, Ozon | WawiERP pilotu kapsamı | Yüksek | İstanbul stoğu/gümrük; doğrulanmadı |

- **Ticari riskler:** teklifte Google/Meta hesapları DOCKS'a ait, kararlarda Lady Empire'a (çelişki); BFSG, yapay zekâ bildirimi, AVV, PAngV teyitsiz; OSS/KDV (Hollanda sitesi) bilgisi yok; 40 € sepet varsayımı eskidi (reklam maliyeti 25–63 €, marjın bıraktığı 12–27 €'nun çoğu zaman üstünde).

## 8. Konseyin ayrıştığı noktalar

1. **Genel risk algısı:** Güvenlik ajanı Kritik/Yüksek bulmadı; mimari ajan "disk silinirse veri gider" ve tek dosya borcunu **Yüksek** saydı. Uzlaşma: güvenlik demo için iyi, **operasyonel dayanıklılık** (yedek, izleme) ayrı bir Yüksek öncelik.
2. **`undo_last_change` onay kapısı:** kod ajanı kapıdan geçmiyor dedi (`:446,550`), güvenlik ajanı geçiyor dedi (`:551`). Doğrulanmadı.
3. **SESSION_SECRET:** mimari ajan "doğrulanmadı, etkisi kısmi" dedi; güvenlik ajanı Düşük. Kodda varsayılan rastgele: doğrulandı, etkisi çerezlerle sınırlı.
4. **Teklif fiyatı:** ticari ajan fiyatı makul buluyor; mimari/ürün ajanları kapsamın (tam Instagram, mobil, Shopify yazma) fiyatsız kaldığını gösteriyor. Uzlaşma: 750 € temel paket doğru, kapsam dışı kalemler ayrı fiyatlanmalı.
5. **Öncelik: pazaryeri mi mobil mi?** Ürün ajanı mobili Orta vadeye koydu ve değeri ölçülmemiş buldu; ticari ajan Kaufland/Merchant Center'ı önde tutuyor. Rapor sıralaması ticari görüşü izliyor.
6. **Ürün ajanı sınırı:** `db.mjs`, yedek ve kuyruk kodunu okumadı (belgeye dayandı); mimari ajan bunları kodda doğruladı.

## 9. Önceliklendirilmiş ilk 10 aksiyon

1. Sızan/eski sırları yenile: Claude API anahtarı, yönetici parolası, `SESSION_SECRET`; üretimde `SESSION_SECRET` yoksa açılmayı reddet.
2. Kalıcı disk doğrula ve şifreli disk dışı yedek kur (S3/R2); DB/yedek dosyalarına 0600 izin.
3. Sentry/izleme ekle (panel + mobil).
4. G1: `X-Real-IP` güvenini Railway'de doğrula veya XFF son öğesine geç; G7: `Secure` her zaman; G8: `.dockerignore` (`.env*`, `sunum/`, `ara/`).
5. E-posta sağlayıcısı + SPF/DKIM/DMARC + çift onay; G2'yi kapat (çerez/izin yalnız doğrulamadan sonra).
6. Teklifi güncelle: hesap sahipliği (Lady Empire), tam Instagram ve mobil ayrı kalem, performans payı; marj, KDV ve bütçe tavanını iste.
7. Shopify test mağazası + Admin API; panelden Shopify'a yalnız yazma ile gerçek değer üret.
8. Hukuk teyidi (BFSG, PAngV, OSS, yapay zekâ bildirimi) + AVV imzaları; insana devir kuralını tanımla.
9. `server.mjs`'i bölmeye başla; `e2e`'ye asistan onay kapısı, `cart-save` sahipliği, webhook imza/boyut, `limited()` testleri ekle; mobil saf mantığa birim test.
10. Kaufland pilotu (EAN'lı kablo/ağ ürünleri) + 500 € test bütçesiyle Google Shopping; parfüm fiyatlarını denetle.

---
Sınırlar: testler ve sunucu çalıştırılmadı; Railway canlı davranışı, canlı ortam değişkenleri ve `mobile/tools/dev-proxy.mjs` incelenmedi; Amazon entegrasyonu bu depoda bulunamadı (başka dalda/oturumda olabilir, doğrulanmadı).

## 10. Ek: kod kalitesi çalışması (15.11.2026, rapordan sonra)

Rapordaki 6,5/10 puanı üzerine `demo/` için kalite aşamaları uygulandı. Ayrıntı: `demo/ARCHITECTURE.md`.

| Ölçüt | Önce | Sonra |
|---|---|---|
| `server.mjs` | 799 satır, 104 KB, tek yönlendirici | 28 satır; `lib/`, `services/`, `routes/`, `jobs/` (döngüsel içe aktarma yok) |
| Lint / biçim / tip | yok | ESLint 9, Prettier, `tsc --checkJs`: hepsi temiz |
| Testler | 70 uçtan uca (yerelde Node 20 ile çalışmıyordu) | 86 uçtan uca + 12 birim; Node 22 ile yeşil |
| Yeni uçtan uca kapsam | | webhook (doğrulama, imza, boyut), sepet izni sahipliği (`mxc`), CSRF/içerik türü |
| CI | yok | `.github/workflows/ci.yml` (lint, biçim, tip, birim, uçtan uca, `npm audit`) |
| Asistan `runTool` | 328 satırlık `switch` | araç tablosu (`tool-handlers.mjs`), tanım–işleyici eşleşme testi |

İkinci tur (aynı gün): `db.mjs` 451 → 95 satır (`db/` altında 8 modül); `initInstagram` (700 satır) ve `initMarketing` (634 satır) bağlam nesnesiyle gruplara bölündü (`instagram/`, `marketing/`); yönetici uçları `GET`/`POST` route tablosuna çevrildi; kopya `EMAIL_RE` tekilleştirildi; Instagram/pazarlama yönetici uçları için 9 yeni uçtan uca denetim (toplam 95 uçtan uca + 12 birim); ESLint kuralları sıkılaştırıldı (`eqeqeq`, `prefer-const`, `no-var`, dosya/işlev uzunluğu uyarıları). `npm run check` yeşil.

Dürüst durum: **9,5 henüz yok; kendi tahminim ~8,5–9 (ölçülmüş bir puan değil).** Kalan borç ESLint uyarıları olarak görünür: `app.js` (1749 satır, tek async IIFE; 24+ paylaşılan değişken ve tarayıcı testi olmadan güvenle bölünemedi), `instagram/admin.mjs` ve `marketing/suggest.mjs` içindeki 190–270 satırlık işlevler. Yapılmayanlar: bellekteki sipariş/olay listelerinin depo katmanına taşınması, `settings`'in alan bazlı yazımı, mobil (`mobile/`, başka oturumun işi olduğu için dokunulmadı) test/tip düzeltmeleri, güvenlik bulguları G1–G10. Değişiklikler commit edilmedi.

### Güvenlik düzeltmeleri (üçüncü tur, aynı gün)

| ID | Durum |
|---|---|
| G1 | Düzeltildi: istemci adresi için önce vekilin eklediği son `X-Forwarded-For` öğesi, `X-Real-IP` yalnız yedek. Testli. Railway'in başlıkları gerçekte nasıl yazdığı **canlıda doğrulanmadı** |
| G2 | Düzeltildi (sipariş yolu): doğrulanmamış siparişte `mxc` çerezi verilmez, e-posta doğrulama bağlantısından sonra verilir. Sepet yolunda (`/api/cart-save`) çift onay hâlâ yok; kayıtlar `confirmed:false` ile açılır |
| G3 | Kısmen: `mixo.db`, `-wal`, `-shm` ve yedekler 0600, yedek klasörü 0700 (testli). Şifreleme ve disk dışı kopya ile `jobs.payload` içindeki belirteç **açık** |
| G4 | Düzeltildi: asistan konuşma anahtarı kullanıcıya bağlı, bekleyen onayı yalnız sahibi ya da yönetici onaylayabilir (testsiz; Claude API anahtarı gerektirir) |
| G5 | Açık: webhook zaman damgası/kalıcı tekrar listesi yapılmadı |
| G6 | Düzeltildi: `reply-send` mağaza dışı bağlantı içeren taslağı 409 ile reddeder (testli) |
| G7 | Düzeltildi: `NODE_ENV=production` iken `Secure` her zaman eklenir |
| G8 | Kısmen: `.env*` imaj dışı; `sunum/` bilerek bırakıldı (canlı sayfalar) |
| G9, G10 | Uyarıya çevrildi: kısa `ADMIN_PASSWORD` ve eksik `SESSION_SECRET` açılışta uyarı verir; sert hata verilmedi çünkü canlı dağıtımı düşürebilir. Nonce tabanlı CSP yapılmadı |

Testler: 104 uçtan uca + 12 birim, hepsi yeşil. Commit edilmedi.

### Vitrin (`app.js`) bölünmesi (dördüncü tur, aynı gün)

Önce özgün `app.js` üzerinde bir Playwright/Chromium duman testi yazıldı (`demo/test/browser.mjs`, 16 denetim: katalog, arama, öneriler, filtre ve adres, sepet, merkliste, ürün penceresi, demo kasa ile sipariş, kalıcılık, sayfa hatası yok). Sonra 1794 satırlık tek async IIFE, 11 klasik betik bölümüne (`app/*.js`, 83–343 satır) ayrıldı; bölümleri `app.js` (20 satır) sırayla çalıştırır. Yeniden atanan 25 paylaşılan değişken `Ctx.S` altına taşındı (AST ile, kapsam duyarlı). Klasik betik olduğu için `file://` desteği korundu. Bölme sonrası 16/16 tarayıcı denetimi, 104 uçtan uca ve 12 birim test yeşil; CI'a `test:browser` adımı eklendi.

Kalan uyarılar (ESLint, toplam 10): bölüm sarmalayıcıları 170–340 satır (en büyüğü `app/events.js`, içinde 167 satırlık tıklama işleyicisi), `instagram/admin.mjs` ve `marketing/suggest.mjs`. Tarayıcı testi yalnız Chromium'da ve Almanca arayüzde, mobil görünüm ve yönetici paneli (`admin/index.html`) kapsam dışı. Commit edilmedi.

### Beşinci tur: kalan uyarılar ve kapsam

ESLint uyarıları 10 → 0: vitrin 22 bölüme (en büyüğü <150 satır) ayrıldı, 27 dallı tıklama işleyicisi `CLICK_ACTIONS_1-3` tablolarına çevrildi, `instagram/admin` üç dosyaya, `marketing/suggest` iki dosyaya + `aggregate` yardımcısına bölündü. Testler: 17 birim (asistan onay kapısı: küçük yazma uygulanır/geri alınır, BULK_LIMIT üstü ve dış kaynaklı metinde onaya düşer), 104 uçtan uca, 16 tarayıcı. Birleşik satır kapsamı (c8, birim + uçtan uca, sunucu alt süreci dahil, `npm run test:coverage`) ≈ %70, dal kapsamı ≈ %71.

Yapılmayanlar: siparişlerin ve olayların bellekten depo katmanına taşınması ve `settings`'in alan bazlı yazımı (davranış değiştiren, ölçek sınırı belgeli), mobil (`mobile/`, başka oturumun commit edilmemiş işi), G5, `sunum/` koruması, CI'ın ilk gerçek koşusu.
