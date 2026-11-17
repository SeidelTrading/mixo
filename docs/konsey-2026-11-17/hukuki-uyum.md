# Hukuki Uyum İncelemesi (Konsey üyesi: Hukuki Uyum)

Tarih: 2026-11-17
Kapsam: `/home/wpu/Desktop/Urunler/Mixo/demo` (yollar bu klasöre göreli). Bugün eklenen modüller: `services/{insights,ads,staff,support}.mjs`, `marketing/{consent,reminders}.mjs`, `services/analytics.mjs`, `app/tracking.js`, `routes/{public,admin-ads,admin-insights,admin-b2b}.mjs`, `db/{export,backup,jobs}.mjs`. Karşılaştırma için `services/storefront.mjs`, `marketing/suggest.mjs`, `db/{records,legacy}.mjs`, `jobs/index.mjs`, `services/{orders,refunds}.mjs`, `app/insights.js` da okundu.
Yöntem: yalnız okuma, bir kez test çalıştırma (`unit-insights/ads/b2b/support`: 28/28 geçti; testler bulguların yokluğunu değil, mevcut davranışı doğrular). Kod değiştirilmedi. Bu belge hukuki görüş değildir; her bulgu "sınır kodda uygulanıyor mu" sorusunun cevabıdır. Avukat görüşü gereken yerler "Açık hukuki sorular" bölümündedir.

## Özet değerlendirme

| Sınır | Değerlendirme |
|---|---|
| 1. Sahte tıklama yok | Karşılanıyor |
| 2. Bot koruması aşma / yasadışı veri yok | Kısmen (ağ kodu yok; kaynak doğrulaması öz-beyan) |
| 3. Personel gözetimi yok | Kısmen (alanlar dar; şeffaflık ve saklama kodda yok) |
| 4. Marka yetkisi | Kısmen (kapı var, ama içeriksiz) |
| 5a. Çift onay (e-posta) | Karşılanıyor (tek kapı doğrulandı), çıkış bağlantısı eksik |
| 5b. Çerez onayı / davranış takibi | Karşılanmıyor (sunucu tarafı ve diğer tüketiciler) |
| Kişisel veri saklama / silme | Karşılanmıyor |

## Sınır 1: Rakibin Idealo bütçesini tüketecek sahte tıklama

Kodda karşılığı: yok, ve olması için gereken yapı da yok. `services/`, `routes/`, `marketing/`, `jobs/`, `lib/`, `db/` içinde `fetch(`, `http(s).request`, puppeteer/playwright, proxy, captcha, tıklama üretimi için eşleşme çıkmadı; yalnız `server.mjs:4` (kendi sunucusu) ve `lib/auth.mjs:109-112` (ters vekil başlığı okuma, savunma amaçlı) çıktı. `services/ads.mjs:4-7` Meta ve Google Ads'e ağ çağrısı olmadığını belirtiyor ve kod bunu doğruluyor. İçeri tek ağ çıkışı yok.
Değerlendirme: **karşılanıyor** (kaynakta çıkış yolu yok). Not: canlıya bağlanınca ads.mjs kayıt noktaları API çağrısına dönüşecek; o gün bu denetim yinelenmeli.

## Sınır 2: Bot korumasını aşma; veri yalnız resmi API / affiliate / lisanslı

Kodda karşılığı:
- `services/insights.mjs:4-8` başlık yorumu ve ağ çağrısı yokluğu: doğrulandı (yukarıdaki grep). `services/price-strategy.mjs:5` aynı beyanı taşıyor.
- `importMarketData` kaynak kapısı: `insights.mjs:47-48` `source` değerini `['api','affiliate','licensed']` listesine karşı kontrol ediyor; `:65` kayda yazıyor.
- Bu kapı öz-beyandır. Veriyi gönderen kişi rastgele bir satırı `source:'api'` diye etiketleyebilir; sağlayıcı adı, sözleşme/lisans referansı, ya da dosya imzası istenmiyor. Karşılaştırma: `ads.authorizeBrand` en azından `reference` istiyor (`ads.mjs:86-89`), burada bu bile yok. Rotada (`routes/admin-insights.mjs:28`) gövde doğrudan servise gidiyor; ayrı denetim izi yok (`logChange` çağrılmıyor).
- `importContext` (`insights.mjs:73-87`) kaynak alanı hiç istemiyor.
Değerlendirme: **kısmen**. Sistem kendisi veri çekmiyor (iyi), ama "yalnız meşru kaynaktan" sınırı kodla değil insan beyanıyla korunuyor. Gerçek bir kapı değil, kayıt tutma. Bulgu H-08.

