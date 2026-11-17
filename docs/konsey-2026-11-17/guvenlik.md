# Güvenlik denetimi — Mixo demo (11 yeni iş modülü)

**Tarih:** 2026-11-17
**Denetçi:** inceleme konseyi, güvenlik üyesi
**Sistem:** `/home/wpu/Desktop/Urunler/Mixo/demo` — Node 22.14, ESM, tek süreç, `node:sqlite`

## Kapsam

Okunan dosyalar: `ARCHITECTURE.md`, `routes/handler.mjs`, `lib/auth.mjs`, `lib/http.mjs`, `lib/store.mjs`,
`lib/config.mjs`; yeni servisler `services/{pool,tenants,feed,rules,price-strategy,shipping,refunds,support,dashboard,ads,insights,b2b,staff}.mjs`;
yeni uçlar `routes/admin-{pool,tenants,feed,rules,shipping,refunds,support,dashboard,ads,insights,b2b}.mjs`;
ayrıca `db/pool.mjs`, `db/export.mjs`, `db/backup.mjs`, `marketing/consent.mjs`, `services/analytics.mjs`.

Kapsam dışı: `mobile/`, vitrin istemcisi (`app/`), asistan araç zinciri, Instagram/pazarlama modüllerinin eski kısımları.

## Yöntem

Yalnız okuma ve çalıştırma yapıldı; hiçbir dosya değiştirilmedi, commit atılmadı.

1. `node --no-warnings --test test/unit*.mjs` → **98/98 geçti**.
2. `node test/e2e.mjs "$PWD"` → **153 geçti, 0 kaldı**.
3. Geçici DATA_DIR ile canlı sunucu (port 18897) açılıp saldırgan senaryoları HTTP üzerinden denendi:
   `duzenleyen` rolünde bir hesap açıldı ve yeni uçların tamamı bu rolle çağrıldı; kiracı izolasyonu,
   prototip kirlenmesi (`__proto__`), XML enjeksiyonu ve toplu yükleme hacmi ölçüldü.
4. Para ve prototip bulguları ayrıca süreç içi betikle (servisleri doğrudan import ederek) doğrulandı:
   `Object.prototype` kirlenmesi ve `refunds.settle` yarış davranışı ölçüldü.

Doğrulama betikleri: `/tmp/claude-1000/-home-wpu--claude-spares-spare-vE7sF1/c1da5ee5-4384-4912-ab29-7360fe5b5727/scratchpad/`
(`probe.mjs`, `proto.mjs`, `settle.mjs`).

---

## Bulgular

