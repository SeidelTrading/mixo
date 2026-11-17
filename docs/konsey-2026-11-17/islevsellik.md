# Uçtan Uca İşlevsellik İncelemesi (Konsey üyesi: İŞLEVSELLİK)

Tarih: 2026-11-17 · İncelenen: `/home/wpu/Desktop/Urunler/Mixo/demo` · Kapsam: bugün eklenen 11 iş modülü (K-01 … K-29)

## Nasıl ayağa kaldırıldı

- Node v22.22.2 (`~/.nvm/versions/node/v22*`). Sunucu `node --no-warnings server.mjs`, geçici `DATA_DIR`, `ADMIN_PASSWORD` ve `SESSION_SECRET` ortam değişkenleriyle, `test/e2e.mjs` düzeninde başlatıldı.
- Üç ayrı örnek: ana geçiş `ORDER_VERIFY=off` (siparişler doğrudan "Yeni"), ikinci örnek varsayılan `ORDER_VERIFY` (doğrulama açık), üçüncü ve dördüncü kısa ek denemeler (rol, kiracı kapsamı, EAN seçimi).
- Yönetici oturumu `POST /api/admin/login` (boş kullanıcı adı = admin). Düzenleyen ve görüntüleyen rolleri `POST /api/admin/users` ile açıldı, rol denemeleri onlarla yapıldı.
- Betikler: `/tmp/claude-1000/-home-wpu--claude-spares-spare-vE7sF1/c1da5ee5-4384-4912-ab29-7360fe5b5727/scratchpad/` altında (`lib.mjs`, `run1.mjs` … `run7.mjs`, çıktı `out.txt`). Projeye yazılmadı, commit atılmadı.
- Son tam geçişte **yaklaşık 416 gerçek HTTP isteği** atıldı (ana geçiş 374, doğrulama geçişi 9, ek denemeler 33). Önceki iki yarım kalmış deneme (betik hatası) bu sayıya dahil değil.
- Not (kendi hatam): bir betik hatasından sonra takılı kalan sunucuyu temizlemek için `pkill -f server.mjs` çalıştırdım. Bu, aynı makinede çalışan diğer konsey üyelerinin sunucularını da kapatmış olabilir. Sonuçlarında beklenmedik bağlantı kopması gören olursa nedeni budur.

## Özet

| Akış | Durum |
|---|---|
| 1 Havuz (K-01, K-02) | Çalışıyor |
| 2 Kiracı (K-07, K-09) | Kısmen (çekirdek çalışıyor, kiracı kapsamı ve rol sınırı yok) |
| 3 Feed (K-03, K-04) | Çalışıyor (toplu yüklemede bir boşluk) |
| 4 Kural + fiyat (K-05, K-06) | Kısmen |
| 5 Lojistik (K-15–K-17) | Kısmen (seçim doğru, sisteme bağlı değil) |
| 6 İade (K-13, K-14) | Çalışıyor (üç ek boşluk) |
| 7 Destek (K-21–K-23) | Kısmen (karar doğru, sonuç eylemsiz) |
| 8 Pano (K-18–K-20) | Kısmen |
| 9 Reklam (K-10–K-12) | Kısmen |
| 10 Analiz (K-27–K-29) | Kısmen |
| 11 B2B (K-25, K-26) | Çalışıyor |

11 akışın 11'i denendi. İş kuralı düzeyinde hepsi beklenen sonucu veriyor; **uçtan uca eksiksiz çalışan 4** (havuz, iade, B2B, feed ana yolu), **kısmen çalışan 7**, tümüyle çalışmayan yok. "Kısmen"lerin ortak nedeni: modüller tek tek doğru ama birbirine ve sipariş kaydına bağlı değil.

## 1. Havuz (K-01, K-02): çalışıyor

