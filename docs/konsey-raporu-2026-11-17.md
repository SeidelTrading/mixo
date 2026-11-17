# Wawi & Mixoutlet iş modülleri: inceleme konseyi raporu

- **Tarih:** 17.11.2026
- **Hazırlayan:** konsey başkanı
- **İncelenen:** `demo/` içine 17.11.2026'da eklenen 13 yeni servis, 11 yeni yönetici uç dosyası ve 10 yeni test dosyası (yaklaşık 4.500 satır). Temel: `23ee530` commit'i.
- **Okuyucu:** ürün sahibi (neyin düzeltileceğine karar veren kişi)
- **Yöntem:** beş üye bağımsız çalıştı. Hiçbiri kod değiştirmedi. Bulguların büyük bölümü ya canlı sunucuya gerçek HTTP isteği atılarak ya da modüller süreç içine alınıp çalıştırılarak kanıtlandı.

## Önem dereceleri

| Derece | Anlamı |
|---|---|
| Kritik | Veri kaybı, para kaybı, güvenlik açığı, hukuki açık ya da sessizce yanlış sonuç |
| Yüksek | Normal kullanımda karşılaşılacak bozuk davranış ya da uygulanmayan kural |
| Orta | Uç durum, tutarsızlık, ölçülebilir performans sorunu |
| Düşük | Küçük cila |

## Üyeler ve bulgu sayıları

| Üye | Rapor | Bulgu | Kritik | Yüksek | Orta | Düşük |
|---|---|---|---|---|---|---|
| Güvenlik | [guvenlik.md](konsey-2026-11-17/guvenlik.md) | 14 | 2 | 3 | 5 | 4 |
| İş kuralları doğruluğu | [is-kurallari.md](konsey-2026-11-17/is-kurallari.md) | 16 | 3 | 5 | 5 | 3 |
| Hukuki uyum | [hukuki-uyum.md](konsey-2026-11-17/hukuki-uyum.md) | 14 | 0 | 3 | 8 | 3 |
| Uçtan uca işlevsellik | [islevsellik.md](konsey-2026-11-17/islevsellik.md) | 28 | — | — | — | — |
| Mimari ve bakım | [mimari.md](konsey-2026-11-17/mimari.md) | 20 | 0 | 4 | 10 | 6 |

Toplam 92 bulgu. İşlevsellik üyesi önem dağılımını kendi raporunda veriyor.

## Başkanın değerlendirmesi

Kartların iş mantığı çekirdeği sağlam: 11 akışın 11'inde beklenen kural çalıştı, para
aritmetiğinin çoğu, durum makineleri, `refunds.settle` idempotansı, AES-256-GCM anahtar
kasası, XML kaçışı ve SQL enjeksiyonu denetimleri temiz çıktı. Kapsam da iyi: yeni
servislerde satır kapsamı %93.

Buna karşılık üç yapısal boşluk var ve üçü de aynı kök nedenden geliyor — **modüller
birbirinden habersiz, paralel yazıldı:**

1. **Kapı var, kapıyı çağıran yok.** Kiracı yalıtımı (`scopeOf`), rol kısıtı, kural
   motoru ve çerez onayı — dördü de yazılmış ama çağrı yerlerine bağlanmamış. Yazılmış
   bir kapı, bağlanmamışsa yok hükmündedir; üstelik "var" göründüğü için daha tehlikelidir.
2. **Sessiz izin (fail-open).** Kural motoru yüklenemezse yasak atlanıyor, şirket alanı
   geçilmezse yasak atlanıyor, onay damgası yoksa olay yine sayılıyor. Her üç yerde de
   varsayılan "izin ver" tarafında; doğrusu "reddet" tarafı olmalı.
3. **Sipariş kaydı modüllerin beklediği alanları taşımıyor.** Kiracı, mağaza ve pazar
   yeri alanı olmadığı için pano kırılımları, hedef sayaçları, spot takibi ve kargo
   seçimi uçtan uca bağlanamıyor. Bu bir hata değil, eksik bir sözleşme.

Ayrıca değişiklik günlüğü kuralı (`ARCHITECTURE.md`: "her yazma `actions` içinden geçer")
13 modülün 12'sinde çiğnenmiş. Tek istisna `pool.merge` ve o da kullanıcıyı yanlış alandan
okuyor.

## Düzeltme sırası

