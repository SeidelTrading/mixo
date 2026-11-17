# iOS ve Android uygulaması — karar belgesi

15 Kasım 2026 · Kapsam: yaklaşım seçimi + `mobile/` altında müşteri mağaza uygulamasının ilk sürümü · Önceki kararlar: `docs/site-karari-2026-11-15.md` (mağaza Shopify'da kalır, panelimiz Shopify'a veri yazan iş aracıdır)

## 1. Öneri

**Expo / React Native ile kendi müşteri mağaza uygulamamız (seçenek a); veri katmanı tek modülde, sonra Shopify Storefront API'ye geçecek. Önce müşteri uygulaması, yönetici uygulaması sonra.**

Gerekçe, kısaca:

- Mağaza Shopify'da kalıyor (site kararı). Shopify, kendi mobil mağazaları için Storefront API + Checkout Kit'i önerip React Native için de paket veriyor; yani seçtiğimiz yol Shopify'ın tarif ettiği yol.
- Tek TypeScript kod tabanı iki platformu ve web önizlemesini verir; ekibimiz zaten JS/TS yazıyor.
- Salt site sarmalayan uygulamalar Apple'da 4.2 (asgari işlevsellik) nedeniyle sık reddediliyor; gerçek yerel ekranlar bu riski büyük ölçüde kaldırıyor.
- Push, aylık sabit ücret ödemeden kendi altyapımızla kurulabilir.
- Dürüst not: **uygulamanın satışa katkısı ölçülmedi.** Elimizde mağazanın trafik verisi yok (pazarlama raporu, 12. bölüm). Bu yüzden ilk sürüm küçük tutuldu ve gerçek ödeme/hesap bağlanmadı; yayından önce "tekrar eden müşteri var mı" sorusu sahibe sorulmalı (bkz. 5).

## 2. Karşılaştırma

Emek değerleri bizim tahminimizdir (ölçülmedi). Fiyatlar kaynaklarda çelişkili ya da ikincil olduğunda işaretlendi.