## Sınır 3: Personel ekran takibi yasak; yalnız şeffaf iş çıktısı metriği

Kodda karşılığı: `services/staff.mjs:3-5` sınırı yazıyor. `recordWork` yalnız `user, kind, ms, ticketId, t` saklıyor (`staff.mjs:36`); ekran, tuş, uygulama, etkin-süre alanı yok. `performance` yalnız ortalama ilk cevap, ortalama/p90 çözüm süresi ve ticket sayısı döndürüyor (`:72-80`).
Eksikler:
- Küçük ekip koruması yalnız uyarı metni; hesaplamayı ya da kişi listesini engellemiyor (`:82-83`). `MIN_TEAM=5` altında bile kişi bazlı sıralama dönüyor.
- `user` serbest metin (`:26`); `ms` istemcinin bildirdiği değer (`:30`), sunucu ölçmüyor. Zaman damgası + kişi, çalışma saati örüntüsü çıkarmaya yetiyor (rotada `from/to` ile saat aralığı sorgulanabiliyor, `admin-b2b.mjs:46-52`).
- Saklama süresi yok: yalnız 50000 kayıt tavanı (`staff.mjs:21,38`).
- "Çalışanlara önceden bildirilmeli, iş yeri anlaşmasına dayanmalı" koşulu yalnız yorum; kodda bildirim, onay veya devreye alma bayrağı yok. Bu doğal olarak kodla çözülemez (bkz. açık sorular).
Değerlendirme: **kısmen** (ölçülen alanlar sınıra uygun, koruyucu önlemler zayıf). Bulgu H-09.

## Sınır 4: Meta'da markayı gizleyerek paylaşım yok; marka yetkisi gerekir

Kodda karşılığı:
- Marka gizleme yolu yok: `recordPost` `brand` boşsa reddediyor (`ads.mjs:104`) ve `brandAllowed` değilse `conflict` ile durduruyor (`:105-109`); sıra girdi, marka, tavan (`:99`). Doğrudan "markasız göster" seçeneği kodda bulunmuyor.
- Kapı zayıf noktaları: (a) `authorizeBrand` için `reference` herhangi dolu bir metin olabilir ("x" geçer) (`:86-89`, rota `admin-ads.mjs:36-39` yalnız `needStr`); yetkiyi veren ile kullanan aynı panel kullanıcısı, çift imza yok. (b) `brand` alanı paylaşım metninden bağımsız bir etiket: `text` içinde başka bir marka geçse bile denetlenmiyor (`ads.mjs:100-113`), yani yetkili marka adıyla yetkisiz marka paylaşılabilir. (c) Yetki değişikliği `logChange` ile kayda geçmiyor (`authorizeBrand` ve `recordPost` günlük yazmıyor), yalnız `ads` belgesi güncelleniyor; kimin ne zaman yetki verdiği izlenemiyor (`t` var, `by` yok).
Değerlendirme: **kısmen**. Bulgu H-07.

## Sınır 5a: E-posta pazarlaması için çift onay