| # | Önem | Konu | Dosya:satır | Ne olur | Öneri |
|---|---|---|---|---|---|
| 1 | **Kritik** | Kiracı izolasyonu hiç uygulanmıyor | `services/tenants.mjs:150-156` (`tenantOfUser`, `scopeOf`); `routes/admin-{pool,feed,dashboard,refunds,support,b2b,tenants}.mjs` tamamı | `scopeOf`/`tenantOfUser` yazılmış ama **hiçbir uç bunları çağırmıyor** (grep: yalnız `tenants.mjs` içinde geçiyor). Doğrulandı: "KiraciB"ye atanmış `editor1` hesabı `GET /api/admin/tenants` ile `KiraciA, KiraciB` ikisini birden ve her ikisinin anahtar özetini gördü. Aynı şekilde havuz, feed, pano, iade, destek ve B2B uçları kiracıya göre süzülmüyor; tek veritabanı tüm kiracılara ortak. | Her yeni uçta `c.me.username → scopeOf()` ile kiracı belirlenip tüm okuma/yazma bu kimliğe süzülmeli; kayıtlara `tenantId` alanı eklenmeli. `yonetici` için "hepsini gör" açık bir karar olarak kodda durmalı. Bu düzeltilene kadar çok kiracılı kullanıma açılmamalı. |
| 2 | **Kritik** | Kiracı API anahtarı kasası `duzenleyen` rolüne açık | `routes/handler.mjs:118`; `routes/admin-tenants.mjs:62-75` | Yetki kapısı yalnız `^/api/admin/(users\|backups?\|jobs)$` yollarını yöneticiye kısıtlıyor. Doğrulandı: `duzenleyen` rolündeki `editor1`, `POST /api/admin/tenants/create` (201) ve `POST /api/admin/tenants/key {action:"set"}` (200) çağrılarını yaptı; aynı rol `action:"revoke"` ile Amazon/Kaufland entegrasyon anahtarını iptal edip tüm entegrasyonu durdurabilir. | `tenants/*` yazma uçları (özellikle `key`) yönetici rolüne kısıtlanmalı. Kapı tek regex yerine uç→rol tablosu hâline getirilmeli. |
| 3 | **Yüksek** | İade ödemesi: `duzenleyen` rolüne açık, dört göz yok | `routes/admin-refunds.mjs:51`; `services/refunds.mjs:219-223` | `const approvedBy = body.approve === true ? by \|\| 'yönetici' : undefined;` — onay, isteği atan oturumun kendisinden üretiliyor. Doğrulandı: 500 €'luk iade önce `pending_approval`'a düştü, ardından **aynı `duzenleyen` kullanıcı** `{approve:true}` gönderince `refunded` oldu ve ödeme kaydı üretildi. 200 €'luk `APPROVAL_THRESHOLD` pratikte hiçbir şey engellemiyor. | `refunds/settle` yönetici rolüne kısıtlanmalı; onaylayanın iadeyi talep eden/işleyen kişiden farklı olması zorunlu tutulmalı (`r.events` içindeki `by` ile karşılaştır). Gerçek ödeme sağlayıcısına bağlanmadan önce bu şart. |
| 4 | **Yüksek** | Global prototip kirlenmesi (`Object.prototype`) | `services/b2b.mjs:222-226`; `services/dashboard.mjs:135-138` | `d.offers[offerId]` / `d.targets[cat]` doğrudan indeksleniyor; `__proto__` anahtarı `Object.prototype`'ı döndürüyor ve truthy olduğu için "yok" denetimlerini geçiyor. Doğrulandı: `POST /api/admin/b2b/deal {offerId:"__proto__",buyerId:"__proto__",qty:7}` → **201**, `o.remaining -= q` ile `Object.prototype.remaining = NaN`; `POST /api/admin/dashboard/consume {cat:"__proto__"}` → **200**, `Object.prototype.left = NaN`. Süreç içi ölçüm: `({}).remaining === NaN`, `'remaining' in {} === true`. Kirlenme süreç yeniden başlatılana dek kalıcı ve tüm modülleri etkiler; ayrıca sahte bir B2B anlaşması (`quote` alanları `null`) kalıcı belgeye yazıldı. | Belge içi haritalarda `Object.hasOwn(map, key)` kullanılmalı (`tenants.mjs:49-53` içindeki `must()` deseni doğru örnek) ya da `Object.create(null)` / `Map` tercih edilmeli. Kimlik alanları biçim denetiminden (`/^[\w-]{1,40}$/`) geçirilmeli. |
| 5 | **Yüksek** | Okuma uçlarında rol ayrımı yok: `goruntuleyen` tüm müşteri ve iş ortağı verisini görüyor | `routes/handler.mjs:116-119` | Kapı yalnız POST'u `goruntuleyen`e kapatıyor; GET tüm rollere açık. Sonuç: salt-okuma hesabı `GET /api/admin/support` ile müşteri e-posta adreslerini ve yazışma gövdelerini, `GET /api/admin/refunds` ile iade/fatura kayıtlarını, `GET /api/admin/b2b` ile satıcı/alıcı **VAT numaralarını**, `GET /api/admin/tenants` ile tüm kiracıları ve anahtar özetlerini (`provider`, `last4`) okuyabiliyor. | Okuma uçları da sınıflandırılmalı: kişisel veri (destek, iade, B2B tarafları) ve kiracı yönetimi en az `duzenleyen`, tercihen yönetici olmalı. |
| 6 | Orta | `__proto__` ile işlenmeyen 500 + yığın izi | `services/dashboard.mjs:177,183`; `services/ads.mjs:145-148`; `services/refunds.mjs:140-147` | Doğrulandı: `GET /api/admin/dashboard/spot/__proto__` → 500 (`spot.allShops is not iterable`), `POST /api/admin/ads/keyword {campaign:"__proto__"}` → 500, `POST /api/admin/refunds/storno {refundId:"__proto__"}` → 500. İstemciye genel mesaj dönüyor ama her istek sunucu log'una tam yığın izi yazıyor; ucuz bir log şişirme/gürültü yolu. (Storno'da `store.tx` geri aldığı için fatura numarası yanmıyor.) | #4 ile aynı düzeltme; ayrıca servis katmanında kimlik biçimi denetimi. |
| 7 | Orta | `feed/bulk` sınırsız çarpım: tek istekte 500 bin satır | `services/feed.mjs:195-231` (özellikle `201` ve `221`) | `brands` ve `shops` ayrı ayrı 100 ile sınırlı ama çarpım sınırsız: `scan(MAX_SCAN=5000)` × 100 mağaza = **500.000** kayıt hem JSON yanıtında hem de tek bir `feed` belgesinde SQLite'a yazılıyor. Doğrulandı: tek ürün + 100 mağaza ile `uploaded` dizisi 100 öğe döndü; ölçek doğrusal. | Sonuç sayısına üst sınır (ör. 5000) ve sayfalama; yanıtta tam liste yerine sayaç + ayrı sorgulanabilir rapor kimliği; belgeye yazarken boyut tavanı. |
| 8 | Orta | Sınırsız liste yanıtları (destek, iade, B2B) | `services/support.mjs:11,275-279`; `services/refunds.mjs:241-244`; `services/b2b.mjs:255-271` | `listTickets` tavanı yok: `MAX_TICKETS=5000` × `body` 10.000 karakter → tek `GET /api/admin/support` isteği ~50 MB JSON üretebilir. `listRefunds` ve `b2b/summary` de tüm koleksiyonu döndürüyor. Oturumu olan tek kullanıcı birkaç eşzamanlı istekle süreci belleğe boğabilir. | Tüm liste uçlarına `limit`/`offset` (havuzdaki `listPools` deseni) ve varsayılan tavan; ticket gövdesi listede kısaltılmalı. |
| 9 | Orta | `pool.ingest` her çağrıda tüm havuzu tarıyor (O(n), toplu işte O(n²)) | `services/pool.mjs:81-86`; `db/pool.mjs:28` | `findMatch` EAN eşleşmesi yoksa `db().poolKeys()` ile **tüm** `pool` tablosunu belleğe alıp normalize karşılaştırma yapıyor (kodda da not düşülmüş). 100 bin ürünlük bir içe aktarımda her satır tüm tabloyu tarar; tek süreçli sunucuda olay döngüsünü kilitler. | `vendor`/`mpn`/`title` için normalize edilmiş anahtar sütunu + indeks; eşleşme SQL'e taşınmalı. |
| 10 | Orta | `insights` pazar verisi belgesi sınırsız büyüyor | `services/insights.mjs:22,63-67` | İstek başına 5000 satır sınırı var ama `d.market` sözlüğü için toplam tavan yok; farklı EAN'larla tekrar eden `POST /api/admin/insights/import` çağrıları tek JSON belgesini sınırsız büyütür ve her okuma onu tamamen parse eder. (`context` dizisinde 5000 tavanı doğru uygulanmış.) | `market` için de kayıt tavanı ve en eski kayıtların düşürülmesi; ya da ayrı tabloya taşınması. |
| 11 | Düşük | `SESSION_SECRET` çift görevli: oturum imzası + anahtar kasası KDF'i | `services/tenants.mjs:162-168`; `lib/auth.mjs:19-23` | Şifreleme anahtarı `scrypt(SESSION_SECRET, 'mixo-tenant-keys-v1')` ile türetiliyor. Oturum gizli değeri güvenlik gereği döndürüldüğünde **tüm kiracı API anahtarları kurtarılamaz biçimde çözülemez** hale gelir (`getKey` sessizce `null` döner, `testKey` "çözülemedi" der). Ortam değişkeni verilmediğinde `fail('invalid', ...)` ile anahtar yazımı reddediliyor — bu kısım doğru. | Kasa için ayrı bir `TENANT_KEY_SECRET` kullanılmalı; kayıtlara anahtar sürümü (`kid`) yazılıp sürüm geçişi (re-encrypt) desteklenmeli. |
| 12 | Düşük | Havuz birleştirme günlüğünde "kim yaptı" hep boş | `services/pool.mjs:194` | `actorCtx.getStore()?.user` — bağlamda saklanan nesne `{ id, username, role }` (`routes/handler.mjs:121`), yani `user` alanı yok; `services/settings.mjs:26` doğru alanı (`username`) okuyor. Sonuç: geri alınabilir bir birleştirme işleminin denetim kaydında kullanıcı daima `null`. | `?.username` olarak düzeltilmeli. |
| 13 | Düşük | `price-strategy` belgesine `__proto__` anahtarlı kayıt yazılabiliyor | `services/price-strategy.mjs:44` | Doğrulandı: `POST /api/admin/rules/strategy {company:"__proto__"}` → 200 ve kayıt `strategies['__proto__']` olarak saklanıyor. `Object.prototype` kirlenmiyor (hesaplanmış anahtar kendi özelliği oluyor) ama belge kirleniyor ve `listStrategies` çıktısında görünüyor. | `company` için biçim denetimi (`/^[\w .-]{1,120}$/`) ve `__proto__`/`constructor`/`prototype` reddi. |
| 14 | Düşük | Pano spot durumu tüm kiracıların mağaza adlarını sızdırıyor | `services/dashboard.mjs:172-180` | `universe()` doğrudan `store.doc('tenants')` içindeki **tüm** kiracıların mağaza adlarını okuyup her `spotStatus` yanıtının `missingShops` alanına koyuyor. #1'in somut bir örneği: A kiracısının panosu B kiracısının mağaza adlarını gösterir. | Mağaza evreni, isteği yapan kullanıcının kiracısıyla sınırlanmalı. |