- İki farklı kaynaktan (`wawi/A1`, `idealo-csv/zz9`) aynı ürün gönderildi; ikincisi EAN'sız, yalnız marka + MPN ile. Tek kayıt döndü (201, sonra 200, aynı `id`). Aynı `src+ref` tekrarı ve EAN ile eşleşme de tek kayıtta kaldı.
- Bir ürüne 1 genel + 3 pazar yerine özel EAN eklendi. Pazar yerine göre doğru EAN dönüyor, feed XML'inden doğrulandı: idealo `…018`, billiga `…025`, guenstiger ve pricerunner (özel kaydı yok) genel `…001`.
- Başka ürüne bağlı EAN: 409. Geçersiz uzunlukta EAN: 400.
- Birleştirme `merge` 200 + `changeId`; EAN ve kaynaklar taşındı, silinen ürün 404. `unmerge` (changeId ile) başlangıç durumuna döndürdü: EAN listesi ve kaynak listesi bire bir aynı, silinen ürün geri geldi. İkinci geri alma 409.
- Sapmalar:
  - Genel `POST /api/admin/undo` pool-merge kaydını geri alamıyor (400 "Bu değişiklik geri alınamıyor"). Geri alma yalnız `/pool/unmerge` ile.
  - Aynı ürüne aynı pazar yeri için ikinci EAN eklenebiliyor (200); hangisinin döneceği "ilk satır" kuralına kalıyor.
  - EAN kontrol hanesi doğrulanmıyor (`1234567890123` kabul edildi). Yalnız uzunluk ve rakam denetimi var.

## 2. Kiracı (K-07, K-09): kısmen

- Kiracı açma 201. Aynı hesapta bronze pakette ikinci şirket: 409 (limit). 4. mağaza: 409 (bronze = 3).
- API anahtarı kaydı: yanıtta yalnız `provider, added, last4, active`. Liste ve tek kiracı yanıtlarında anahtar değeri ya da şifreli veri yok (metin araması ile doğrulandı). `test` → `ok:true`; `revoke` sonrası `test` → "Anahtar iptal edilmiş". Plan yükseltme/düşürme çalışıyor.
- Eksikler:
  - Kullanıcı bir kiracıya atandı (`/tenants/user`) ama hiçbir uç kiracıya göre süzmüyor: atanmış kullanıcı iki kiracının ikisini de görüyor ve tüm siparişleri görüyor (`scopeOf` hiçbir yerde kullanılmıyor).
  - Düzenleyen rolü kiracı açabiliyor, API anahtarı kaydedebiliyor, anahtar son 4 hanesini listeleyebiliyor. Anahtar yönetimi yalnız yöneticide olmalı.

## 3. Feed (K-03, K-04): çalışıyor

- 6 ürünlük havuzda `audit idealo`: eksik alan raporu doğru (açıklama, yasal alan, EAN eksikleri ve "görsel http(s) değil" uyarısı ayrı ayrı). `GET /feed?market=` son raporu döndürüyor. Geçersiz pazar yeri 400.
- `build`: `application/xml`, Python `xml.dom.minidom` ile ayrıştı (geçerli). `&`, `<`, `>`, `"` doğru kaçırıldı. Yalnız denetimi geçen ürünler XML'e girdi.
- `bulk`: yasal alanı ya da zorunlu alanı eksik ürünler `blocked`, tam ürünler `uploaded`.
- Sapmalar: bilinmeyen mağaza kimliği (`olmayan-magaza`) reddedilmiyor, `uploaded` listesine giriyor. Billiga/pricerunner için `audit` yasal alan istemiyor ama `bulk` her pazarda yasal alanı zorunlu kılıyor (tutarsız).

## 4. Kural + fiyat (K-05, K-06): kısmen

- Marka yasağı (`Bosch × idealo`) eklendi: toplu yüklemede Bosch `blocked` ("Satış yasağı … idealo yasak"), idealo dışı pazarda önizleme izin veriyor. Kural güncelleme ve silme çalışıyor.
- Çalışmayanlar:
  - Şirket bazlı kural (`Firma A × Roline`) önizlemede doğru ("yasak") ama toplu yüklemede etkisiz: tam bir Roline ürünü `uploaded` oldu. `bulk` kural motoruna şirket bilgisini geçirmiyor.
  - `build` (XML) kural motorunu hiç çağırmıyor: yasaklı marka (Bosch) feed XML'inde duruyor.