Kodda karşılığı:
- Tek kapı `consentOk` (`marketing/consent.mjs:28`): yalnız `confirmed` olan kayıt alıcı sayılıyor. `optIn` kaydı `confirmed:false` açıyor (`:39-45`), onay yalnız imzalı bağlantıyla (`confirmOptIn`, `:66-78`), bağlantı 7 gün (`:8,72`).
- Pazarlama alıcıları bu kapıdan geçiyor: `reminders.mjs:7,28,55` (sepet ve tekrar alım), `ads.mjs:239` (`audience`), `ads.mjs:253` (`appPromo`). Kapıyı atlayan ikinci bir alıcı listesi bulunamadı: `db.optins` / `db.carts` doğrudan okuyan tek başka yer `ads.audience` ve `reminders.recipients`; ikisi de kapıdan geçiyor (`ads.mjs:222`, `reminders.mjs:27`).
- Pazarlama / işlem ayrımı doğru: işlem e-postaları onay gerektirmiyor ve gerektirmemeli: sipariş onayı (`jobs/index.mjs:37`), Storno faturası (`services/refunds.mjs:164`), çift onay e-postasının kendisi (`consent.mjs:55`), destek cevabı (müşterinin kendi yazışmasına yanıt, `support.mjs:170-185`). Hepsi müşteri eylemine bağlı.
- Siparişte pazarlama kutusu da aynı yoldan geçiyor: `orders.mjs:119,133,159` yalnız `hooks.optIn` çağırıyor (onaysız kayıt), doğrudan alıcı yapmıyor. Sipariş doğrulama açıkken kayıt e-posta onayından sonra açılıyor (`:132`).
Eksikler:
- Gerçek gönderici bağlandığında kapı `simMail` içinde değil, çağıranlarda (`consent.mjs:123-137`). `simMail` pazarlama mı işlem mi bilmiyor, yalnız `rule` önekiyle ayrılıyor. Göndericiyi yazan kişi `simMail` çıktısını doğrudan gönderirse kapı atlanır. Bulgu H-06.
- Çıkış (abmelden) bağlantısı gerçek değil: `reminders.mjs:88` yalnız yer tutucu ("Echtversand: persönlicher Abmelde-Link"); `routes/public.mjs`'te karşılık gelen uç yok. `ads.appPromo` gövdesinde bağlantı yok, yalnız cümle (`ads.mjs:258`). İzin geri çekme yalnız `cart-save` ile ve yalnız izni veren tarayıcının çerezi (`mxc`) varsa çalışıyor (`consent.mjs:93-95`); çerezi kaybeden ya da başka cihazdan okuyan kullanıcı çıkamaz. Şablon kuralı `{abmelden}` zorunlu tutuyor (`marketing/rules.mjs:66`), ama bağlantı hedefi yok. Bulgu H-05.
- Doğrulama bağlantısı tüm adreslere gidiyor: bir üçüncü kişinin adresine bu e-posta tetiklenebilir (adres başına ve genel hız sınırı var, `public.mjs:23`). Çift onay modelinin olağan yan etkisi; hukuki soru olarak not edildi.
Değerlendirme: **karşılanıyor** (alıcı kapısı tek ve geçerli); çıkış yolu **karşılanmıyor**.

## Sınır 5b: Davranış takibi çerez onayına ve GDPR'a tabi

Zincir, parça parça:
1. İstemci: `app/tracking.js:11` (`flush`), `:36` (`track`) onay yoksa göndermiyor; `:18` her gönderime `consent:true` koyuyor. Onay geri çekilince (`app/insights.js:100-108`) yerel veri, `mxv` çerezi silinir.
2. Sunucu: `services/analytics.mjs:68` `body.consent === true` ise olaya `consent:true` damgası yazıyor. Damga yalnız istemcinin beyanı. Beyan yoksa olay **atılmıyor**, damgasız saklanıyor (`:63-80`). `routes/public.mjs:70-75` ve `analytics.mjs:45-56` ziyaretçi çerezini (`mxv`, 1 yıl) onaydan bağımsız veriyor.
3. `insights.mjs:146,152-156` yalnız damgalı olayı alıyor; damgasız sayılıp `skippedNoConsent` olarak raporlanıyor. Bu parça doğru ve test edilmiş.
Sızıntılar (onay kapısı tek tüketicide, tek yerde değil):
- `services/analytics.mjs:83-86` `analytics()` damgaya hiç bakmıyor; sonuçlar `/api/admin/analytics` (`routes/admin-data.mjs:54`) ve yapay zeka aracı `get_analytics` (`services/tool-handlers.mjs:36-37`) ile gösteriliyor.
- `marketing/suggest.mjs:11` kampanya önerisi damgasız olayla üretiliyor; öneriler `applyCampaign` ile uygulanabiliyor (`tool-handlers.mjs:278-301`).
- `services/storefront.mjs:77-84` herkese açık "çok satanlar" şeridi damgasız `view/add` olaylarını ziyaretçi kimliğiyle sayıyor.
- Eski olaylar: bugünden önce yazılanlarda damga yok (`legacy.mjs:90-98` ham aktarım). `insights` bunları hiç saymıyor (fiilen yok sayıyor), ama yukarıdaki üç tüketici sayıyor, ve 90 gün boyunca (`analytics.mjs:30,33`) silinmiyorlar.
- Doğrudan `POST /api/events` ile damgasız olay göndermek mümkün: sunucu kaydediyor ve çerez veriyor; yani "onaysız ziyaretçi verisi saklanmıyor" cümlesi (örn. `analytics.mjs:207` notu: "yalnızca çerez onayı veren ziyaretçilerden toplanır") sunucuda uygulanmıyor, yalnız vitrin istemcisinin davranışına dayanıyor.
- Onay geri çekilince sunucudaki olaylar silinmiyor: istemci `vid`'i ve çerezi siliyor (`insights.js:107-108`), ama sunucudaki `events` satırları `vid` ile 90 güne kadar kalıyor; veri sahibi artık kimliğini sunamayacağı için silemez. "Meine Daten löschen" düğmesi (`insights.js:85`) yalnız tarayıcıyı temizliyor.
Değerlendirme: **karşılanmıyor** (insights için kısmen doğru; sunucu ve diğer tüketiciler için sınır uygulanmıyor). Bulgular H-01, H-02, H-03.