| Sıra | Konu | Neden önce | Kaynak |
|---|---|---|---|
| 1 | Kiracı yalıtımı hiçbir uçta uygulanmıyor | Bir kiracının editörü diğerinin verisini ve anahtar özetlerini görüyor (canlı doğrulandı) | Güvenlik K-1, Mimari #2 |
| 2 | Rol kapısı yeni uçlara uyarlanmamış | `duzenleyen` rolü API anahtarı koyup iptal edebiliyor, 500 €'luk iadeyi kendi onaylayıp ödetebiliyor | Güvenlik K-2, Y-3 |
| 3 | Havuz farklı ürünleri birleştiriyor | Aynı marka + aynı başlık, farklı MPN → ikinci ürünün MPN/fiyat/görseli kayboluyor ve hiçbir pazar yerinde yayınlanmıyor | İş kuralları K-1 |
| 4 | Satış yasakları sessizce atlanıyor | `bulkUpload` şirket/kategori geçirmiyor, `buildFeed` kuralı hiç çağırmıyor, kural motoru fail-open yükleniyor | İş kuralları K-2, İşlevsellik, Mimari #3 |
| 5 | Ciro aritmetiği zehirleniyor | Tek bozuk tutar tüm toplamı `null` yapıyor; `'12,50'` sessizce 0 € sayılıyor | İş kuralları K-3 |
| 6 | Çerez onayı sunucuda uygulanmıyor | Damgasız ve eski olaylar yönetici panosunda, pazarlama önerisinde ve vitrinin çok satanlar şeridinde sayılıyor; onaysız istekte izleme çerezi veriliyor | Hukuki H-01, H-02 |
| 7 | Silme ve erişim hakkı yok | E-posta bazında silme/dışa aktarma yolu yok; kayıtlar süresiz duruyor | Hukuki H-04 |
| 8 | Prototip kirlenmesi | `__proto__` anahtarı `Object.prototype`'a yazıyor | Güvenlik Y-4 |
| 9 | İşlem bütünlüğü | `store.tx` kullanmayan 6 modülde kayıp güncelleme (600 yerine 400 kayıt ölçüldü) | İş kuralları |
| 10 | Sipariş kaydında kiracı/mağaza/pazar yeri alanı | Pano, hedef ve spot akışları bağlanamıyor | İşlevsellik |

## Sonraki tur için bırakılanlar

Bu turda düzeltilmeyecek, ayrı iş olarak planlanması gerekenler:

- **Ortaklaştırma.** Hata sınıfı 13 serviste, uç kabuğu 11 dosyada tekrar ediyor. Mimari
  üyesi 7 ortak dosya öneriyor, yaklaşık 580 satır azalma.
- ~~**Belge büyümesi.**~~ **Kapandı (commit `cc94a80`).** Altı modülün büyüyen kayıtları
  şema sürümü 3 ile ortak `recs` tablosuna taşındı; belgede yalnız ayar, sayaç ve özet kaldı.
  Ölçüm: 10.000 personel kaydında yazma başına 10,7 ms → 0,22 ms (belge 813 KB → 39 B),
  `requestRefund` 131 ms → 1,1 ms (belge 5.233 KB → yalnız sayaç), feed belgesi 574 KB → 308 B
  (tek yazma 35,8 ms → 0,2 ms). Eski kurulumlar kayıpsız yükseliyor; sağlık ucu belge
  boyutlarını ve satır sayılarını raporluyor, 2 MB üstü belgeye uyarı düşüyor.
  Kalan: `insights` içindeki `arbitrage`, `categoryTrends` ve `summary` her çağrıda tüm
  tabloyu belleğe alıyor — 200 bin satır tavanında yavaşlayabilir, sorgu tarafı henüz
  satır katmanına uyarlanmadı.
- ~~**Değişiklik günlüğü.**~~ **Kapandı (commit `324c894`).** `services/audit.mjs` eklendi;
  yasal ve parasal etkili yazmalar (satış yasağı ekleme/kaldırma, marka yetkisi, entegrasyon
  anahtarı, iade ödemesi, havuz birleştirmesi) aynı değişiklik günlüğüne düşüyor. İki gerçek hata
  da düzeldi: `pool.merge` kullanıcıyı yanlış alandan (`user`, doğrusu `username`) okuyordu ve
  kaydı paneldeki geri alma düğmesi tanımıyordu — artık `actions.pool_unmerge` ile uçtan uca
  çalışıyor. Anahtar değeri günlüğe yazılmıyor (yalnız son dört hane), testle denetleniyor.
  Kapsam bilerek dar: hacimli ve etkisiz yazmalar günlüğe girmiyor ki günlük okunabilir kalsın.
- **`ARCHITECTURE.md` eskimiş.** Yeni modüller belgede yok, kapsam oranı (%68) güncel
  değil — ölçülen birleşik kapsam %78,66.
- **Bağlanmamış işlevler.** `shipping.setConfig`, `support.setMinCount` hiçbir uca bağlı
  değil; `shipping.labelFor` sipariş akışından çağrılmıyor.

## Notlar