- Fiyat kararı: maliyet 100, kargo 5, marj %5, amazon komisyonu %15 → taban 129,42 (beklenen: (100+5+5)/0,85 yukarı yuvarlanmış). Rakip 120: `skip`, fiyat `null`. Rakip 140: `match`, 140. Rakip yok: `hold`. Stratejisi olmayan şirket: `hold`. Bilinmeyen pazar yeri: 400.
- `GET /api/admin/rules/strategy` (strateji listesi) **405 "POST bekleniyor"** dönüyor: `strategy` hem GET hem POST kümesinde, POST kümesi önce eşleşiyor. Strateji paneli listeyi okuyamaz.
- Fiyat kararını gerçekten uygulayan bir uç yok (yalnız karar dönüyor).

## 5. Lojistik (K-15–K-17): kısmen

- 10 bölgesine (Berlin) DHL 25 başarılı, GLS 15 başarılı + 10 kayıp, UPS 22 başarılı + 3 geç; 80 bölgesine (Münih) GLS 25 başarılı, DHL 10 başarılı + 15 kayıp girildi.
- Seçim: Berlin 100 € → DHL. Münih → GLS. Berlin 300 € (eşik 250) → UPS, ek maliyet 1,5 €, gerekçe metni skorları listeliyor. Şirket adresi (`businessAddress:true`) 100 € ile de UPS. Veri olmayan bölge ve 20'den az örnek → varsayılan DHL. Geçersiz posta kodu 400.
- Sapmalar:
  - `orderTotal` string gelirse (`"300"`) sessizce 0 sayılıyor, UPS kuralı çalışmıyor.
  - Seçim sipariş akışına bağlı değil: `labelFor` hiçbir yerden çağrılmıyor, siparişte kargo firması alanı yok. `GET /shipping/log` boş kaldı (günlüğü yalnız `labelFor` dolduruyor, `choose` yazmıyor).
  - UPS tutar eşiği ve varsayılan firma için HTTP ucu yok (`setConfig` yalnız kod içi): 405.

## 6. İade (K-13, K-14): çalışıyor

- Sipariş (`/api/orders`) → `request` (201) → aynı kaleme ikinci açık iade 409 → storno öncesi ödeme reddedildi → `storno` (ST-2026-00001; net 25,77, KDV 4,90, brüt 30,67) → ikinci `storno` aynı numarayı döndürdü → etiketsiz "ulaştı" 400 → `label` → `received` → `settle` (PayPal, simüle) → `refunded`.
- İkinci ödeme: yeni ödeme yok, `duplicate:true`, aynı ödeme kimliği.
- Eşik üstü (306,70 €, eşik 200): onaysız `settle` → `pending_approval`, ödeme `null`. Görüntüleyen `approve:true` → 403. Düzenleyen `approve:true` → `refunded`.
- Eksikler:
  - Onay için yalnız "oturumdaki kullanıcı" gerekiyor: herhangi bir düzenleyen, iadeyi kendisi açıp kendisi onaylayabilir (dört göz yok, onaylayıcı rolü yok).
  - Doğrulanmamış (`unverified`) sipariş için iade talebi 201 dönüyor, sipariş durumu denetlenmiyor.
  - İade ödendikten sonra sipariş durumu ve ciro değişmiyor (ciro iade öncesiyle aynı).
  - İade talebini yalnız panel açabiliyor; müşteriye dönük bir iade ucu yok.

## 7. Destek (K-21–K-23): kısmen

