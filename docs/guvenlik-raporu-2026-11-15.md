# Outlet Demo — Güvenlik Raporu (2026-11-15)

Kapsam: `demo/` (vitrin, yönetim paneli, sunucu, Instagram ve pazarlama modülleri, Dockerfile) ve canlı site `https://web-production-a959d0b7.up.railway.app`.
Yöntem: kod incelemesi, yerel sunucuda (geçici veri klasörü, atılacak parola, API anahtarsız) gerçek isteklerle deneme, canlıda 17 zararsız GET/HEAD isteği. Kod değiştirilmedi, yayın yapılmadı, test sunucusu kapatıldı.

## 1. Sonuç

Temel korumalar sağlam: tüm `/api/admin/*` uçları oturum istiyor, sahte çerez reddediliyor, dizin dışına çıkılamıyor, hassas dosyalar servis edilmiyor ve saklanan betik yükleri ne vitrinde ne panelde çalışıyor (XSS bulunmadı). Kritik bulgu yok. Asıl zayıflık herkese açık uçlarda: hız sınırı istemcinin gönderdiği `X-Forwarded-For` başlığına güveniyor ve yerelde tek başlıkla aşıldı; bu da parola denemesini, sahte sipariş ve sahte ziyaretçi olayı basmayı sınırsız kılıyor. Sahte olaylarla vitrindeki "çok satanlar" şeridi dışarıdan belirlenebiliyor ve başkasının e-postası adına pazarlama izni kaydedilebiliyor. Demo olarak kullanılabilir; gerçek mağazaya geçmeden önce 4. bölümdeki zorunlular kapatılmalı.

Bulgu sayısı: kritik 0, yüksek 4, orta 6, düşük 7.

## 2. Bulgular

Satır numaraları `demo/` altındaki dosyalara göredir. "Yerel" = `127.0.0.1:18777` üzerindeki test sunucusu.

