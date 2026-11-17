# Mimari ve Bakım İncelemesi (Konsey üyesi: MİMARİ VE BAKIM)

Tarih: 2026-11-17. Kapsam: `/home/wpu/Desktop/Urunler/Mixo/demo`. Ölçüt: `ARCHITECTURE.md`.
İncelenen yeni modüller (13 servis, 11 uç dosyası, 10 birim testi): `services/` pool, tenants, feed, rules, price-strategy, shipping, refunds, support, dashboard, ads, insights, b2b, staff; `routes/admin-` pool, tenants, feed, rules, shipping, refunds, support, dashboard, ads, insights, b2b; `test/unit-*.mjs` (10 dosya, 1244 satır). Okunan çekirdek: `routes/handler.mjs`, `db.mjs`, `lib/store.mjs`, `db/documents.mjs`, `db/pool.mjs`, `services/settings.mjs`, `services/actions.mjs`.
Proje dosyalarına dokunulmadı; betikler scratchpad altında.

## Yöntem (ne ölçüldü, çıktısı ne)

| Ölçüm | Komut / betik | Sonuç |
|---|---|---|
| Statik içe aktarma grafiği + Tarjan döngü araması (lib, services, routes, jobs, db, instagram, marketing, kök .mjs) | `node scratchpad/graph.mjs` | Döngü yok (SCC listesi boş). `lib → services` ihlali yok. `services → routes` yok. Dinamik `import()`: 4 yer (`ads→channels` x2, `ads→orders`, `feed→RULES_PATH`). `services → dışı`: `ads→marketing/shared.mjs`, `channels→instagram.mjs/marketing.mjs`. |
| Her modülü ayrı süreçte `import()` (52 modül: lib 7, services 28, routes 17) | `node scratchpad/imp.mjs <modül>` (Node 22.22.2, geçici DATA_DIR) | 52/52 hatasız yüklendi. Yan etkiler: `catalog.mjs` yüklenince 44.998 ürünü okuyup log basıyor; `lib/auth` yönetici hesabı/parola dosyası işliyor; `channels.mjs` kanca atayıp 4-5 satır log basıyor. Yeni modüller yan etkisiz, ama `pool`, `rules`, `feed` (ve rotaları) katalog yüzünden 84-111 ms; katalogsuz yenilerde (tenants, ads, shipping, b2b, support, staff, price-strategy) 24-47 ms. |
| Ölü / bağlanmamış export taraması | `node scratchpad/dead.mjs` (kendi dosyası ve test dışında kullanılmayan export'lar) | 46 export dışarıdan kullanılmıyor; bunların 8 tanesi gerçek işlev ve hiç çağrılmıyor (bkz. #7). |
| Kapsam (birim + uçtan uca, sunucu alt süreci dahil) | `npx c8 ... npm test` (çıktı dizini scratchpad'e yönlendirildi; `npm run test:coverage` ile aynı include/exclude) | 98 birim testi geçti, 0 hata, e2e geçti. Birleşik satır %78,66 / dal %74,47 / işlev %81,52. |
| Bellek ve olay döngüsü yükü | `node scratchpad/bench2.mjs` | `staff` belgesi tavanda (50.000 kayıt) 4,65 MB: tek `recordWork` 157 ms (eşzamanlı, olay döngüsünü bloklar). `feed` toplu yükleme en kötü durumda (5000 ürün x 100 mağaza) 500 bin kalem, 35,9 MB: tek `saveDoc` 637 ms; sonraki her `store.doc('feed')` okuması 232 ms. |

## Bulgular

Önem: Yüksek 4 · Orta 10 · Düşük 6 · toplam 20.

| # | Önem | Konu | Dosya | Ne oluyor | Öneri |
|---|---|---|---|---|---|
| 1 | Yüksek | Rol kapısı yeni uçlara uyarlanmamış | `routes/handler.mjs:118` | Yalnız `users|backups|jobs` yönetici ister. `duzenleyen` rolü şunları yapabilir: kiracı API anahtarı koy/iptal et (`tenants/key`), paket düşür/kiracıyı kapat, 200 EUR (eşik) üstü iade onayı (`refunds/settle` + `approve:true`, onayı gövdeden alıyor), marka yetkisi ver (`ads/brand`), satış yasağı kuralı sil (`rules/remove`). | `ADMIN_ONLY` kalıp listesi: `/api/admin/(users|backups?|jobs|tenants|rules|ads/brand|refunds/settle)`. Refund onay eşiği için rol kontrolü servise değil kapıya konsun. Test: rol x uç matrisi (e2e). |
| 2 | Yüksek | Kiracı yalıtımı uygulanmıyor | `services/tenants.mjs` (`scopeOf`, `tenantOfUser`) | Kullanıcı→kiracı bağı kuruluyor ama `scopeOf` yalnız testten çağrılıyor. Hiçbir uç (pool, refunds, dashboard, support, b2b) kiracıya göre süzmüyor; pano `revenue` siparişte şirket alanı olmadığı için hep `bilinmiyor` gruplar. K-07 "çok kiracılılık" bugün yalnız kayıt tutuyor, yalıtım yok. | Belgeye yaz: "yalıtım henüz yok". Kapıda `c.tenant = scopeOf(me.username)` ata, listeleyen servislere `tenantId` süzgeci ekle; ya da K-07'yi "kayıt" olarak işaretle. |
| 3 | Yüksek | "Her yazma `actions`/günlükten geçer" kuralı 12/13 modülde çiğneniyor | `services/*` (pool hariç hepsi) | `addChange`/`logChange` çağıran tek yeni modül `pool.merge`. `rules` (yasal satış yasağı kaldırma), `tenants` (anahtar, paket), `ads.authorizeBrand`, `shipping.setCarrier`, `price-strategy`, `refunds`, `b2b`, `support` değişiklik günlüğüne düşmüyor. Kaybettirdiği: kim kaldırdı/değiştirdi, ne zaman, geri alma. `refunds.events`, `support.thread`, `staff` kendi içinde izliyor ama `by` çoğu yerde `'sistem'`/boş; günlük ekranında görünmez. | `services/audit.mjs`: `audit(by, summary, undo?)` = `logChange` sarmalayıcısı. Önce geri alınabilir olanlar: rules add/update/remove, strategy, carrier, tenant update. Diğerlerinde `undo` olmadan sadece kayıt. |
| 4 | Yüksek | Kural motoru yasağı sessizce kaybolabilir (fail-open) | `services/feed.mjs:198` | `await import(RULES_PATH).catch(() => null)`: `rules.mjs` söz dizimi hatası alsa ya da fırlatsa, `rules` null olur, `rules?.evaluate?.` boş döner ve yasaklı ürünler "uploaded" olur. Yasal denetim kapısı hata durumunda açık kalıyor. `rules.mjs` artık var; döngü yok (rules → store, catalog). | Statik `import { evaluate } from './rules.mjs'`; `RULES_PATH` ve `.catch` kalksın. Kural yüklenemezse yükleme hata versin (fail-closed). |
| 5 | Orta | `pool.merge` günlük kaydı hatalı | `services/pool.mjs:158-165` | (a) `actorCtx.getStore()?.user` okuyor; oturum nesnesi `{id, username, role}` (`lib/auth.mjs:97`), yani `user` her zaman `null`. (b) `store.addChange` doğrudan yazıyor, bellekteki `changes` dizisine (`settings.mjs:22`) girmiyor: panelin `changes.slice(-40)` (`admin-data.mjs:123`) birleştirmeyi yeniden başlatmaya kadar göstermez. (c) Yeniden başlatınca kayıt `changes`'a `undo.kind` ile gelir ama `actions.undo` `undo.type` arar, bulamaz, `null` döner: panelden "geri al" çalışmaz; yalnız `pool/unmerge` ucu çalışır. (d) `id = randomUUID().slice(0,8)` + `UNIQUE`: çakışmada fırlatır. | `logChange('havuz', özet, { type: 'pool_unmerge', ... })` kullan ve `actions` tablosuna `pool_unmerge` işlemini ekle. `unmergeById` o yoldan geçsin. |
| 6 | Orta | Tek JSON belge sınırsız büyüyor | `feed`, `staff`, `refunds`, `insights`, `b2b`, `support`, `shipping` | Her yazma tüm belgeyi serileştirip `kv`'ye yazıyor (eşzamanlı). Ölçüm: `staff` tavanda 4,65 MB, 157 ms/yazma; `feed.bulk.uploaded` 5000 ürün x 100 mağazada 35,9 MB, 637 ms; `refunds.events` tavansız; `insights.market[ean][pazar]` her içe aktarmada (5000 satır) birikir, silinmez; `b2b.offers/deals` tavansız; `support` 5000 bilet x yazışma zinciri. Kalıcı büyüme `feed` okumasını da yavaşlatır (232 ms), `auditFeed` her çağrıda bunu okur. | SQLite tablosu olması gerekenler: `staff_work` (kayıt günlüğü), `refund` + `refund_event`, `b2b_deal/offer`, `ticket`, `insights_market`. `feed.bulk` yalnız özet (sayılar + son 200 engel) saklasın. Belge kalabilirler: tenants, rules, price_strategy, dashboard hedefleri, shipping yapılandırması, ads (tavanlı). |
| 7 | Orta | Bağlanmamış işlevler ve "ada" modüller | `shipping.setConfig`, `support.setMinCount`, `refunds.refundMails/refundEvents/refundPayment`, `ads.appPromo/keywords`, `b2b.listOffers`, `tenants.scopeOf` | `setConfig` ve `setMinCount`: ne uç ne test var; UPS eşiği/varsayılan firma ve şikayet eşiği HTTP'den değiştirilemez. `refundMails/Events/Payment`, `appPromo`, `keywords`, `listOffers` yalnız testte çağrılıyor. Daha büyük sorun: `orders.mjs` yeni modüllerin hiçbirini içe aktarmıyor: `createOrder` kargo seçimi (`chooseCarrier`) kullanmıyor, iade durumu siparişe yansımıyor, kural/fiyat stratejisi akışa girmiyor, `dashboard.consume` siparişle değil elle artıyor. | Ya uç ekle ya sil. Entegrasyon için `hooks`'a (`orderPlaced` gibi) `refundIssued`, `carrierChosen` ekle; her modülün bugün "yalnız API" olduğunu `ARCHITECTURE.md`'ye yaz. |
| 8 | Orta | Gizli dinamik bağ ve katmanlar arası belge erişimi | `services/ads.mjs:218,226,252`, `dashboard.mjs:174`, `ads.mjs:222` | `ads → ../services/channels.mjs` (kendi klasörüne `../services/` ile): `channels` yüklenince 45 bin ürünlük katalog, Instagram ve pazarlama başlatması çalışır (292 ms, 5 satır log). Döngü bugün yok; ama `channels` ileride `ads`'i alırsa gizli döngü olur. Sırf `mk.consentOk` için. `ads.audience` `store.doc('marketing').carts`'ı (pazarlama modülünün özel belge şekli), `dashboard` `store.doc('tenants')`'ı (tenants'ın belge şekli) doğrudan okuyor. | `consentOk`'ı `hooks.consentOk` ile ver (ya da `services/consent.mjs` ince cephe); `ads → orders` zaten döngüsüz, statik içe aktar. `dashboard` `listTenants()`, `ads` pazarlama için `mk.carts()` çağırsın. |
| 9 | Orta | `norm` yüzünden katalog yükleniyor | `services/pool.mjs:3`, `rules.mjs:3` (+`feed` dolaylı) | İkisi yalnız `norm` (3 satırlık metin normalleştirme) için `catalog.mjs` alıyor; her yüklemede 44.998 ürün okunur. Birim testleri (feed, rules, pool) ve CLI betikleri gereksiz 60-90 ms öder, `catalog` ileride `pool`'a bağlanırsa döngü doğar. | `lib/text.mjs`: `export const norm`. `catalog.mjs` yeniden dışa aktarsın (geriye uyum). |
| 10 | Orta | Kopyala-yapıştır gövdesi: hata sınıfı, `fail`, uç şablonu | 13 servis, 11 uç dosyası | Bkz. "Ortaklaştırılacaklar". Aynı 9 satır (`class XError … fail`) 13 kez; aynı uç kabuğu (`STATUS`, `WRITES`, `bad`, `needStr`, `ID_RE`, iki kez 405, `catch`) 11 uç dosyasında ≈ 25-30 satır; toplam ≈ 400 satır. | `lib/errors.mjs`, `lib/route.mjs`, `lib/doc.mjs` (aşağıda). |
| 11 | Orta | Hata kodu → HTTP eşlemesi tutarsız | `routes/admin-*.mjs` | `limit`: `ads` 429, `pool/tenants/refunds` 409; `shipping`, `support`, `b2b`, `rules`, `dashboard`, `insights`, `feed` eşlemesi yok (varsayılan 400). `conflict` `feed`, `shipping`, `dashboard`, `insights`'ta yok. `insights` yanıtında `code` alanı yok, ötekilerde var. "Uç yok": `'Uç yok'`, `'Bulunamadı'`, `'yok'` üç ayrı metin. | Tek `ERR_STATUS = { invalid:400, notfound:404, conflict:409, limit:429 }` (`lib/route.mjs`); `code` her zaman yanıtta; 404 metni tek. |
| 12 | Orta | Para hesabı üç ayrı yöntemle | `refunds`, `b2b`, `dashboard` / `insights`, `shipping`, `price-strategy`, `orders` | Kuruş tam sayı: `b2b` (`toCents`, 2 basamak doğrular), `refunds` (`cents()`), `dashboard` (`cents()`, ayrı kopya). Kayan nokta + `r2`: `insights` (kur çarpımı), `price-strategy` (`Math.ceil(x*100-1e-9)/100`), `orders/pricing.money`. `refunds` brütten net: `Math.round(gross/(1+VAT))`, `net+vat` ile brüt çakışması testte yalnız `Math.round((net+vat)*100)/100` ile doğrulanıyor (uygulamayı yineliyor). Saat dilimi de dağınık: `dashboard` `Europe/Istanbul`, `insights` sabit `+3`, `refunds` fatura yılı sunucu yerel saati (`new Date(t).getFullYear()`, sunucu UTC ise 31 Aralık gece yarısı yanlış yıl). | `lib/money.mjs`: `toCents`, `fromCents`, `addCents`. Para birimi alanı olan her yerde (`insights`) kuruşa çevir. Fatura yılı `Europe/Berlin`'e sabitlensin. |
| 13 | Orta | Uç kapsamı düşük, e2e yeni uçları kapsamıyor | `routes/admin-tenants.mjs` %47, `admin-dashboard` %45, `admin-ads` %49, `admin-b2b` %55, `admin-shipping` %60, `admin-refunds` %61 | Yeni uç dosyaları toplam 685 satır, %59 kapsıyor (404/685); servisler %93. e2e'de yeni uçlar için yalnız 8 doğrulama (`pool`, `rules`, `ads/audience`, PUT 405). `tenants/key` yanıtında anahtar yok iddiası yalnız servis katmanında testli, HTTP'de değil. Refund `settle` rol/onay yolu, support, b2b, shipping, feed uçları e2e'de yok. | Tek tablo güdümlü uç testi: her uç için (rol, yöntem, geçersiz gövde, beklenen kod). Öncelik: `tenants/key`, `refunds/settle`, `feed/bulk`. |
| 14 | Orta | `ARCHITECTURE.md` güncel değil | `ARCHITECTURE.md` | Modül listesi 11 modülü içermiyor; "Bilinen sınırlar" yalnız siparişleri/olayları belirtiyor, yeni belge büyümesini söylemiyor; kapsam "≈ %68", ölçülen %78,7; "Fabrika modüller", `routes` satırı yeni uçları saymıyor. | Aşağıdaki hazır metin. |
| 15 | Orta | `ingest` ve tarama O(n²)/N+1 | `services/pool.mjs` `findMatch`, `services/feed.mjs` `scan` | `findMatch` her çağrıda `poolKeys()` ile tüm havuzu okuyup her satıra `norm` çalıştırıyor (`db/pool.mjs` yorumu bunu kabul ediyor). 45 bin ürün içe aktarımı ≈ 2·10⁹ normalleştirme. `scan` her ürün için `getPool` + `eansOf` + `srcOf` (3 sorgu); `bulkUpload` 5000 ürünü eşzamanlı tarar. Hepsi olay döngüsünü bloklar. | `pool` tablosuna `vendor_key`, `mpn_key`, `title_key` sütunu + dizin; `findMatch` SQL. `scan` tek `JOIN` ya da toplu `IN`. |
| 16 | Düşük | Kimlik biçimleri 5 türlü | `pool` (`p_`+12), `refunds` (`rf_`+12, posta 8), `tenants` (`t_`+12, `s_`+10), `b2b` (`s_`/`b_`+12), `support` (`uid`), `changes` (8, çizgili UUID dilimi) | `s_` hem kiracı mağazasında hem B2B satıcıda; kayıtta birbirine karışır. | `lib/id.mjs`: `newId(prefix, len = 12)`; `s_` B2B için `sel_` olsun. |
| 17 | Düşük | Sayfalama yalnız `pool` ve kargo günlüğünde | `refunds`, `support`, `tenants`, `b2b` listeleri | Liste uçları tüm belgeyi döndürüyor (`support` 5000 bilet). Tek kayıt ucu: `pool`, `tenants`, `refunds`, `support` 404 veriyor (tutarlı); `b2b`, `ads`, `dashboard`'da tek kayıt GET'i yok. | Liste uçlarına `limit/offset` (`pool` kalıbı), `lib/route.mjs` içinde `page(sp)` yardımcısı. |
| 18 | Düşük | `services` HTTP biliyor (eski) | `services/analytics.mjs:55,61` | `req.headers` okuyor; kural "services HTTP'yi bilmez". Yeni modüller temiz. | Başlıkları rotada çıkar, servise `{ secure, ua }` ver. |
| 19 | Düşük | `ads → marketing/shared.mjs` | `services/ads.mjs:2` | `EMAIL_RE` zaten `lib/validate.mjs`'te, `marketing/shared` yeniden dışa aktarıyor; `ads` kök dizindeki bir modülden alıyor (`services → lib` kuralı dışı). `lintText` hâlâ marketing'te. | `EMAIL_RE`'yi `lib/validate`'ten al, `lintText`'i `lib/text.mjs`'e taşı. |
| 20 | Düşük | Test iskeleti 10 kez tekrar | `test/unit-*.mjs` | Aynı 7 satır önsöz (`DATA_DIR`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `RAILWAY_ENVIRONMENT`, `ORDER_VERIFY`) 10 dosyada; testler dosya içinde ortak durumu sıraya bağlı birikiyor (`unit-shipping` `feed()` birikimi); bir doğrulama (`refunds` 69) kodu yineliyor. Çoğu test davranışı sınıyor (iyi): kota/tavan, geçersiz geçiş, çift onay, p90, atomiklik. | `test/helpers.mjs`: `setupEnv()`; sıraya bağlı testlere not ya da `beforeEach` sıfırlama. |

## Ortaklaştırılacaklar

| Tekrar | Kaç dosyada | Önerilen ortak modül ve imza | Kazanç |
|---|---|---|---|
| Hata sınıfı + `fail` (`class XError { code }`, `const fail = ...`) | 13 servis (pool, tenants, feed, rules, price-strategy, shipping, refunds, support, dashboard, ads, insights, b2b, staff) | `lib/errors.mjs`: `export class DomainError extends Error { constructor(code, message) }` · `export const makeError = name => { const E = class extends DomainError {}; Object.defineProperty(E, 'name', { value: name }); return [E, (c, m) => { throw new E(c, m); }]; }`. Kullanım: `export const [PoolError, fail] = makeError('PoolError');` | ≈ 8 satır x 13 = ≈ 105 satır; `instanceof DomainError` tek `catch`. |
| Uç kabuğu: `STATUS`, `WRITES`, `bad`, `needStr`, `ID_RE`, iki kez 405, `catch → STATUS[e.code]` | 11 uç dosyası (685 satır) | `lib/route.mjs`: `defineRoute(prefix, { get: { '': c => …, ':id': (c,id) => … }, post: { name: { need: ['tenantId'], run: c => … } } })` ya da en azından `export const ERR_STATUS`, `export const need = (b, ...keys) => string \| null`, `export const guard = (c, fn) => try/catch DomainError → send(res, ERR_STATUS[e.code] ?? 400, { error, code })`. `defineRoute` yöntem denetimini (POST bekleniyor / GET bekleniyor), kimlik doğrulamayı (`ID_RE`) ve 404'ü kendisi yapar. | ≈ 25-30 satır x 11 = ≈ 300 satır; #11 tutarsızlığı kendiliğinden biter. |
| `str(v, max)`, `plain`, `lc`, `MARKET_RE` | `str` 10 serviste, `MARKET_RE` 3, `plain` 1, `lc` 2 | `lib/text.mjs`: `str`, `norm` (catalog'dan taşınır), `lc`, `MARKET_RE`, `isId`. | ≈ 25 satır + #9 çözülür. |
| Belge okuma/yazma sarmalayıcısı (`load`: şekil denetimi + varsayılan, `save`, `run = tx(load→fn→save)`) | 12 serviste (tenants 3, refunds 3, support 2, diğerleri 1) | `lib/doc.mjs`: `export const docOf = (key, defaults) => ({ load(), save(d), update(fn) })`; `update` `store.tx` içinde okur, `fn`'i çalıştırır, `saveDoc` yapar, boş/şekil bozuk belgeyi `defaults` ile doldurur (`typeof d === 'object' && !Array.isArray(d)` denetimi 3 yerde elle yazılmış). | ≈ 70 satır; yarışsız tek okuma-yazma. |
| Kimlik üretimi (`crypto.randomUUID().replaceAll('-', '').slice(0, n)`) | 5 serviste, + `settings.logChange`, `refunds` posta | `lib/id.mjs`: `export const newId = (prefix, len = 12) => prefix + randomUUID().replaceAll('-', '').slice(0, len)`. | ≈ 10 satır; #16. |
| Kuruş yardımcıları (`cents`, `money`, `toCents`, `fromCents`) | `refunds`, `dashboard`, `b2b`, (`insights/price-strategy/pricing` kayan) | `lib/money.mjs`: `toCents(n)` (yuvarlak, 2 basamak doğrular), `fromCents(c)`, `sumCents(list)`. | ≈ 15 satır; #12. |
| Değişiklik günlüğü yazımı | 12 modülde yok, `pool` elle | `services/audit.mjs`: `audit(by, summary, undo)` = `logChange` (kullanıcıyı `actorCtx.getStore().username`'den alır). | #3 ve #5 bir arada çözülür. |
| Test önsözü | 10 test dosyası | `test/helpers.mjs`: `setupEnv()` | ≈ 60 satır. |

Toplam tahmini: ≈ 580 satır azalma, yeni ortak dosya 7 (`errors`, `route`, `text`, `doc`, `id`, `money`, `audit`; her biri < 40 satır).

## Kapsam ölçümü

Komut: `c8` (include `*.mjs lib services routes jobs db instagram marketing`, exclude `test node_modules`) ile `npm test` (birim + e2e). Birleşik: satır %78,66 · dal %74,47 · işlev %81,52 (belgedeki "≈ %68" eskimiş).

| Dosya | Satır | Kapsanan | Satır % | Dal % |
|---|---|---|---|---|
| services/ads.mjs | 279 | 263 | 94,3 | 87,6 |
| services/b2b.mjs | 271 | 266 | 98,2 | 75,7 |
| services/dashboard.mjs | 220 | 216 | 98,2 | 85,1 |
| services/feed.mjs | 232 | 225 | 97,0 | 74,1 |
| services/insights.mjs | 270 | 247 | 91,5 | 66,3 |
| services/pool.mjs | 246 | 245 | 99,6 | 78,7 |
| services/price-strategy.mjs | 96 | 90 | 93,8 | 59,6 |
| services/refunds.mjs | 248 | 242 | 97,6 | 83,7 |
| services/rules.mjs | 119 | 119 | 100 | 84,7 |
| services/shipping.mjs | 232 | 218 | 94,0 | 76,2 |
| services/staff.mjs | 85 | 85 | 100 | 78,0 |
| services/support.mjs | 279 | 273 | 97,8 | 81,0 |
| services/tenants.mjs | 243 | 233 | 95,9 | 80,2 |
| **Yeni servisler toplam** | **2820** | **2622** | **93,0** | |
| routes/admin-ads.mjs | 70 | 34 | 48,6 | 64,3 |
| routes/admin-b2b.mjs | 60 | 33 | 55,0 | 60,0 |
| routes/admin-dashboard.mjs | 64 | 29 | 45,3 | 33,3 |
| routes/admin-feed.mjs | 39 | 25 | 64,1 | 61,1 |
| routes/admin-insights.mjs | 44 | 32 | 72,7 | 61,5 |
| routes/admin-pool.mjs | 76 | 56 | 73,7 | 54,2 |
| routes/admin-refunds.mjs | 67 | 41 | 61,2 | 56,3 |
| routes/admin-rules.mjs | 59 | 39 | 66,1 | 60,0 |
| routes/admin-shipping.mjs | 52 | 31 | 59,6 | 66,7 |
| routes/admin-support.mjs | 67 | 43 | 64,2 | 55,6 |
| routes/admin-tenants.mjs | 87 | 41 | 47,1 | 57,1 |
| **Yeni uçlar toplam** | **685** | **404** | **59,0** | |
| db/pool.mjs | 95 | 95 | 100 | 91,2 |

Kapsanmayan kritik yollar (servis): `shipping.mjs` 91-104 (`setConfig`, bağlanmamış), `support.mjs` 237-242 (`setMinCount`, bağlanmamış), `insights.mjs` 162-184 (kohort), `refunds.mjs` 197-202, `ads.mjs` 205-207, 226-235, 272-274, `tenants.mjs` 89-94, 99-100, 208-209. Uç düzeyinde: `tenants` yazma kolları (36-76) ve `dashboard` (26-63) neredeyse tamamen testsiz.

## ARCHITECTURE.md'ye eklenecek metin

`services/` bloğundaki `channels` satırının altına:

```
  pool                ürün havuzu: kanonik kart, çoklu EAN (pazar yerine özel), kaynak kaydı, birleştir/geri al (db/pool.mjs tabloları)
  tenants             kiracı, mağaza, paket limiti (bronze/silver/gold), kullanıcı bağı; AES-256-GCM ile entegrasyon anahtarı (SESSION_SECRET'tan). Kiracı yalıtımı uç düzeyinde YOK
  feed · rules        pazar yeri feed denetimi ve toplu yükleme · satış yasağı kuralları (şirket x marka x pazar x kategori); feed yüklemesi kuralları evaluate() ile sorar
  price-strategy      rakip fiyatına eşitleme, taban fiyat (maliyet + kargo + komisyon + marj); fiyatı kendisi değiştirmez, karar döndürür
  shipping            posta kodu bölgesine göre kargo firması puanı ve seçimi; teslim sonucu kaydı
  refunds · support   iade durum makinesi, storno faturası, ödeme (simülasyon) · gelen kutusu, bilet, otomatik cevap, şikayet raporu
  dashboard · insights  ciro/hedef/spot pano · pazar yeri fiyat farkı, arbitraj, kategori trendi, huni, kohort (dış veri, EUR'a çevrilir)
  ads · b2b · staff   reklam/paylaşım simülasyonu (Meta/Google'a ağ çağrısı yok), B2B alıcı-satıcı eşleştirme, personel performansı
```

`routes/` satırına: `· admin-pool · admin-tenants · admin-feed · admin-rules · admin-shipping · admin-refunds · admin-support · admin-dashboard · admin-ads · admin-insights · admin-b2b · admin-health`.

"Kurallar" bölümüne:

```
- Yeni servis hataları `lib/errors.mjs` içindeki `makeError(ad)` ile üretilir; kodlar `invalid | notfound | conflict | limit`. Uç katmanı `lib/route.mjs` ile HTTP koduna çevirir (400/404/409/429).
- Durum belgeleri (`store.doc`): küçük ve sınırlı olanlar için (ayar, kural, yapılandırma). Büyüyen kayıt (günlük, iade, bilet, personel kaydı, pazar verisi) SQLite tablosunda tutulur.
- Başka modülün belgesini doğrudan okuma: o modülün dışa aktardığı işlevi çağır (`listTenants()`, `mk.carts()`).
- Dinamik `import()` yasak: modüller arası ters bağ için `hooks` kullan.
- Yasal veya parasal etkili her yazma (kural, marka yetkisi, anahtar, iade onayı) `audit()` ile günlüğe düşer ve rol kapısı `routes/handler.mjs` içindeki yönetici listesindedir.
```

"İşletme notları" bölümüne:

```
- Yeni belgelerin boyutu `GET /api/admin/health` içinde `kv` boyutu olarak raporlanmalı; 5 MB üstü belge (staff, feed, refunds, insights) tablo adayıdır. Tek belge yazımı eşzamanlıdır: 4-5 MB belgede ≈ 150 ms, 35 MB'de ≈ 640 ms olay döngüsünü bloklar.
```

"Bilinen sınırlar" bölümünü şöyle değiştir:

```
Tek süreç ve tek disk (yatay ölçek yok); siparişler (≤5000) ve olaylar (≤200 bin) bellekte tutuluyor. Tek JSON belge olarak duran iş verileri: `settings`, `tenants`, `tenant_keys`, `rules`, `price_strategy`, `shipping`, `dashboard`, `ads` (küçük, tavanlı); `feed`, `refunds`, `support`, `b2b`, `insights`, `staff` (büyür, her yazma tüm belgeyi yeniden yazar; tavanlar: staff 50 bin, support 5 bin bilet, shipping günlüğü 1000, ads 500 paylaşım; refunds/insights/b2b tavansız). Çok kopyada son yazan kazanır. Yeni iş modülleri `orders.mjs` akışına bağlı değildir (kargo seçimi, iade, kural ve fiyat stratejisi yalnız uç üzerinden çalışır). Kiracı yalıtımı uygulanmıyor. Mobil uygulama (`mobile/`) bu yapının dışında ve testsiz. Birleşik kapsam (`npm run test:coverage`, birim + uçtan uca): satır ≈ %79 (yeni servisler %93, yeni uçlar %59).
```