- `poststelle@finanzamt-berlin.de` → `critical`, `needs_human`, uyarı kaydı düştü, otomatik cevap denemesi 409. "Anwalt/Mahnbescheid" metni normal adresten de `critical`.
- İade talebi → `reply` ile %20 teklifi (Almanca metin) → ikinci teklif 409. Müşteri cevapları: "Ja, einverstanden" → `offer_accepted`; "Retoure" ve "Nein, … Retoure" → `label_required`; "Vielleicht…", "Ja, aber nicht ohne Rücksendung", "ok danke, aber … nein" → `needs_human`; "Ja" → kabul.
- Şikayet raporu: aynı üründe 5 şikayet raporda, 1'lik değil. `minCount=1` ile ikisi de geliyor.
- Eksikler:
  - `offer_accepted` yalnız durum: `refunds` modülünde %20'lik iade kaydı ya da ödeme açılmıyor.
  - `label_required` yalnız durum: iade etiketi üretilmiyor, iade kaydı açılmıyor.
  - Şikayet kaydı elle `POST /support/complaint` ile giriliyor; `complaint` türü ticket şikayet kaydına dönüşmüyor.
  - Şikayet eşiği (`setMinCount`) için HTTP ucu yok. Ticket'a atama/çözüm ucu yok (`assignedTo` hep `null`); personel metriğini beslemiyor.
  - "Tamam kabul ediyorum" (Türkçe) `needs_human`'a düşüyor; kabul/ret kalıpları yalnız Almanca.

## 8. Pano (K-18–K-20): kısmen

- `GET /api/admin/dashboard/revenue`: ciro görünüyor (iki sipariş: 393,83 €). `day` kırılımı doğru.
- **`GET /api/admin/dashboard` yeni pano özetini değil eski özeti döndürüyor** (ciro sayı, `topProducts` vb.): eski `adminDataRoutes` yeni işleyiciden önce yakalıyor. Yeni `summary()` (ciro + hedefler + spotlar) HTTP'den erişilemiyor.
- `groupBy=company|shop|market` hepsi tek satır `bilinmiyor`: sipariş kaydında şirket/mağaza/pazar yeri alanı yok.
- Hedef: `target` 10, `consume` 3 → kalan 7 (doğru); fazla tüketim 0'da duruyor. Ancak yeni sipariş verince sayaç düşmüyor (7 → 7); yalnız elle `consume`.
- Spot: `poolId` = katalog kimliği verildiğinde `sold:14, remaining:6, perDay, daysLeft:1`, eksik mağazalar `["Shop2","Shop3"]` doğru. `poolId` = havuz kimliği (`p_…`) verildiğinde `sold:0`: sipariş kalemi katalog kimliği taşıyor, havuz kimliğiyle eşleşme yok.
- Doğrulama açıkken (ikinci örnek): doğrulanmamış sipariş ciroya girmedi (0), e-posta onayından sonra girdi.
- Denenemedi: gece sıfırlama (zaman ileri alınamıyor), `stale` (15 dk beklemek gerekirdi).

## 9. Reklam (K-10–K-12): kısmen

- Yetkisiz marka paylaşımı 409. `brand` ile yetki (kanıt metniyle) sonrası geçti (marka büyük/küçük harf duyarsız), uyarı olarak "sahte aciliyet" kalıbı döndü. Aynı kanalda ikinci paylaşım: 429 (saatlik tavan). Başka kanal bağımsız: 201.
- Kelime: negatif ekleme 200, aynı kelimeyi pozitife ekleme 409. Komut `Yaz kampanyasına "ücretsiz" negatif kelimesi ekle` uygulandı; "şu kampanyaya negatif kelime ekle" `applied:false` ("Kampanya belirsiz"); hem ekle hem kaldır geçen komut yapılmadı.
- Alıcı listesi: sepet terk kaydı onaysızken listeye girmedi (`skippedNoConsent:1`); onay e-postasındaki bağlantı tıklanınca girdi. Eski müşteri listesi de aynı biçimde onay sonrası doldu. Geçersiz `kind` 400.
- Eksikler:
  - Kampanya kelime listesi okunamıyor: durum ucu yalnız sayı döndürüyor, `keywords()` için uç yok.
  - İlk alışveriş indirimli uygulama metni (`appPromo`) için uç yok (405); paylaşım tavanları ve indirim yüzdesi HTTP'den değiştirilemiyor.
  - Marka yetkisini herhangi bir düzenleyen serbest bir "kanıt" metniyle verebiliyor (belge yükleme ya da onay yok).