| # | Önem | Ne | Nerede | Nasıl kanıtlandı | Saldırgan ne elde eder | Öneri ve emek |
|---|---|---|---|---|---|---|
| 1 | Yüksek | Hız sınırı istemcinin yazdığı `X-Forwarded-For` ilk değerine göre çalışıyor | `server.mjs:503`, `:35`, `:517` | Yerel: aynı adresten 8 yanlış parola → `401×6, 429×2`. Her istekte farklı `X-Forwarded-For` ile 10 deneme → `401×10`, hiç 429 yok. Canlıda denenmedi; Railway'in bu başlığı nasıl ilettiği doğrulanmadı, canlı için **olası**. | Sınırsız parola denemesi; sipariş, olay ve sepet uçlarındaki tüm sınırların aşılması | Adresi güvenilen vekilin yazdığı değerden al (Railway'de son atlama ya da `X-Real-IP`); girişe adresten bağımsız genel kilit ekle (ör. 15 dakikada 20 hata). 1–2 saat |
| 2 | Yüksek | Kimliksiz sahte olay ve siparişle vitrin ve analiz yönlendiriliyor | `server.mjs:271-288`, `:256-266`, `:512-514` | Yerel: 3 istekle 8 ürün için sahte "sepete ekle" olayı gönderildi (`{"ok":58}` ×3). Ardından `/api/shop/home` → `bestSource: behavior`, ilk 8 ürün birebir benim seçtiklerim. Değişen `X-Forwarded-For` ile 12 sahte sipariş → `200×12` (sınır 8/dk). | Ana sayfadaki çok satanlar şeridini, panel analizini, kampanya önerilerini ve ciro rakamlarını belirler; panel sahte siparişle dolar | Olayları yalnız sunucunun verdiği imzalı ziyaretçi kimliğiyle kabul et; ziyaretçi başına ağırlık tavanı koy; siparişe e-posta doğrulaması ya da gerçek ödeme adımı. 0,5–1 gün |
| 3 | Yüksek (gerçek mağazada), demo için orta | Başkasının e-postası adına pazarlama izni kaydedilebiliyor ve başkasının izni silinebiliyor; çift onay yok | `marketing.mjs:168-175`, `server.mjs:227`, `:511` | Yerel: `POST /api/cart-save {"email":"baskasi@…","optin":true}` → `{"ok":true}`, izin sayısı 12→13. `{"email":"kurban1@…","optin":false}` → sayı 13→12 (o adresin izni sipariş sırasında verilmişti). | Gerçek gönderim açılırsa rızasız kişilere e-posta gider (UWG §7, DSGVO Md. 7); rakip müşteri izinlerini silebilir | Çift onay (doğrulama bağlantısı) ve imzalı abonelikten çıkış bağlantısı; izin kaydında zaman, kaynak, onay metni sürümü. 1 gün |
| 4 | Yüksek | Daha önce sohbete yapıştırılan API anahtarı ve yönetici parolası ifşa sayılır | Railway değişkenleri (kodda değil) | Doğrulanamadı: değiştirilip değiştirilmediğine bakılmadı (Railway'e dokunulmadı). Kod ve belgelerde gömülü sır bulunmadı. | Değişmediyse panelin tamamı ve API faturası | Anahtarı iptal edip yenile, yönetici parolasını ve `SESSION_SECRET` değerini değiştir. 15 dakika |
| 5 | Orta | Dışarıdan gelen metin, yazma yetkili asistana veri olarak ulaşıyor (dolaylı komut enjeksiyonu) | `server.mjs:400-401` (analiz ve sipariş özeti), `:445-469`, `:394` | Metnin ulaştığı kısım yerelde kanıtlandı: sahte arama olayı ve sahte müşteri adı `/api/admin/analytics` ve sipariş listesinde aynen duruyor. Modelin buna uyup uymadığı **denenmedi** (API anahtarı kullanılmadı); **olası**. | Yönetici "analize bak" dediğinde asistan fiyat, metin, sipariş durumu değiştirebilir; 20 ürüne kadar onaysız uygulanıyor | Yazan her araç için panelde onay kartı (yalnız toplu değil); araç çıktısındaki dış metni ayrı etiketle; `undo_last_change` dışındaki yazmaları onaya bağla. 0,5–1 gün |
| 6 | Orta | Güvenlik başlıkları eksik: CSP, HSTS, X-Frame-Options, Referrer-Policy yok | `server.mjs:479`, `:489` | Canlı `HEAD /` yanıtı: yalnız `x-content-type-options: nosniff`. HTTP→HTTPS yönlendirmesi var (301). | Panel başka sitede çerçeve içinde gösterilebilir (tıklama tuzağı, olası); XSS olursa ikinci savunma hattı yok | Tüm yanıtlara `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Referrer-Policy`, panel ve vitrin için CSP. 2–3 saat (CSP satır içi betikler yüzünden uzayabilir) |
| 7 | Orta | Oturum sunucuda iptal edilemiyor; tek ortak parola | `server.mjs:29-33`, `:527` | Yerel: çıkış (`200`) sonrası eski çerezle `/api/admin/settings` → `200`. Süre 12 saat. | Çalınan çerez çıkıştan sonra da 12 saat geçerli; kimin ne yaptığı ayırt edilemez | Sunucuda oturum kaydı (çıkışta sil), parola değişince tüm oturumları düşür. 2–3 saat |
| 8 | Orta | Veri dosyaları atomik yazılmıyor, bozuk dosyada sunucu açılmıyor | `server.mjs:55-61`, `:155`; `instagram.mjs:14-15`; `marketing.mjs:18-19` | Yalnız koddan, denenmedi. Her kayıtta tüm dosya `writeFileSync` ile yeniden yazılıyor; açılışta `JSON.parse` korumasız (`events.jsonl` hariç). | Yazım sırasında çökme ya da disk dolması ayarları, siparişleri ve günlüğü bozar; sunucu yeniden başlamaz | Geçici dosyaya yazıp `rename`; açılışta bozuk dosyayı yedeğe alıp devam et; orta vadede SQLite/Postgres. 0,5 gün |
| 9 | Orta | Olay, sipariş ve izin kayıtları sınırsız büyüyor; olayların tamamı bellekte | `server.mjs:270`, `:284-286`, `:59`; `marketing.mjs:168` | Yerel: 3 istek `events.jsonl` dosyasını 24 KB büyüttü; üst sınır ya da eskiyi silme kodu yok. Belleği doldurma **denenmedi**. 1 numarayla birleşince sınır yok. | Diski ve belleği doldurup siteyi düşürür | Olaylara gün ve boyut tavanı, eski kayıtları özetleyip sil; sipariş sayısına tavan. 2–3 saat |
| 10 | Orta | Node 20 kullanım ömrünü doldurdu (Nisan 2026); kapsayıcı root olarak çalışıyor | `Dockerfile:1`, `:7` | Yalnız dosyadan. `npm audit --omit=dev` → 0 açık. | Yamalanmayan çalışma ortamı açıkları | `node:22-alpine` (ya da 24), `USER node`. 30 dakika |
| 11 | Düşük | Yönetici POST uçları `text/plain` gövdeyi ve yabancı `Origin` başlığını kabul ediyor | `server.mjs:506` | Yerel: `content-type: text/plain`, `origin: https://evil.example` ile `/api/admin/announcement` → `{"ok":true}`. Tarayıcıdan sömürü denenmedi; çerez `SameSite=Strict` olduğu için güncel tarayıcıda engellenir. | Çerez koruması tek savunma; eski tarayıcıda CSRF | Yalnız `application/json` kabul et, `Origin` denetle. 30 dakika |
| 12 | Düşük | Eski bir kaydı geri almak, sonraki değişiklikleri sessizce eziyor | `server.mjs:154-155` | Yerel: duyuru A→B→C yapıldı; A kaydı geri alınınca duyuru C yerine A'dan önceki değere döndü, uyarı yok. | Saldırı değil; yanlışlıkla veri kaybı | Araya başka değişiklik girdiyse uyar ya da engelle. 1–2 saat |
| 13 | Düşük | Hatalı girdide 500 ve kesilen bağlantı | `server.mjs:480`, `:482`, `:583` | Yerel: gövde `null` → `500`; `GET /%E0%A4%A` → `500`; 300 KB gövde → bağlantı yanıtsız kesildi. Yanıtta ayrıntı sızmıyor (`{"error":"Sunucu hatası."}`), yığın izi yalnız sunucu günlüğünde. | Günlük kirliliği | Gövde tipini denetle (400), boyut aşımında 413 dön. 30 dakika |
| 14 | Düşük | `/api/admin/clear` katalogda olmayan kimlikleri de kaydediyor | `server.mjs:131` | Yerel: `{"ids":["__proto__","yok-boyle-id-1","yok-2"]}` → "2 ürün işaretlendi". Prototip kirlenmesi oluşmadı. | Yalnız yönetici; ayar dosyasını şişirir | `P.has(id)` süzgeci. 5 dakika |
| 15 | Düşük | Asistan maliyeti sınırsız büyüyebiliyor | `server.mjs:447-454`, `:573` | Yalnız koddan. Konuşma geçmişi hiç kısaltılmıyor, tur başına 12 çağrı × 16.000 belirteç, dakikada 20 istek. | Yalnız oturum sahibi; uzun sohbette fatura artar | Geçmişi son N turla sınırla, günlük harcama tavanı. 1–2 saat |
| 16 | Düşük | `/sunum/` parolasız ve içinde başka işlere ait malzeme var | `server.mjs:483-484`; `sunum/maetech.html`, `sunum/wawierp-tanitim.mp4` | Canlı: `GET /sunum/` → `200`. Yerel: `/sunum/maetech.html` → `200`. | Adresi bilen herkes sunumları görür | Bilinçli tercihse kalsın; değilse paylaşım belirteci ya da ayrı klasör. 1 saat |
| 17 | Düşük | Küçük sertleştirmeler | `server.mjs:519`, `:523`, `:541-542`; `package.json` | Yalnız koddan. Parola karşılaştırması uzunluğu ele verebilir; `/api/admin/me` parolanın tanımlı olduğunu söylüyor (canlı: `{"admin":false,"configured":true}`); CSV'de formül karakteri süzülmüyor; bağımlılık sürümü `latest`. | Çok sınırlı | İki değeri de özetleyip karşılaştır; CSV'de `= + - @` başına `'`; sürümü sabitle. 1 saat |

### Sağlam çıkanlar (denendi)

- Yetki: oturumsuz `/api/admin/settings`, `/orders`, `/assistant` → `401` (yerel ve canlı). Uydurma çerez ve imzasız çerez → `401`. İmza sabit zamanlı karşılaştırılıyor (`server.mjs:30-31`).
- Çerez: `HttpOnly; SameSite=Strict; Max-Age=43200`, HTTPS arkasında `Secure` ekleniyor.
- Dizin dışına çıkma: `/admin/../server.mjs`, `/img/..%2fserver.mjs`, `/data/..%2f.admin-password`, `/sunum/..%2fserver.mjs` → `404`.
- Hassas dosyalar: `.env`, `.admin-password`, `server.mjs`, `data.js`, `package.json`, `settings.json`, `changes.jsonl`, `store/settings.json` → `404` (yerel ve canlı).
- XSS: `<img onerror>` ve `<svg onload>` yükleri ana başlık, duyuru, demo şeridi, kategori adı, ürün başlığı, arama sorgusu, marka, müşteri adı ve Instagram mesajına yazıldı. Tarayıcıda vitrin (ana sayfa, katalog, arama) ve panelin 11 sekmesi gezildi: hiçbiri çalışmadı.
- Instagram webhook: imza zorunlu, gizli anahtar yoksa kapalı (canlı: `503 webhook kapalı`).
- Kodda ve belgelerde gömülü anahtar ya da parola yok. Bozuk JSON → `400`. TLS sertifikası geçerli, HTTP/2.

## 3. Normal kullanımda değişmesi gerekenler

- **Yedekleme:** `DATA_DIR` için otomatik yedek yok. Günlük kopya ve geri yükleme denemesi gerekli; Railway'de kalıcı disk bağlı mı doğrulanmalı (5. bölüm).
- **Günlük:** giriş denemeleri (başarılı ve başarısız, adres) hiç kaydedilmiyor. Değişiklik günlüğünde yalnız "yönetici" yazıyor, kişi yok.
- **Parola politikası:** tek ortak parola, asgari uzunluk denetimi yok, panelden değiştirilemiyor, ikinci adım yok.
- **Çok kullanıcılı yetki:** kullanıcı ve rol kavramı yok. En az "görüntüleyen", "düzenleyen", "yönetici" ayrımı ve kişiye bağlı günlük.
- **Oturum süresi:** 12 saat sabit, hareketsizlikte düşmüyor, çıkış sunucuda geçersiz kılmıyor (bulgu 7).
- **Geri alma:** bulgu 12; ayrıca günlük dosyası her geri almada baştan yazılıyor.
- **Yasal sayfalar:** `index.html` içinde Impressum, Datenschutz, AGB ve Widerruf yalnız birer kez geçiyor; ayrı sayfa görünmüyor. Gerçek mağazada dördü de zorunlu.
- **Rıza ve kişisel veri (DSGVO):** olay gönderimi istemcide rızaya bağlı (`app.js:36`, `:43`), ama sunucu rızayı denetlemiyor. Sipariş kayıtları (ad, e-posta, adres) düz JSON dosyasında, saklama süresi ve silme/dışa aktarma (Md. 15, 17) yok. İzin kaydında onay metni sürümü tutulmuyor. Claude API'ye müşteri adı ve e-postası gidiyor (sipariş özeti aracı); işleyen sözleşmesi ve gizlilik metninde belirtme gerekir.

## 4. Gerçek mağazadan önce zorunlu / demo için kabul edilebilir

**Zorunlu:**
- Bulgu 4 (sırları yenile) — demo için de hemen.
- Bulgu 1 (hız sınırı) ve giriş kilidi.
- Bulgu 2 ve 9 (sahte olay/sipariş, sınırsız büyüme).
- Bulgu 3 (çift onay) ve 3. bölümdeki DSGVO maddeleri, yasal sayfalar.
- Bulgu 5 (asistan yazmalarına onay).
- Bulgu 6 (başlıklar), 7 (oturum iptali, kişiye bağlı hesap), 8 (dayanıklı veri deposu ve yedek), 10 (Node sürümü).

**Demo için kabul edilebilir:**
- Bulgu 11–17.
- Bulgu 3, e-posta gönderimi simülasyon kaldığı sürece.
- Bulgu 16, sunumların herkese açık olması bilinçli tercihse.
- Tek parola, panel adresi yalnız güvenilen kişilerle paylaşılıyorsa.

## 5. Denenmeyen ve doğrulanamayanlar

- Canlıda parola denemesi, yük testi, veri değiştiren istek ve giriş yapılmadı. Bu yüzden bulgu 1'in canlıda geçerliliği (Railway'in `X-Forwarded-For` davranışı) doğrulanmadı.
- Asistan gerçek API ile hiç çalıştırılmadı: komut enjeksiyonuna uyup uymadığı, maliyet tüketimi ve model hata yolları denenmedi.
- Instagram canlı modu (Graph API çağrıları, gerçek webhook imzası) denenmedi; yalnız kod okundu ve kapalı olduğu görüldü.
- Railway ayarları (değişkenler, kalıcı disk, `SESSION_SECRET` tanımlı mı, günlük saklama) incelenmedi. `SESSION_SECRET` tanımlı değilse her yeniden başlatmada oturumlar düşer; disk bağlı değilse her yayında veri sıfırlanır.
- İfşa olan anahtar ve parolanın yenilenip yenilenmediği bilinmiyor.
- Çerçeve içinde panel (tıklama tuzağı) ve tarayıcıdan CSRF gerçek bir saldırı sayfasıyla denenmedi.
- Bellek ve disk doldurma, eşzamanlı yazımda dosya bozulması denenmedi (yalnız koddan).
- `mixoutlet.de` ve diğer üçüncü taraflara hiçbir istek gönderilmedi; `_fetchall.py` çalıştırılmadı.
- Görsel adresleri (Shopify CDN) ve katalog verisinin kendisi güvenilir kabul edildi, taranmadı.
- Proje klasörü `/home/wpu` kökündeki git deposunun içinde; `.admin-password` izlenmiyor ama yanlışlıkla eklenme riski ayrıca incelenmedi.