## Kişisel veri saklama, silme, yedek

| Veri | Yer | Süre |
|---|---|---|
| Ziyaretçi kimliği (`vid`), arama metni `q` (80 karakter), cihaz | `events` tablosu (`analytics.mjs:65-77`, `records.mjs:52`) | 90 gün, `prune_events` işi 6 saatte bir (`jobs/index.mjs:19-22`) |
| E-posta, ad, kaynak, onay metni sürümü | `marketing.optins` (`consent.mjs:39-45`) | Süresiz; yalnız çerezli geri çekmeyle silinir (`:93-99`); onaylanmayanlar da kalır |
| Sepet (e-posta anahtarlı) | `marketing.carts` | Hatırlatma 30 gün sonrası yok sayar (`reminders.mjs:33`), silinmez |
| Rıza günlüğü: e-posta + IP + zaman | `marketing.consent` (`consent.mjs:22-26,48,75,95`) | Süre sınırı yok, yalnız 50000 kayıt tavanı (`marketing.mjs:36`); geri çekmeden sonra da kalır (kasıtlı kanıt) |
| Giriş IP'si | `logins` | 90 gün (`jobs/index.mjs:25`) |
| Sipariş: ad, e-posta, adres | `orders` | Silme yolu yok (yalnız `delOrder`, `records.mjs:11`; müşteri bazlı silme akışı bulunamadı) |
| Destek: gönderen, konu, gövde (10000 karakter) | `support` belgesi (`support.mjs:123-146`) | Yalnız 5000 ticket tavanı, süre yok |
| Personel iş kayıtları | `staff` belgesi | Süre yok (bkz. Sınır 3) |
Silme / unutulma: e-posta bazında "bu kişiye ait her şeyi sil" işlevi yok (optins, carts, consent log, orders, tickets, refunds, simüle posta kutusu, `db.sim`); ayrıca simüle posta kutusu `to`, `body` içinde e-posta ve ad tutuyor, 1000 kayıt tavanıyla (`consent.mjs:135`).
Yedek: `db/backup.mjs:29` `VACUUM INTO` ile tam kopya; yerelde şifresiz, dosya izni 0600 / klasör 0700 (`:23,30`), son 14 kopya tutuluyor (`:36`; `lib/config.mjs:15`). Tüm kişisel veri bu kopyalarda. Şifreli dış kopya (`export.mjs`, AES-256-GCM + scrypt, GCM etiketiyle doğrulama) yalnız `BACKUP_EXPORT_DIR` ve `BACKUP_ENCRYPT_KEY` birlikte verilirse yazılıyor; biri eksikse yalnız `console.warn` ile atlanıyor (`backup.mjs:42-46`), yani sessizce şifresiz-yerel-tek-kopya durumuna düşülebilir. Şifreleme kodu doğru görünüyor (rastgele tuz ve iv, `aes-256-gcm`, etiket doğrulaması, `0o600`). Parola gücü ve saklama yeri kodla denetlenmiyor. Silme talebi geçmiş yedeklere ulaşmıyor: kişi veritabanından silinse bile 14 güne kadar yedekte kalır; bu bekleme süresi belgelenmiş ve politikalaştırılmış değil.
`jobs.mjs`: tamamlanan işin yükü siliniyor (`:35`), iyi; ama başarısız ve yeniden denenmeyen işte yük `retryAt` yoksa siliniyor (`:43`), yeniden denenecekse korunuyor, ki doğru. `order_confirm_mail` onay belirteci içeren yük `done` olunca temizleniyor. Bu yönüyle yedeklerde sır kalmıyor.
Değerlendirme: **karşılanmıyor**. Bulgular H-04, H-10, H-11.

## Bulgular tablosu

