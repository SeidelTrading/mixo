# Hepsiburada mobil uygulaması — bölüm bölüm yapı analizi ve Mixo Outlet karşılığı

15 Kasım 2026 · Kapsam: yalnız analiz ve eşleme; `mobile/` ve `demo/` altında hiçbir dosya değiştirilmedi · İlgili belge: `docs/mobil-uygulama-2026-11-15.md` · 2. sürüm: gözden geçirme bulguları işlendi; kendi verimize ait sayılar dizin ve parça dosyalarından yeniden ölçüldü

## 1. Özet

- **Ne incelendi:** Hepsiburada alışveriş uygulamasının yapısı: gezinme, ana sayfa, kategoriler, arama, ürün listesi, ürün ayrıntısı, sepet, listeler, hesap, kampanya ve cüzdan modülleri.
- **Hangi kaynaklardan:** Google Play sayfasındaki 10 ve App Store sayfasındaki 6 ekran görüntüsü, mobil web sitesinde misafir olarak iki gezinti (375×812 öykünme), yardım merkezi (yalnız arama motoru özetleri) ve yayımlanmış yazılar.
- **Uygulamanın kendisi kurulmadı ve çalıştırılmadı.** APK indirilmedi, hesap açılmadı, giriş yapılmadı, ödeme başlatılmadı. İstekteki "uygulamayı indir" adımı bu çalışmada yapılmadı.
- **Sonuç olarak doğrulanamayanlar:** uygulamadaki alt sekme adları ve sırası; uygulamanın kategori, ürün ayrıntısı, sepet, liste, hesap ve bildirim ekranları. Bunlar ya yalnız mobil siteden biliniyor ya da hiç bilinmiyor. Mağaza kareleri kampanya dönemine ait pazarlama görselleri ve hepsi alttan kırpık.
- **Eşlemenin başlığı:** iskelet (sekme çubuğu, arama başlığı, modüllü ana sayfa, iki seviyeli kategori, süzgeç/sıralama çubuklu 2 sütun liste, sabit satın alma çubuklu ürün sayfası, özet çubuklu sepet) bugünkü verimizle kurulabilir. Puan/yorum, taksit, teslimat sözü, kupon, sadakat, cüzdan, geri sayım, hesap ve sipariş bölümleri **atlanır**, çünkü verisi yok.
- **"Birebir" sınırı:** yapı, gezinme ve etkileşim kalıbı alınır. Ad, logo, görsel, metin ve renk kimliği alınmaz (bölüm 5). Kanıt da birebir kopyaya yetmiyor: görülen ekranların çoğu mobil siteye ait, uygulamaya değil.

## 2. Kaynaklar ve güven düzeyi

Belge boyunca üç kanıt etiketi kullanılır:

- **görüldü**: bir ekran görüntüsünde ya da mobil sitede bir inceleme şeridi tarafından doğrudan görüldü. Mobil sitede görülen bir şey, uygulamada da öyle olduğu anlamına gelmez; her maddede hangisi olduğu yazılıdır.
- **dolaylı**: yazılı bir kaynak söylüyor (mağaza açıklaması, haber, rehber, arama özeti). Ekranda görülmedi.
- **doğrulanmadı**: hiçbir şerit teyit etmedi ya da şeritler çelişiyor.

| Kaynak | Kısaltma | Erişildi mi | Neyi kapsadı | Sınırı |
|---|---|---|---|---|
| Google Play ekran görüntüleri | P-ss01 … P-ss10 | Evet (bot denetimi yok) | Açılış ekranı, ana sayfanın üst kısmı (telefon, tablet), kampanya ürün listesi (telefon, tablet), iki içerik sayfası, süreli fırsat listesi, takas ürün listesi (tablet) | 12 kareden 10'u incelendi. Hepsi pazarlama karesi; arayüz 8 karede (şerit özeti 7 diyor, saydığı kareler 8), ikisi yalnız açılış ekranı. Hepsinde alt yarı kırpık. Kampanya dönemi içeriği. Dinamik davranış görülemez. |
| App Store ekran görüntüleri | A-s1 … A-s6 | Evet (bot denetimi yok) | Açılış, ana sayfa üstü, kampanya listesi, iki içerik sayfası, süreli fırsat listesi | 6 kare, hepsi kırpık pazarlama karesi; Play kareleriyle aynı ekranlar. Sürüm 5.103.1 sayfadan okundu; açıklama ve sürüm notu bu şeritte çıkarılamadı. |
| Mobil site gezintisi 1 | M1 | Evet | Ana sayfa, kategori katmanı, arama katmanı, arama sonuç listesi (sıralama ve süzgeç katmanları dahil) | **Uygulama değil, mobil web.** Yerleşim DOM ölçümlerinden çıkarıldı; ekran görüntüsü aracı bozuk çalıştı, renk ve biçim görülmedi. Kategori sayfası (c-id) açılmadı. |
| Mobil site gezintisi 2 | M2 | Evet | Ürün ayrıntısı, sepet (dolu ve boş), listeler girişi, hesap girişi, alt gezinme | **Uygulama değil, mobil web.** Misafir oturumu; giriş isteyen ekranların içi görülmedi. Ürün sayfasının alt kısımları yalnız DOM metninden okundu. Ödeme adımı açılmadı. |
| Yardım merkezi | Y | **Hayır** (resmî sayfalar HTTP 403; CAPTCHA görülmedi, kaynak bırakıldı) | Sipariş, iptal, iade kodu, teslimat seçenekleri, üyelik programı, kupon yolu | Yalnız arama özetleri; sayfaların kendisi okunmadı. Özetler birbiriyle çelişiyor ve eski olabilir. Ekran yerleşimi hakkında kanıt yok. |
| Yayımlanmış incelemeler | İ | Kısmen (teknik blog 403, bir rapor 410, iki akademik PDF okunamadı) | Mağaza açıklaması özeti, üyelik incelemesi (2022), cüzdan rehberi (2024), yapay zekâ yorum özellikleri (2023), görselle arama (2017), eski web tasarımı (2015), eski stil rehberi (~2016–2017) | Güncel uygulama yapısını anlatan yayın bulunamadı. Çoğu eski ya da web'e ait; biri sponsorlu. Ekran görüntüsü incelenmedi. |

## 3. Bölümler

Not: "Mixo karşılığı" tablolarında **Nasıl** sütunundaki P1/P2/P3 etiketi bölüm 4'teki önceliktir. Dosya yolları `mobile/src` altındadır. Almanca etiketler arayüzde görünecek metinlerdir.

**Karar** sütununda "Atla (veri gelince P3 #n)" şu demektir: bugün yapılmaz; gereken veri ya da arka uç gelirse bölüm 4'teki P3 listesinin n. işi olarak açılır. Yalın "Atla" planda yoktur; bunlardan puan/yorum, kupon, sadakat ve cüzdan satırları yalnız mağaza bu hizmetleri gerçekten sunarsa P3 #8 kapsamında yeniden ele alınır. "Dizindeki sayı", `demo/data/index.js` dosyasındaki durağan sayıdır.

### 3.1 Genel gezinme (alt sekmeler, üst çubuk)

**(a) Hepsiburada'da**

1. **Alt sekme çubuğu, mobil site:** sabit, 55–56 px, 5 eşit sekme, ikon üstte etiket altta. Sıra: Keşfet, Listelerim, Sepetim, Hesabım, Kategoriler. Sepetim ikonunda adet rozeti. — **görüldü** (M1, M2; mobil site)
2. **Alt sekme çubuğu, uygulama:** yalnız tablet karesinde çubuğun üst kenarı ve ikonları yarım görünüyor, biri vurgu renginde; etiketler okunamıyor. Sekme adları ve sırası — **doğrulanmadı** (P-ss08). İ şeridinin hatırlama notu dört sekmeli başka bir dizilim söylüyor (ana sayfa, kategoriler, sepet, hesap); mobil sitede görülen beşli dizilimle uyuşmuyor — **doğrulanmadı**.
3. **Ana sayfa üst çubuğu, uygulama:** vurgu renkli başlık bloğu, içinde beyaz yuvarlak köşeli arama kutusu; solda büyüteç, sağda kamera ikonu. — **görüldü** (P-ss02, A-s2). Kaydırırken sabit kalıp kalmadığı — **doğrulanmadı**.
4. **Ana sayfa üst çubuğu, mobil site:** sabit; üst satırda logo ve üyelik programı bağlantısı, altında tek satır arama kutusu; kamera ikonu yok. — **görüldü** (M1)
5. **İç sayfa üst çubuğu, uygulama:** liste sayfasında geri oku + arama alanı + paylaş ikonu (P-ss03, P-ss09, A-s3). İçerik sayfalarında ortada logo; iOS karelerinde ayrıca geri oku ve paylaş (A-s4, A-s5, A-s6), Android karelerinde başlıkta yalnız ortalanmış logo var; geri oku ve paylaş ikonu görünmüyor (P-ss04, P-ss05, P-ss06). Şerit notu bunu yalnız P-ss04 için açıkça yazmıştı; düzeltme turunda üç karenin başlık bölgesi kırpılıp yeniden bakıldı, üçünde de durum aynı. Tablet liste karesinde ortalanmış sayfa başlığı + geri + paylaş (P-ss10). — **görüldü**; Android'de geri okunun gerçekten olmadığı mı, yoksa yalnız pazarlama karesinde mi gösterilmediği **doğrulanmadı**.
6. **İç sayfa üst çubuğu, mobil site:** ürün sayfasında logo + sağda arama ikonu; liste sayfasında sade başlık. — **görüldü** (M1, M2)
7. **Hamburger menü yok.** — **görüldü** (M2; mobil site). Eski web stil rehberinde hamburger ve akordeon menü anlatılıyor — **dolaylı** (İ; ~2016–2017, güncel değil).
8. **Başlıkta konum/teslimat adresi seçici görülmedi.** Mobil site başlığında yok — **görüldü** (M1; DOM). Uygulama karelerinde başlıkta görünmüyor (P-ss02, A-s2); bu, kırpık ve durağan karelerde bir yokluk gözlemidir, uygulamada olmadığı — **doğrulanmadı**. Mobil sitenin ürün sayfasında teslimat bölümünde bir konum seçme bağlantısı var (3.6, madde 11).
9. **Yalnız web'e özgü öğeler:** sabit uygulama indirme şeridi (56 px), çerez onay kartı. — **görüldü** (M1)
10. **Geniş ekran:** aynı kampanya listesi tablette 3 sütun (P-ss09); büyük kartlı takas listesi tablette 2 sütun (P-ss10). — **görüldü**
11. **Açılış ekranı:** koyu zemin, ortada logo, altında kampanya rozeti; etkileşim yok. — **görüldü** (P-ss01, P-ss07, A-s1)

**(b) Mixo karşılığı**