## 6. Düzeltme durumu (2026-11-15, aynı gün)

Kod `demo/` altında değiştirildi; **yayınlanmadı**. Yerel test sunucusunda (geçici veri klasörü, atılacak parola) denendi. Asistan gerçek API ile yine denenmedi.

| # | Durum | Ne yapıldı | Nasıl denendi |
|---|---|---|---|
| 1 | ✔ düzeltildi (canlıda doğrulanmadı) | Adres yalnız vekil arkasında (`RAILWAY_ENVIRONMENT` ya da `TRUST_PROXY`) başlıktan okunur: önce `X-Real-IP`, yoksa `X-Forwarded-For` **son** öğesi. Girişe adres başına (15 dk'da 10 hata) ve genel (15 dk'da 40 hata) kilit; herkese açık yazma uçlarına adresten bağımsız genel tavan | Her istekte farklı `X-Forwarded-For` ve `X-Real-IP` ile 10 yanlış parola → `401×6, 429×4`. Railway'in başlık davranışı canlıda hâlâ doğrulanmadı |
| 2 | ◐ azaltıldı | Ziyaretçi kimliğini sunucu verir ve imzalar (`mxv` çerezi, adres başına saatte 30 yeni kimlik); gövdedeki kimlik yok sayılır. Çok satanlarda bir ziyaretçi/müşteri bir ürüne sinyal türü başına bir kez sayılır ve ürün en az iki ayrı kaynaktan sinyal almalıdır. Sipariş için genel tavan (10 dk'da 60) | Tek ziyaretçi 8 ürüne 3×56 sahte olay → `bestSource: curated`; ikinci ayrı ziyaretçi eklenince `behavior`. Sahte sipariş hâlâ panele düşer: e-posta doğrulaması ya da gerçek ödeme yok |
| 3 | ◐ kısmen | Başkasının izni artık silinemez: izni veren tarayıcıya imzalı `mxc` çerezi verilir, silme yalnız o çerezle olur. İzin kaydına `confirmed:false` ve onay metni sürümü eklendi, kayıt tavanı 20.000. **Çift onay yok** (e-posta gönderimi olmadığı için); başkası adına izin hâlâ kaydedilebilir | Çerezsiz `optin:false` → kayıt duruyor; çerezli → silindi |
| 4 | ✗ sahibinde | Anahtar, yönetici parolası ve `SESSION_SECRET` yenilenmeli | — |
| 5 | ✔ düzeltildi (gerçek modelle denenmedi) | Konuşmada analiz, sipariş özeti, kampanya önerisi ya da hatırlatma önizlemesi okunduktan sonra asistanın her yazması panelde onay kartı olarak bekler (kart değişikliğin tam metnini gösterir). `ASSISTANT_APPROVAL=all` her yazmayı onaya bağlar. Dış metin taşıyan araç çıktıları etiketlendi, sistem istemi güncellendi. `undo_last_change` ve Instagram taslağı muaf | Yalnız sözdizimi ve kod okuması; API anahtarı yok |
| 6 | ✔ düzeltildi | HSTS, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, CSP (satır içi betik/stil yüzünden `'unsafe-inline'` var) | Vitrin, panel giriş sayfası ve sunum tarayıcıda açıldı, konsolda engellenen kaynak yok. Panelin oturum açılmış sekmeleri CSP altında gezilmedi |
| 7 | ✔ düzeltildi | Oturumlar sunucuda kayıtlı (`sessions.json`): çıkışta silinir, parola değişince hepsi düşer. Tek ortak parola sürüyor | Çıkış sonrası eski çerez → `401`; aynı parolayla yeniden başlatma → `200`; parola değişince → `401` |
| 8 | ✔ düzeltildi | Tüm veri dosyaları geçici dosya + `rename` ile yazılır; bozuk dosya `.bozuk-<zaman>` olarak yedeklenir, sunucu varsayılanla açılır | Bozuk `settings.json` ve `orders.json` ile açılış → `200`, yedek dosya oluştu |
| 9 | ✔ düzeltildi | Olaylar 90 gün ve 200.000 kayıtla, siparişler 5.000 ile, bekleyen onaylar 100 ile sınırlı | Yalnız koddan; doldurma denenmedi |
| 10 | ✔ düzeltildi (derlenmedi) | `node:22-alpine`, `USER node`. **Dikkat:** Railway'de `DATA_DIR`'e kalıcı disk bağlıysa disk root sahipliğinde gelir; o serviste `RAILWAY_RUN_UID=0` verilmezse sunucu veri yazamaz | Docker imajı derlenmedi |
| 11 | ✔ düzeltildi | Yönetici uçları yalnız `application/json`; yabancı `Origin` → `403` | `text/plain` → `415`, `origin: https://evil.example` → `403` |
| 12 | ✔ düzeltildi | Aynı alan sonradan değiştiyse eski kaydı geri alma `409` ile engellenir | A→B→C: B'yi geri alma → `409`; önce C sonra B → duyuru A |
| 13 | ✔ düzeltildi | Gövde `null`/dizi → `400`, bozuk yol → `400`, boyut aşımı → `413` | `400 400 413` |
| 14 | ✔ düzeltildi | Yalnız sorunlu listesindeki kimlikler işaretlenir | Sahte kimlikler → "0 ürün" |
| 15 | ✔ düzeltildi | Geçmiş son 12 turla sınırlı; günlük istek tavanı (`ASSISTANT_DAILY_LIMIT`, varsayılan 300) | Yalnız koddan |
| 16 | — karar bekliyor | `/sunum/` herkese açık kaldı | — |
| 17 | ◐ kısmen | Parola özetlenip sabit sürede karşılaştırılıyor; CSV'de formül karakteri süzülüyor; SDK sürümü `1.8.0`'a sabitlendi. `/api/admin/me` `configured` alanı duruyor (panel kullanıyor) | Giriş ve CSV denendi |

Ek: giriş denemeleri (başarılı, başarısız, kilitli; adresle) sunucu günlüğüne yazılıyor. Rıza geri çekilince `mxv` çerezi tarayıcıda siliniyor.

Açık kalanlar: 4, 16, çift onay (3), sipariş doğrulaması (2), 3. bölümdeki maddeler (yedekleme, kişiye bağlı hesap, yasal sayfalar, DSGVO).