- Denenemedi: günde 4 paylaşım tavanı (saatlik tavan önce doluyor, zaman ileri alınamıyor).

## 10. Analiz (K-27–K-29): kısmen

- `import` (trendyol/api, amazon/licensed) 200; `scrape` kaynağı 400. `compare`: EUR'a çevrilmiş fiyatlar ve `spread:32`. Veri olmayan EAN 404.
- Arbitraj: Patchkabel için net marj **15,28 €** (alış 13, satış 45, kargo 7,5, gümrük 2,47, komisyon 6,75); `minMargin:30` ile liste boş. Elle hesapla uyuşuyor.
- Huni: 4 onaylı + 2 onaylı ziyaretçi ve 3 onaysız ziyaretçi gönderildi; `consented:6`, `skippedNoConsent>0`, "Ödeme" adımı yalnız onaylı 2 kişi.
- Eksikler:
  - Kohort: bölge kırılımı her zaman `veri yok`: olay alımı `rg` alanını saklamıyor.
  - Hava/iade/şikayet verisi için içe aktarma ucu yok (`importContext`, 405).
  - Pazar fiyat verisi tek tek satır JSON'u ile giriliyor; dosya/CSV yükleme yok (panel için ek iş).

## 11. B2B (K-25, K-26): çalışıyor

