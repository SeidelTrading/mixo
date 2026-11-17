# Mixo Outlet mobil — tasarım kılavuzu

Kaynak: `src/theme.ts` (belirteçler) ve `src/components/ui.tsx` (ortak bileşenler). Ekranlar ham renk, yazı tipi adı, `fontWeight` ya da gölge yazmaz; hepsi buradan gelir. Örnek görüntüler: `scratchpad/tasarim/dil/` (ana sayfa, Kategorien, Mein Bereich, montaj).

**Tek cümle:** Her ekran ana sayfanın dilini konuşur: üstte mavi marka başlığı, sis zemin üstünde beyaz kartlar, Fraunces başlıklar, pastel diskli satırlar, tek mavi birincil eylem, mercan yalnız fiyat ve yıkıcı eylemde.

## Renkler (`colors`)

| Belirteç | Değer | Nerede |
|---|---|---|
| `text` / `navy` | #182047 | ana metin, başlıklar, lacivert panel, bildirim zemini, fiyat |
| `primary` | #3048c8 | birincil düğme, sepet dairesi, aktif sekme, bağlantı, seçili kapsül/radyo/onay, ikon disklerinin ikonu |
| `primaryDark` | #2438a6 | basılı birincil düğme, başlık geçişinin ucu (`gradients.brand` = primary → primaryDark) |
| `sun` / `sunSoft` | #ffd168 / #fff5d9 | indirim rozeti, kargo kapsülü, bölüm ikon diski, "hedefe ulaşıldı" / "Preiswert" paneli, güneş disk tonu |
| `accent` (mercan) | #c83e30 | indirimli fiyat, dolu kalp, sayı rozeti, **yıkıcı eylem yazısı ve ikonu** |
| `peach` | #fff0e6 | "Aktionen" paneli, uyarı notu, yıkıcı satırın ikon diski |
| `lilac` | #eeeaff | demo şeridi, varsayılan ikon diski, aktif sekme kapsülü, ilerleme izi |
| `bg` / `mist` | #f7f6fb | sayfa zemini, ürün görseli karosu, basılı satır |
| `card` | #ffffff | kart, grup, panel, katman, alt çubuk, sekme çubuğu |
| `line` / `lineSoft` | #dcdfea / #eceef6 | kenar çizgisi / grup içi ayırıcı ve ürün kartı kenarı |
| `disabledBg` | #eceef6 | devre dışı birincil düğme zemini (yazı `muted`) |
| `onBrandPress` / `onBrandSurface` | beyaz %18 / %14 | mavi başlıkta basılı ikon düğmesi / metinli eylem kapsülü |
| `muted` | #62667c | ikincil metin, pasif sekme, ok |
| `good` | = lacivert | olumlu durum metni; **yeşil yoktur** |
| `overlay` | rgba(23,27,56,.48) | katman ve diyalog arkası |

Disk tonları `discTints`: `lilac` (varsayılan) · `peach` · `sun` (= sunSoft). Beyaz kart üstünde sis tonu kullanılmaz (kaybolur).

## Yazı (`typo`, `fonts`)

Fraunces 500 yalnız başlıklarda; geri kalan her şey Inter. Android'de kalınlık `fontFamily: fonts.*` ile verilir.

| Hazır ayar | Değer | Kullanım |
|---|---|---|
| `hero` | Fraunces 28/32 | afiş başlığı (`fitDisplay` ile küçülür, en çok 2 satır) |
| `title` | Fraunces 22/28 | **ekran başlığı (beyaz, başlıkta), bölüm/grup başlığı, boş durum, katman başlığı**; diyalogda 21/26, süzgeç grubunda 20/26 |
| `h2` | Inter kalın 18/24 | yalnız eski yerler (yeni işte `title`) |
| `h3` | Inter yarı kalın 15/20 | **satır başlığı**, kart başlığı |
| `rowSub` | Inter 13/18 soluk | satır alt yazısı, katmandaki not |
| `body` / `small` / `meta` / `caption` | 15/22 · 13/18 · 12/16 soluk · 11/14 soluk | gövde · ürün adı · sayı satırı · karo alt yazısı |
| `eyebrow` | 11/14 BÜYÜK, mavi | afiş üst etiketi |
| `button` | yarı kalın 15/20 | düğme |
| `price` | çok kalın 16/20 (büyük 24/30) | fiyat |

## Ölçü (`space`, `radius`, `sizes`)