- İşlevsellik üyesi, takılan bir sunucuyu temizlerken `pkill -f server.mjs` çalıştırdığını
  ve bunun aynı makinedeki diğer üyelerin sunucularını da kapatmış olabileceğini kendi
  raporuna yazdı. Kontrol edildi: diğer üyeler etkilenmedi, çalışmalarını tamamladılar.
- Konseyin deneme betikleri oturumun geçici klasöründe duruyor; projeye yazılmadı.

## Düzeltme turu sonucu (17.11.2026, commit `0617647`)

Konsey raporlarından sonra dört düzeltme paketi paralel çalıştı. Dosya sahipliği çakışmayacak
biçimde bölündü, her paket kendi testini yazdı ve başkan hepsini birlikte doğruladı.

| Sıra | Konu | Durum | Nasıl doğrulandı |
|---|---|---|---|
| 1 | Kiracı yalıtımı | Kısmen kapandı | `services/scope.mjs` eklendi; `tenants` uçları süzülüyor. Kiracı alanı taşımayan 10 modülün okumaları kiracıya bağlı kullanıcıya kapatıldı (`assertShared`) — gerçek süzme için kayıtlara `tenantId` gerekiyor |
| 2 | Rol kapısı | Kapandı | `handler.mjs` içinde tek `ADMIN_ONLY` tablosu; `unit-scope.mjs` tabloyu ve anahtar ucunu sınıyor |
| 3 | Dört göz kuralı | Kapandı | `settle`, `approvedBy === requestedBy` ise reddediyor; onaylayan yalnız oturumdan |
| 4 | Havuz yanlış birleştirme | Kapandı | Konseyin `p11.mjs` betiği: önce tek kayıt ve 149 €'luk ürün görünmez, sonra iki ayrı kayıt ve ikisi de XML'de |
| 5 | Satış yasaklarının atlanması | Kapandı | `p8-rules.mjs`: önce `uploaded:[…]`, sonra `blocked` ve mevzuat gerekçesi. `buildFeed` de kuraldan geçiyor; fail-open dinamik import statik import oldu |
| 6 | Ciro aritmetiği | Kapandı | `p6.mjs`: önce `total: Infinity` ve `'12,50' → 0 €`, sonra `10` ve `12.5`. Negatif tutar da bozuk sayılıyor |
| 7 | Çerez onayı | Kapandı | Onay beyanı olmayan gönderim saklanmıyor, izleme çerezi yazılmıyor, damgasız eski olaylar hiçbir tüketiciye ulaşmıyor |
| 8 | Silme ve erişim hakkı | Kapandı | `/api/privacy/request`, `/export`, `/erase` imzalı bağlantıyla; silme kanıtı kalıyor, ham e-posta karmaya çevriliyor |
| 9 | Prototip kirlenmesi | Kapandı | `lib/safe.mjs`: uçta `isSafeKey` kapısı, serviste `dict()` zemini |
| 10 | İşlem bütünlüğü | Kapandı | Dokuz modülde yazmalar `store.tx` içinde. Kanıt: `tx` geçici kaldırılınca iki süreç 300 yerine 231 kayıt bırakıyor |
| 11 | Sipariş kaydında kiracı/mağaza/pazar yeri | Kapandı (commit `e049e11`) | Sipariş `tenantId`/`shop`/`market` taşıyor (yalnız `settings.origin`'den, istekten değil); `services/order-flow.mjs` kancası hedef sayacını düşürüyor ve kargo firmasını seçiyor |

Başkanın ayrıca kapattığı üç kalem: `scope` `lib/` altından `services/` altına taşındı (bağımlılık
yönü ihlali), genel amaçlı `dict()` `services/rules.mjs`'ten `lib/safe.mjs`'e alındı, ve vitrindeki
"Meine Daten löschen" düğmesinin yanına sunucudaki veri için gerçek istek düğmesi kondu — eski düğme
yalnız tarayıcıyı temizliyordu ve kullanıcıya bunu söylemiyordu.

**Doğrulama:** lint, biçim ve tip denetimi temiz; birim testleri 98'den 129'a çıktı, uçtan uca 154,
tarayıcı 16 — hepsi geçiyor.

**Bir eskimiş test düzeltildi:** `test/e2e.mjs` onay beyanı olmadan olay gönderip 4 kayıt bekliyordu.
Davranış artık doğru olarak saklamıyor; test gönderime `consent: true` ekleyecek biçimde güncellendi
ve yanına "onaysız gönderim 200 döner ama saklanmaz" denetimi eklendi.

**Açık kalanlar:** "Sonraki tur için bırakılanlar" bölümünün tamamı. Düzeltme turunun on bir kaleminin
hepsi kapandı; 1. sıra (kiracı yalıtımı) kayıtlara `tenantId` eklenene kadar kısmen kapalı sayılır —
sipariş kaydı artık taşıyor, diğer modüllerin kayıtları henüz taşımıyor.