| Bölge | Karar | Nasıl | Gerekçe |
|---|---|---|---|
| 5 sekmeli alt çubuk | Uyarla | `app/(tabs)/_layout.tsx`: sıra **Start, Merkliste, Warenkorb, Mein Bereich, Kategorien**; ikon üstte etiket altta. Rozet: `cartCount` ve `favs.length` (cihazdaki veri). Aktif sekme rengi `colors.primary`; bugün `colors.accent` (turuncu). (P1) | Mobil sitede görülen sıra izlendi; uygulamadaki sıra doğrulanmadı. Hesap yerine cihaz verisiyle çalışan "Mein Bereich" konur (3.9). Sıra kaynakla aynı olduğu için aktif sekme turuncu bırakılmaz (bölüm 5). |
| Arama sekmesi | Uyarla | `app/(tabs)/suche.tsx` sekmeden çıkar, yığın ekranı `app/suche.tsx` olur; başlıktaki arama kutusundan açılır. (P1) | Kaynakta arama sekme değil, başlıkta. Aynı arama işlevi (cihazda parça tarama) korunur. |
| Ana sayfa arama başlığı | Uygula | `components/Banners.tsx` içindeki `SearchPill`: renkli başlık bloğu içinde beyaz kutu, solda büyüteç. Yer tutucu: "Im Outlet suchen"; bugün kodda "Produkt, Marke oder Modell suchen" yazıyor, arama girişinde de değişir. Blok rengi `colors.primary` (koyu), turuncu değil. (P1) | Yapı aynı; renk kimliği bizim (bölüm 5). Bugünkü yer tutucu kaynağınkinin birebir çevirisi değil, ama aynı üç öğeli kalıpta; kalıp benzerliği de bırakılmaz. |
| Kamera (görselle arama) ikonu | Atla | — | Eksik: görsel tanıma servisi ve katalog görsel dizini. |
| İç sayfa başlığı: geri + arama alanı | Uygula | `app/kategorie/[key].tsx` ve `app/suche.tsx` başlığında geri oku + arama alanı (dokununca arama katmanı). (P1) | Bugünkü veriyle çalışır. |
| Paylaş ikonu | Atla (veri gelince P3 #5) | — | Eksik: ürün ve kategori için herkese açık adres ya da derin bağlantı. |
| Hamburger menü yok | Uygula | Mevcut durum; menü eklenmez. | Kaynakla aynı. |
| Konum/teslimat seçici | Atla | — | Eksik: adrese bağlı teslimat tarihi ve teslimat seçeneği verisi. Kaynakta da başlıkta görülmedi; uygulamadaki durumu doğrulanmadı. |
| Uygulama indirme şeridi, çerez kartı | Atla | — | Veri eksiği değil; yalnız web'e özgü, uygulamada karşılığı yok. |
| Geniş ekranda sütun artışı | Uygula | `components/ui.tsx` `ProductGrid`: genişliğe göre 2 sütun (telefon), 3 sütun (≥ 700 px). (P1) | Bugünkü veriyle çalışır. |
| Açılış ekranı | Uyarla | Bugün `mobile/app.json` içinde açılış ayarı yok (yalnız simge ayarı ve `expo-router`, `expo-image` eklentileri); `assets/splash-icon.png` ve `assets/icon.png` proje şablonunun yer tutucu görselleri (bakıldı), Mixo Outlet logosu yok. P1 #12: açılış ayarı eklenir, yalnız kendi zemin rengimizle (`colors.primary`); kampanya rozeti yok. Logo, mağazadan dosya gelince eklenir (P3 #9). (P1; `src` dışında) | Canlı kampanya verisi yok; rozet uydurulmaz. Logo dosyası elimizde yok, biz de çizmeyiz. Ayarın adı ve biçimi, kullanılan Expo sürümünün (SDK 58) belgesinden doğrulanacak. |

### 3.2 Ana sayfa

**(a) Hepsiburada'da**

Uygulama (mağaza kareleri, kampanya dönemi):

1. **Arama başlığı** (3.1, madde 3). — **görüldü** (P-ss02, A-s2)
2. **Yatay kapsül sekme şeridi:** kişisel sekme, kampanya sekmesi (seçili, dolgulu), ardından kategori ve indirim sekmeleri; her kapsülde küçük ikon + etiket; sağdan taşıyor. Tablette 7'den fazla kapsül. — **görüldü** (P-ss02, P-ss08, A-s2). Kapsüle dokununca ne olduğu — **doğrulanmadı**.
3. **Geniş banner:** yuvarlak köşeli, yaklaşık 3,2–3,5:1; tablette yandaki bannerların kenarı görünüyor (kaydırmalı şerit). — **görüldü** (P-ss02, P-ss08, A-s2). Nokta göstergesi ve otomatik geçiş — **doğrulanmadı**.
4. **Hızlı erişim kutuları:** 6 kare kutu, üstte ikon altta etiket (kategoriler, kampanya, taksit, takas, üyelik, altın). — **görüldü** (yalnız tablet, P-ss08). Telefonda var mı — **doğrulanmadı** (kareler kırpık).
5. **Kampanya bölümü:** sol hizalı başlık + iki satırlı, yatay kaydırılan kategori karoları. Karo: ad sol üstte, ürün görseli sağ altta, indirim rozeti sol altta. — **görüldü** (P-ss02, A-s2)
6. **Büyük kategori vitrin kartları:** yatay kaydırılan dikdörtgen fotoğraf kartları, başlık sol üstte. — **görüldü** (P-ss02, A-s2; yarısı kırpık)
7. **Kişisel kutular şeridi:** yuvarlak köşeli kare kutular, üstte görsel, altta iki satır etiket. — **görüldü** (yalnız tablet, P-ss08)
8. **İkinci, daha kısa banner şeridi.** — **görüldü** (yalnız tablet, P-ss08)
9. **Öneri ürün şeridi:** kartta sol üstte yuvarlak rozet, sağ üstte kalp, görsel, sıra etiketi, 2 satır başlık, yıldız + puan + sayı; altı kırpık. — **görüldü** (yalnız tablet, P-ss08)
10. **Hikâye daireleri yok;** yuvarlak köşeli kareler var. — **görüldü** (P-ss08)

Mobil site:

11. **3 kısayol kutusu** yan yana (görsel kart). Biri uygulamaya özel derin bağlantı taşıyor. — **görüldü** (M1)
12. **Kampanya banner çiftleri:** tam genişlik, alt alta, durağan; nokta göstergesi DOM'da yok. — **görüldü** (M1)
13. **Yatay ürün satırları:** üç başlık altında; biri yaklaşık 20, biri yaklaşık 120 kart. — **görüldü** (M1)
14. **Ana sayfa ürün kartı:** kare görsel, sol üstte rozet, sağ üstte kalp, 2–3 satır başlık, puan satırı, sepete özel etiketi, üstü çizili eski fiyat + yüzde, büyük fiyat, sepet ikonlu fiyat düğmesi, varsa kampanya satırı ve üyelik fiyatı. — **görüldü** (M1)
15. **Sayfa sonu:** uzun banner ve ürün akışı, marka metin bağlantıları, arama motoru metni. — **görüldü** (M1; son ikisi web'e özgü)

Uygulama ile mobil site farkı: kapsül şeridi, hızlı erişim kutuları ve iki satırlı karo ızgarası yalnız uygulama karelerinde; üçlü kısayol kutusu ve alt alta banner yığını yalnız mobil sitede görüldü. Market, yurt dışı alışveriş ve uçak bileti gibi modüllerin ana sayfadaki yeri — **doğrulanmadı** (İ). Resmî olmayan APK sitelerinin notlarında bir keşfet bölümünden ve ana ekran araç takımından (widget) söz ediliyor; notların tarihi belirsiz, kaynak güvenilir bulunmadı, hiçbir kare teyit etmiyor — **doğrulanmadı** (İ; bu sitelerden hiçbir şey indirilmedi). Mobil sitenin ilk sekmesinin adı da keşfet (3.1, madde 1); ikisinin aynı şey olduğu **doğrulanmadı**.

**(b) Mixo karşılığı**

| Bölge | Karar | Nasıl | Gerekçe |
|---|---|---|---|
| Arama başlığı | Uygula | 3.1'deki `SearchPill`. (P1) | — |
| Kapsül sekme şeridi | Uyarla | Yeni `components/home.tsx` `ChipStrip`, marka ekseni ("Top-Marken"): kategori süzgeç özetlerinden (`facets[kategori].b`) ürün sayısına göre ilk 16 (marka, kategori) çifti. Etiket "{Marke}"; aynı marka iki kategoride çıkarsa "{Marke} · {Kategorie}". İkon yok (marka logosu verimiz yok). Dokununca `/kategorie/[key]?marke=`: o kategorinin listesi, `vendor` alanı markaya tam eşit olan ürünlerle (metin araması değil); liste başlığındaki sayı aynı dizin sayısıdır (3.5). (P1) | Kişiselleştirme ve canlı kampanya yok. Kategoriler bu şeride konmaz: aynı 10 kategori karolarda ve sekmede zaten var. Marka ekseninin ana sayfada başka girişi yok. Dokunma davranışı kaynakta doğrulanmadı. |
| Geniş banner şeridi | Uygula | `components/Banners.tsx`: oran ~3,2:1, yan kartın kenarı görünür. İçerik yalnız gerçek veriden: "Gratisversand ab 39 €" (`home.freeShip`), kategori ürün sayıları, doluysa duyuru metni (`/api/config`). Afiş zemininde `colors.accent` kullanılmaz; bugün "Uhren" afişi turuncu (bölüm 5). (P1) | Mevcut bileşen; uydurma kampanya yok. Nokta göstergesi eklenmez (kanıt yok). |
| Hızlı erişim kutuları | Atla | — | Kaynaktaki 6 kutunun beşi bizde olmayan hizmetler (kampanya, taksit, takas, üyelik, altın). Altıncısı (kategoriler) bizde sekme ve karolarla karşılanıyor. Koyabileceğimiz kutular yeni bir şey getirmiyor: "Merkliste" sekmeyle aynı; "Bis 25 €" ve "Ab 120 €" ürün satırlarıyla aynı listeye gider (sunucu bu listeleri en çok 12 ürünle veriyor, satır hepsini gösteriyor). Kaynakta kutular yalnız tablet karesinde görüldü. Seçenek açık kalanlar listesinde (bölüm 6). |
| İki satırlı kategori karoları | Uyarla | `components/home.tsx` `CategoryTileGrid`, başlık "Kategorien": ad sol üstte, sağ altta o kategorinin temsilci ürün görseli, sol altta ürün sayısı rozeti (`cats[].n`). Görsel kuralı: kategorinin ilk parçasında (`loadChunk(k, 0)`) `na` olmayan ve düşük kalite bayrağı taşımayan ilk ürün. Bu bayrak parça satırının 10. alanı; `loadChunk` bugün okumuyor, `Product` tipine eklenir (P1 #3). Parçalar karo satırı ekrana gelince istenir. Mevcut yuvarlak ikon şeridinin yerini alır; ana sayfadaki tek kategori girişidir. (P1) | İndirim yüzdesi yok (hiçbir üründe eski fiyat yok); yerine gerçek ürün sayısı. Kaynakta da daire değil karo var. Yük (ölçüldü): 10 kategorinin ilk parçaları toplam ~651 KB (dosya başına 2,6–107 KB). Aynı parça, kategori açılınca zaten gerekiyor ve önbellekte kalıyor. Bugün 67 kapsamın hepsinde ilk ürün bayraksız; kural, veri değişirse diye var. Daha hafif yol: dizine temsilci görsel (P3 #10). |
| Büyük kategori vitrin kartları | Uyarla | Başlık "Größte Unterkategorien": ürün sayısı en yüksek 6 alt kategori (`cats[].subs[].n`); kartta ad + "{n} Produkte". Fotoğraf, karolardaki görsel kuralıyla o alt kategorinin ilk parçasından. Dokununca `/kategorie/[key]?sub=`. (P1) | Kampanya fotoğrafı yok; yerine katalog görseli ve gerçek sayı. Sıralama ölçütü ürün sayısıdır, talep verisi değil; bu yüzden başlıkta "beliebt" denmez (bölüm 5). Yük (ölçüldü): en büyük 6 alt kategorinin ilk parçaları toplam ~455 KB. |
| Kişisel kutular şeridi | Uyarla | "Zuletzt angesehen": cihazda tutulan son bakılan ürünler (P2 #2); boşsa gizli. P1'de bu şerit yok. (P2) | Kişisel indirim verisi yok; kişiye ait tek gerçek veri cihazdaki geçmiş. Marka girişi kapsül şeridine alındı; aynı liste ana sayfada iki kez gösterilmez. |
| İkinci banner şeridi | Atla | — | Eksik: ayrı kampanya içeriği ve görseli. Tek şerit yeter. |
| Öneri ürün şeridi | Uygula | Mevcut satırlar: `home.best`, "Preiswert unter 25 €" (`home.budget`), "Ab 120 €" (`home.premium`; bugünkü başlık "Premium" değişir, bölüm 5), "Aktionen" (`home.deals`, boşken gizli). `home.best` başlığı listenin kaynağına bağlı: sunucu `bestSource` = `behavior` derse "Beliebt", `curated` derse "Unsere Auswahl" (bölüm 5; alan P1 #3'te okunur). "Alle ansehen" eklenmez: sunucu her listeyi en çok 12 ürünle veriyor, satır hepsini gösteriyor. (P1) | Bugünkü uç noktayla çalışır. |
| Karttaki sıra etiketi ve puan | Atla | — | Eksik: satış sıralaması ve puan/yorum verisi. |
| Üçlü kısayol kutusu (mobil site) | Atla | — | Eksik: kampanya görseli ve içeriği. |
| Alt alta kampanya banner yığını (mobil site) | Atla | — | Eksik: canlı kampanya ve görsel içerik. |
| Marka metin bağlantıları, arama motoru metni | Atla | — | Web'e özgü; marka erişimi kapsül şeridiyle karşılandı. |
| Demo uyarısı | Uygula (bizim) | `DemoBanner` ana sayfada kalır. | Kaynakta yok; dürüstlük kuralı gereği kalır. |

### 3.3 Kategoriler

**(a) Hepsiburada'da**

Uygulamanın kategori ekranı hiçbir karede yok — **doğrulanmadı**. Aşağıdakilerin hepsi mobil siteden:

1. **Giriş:** alt çubuktaki Kategoriler sekmesi; ayrı sayfa değil, sekme çubuğunun üstünde tam ekran katman. — **görüldü** (M1)
2. **Katman başlığı** (yaklaşık 82 px). — **görüldü** (M1)
3. **Tek sütun dikey liste** (iki bölmeli değil, ızgara değil): satır 68 px, solda 44 px kare kategori ikonu + etiket; sağ ok görülmedi. İlk iki satır tanıtım (üyelik programı, oyunlar), ardından 14 ürün kategorisi, sonda sırasıyla yurt dışı ürünleri, yapı market, evcil hayvan ürünleri ve altın; en sonda kampanyalar satırı. Şeridin saydığı adlar: 20 ad + kampanyalar satırı. Şeridin kendi özeti 19 satır diyor; kesin sayı **doğrulanmadı**. — **görüldü** (M1)
4. **İkinci seviye katman:** bir satıra dokununca tam ekran alt kategori katmanı; üstte 44 px başlık ve geri, altında 52 px yüksekliğinde alt kategori satırları (örnekte yaklaşık 30). — **görüldü** (M1)
5. **Üçüncü adım:** alt kategori satırı kategori sayfasına gider. Bu sayfa açılmadı; arama sonuç listesiyle aynı yapıda olduğu — **doğrulanmadı**.
6. Üst kategorinin tamamına giden bir "tümü" satırı — **doğrulanmadı**.

Yazılı kaynaklar: mağaza açıklaması 32 kategori ve yaklaşık 163 milyon ürün diyor — **dolaylı** (P açıklaması, İ). Eski web stil rehberi masaüstünde mega menü, mobilde akordeon anlatıyor — **dolaylı**, güncel değil. Tablet ana sayfasında kategoriler kutusu var — **görüldü** (P-ss08).

**(b) Mixo karşılığı**

| Bölge | Karar | Nasıl | Gerekçe |
|---|---|---|---|
| Sekmeden giriş | Uygula | "Kategorien" sekmesi, son sırada. (P1) | — |
| Tek sütun liste, kare ikon + etiket | Uygula | `app/(tabs)/kategorien.tsx`: satıra 44 px kare ikon (Ionicons eşlemesi `app/(tabs)/index.tsx` içinden ortak `categoryIcons.ts` dosyasına taşınır; ikon rengi `colors.primary`, bugünkü turuncu değil); ikinci satır "{n} Produkte" (`cats[].n`). (P1) | Bugünkü veriyle çalışır; ürün sayısı gerçek. |
| Baştaki tanıtım satırları (üyelik, oyun) | Atla | — | Eksik: sadakat programı ve oyun modülü. |
| Sondaki kampanyalar satırı | Uyarla | "Angebote" satırı, yalnız indirimli ürün sayısı > 0 ise (`facets[...].sale`); bugün 0, satır gizli. (P1) | Canlı kampanya yok; yerine gerçek indirimli ürün sayısı. |
| İkinci seviye alt kategori katmanı | Uygula | `kategorien.tsx` içinde iki seviyeli durum: kategoriye dokununca alt kategori listesi (satır 52 px, "{ad} ({n})", `cats[].subs`); ilk satır "Alle in {Kategorie}" (bizim eklememiz). Seçim `/kategorie/[key]?sub=` ile listeyi açar. (P1) | Yapı aynı. "Tümü" satırı kaynakta doğrulanmadı; bizde tüm kategoriye ulaşmak için gerekli. |
| Kategori sayfası | Uygula | 3.5'teki liste ekranı. | — |

### 3.4 Arama

**(a) Hepsiburada'da**

Uygulamanın arama katmanı hiçbir karede yok — **doğrulanmadı**. Uygulamada görülen tek şey arama kutusu ve kamera ikonu (P-ss02, A-s2). Aşağıdakiler mobil siteden:

1. **Arama katmanı:** kutuya dokununca sekme çubuğunun üstünde tam ekran katman; üstte geri ikonu + arama girişi. — **görüldü** (M1)
2. **Popüler aramalar:** başlık + 10 satır (ikon + terim). — **görüldü** (M1)
3. **Arama geçmişi:** temiz oturumda bölüm yoktu; sayfa yapılandırmasında geçmiş bayrağı açık. Geçmişin nasıl göründüğü — **doğrulanmadı**.
4. **Yazarken:** 10 otomatik tamamlama satırı; altında başlıklı bir ürün kartı listesi (ana sayfa kartıyla aynı). Ayrı kategori ya da marka önerisi bölümü görülmedi. — **görüldü** (M1)
5. **Gönderince:** sonuç sayfası (3.5). — **görüldü** (M1)
6. **Yazım düzeltme bildirimi:** sonuç başlığında düzeltilen terim, ürün sayısı ve düzeltmesiz arama bağlantısı. — **görüldü** (M1)

Yazılı kaynaklar: fotoğrafla ürün arama 2017'de duyuruldu (bugün duruyor mu bilinmiyor); barkodla arama bir 2025 uygulama tanıtımında geçiyor — **dolaylı** (İ). Sesli arama için kaynak yok — **doğrulanmadı**.

**(b) Mixo karşılığı**

| Bölge | Karar | Nasıl | Gerekçe |
|---|---|---|---|
| Tam ekran arama katmanı | Uygula | `app/suche.tsx` (yığın ekranı): geri + otomatik odaklanan giriş. (P1) | Bugünkü veriyle çalışır. |
| Popüler aramalar | Uyarla | "Top-Marken": ana sayfa kapsülleriyle aynı (marka, kategori) çiftleri; satırda "{Marke} · {Kategorie}" ve "{n} Produkte" (`facets[kategori].b`). Dokununca metin araması yapılmaz; `/kategorie/[key]?marke=` açılır (o kategoride `vendor` tam eşleşmesi) ve listede aynı sayı görünür. (P1) | Toplu arama istatistiği yok ve uydurulmaz; yerine gerçek marka sayıları. Metin araması bu sayıyı tutturmaz: eşleştirici başlık + marka + alt kategori metnine bakıyor (`makeMatcher`), yani başlığında marka adı geçen uyumlu ürünler de gelir. Ölçüldü (ham parça dosyaları): "HP" dizinde 1.355 ürün, metin araması 2.932 sonuç; "SAMSUNG" 529 / 673. |
| Arama geçmişi | Uyarla | "Letzte Suchen" (en çok 10) + "Verlauf löschen"; `store/shopStore.tsx` içinde cihazda tutulur. (P2) | Kaynaktaki görünüm doğrulanmadı; bizde cihaz verisi. |
| Otomatik tamamlama | Uyarla | Yazılan metne uyan kategori, alt kategori (`index.cats`) ve marka adları (`index.facets`); cihazda süzülür. Kategori ve alt kategori önerisi o listeyi, marka önerisi markanın en çok ürünü olan kategorisindeki marka süzgecini açar. (P1) | Sunucu tarafı öneri servisi yok; yerine dizindeki gerçek adlar. Dizin kapsam başına yalnız ilk 16 markayı taşıyor: katalogdaki 1.108 markanın 395'i önerilebilir. |
| Yazarken alttaki ürün listesi | Uyarla | `home.best` listesi; başlık 3.2'deki kurala göre "Beliebt" ya da "Unsere Auswahl". (P1) | Sorguya özel öneri motoru yok; yerine sunucunun gerçek listesi. |
| Sonuç sayfası | Uyarla | Sonuçlar 3.5'teki ortak ızgara ve süzgeç/sıralama çubuğuyla; mevcut "Katalog zu X % durchsucht" ve "Weiter suchen" kalır. Arama için ayrı kural: (1) sıralama düğmesi tarama %100 olana kadar pasiftir, altında "Sortieren erst nach vollständiger Suche" yazar; yanındaki "Ganzen Katalog durchsuchen" kalan parçaları ilerleme göstererek yükler. (2) Süzgeçler daha önce kullanılabilir, ama çubuğun altında zorunlu not durur: "Filter gilt nur für die durchsuchten X % des Katalogs"; süzgeç katmanındaki sayılar 3.5'teki sayı kuralıyla etiketlenir. (3) Toplam sonuç sayısı yalnız %100'de gösterilir. (P1) | Arama cihazda `all` kapsamını parça parça tarıyor: 90 parça, ölçülen toplam ~7,3 MB, adım başına 3 parça. Kısmi sonuçta "Preis aufsteigend" yalnız taranan kısmın en ucuzunu öne getirir; kullanıcı bunu katalogdaki en ucuz ürün sanar. 3.5'teki "tüm parçaları yükle" kuralı kategori listesi içindir; aramada koşul tarama oranına bağlandı. |
| Yazım düzeltme bildirimi | Uyarla | "Meintest du „{Name}“?": taranan kısımda sonuç yoksa sorgu, dizindeki kategori, alt kategori ve marka adlarıyla karşılaştırılır (aynı `norm` kuralı, en çok 2 harf farkı); en yakın tek ad öneri olarak gösterilir, dokununca o liste açılır. Sorgu kendiliğinden değiştirilmez, sonuç sayısı yazılmaz. (P2 #8) | Yazım düzeltme ve eşanlam sözlüğü yok; eşleştirici yalnız büyük/küçük harf, aksan ve tire farkını yok sayıyor (`makeMatcher`). Öneri yalnız dizindeki gerçek adlardan gelir (10 kategori, 56 alt kategori, 395 marka adı); ürün başlığındaki ya da model adındaki yazım hatasını yakalamaz. Kaynaktaki otomatik düzeltme yapılmaz. |
| Görselle arama, barkod | Atla | — | Eksik: görsel dizini; ürün verisinde barkod (EAN) alanı yok. |
| Sesli arama | Atla | — | Kaynakta kanıt yok; ayrıca ses tanıma servisi yok. |

### 3.5 Ürün listesi (sıralama, süzgeç, kart)

**(a) Hepsiburada'da**

Uygulama (mağaza kareleri):

1. **Üst çubuk:** geri + arama alanı + paylaş. — **görüldü** (P-ss03, P-ss09, A-s3)
2. **Tam genişlik kampanya banner'ı** listenin üstünde. — **görüldü** (P-ss03, P-ss09, A-s3). Takas listesinde banner açık zeminli: solda illüstrasyon, sağda kalın başlık, altında kartsız taksit satırı ve dolgulu yuvarlak bir ayrıntı düğmesi. — **görüldü** (P-ss10)
3. **Süzgeç/sıralama çubuğu:** yatay kaydırılır; önce iki kare ikon düğmesi (süzgeç, sıralama), sonra kapsül düğmeler (hızlı teslimat, satıcı, kredi limiti; tablette ayrıca ölçü ve fiyat aralığı). Başka bir listede yazılı süzgeç düğmesi üzerinde etkin süzgeç sayacı (3), ardından sıralama ve özellik kapsülleri. — **görüldü** (P-ss03, P-ss09, P-ss10, A-s3). Çubuğun sabit kalıp kalmadığı — **doğrulanmadı**.
4. **Izgara:** telefonda 2 sütun; tablette 3 sütun (P-ss09) ya da büyük kartla 2 sütun (P-ss10). — **görüldü**
5. **Kart (uygulama):** kare görsel; sağ üstte beyaz daire içinde kalp; bazı kartlarda sol üstte yuvarlak avantaj rozeti, görselin altında galeri noktaları, sol altta teslimat rozeti, sağ altta küçük ikon + sayı (anlamı **doğrulanmadı**; şeridin tahmini satıcı ya da seçenek sayısı, mobil site kartında seçenek sayısı rozeti var, madde 11); ilk kartta sıra şeridi; 1–2 satır başlık (marka kalın); yıldız + puan + parantez içinde yorum sayısı; mor taksit etiketi; alt satırda solda kalın fiyat, sağda sepete ekle ikonu. — **görüldü** (P-ss10; daha yalın hâli P-ss03, P-ss09, A-s3). Telefon karelerinde fiyat satırı görünmüyor (kırpık). Eski fiyat ve indirim yüzdesi uygulama kartlarında görülmedi. Bir sonraki satırdaki bir kartın üstünde mor bir kredi faizi rozeti kısmen görünüyor (P-ss10).
6. **Süreli fırsat listesi:** banner, ortalanmış başlık, 3 kutulu geri sayım (saat, dakika, saniye), altında tek sütun yatay kartlar: solda görsel; sağda ücretsiz kargo rozeti, 3 satıra kadar başlık, yıldızlar + yorum sayısı + stok etiketi, tam genişlik çerçeveli sepete ekle düğmesi. Fiyat satırı görünmüyor. — **görüldü** (P-ss06, A-s6)

Mobil site (arama sonucu):

7. **Denetim çubuğu:** süzgeç, sıralama, ardından hızlı süzgeç kapsülleri; sayfayla birlikte kayıyor, sabit değil. — **görüldü** (M1)
8. **Sıralama katmanı:** 7 seçenek (varsayılan, çok satanlar, yorum sayısı, artan fiyat, azalan fiyat, en yeniler, ürün puanı) + sıralama algoritması bağlantısı. — **görüldü** (M1)
9. **Süzgeç katmanı:** tam ekran, başlık + kapat ikonu; örnek aramada 25 açılır grup: kategori, hızlı teslimat, marka, fiyat aralığı, satıcı, puan ve kategoriye göre değişen ürün özelliği grupları. — **görüldü** (M1)
10. **Izgara:** yalnız 2 sütun; liste/ızgara değiştirici görülmedi. — **görüldü** (M1)
11. **Kart (mobil site):** 3:4 görsel; sol üstte rozet, sağ üstte kalp; görselin sol altında kargo günü bilgisi, varsa seçenek sayısı rozeti; 2–3 satır başlık; puan satırı; taksit satırı; üstü çizili eski fiyat + yüzde + büyük fiyat; sepet ikonlu fiyat düğmesi (ayrı yazılı sepete ekle düğmesi yok). — **görüldü** (M1)
12. **Sayfalama:** sonsuz kaydırma yok; liste sonunda oklu sayfa gezgini (1 / 50). — **görüldü** (M1). Uygulamada nasıl olduğu — **doğrulanmadı**.
13. **Sponsorlu işareti:** DOM'da bulunmadı — **doğrulanmadı**.

Uygulama ile mobil site farkı: görsel oranı (kare / 3:4), sepete ekleme (fiyatın yanında ikon / fiyat düğmesinin kendisi), eski fiyat ve yüzde (uygulama karelerinde yok / sitede var). Hangisinin güncel uygulamayı yansıttığı — **doğrulanmadı**. Sıralama ve süzgeç hakkında yayımlanmış kaynak yok (İ).

**(b) Mixo karşılığı**

Kendi verimizden ölçülen kısıt (`demo/data/index.js` ve parça dosyaları, yalnız okundu): parça başına 500 ürün; `all` 90 parça (toplam ~7,3 MB, parça başına ortalama ~81 KB), Technik 55 parça, en büyük alt kategori 23 parça. Süzgeç özetleri (`facets`: kapsam başına en çok 16 marka + sayıları, toplam marka sayısı `nb`, en düşük ve en yüksek fiyat, indirimli ürün sayısı) 67 kapsam için dosyada var ama `api/shop.ts` içindeki `Index` tipinde henüz yok. Özet yalnız ilk 16 markayı sayıyor; kapsamdaki marka sayısı çok daha yüksek olabilir (`uhren` 175, `uhren/0` 91, `technik` 522, `all` 1.108). İndirimli ürün sayısı her kapsamda 0. Dizindeki sayılar durağan dosyadan gelir; yöneticinin gizlediği ürünler cihazda elendiği için (`applyConfig`), gizli ürün varsa yüklenen sayı dizindeki sayının altında kalabilir.

**Sayı kuralı** (bu bölümdeki ve aramadaki her sayı için): bir sayı ya kapsamın tamamı için kesindir ya da açıkça "yüklenenler içinde" diye etiketlenir; ikisi aynı yerde karıştırılmaz. Kesin olanlar: dizindeki ürün sayıları (`cats[].n`, `subs[].n`), dizindeki ilk 16 markanın sayıları ve kapsamın bütün parçaları yüklendikten sonra cihazda sayılan her şey. Kesin olmayanlar: kapsam tamamen yüklenmeden cihazda sayılanlar; bunlar "unter {m} geladenen Produkten" ekiyle gösterilir ya da hiç yazılmaz.

| Bölge | Karar | Nasıl | Gerekçe |
|---|---|---|---|
| Üst çubuk: geri + arama alanı | Uygula | `app/kategorie/[key].tsx` başlığı. Paylaş atlanır (3.1). (P1) | — |
| Liste üstü kampanya banner'ı | Uyarla | Metin bandı: kategori adı, ürün sayısı (`cats[].n`), fiyat aralığı (`facets.min`–`facets.max`). (P1) | Kampanya görseli yok; yerine gerçek kapsam özeti. |
| Banner'daki ayrıntı düğmesi | Atla (veri gelince P3 #4) | — | Eksik: düğmenin açacağı içerik sayfası (3.11). |
| Süzgeç/sıralama çubuğu | Uygula | Yeni `components/listing.tsx` `FilterBar`: [süzgeç ikonu + etkin sayaç] [sıralama ikonu] + kapsüller "Marke", "Preis", "Nur verfügbar"; "Reduziert" yalnız `sale` > 0 ise. Mevcut kapsüller buraya taşınır. Liste `?marke=` ile açıldıysa "Marke" kapsülü seçili başlar. (P1) | Düzen aynı, içerik gerçek alanlardan. |
| Teslimat, satıcı, kredi kapsülleri | Atla | — | Eksik: teslimat tahmini, satıcı verisi (tek satıcı), taksit/kredi. |
| Sıralama katmanı | Uyarla | `components/listing.tsx` `SortSheet`: "Standard", "Preis aufsteigend", "Preis absteigend". Fiyat sıralaması seçilince kapsamın tüm parçaları yüklenir, ilerleme gösterilir; büyük kapsamda (Technik, 55 parça) önce alt kategori seçtirilir. Arama sonuçlarında koşul ayrıdır (3.4). (P1) | Cihazda sıralama ancak tüm kapsam yüklüyse doğru olur. Çok satan, yorum sayısı, puan ve en yeni atlanır. Eksik: satış verisi, puan/yorum, ürün ekleme tarihi (satış verisi ve tarih gelirse P3 #6). |
| Süzgeç katmanı | Uyarla | `components/listing.tsx` `FilterSheet` (tam ekran): "Unterkategorie" (`cats[].subs`, dizindeki sayılarla), "Marke", "Preis" (hazır aralıklar; sınırlar `facets.min/max`), "Verfügbarkeit" (`na`), "Reduziert" (`was` > `price`; bugün gizli). "Marke" grubu: üstte dizindeki ilk 16 marka, kapsamın tamamı için sayılarıyla (`facets[kapsam].b`); altında "Weitere Marken": yüklenen parçalarda görülen diğer markalar, sayısız; grup başlığında "{nb} Marken insgesamt, weitere erscheinen beim Laden". Kapsam tamamen yüklenince bütün markalar sayılı gösterilir. Altta "Zurücksetzen" ve gösterme düğmesi: kapsam tamamen yüklüyse "{n} Produkte anzeigen"; değilse yalnız "Anzeigen", üstünde "{n} Treffer unter {m} geladenen Produkten". (P1) | Özellik grupları atlanır. Eksik: ürün özellik alanları (renk, ölçü vb.), satıcı, puan, teslimat. Dizin yalnız ilk 16 markanın sayısını veriyor; diğer markaların sayısı ancak yüklenen parçalardan çıkar ve eksik kalır, bu yüzden yazılmaz. Sonsuz kaydırmada düğmedeki sayı da yalnız yüklenen satırları sayar; kesin sayı gibi sunulmaz. |
| 2 sütun ızgara, tablette 3 | Uygula | `ProductGrid` (3.1). (P1) | — |
| Kart: kare görsel, sağ üstte kalp | Uygula | `components/ui.tsx` `ProductCard` (mevcut). Dolu kalp rengi `colors.primary` (bölüm 5). (P1 #2) | — |
| Kart: sol üst rozet | Uyarla | İndirim yüzdesi rozeti yalnız `was` > `price` ise (mevcut kural). Rozet zemini `colors.primary`, turuncu değil (bölüm 5). (P1 #2) | Avantaj rozeti için veri yok; yerine gerçek eski fiyattan hesaplanan yüzde. Bugün hiçbir üründe yok. |
| Kart: galeri noktaları, seçenek sayısı | Atla | — | Eksik: birden çok görsel ve varyant. |
| Kart: teslimat rozeti | Uyarla | Yalnız "Nicht verfügbar" (`na`) gösterilir (mevcut). | Teslimat tahmini yok; yerine gerçek uygunluk bayrağı. |
| Kart: sıra şeridi, puan satırı, taksit etiketi, kredi rozeti, sepete özel fiyat, üyelik fiyatı | Atla | — | Eksik: satış sıralaması, puan/yorum, taksit ve kredi, sepete özel fiyat, sadakat programı. |
| Kart: başlık (marka kalın) | Uygula | `ProductCard`: `vendor` kalın + `title` aynı metin bloğunda, 2 satır. (P1) | — |
| Kart: fiyat + sepete ekle ikonu | Uygula | `ProductCard` alt satırı: solda fiyat (`price`; varsa üstü çizili `was`), sağda sepet ikonu (`addToCart`, `na` ise pasif). Erişilebilirlik etiketi "In den Warenkorb". (P1) | Sepet cihazda; bugünkü veriyle çalışır. |
| Süreli fırsat: geri sayım | Atla | — | Eksik: bitiş saati olan canlı kampanya. |
| Süreli fırsat: stok etiketi | Atla | — | Eksik: stok adedi. |
| Süreli fırsat: yatay kart listesi | Uyarla | `components/ui.tsx` yeni `ProductRowCard` (solda görsel, sağda başlık, fiyat, "In den Warenkorb"); "Aktionen" listesinde, `home.deals` dolduğunda. (P3) | Bugün `deals` boş; gerçek indirim verisi gelince açılır. |
| Sayfalama | Uyarla | Mevcut sonsuz kaydırma kalır. Başlık satırı: süzgeç yokken "{yüklenen} von {toplam}" (`cats[].n`, `subs[].n`); süzgeç açıkken toplam gösterilmez, yerine bugünkü ifade kalır: "{n} Treffer unter {m} geladenen Produkten". Tek istisna marka girişi (`?marke=`, dizindeki 16 markadan biri, başka süzgeç yok): "{gefunden} von {n}", n dizindeki marka sayısı; yükleme, bulunan sayı n'ye ulaşınca ya da kapsam bitince durur. (P1) | Katalog durağan parça dosyalarıyla geliyor. Süzgeç açıkken dizindeki toplam (`cats[].n`) eşleşen ürün sayısı değildir; gösterilirse yanlış olur. Kaynakta site sayfa gezgini kullanıyor, uygulama doğrulanmadı. |
| Sponsorlu ürün | Atla | — | Eksik: reklam sistemi; kaynakta da doğrulanmadı. |

### 3.6 Ürün ayrıntısı

**(a) Hepsiburada'da**

Uygulamanın ürün ayrıntısı ekranı hiçbir karede yok — **doğrulanmadı**. Aşağıdakiler mobil siteden (tek ürün, M2); alt bölümler yalnız DOM metninden okundu:

1. **Sabit başlık:** logo, üyelik bağlantısı, sağda arama ikonu. — **görüldü**
2. **Kategori izi:** tek satır, yatay kayar, 4 basamak. — **görüldü**
3. **Galeri:** kare, yatay kaydırılır, 10 slayt (biri video), altta nokta göstergesi; sol altta yuvarlak kampanya rozeti, sağ altta video kapsülü; altında o an ürüne bakan kişi sayacı. — **görüldü**
4. **Başlık bloğu:** marka adı bağlantı olarak + başlık (2–3 satır); puan satırı: 5 yıldız, puan, yorum sayısı bağlantısı, fotoğraflı yorum ikonu. — **görüldü**
5. **Bilgi satırları** (48 px, sağda ok): taksit özeti; teslimat sözü (geri sayımlı). Üçüncü satırın içeriği — **doğrulanmadı**.
6. **Seçenek seçici:** renk etiketi + yatay kayan 5 kart (küçük görsel, ad, o seçeneğin fiyatı); seçili kart çerçeveli. — **görüldü**
7. **Ek hizmetler:** yatay kartlar (sigorta, ek garanti; açıklama, fiyat, seçim). — **görüldü**
8. **Üyelik bandı:** tek satır tanıtım + düğme. — **görüldü**
9. **Satıcı bloğu:** satıcı adı, resmî satıcı etiketi, takip et düğmesi. Diğer satıcılar listesi görülmedi — **doğrulanmadı**.
10. **Kampanyalar ve ödeme fırsatları:** kampanya kartları; iki taksit satırı. — **görüldü**
11. **Teslimat seçenekleri:** konum seç bağlantısı, kargo günü + geri sayım. — **görüldü** (konum seçici açılmadı)
12. **Değerlendirmeler:** büyük puan + yorum sayısı; yapay zekâ özeti; 2×2 özellik kutuları; kullanıcı fotoğraf/video şeridi; tekil yorumlar; tüm değerlendirmeler düğmesi. Süzme/sıralama görülmedi. — **görüldü**
13. **Ürün açıklaması** (kapalı, düğmeyle açılır) ve **özellikler** (satır listesi). — **görüldü**
14. **Soru ve cevap:** 5 soru + devamı düğmesi. — **görüldü**
15. **Öneri şeritleri:** benzer, kategoride çok satan, birlikte alınan, popüler, reklamlı benzer, çok karşılaştırılan; ardından marka bağlantıları, 4 güven kutusu, arama motoru bağlantıları. — **görüldü**
16. **Sabit alt çubuk** (72 px): solda fiyat, ortada kalp düğmesi, sağda büyük sepete ekle. Dokununca çubuğun üstünde "sepette" katmanı: ürün adı, sepete git, alışverişe devam, birlikte alınanlar şeridi. — **görüldü**

Yazılı kaynaklar (**dolaylı**, İ): yorum özeti ve hızlı yorum özellikleri (2023), ürün karşılaştırma (2025 tanıtımı), seçili ürünlerde planlı teslimat tarihi (2026 mağaza açıklaması). 2015 tarihli bir web yeniden tasarım haberi ürün sayfasında tam ekran fotoğraf, açıklama, teknik özellik, taksit ve iade koşulları, kargo bilgisi, hediye çeki ve yorumları sayıyor; web'e ait ve eski, bugünkü uygulama için kanıt değil.

**(b) Mixo karşılığı**

| Bölge | Karar | Nasıl | Gerekçe |
|---|---|---|---|
| Başlıkta arama ikonu | Uygula | `app/produkt/[id].tsx` yığın başlığına arama ikonu (arama katmanını açar). (P1) | — |
| Kategori izi | Uygula | "Kategorie › Unterkategorie" (`cat` etiketi, `sub`); dokununca ilgili liste. (P1) | Bugünkü veriyle çalışır. |
| Galeri | Uyarla | Tek kare görsel (`img`), nokta göstergesi yok; dokununca büyütme. (P1) | Tek görsel var. Video ve rozet atlanır (video ve kampanya verisi yok). Çok görselli galeri, veri gelince P3 #1. |
| Canlı izleyici sayacı | Atla | — | Eksik: canlı trafik verisi; uydurma aciliyet olur. |
| Marka bağlantısı + başlık | Uygula | `vendor` dokunulabilir: `/kategorie/[cat]?marke=` (ürünün kategorisinde `vendor` tam eşleşmesi; metin araması değil) + `title`. (P1) | Marka dizindeki ilk 16'daysa listede kesin sayı görünür; değilse yalnız yüklenenler içindeki sayı (3.5, sayı kuralı). |
| Puan satırı, değerlendirmeler, soru-cevap | Atla | — | Eksik: puan, yorum, soru-cevap verisi. Boş "0 Bewertungen" de gösterilmez. |
| Bilgi satırları | Uyarla | İki satır: "Versand" (5,50 €, "gratis ab {eşik}"; ücret `config.ts`, eşik sepetle aynı tek kaynaktan: `home.freeShip`, yedek 39 €; 3.7) ve "Verfügbarkeit" (`na`). Mevcut dipnot kalır. (P1) | Taksit ve teslimat sözü yok; yerine gerçek kargo kuralı ve uygunluk. |
| Seçenek seçici | Atla (veri gelince P3 #1) | — | Eksik: varyant verisi. |
| Ek hizmetler, üyelik bandı | Atla | — | Eksik: ek hizmet ürünleri, sadakat programı. |
| Satıcı bloğu | Atla | — | Eksik: satıcı verisi (tek satıcı). |
| Kampanyalar, ödeme fırsatları | Atla | — | Eksik: kupon/kampanya ve taksit. |
| Teslimat seçenekleri, konum | Atla | — | Eksik: teslimat tarihi tahmini. |
| Açıklama | Atla (veri gelince P3 #1) | — | Eksik: açıklama metni. |
| Özellikler | Uyarla | "Details" tablosu: "Marke", "Kategorie", "Unterkategorie", "Artikelnummer" (`id`), "Verfügbarkeit". (P1) | Teknik özellik alanı yok; yerine eldeki gerçek alanlar. |
| Öneri şeritleri | Uyarla | "Mehr aus {Unterkategorie}" (`loadChunk(cat/sub, 0)`, bu ürün hariç), "Mehr von {Marke}" (aynı parçadan `vendor` eşleşmesi); P2'de "Zuletzt angesehen" (cihaz). (P1/P2) | Birlikte alınan, çok karşılaştırılan ve reklamlı şeritler atlanır. Eksik: sipariş verisi, karşılaştırma verisi, reklam sistemi. |
| Güven kutuları | Atla (veri gelince P3 #4) | — | Eksik: mağazanın gerçek teslimat ve iade koşulları metni. |
| Hediye çeki, iade koşulları (2015 web kaynağı) | Atla | — | Kaynak eski ve web'e ait. Ayrıca eksik: hediye çeki sistemi. İade koşulları metni gelirse güven kutularıyla birlikte ele alınır (P3 #4). |
| Sabit alt çubuk | Uygula | `app/produkt/[id].tsx`: solda fiyat, ortada kalp, sağda "In den Warenkorb"; güvenli alan boşluğuyla. (P1) | Sepet ve favori cihazda çalışıyor. |
| "Sepette" katmanı | Uyarla | Alt katman: "Im Warenkorb", "Zum Warenkorb", "Weiter einkaufen" + "Mehr aus {Unterkategorie}" şeridi. (P1) | Birlikte alınan verisi yok; yerine aynı alt kategoriden gerçek ürünler. |

### 3.7 Sepet

**(a) Hepsiburada'da**

Uygulamanın sepet ekranı hiçbir karede yok — **doğrulanmadı**. Aşağıdakiler mobil siteden (M2); misafir olarak sepete ekleme çalıştı:

1. **Sabit başlık** (48 px): ortada ürün sayılı başlık, sağda çöp kutusu (tümünü sil). — **görüldü**
2. **Kuponlar satırı** (ikon + ok) ve yeni özellik ipucu. Kupon kodu giriş alanı görülmedi. — **görüldü**
3. **Satıcı grubu:** satıcı adı, sağda ücretsiz kargo etiketi; altında kargo günü. — **görüldü**
4. **Ürün satırı:** solda seçim kutusu, ~80 px kare görsel; sağda 2 satır başlık, seçenek adı; altta adet denetimi [adet 1 iken çöp kutusu, sayı, artı], sağda fiyat. "Sonra al" seçeneği görülmedi. — **görüldü**
5. **Birlikte alınanlar şeridi:** yatay, ~20 küçük kart. — **görüldü**
6. **Sabit alt bölge:** üyelik tanıtım bandı (kapatılabilir); özet çubuğu: solda seçilen ürün sayısı + toplam + açma oku (açınca ürünler ve kargo satırları), sağda büyük tamamlama düğmesi; en altta rozetli sekme çubuğu. — **görüldü** (özetin açık hâli yalnız metinden)
7. **Boş durum:** başlık + kısa açıklama + çok bakılan ürünler şeridi; ürün silinince geri al seçenekli bildirim. — **görüldü**
8. **Ödeme adımı** açılmadı — **doğrulanmadı**.

Yazılı kaynaklar (**dolaylı**): sepette üyeliğe özel tasarruf sayfası (2022 incelemesi, İ); ödemede cüzdan seçimi (2024 rehberi, İ); teslimat seçenekleri ve ücretleri (Y; özetler çelişkili, bölüm 6).

**(b) Mixo karşılığı**

| Bölge | Karar | Nasıl | Gerekçe |
|---|---|---|---|
| Başlık: ürün sayısı + tümünü sil | Uygula | `app/(tabs)/warenkorb.tsx`: "Warenkorb ({n} Artikel)", sağda çöp ikonu → onay → `clearCart`. (P1) | Mağazada işlev hazır. |
| Kuponlar satırı | Atla | — | Eksik: kupon sistemi. |
| Satıcı grubu ve kargo günü | Atla | — | Eksik: satıcı verisi (tek satıcı), teslimat tahmini. |
| Ücretsiz kargo etiketi | Uyarla | Mevcut ilerleme çubuğu kalır: "Noch … bis zum Gratisversand" / "Gratisversand erreicht!". Bugünkü durum: çubuk ve kargo hesabı eşiği sabit `FREE_SHIPPING_FALLBACK` (39 €) değerinden alıyor (`warenkorb.tsx`, `shipping.ts`); `home.freeShip` yalnız ana sayfa afişinde ve alt başlığında kullanılıyor. P1 #11: çubuk, `shippingFor`, kasa ekranı ve ürün sayfasındaki "Versand" satırı eşiği tek kaynaktan, `home.freeShip` değerinden alır; sabit yalnız sunucuya ulaşılamazsa yedektir. (P1) | Eşik sunucuda yönetici ayarı (`demo/server.mjs`, yalnız okundu). Değişirse bugünkü kodda afiş yeni sayıyı, sepet eski sayıyı gösterir. Kargo "Demo-Annahme" olarak etiketli kalır. |
| Satır seçim kutusu | Uyarla | `store/shopStore.tsx` `CartLine` içine seçili bayrağı; toplam yalnız seçili satırlardan. (P2) | Seçim cihazda tutulur. |
| Satır: görsel, başlık, seçenek adı | Uyarla | Seçenek adı yerine `vendor` satırı. (P1) | Varyant yok; yerine gerçek marka alanı. |
| Adet denetimi (1 iken çöp) | Uygula | `warenkorb.tsx`: [çöp ya da −] [adet] [+]; ayrı "Entfernen" bağlantısı kalkar. (P1) | — |
| Geri al bildirimi | Uygula | "Artikel entfernt" + "Rückgängig" (son silinen satır birkaç saniye cihazda tutulur). (P1) | Cihazda çalışır. |
| Birlikte alınanlar şeridi | Uyarla | `home.best` şeridi; başlık 3.2'deki kurala göre "Beliebt" ya da "Unsere Auswahl". (P1) | Birlikte satın alma verisi yok; yerine sunucunun gerçek listesi. |
| Sabit özet çubuğu | Uygula | Sabit alt çubuk: solda "Gesamt" + tutar + açma oku ("Zwischensumme", "Versand (Demo-Annahme)"), sağda "Zur Kasse (Demo)". (P1) | Hesap mevcut (`shippingFor`, `subtotal`); eşik P1 #11'deki tek kaynaktan gelir. |
| Üyelik tanıtım bandı | Atla | — | Eksik: sadakat programı. |
| Boş durum | Uygula | "Dein Warenkorb ist leer" + kısa açıklama + `home.best` şeridi (başlık kuralı 3.2). (P1) | "En çok bakılan" denmez; başlık, listenin sunucudaki kaynağına göre seçilir. |
| Ödeme adımı | Atla (veri gelince P3 #3) | `app/kasse.tsx` açık demo ekranı olarak kalır; sipariş gönderilmez. | Eksik: gerçek ödeme ve sipariş. |

### 3.8 Listeler / Favoriler

**(a) Hepsiburada'da**

1. **Giriş:** mobil sitede alt çubukta ikinci sekme. — **görüldü** (M1, M2)
2. **Misafir için liste ekranı yok:** sekme ve beğendiklerim adresi doğrudan giriş sayfasına yönlendiriyor. — **görüldü** (M2)
3. **Giriş sayfası:** giriş / üye ol sekmeleri, e-posta ve şifre alanı, şifre hatırlatma, telefonla giriş düğmesi, 3 sosyal giriş düğmesi; başlık ve sekme çubuğu yok. — **görüldü** (M2; giriş yapılmadı)
4. **Kartlardaki kalp** misafire de görünüyor; dokununca ne olduğu denenmedi — **doğrulanmadı**.
5. **Hesap menüsünde liste grubu:** beğendiklerim ve tüm listelerim satırları. — **görüldü** (M2). Liste ekranlarının içi — **doğrulanmadı**.
6. **Fiyat alarmı / fiyat düşünce bildirim** — **doğrulanmadı** (Y: resmî kaynak bulunamadı). Favorilerde indirim bekleyen ürünlerden söz eden tek bir haber özeti var — **dolaylı** (Y).

Uygulamadaki liste ekranı hiçbir karede yok — **doğrulanmadı**.

**(b) Mixo karşılığı**

| Bölge | Karar | Nasıl | Gerekçe |
|---|---|---|---|
| İkinci sekme | Uygula | "Merkliste" sekmesi ikinci sıraya (`app/(tabs)/_layout.tsx`). (P1) | — |
| Giriş duvarı ve giriş sayfası | Atla | — | Eksik: hesap sistemi. Liste cihazda tutulur, giriş istenmez. |
| Beğenilenler listesi | Uygula | Mevcut `app/(tabs)/favoriten.tsx` + `favs`; karttaki sepet ikonuyla listeden sepete ekleme. (P1) | Cihazda çalışıyor. |
| Birden çok liste | Uyarla | "Meine Listen": adlı listeler (`store/shopStore.tsx`), "Neue Liste", yeniden adlandır, sil; kalbe uzun basınca liste seçimi (yeni `components/ListPicker.tsx`). (P2) | Kaynaktaki ekran doğrulanmadı; bizde cihazda tutulan listeler. |
| Fiyat alarmı | Uyarla | "Preis beim Merken": kayıt anındaki fiyat anlık görüntüde saklanır; liste açılınca güncel fiyatla (`getProduct`) fark gösterilir. Bildirim gönderilmez. (P2) | Anlık bildirim yok; yerine cihazdaki kayıt fiyatı ile güncel katalog fiyatı karşılaştırması. Kaynakta özellik doğrulanmadı. |

### 3.9 Hesabım (siparişler, kuponlar, adresler, ayarlar)

**(a) Hepsiburada'da**

Uygulamanın hesap ekranı hiçbir karede yok — **doğrulanmadı**. Mobil sitede misafire görünen menü (M2):

1. **Başlık** + yan yana üye ol ve giriş yap düğmeleri. — **görüldü**
2. **Menü satırları** (sol ikon + etiket + sağ ok): siparişler, kişiye özel fırsatlar, cüzdan, soru ve talepler, değerlendirmeler, kuponlar. — **görüldü**
3. **Kullanıcı bilgileri grubu** (açılır): üyelik bilgileri, şifre değişikliği, iletişim tercihleri, kayıtlı kartlar, IBAN bilgileri, adresler. — **görüldü**
4. **Liste grubu:** beğendiklerim, tüm listelerim. — **görüldü**
5. **Müşteri hizmetleri** satırı en altta. — **görüldü**
6. Satıra dokununca giriş isteniyor; alt ekranların içi — **doğrulanmadı**.

Yazılı kaynaklar (**dolaylı**; 7–12 Y şeridinden ve yalnız arama özetleri, 13 İ şeridinden):

7. Siparişler: liste → sipariş ayrıntısı; iptal düğmesi sipariş ayrıntısında; iade, siparişten başlatılıp ekranda iade/gönderi kodu veriyor; her ürün için ayrı kod.
8. Kendi kargo ağıyla gelen paketlerde teslimata yakın canlı takip. Komşuya bırakma seçeneği de yalnız bu kargo ağında geçerli.
9. Müşteri hizmetleri talepleri hesap altındaki soru ve talepler bölümünde izleniyor.
10. İptalde para iadesi: cüzdanla ödenen tutar hemen cüzdana dönüyor; kartla ödemede bankanın tutarı hesaba geçirmesi 2–10 iş günü.
11. Sipariş "kargoya verilecek" durumundayken iade talebi açılamadığı, tek bir kullanıcı şikâyetinde geçiyor.
12. Kapıdan alımlı iade ayrı bir hizmet seçeneği olarak anlatılıyor (sayfanın yalnız başlığı ve adresi görüldü). Aynı hizmetin uygulama içi tanıtım sayfası mağaza karelerinde var (3.11, madde 1).
13. Hesap menüsünde üyelik programı satırı: 2022 tarihli bir incelemeye göre mobilde hesap bölümüne böyle bir satır eklendi (İ). Mobil sitenin misafir menüsünde bu satır görülmedi (M2).

Çelişkiler (hepsi **doğrulanmadı**): hesap menüsünde üyelik satırının bugün olup olmadığı (madde 13); menünün adı (mobil sitede Hesabım **görüldü**; bir ortak marka sayfası özetinde Profilim, **dolaylı**); kayıtlı kartların adı (mobil sitede kayıtlı kartlarım **görüldü**; bir şikâyet metninde ödeme yöntemlerim, **dolaylı**); üyelik yönetiminin yeri (bir rehbere göre hesap altında ayarlar; mobil site menüsünde ayarlar satırı yok); cüzdan satırının sırası (2021 haberinde en altta; mobil sitede üçüncü satır); iptal koşulları; iade kodunun geçerlilik süresi (14 gün / 7 gün).

**(b) Mixo karşılığı**

| Bölge | Karar | Nasıl | Gerekçe |
|---|---|---|---|
| Hesap sekmesi ve menü düzeni | Uyarla | Yeni `app/(tabs)/bereich.tsx`, sekme adı "Mein Bereich"; satır: sol ikon + etiket + sağ ok. Karar: sekme P1'de açılır, çünkü beş sekmeli düzen (P1 #1) ona bağlı. P1 içeriği iki satır: "Über diese Demo" (neyin gerçek, neyin demo olduğu) ve "Daten auf diesem Gerät löschen" (onay sorar; cihazdaki kaydın tamamını siler: sepet, Merkliste ve P2'de eklenecek her şey). "Merkliste" ve "Warenkorb" satırları konmaz; ikisi de zaten sekme. P2'de eklenenler: "Meine Listen", "Zuletzt angesehen", "Suchverlauf löschen". (P1/P2) | Hesap yok; yerine cihazda tutulan veriler. "Konto" denmez, çünkü hesap yok. Silme işi yalnız P1'dedir (P1 #1); P2 verileri aynı kayıtta durduğu için ayrı bir silme işi gerekmez. Diğer seçenek (dört sekmeyle başlayıp sekmeyi P2'de açmak) açık kalanlar listesinde. |
| Üye ol / giriş yap | Atla (veri gelince P3 #3) | — | Eksik: hesap sistemi. |
| Siparişler, iptal, iade, para iadesi, takip | Atla (veri gelince P3 #3) | — | Eksik: gerçek sipariş ve ödeme. |
| Kişiye özel fırsatlar | Atla | — | Eksik: kişiselleştirme ve kampanya verisi. |
| Cüzdan, kayıtlı kartlar, IBAN | Atla | — | Eksik: ödeme ve cüzdan altyapısı. |
| Soru ve talepler, müşteri hizmetleri | Atla (veri gelince P3 #4) | — | Eksik: destek sistemi ve mağazanın gerçek iletişim bilgisi. İletişim bilgisi gelirse yalnız iletişim satırı eklenir. |
| Değerlendirmeler | Atla | — | Eksik: yorum sistemi. |
| Kuponlar | Atla | — | Eksik: kupon sistemi. |
| Üyelik bilgileri, şifre, adresler | Atla (veri gelince P3 #3) | — | Eksik: hesap; adres hiçbir yerde saklanmıyor. |
| İletişim tercihleri | Atla | — | Eksik: bildirim ve e-posta altyapısı. |
| Liste grubu | Uyarla | "Meine Listen" satırı P2'de gelir (P2 #4) ve adlı listelerin hepsini açar. P1'de liste satırı yok. (P2) | Kaynakta hesap menüsünde iki liste satırı var. Bizde P1'deki tek liste (Merkliste) zaten sekme; ikinci tür liste P2'de geliyor. |

### 3.10 Bildirimler

**(a) Hepsiburada'da**

1. Bildirim merkezi ya da bildirim listesi ekranı: hiçbir karede, mobil sitede ya da yazılı kaynakta yok — **doğrulanmadı** (İ ve Y: kaynak bulunamadı).
2. Hesap menüsünde iletişim tercihleri satırı var; içi görülmedi. — **görüldü** (M2; yalnız satır adı)

**(b) Mixo karşılığı**

| Bölge | Karar | Nasıl | Gerekçe |
|---|---|---|---|
| Bildirim merkezi ve tercihleri | Atla (veri gelince P3 #7) | — | Eksik: anlık bildirim altyapısı ve gönderilecek gerçek olay (sipariş, kampanya). Ayrıca örnek alınacak ekran kanıtı yok. |

### 3.11 Kampanya, kupon, sadakat ve cüzdan modülleri

**(a) Hepsiburada'da**

1. **Kampanya içerik sayfaları** (takas, kapıda iade): az çerçeveli uzun dikey sayfa; başlıkta logo (iOS'ta geri ve paylaş); büyük başlık, ortalanmış açıklama, illüstrasyon ya da renkli üst blok; altında adım adım anlatım bölümü. — **görüldü** (P-ss04, P-ss05, A-s4, A-s5)
2. **Süreli fırsat sayfası:** banner + geri sayım + yatay kartlı liste (3.5, madde 6). — **görüldü** (P-ss06, A-s6)
3. **Kampanya ürün listeleri:** üstte banner; kartlarda taksit etiketi. — **görüldü** (P-ss03, P-ss09, P-ss10). Takas listesinin banner'ında ayrıntı düğmesi var; bir kartta kredi faizi rozeti kısmen görünüyor. — **görüldü** (P-ss10; rozet karenin kenarında, yarım)
4. **Taksit:** kartlarda etiket, ürün sayfasında özet satırı ve ödeme fırsatları bloğu. — **görüldü** (P-ss03, P-ss10, M1, M2)
5. **Kupon:** sepette ve hesap menüsünde kuponlar satırı; bazı kartlarda kuponlu ürün rozeti; listede kuponlu hızlı süzgeci. — **görüldü** (M1, M2). Kupon listesinin düzeni — **doğrulanmadı**. Kupon ekleme yolu bir ortak marka sayfası özetinde farklı menü adıyla anlatılıyor — **dolaylı** (Y).
6. **Sadakat (ücretli üyelik):** başlıkta tanıtım bağlantısı, kategori listesinin ilk satırı, ürün sayfasında ve sepette tanıtım bandı, kartta üyelik fiyatı. — **görüldü** (M1, M2). Uygulamada: tablet ana sayfasındaki 6 hızlı erişim kutusundan biri üyelik programının adını taşıyor. — **görüldü** (P-ss08). Hesap menüsünde üyelik satırı — **dolaylı** (İ, 2022); mobil sitenin misafir menüsünde görülmedi (M2). İçeriği (ücretsiz kargo, puan kazanımı, dizi-film üyeliği, montaj indirimi) — **dolaylı** (P açıklaması, İ, Y). Uygulama içi üyelik ekranı — **doğrulanmadı**. Ücret ve puan oranı kaynaklarda eski ve tutarsız — **doğrulanmadı**.
7. **Cüzdan:** hesap menüsünde satır; ana sayfada uygulamaya özel derin bağlantılı kısayol. — **görüldü** (M1, M2). Cüzdan sayfasının içeriği (bakiye, kartlar, işlem geçmişi, puan) — **dolaylı** (İ, 2024). Sonra öde limiti — **dolaylı** (P açıklaması).
8. **Oyunlar:** kategori listesinde ikinci satır, altında web oyunları. — **görüldü** (M1)

**(b) Mixo karşılığı**

| Bölge | Karar | Nasıl | Gerekçe |
|---|---|---|---|
| Kampanya içerik sayfası kalıbı | Atla (veri gelince P3 #4) | — | Eksik: mağazanın gerçek kargo ve iade koşulları metni. Metin gelince "Versand & Rückgabe" sayfası bu kalıpla kurulur. |
| Geri sayımlı fırsat sayfası | Atla | — | Eksik: bitiş saati olan canlı kampanya. |
| Taksit etiketleri ve blokları | Atla | — | Eksik: taksit/kredi. |
| Kupon satırları, rozet, süzgeç | Atla | — | Eksik: kupon sistemi. |
| Sadakat tanıtımları, üyelik kutusu, üyelik menü satırı ve üyelik fiyatı | Atla | — | Eksik: sadakat programı. Programın adı bizde başka bir anlamla da kullanılmaz (bölüm 5). |
| Cüzdan | Atla | — | Eksik: ödeme ve cüzdan altyapısı. |
| Oyunlar | Atla | — | Eksik: oyun ve ödül sistemi. |
| Bizdeki tek gerçek teşvik: ücretsiz kargo eşiği | Uygula (bizim) | Banner + sepette ilerleme çubuğu (mevcut). İkisi de `home.freeShip` değerini kullanır; bugün yalnız banner kullanıyor, sepet sabit değerden okuyor (P1 #11). | Gerçek veri: sunucudaki yönetici ayarı. |
| İndirim ve duyuru | Uyarla | "Aktionen" satırı ve "Reduziert" süzgeci yalnız gerçek `was` fiyatı varsa; duyuru bandı yalnız `/api/config` duyuru metni doluysa. Bugün ikisi de boş, bölgeler gizli. | Kampanya yerine gerçek eski fiyat ve yönetici duyurusu. |

### 3.12 Diğer

**(a) Hepsiburada'da**

1. **Ek modüller:** market alışverişi, yurt dışı ürünleri, uçak bileti, tüketici kredisi başvurusu, altın alım satımı, tarif önerip malzemeyi sepete ekleyen yardımcı. — **dolaylı** (İ, P açıklaması); altın ve yurt dışı satırları kategori listesinde **görüldü** (M1). Uygulamadaki yerleri — **doğrulanmadı**.
2. **Tablet düzeni:** aynı ekranlar daha çok sütunla. — **görüldü** (P-ss08, P-ss09, P-ss10)
3. **Açılış ekranı.** — **görüldü** (3.1, madde 11)
4. **Misafir alışverişi:** misafir sepete ekleyebiliyor — **görüldü** (M2); üye olmadan ödeme — **dolaylı** (Y; mağaza açıklaması özeti). Misafire kapalı özelliklerin listesi — **doğrulanmadı**.
5. **Ödemede teslimat seçenekleri** (aynı gün, ertesi gün, randevulu, teslimat noktası; ücretli seçenekler). — **dolaylı** (Y; ücret ve kesim saatleri çelişkili)
6. **Sürüm ve mağaza bilgisi:** iOS sürümü 5.103.1 (A; sayfadan okundu). App Store sayfasının özetine göre boyut 431,5 MB, iOS 15.5 ve üstü gerekiyor, diller Türkçe ve İngilizce, uygulama reklam içeriyor; sürümler 5.87.2 (31 Mart) ile 5.103.1 arasında, yaklaşık iki haftada bir yayın, sürüm notları genel (İ). Play sayfası: 13 Kasım 2026 güncellemesi, 50 milyondan fazla indirme, alışveriş kategorisinin ücretsiz uygulamalar sıralamasında üçüncü; sürüm numarası sayfadan doğrulanmadı (P). — **dolaylı** (A, P, İ)

**(b) Mixo karşılığı**

| Bölge | Karar | Nasıl | Gerekçe |
|---|---|---|---|
| Market, yurt dışı, uçak bileti, kredi, altın, tarif yardımcısı | Atla | — | Eksik: bu hizmetlerin hiçbiri ve verisi yok; katalog 10 kategorili tek mağaza. |
| Tablet düzeni | Uygula | `ProductGrid` sütun sayısı (3.1). (P1) | — |
| Açılış ekranı | Uyarla | 3.1'deki gibi: P1'de yalnız zemin rengi; logo P3 #9. (P1) | Kampanya rozeti yok; logo dosyası henüz yok. |
| Misafir kullanımı | Uygula | Uygulamanın tamamı girişsiz; sepet ve listeler cihazda (mevcut). | — |
| Ödemede teslimat seçenekleri | Atla (veri gelince P3 #3) | — | Eksik: gerçek ödeme, teslimat seçenekleri ve ücretleri. |

## 4. Uygulama planı

Dosya yolları `mobile/src` altındadır. Bu belge yalnız plandır; hiçbir dosya değiştirilmedi.

### P1 — bugünkü veriyle yapı eşliği

| # | İş | Dokunacağı dosyalar |
|---|---|---|
| 1 | Sekme yapısı: Start, Merkliste, Warenkorb, Mein Bereich, Kategorien; arama sekmeden yığına. Mein Bereich'in P1 içeriği: "Über diese Demo" ve cihaz verisini silme (tek silme işi) | `app/(tabs)/_layout.tsx`, `app/(tabs)/suche.tsx` → `app/suche.tsx`, `app/_layout.tsx`, yeni `app/(tabs)/bereich.tsx`, `store/shopStore.tsx` |
| 2 | Arama başlığı (koyu blok, beyaz kutu, büyüteç, yer tutucu "Im Outlet suchen") ve renk kararı: aktif sekme, dolu kalp, kart rozeti ve kategori ikonları `colors.primary`; afiş zemininde `colors.accent` yok (bölüm 5) | `components/Banners.tsx` (`SearchPill`, `Banners`), `theme.ts`, `app/(tabs)/_layout.tsx`, `components/ui.tsx`, `app/produkt/[id].tsx` |
| 3 | Veri katmanı: `Index` tipine `facets`; `Product` tipine düşük kalite bayrağı (parça satırının 10. alanı); `Home` tipine `bestSource`; yapılandırmadan duyuru metni | `api/shop.ts` |
| 4 | Ana sayfa modülleri: marka kapsülleri, peek'li banner, iki satırlı kategori karoları, alt kategori vitrin kartları ("Größte Unterkategorien"), ürün satırları ("Premium" başlığı "Ab 120 €" olur; `home.best` başlık kuralı). Hızlı erişim kutuları ve "Alle ansehen" yok | `app/(tabs)/index.tsx`, `components/Banners.tsx`, yeni `components/home.tsx` |
| 5 | Ürün kartı: marka kalın başlık, fiyat satırında sepete ekle ikonu; ızgarada genişliğe göre sütun | `components/ui.tsx` (`ProductCard`, `ProductGrid`) |
| 6 | Ortak liste parçaları: süzgeç/sıralama çubuğu, sıralama katmanı, tam ekran süzgeç katmanı; sayı kuralı (dizindeki 16 marka sayılı, diğerleri sayısız; kısmi sayılar etiketli) | yeni `components/listing.tsx`, `app/kategorie/[key].tsx` |
| 7 | Kategori listesi: `sub` ve `marke` parametreleri, kapsam özeti bandı, başlık sayacı (süzgeç yokken "{yüklenen} von {toplam}", süzgeç açıkken "Treffer unter … geladenen Produkten"), fiyat sıralamasında tüm parçaları yükleme | `app/kategorie/[key].tsx`, `api/shop.ts` |
| 8 | Kategoriler sekmesi: kare ikonlu liste + ikinci seviye alt kategori listesi | `app/(tabs)/kategorien.tsx`, yeni `categoryIcons.ts` |
| 9 | Arama katmanı: geri + otomatik odak, "Top-Marken" (marka süzgecine gider), dizinden otomatik tamamlama, `home.best` listesi. Sonuçlarda ortak liste parçaları; sıralama yalnız tarama %100 iken, süzgeçte "nur für die durchsuchten X %" notu, "Ganzen Katalog durchsuchen" | `app/suche.tsx`, `components/listing.tsx`, `api/shop.ts` |
| 10 | Ürün ayrıntısı: kategori izi, marka bağlantısı (kategorideki marka süzgecine), bilgi satırları, "Details" tablosu, "Mehr aus …" / "Mehr von …" şeritleri, sabit alt çubuk, "Im Warenkorb" katmanı | `app/produkt/[id].tsx`, `components/ui.tsx` |
| 11 | Sepet: sayılı başlık + tümünü sil, çöp ikonlu adet denetimi, geri al bildirimi, sabit özet çubuğu, `home.best` şeritli boş durum. Ücretsiz kargo eşiğinin tek kaynağı: `shippingFor`, ilerleme çubuğu, kasa ekranı ve ürün sayfasındaki "Versand" satırı `home.freeShip` değerini kullanır (yedek 39 €) | `app/(tabs)/warenkorb.tsx`, `store/shopStore.tsx`, `shipping.ts`, `app/kasse.tsx`, `app/produkt/[id].tsx`, `api/shop.ts` |
| 12 | Açılış ekranı ayarı: yalnız kendi zemin rengimiz (logo P3 #9) | `mobile/app.json` (`src` dışında) |

### P2 — cihazda tutulan ve cihazda hesaplanan özellikler

| # | İş | Dokunacağı dosyalar |
|---|---|---|
| 1 | Depo sürümü: `mixo.demo.v1` → yeni anahtar, eski kaydın taşınması | `store/shopStore.tsx` |
| 2 | Son bakılanlar ("Zuletzt angesehen"): ürün açılınca kayıt; ana sayfa, ürün sayfası ve Mein Bereich'te şerit | `store/shopStore.tsx`, `app/produkt/[id].tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/bereich.tsx` |
| 3 | Son aramalar ("Letzte Suchen") + "Verlauf löschen" | `store/shopStore.tsx`, `app/suche.tsx` |
| 4 | Birden çok adlı liste ("Meine Listen") ve liste seçici | `store/shopStore.tsx`, `app/(tabs)/favoriten.tsx`, yeni `components/ListPicker.tsx`, `components/ui.tsx` |
| 5 | Kayıt anındaki fiyat ("Preis beim Merken") ve güncel fiyatla fark | `store/shopStore.tsx`, `app/(tabs)/favoriten.tsx`, `api/shop.ts` |
| 6 | Sepette satır seçimi | `store/shopStore.tsx`, `app/(tabs)/warenkorb.tsx`, `app/kasse.tsx` |
| 7 | Mein Bereich'in dolu hâli: "Meine Listen", "Zuletzt angesehen", "Suchverlauf löschen" (cihaz verisinin tamamını silme P1 #1'de) | `app/(tabs)/bereich.tsx` |
| 8 | Yazım önerisi ("Meintest du …?"): taranan kısımda sonuç yokken dizindeki kategori, alt kategori ve marka adlarına yakınlık; cihazda hesaplanır, hiçbir şey saklanmaz | `app/suche.tsx`, `api/shop.ts` |

### P3 — arka uç ya da mağaza verisi gerekir

| # | İş | Gereken | Dokunacağı dosyalar |
|---|---|---|---|
| 1 | Açıklama, görsel galerisi, varyant seçici | Mağaza ürün verisi (Storefront API) | `api/shop.ts`, `app/produkt/[id].tsx` |
| 2 | "Aktionen" satırı, "Reduziert" süzgeci, yatay fırsat kartı | Gerçek eski fiyat (`was`) ve dolu `deals` | `components/ui.tsx`, `app/(tabs)/index.tsx`, `components/listing.tsx` (koşullar P1'de hazır) |
| 3 | Gerçek ödeme, hesap, siparişler, adresler | Mağaza ödeme ve müşteri hesabı | `app/kasse.tsx`, `app/(tabs)/bereich.tsx`, `api/shop.ts` |
| 4 | "Versand & Rückgabe" içerik sayfası, iletişim satırı | Mağazanın gerçek koşul metni ve iletişim bilgisi | yeni `app/info/[slug].tsx`, `app/(tabs)/bereich.tsx` |
| 5 | Paylaş | Herkese açık ürün adresi | `app/produkt/[id].tsx`, `app/kategorie/[key].tsx` |
| 6 | "Neu" ve "Beliebt" sıralaması | Ürün ekleme tarihi, satış verisi | `api/shop.ts`, `components/listing.tsx` |
| 7 | Bildirimler | Bildirim altyapısı, izin akışı, gönderilecek gerçek olay | yeni ekran ve servis |
| 8 | Puan/yorum, kupon, sadakat, cüzdan | Yalnız mağaza gerçekten sunarsa | — |
| 9 | Açılış ekranında ve uygulama simgesinde logo | Mağazanın logo dosyası (bugün `assets/` içinde yalnız şablon görselleri var) | `mobile/app.json`, `mobile/assets/` (`src` dışında) |
| 10 | Dizine kapsam başına temsilci görsel: ana sayfa karoları ve vitrin kartları parça yüklemeden görsel alır (bugün ~1,1 MB parça yükü) | Veri üretimi tarafında değişiklik (`demo/` altında; bu çalışmada dokunulmadı) | `api/shop.ts`, `components/home.tsx` |

## 5. Marka ve dürüstlük sınırları

Marka kuralı, kanıttaki somut durumlara uygulanmış hâliyle:

- **Ad ve logo:** içerik sayfalarının ve açılış ekranının ortasındaki logo düzeni alınır, logo alınmaz; bizde Mixo Outlet adı. Kendi logomuz ve simgemiz henüz yok: `mobile/assets/` içinde proje şablonunun görselleri duruyor; mağazadan dosya gelince değişir (P3 #9).
- **Renk kimliği:** turuncu başlık bloğu + beyaz arama kutusu, kaynağın en tanınır görünümü; bizde başlık bloğu `colors.primary` (koyu) ile kurulur. Bu tek başına yetmez. Bizim `colors.accent` (#d9480f) turuncu ve bugün şuralarda kullanılıyor: aktif sekme rengi, dolu kalp, indirim rozetinin zemini, "Uhren" afişinin zemini, ana sayfa kategori ikonları, yükleme göstergesi, "Nicht verfügbar" yazısı, sepetteki ilerleme çubuğu ve "Entfernen" bağlantısı (`theme.ts`, `app/(tabs)/_layout.tsx`, `components/ui.tsx`, `components/Banners.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/warenkorb.tsx`, `app/produkt/[id].tsx`). Kaynakta da aktif sekme ikonu turuncu (P-ss08), kartın sol üstündeki avantaj rozeti turuncu (P-ss08, P-ss10) ve sekme sıramız mobil siteyle aynı. Karar (P1 #2): aktif sekme, dolu kalp, kart rozeti ve kategori ikonları `colors.primary` olur; afiş zemini dahil hiçbir geniş yüzey turuncu olmaz. `colors.accent` yalnız küçük durum işaretlerinde kalır ("Nicht verfügbar", ilerleme çubuğu, yükleme göstergesi). Tonun kendisinin turuncudan uzaklaştırılması mağazanın marka rengine bağlıdır; açık kalanlar listesinde. Mor taksit etiketi tonu hiçbir yerde kullanılmaz.
- **Görseller:** kampanya banner'ları, illüstrasyonlar, ürün fotoğrafları ve kategori ikon görselleri alınmaz. Karolarda kendi katalog görsellerimiz, ikonlarda Ionicons.
- **Metin ve slogan:** kampanya adları, banner başlıkları ve tanıtım metinleri alınmaz, çevirisi de kullanılmaz. Almanca etiketler bizim (Start, Merkliste, Mein Bereich). Genel arayüz metni de kalıbıyla aktarılmaz: kaynağın arama yer tutucusu üç öğeli (ürün, kategori ya da marka); bugün kodumuzdaki yer tutucu aynı kalıpta, yerine "Im Outlet suchen" gelir (3.1).
- **Modül adları:** üyelik, cüzdan, puan ve hızlı teslimat hizmetlerinin adları kullanılmaz; bu modüller bizde yok. Aynı ad bizde başka bir anlamla da kullanılmaz. Somut durum: 120 € üstü fiyat listesinin başlığı bugün kodda "Premium" (`app/(tabs)/index.tsx`). Kaynakta bu ad ücretli üyelik programının ve tablet ana sayfasındaki bir hızlı erişim kutusunun adı (P-ss08); aynı adla bir satır, kullanıcıya üyelik modülü varmış izlenimi verebilir. Başlık "Ab 120 €" olur (P1 #4). `home.premium` yalnız sunucudaki alan adı olarak kalır, arayüzde görünmez.
- **Kod:** hiçbir şey derlenmiş koddan çıkarılmadı; APK indirilmedi. Yapı, mağaza görsellerinden ve herkese açık mobil siteden okundu.

Dürüstlük kuralı, kanıttaki somut durumlara uygulanmış hâliyle:

- **Puan ve yorum sayısı** (kartlarda ve ürün sayfasında görüldü): bizde hiç gösterilmez; boş yıldız ya da "0 Bewertungen" de konmaz.
- **Geri sayım** (süreli fırsat sayfası, teslimat sözü): yok.
- **Stok etiketi ve canlı izleyici sayacı:** yok.
- **Eski fiyat ve indirim yüzdesi:** yalnız sunucu gerçek `was` verirse. Bugün hiçbir üründe yok; rozet, "Aktionen" satırı ve "Reduziert" süzgeci gizli kalır.
- **Teslimat sözü** (kargo günü, aynı gün teslimat): yok. Yalnız kargo ücreti ve ücretsiz kargo eşiği, "Demo-Annahme" notuyla.
- **Sıra etiketleri** (çok satan, çok ziyaret edilen): yok. `home.best` sıra numarası verilmeden gösterilir. Başlık, listenin sunucudaki kaynağına bağlıdır (`demo/server.mjs`, yalnız okundu): `bestSource` = `behavior` ise liste demo sitesindeki sipariş, sepete ekleme ve görüntüleme kayıtlarından gelir, başlık "Beliebt"; `curated` ise liste yönetici seçimi ile fiyat havuzundan çeşitlemedir, başlık "Unsere Auswahl". Mobil uygulama bu alanı bugün okumuyor (P1 #3).
- **"Beliebt" sözcüğü:** yalnız talep verisine dayanan listede kullanılır. Ürün sayısına göre sıralanan alt kategori kartlarının başlığı "Größte Unterkategorien"dir.
- **Popüler aramalar:** arama istatistiğimiz yok; yerine gerçek marka sayıları. Marka satırı metin aramasına değil marka süzgecine gider; satırdaki sayı ile açılan listedeki sayı aynı dizin sayısıdır (3.4).
- **Sayılar:** kesin sayı (dizinden ya da tamamen yüklenmiş kapsamdan) ile kısmi sayı (yüklenenler içinde) aynı yerde karıştırılmaz; kısmi sayı etiketlenir ya da yazılmaz (3.5, sayı kuralı).
- **Kupon, sadakat, cüzdan, taksit:** hiçbir tanıtım bandı ya da boş menü satırı konmaz.
- **Hesap ve sipariş:** "Mein Bereich" hesap gibi sunulmaz; giriş düğmesi ve boş sipariş listesi konmaz. Kasa ekranı açıkça demo kalır.
- **Arama sonucu sayısı ve sırası:** katalog cihazda parça parça tarandığı için toplam sonuç sayısı yerine taranan oran gösterilir. Aynı nedenle arama sonuçlarında sıralama yalnız tarama %100 iken açılır; süzgeç daha önce kullanılırsa "nur für die durchsuchten X %" notu zorunludur (3.4).

## 6. Doğrulanmayanlar

Uygulamanın kendisi incelenmediği için:

- Uygulamadaki alt sekme adları, sırası ve rozetleri (yalnız mobil sitede görüldü).
- Uygulamanın kategori, arama katmanı, ürün ayrıntısı, sepet, ödeme, liste, hesap ve bildirim ekranları.
- Telefon ana sayfasının alt yarısı; hızlı erişim kutularının telefonda olup olmadığı.
- Kapsül sekmelere dokununca ne olduğu; banner nokta göstergesi ve otomatik geçiş; başlığın ve süzgeç çubuğunun sabit kalıp kalmadığı.
- Uygulamadaki liste sayfalama biçimi (sitede sayfa gezgini).
- Kartın sağ altındaki ikon + sayının anlamı (şeridin tahmini: satıcı ya da seçenek sayısı); telefon kartlarında fiyat satırı; uygulama kartında eski fiyat ve yüzde.
- Android içerik sayfalarında geri okunun gerçekten olmadığı (üç karede görünmüyor; kareler pazarlama görseli).
- Uygulamada başlık dışında bir konum/teslimat seçici olup olmadığı (mobil sitenin ürün sayfasında bağlantı var).
- Resmî olmayan APK sitelerinin notlarında geçen keşfet bölümü ve ana ekran araç takımı (İ; kaynak güvenilir bulunmadı, hiçbir kare ya da resmî kaynak teyit etmiyor).
- App Store açıklama metni ve sürüm notları: mağaza karelerini inceleyen şerit (A) bunları sayfa kaynağından ayıklayamadı. Açıklamaya dair bilgiler aynı sayfanın özetinden (İ) ve Play açıklamasından (P) geliyor; sürüm notlarının metni okunmadı. Play sayfasındaki sürüm numarası.
- Play sayfasındaki 11. ve 12. ekran görüntüleri (incelenmedi). Mağaza kareleri kampanya dönemine ait; olağan günlerdeki ana sayfa.

Mobil sitede görülmeyenler:

- Kategori sayfası (c-id) listesi; üst kategori için "tümü" satırı; kategori satır sayısı (şerit 19 diyor; saydığı 20 ad + kampanyalar satırı).
- Hesap menüsünde üyelik programı satırı (2022 incelemesinde var; misafir menüsünde görülmedi).
- Arama geçmişinin görünümü; sponsorlu ürün işareti.
- Ürün sayfasında üçüncü bilgi satırı, diğer satıcılar listesi, yorum süzme/sıralama, konum seçici.
- Sepette kupon kodu girişi, "sonra al", ödeme adımları.
- Giriş gerektiren her ekranın içi: siparişler, sipariş ayrıntısı, iade akışı ekranları, kuponlar, adresler, kayıtlı kartlar, iletişim tercihleri, listeler, fiyat alarmı.
- Misafirin kalbe dokunması.

Yazılı kaynaklardaki çelişkiler ve eskimiş bilgiler:

- Hesap menüsünün adı (Hesabım / Profilim); kayıtlı kartların adı; üyelik yönetiminin menüdeki yeri; cüzdan satırının sırası.
- Sipariş iptali koşulları; iade kodunun geçerlilik süresi (14 / 7 gün); aynı gün teslimatın kesim saati (13:00 / 14:00); teslimat ücretleri.
- İptalde para iadesi süreleri (arama özeti) ve "kargoya verilecek" durumunda iade açılamaması (tek kullanıcı şikâyeti); ikisinin de güncelliği belirsiz.
- 2015 web kaynağındaki ürün sayfası öğelerinin (hediye çeki, iade koşulları) bugünkü uygulamada olup olmadığı.
- Üyelik ücreti (2022 kaynağında iki farklı tutar), ücretsiz kargo eşiği, puan oranı.
- Fotoğrafla arama (2017) ve barkodla aramanın bugün durup durmadığı; sesli arama.
- Tek uygulamalı cüzdan lansmanının gerçekleşip gerçekleşmediği.
- Erişilemeyen kaynaklar: resmî yardım sayfaları (403), teknik blog (403), bir yorum raporu (410), iki akademik PDF (okunamadı).

Bizim tarafta açık kalanlar:

- Sekme yapısı değişikliği (arama sekmesinin kalkması, "Mein Bereich") onay bekliyor. Belgedeki karar: "Mein Bereich" P1'de iki satırla açılır. Diğer seçenek: P1'de dört sekme (Start, Merkliste, Warenkorb, Kategorien), sekme P2'de.
- Ana sayfadaki tekrar: kategori girişi yalnız karolarda bırakıldı, kapsül şeridi marka eksenine alındı, hızlı erişim kutuları atlandı. Diğer seçenekler: kapsülleri alt kategori eksenine almak (o zaman vitrin kartlarıyla çakışır); kutuları "Bis 25 €" / "Ab 120 €" kısayollarıyla geri koymak (ürün satırlarıyla aynı hedef).
- Arama sonuçlarında sıralama ve süzgeç tam tarama gerektiriyor (`all`: 90 parça, ~7,3 MB). Belgedeki karar: sıralama yalnız %100'de, süzgeç zorunlu notla daha önce. Diğer seçenek: süzgeci de %100'e bağlamak.
- Vurgu rengi (`colors.accent`, turuncu): belgedeki karar aktif sekme, dolu kalp, rozet ve kategori ikonlarının `colors.primary` olması. Tonun değişmesi mağazanın marka rengine bağlı; renk bilgisi gelmedi.
- Marka girişleri kategori kapsamında çalışıyor. Bir markanın bütün kategorilerdeki ürünlerini tek listede göstermek `all` kapsamının tamamını yüklemeyi gerektirir; bu belgede planlanmadı.
- Ana sayfa karo ve vitrin görselleri için ~1,1 MB parça yükleniyor (651 KB + 455 KB, ölçüldü). Dizine temsilci görsel eklenmesi (P3 #10) veri üretimi tarafında iş; karar bekliyor.
- `home.best` listesinin bugünkü kaynağı (`behavior` / `curated`) bu çalışmada sorgulanmadı (sunucuya istek atılmadı); başlık kuralı iki duruma göre yazıldı.
- Kategoriye dokununca önce alt kategori listesi mi, yoksa bugünkü gibi doğrudan liste + kapsüller mi.
- Kategori listesinde büyük kapsamda (Technik, 55 parça) fiyat sıralamasının davranışı: belgedeki öneri önce alt kategori seçtirmek.
- Mağazanın gerçek kargo/iade metni, iletişim bilgisi, herkese açık ürün adresi, logo dosyası, marka rengi ve gerçek indirim verisinin gelip gelmeyeceği.

## 7. Kaynaklar

Mağaza sayfaları:

- https://play.google.com/store/apps/details?id=com.pozitron.hepsiburada&hl=tr&gl=TR
- https://apps.apple.com/tr/app/hepsiburada-online-shopping/id481035064

Mobil site (misafir, 375×812 öykünme):

- https://www.hepsiburada.com/
- https://www.hepsiburada.com/#categories
- https://www.hepsiburada.com/ara?q=kulaklik
- https://www.hepsiburada.com/anker-soundcore-r50i-tws-bluetooth-kablosuz-kulaklik-siyah-ios-ve-android-uyumlu-a3949-anker-turkiye-garantili-p-HBCV000049D0S5
- https://checkout.hepsiburada.com/sepetim
- https://giris.hepsiburada.com/
- https://hesabim.hepsiburada.com/
- https://listelerim.hepsiburada.com/begendiklerim

Yardım merkezi (sayfalar 403; yalnız arama özetleri):

- https://www.hepsiburada.com/kolay-iade
- https://www.hepsiburada.com/alisveris-hakkinda
- https://www.hepsiburada.com/staticPage/12445
- https://www.hepsiburada.com/staticpage/397066447924442
- https://www.hepsiburada.com/kapinda-iade
- https://www.hepsiburada.com/teslimat
- https://www.hepsiburada.com/staticPage/13390
- https://www.hepsiburada.com/staticPage/11904
- https://www.hepsiburada.com/premium-kupon
- https://kurumsal.hepsiburada.com/tr/basin-odasi/hepsiburadanin-en-avantajli-hali-hepsiburada-premium-kullanima-acildi
- https://kurumsal.hepsiburada.com/tr/basin-odasi/hepsiburada-premium%E2%80%99dan-yeni-avantaj-secili-kategorilerde-10-hepsipara-donemi-basladi
- https://kurumsal.hepsiburada.com/en/press-room/hepsiburada-launches-hepsiburada-premium-a-brand-new-paid-subscription-service
- https://multinet.com.tr/multiflex-kullanici-kosullari/hepsiburada
- https://webrazzi.com/2021/06/08/hepsiburada-nin-cuzdan-servisi-ilk-kez-gorundu-hepsipay-cuzdanim/
- https://www.sikayetvar.com/hepsiburada/premium/hesap-silme
- https://www.sikayetvar.com/hepsiburada/siparis-iptalinde-aninda-iade-ve-esnek-teslimat-talebi
- https://www.sikayetvar.com/hepsi-moda/siparis-durumu-kargoya-verilecek-olarak-gorunuyor-iade-talebi-olusturulamiyor
- https://www.kvkk.gov.tr/Icerik/9080/kamuoyu-duyurusu-veri-ihlali-bildirimi-d-market-elektronik-hizmetler-ve-ticaret-a-s
- https://bigpara.hurriyet.com.tr/haberleri/hepsiburada
- https://www.posta.com.tr/yasam/hepsiburada-comda-mobil-alisveris-yukseliste-298793

Yayımlanmış incelemeler:

- https://www.tamindir.com/android/hepsiburada/
- https://www.tamindir.com/blog/hepsipay-nedir_90645/
- https://www.log.com.tr/buyuk-avantajlar-sunan-hepsiburada-premium-hizmetini-sizin-icin-denedik
- https://webrazzi.com/2023/09/12/hepsiburada-yapay-zeka-ozellikleri-yorumlar-icin-ozet-ve-hizli-yorum-yapma/
- https://webrazzi.com/2023/09/26/hepsiburadadan-devrim-yaratan-yapay-zeka-entegrasyonlari/ (sponsorlu)
- https://webrazzi.com/2017/07/20/hepsiburada-mobil-cekbul/
- http://hepsiburada.github.io/lembas/pages/navigation.html
- https://www.chip.com.tr/haber/hepsiburada-comun-tasarimi-tamamen-yenilendi_56795.html
- https://www.ekonomigazetesi.com/sirket-haberleri/hepsipay-turkiyenin-cuzdani-lansmanini-2025te-yapacak-37602

Yerel kanıt dosyaları (inceleme şeritlerinin kaydettiği; yalnız görüntülendi):

- `/tmp/claude-1000/-home-wpu-Desktop-Urunler-Mixo/d99698ce-a124-48b6-9d3d-f459fe776558/scratchpad/hb-play/` (ss01.png … ss10.png, page/page.html)
- `/tmp/claude-1000/-home-wpu-Desktop-Urunler-Mixo/d99698ce-a124-48b6-9d3d-f459fe776558/scratchpad/hb-ios/` (s1.jpg … s6.jpg, page.html)
- `/tmp/claude-1000/-home-wpu-Desktop-Urunler-Mixo/d99698ce-a124-48b6-9d3d-f459fe776558/scratchpad/hb-web/notlar-1.md`
- `/tmp/claude-1000/-home-wpu-Desktop-Urunler-Mixo/d99698ce-a124-48b6-9d3d-f459fe776558/scratchpad/hb-web/notlar-2.md`
- `/tmp/claude-1000/-home-wpu-Desktop-Urunler-Mixo/d99698ce-a124-48b6-9d3d-f459fe776558/scratchpad/verify-out/android-headers.png` (P-ss04, P-ss05, P-ss06 başlık bölgelerinin kırpımı; düzeltme turunda üretildi)

Kendi verimiz (yalnız okundu): `/home/wpu/Desktop/Urunler/Mixo/demo/data/index.js`, `/home/wpu/Desktop/Urunler/Mixo/demo/data/` altındaki parça dosyaları (boyut, satır bayrakları, marka sayıları), `/home/wpu/Desktop/Urunler/Mixo/demo/server.mjs` (ana sayfa listeleri ve ücretsiz kargo eşiği), `/home/wpu/Desktop/Urunler/Mixo/mobile/src/`, `/home/wpu/Desktop/Urunler/Mixo/mobile/app.json`, `/home/wpu/Desktop/Urunler/Mixo/mobile/assets/`.