- Satıcı/alıcı kaydı (VAT'sız alıcı 400). Teklif, eşleştirme (puan 65, gerekçe metni), `quote` 40 adet × 10,50: net 420, komisyon %3 = 12,60, brüt 432,60 (beklenen).
- `deal` 201; kalan adetten fazlası 409; kalan 100 → 60; `open → shipped` 400; `cancelled` sonrası kalan 100'e döndü; iptal sonrası geçiş 400; ikinci anlaşma `confirmed → shipped → closed` (`invoiceParty:seller`) geçti.
- Personel: üç kişi iş kaydı → `warning` (5'ten az); iki kişi daha eklenince uyarı kalktı.
- Eksik: ticket kapanışı personel metriğini otomatik beslemiyor, kayıt elle `staff/work` ile giriliyor. B2B özetinde platformun toplam komisyon geliri alanı yok.

## Bulgular

| # | Önem | Akış | Uç | Gönderilen | Dönen | Beklenen | Öneri |
|---|---|---|---|---|---|---|---|
| 1 | Yüksek | 4 | `POST /feed/bulk` | Şirket kuralı (`Firma A × Roline`), tam Roline ürünü | Ürün `uploaded` | `blocked` | `bulk` kural motoruna şirketi (mağaza → kiracı) geçirsin; kimlik yoksa şirket kuralı sessizce atlanmasın |
| 2 | Yüksek | 4 | `POST /feed/build` | Bosch × idealo yasağı varken idealo XML | Bosch ürünü XML'de | Yasaklı marka XML dışında | `build` içinde de `evaluate` çağrılsın |
| 3 | Yüksek | 8 | `GET /dashboard` | Pano özeti | Eski özet (ciro sayı, `topProducts`…) | `revenue.rows + targets + spots` | `adminDataRoutes` içindeki `/dashboard`'u kaldır ya da yeni özeti başka yola taşı |
| 4 | Yüksek | 8, 2 | `GET /dashboard/revenue?groupBy=` | Sipariş sonrası şirket/mağaza/pazar kırılımı | Hep tek satır `bilinmiyor` | Şirket/mağaza bazında ciro | Sipariş kaydına `tenantId`, `shopId`, `market` ekle |
| 5 | Yüksek | 8, 1 | `POST /dashboard/spot` | `poolId` = havuz kimliği | `sold:0` | Siparişten gelen adet | Sipariş kalemine `poolId` yaz ya da katalog kimliği ↔ havuz eşlemesi kur |
| 6 | Yüksek | 5 | `POST /shipping/choose`, `/shipping/log` | Sipariş sonrası günlük | Günlük boş, siparişte kargo yok | Siparişe firma + etiket, günlüğe kayıt | Sipariş onayında `labelFor` çağır, sonucu siparişe yaz; `choose` da günlüğe yazsın |
| 7 | Yüksek | 2 | Tüm yönetici uçları | Kiracıya atanmış kullanıcı | İki kiracıyı ve tüm siparişleri görüyor | Yalnız kendi kiracısı | `scopeOf` ile liste ve yazma uçlarını süz |
| 8 | Orta | 2 | `POST /tenants/key`, `/tenants/create` | Düzenleyen rolü | Anahtar kaydetti (200), kiracı açtı (201) | 403 | Kiracı ve anahtar uçlarını yalnız yöneticiye aç |
| 9 | Orta | 4 | `GET /rules/strategy` | Strateji listesi | 405 "POST bekleniyor" | 200 liste | `strategy` adını POST kümesinden ayır (yazma `strategy-set` gibi) |
| 10 | Orta | 3 | `POST /feed/bulk` | `shops:["olmayan-magaza"]` | `uploaded` içinde | 400/404 | Mağaza kimlikleri kiracı belgesinden doğrulansın |
| 11 | Orta | 6 | `POST /refunds/settle` | Düzenleyen, `approve:true`, eşik üstü | `refunded` | Ayrı onaylayıcı | Onayı yönetici rolüne bağla; iadeyi açan kişi onaylayamasın |
| 12 | Orta | 6 | `POST /refunds/request` | Doğrulanmamış sipariş | 201 | 400 | Sipariş durumu `new` ve sonrası olmalı |
| 13 | Orta | 6, 8 | `settle` sonrası | İade ödendi | Ciro ve sipariş durumu aynı | İade tutarı ciroda görünsün | Ciroya iade düşümü ya da ayrı "net ciro" alanı |
| 14 | Orta | 7 | `POST /support/customer` | "Ja" (kabul) | `offer_accepted`, iade kaydı yok | %20 iade kaydı açılsın | Kabulde `requestRefund` + kısmi tutar; `label_required`'da iade etiketi |
| 15 | Orta | 8 | `POST /orders` sonrası `GET /dashboard/target` | Sipariş | Sayaç 7 → 7 | Geri sayım | Siparişte kategori hedefini otomatik `consume` et |
| 16 | Orta | 5 | `POST /shipping/config` | `upsMinTotal:150` | 405 | 200 | `setConfig` için uç ekle |
| 17 | Orta | 9 | `GET /ads` | Kelime listesi | Yalnız sayılar | Kelimeler görünsün | `keywords()` için uç ekle |
| 18 | Orta | 9 | `POST /ads/promo`, `/ads/limits` | Uygulama metni, tavan | 405 | Metin / ayar | `appPromo` ve tavan ayarı için uç |
| 19 | Orta | 9 | `POST /ads/brand` | Düzenleyen, serbest metin | 200 | Yönetici onayı / belge | Marka yetkisini yöneticiye bağla |
| 20 | Orta | 10 | `GET /insights/cohort` | Olaylar | `region: "veri yok"` | Bölge dağılımı | Olay alımında `rg` saklansın (ya da alan kaldırılsın) |
| 21 | Orta | 10 | `POST /insights/context` | Hava/iade/şikayet satırı | 405 | 200 | `importContext` için uç |
| 22 | Orta | 7 | `POST /support/min` | Eşik 3 | 405 | 200 | `setMinCount` için uç; ticket atama ve çözüm ucu |
| 23 | Düşük | 5 | `POST /shipping/choose` | `orderTotal:"300"` | DHL (tutar 0 sayıldı) | UPS ya da 400 | Sayısal olmayan tutarı 400 ile reddet |
| 24 | Düşük | 1 | `POST /pool/ean` | Aynı ürün/pazar, ikinci EAN | 200 | 409 ya da açık öncelik | Pazar başına tek EAN |
| 25 | Düşük | 1 | `POST /pool/ean` | `1234567890123` | 200 | Kontrol hanesi hatası | GS1 kontrol hanesi doğrula |
| 26 | Düşük | 1 | `POST /undo` | pool-merge `changeId` | 400 | Geri alma | Genel geri alma pool-merge'i `unmergeById`'e yönlendirsin |
| 27 | Düşük | 3 | `bulk` / `audit` | billiga, yasal alansız ürün | `audit` tamam, `bulk` engelliyor | Tutarlı kural | Yasal alan kuralı tek yerde tanımlansın |
| 28 | Düşük | 7 | `POST /support/customer` | "Tamam kabul ediyorum" | `needs_human` | Kabul | Türkçe kabul/ret kalıpları (ya da panelde bilinçli yalnız Almanca) |

## Eksik parçalar (uçtan uca akışı tamamlamak için)

1. **Sipariş kaydında kiracı/şirket/mağaza/pazar yeri alanı yok.** Bu yüzden ciro kırılımı (K-18), hedef sayaçları (K-19), spot satış sayımı (K-20) ve kural motorunun şirket kuralları çalışmıyor. Hiçbir yönetici ucu kiracı kimliği istemiyor ve oturumdaki kullanıcıyı kiracıya göre süzmüyor.
2. **Havuz ↔ katalog ↔ sipariş kalemi bağı yok.** Sipariş kalemi katalog kimliği taşıyor, havuz ürünü `p_…` kimliğiyle duruyor. Spot takibi ve "havuz ürünü satıldı mı" sorusu bu bağ olmadan cevapsız.
3. **Kargo seçimi (`labelFor`) sipariş akışına bağlı değil**, siparişte kargo/etiket alanı yok, seçim günlüğü dolmuyor.
4. **Destek sonuçları eylem üretmiyor:** kabul edilen %20 teklifi ve istenen iade etiketi `refunds` modülüne gitmiyor. Şikayet türündeki ticket şikayet kaydına dönüşmüyor. Çözülen ticket personel metriğini beslemiyor.
5. **İade → sipariş/ciro geri bildirimi yok:** iade sonrası sipariş durumu ve ciro değişmiyor; müşteriye dönük iade talebi ucu yok.
6. **Paneli besleyecek okuma/yazma uçları eksik:** strateji listesi (GET 405), kampanya kelime listesi, kargo eşiği/varsayılan firma, şikayet eşiği, paylaşım tavanları, uygulama indirim metni, hava/iade/şikayet içe aktarma.
7. **Yeni pano özeti erişilemiyor** (`GET /dashboard` eski işleyiciye gidiyor).
8. **Kural motoru iki yerde atlanıyor:** `build` hiç çağırmıyor, `bulk` şirket bilgisini geçirmiyor.
9. **Rol sınırı yok:** düzenleyen rolü kiracı açıyor, API anahtarı yönetiyor, marka yetkisi veriyor, eşik üstü iadeyi onaylıyor.
10. **Fiyat kararı uygulanmıyor:** `price` yalnız karar döndürüyor; fiyatı ürüne yazan ya da panele iten uç yok.

## Denenemedi

- Günlük hedeflerin gece sıfırlanması, günde 4 paylaşım tavanı, pano `stale` bayrağı (zaman ileri alınamıyor).
- Gerçek e-posta, Mollie/PayPal, Meta/Google Ads çağrıları (modüller simülasyon; yalnız simülasyon kaydı doğrulandı).
- Tarayıcı paneli (yalnız HTTP uçları denendi; ekran akışı denenmedi).