- Boşluk 4 / 8 / 12 / 16 / 24 / 32. **Yan boşluk her yerde 16.** Gruplar arası 12, başlıklı grubun üstü 24, bölümler arası 24.
- Köşe: s 8 (onay kutusu) · m 12 (giriş, görsel karosu, demo şeridi) · **l 16 (ürün/marka kartı, liste grubu)** · xl 18 (ana sayfa paneli, afiş) · sheet 20 (katman, diyalog, alt çubuk üst köşesi) · pill.
- `sizes`: başlık satırı 56 · dokunma 44 · satır 56 · ikon diski 40 · grup aralığı 12.
- Gölge (lacivert tonlu): `soft` · `card` (ürün kartı, liste grubu) · `raised` (afiş, diyalog) · `header` (başlıklar) · `bar` (alt çubuk, katman, sekme çubuğu; yukarı doğru).

## Ortak dil (yeni)

### 1. Ekran başlığı — mavi marka başlığı her yerde
- Karar: ana sayfanın mavi geçişinin **kısa hâli** tüm sekme ve yığın ekranlarında (`ScreenHeader`): 56 dp + güvenli alan, `gradients.brand`, sağ üstte yarı saydam halka, beyaz Fraunces 22 başlık (uzunsa %80'e kadar küçülür), beyaz geri oku, düz alt kenar + `shadow.header`. Ana sayfa kaydırılınca aynı şeride daralır (köşeler dolar, 8 + 48 + 10 dp).
- Gezginler otomatik çizer (`app/_layout.tsx`, `(tabs)/_layout.tsx` → `navHeader`). Ekran yalnız seçenek verir: `title` / `headerTitle` (metin ya da öğe), `headerLeft`, `headerRight`.
- Başlığın içinde (bağlam) `IconButton` kendiliğinden beyaz, `SearchBox` beyaz zeminli olur → renk vermeyin. Metinli eylem: `<HeaderAction icon label onPress />` (yarı saydam beyaz kapsül, 44 dp alan). Mavi/lacivert metin başlığa konmaz.
- Kendi başlığını çizen ekran (arama, tam ekran katman) da `ScreenHeader` kullanır (`children` = beyaz arama alanı, `right` = kapat).
- Durum çubuğu kökte tek yerden **açık** (`StatusBar style="light"`); ekranlar durum çubuğu stilini değiştirmez.
- Ekran içinde ikinci bir başlık çubuğu açılmaz: alt seviye (ör. Kategorien 2. seviye) başlığı `navigation.setOptions({ headerTitle, headerLeft })` ile değiştirir.

### 2. Gruplu içerik — kart, çıplak satır değil
- `PageScroll` (sis zemin, üst 16, aralık 12, alt 24 + ana çizgi; sekmede `bottomInset={false}`) içinde `CardGroup`'lar.
- `CardGroup`: beyaz, köşe 16, `shadow.card`, 16 yan boşluk; satırlar arası `lineSoft` çizgi, soldan disk sonrasına kadar içeride (`divider` ile değişir). `title` → Fraunces 22 grup başlığı (ana sayfadaki bölüm başlığı gibi), `action` → sağda mavi bağlantı.
- `ListRow`: en az 56 dp; baş öğe 40 dp `IconDisc` (lila/şeftali/güneş zemin, mavi ikon; `tint`) ya da `leading` (ör. `CategoryDisc`); başlık `h3`, alt yazı `rowSub`, sonda `value` (soluk) ve/veya ok.
- Yıkıcı satır: `danger` (mercan yazı + ikon, şeftali disk, ok mercan) ve **ayrı bir grupta, en altta**. Devre dışı satır %45.
- Kartın içindeki bilgi satırları (Versand, Verfügbarkeit, toplamlar) da beyaz kartta; grup içinde gri zemin yok.

### 3. Boş durum
- `EmptyState`: 112 dp pastel disk + içinde 68 dp beyaz disk ve mavi ikon, çevresinde güneş/mercan/mavi noktalar; Fraunces başlık; tek satır dostça açıklama; `action` → mavi birincil kapsül (+ isteğe bağlı `children`).
- Başlık kısa olsun ("Deine Merkliste ist leer"); açıklama `text`. `text` verilmez ve başlık birden çok cümleyse ilk cümle başlık, gerisi açıklama olur.
- İkon ve ton ekrana göre: Merkliste `heart-outline` + `peach`, Warenkorb `cart-outline` + `lilac`, arama `search` + `sun`, liste `list-outline`.

### 4. Alt çubuk, katman, diyalog
- Yapışık alt çubuk: `BottomBar` (beyaz, üst köşe 20, `shadow.bar`, 16 yan, üst 12, güvenli alan payı; sekme ekranında `safe={false}`). Üst çizgi (`borderTop`) kullanılmaz.
- Katman: `BottomSheet` (üst köşe 20, tutamak, Fraunces başlık + kapat). Seçenekler `ChoiceRow` (radyo ya da onay dairesi, ≥ 52 dp). Tam ekran katman (süzgeç): `ScreenHeader` + içerik + `BottomBar`.
- Diyalog: `ConfirmDialog` (köşe 20, iç 24, üstte 48 dp ikon diski; yıkıcıda şeftali + mercan çöp kutusu, onay düğmesi `danger`). Ad girişi `ListNameDialog` aynı görünümde, giriş `inputStyle` (odakta mavi kenar).
- Devre dışı birincil düğme: `Btn disabled` → `disabledBg` zemin + soluk yazı (soluk mavi değil); ödeme gibi kapalı eylemde `icon="lock-closed"` ve altında kısa neden metni.

### 5. Kontroller (hepsi ≥ 44 dp)
- `Btn` 48 dp kapsül (`primary` / `ghost` / `danger`, `icon`). `IconButton` 44 dp. `Chip` 36 dp + hitSlop.
- `Checkbox`: 24 dp kutu (köşe 8, 2 dp kenar), seçili mavi dolgu; alan 44.
- `QtyStepper`: çizgili kapsül, iki 44 dp düğme (mavi − / +; en küçükte mercan çöp kutusu `onRemove`), ortada yarı kalın sayı.
- `Segmented`: lineSoft izli kapsül, 44 dp bölümler, seçili mavi + beyaz yazı.
- Sekme çubuğu: beyaz, gölge `bar`; aktif sekmede ikon lila kapsülde, etiket mavi yarı kalın.

## Ana sayfa (bitti)
Mavi başlık (kaydırınca 66 dp düz şerit) · demo şeridi (≥ 40 dp, satırın tamamı dokunulur) · kategori daireleri (64 dp disk, 76 dp öğe, etiket 12/15 sabit iki satır, üstten hizalı; "Alle" lila disk + mavi halka) · afiş (204 dp, 44 dp güneş/beyaz eylem kapsülü, 8 dp noktalar, kargo satırı tekrar edilmez) · Top-Marken (148 dp kart, küçük kategori diski, Fraunces marka adı, harf/rakam monogramı yok) · şeritler (2,4 kart, sağ kenarda panel renginde solma, sonda kalkar) · ürün kartı (`lineSoft` kenar; baştaki model kodları sona: `codesLast`) · "Aus dem Sortiment" (küratörlük iması yok).

## Yap / Yapma
**Yap:** mavi başlık + sis zemin + beyaz kart; başlıklarda Fraunces; tek mavi birincil eylem; fiyat ve yıkıcıda mercan; 16 yan, 12 grup, 24 bölüm; metni kesmek yerine sığdır; sayıları `num`/`nProdukte`, tutarı `eur` ile yaz.
**Yapma:** ham renk, yeşil, gri ikon kutusu, `fontWeight`; beyaz/sistem başlık çubuğu; tam genişlik çizgili satır listesi; `borderTop` çizgili alt çubuk; soluk mavi devre dışı düğme; aynı sayıyı/fiyatı iki kez yazma; uydurma veri (puan, geri sayım, stok baskısı, teslim tarihi, kupon, sahte eski fiyat, "beliebt/für dich/unsere Auswahl" gibi ima); başka mağazanın adı, rengi, modül adı.

## Ekran kontrol listesi (sonraki mühendisler)
Her ekranda: ☐ başlık gezginden geliyor, başlıkta renkli metin yok ☐ `PageScroll`/`CardGroup`/`ListRow` ile kart dili ☐ boş durum `EmptyState` + eylem ☐ alt çubuk `BottomBar` ☐ `fontWeight` / ham renk yok ☐ 44 dp dokunma ☐ Android'de görüntü alındı.

- **Kategorien** (referans, bitti): 1. seviye `CardGroup` + 52 dp `CategoryDisc`, 72 dp satır; 2. seviye başlık `headerTitle/headerLeft`, alt kategori sayısı `value`. Kalan: "Angebote" kartı için kısa alt yazı.
- **Kategorie (liste)**: tek sayı satırı başlığın altında ("6.487 Produkte · 500 geladen", `meta`) — üstteki "500 von …" kalkar; `ScopeBand` Fraunces; kapsül şeridi 16 yan + `EdgeFade`; süzgeç/sıralama katmanları hazır.
- **Suche**: başlık hazır (beyaz alan). "Letzte Suchen" → silinebilir kapsüller ya da `CardGroup`; marka/kategori önerileri `CardGroup` + `IconDisc`; sonuç yok → `EmptyState icon="search" tint="sun"`; "Alles durchsuchen" altı çizili metin yerine `ghost` düğme.
- **Produkt**: bilgi tablosu `CardGroup` (değer `value`); alt çubuk `BottomBar` (fiyat + kalp `IconButton` + birincil); katmanlar hazır.
- **Warenkorb**: satır kartı köşe 16 + `shadow.card`, görsel 80–88 dp sis karoda, fiyat `price` 16; `QtyStepper` (onRemove ile); kargo ilerlemesi beyaz kartta, ulaşınca güneş dolgu + onay ikonu + lacivert 14 yarı kalın; toplam çubuğu `BottomBar safe={false}`; "Alle auswählen" amacı yoksa kaldır.
- **Kasse**: demo notu şeftali kart + ikon; seçim özeti `CardGroup` (küçük görsel, iki satır başlık, tutar); toplam satırı kartta; ödeme `Btn disabled icon="lock-closed"` + altında neden; geri `ghost`.
- **Merkliste**: başlıkta `HeaderAction` "Meine Listen" (hazır); "Preis beim Merken" yalnız fiyat değiştiyse, tek satır `caption` + ok; boş → `EmptyState icon="heart-outline" tint="peach"` + "Produkte entdecken".
- **Meine Listen / Liste**: listeler `CardGroup` (Merkliste kalp diski şeftali, diğerleri lila), düzenle/sil `IconButton` (sil mercan), "Neue Liste" ayrı kartta `IconDisc icon="add" tint="sun"`; boş liste `EmptyState`.
- **Mein Bereich** (referans, bitti): gezinme kartı → "Zuletzt angesehen" → yıkıcı kart en altta.
- **Über**: üstte lila panel + kısa giriş; "Echt" / "Demo" iki `CardGroup` (başlık Fraunces), madde satırları `IconDisc` (onay / bilgi).

- **Kategorie (liste) — E1 ekleri**: süzgeç/sıralama çubuğu beyaz yapışık şerit (`shadow.soft`), kapsüller **44 dp** (yerel `BarChip`; ortak `Chip` 36 dp kalır), Filter/Sortieren ikon + etiket, sayaç mercan nokta. Başlık bloğu (`ScopeBand`): Fraunces başlık, toplam (+ kesin fiyat aralığı), altında sayı satırı (`countLine`) ve yalnız süzgeçsiz kısmi yüklemede ince `ProgressBar` (yüklenen/toplam). Fiyat sıralaması için tam yükleme ilerlemesi çubuğun altında ayrı şerit (`CountLine`), başlıktaki iz o sırada gizlenir. Boş sonuç: `EmptyState icon="search" tint="sun"` + "Filter zurücksetzen". Kategorien 2. seviye: her satırda `CategoryDisc` (alt kategori kendi 0. parçasından temsilci görsel, 44 dp, satır 64 dp).

- **Warenkorb / Kasse (E4 ekleri)**: sayfa zemini sis, yan boşluk 16, satırlar 12 aralıkla. Üstte kargo kartı (beyaz, `shadow.card`): lila `IconDisc cube-outline` + 14 yarı kalın metin + `ProgressBar`; ulaşınca kart `sunSoft`, disk sun + lacivert onay; eşik sunucudan gelmediyse bilgi diski + soluk "Annahme" metni, çubuk yok; yüklenirken aynı boyda boş kart (kayma olmasın). Sonra beyaz "Alle auswählen" kartı (56 dp). Satır kartı: beyaz, köşe 16, `shadow.card`, iç 12; üstte onay kutusu + 88 dp sis karoda görsel (`blend`) + mavi `eyebrow` marka + 2 satırlı başlık (`titleAfterBrand`) + adet > 1 ise "x € pro Stück" (`meta`); altta `QtyStepper` (1'de mercan çöp) solda, `Price` sağda (satır toplamı; canlı was > price ise üstü çizili). Satışta olmayan satır: onay kutusu yok (32 dp boşluk), şeftali kapsül, fiyat yok. Alt çubuk `BottomBar safe={false}`: lacivert/Fraunces toplam, altında `caption` (seçim yok / "n von m"), sağda birincil kapsül; hiçbir şey seçili değilse düğme devre dışı. Açılan özet sis kutuda. Boş: `EmptyState cart-outline` + "Weiter einkaufen" + beyaz panelde şerit; başlık boşken yalnız "Warenkorb". Kasse: şeftali demo kartı (beyaz diskte ikon), `CardGroup` seçim satırları (56 dp karo, başlık, "n × x €", tutar), toplam kartı (Zwischensumme / Versand / Gesamt Fraunces 22), yapışık `BottomBar`: kilitli devre dışı ödeme + `caption` neden + ghost geri; seçim boşsa `EmptyState`.
- **ConfirmDialog**: etiket 12 karakteri aşarsa düğmeler alt alta (onay üstte); yan yana dar kalıp "Warenkorb l…" diye kesiliyordu.