| # | Önem | Sınır | Dosya:satır | Ne eksik | Öneri |
|---|---|---|---|---|---|
| H-01 | Yüksek | 5b | `services/analytics.mjs:63-80`, `routes/public.mjs:70-75`, `analytics.mjs:45-56` | Sunucu onay beyanı olmayan olayı atmıyor; damgasız saklıyor, `mxv` çerezini yine veriyor. Onay yalnız istemci davranışı | `ingest` içinde `body.consent !== true` ise 0 döndür, çerez verme; sunucu tarafı onay tek kapı olsun. Hukuki görüş: çerez/ID yazımı için onay gerekliliği |
| H-02 | Yüksek | 5b | `analytics.mjs:83-86`, `routes/admin-data.mjs:54`, `tool-handlers.mjs:36`, `marketing/suggest.mjs:11`, `services/storefront.mjs:77-84` | Onay filtresi yalnız `insights.mjs`te; admin analitiği, AI aracı, kampanya önerisi ve herkese açık çok satanlar şeridi damgasız (ve eski) olayı sayıyor | `events` üzerinde tek erişim işlevi (`consentedEvents`) ve tüm tüketiciler ondan geçsin; `services/analytics.mjs` içine taşı |
| H-03 | Orta | 5b | `legacy.mjs:90-98`, `analytics.mjs:30-41`, `app/insights.js:100-108` | Damgasız eski olaylar 90 gün kalıyor ve H-02 tüketicilerince kullanılıyor; onay geri çekilince sunucu olayları silinmiyor | Bu günden önceki damgasız olayları tek seferlik sil veya `consent:false` işaretle; geri çekmede `vid` için sunucu silme ucu ekle |
| H-04 | Yüksek | Saklama / silme | `consent.mjs:22-26,93-99`, `records.mjs:11`, `support.mjs:123-166` | E-posta bazında silme / erişim (Art. 15, 17) yolu yok; optins, carts, consent log, orders, tickets, refunds, simüle posta kutusu | Tek `eraseSubject(email)` işlevi ve admin ucu; rıza günlüğü için hukuki saklama gerekçesiyle ayrı, e-postası özetlenmiş kayıt |
| H-05 | Orta | 5a | `reminders.mjs:88`, `routes/public.mjs` (uç yok), `ads.mjs:258`, `consent.mjs:93-95` | Gerçek abmelden bağlantısı/ucu yok; geri çekme çerez-bağımlı; `appPromo` metninde bağlantı yok | İmzalı `GET/POST /api/consent/unsubscribe?e&token` ucu; her pazarlama gövdesine zorunlu; çerezsiz geri çekme |
| H-06 | Orta | 5a | `consent.mjs:123-137`, `reminders.mjs:117-145` | Gönderim kapısı çağıranlarda; `simMail` pazarlama/işlem ayrımını yapmıyor. Gerçek gönderici bağlandığında kolay atlanır | `simMail`/gerçek gönderici için `kind: 'marketing'` parametresi ve içeride `consentOk` zorunluluğu |
| H-07 | Orta | 4 | `ads.mjs:86-89,100-113`, `admin-ads.mjs:36-39` | `reference` her metin olabilir; `brand` alanı paylaşım metnindeki markayla bağlı değil; yetki/paylaşım `logChange`'e yazılmıyor, `by` yok | `reference` biçim/uzunluk şartı, yazan kullanıcıyı kaydet, `logChange` çağır; metin içinde bilinen marka adı yetkisizse uyar |
| H-08 | Orta | 2 | `insights.mjs:45-48,65`, `admin-insights.mjs:28` | `source` öz-beyan; sağlayıcı/lisans referansı, denetim izi yok; `importContext` kaynaksız | `provider` + `reference` zorunlu, `logChange`, `source` ile birlikte kullanıcı adı |
| H-09 | Orta | 3 | `staff.mjs:21,26,30,82-83`, `admin-b2b.mjs:46-52` | Küçük ekipte kişi bazlı döküm engellenmiyor (yalnız uyarı); saklama süresi yok; bildirim/anlaşma kaydı kodda yok | `MIN_TEAM` altında `people` yerine yalnız toplam; kayıt için saklama süresi; devreye alma bayrağı (`staff.enabled`) + bildirim referansı |
| H-10 | Orta | Saklama | `consent.mjs:39-45,109`, `reminders.mjs:33`, `jobs/index.mjs:46` | Onaylanmamış optin ve eski sepetler süresiz; temizlik işi yok | 7 günden eski `confirmed:false` kaydı ve 30 günden eski sepeti silen yinelenen iş |
| H-11 | Orta | Yedek | `backup.mjs:29-46`, `export.mjs:32-44` | Yerel yedek şifresiz; dış kopya iki env birlikte yoksa sessizce atlanır; silme talebi yedeğe ulaşmaz; saklama süresi politikası yok | Üretimde env eksikse başlangıçta hata; yedek saklama süresi ve silme listesi ("geri yüklemede yeniden uygula") |
| H-12 | Düşük | Saklama | `consent.mjs:22-26,48,75,95`, `lib/auth.mjs` logins | IP adresi rıza günlüğünde süresiz; giriş IP'si 90 gün | Rıza günlüğünde IP'yi kısalt (son sekizli) ya da süre koy; gerekçeyi belgele |
| H-13 | Düşük | 5a | `support.mjs:28-56` | Hassas yazışma sınıflandırması: DSGVO erişim/silme talepleri (`auskunft`, `löschung`, `dsgvo`), `klage` kalıpları "kritik" değil, `other` sınıfına düşüyor | Kritik listesine veri sahibi talebi kalıplarını ekle; yasal süre uyarısı |
| H-14 | Düşük | 5b | `analytics.mjs:72-73,126-133` | Arama metni (`q`, 80 karakter) serbest metin ve kişisel veri içerebilir; 90 gün | Yalnız sayımı sakla veya e-posta/telefon kalıplarını süz |

