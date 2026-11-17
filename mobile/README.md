# Mixo Outlet — mobil uygulama (demo)

Expo SDK 58 + Expo Router + TypeScript. Müşteri mağaza uygulaması; tek kod tabanı iOS, Android ve web. Karar ve yol haritası: `../docs/mobil-uygulama-2026-11-15.md`.

## Çalıştırma

```bash
npm install
npx expo start            # QR ile Expo Go (telefon) ya da a / i / w tuşları
```

Web önizlemesi için (canlı demo CORS vermediğinden yerel okuma vekili gerekir):

```bash
node tools/dev-proxy.mjs                                        # 1. terminal
EXPO_PUBLIC_API_BASE=http://localhost:8098 npx expo start --web  # 2. terminal
```

Kontroller: `npm run typecheck`, `npm run lint`, `npm test`, `npm run export:web`. Lint ve testler Node 22 ister (Node 20'de `expo lint` ve `.ts` testleri çalışmaz).

## Yapı

- `src/config.ts` — **tek ayar dosyası** (veri taban adresi, görsel CDN, kargo varsayımı, sayfa/tarama sınırları).
- `src/api/shop.ts` — **veri erişiminin tek noktası** (yalnız GET: `/api/config`, `/api/shop/home`, `/api/shop/product`, `/data/*.js`). Storefront API geçişinde yalnız burası değişir.
- `src/hooks.ts` — veri kancaları (dizin, ana sayfa, ayar, kapsam listesi, katalog taraması, güncel fiyatlar).
- `src/store/shopStore.tsx` — sepet (seçimli), Merkliste ve adlı listeler, son bakılanlar, arama geçmişi (cihazda, AsyncStorage `mixo.v2`; v1 verisi taşınır).
- `src/filters.ts`, `src/shipping.ts`, `src/routes.ts`, `src/strings.ts`, `src/theme.ts`, `src/categoryIcons.ts` — süzgeç/sıralama, kargo hesabı, tüm bağlantılar (`href`), Almanca metinler, renkler, kategori ikonları.
- `src/components/` — `ui.tsx` (ortak parçalar), `listing.tsx` (süzgeç/sıralama çubuğu ve sayfaları), `ListPicker.tsx` (listeye ekleme), `home.tsx` ve `Banners.tsx` (ana sayfa bölümleri), `SavedPriceNote.tsx` (kayıt fiyatı karşılaştırması).
- `src/app/` — ekranlar (Expo Router):
  - `(tabs)/`: `index` (Start), `favoriten` (Merkliste), `warenkorb`, `bereich` (Mein Bereich), `kategorien`.
  - Yığın: `suche`, `kategorie/[key]`, `produkt/[id]`, `kasse` (demo), `listen`, `liste/[id]`, `zuletzt`, `ueber`.
- `test/` — `logic.test.ts` (veri ve süzgeç mantığı) ve `design.test.ts` (afiş başlığı ölçüsü gibi tasarım kuralları).

## Tasarım sistemi

Renk, yazı ve ölçü belirteçleri `src/theme.ts` içindedir; ekranlar ham renk, yazı tipi adı ya da gölge yazmaz. Yazı tipleri Inter (arayüz) ve Fraunces (başlıklar), `@expo-google-fonts` ile `src/app/_layout.tsx` içinde yüklenir. Ortak parçalar (`ScreenHeader`, kart grupları, satırlar, ürün kartı, şeritler, katmanlar, boş durumlar) `src/components/ui.tsx` içindedir. Kurallar ve ekran kontrol listesi: [TASARIM.md](TASARIM.md). Ekran görüntüleri: `../docs/mobil-ekran-2026-11-16/`.

Demo sunucusuna sipariş, sepet kaydı ya da olay gönderilmez. Gerçek ödeme, giriş ve bildirim yoktur.
`app.json` içindeki paket adı (`de.example.mixooutletdemo`) yer tutucudur; yayından önce gerçek bir kimlikle değiştirilmelidir.
