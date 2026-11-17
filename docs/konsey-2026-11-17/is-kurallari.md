# İş Kuralları Doğruluğu — Konsey İncelemesi

**Tarih:** 2026-11-17
**İnceleyen:** Konsey üyesi — iş kuralları doğruluğu
**Kapsam:** `demo/services/` altında bugün eklenen 11 modül: `pool`, `refunds`, `b2b`, `dashboard`,
`price-strategy`, `shipping`, `insights`, `staff`, `rules`, `feed` (+ bağlı oldukları `pricing`,
`catalog`, `orders`, `lib/store.mjs`, `db/documents.mjs`).
**Amaç:** Mevcut birim testlerinin **kaçırdığı** iş mantığı hatalarını bulmak. Var olan testler tekrar
edilmedi; `test/unit-*.mjs` dosyalarındaki 45 test adı tarandı ve aşağıdaki bulguların hiçbiri bu
testlerce kapsanmıyor.

## Yöntem

Node v22.22.2 ile, projeye dokunmadan, geçici `DATA_DIR` üzerinde modüller doğrudan içe aktarılıp
çalıştırıldı (`test/unit.mjs`'teki ortam değişkeni deseni). Deneme betikleri:

`/tmp/claude-1000/-home-wpu--claude-spares-spare-vE7sF1/c1da5ee5-4384-4912-ab29-7360fe5b5727/scratchpad/`
altında:

| Betik | Ne denendi |
|---|---|
| `boot.mjs` | ortak ortam kurulumu (DATA_DIR, ADMIN_PASSWORD, SESSION_SECRET) |
| `p1-pool.mjs` | eşleştirme sırası, yanlış birleştirme, merge/unmerge yuvarlak gidiş, çift geri alma |
| `p2-refunds.mjs` | KDV yuvarlaması, parçalı/toplu storno sapması, durum makinesi erişilebilirliği, settle idempotansı, uç girdiler |
| `p3-b2b.mjs` | komisyon kuruş yuvarlaması, parçalı/toplu sapma, durum tablosu, çift iptal, stok geri dönüşü, uç girdiler |
| `p4-price.mjs` | taban fiyat formülünün cebirsel doğrulaması, komisyon→%100 kenar durumu, marj sınırları, `*` strateji sızıntısı |
| `p5-dash.mjs`, `p6.mjs` | kuruş birikimi, bozuk `total` değerleri, İstanbul/Berlin gün anahtarı, yaz saati/ay sonu/yıl dönümü, gece sıfırlaması, saat gruplaması, arbitraj |
| `p7.mjs` | kural motoru eşleşmesi, feed denetimi ↔ toplu yükleme tutarsızlığı, UPS kuralı, personel metrikleri |
| `p8-rules.mjs` | `bulkUpload`'ın kural motoruna gönderdiği alanlar (izole kanıt) |
| `p9-race.mjs`, `p10-race2.mjs` | iki ayrı süreç aynı veritabanına yazarken kayıp güncelleme (`store.tx` olan / olmayan modüller) |
| `p11.mjs` | yanlış birleştirmenin feed çıktısına etkisi |

Gözlenen: 16 bulgu (3 kritik, 5 yüksek, 5 orta, 3 düşük) ve 14 temiz çıkan davranış.

---

## Bulgular

| # | Önem | Konu | Dosya:satır | Yeniden üretim | Beklenen / Gözlenen | Öneri |
|---|---|---|---|---|---|---|
| 1 | **Kritik** | Havuz: aynı vendor + aynı başlık, **farklı MPN** iki ürün tek kayda birleşiyor; ikinci ürünün MPN'i, fiyatı ve görseli feed'den düşüyor | `services/pool.mjs:83-86` (`findMatch`, (b) başarısızsa (c)'ye düşüyor) | `p11.mjs`: `ingest({src:'wawi',ref:'A',title:'Akkuschrauber GSR 12V',vendor:'Bosch',mpn:'06019H8100',eans:['4006381333931'],price:99})` sonra aynısı `ref:'B', mpn:'06019H8200', eans:['5901234123457'], price:149` | Beklenen: iki ayrı havuz kaydı (MPN'ler farklı). Gözlenen: tek kayıt; `mpn` 06019H8100 kalıyor, iki EAN aynı ürüne bağlanıyor, `buildFeed` yalnız 99 €'luk ürünü yayınlıyor — 149 €'luk ürün hiçbir pazar yerinde görünmüyor | (b) adımında **her iki kayıtta da MPN varsa ve farklıysa** (c) başlık eşleştirmesine düşmeyi engelle; yalnız MPN'i boş olan kayıtlar için başlık eşleştirmesi yap |
| 2 | **Kritik** | Toplu yükleme kural motoruna `company` ve `category` göndermiyor → mevzuat kaynaklı satış yasakları sessizce atlanıyor | `services/feed.mjs:222` | `p8-rules.mjs`: `addRule({vendor:'Bosch',category:'elektronik',reason:'AB mevzuatı'})` + `addRule({company:'AcmeGmbH',vendor:'Bosch',reason:'sözleşme'})`, sonra `bulkUpload({brands:['Bosch'],shops:['shop1'],market:'idealo'})` | Beklenen: ürün `blocked`. Gözlenen: `uploaded:[{poolId,shopId,title:'Bosch matkap'}]`, `blocked:[]`. Aynı kural `evaluate({vendor:'Bosch',market:'idealo',category:'elektronik'})` ile çağrılınca `allowed:false` dönüyor | `bulkUpload` çağrısına `company` (mağaza/kiracı) ve ürünün kategorisini ekle; `rules.evaluate` eksik alan geldiğinde o alana sahip kuralları **atlamak yerine** "belirsiz" sayıp engellesin ya da en az uyarı üretsin |
| 3 | **Kritik** | Tek bir bozuk `total` alanı tüm ciro raporunu çöpe çeviriyor (`Infinity` → JSON'da `null`) | `services/dashboard.mjs:56` (`cents = n => Math.round(Number(n)*100) \|\| 0`) | `p6.mjs` A bölümü: siparişe `total: Infinity` olan tek kayıt ekle, `revenue({})` çağır | Beklenen: bozuk kayıt atlanır/işaretlenir. Gözlenen: `total: Infinity`; JSON'a serileştirilince `"total": null` — panoda ciro boş görünüyor. Ayrıca `total:'12,50'` (TR ondalık) sessizce **0 €** sayılıyor, `total:-500` olduğu gibi toplanıyor | `cents`'te `Number.isFinite` denetimi; sonlu olmayan/negatif `total`'ı rapora alma, ayrı bir `skipped` sayacında bildir |
| 4 | Yüksek | Storno faturası `requested` durumunda kesilebiliyor; sonra iade reddedilince **ortada ödenmemiş bir storno faturası ve tüketilmiş bir fatura numarası** kalıyor (müşteriye e-posta da gidiyor) | `services/refunds.mjs:141-142`, `:199` | `p2-refunds.mjs` D bölümü: `requestRefund` → `storno(id)` → `reject(id)` | Beklenen: storno yalnız `received`/`pending_approval`/`refunded` için kesilir, ya da red sonrası fatura geçersizleştirilir. Gözlenen: `status:'rejected'`, `invoiceNo:'ST-2026-00004'`, fatura kaydı duruyor | `storno()` içinde durum kontrolü (`received` ve sonrası); ya da `reject()` fatura varsa engellesin / iptal kaydı üretsin |
| 5 | Yüksek | Feed denetimi "temiz" diyor, toplu yükleme aynı ürünü engelliyor: `checkProduct` yasal alanların **birini** yeterli sayıyor, `bulkUpload` **üçünü birden** istiyor ve yasal alan gerektirmeyen pazar yerlerinde de istiyor | `services/feed.mjs:79` (`some`) vs `:212,217` (`filter(... !txt)`) | `p7.mjs` D–E bölümü: `legal:{representative:'Sadece temsilci'}` olan ürün; `checkProduct(p,'idealo')` → `ok:true`; `auditFeed('idealo')` → `problems:0`; `bulkUpload({brands:['Zeta'],shops:['shop1'],market:'billiga'})` | Beklenen: denetim ve yükleme aynı kuralı uygular. Gözlenen: audit `okCount:2, problems:0`; `bulkUpload` `blocked:[{reason:'Eksik yasal alan: address, taxId'}]`, `uploaded:[]` | Yasal alan kuralını tek yere al (`LEGAL_FIELDS` zorunluluk düzeyi + pazar yeri bazlı); `checkProduct` ve `bulkUpload` aynı fonksiyonu çağırsın |
| 6 | Yüksek | `store.tx` kullanmayan modüllerde **süreçler arası kayıp güncelleme**: oku-değiştir-yaz deseni tüm belgeyi eziyor | `lib/store.mjs` + `db/documents.mjs:17` (`saveDoc` tek INSERT…ON CONFLICT); etkilenen: `shipping`, `dashboard`, `rules`, `price-strategy`, `insights`, `feed` | `p9-race.mjs`: aynı `DATA_DIR` üzerinde iki Node süreci paralel olarak 200'er `recordDelivery({carrier:'dhl',zip:'10115',outcome:'delivered'})` çalıştırır (öncesinde 200 ısınma) | Beklenen: `samples: 600`. Gözlenen: `samples: 400` — 200 kayıt kayboldu. Karşılaştırma: `store.tx` kullanan `staff.recordWork` aynı testte **600/600** doğru sonuç verdi (`p10-race2.mjs`) | Belge yazan tüm fonksiyonları `store.tx(() => { load(); …; save(); })` içine al (`refunds`, `b2b`, `pool`, `staff` zaten böyle). Tek süreçte risk yoktur (kod eşzamanlı değil); risk çok süreçli/çok işçili dağıtımda gerçekleşir |
| 7 | Yüksek | Gün anahtarı Europe/Istanbul: Alman işletmesi için ciro **yanlış güne ve yanlış yıla** yazılıyor | `services/dashboard.mjs:33-34` | `p5-dash.mjs` C bölümü: `t = Date.parse('2026-12-31T21:30:00Z')` (Berlin 31 Aralık 22:30) olan sipariş, `revenue({groupBy:'day'})` | Beklenen (Alman mali yılı): `2026-12-31`. Gözlenen: `2027-01-01`. Aynı şekilde `2026-01-31T22:30:00Z` → `2026-02-01` (ay sonu kayması). Yaz saati geçişinde (2026-03-28T22:30Z) IST `2026-03-29`, Berlin `2026-03-28` | Gün anahtarının saat dilimini yapılandırılabilir yap (kiracı/şirket bazlı); Alman cirosu için `Europe/Berlin`. Hangi dilimin iş kararı olduğu **doğrulanamadı** — ürün sahibine sorulmalı |
| 8 | Yüksek | Saat bazlı dönüşüm analizi sabit UTC+3 ile hesaplanıyor; Alman ziyaretçi için yazın 2, kışın 1 saat kayıyor | `services/insights.mjs:30, 256` | `p6.mjs` C bölümü: tek `view` olayı; `cohort({days:7}).hour` ile `Intl.DateTimeFormat(…,{timeZone:'Europe/Berlin'})` karşılaştırıldı | Beklenen (Alman ziyaretçi): Berlin saati. Gözlenen: `hour key = 6` iken Berlin saati `4` (yaz saatinde 2 saat fark; kışın 1 saat). Ayrıca sabit kaydırma yaz saati geçişinde tutarsızlaşır | `tzOffsetH` yerine `Intl.DateTimeFormat`/`timeZone` kullan; dilimi `dashboard` ile aynı kaynaktan al |
| 9 | Orta | Komisyon kuruş yuvarlaması anlaşma bazında yapılıyor; aynı miktarın parçalanması komisyonu **%96 artırıyor** | `services/b2b.mjs:192-196` | `p3-b2b.mjs` B bölümü: `unitPrice:0.17`; 100 × `quote(qty:1)` komisyon toplamı vs tek `quote(qty:100)` | Beklenen: yakın tutarlar. Gözlenen: 100 ayrı anlaşma = **1,00 €**, tek anlaşma = **0,51 €**. Ayrıca `unitPrice:0.01, qty:1` → komisyon **0,00 €** (platform hiç kazanmıyor) | Küçük anlaşmalar için asgari komisyon (ör. 0,01 € taban) tanımla; ya da komisyonu alıcı×satıcı×dönem bazında toplayıp fatura anında yuvarla. İş kararı — **doğrulanamadı**, sözleşmeye bağlı |
| 10 | Orta | UPS iş kuralı, bölgede yeterli teslimat verisi yokken **hiç uygulanmıyor** — yani açılış döneminin tamamında | `services/shipping.mjs:151-159` | `p7.mjs` F bölümü: temiz veritabanında `chooseCarrier({zip:'10115', orderTotal:1000, businessAddress:true})` | Beklenen: şirket adresi → UPS. Gözlenen: `carrier:'dhl'`, gerekçe "güvenilir veri yok … varsayılan firma DHL". Yalnız DHL güvenilirken de UPS seçilmiyor | Veri yoksa UPS kuralını `ranked` sırasından bağımsız uygula (UPS etkinse doğrudan seç) ya da kuralın askıya alındığını çıktıda açıkça bildir |
| 11 | Orta | `orderTotal` sayı değilse yüksek tutar kuralı sessizce devre dışı kalıyor | `services/shipping.mjs:151` (`Number.isFinite(orderTotal) ? … : 0`) | `p7.mjs` F bölümü: `chooseCarrier({zip:'10115', orderTotal:'1000'})` (string) | Beklenen: 1000 € > 250 € eşiği → UPS (ya da `invalid` hatası). Gözlenen: `total = 0`, kural uygulanmıyor, sessizce DHL | Sayı olmayan `orderTotal`'da `fail('invalid', …)` fırlat; sessizce 0'a düşürme |
| 12 | Orta | Fiyat stratejisi: tanımsız/yanlış yazılmış şirket adı sessizce `*` varsayılan stratejisine düşüp **fiyat değiştiriyor** | `services/price-strategy.mjs:43` (`getStrategy`), `:84-95` | `p4-price.mjs` E bölümü: `setStrategy({company:'*',minMargin:0.20})` sonra `priceDecision({market:'amazon',cost:10,competitorPrice:100})` (company yok) | Beklenen: şirket belirsizken `hold`. Gözlenen: `action:'match', price:100` — hiç tanımlanmamış/yazım hatalı şirket için otomatik fiyat değişikliği | `company` boşsa `hold('şirket belirtilmedi')`; `*` yalnız bilinen ama kaydı olmayan şirketler için kullanılsın |
| 13 | Orta | Negatif fiyatlı kalem için iade kaydı açılıyor; tutar negatif ve **onay eşiğine takılmıyor** | `services/refunds.mjs:118` (`amount` hesabı), `:218` (`cents(r.amount) > cents(APPROVAL_THRESHOLD)`) | `p2-refunds.mjs` H bölümü: siparişe `{id:'f',price:-5,qty:2}` kalemi; `requestRefund({orderId:'o6',items:[{id:'f',qty:1}]})` | Beklenen: `invalid`. Gözlenen: `amount: -5` olan iade kaydı; negatif tutar her zaman eşiğin altında olduğu için insan onayı istenmiyor | `requestRefund`'da kalem fiyatı için `Number.isFinite(price) && price >= 0` denetimi; `amount <= 0` ise `invalid` |
| 14 | Orta | Günlük sayaç sıfırlaması gün **eşitsizliğine** bakıyor, sıralamasına değil: saat geriye giderse o günün ilerlemesi siliniyor | `services/dashboard.mjs:160-167` (`resetDaily`) | `p6.mjs` B2 bölümü: `consume` (10 Haz) → `listTargets(11 Haz)` → `listTargets(10 Haz)` | Beklenen: geçmiş bir `now` ile çağrı sayaçları bozmaz. Gözlenen: `left` 8 → 10, o günün tüm tüketimi sıfırlandı (NTP düzeltmesi / farklı saatli işçi süreç bu durumu üretir) | `lastReset`'i tarih dizesi yerine karşılaştırılabilir tutup yalnız **ileri** gidişte sıfırla (`today > lastReset`) |
| 15 | Düşük | EAN doğrulaması modüller arasında tutarsız: `insights` 9/10/11 haneli EAN kabul ediyor, `pool` reddediyor | `services/insights.mjs:72` (`/^\d{8,14}$/`) vs `services/pool.mjs:30` (`[8,12,13,14]`) | `p6.mjs` D bölümü: `importMarketData({market:'amazon',source:'api',rows:[{ean:'123456789',price:10}]})` | Beklenen: aynı kural. Gözlenen: `imported:1`; `pool.isEan('123456789') === false` — karşılaştırma/arbitraj verisi havuzdaki hiçbir ürüne bağlanamaz | `pool.isEan`'ı tek doğrulama kaynağı yap, `insights` onu içe aktarsın |
| 16 | Düşük | Çok büyük sayılarda kuruş hassasiyeti kayboluyor (üst sınır denetimi yok) | `services/refunds.mjs:38` (`cents`), `services/b2b.mjs:171` (`toCents`), `services/staff.mjs:38` (`ms`) | `p2-refunds.mjs` H: `price:1e15` → storno; `p3-b2b.mjs` F: `unitPrice:1e15`; `p7.mjs` G: `recordWork({ms:1e18})` | Beklenen: `invalid`. Gözlenen: storno `net: 840336134453781.6` (tam kuruş değil), b2b `cents.net: 1e17` (> `MAX_SAFE_INTEGER`), `avgResolutionMs: 333333333333333700` | Tutar ve süre alanlarına üst sınır koy (ör. `Number.isSafeInteger(cents)` ve makul iş üst sınırı) |

---

## Temiz çıkan denetimler

Denendi ve **doğru** davrandı:

1. **Havuz merge/unmerge yuvarlak gidişi** (`p1-pool.mjs` D): `merge` → `unmergeById` sonrası eski
   kayıt alan alan karşılaştırıldı; yalnız `updated` damgası değişiyor, `title`/`vendor`/`mpn`/
   `created`/`data`/EAN'lar/kaynak kayıtları birebir geri geliyor. Keep kaydı da eski haline dönüyor.
   Aynı birleştirme ikinci kez geri alınamıyor (`conflict`).
2. **Havuz EAN ve kaynak kaydı tekilliği**: aynı `(src, ref)` tekrar beslenince kopya üretilmiyor;
   aksan/büyük-küçük harf farkı (`Fön`/`braun` ↔ `Fon`/`Braun`) doğru eşleşiyor; noktalama farkı
   (`Kabel 1,5 m` / `Kabel 1.5m`) ise **eşleşmiyor** — bu, 1 no'lu bulgunun tersi yönde güvenli taraf.
3. **İade durum makinesi eksiksiz**: `requested`'tan tüm durumlar erişilebilir, erişilemeyen durum yok;
   `refunded`/`rejected` bilinçli terminal; geçersiz geçişler `invalid` ile reddediliyor.
4. **`refunds.settle` idempotansı**: ikinci çağrı `duplicate:true` ve **aynı** ödeme kaydını döndürüyor,
   ikinci ödeme üretilmiyor (ödeme kaydı iade kimliğine bağlı).
5. **Storno öncesi ödeme engeli**: faturasız `settle` → `conflict "Önce storno faturası üretilmeli"`.
6. **KDV aritmetiği tutarlı**: `net + vat === gross` her denemede tuttu; parçalı storno ile tek seferde
   storno arasında net toplamı sapması **0,0000 €** (19,99×3 + 0,03×7 denemesi).
7. **Storno sıra numarası** yıl bazında tutuluyor (`ST-2026-00001…`), atlamıyor, tekrar etmiyor; ikinci
   `storno()` çağrısı yeni numara tüketmeden mevcut faturayı döndürüyor.
8. **B2B durum tablosu eksiksiz ve stok geri dönüşü tam**: `open→cancelled` ve `confirmed→cancelled`
   adedi teklife birebir geri veriyor; **ikinci iptal reddediliyor** (`cancelled → cancelled` geçersiz),
   adet ikinci kez geri dönmüyor; `shipped` bilinçli olarak iptal edilemiyor.
9. **B2B girdi doğrulaması**: `qty` 0/negatif/ondalık, `unitPrice` 0/NaN/3 ondalıklı, stok üstü adet,
   geçersiz incoterm/currency/ülke kodu — hepsi doğru hata koduyla reddediliyor.
10. **Taban fiyat formülü cebirsel olarak doğru**: 6 farklı (maliyet, kargo, marj, pazar yeri) bileşimi
    için `taban − taban×komisyon ≥ maliyet + kargo + maliyet×marj` sağlandı; fark her zaman pozitif ve
    bir kuruşun altında (yukarı yuvarlamadan gelen pay). `rakip < taban` → `skip`, eşitse `match`.
11. **Ciro kuruş birikimi**: 1000 × 0,07 € = tam **70,00 €** (kayan nokta sapması yok).
12. **Günlük hedef gece sıfırlaması** İstanbul gün sınırında doğru çalışıyor (10 Haz 23:00 → aynı gün,
    11 Haz 00:30 → sıfırlandı); hedef düşürülünce `left` negatife inmiyor; `count` 0/ondalık reddediliyor.
13. **Çok süreçli yazmada `store.tx` koruması**: `staff.recordWork` iki paralel süreçte 600/600 kayıt
    (bkz. 6 no'lu bulgunun karşılaştırması).
14. **XML kaçışı** (`feed.escXml`) `& < > " '` ve denetim karakterleri için doğru; `buildFeed` yalnız
    denetimden geçen ürünleri yayınlıyor.

---

## Doğrulanamayanlar (tahmin yazılmadı)

- **Gün anahtarı saat dilimi** (bulgu 7) ve **saat analizi dilimi** (bulgu 8): hangi dilimin iş
  kuralı olduğu sunum/gereksinim belgelerinde bulunamadı. Alman pazarına satış yapan bir işletme
  varsayımıyla "yanlış" işaretlendi; ürün sahibi kararına açık.
- **Komisyon parçalanma sapması** (bulgu 9): `COMMISSION_PCT = 3` zaten "yer tutucu varsayım" olarak
  işaretli; asgari komisyon olup olmayacağı sözleşmeye bağlı.
- **İade kapsamına kargo bedelinin girip girmeyeceği**: `requestRefund` yalnız kalem fiyatlarını
  topluyor, kargo iadesi yok. Alman cayma hakkında standart kargonun iadesi gerekir, ancak bunun
  bilinçli bir kapsam dışı bırakma mı olduğu koddan ve belgelerden anlaşılamadı.
- **`approvedBy` alanının güvenilirliği**: eşik üstü iadede onay, çağıranın verdiği serbest metne
  bağlı. Yönlendirme katmanının bunu oturumdan mı yoksa istek gövdesinden mi doldurduğu bu incelemenin
  kapsamı dışında (güvenlik üyesinin alanı).