---

## Temiz çıkan denetimler

Aşağıdakiler açıkça denendi ve **bulgu çıkmadı**:

- **XML/HTML kaçışı (`services/feed.mjs`).** `escXml` `& < > " '` karakterlerini ve XML 1.0'da geçersiz denetim
  karakterlerini işliyor; eleman adları sabit listeden, `market` özniteliği beyaz listeden geliyor. Canlı denemede
  `</item><item><id>sahte</id>` başlıklı bir ürün yüklendi; çıktıda tamamen kaçırılmış (`&lt;/item&gt;...`) olarak
  göründü, ek öğe üretilemedi. Öznitelik bağlamında da enjeksiyon yolu bulunamadı.
- **İade ödemesinde çift ödeme ve yarış.** `settle` `store.tx` içinde, senkron ve ödeme kaydı `d.payments[r.id]`
  tek anahtara bağlı. `Promise.all` ile eşzamanlı iki `settle` çağrısında ikisi de `duplicate:true` döndü ve
  **tek** ödeme kaydı (`pay_r1`) oluştu. Durum geçiş tablosu (`TRANSITIONS`) `refunded`'dan çıkışa izin vermiyor.
- **B2B adet düşümü yarışı.** `createDeal` tek `store.tx` içinde okuyup yazıyor; tek süreç ve senkron akışta
  araya başka istek giremiyor. Kalandan fazla adet istenince `conflict` ile reddedildi (`kalan: 2` doğrulandı).
  `advanceDeal('cancelled')` adedi geri ekliyor. (Yalnız #4'teki `__proto__` yolu bu denetimi atlıyor.)
- **AES-256-GCM kullanımı (`services/tenants.mjs:170-182`).** Her şifrelemede `crypto.randomBytes(12)` ile yeni IV
  (IV tekrarı yok), AAD = `tenantId|provider` (kayıt başka kiracıya/sağlayıcıya taşınamaz), anahtar scrypt ile
  türetiliyor ve önbelleklenirken gizli değerle karşılaştırılıyor, `SESSION_SECRET` yoksa işlem reddediliyor.
  İptalde şifreli veri siliniyor.
- **Anahtar değeri sızıntısı.** `setKey`/`listKeys`/`testKey`/`revokeKey` yanıtlarında ve hata mesajlarında ham
  anahtar geçmiyor; canlı denemede yalnız `{provider, added, last4, active}` döndü. Anahtarlar kiracı belgesinden
  ayrı `tenant_keys` belgesinde duruyor, `getTenant`/`listTenants` bunu taşımıyor. Kod tabanında anahtarı yazan bir
  `console.log` yok. Yedek (`db/backup.mjs`) ham veritabanı kopyası olduğu için anahtarlar orada da şifreli;
  dış kopya ayrıca AES-256-GCM ile şifreleniyor (`db/export.mjs`, rastgele tuz + IV, GCM etiketi).
- **Kiracı kimliğiyle prototip erişimi.** `tenants.mjs` içindeki `must()` ve `getTenant()` `Object.hasOwn` kullanıyor;
  `tenantId:"__proto__"` ile kiracı uydurulamadı (404). `insights.importMarketData` EAN'ı `/^\d{8,14}$/` ile
  denetlediği için `d.market` haritası da kapalı. `shipping.recordDelivery` sayaç anahtarları doğrulanmış
  (posta kodu 2 hane + beyaz listedeki firma kimliği).
- **SQL enjeksiyonu.** `db/pool.mjs` dahil tüm sorgular hazırlanmış deyim + parametre; dizgi birleştirme yok.
- **HTTP kapıları.** Yönetici uçlarında `PUT/PATCH/DELETE` 405 (e2e'de de denetleniyor), POST'ta
  `application/json` zorunlu, yabancı `Origin` 403, oturum çerezi `HttpOnly; SameSite=Strict`, gövde 200 KB tavanı,
  güvenlik başlıkları (CSP, `frame-ancestors 'none'`, HSTS, nosniff) tüm yanıtlarda.
- **Oturum ve parola.** scrypt + `timingSafeEqual`, bilinmeyen kullanıcıda sabit süre (`DUMMY_PW`), 12 saat /
  2 saat hareketsizlik, parola değişiminde tüm oturumların düşürülmesi, adres başına ve genel giriş kilidi.
- **Rıza kapısı.** `services/ads.mjs:216-246` alıcı listesini `mk.consentOk` üzerinden süzüyor; `marketing/consent.mjs`
  çift onay olmadan `confirmed` yapmıyor ve ad alanındaki satır sonu/NUL karakterlerini temizliyor (konu satırı enjeksiyonu kapalı).
- **Regresyon.** 98 birim testi ve 153 uçtan uca denetimin tamamı geçti; bu rapordaki hiçbir bulgu mevcut testlerle yakalanmıyor.

## Doğrulanamadı

- **Gerçek ödeme sağlayıcısı davranışı.** `refunds.settle` ve `b2b` yalnız simülasyon kaydı üretiyor
  (`simulated: true`); Mollie/PayPal'a bağlanınca idempotans anahtarının sağlayıcı tarafında nasıl kurulacağı
  bu kodda görünmüyor.
- **Çok süreçli / yatay ölçekli yarış.** Tüm idempotans ve adet denetimleri "tek süreç + senkron `store.tx`"
  varsayımına dayanıyor (`ARCHITECTURE.md`'de de bilinen sınır olarak yazılı). İkinci bir kopya açılırsa
  #3, çift ödeme ve B2B adet düşümü yeniden değerlendirilmelidir.
- **Üretim ortamı değişkenleri.** `SESSION_SECRET`, `BACKUP_ENCRYPT_KEY`, `BACKUP_EXPORT_DIR` ve
  `REFUND_APPROVAL_THRESHOLD` değerlerinin canlıda nasıl ayarlandığı denetlenmedi; yalnız kod yolları okundu.
- **`services/rules.mjs` ile `feed.bulkUpload` bağlantısı.** `bulkUpload` kural motorunu `await import('./rules.mjs')`
  ile gevşek bağlıyor ve `evaluate` imzası uyuşuyor; ancak yasak kuralının toplu yüklemeyi gerçekten durdurduğu
  uçtan uca senaryo (yasaklı marka + yükleme) bu denetimde çalıştırılmadı.