| Ölçüt | **a. Expo / React Native** | **b. Flutter** | **c. PWA / Capacitor (siteyi sarmala)** | **d. Hazır oluşturucular (Tapcart, MobiLoud vb.) ve Shop uygulaması** |
|---|---|---|---|---|
| Emek (ilk yayına) | 15–25 gün (ilk sürüm iskeleti hazır; kalan: Storefront API, Checkout Kit, push, mağaza süreçleri) | 20–30 gün (yeni dil: Dart; ekipte yok) | 3–7 gün | 3–10 gün kurulum + tasarım |
| Aylık maliyet | EAS ücretsiz plan: ayda 30 derleme (Expo fiyat sayfası; ikincil kaynaklar 15 Android + 15 iOS diyor, **doğrulanmadı**); Starter 19 $/ay, Production 99 $/ay (bir kaynak 199 $ diyor, çelişkili). Zorunlu değil. | Derleme için kendi CI'ımız ya da Codemagic gibi ücretli CI; sunucu yok | Yok (Capacitor ücretsiz) | Tapcart: aylık ~200–250 $'dan başlıyor, büyük markalarda 1000 $+; bazı satıcılar gelir bazlı komisyon bildirmiş (kaynaklar rakip bloglar, çelişkili, **doğrulanmadı**) |
| Shopify Storefront API uyumu | Resmî: `@shopify/checkout-kit-react-native` + Storefront API (React Native docs mevcut) | Resmî SDK yok; topluluk paketleri (**doğrulanmadı**) | Site zaten Shopify; API gerekmiyor | Hazır bağlantı; özelleştirme sınırlı |
| Anlık bildirim | Expo Notifications / FCM+APNs; ücretsiz | Firebase; ücretsiz | Capacitor eklentisiyle mümkün | Plana dahil (genelde sınırlı segment) |
| Mağaza inceleme riski | Düşük: gerçek yerel ekranlar | Düşük | **Yüksek (Apple 4.2)**: "mobil tarayıcı deneyiminden yeterince farklı değil" reddi yaygın; push/çevrimdışı/cihaz özelliği eklemek önerilen çare (kaynaklar üçüncü taraf bloglar) | Düşük–orta (oluşturucular onay süreci sunuyor; yine de içerik 4.2'ye takılabilir) |
| Bakım | SDK her sürümde kırıcı değişiklik getiriyor (SDK 58, 15 Ekim 2026) ama yükseltme araçları var; ekip JS biliyor | Flutter sürümleri + Dart bilgisi | Düşük (site değişince uygulama değişir) ama mağaza uyumu kırılgan | Satıcı bağımlılığı; çıkış zor, özelleştirme sınırı |
| Kontrol / marka | Tam | Tam | Siteyle aynı | Şablon sınırlı |

### Shop uygulaması (Shopify'ın kendi tüketici uygulaması)

Bu bir **bizim markamıza ait uygulama değil**; mağaza, Shop kanalı üzerinden Shopify'ın uygulamasında görünebilir. Arama sonuçlarında Shop uygulaması ve kanalı hakkında yararlı kaynak çıkmadı; bu yüzden yalnız genel bilgimle yazıyorum: **doğrulanmadı** (kendi simgesi, kendi bildirimleri, kendi tasarımı olmaz; ürün listeleme Shopify kurallarına bağlıdır). Pazarlama kanalı olarak sahibe sorulmalı, ama "kendi uygulamamız" sorusunun alternatifi değil.

### Neden ötekiler değil

- **c (sarmalama):** en ucuz ve en hızlı, ama reddedilme riski en yüksek; reddedilirse zaman kaybı. Yalnız "mağazada bir simge" hedefiyse anlamlı.
- **d (hazır oluşturucu):** aylık sabit gider + olası komisyon + bağımlılık. Katalog 45 bin ürün; bu ölçekte özelleştirme (arama, süzgeç) sınırı sorun olur (**doğrulanmadı**, satıcılarla görüşülmedi).
- **b (Flutter):** teknik olarak uygun, ama yeni dil ve Shopify resmî SDK'sı yok; kazanç göstermiyor.

## 3. İki olası kapsam

| | **Müşteri mağaza uygulaması** | **Yönetici / panel uygulaması** |
|---|---|---|
| Kim kullanır | Alıcılar (Almanya) | Mağaza sahibi ve ekibi |
| Veri | Katalog, sepet; sonra Storefront API | `/api/admin/*` (onay kuyruğu, fotoğraf/başlık düzeltmesi, kampanya) — kimlik doğrulama şart |
| İnceleme riski | Orta (kategori: Alışveriş) | Düşük ama "özel iş uygulaması" olarak dağıtılabilir (TestFlight/iç dağıtım) |
| Mevcut alternatif | Mağaza sitesi (mobil uyumlu) | Panel web'de çalışıyor; Shopify'ın kendi yönetici uygulaması da var |
| Güvenlik yükü | Düşük (okuma) | **Yüksek**: yönetici belirteci cihazda, kayıp telefon riski; güvenlik raporunda açıklar henüz kapanmadı |
| Değer belirsizliği | Satışa katkısı ölçülmedi | Panel kullanıcısı birkaç kişi; masaüstü yeterli olabilir |

**Önerilen sıra: müşteri uygulaması önce.** Nedenler: (1) yönetici uygulamasının kullanıcı sayısı çok küçük ve panel zaten web'de; (2) yönetici uygulaması, henüz düzeltilmemiş yönetici uç noktalarını ve kimlik doğrulamayı telefona taşır — önce güvenlik raporundaki maddeler kapanmalı (`docs/guvenlik-raporu-2026-11-15.md`); (3) müşteri uygulaması yalnız okuma yaptığı için güvenli başlar ve Storefront API'ye geçiş yolu açık. Yönetici uygulaması için ucuz ara çözüm: paneli telefondan kullanılabilir hâle getirmek (duyarlı tasarım) ve ana ekrana ekleme.

## 4. `mobile/` içinde ne var (ilk sürüm)

Expo SDK 58, Expo Router, TypeScript. Dil: Almanca arayüz, Türkçe kod yorumları. Çalıştırma ve yapı için `mobile/README.md`.

- **Ekranlar:** ana sayfa (kategoriler + Aktionen/Beliebt/Preiswert/Premium), kategori listesi (alt kategori, sonsuz kaydırma, marka/fiyat/stok süzgeci), arama, ürün ayrıntısı, merkliste (favoriler), sepet, açıkça "Demo" diyen kasa ekranı.
- **Pazar yeri tarzı düzen (genel e-ticaret kalıpları, Mixo markasıyla):** üstte arama çubuğu, kaydırılabilir afişler (kargo eşiği ve kategori sayıları gibi gerçek veriden), simgeli yuvarlak kategori şeridi, ürün kartında indirim rozeti (yalnız sunucu eski fiyat verirse), sepette ücretsiz kargo ilerleme çubuğu. Bilerek yok: geri sayım ve "az kaldı" gibi uydurma aciliyet, puan/yorum (katalogda veri yok).
- **Veri erişimi tek modülde:** `src/api/shop.ts`. Taban adres tek ayar dosyasında: `src/config.ts` (`EXPO_PUBLIC_API_BASE` ile de geçersiz kılınabilir).
- **Okuma uçları:** `/api/config`, `/api/shop/home`, `/api/shop/product` ve vitrinin statik katalog parçaları (`/data/index.js`, `/data/<anahtar>-<n>.js`). Not: kategori listesi ve arama için `/api/shop/*` yetmiyor (yalnız ana sayfa ve tek ürün veriyor); katalog yalnız statik parçalarla geliyor. Arama bu yüzden istemcide parça parça tarar (kısıt: ağır; 5. bölüm).
- **Çağrılmayanlar:** `/api/events`, `/api/cart-save`, `/api/orders`, `/api/admin/*`. Sepet ve favoriler yalnız cihazda (AsyncStorage).
- **Yok (bilerek):** gerçek ödeme, hesap girişi, anlık bildirim.

### 4a. 16 Kasım güncellemesi: yapı ve tasarım

- **Yapı:** Bölüm düzeni yaygın pazar yeri uygulamalarının kalıplarına göre yeniden kuruldu. Analiz ve bölüm bölüm kararlar: `docs/hepsiburada-analizi-2026-11-15.md`. Yalnız yapı ve etkileşim kalıbı alındı; ad, logo, görsel, metin ve renk kimliği alınmadı.
  - Sekmeler: Start, Merkliste, Warenkorb, Mein Bereich, Kategorien.
  - Arama, başlıktaki kutudan açılan bir katman.
  - Kategori listesinde süzgeç ve sıralama katmanları var.
  - Ürün sayfasının altında sabit satın alma çubuğu var.
  - Sepette satır seçimi, geri al bildirimi ve kargo eşiği çubuğu var.
  - Cihazda adlı listeler, son bakılanlar ve arama geçmişi tutuluyor.
- **Tasarım:** İlk sürümün tek renkli görünümü bırakıldı. Kendi web vitrinimizin kimliği kullanıldı: lacivert, mavi, güneş sarısı ve mercan; Inter ve Fraunces. Kurallar `mobile/TASARIM.md` dosyasında, belirteçler `src/theme.ts` dosyasında. Ekran görüntüleri: `docs/mobil-ekran-2026-11-16/`.
- **Dürüstlük:** Puan, yorum, geri sayım, stok baskısı, teslimat sözü ve kupon yok. Eski fiyat ve indirim rozeti yalnız sunucu gerçek bir eski fiyat verirse görünür. Sepet, liste ve kasa güncel fiyatı kullanır. Kargo eşiği sunucudan gelmezse uygulama bunu açıkça söyler.
- **Doğrulama:**
  - Ölçülenler: `tsc`, lint, 18 birim testi, web ve Android paketleri temiz.
  - Emülatörde görülenler: Android 16 sanal cihazda Expo Go ile ana sayfa, Kategorien, kategori listesi, süzgeç, sıralama, arama ("seiko": 22 sonuç), ürün sayfası, sepete ekleme katmanı, sepet, kasa, Merkliste, Meine Listen, Mein Bereich.
  - Denenmeyenler: iOS, gerçek cihaz, ekran okuyucu, büyük yazı boyutu.

## 5. Sonraki adımlar (ilk sürümde yok)

1. **Storefront API'ye geçiş:** `src/api/shop.ts` içindeki işlev imzaları aynı kalır; içleri Storefront GraphQL'e çevrilir (ürün, koleksiyon, arama, sepet). Sunucu tarafı arama ve sayfalama gelince katalog parçalarının tamamını indirmeye gerek kalmaz. Arama bugün en çok 3 parça × 80 KB'lık adımlarla ilerliyor; 45 bin ürünün tamamını taramak ~7 MB indirir (ölçülmedi).
2. **Gerçek kasa:** Shopify Checkout Kit (mağazanın kendi ödeme sayfasını uygulama içinde açar; ödeme Mollie/Shopify'da kalır). Bu, kart verisini uygulamaya sokmaz.
3. **Hesap girişi:** Shopify müşteri hesapları (Customer Account API); sipariş geçmişi.
4. **Anlık bildirim:** önce izin ve içerik kuralları (rıza), sonra Expo Notifications; terk edilmiş sepet ve fiyat düşüşü gibi senaryolar rıza kaydına bağlanır.
5. **Derin bağlantılar:** `mixodemo://` şeması hazır; evrensel bağlantı için alan adı dosyaları (Apple App Site Association, Android assetlinks) sahibin alan adında barındırılmalı.
6. **Fiyat beyanı:** indirim gösteren her yerde PAngV §11 (son 30 günün en düşük fiyatı) uygulanmalı; uygulama bugün üstü çizili fiyatı yalnız sunucu `was` verirse gösterir.
7. **Erişilebilirlik ve test:** ekran okuyucu etiketleri eklendi ama gerçek cihazda sınanmadı; küçük ekranlı Android ve iPad sınanmalı.

## 6. Yayın için gerekenler

### Hesaplar ve ücretler

| Hesap | Ücret | Notlar |
|---|---|---|
| Apple Developer Program | 99 $/yıl | Süre dolarsa uygulama mağazada kalır ama güncelleme yayımlanamaz (ikincil kaynaklar). Şirket (Lady Empire GmbH) adına açmak için D-U-N-S numarası gerekir; kişi adına açılırsa mağazada kişi adı görünür. |
| Google Play Console | 25 $ bir kez | Yeni **kişisel** hesaplar (13 Kasım 2023 sonrası) üretime çıkmadan önce 12 test kullanıcısıyla en az 14 gün kapalı test yapmak zorunda; **kuruluş** hesapları muaf (Google'a atfedilen ikincil kaynaklar). Şirket hesabı bu yüzden daha hızlı. |
| EAS (Expo) | Ücretsiz plan yeterli olabilir | Derleme kotası düşük; sık derleme gerekirse Starter 19 $/ay. Yayın için EAS hesabı açılır; **bu çalışmada hesap açılmadı, derleme başlatılmadı.** |

İlk yıl yaklaşık 124 $ (Apple 99 + Google 25) — kaynaklar böyle hesaplıyor; KDV ve kur ayrı.

### Mağaza kuralları ve Almanya için yasal gerekler

- **Uygulama içi satın alma (IAP) istisnası:** Fiziksel ürün satışı IAP dışında ödeme yöntemleri kullanmalıdır; Apple yönergesi 3.1.3(e) bunu söylüyor (yalnız forumlarda alıntılanmış metni bulduk, Apple'ın güncel sayfasını okumadık; numara sürümler arasında 3.1.5 olarak da görünüyor — **güncel metin yayından önce Apple'dan okunmalı**). Bizim ürünlerimiz fiziksel olduğundan Apple'a %15–30 komisyon ödenmez ve Apple Pay/kart/Klarna/PayPal kullanılabilir. Dijital içerik satılmaz.
- **Impressum (DDG §5):** zorunlu; uygulamada Ayarlar/Info ekranı ve mağaza künyesinde erişilebilir olmalı. İçeriği mağaza sahibinden alınır (`/policies/legal-notice` mağazada var, içeriğini okumadık). Bu çalışmada Impressum ekranı **eklenmedi** (sonraki adım).
- **Datenschutzerklärung (DSGVO):** uygulama için ayrı ya da güncellenmiş metin; mağaza ve uygulama listelemesinde bağlantı zorunlu. Apple "App Privacy" etiketleri ve Google "Data safety" formu doldurulmalı.
- **Rıza (§25 TDDDG, DSGVO):** analiz, reklam kimliği, bildirim izni ve takip için rıza gerekir; ilk sürümde hiçbiri toplanmıyor. Rıza yönetimi, Meta/Google ölçümü eklendiğinde kurulacak (pazarlama raporu, 10. bölüm).
- **Widerrufsbutton:** 19 Haziran 2026'dan itibaren web sitesi **ve uygulama** üzerinden yapılan tüketici sözleşmeleri için elektronik cayma işlevi zorunlu (§356a BGB n.F., AB Yönergesi 2023/2673; kaynaklar ihtiyat bilgisi veriyor, kanun metni okunmadı). Checkout Kit ile ödeme Shopify'da kaldığında Shopify mağazasının bu işlevi sunması gerekir; uygulamadan da ulaşılmalı. Hukuk danışmanına teyit ettirilmeli.
- **DSA satıcı (trader) beyanı:** Apple, AB'de dağıtılan uygulamalarda satıcı iletişim bilgisini (adres, telefon, e-posta) yayımlıyor; doğrulanmamış uygulamalar Şubat 2025'ten beri AB mağazasından kaldırıldı. Google için 1 Şubat 2027'ye kadar beyan zorunluluğu iddiası ikincil kaynaklarda; **Google'ın kendi sayfasında doğrulanmadı.** Hesabı şirket adına açmak bu bilgiyi şirket adresine bağlar.
- **PAngV, UWG, Impressum bağlantısı, kargo ve iade bilgisi:** web'dekiyle aynı; ürün sayfasında fiyat "inkl. MwSt., zzgl. Versand" olarak yazılı.
- Bu liste hukuki görüş değildir; yayından önce bir Alman e-ticaret avukatına teyit ettirin.

### Mağaza sahibinden istenecekler

1. Uygulamanın yayımlanacağı tüzel kişi (Lady Empire GmbH?), yetkili kişi ve D-U-N-S numarası.
2. Apple Developer ve Google Play hesaplarının kimin adına açılacağı; yöneticilik erişimi.
3. Marka varlıkları: uygulama simgesi (1024×1024), ekran görüntüleri, kısa/uzun açıklama (Almanca), destek e-postası ve destek adresi.
4. Impressum, Datenschutz, AGB, Widerruf metinleri ve bağlantıları (güncel mi, kim hazırladı).
5. Shopify yönetici ya da geliştirici erişimi (Storefront API belirteci, Checkout Kit için mağaza ayarı) ve kullanılan ödeme sağlayıcısı bilgisi.
6. Anlık bildirim ve pazarlama izni kuralları (kim gönderir, hangi sıklıkla), bülten ile ilişkisi.
7. Uygulamayı kimin yöneteceği (inceleme yanıtları, güncellemeler) ve sorun durumunda iletişim kişisi.
8. Mağaza trafiği ve tekrar eden müşteri oranı; uygulamanın gerekçesini ölçmek için.
9. JTL-Wawi eşitlemesi: ürün ve fiyat kaynağı hangisi (uygulama Shopify'dan okur; eşitleme kesintisi ürünleri etkiler).

## 7. Bu çalışmada doğrulananlar ve doğrulanmayanlar

**Çalıştırıldı:** `npx tsc --noEmit` (temiz), `npx expo lint` (temiz), `npx expo export --platform web`, ayrıca iOS ve Android JS paketleri (`expo export --platform ios --platform android`, derleme geçti). Web hedefi tarayıcıda açıldı ve canlı demodan gerçek veriyle doğrulandı: ana sayfa (kategoriler, öne çıkan ürün şeritleri), "Uhren" kategorisi (alt kategoriler, süzgeç çubuğu, görseller), arama ("seiko" → gerçek sonuçlar), ürün ayrıntısı, sepete ekleme (yenilemeden sonra da duruyor), kasa ekranı.
**Android emülatöründe çalıştırıldı:** `sanal_telefon` (Android 16) üzerinde Expo Go ile (Expo CLI Expo Go'yu indirip kurdu; JDK 11 olduğundan yerel Gradle derlemesi denenmedi). Ana sayfa canlı demo verisi, görseller ve alt sekmelerle açıldı; diğer ekranlar emülatörde elle gezilmedi.
**Çalıştırılmadı:** iOS (Linux'ta mümkün değil), gerçek Android cihaz, EAS derlemesi, yerel (Gradle) Android derlemesi, mağaza gönderimi, anlık bildirim, ekran okuyucu. Marka/fiyat süzgecinin etkileşimi ve sonsuz kaydırma tarayıcıda elle denenmedi (kod derlendi, ilk sayfa veri gösterdi).
**Not:** canlı demo sunucusu CORS başlığı vermiyor; bu yüzden web önizlemesi için `mobile/tools/dev-proxy.mjs` (yalnız GET, yalnız okuma yolları) kullanıldı. Yerel uygulamada (iOS/Android) bu gerekmez.

## Kaynaklar

- Apple 4.2 / sarmalayıcı reddi (üçüncü taraf): https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper · https://vp0.com/blogs/fix-app-store-rejection-4-2-minimum-functionality · https://developer.apple.com/forums/thread/108931
- Apple 3.1.3(e) (forum alıntısı): https://developer.apple.com/forums/thread/687921 · Apple yönergeleri PDF: https://developer.apple.com/support/downloads/terms/app-review-guidelines/App-Review-Guidelines-English-UK.pdf
- Hesaplar ve ücretler (ikincil): https://capawesome.io/blog/how-to-create-apple-developer-and-google-play-accounts/ · https://docs.flutterflow.io/ffx/store-requirements · https://www.rapidnative.com/deploy/google-play-12-tester-requirement
- Shopify mobil mağaza belgeleri: https://shopify.dev/docs/storefronts/mobile · https://shopify.dev/docs/storefronts/mobile/checkout-kit/react-native · https://github.com/Shopify/checkout-sheet-kit-react-native
- Hazır oluşturucular (karşılaştırma blogları, fiyatlar çelişkili): https://www.mobiloud.com/comparisons/tapcart-vs-mobiloud · https://www.vennapps.com/blog/tapcart-alternatives
- Expo fiyat ve SDK: https://expo.dev/pricing · https://docs.expo.dev/billing/plans/ · https://expo.dev/changelog/sdk-58.md
- Widerrufsbutton: https://www.trustedshops.de/blog/der-widerrufsbutton-kommt-ab-19.-juni-2026 · https://www.it-recht-kanzlei.de/widerrufsbutton-faq-leitfaden-online-handel.html · https://www.haufe.de/id/beitrag/der-widerrufsbutton-kommt-neue-pflicht-fuer-den-online-handel-ab-1962026-HI17165227.html
- DSA satıcı beyanı: https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements · https://heise.de/-10287701 · https://www.fdaytalk.com/google-play-trader-status/ (Google tarafı ikincil)