Önem dağılımı: Yüksek 3 (H-01, H-02, H-04), Orta 8 (H-03, H-05..H-11), Düşük 3 (H-12..H-14). Toplam 14.

## Açık hukuki sorular (insan kararı gerekir)

1. Çerez onayı kapsamı: yalnız davranış olayları mı, yoksa sunucunun verdiği `mxv` kimliği de onay gerektirir mi? Onaysız "zorunlu" analitik (toplu, kimliksiz sayım) için ayrı bir hukuki dayanak kabul edilecek mi?
2. Rıza günlüğünde e-posta ve IP'nin saklanma gerekçesi ve süresi (ispat yükü ile silme hakkı dengesi); geri çekmeden sonra ne kadar tutulacak?
3. Silme talebinin yedeklere ulaşma politikası: 14 günlük bekleme kabul mü, yoksa geri yüklemede yeniden uygulama mı?
4. Çalışan performans ölçümü: iş yeri konseyiyle (BetrVG §87) anlaşma, çalışan bilgilendirmesi ve ölçümün hangi gerekçeyle yapılacağı. Ekip beşten küçükse kişi bazlı gösterim hiç olmalı mı?
5. Destek otomatik cevabı: `widerruf`/`rückgabe` içeren mesaja otomatik "%20 kısmi iade, geri göndermeden" teklifi (`support.mjs:169-184`) yasal cayma hakkını ve tam iade yükümlülüğünü gölgeler mi? Teklif yazısı müşteriyi yanıltmayacak biçimde hukuken gözden geçirilmeli.
6. Marka yetkisi: hangi belge "yetki kanıtı" sayılır (yazılı izin, distribütörlük sözleşmesi)? Platform kuralı yetkisiz marka adıyla yapılan paylaşımı da kapsıyor mu?
7. Pazar verisi: "lisanslı sağlayıcı" ve "affiliate feed" için hangi sağlayıcılar ve hangi sözleşme koşulları kabul edilir? Verinin yeniden kullanım (çapraz pazar yeri arbitrajı) hakkı lisans metninde var mı?
8. Çift onay bağlantısı: üçüncü kişinin adresine doğrulama e-postası gönderilmesi (kendi yazmadığı adres) kabul edilebilir mi? Posta tarayıcıları bağlantıya otomatik tıklarsa onay geçerli sayılır mı?
9. Pazarlama ile işlem e-postası sınırı: sepet hatırlatması ve "sarf ürünü yeniden alım" e-postası pazarlama sayılıyor (çift onaya bağlı, doğru); sipariş sonrası ürün tavsiyesi gibi diğer metinler hangi sınıfa girecek?
10. Gerçek e-posta sağlayıcısı bağlanmadan önce bu belgedeki H-05 / H-06 çözülmeden canlıya geçilmemeli mi? (Şu an tüm gönderim simülasyon, gerçek gönderim yok.)
