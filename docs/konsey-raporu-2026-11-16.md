# Mixo Outlet mobil uygulaması: inceleme konseyi raporu

- **Tarih:** 16.11.2026
- **Hazırlayan:** konsey başkanı
- **Sürüm:** 2. Tamlık denetiminin bulduğu yanlışlar düzeltildi, eksik alanlar bölüm 9'a eklendi. Ağ boyutları başkanın demo sunucusundan yaptığı okuma ölçümleriyle tamamlandı.
- **Okuyucu:** ürün sahibi (ne düzeltileceğine karar veren kişi)
- **İncelenen:** `mobile/` (Expo SDK 58, expo-router, React Native 0.88, TypeScript strict). `src/`, `test/` ve `tools/` toplam 7.361 satır; `app.json` ve `package.json` ile birlikte 7.449 satır.
- **Not:** `mobile/` klasörü git'te henüz izlenmiyor, yani commit yok. Rapor, 16.11.2026'daki çalışma kopyasına dayanıyor.

**Önem dereceleri**

| Derece | Anlamı |
|---|---|
| Kritik | Çökme, veri kaybı, güvenlik ya da hukuki açık, ya da temel bir akışın kullanılamaması |
| Yüksek | Normal bir kullanıcının karşılaşacağı yanlış sonuç ya da bozuk özellik |
| Orta | Uç durum, tutarsızlık, ölçülebilir performans sorunu ya da erişilebilirlik engeli |
| Düşük | Küçük cila |

Bağlantılar `Mixo` klasörüne göre yazıldı. "K-xxx" konseyin kayıt numarasıdır.

**Kısa sözlük**

| Terim | Anlamı |
|---|---|
| Parça (chunk) | Katalog sunucuda yaklaşık 500 ürünlük dosyalara bölünmüş. Uygulama ürünleri bu dosyalar hâlinde indirir. "Tüm ürünler" listesi 90 parça. |
| Kapsam | Bir kategori, alt kategori ya da "tüm ürünler" listesi. |
| Dizin | Kategorileri, ürün sayılarını ve parça sayılarını tutan küçük özet dosya (`/data/index.js`). |
| Kanca (hook) | Bir ekranın veri getirmek ya da durum tutmak için kullandığı ortak kod (ör. güncel fiyatları getiren kod). |
| Önbellek | İndirilen verinin, yeniden indirmemek için bellekte tutulan kopyası. |
| Bildirim (toast) | Ekranın altında birkaç saniye görünüp kaybolan kısa mesaj ("Zum Warenkorb hinzugefügt"). |
| Ekran okuyucu | Görme engellilerin ekrandaki metni sesli dinlediği araç: iPhone'da VoiceOver, Android'de TalkBack. |
| Canlı bölge | İçeriği değişince ekran okuyucunun kendiliğinden okuduğu alan. Yalnız Android'de çalışır. |
| Alt pencere (BottomSheet) | Ekranın altından açılan pencere (süzgeç, sıralama, "Hinzugefügt"). |
| Derin bağlantı | Uygulamayı doğrudan belirli bir ekranda açan bağlantı (`mixodemo://…`). |
| dp | Ekran ölçü birimi. 44 dp yaklaşık bir parmak ucu genişliğidir. |
| JSON / ağda | "JSON" yazan boyut, telefonda açılıp işlenen veridir. "Ağda" yazan boyut, sunucunun gzip ile sıkıştırıp gönderdiği hâlidir. |

---

## 1. Karar

- **Genel durum:** Uygulama sağlam ve dürüst kurulmuş bir demo. Kritik düzeyde çökme, veri kaybı ya da güvenlik açığı yok. Düşük dereceli, nadir örnekler var: K-030 (tek bir çizim hatası bütün uygulamayı düşürüyor), K-208 (kayıt okunamazsa o oturumda eklenenler kayboluyor), K-080 (geliştirme aracındaki izin listesi aşılabiliyor). Tür denetimi (tsc), lint ve 18 birim testi temiz geçiyor. Uygulama puan, stok ya da teslim süresi gibi veri uydurmuyor.
- **Mağaza sahibine göstermeye uygun mu:** Evet, ama P0 paketi yapıldıktan sonra. Bu yaklaşık 30 saatlik, yani yaklaşık 4 iş günlük iştir. Bugünkü haliyle gösterilirse ilk göze çarpacak üç şey şunlar:
  - Telefon ekranında Mixo yerine Expo logosu görünüyor.
  - "Alle Kategorien" yanlış listeyi açıyor.
  - Alt kategori seçilince süzgeçler sessizce kayboluyor.
- **Mağazada yayına uygun mu:** Hayır. Önce şunlar tamamlanmalı:
  - Yasal sayfalar (Impressum, Datenschutz)
  - Lisansı belgeli ürün görselleri
  - Gerçek uygulama kimliği ve ikonları
  - Birim fiyat (Grundpreis) ve KDV notları
  - Erişilebilirlik düzeltmeleri

  Apple "demo uygulama" kabul etmediği için, gerçek sipariş akışı gelene kadar dağıtım iç test kanallarıyla (TestFlight, Play iç test) sınırlı kalmalı.
- **En önemli üç sorun:**
  1. **K-001:** Yaklaşık 661 ürün, Bing görsel aramasından indirilmiş ve lisansı belirsiz fotoğraflarla gösteriliyor.
  2. **K-004:** Uygulamada Impressum, Datenschutz ya da iletişim bilgisi hiç yok.
  3. **K-003:** Uygulama bir dakikadan uzun açıkken bağlantı bir an koparsa, bellekteki parçalar dahil bütün yeni katalog okumaları hata veriyor. Yeni açılan ekranlar hata kutusu gösteriyor, açık listede sonraki sayfa gelmiyor, süren arama duruyor. Ekranda zaten görünen ürünler yerinde kalıyor.
- **Sayılar ve puan:** 196 onaylı bulgu var: 0 kritik, 2 yüksek, 43 orta, 151 düşük. Genel puan **6,6 / 10**. Bu, bölüm 3'te kendi üyesi olan 10 açının puan ortalamasıdır. Ayrı üyesi olmayan Marka açısı ortalamaya katılmadı; katılsaydı puan 6,5 olurdu.

---

## 2. Konsey ve yöntem

### Kimler oturdu

**Satır okuyucuları (9 kişi).** Her biri kodun belirli bir dilimini satır satır okudu.

| Kod | Dilim | Ham bulgu |
|---|---|---|
| O1 | `src/components/ui.tsx` 1-720 | 12 |
| O2 | `src/components/ui.tsx` 701-1383 | 13 |
| O3 | `shopStore.tsx`, `filters.ts`, `shipping.ts`, `config.ts`, `routes.ts`, `categoryIcons.ts` | 18 |
| O4 | `src/api/shop.ts`, `src/hooks.ts` | 16 |
| O5 | `src/app/suche.tsx`, `src/components/listing.tsx` | 14 |
| O6 | `produkt/[id].tsx`, `kategorie/[key].tsx`, `ContextRail.tsx`, `zuletzt.tsx` | 14 |
| O7 | `Banners.tsx`, `home.tsx`, `(tabs)/index.tsx`, `theme.ts` | 12 |
| O8 | `strings.ts`, `warenkorb.tsx`, `kasse.tsx`, `kategorien.tsx`, `(tabs)/_layout.tsx`, `_layout.tsx` | 19 |
| O9 | `ListPicker.tsx`, `listPickerContext.ts`, `listen.tsx`, `liste/[id].tsx`, `bereich.tsx`, `favoriten.tsx`, `SavedPriceNote.tsx`, `ListIntro.tsx`, `ueber.tsx`, `test/*`, `tools/dev-proxy.mjs`, `app.json`, `package.json`, `tsconfig.json`, `eslint.config.js` | 20 |

**Uzman üyeler (10 kişi).** Her biri kendi açısından kodun geniş bir bölümünü okudu. Kimin hangi dosyaları okuduğu aşağıdaki kapsam bölümünde.

| Kod | Açı | Ham bulgu |
|---|---|---|
| U1 | Doğruluk ve mantık | 15 |
| U2 | Durum ve kalıcılık | 19 |
| U3 | Veri, ağ ve performans | 17 |
| U4 | Güvenlik ve gizlilik | 15 |
| U5 | Erişilebilirlik | 33 |
| U6 | Dürüstlük, hukuk ve mağaza uyumu | 16 |
| U7 | Mimari, bakım ve testler | 20 |
| U8 | Almanca metin ve terminoloji | 27 |
| U9 | Platform ve Expo uyumu | 17 |
| U10 | UX ve görsel (Android emülatöründe de denedi) | 20 |

"Marka" açısı ayrı bir üyeye verilmedi. Yazman, iki bulguyu (K-002, K-143) bu açıyla işaretledi. Bu yüzden Marka puanı bölüm 3'te bilgi olarak gösteriliyor ama genel ortalamaya katılmıyor.

**Üyelerin çalıştırdığı denetimler**

- `npx tsc --noEmit` (uygulama ve test ayarı): 0 hata.
- `npx expo lint`: temiz.
- `npm test`: 18/18 geçti.
- `npm audit --omit=dev`: 3 orta uyarı. Üçü de aynı açık: `expo → @expo/fingerprint → minimatch`. Bu yalnızca bir komut satırı aracında kullanılıyor, uygulama paketine girmiyor. Önerilen `audit fix --force` Expo'yu 52'ye düşürür, bu yüzden uygulanmamalı.
- U10 uygulamayı Android emülatöründe Expo Go ile denedi.
- Demo sunucusuna yalnızca uygulamanın kullandığı okuma uçlarıyla istek atıldı.

### Nasıl birleştirildi ve oylandı

1. Üyeler birbirinden bağımsız çalıştı ve **337 ham bulgu** verdi. Boş dönen üye ya da kayda geçmeyen ham bulgu olmadı.
2. Yazman aynı sorunu anlatan bulguları tek kayıtta birleştirdi. Böylece **225 kayıt** (K-001…K-225) çıktı. Birleştirmede üyelerin önerdiği en yüksek önem alındı.
3. Her kayıt bir çürütme oylamasına gitti:
   - Kritik ya da yüksek önerilen 10 kayda (K-001…K-010) **3 şüpheci** baktı.
   - Diğer 215 kayda **1 şüpheci** baktı.
   - Karar çoğunlukla verildi. Şüpheciler son önem derecesini de belirledi.
4. **Sonuç:** 196 kayıt **onaylandı**, 29 kayıt **çürütüldü**. Çürütülenlerin 1'i üç şüpheciliydi (K-010), 28'i tek şüpheciliydi.
5. Oylamada 41 bulgunun önemi **indirildi**, hiçbirininki yükseltilmedi:
   - 1 bulgu kritikten yükseğe (K-001)
   - 7 bulgu yüksekten ortaya
   - 33 bulgu ortadan düşüğe

**Onaylı bulguların son önem dağılımı**

| Kritik | Yüksek | Orta | Düşük | Toplam |
|---|---|---|---|---|
| 0 | 2 | 43 | 151 | 196 |

**Test verisi notu:** U10 emülatörde test yaparken cihazdaki verilere dokundu:

- Sepetteki 1 ürün (Seiko Astron) silindi.
- Merkliste'deki 3 ürün çıkarılıp aynı sırayla geri eklendi. Bu yüzden kayıt tarihleri ve kayıt fiyatları yeniden yazıldı.
- Bir test listesi açılıp silindi.

Proje dosyalarında değişiklik yapılmadı.

### Kapsam tablosu

Satır okuyucuları (O1-O9) tablodaki her dosyayı baştan sona okudu. **Tabloda boşluk yok.** Ayrıca U7 tablodaki her dosyayı tam okudu. Diğer uzmanlar dosyaların bir kısmını tam, bir kısmını yalnız ilgili satırlarda okudu, bazılarını hiç açmadı (ayrıntı tablonun altında).

| Dosya (`mobile/` altında) | Satır | Satır okuyucusu (aralık) | Boşluk |
|---|---|---|---|
| `src/api/shop.ts` | 504 | O4: 1-504 | yok |
| `src/app/_layout.tsx` | 59 | O8: 1-59 | yok |
| `src/app/(tabs)/_layout.tsx` | 81 | O8: 1-81 | yok |
| `src/app/(tabs)/bereich.tsx` | 111 | O9: 1-111 | yok |
| `src/app/(tabs)/favoriten.tsx` | 51 | O9: 1-51 | yok |
| `src/app/(tabs)/index.tsx` | 121 | O7: 1-121 | yok |
| `src/app/(tabs)/kategorien.tsx` | 112 | O8: 1-112 | yok |
| `src/app/(tabs)/warenkorb.tsx` | 252 | O8: 1-252 | yok |
| `src/app/kasse.tsx` | 100 | O8: 1-100 | yok |
| `src/app/kategorie/[key].tsx` | 253 | O6: 1-253 | yok |
| `src/app/liste/[id].tsx` | 107 | O9: 1-107 | yok |
| `src/app/listen.tsx` | 103 | O9: 1-103 | yok |
| `src/app/produkt/[id].tsx` | 396 | O6: 1-396 | yok |
| `src/app/suche.tsx` | 469 | O5: 1-469 | yok |
| `src/app/ueber.tsx` | 44 | O9: 1-44 | yok |
| `src/app/zuletzt.tsx` | 28 | O6: 1-28 | yok |
| `src/categoryIcons.ts` | 20 | O3: 1-20 | yok |
| `src/components/Banners.tsx` | 345 | O7: 1-345 | yok |
| `src/components/ContextRail.tsx` | 45 | O6: 1-45 | yok |
| `src/components/home.tsx` | 244 | O7: 1-244 | yok |
| `src/components/listing.tsx` | 376 | O5: 1-376 | yok |
| `src/components/ListIntro.tsx` | 14 | O9: 1-14 | yok |
| `src/components/listPickerContext.ts` | 15 | O9: 1-15 | yok |
| `src/components/ListPicker.tsx` | 137 | O9: 1-137 | yok |
| `src/components/SavedPriceNote.tsx` | 40 | O9: 1-40 | yok |
| `src/components/ui.tsx` | 1383 | O1: 1-720, O2: 701-1383 (20 satır örtüşme) | yok |
| `src/config.ts` | 37 | O3: 1-37 (O8 de tamamını okudu) | yok |
| `src/filters.ts` | 138 | O3: 1-138 | yok |
| `src/hooks.ts` | 414 | O4: 1-414 | yok |
| `src/routes.ts` | 47 | O3: 1-47 | yok |
| `src/shipping.ts` | 6 | O3: 1-6 | yok |
| `src/store/shopStore.tsx` | 510 | O3: 1-510 | yok |
| `src/strings.ts` | 344 | O8: 1-344 | yok |
| `src/theme.ts` | 216 | O7: 1-216 | yok |
| `test/design.test.ts` | 107 | O9: 1-107 | yok |
| `test/logic.test.ts` | 97 | O9: 1-97 | yok |
| `test/register.mjs` | 3 | O9: 1-3 | yok |
| `test/resolve-ts.mjs` | 12 | O9: 1-12 | yok |
| `test/tsconfig.json` | 5 | O9: 1-5 | yok |
| `tools/dev-proxy.mjs` | 15 | O9: 1-15 | yok |
| `app.json` | 42 | O9: 1-42 | yok |
| `package.json` | 46 | O9: 1-46 | yok |

**Tablo dışındaki dosyalar**

| Dosya (`mobile/` altında) | Satır | Kim okudu | Boşluk |
|---|---|---|---|
| `tsconfig.json` | 7 | O9 (tam); U4, U7, U9 da okudu | yok |
| `eslint.config.js` | 10 | O9 (tam); U4, U7, U9 da okudu | yok |
| `README.md` | 39 | U1, U3, U4, U6, U7, U9 (tam) | yok |
| `TASARIM.md` | 111 | U7 ve U10 (tam); U5 yalnız erişilebilirlik sözcükleriyle taradı | yok |
| `AGENTS.md` | 41 | U4, U7, U9 (tam) | yok |
| `LICENSE` | 21 | U4 ve U6, yalnız 1-6. satırlar | 7-21. satırlar okunmadı |
| `assets/*.png` (6 dosya) | – | `icon.png`, `android-icon-foreground.png`, `splash-icon.png`: U6 ve U9. `favicon.png`: U9 | `android-icon-background.png` ve `android-icon-monochrome.png` açılmadı |
| `package-lock.json` | – | U4 yalnız paket kaynaklarını ve bütünlük değerlerini taradı (809 paket) | sürüm uyumu incelenmedi |
| `CLAUDE.md` (1 satır), `.expo/` | – | kimse | incelenmedi |

**Uzman üyelerin okuduğu dosyalar (özet)**

| Üye | Tam okuduğu | Yalnız ilgili satırlarda | Hiç açmadığı (önemliler) |
|---|---|---|---|
| U1 | `shop.ts`, `hooks.ts`, `shopStore.tsx`, `filters.ts`, `routes.ts`, `config.ts`, `shipping.ts`, bütün ekran dosyaları, `listing.tsx`, `home.tsx`, `Banners.tsx`, `ListPicker.tsx`, `ContextRail.tsx`, `SavedPriceNote.tsx`, `logic.test.ts`, `app.json`, README | `ui.tsx` (1-480, 800-842, 1119-1260), `strings.ts` 1-260, `theme.ts` 211-216 | `design.test.ts`, `ListIntro.tsx`, `categoryIcons.ts`, `tools/` |
| U2 | `shopStore.tsx`, `hooks.ts`, `shop.ts`, `warenkorb.tsx`, `kasse.tsx`, `bereich.tsx`, `liste/[id].tsx`, `listen.tsx`, `favoriten.tsx`, `zuletzt.tsx`, `ueber.tsx`, `ListPicker.tsx`, `ContextRail.tsx`, `SavedPriceNote.tsx`, `routes.ts`, `config.ts`, `logic.test.ts` | `produkt/[id].tsx`, `ui.tsx`, `suche.tsx` 120-273, `(tabs)/_layout.tsx` 35-81 | `home.tsx`, `Banners.tsx`, `listing.tsx`, `kategorie/[key].tsx`, `kategorien.tsx`, `(tabs)/index.tsx`, `strings.ts`, `theme.ts`, `filters.ts` |
| U3 | `src/` altındaki hemen her dosya (`ui.tsx` dahil), `app.json`, `package.json`, README | `theme.ts` 180-216, `strings.ts` 341 | `ueber.tsx`, `listPickerContext.ts`, `ListIntro.tsx`, `categoryIcons.ts`, `test/`, `tools/` |
| U4 | `shop.ts`, `shopStore.tsx`, `hooks.ts`, `routes.ts`, `config.ts`, `suche.tsx`, `kategorie/[key].tsx`, `produkt/[id].tsx`, `bereich.tsx`, `kasse.tsx`, `ueber.tsx`, iki `_layout.tsx`, `tools/dev-proxy.mjs`, yapılandırma dosyaları | `ui.tsx` 55-130, `strings.ts` 155-225, `Banners.tsx` 240-300, `liste/[id].tsx` 1-50 | `listing.tsx`, `home.tsx`, `warenkorb.tsx`, `test/` |
| U5 | `ui.tsx`, `theme.ts`, `strings.ts`, bütün ekran dosyaları, `home.tsx`, `Banners.tsx`, `listing.tsx`, `ListPicker.tsx`, `ContextRail.tsx`, `SavedPriceNote.tsx`, `ListIntro.tsx` | `filters.ts` 107-121, `shopStore.tsx` 28-33, `app.json` | `shop.ts`, `hooks.ts`, `routes.ts`, `test/`, `tools/` |
| U6 | `strings.ts`, `shop.ts`, `hooks.ts`, `filters.ts`, `config.ts`, `listing.tsx`, `Banners.tsx`, ekran dosyalarının çoğu, `app.json`, `package.json`, README, `tools/dev-proxy.mjs` | `ui.tsx` (1-420, 600-700), `home.tsx` 1-80, `suche.tsx` (1-140, 180-469), `shopStore.tsx`, `theme.ts` | `listen.tsx`, `liste/[id].tsx`, `ListPicker.tsx`, `(tabs)/_layout.tsx` (yalnız metin araması) |
| U7 | Bu bölümdeki büyük tablonun tamamı, `test/`, `tools/`, yapılandırma, README, AGENTS, TASARIM | – | – |
| U8 | `strings.ts`, `filters.ts`, `config.ts`, bütün ekran dosyaları, `listing.tsx`, `home.tsx`, `Banners.tsx`, `ListPicker.tsx` ve diğer küçük bileşenler | `ui.tsx` 1-1100, `theme.ts` 86-216, `shop.ts`, `hooks.ts`, `shopStore.tsx` | `test/`, `tools/` |
| U9 | Bütün ekran ve bileşen dosyaları (`ui.tsx` dahil), `theme.ts`, `config.ts`, `routes.ts`, `categoryIcons.ts`, yapılandırma, README, AGENTS, `tools/dev-proxy.mjs` | `shopStore.tsx` 205-330, `shop.ts` 55-91, `hooks.ts` 30-60, `strings.ts` 150-216 | `filters.ts`, `test/` |
| U10 | TASARIM, `routes.ts`, `filters.ts`, `config.ts`, `shipping.ts`, bütün ekran dosyaları, `home.tsx`, `Banners.tsx`, `listing.tsx`, `ListPicker.tsx` | `ui.tsx` (77-476, 630-879, 1000-1300), `shop.ts` (1-140, 330-504), `shopStore.tsx`, `hooks.ts` 12-37, `strings.ts` | `test/`, `tools/` |

---

## 3. Açı açı puan kartı

Bir bulgu birden çok açıya ait olabilir. Bu yüzden tablodaki toplam (233), onaylı bulgu sayısından (196) büyüktür. Hangi bulgunun hangi açıya sayıldığı en sondaki **Ek A**'da tek tek listelendi.

Genel puan, kendi üyesi olan 10 açının ortalamasıdır: (7+7+6+7+5+5+7+8+7+7) / 10 = 6,6. Marka açısının ayrı bir üyesi yoktu, puanını başkan iki bulguya bakarak verdi. Bu yüzden bilgi olarak gösteriliyor, ortalamaya katılmıyor (katılsaydı 6,5 olurdu).

| Açı | Puan | Gerekçe (tek satır) | Kritik | Yüksek | Orta | Düşük |
|---|---|---|---|---|---|---|
| Doğruluk | 7 | Ana akışlar doğru, testler temiz. Ama "Alle Kategorien" yanlış ekranı açıyor, süzgeçler kayboluyor, eski fiyat "gemerkt" olarak kaydediliyor. | 0 | 0 | 9 | 25 |
| Durum ve kalıcılık | 7 | Kayıt düzeni güçlü (sıralı yazma, bozuk kaydı yedekleme, sürüm taşıma). Ama güncel fiyat yenilenmiyor ve listelerde geri alma yok. | 0 | 0 | 6 | 7 |
| Veri, ağ, performans | 6 | Tek erişim noktası ve eşzamanlılık sınırı var. Ama 60 sn sonra tek bir hata yeni katalog okumalarını düşürüyor, küçük görseller için koca parçalar iniyor, marka süzgeci sınırsız indiriyor. | 0 | 0 | 8 | 9 |
| Güvenlik ve gizlilik | 7 | Yalnız okuma istekleri, izleme yok, arama cihazda, sır yok. Ama yasal sayfalar eksik, "keine Daten gesendet" metni yanlış, silme işlemi yedeği bırakıyor. | 0 | 1 | 3 | 8 |
| Erişilebilirlik | 5 | Roller ve etiketler büyük ölçüde var. Ama bildirimler VoiceOver'da okunmuyor, etiketler ürünü adlandırmıyor, büyük yazıda kesilmeler, yön kilidi ve kontrast açıkları var. | 0 | 0 | 16 | 26 |
| Dürüstlük, hukuk, mağaza | 5 | Uydurma veri yok, demo dürüstlüğü örnek düzeyde. Ama görsel lisansı, yasal sayfalar, birim fiyat ve KDV notu eksik, ikon ve kimlik şablondan kalmış. | 0 | 2 | 8 | 10 |
| Mimari, bakım, test | 7 | Tek ağ dosyası, strict TS, `any` yok, içe aktarma döngüsü yok. Ama Storefront geçiş iddiası yanlış, kayıt ve toplam mantığı testsiz, `ui.tsx` çok büyük. | 0 | 0 | 0 | 25 |
| Almanca metin | 8 | Tüm metin tek dosyada, çoğul biçimler ve tipografi doğru. Yalnızca terim tutarsızlıkları ve iki dilbilgisi hatası var. | 0 | 0 | 0 | 21 |
| Platform ve Expo | 7 | iOS'un iki pencere sınırı ve Android geri tuşu iyi yönetilmiş. Ama açılış ekranı ile yazı tipi sırası, tablet düzeni ve Android klavye sorunlu. | 0 | 0 | 2 | 13 |
| UX ve görsel | 7 | Görsel dil tutarlı, geri bildirimler güçlü (U10 de 7/10 verdi). Ama yığın ekranlarından sepete yol yok, süzgeçler kayboluyor, etiketler kesiliyor. | 0 | 0 | 5 | 27 |
| Marka (bilgi için, ortalamada yok) | 6 | Referans mağazanın izi yok, palet bize ait. Ama ikon Expo şablonu, Technik afişi kural dışı kırmızı. | 0 | 0 | 1 | 1 |
| **Genel** | **6,6** | Üyesi olan 10 açının ortalaması. Son dört sütun açı toplamı değil, onaylı bulguların kendisidir (her bulgu bir kez). | **0** | **2** | **43** | **151** |

---

## 4. Onaylanan bulgular

**Oy sütunu nasıl okunur:**

- "3/3": üç şüphecinin üçü de onayladı.
- "1/1": tek şüphecinin onayı.
- "↓": önerilen önem oylamada indirildi. Bulgunun bugünkü derecesi bulunduğu bölümün başlığıdır.

### Kritik (0)

Kritik bulgu yok. Tek kritik öneri (K-001) oylamada yükseğe indirildi.

### Yüksek (2)

| K | Yer | Başlık | Ne oluyor | Düzeltme | Oy |
|---|---|---|---|---|---|
| K-001 | [src/api/shop.ts:87](<mobile/src/api/shop.ts:87>) | `fix/` görselleri Bing görsel aramasından indirilmiş, hak sahibi belirsiz | Katalogda yaklaşık 661 ürün, demo sunucusundaki `fix/OIP.*` görsellerini gösteriyor (656 dosya). Bu dosyalar `_fix_prep.py` ile Bing küçük resimlerinden indirilmiş ve lisans kaydı yok. Hak sahibi şikâyet ederse masraflı ihtar (Abmahnung) ve mağazanın fikri mülkiyet kuralına göre ret riski doğar. | Sıra önemli. (1) `_build.py`, `_verify/fixes.json`'daki `fix/` görsellerini artık uygulamasın; bu ürünlerin `img` alanını boşaltsın ve satırı `lq=1` yapsın. Boş `img` için `imageUrl` boş döner, uygulama istek atmaz, nötr yer tutucu çizer (`ui.tsx:91`). `lq=1` ürünü listenin sonuna atar ve daire görseli olarak seçilmesini engeller (`shop.ts:503`). (2) Yeni katalog yayınlandıktan sonra `demo/img/fix/` dosyalarını sunucudan silin. Dosyalar silinip `img` alanı `fix/…` kalırsa yaklaşık 661 üründe kalıcı 404 oluşur ve K-168'deki genel yeniden deneme dakikada bir bütün görselleri yeniden çizdirir. (3) Görselsiz ürünlerde büyütme boş ekran açmasın diye K-128 aynı pakette düzeltilmeli. Lisanslı ya da kendi çektiğiniz fotoğraf gelince `img` yeniden doldurulur. Görsel kaynak ve lisans listesi tutun. Diğer CDN görsellerinin hakları da ayrıca teyit edilmeli. | 3/3 ↓ (kritik önerildi) |
| K-004 | [src/app/(tabs)/bereich.tsx:62-65](<mobile/src/app/(tabs)/bereich.tsx:62>) | Impressum, Datenschutz ve iletişim bilgisi uygulamada hiçbir yerden açılmıyor | Uygulama her açılışta Railway sunucusuna ve Shopify CDN'e istek atıyor, ama hiçbir yasal bilgi göstermiyor. Apple 5.1.1(i), Google Play gizlilik politikası ve DDG §5 Impressum şartları karşılanmıyor. Mağaza incelemesinde ret alınır. | Mein Bereich'e "Rechtliches" satırları (Impressum, Datenschutz) ekleyin ve Über'den bağlantı verin. Metinleri `strings.ts`'e taşıyın. Datenschutz metni şunları anlatsın: veri alıcıları (Railway, Shopify CDN), IP adresi ve ürün kimliği sorgusu, cihazda tutulan veriler, izleme yapılmadığı. Bağlantı adresi mağaza sahibinden alınmalı. | 3/3 |

### Orta (43)

| K | Yer | Başlık | Ne oluyor | Düzeltme | Oy |
|---|---|---|---|---|---|
| K-002 | [app.json:7-24](<mobile/app.json:7>) | Uygulama ikonu, uyarlanabilir ikon ve favicon Expo şablon logosu | Telefon ana ekranında ve web sekmesinde Mixo yerine Expo'nun mavi "A" logosu görünüyor. Uyarlanabilir ikonun zemini de şablon rengi (#E6F4FE). Adda "(Demo)" olduğu için Apple 2.2 (demo ya da beta uygulama) kuralına göre ret riski var. | Mixo markalı 1024×1024 ikon, uyarlanabilir ikon parçaları (ön, arka, tek renk), favicon ve açılış görseli üretin. `adaptiveIcon.backgroundColor` değerini marka rengine çekin. Gerçek sipariş akışı gelene kadar dağıtımı TestFlight ve Play iç testiyle sınırlayın. | 3/3 ↓ |
| K-003 | [src/api/shop.ts:105-176](<mobile/src/api/shop.ts:105>) | Yapılandırma süresi (60 sn) dolunca tek bir `/api/config` hatası bütün katalog okumalarını düşürüyor | Ekran 60 saniyeden uzun açıkken bağlantı bir an koparsa, bellekte duran parçalar dahil her okuma hata veriyor. Liste "Daten konnten nicht geladen werden" diyor, arama duruyor. Takılan ağda ekran 15 sn bekliyor. "Erneut versuchen" ile toparlanıyor. | Son başarılı yapılandırmayı saklayın. Süre dolunca arka planda yenileyin ve okuyanları bekletmeyin. Yenileme başarısız olursa eskisiyle devam edin. Yalnızca hiç yapılandırma alınamadıysa hata verin. Aynı yapılandırma nesnesini koruyun ki dizin yeniden kurulmasın. | 3/3 ↓ |
| K-005 | [src/app/(tabs)/kategorien.tsx:21-36](<mobile/src/app/(tabs)/kategorien.tsx:21>) | "Alle Kategorien" son açılan kategorinin alt listesini açıyor | Kategorien → Technik → Start → "Alle Kategorien" yolunda ana liste yerine Technik'in alt listesi açılıyor (cihazda denendi). Sekmeye yeniden dokunmak da 1. seviyeye döndürmüyor. Geri oku ile kurtarılıyor. | Seviyeyi rota parametresine taşıyın (`kategorien?k=…`). Parametresiz bağlantı her zaman 1. seviyeyi açsın. Ya da sekmeden ayrılınca seviyeyi sıfırlayın. | 3/3 ↓ |
| K-006 | [src/app/kategorie/\[key\].tsx:93-117](<mobile/src/app/kategorie/[key].tsx:93>) | "Reduziert" süzgeci hiç görünmüyor; "Aktionen › Alle" görünmez bir süzgeçle boş liste açabiliyor | Dizinde 67 kapsamın hepsinde indirim sayısı 0, bu yüzden çip gizli. Yönetici indirim girerse "Alle" süzgeç açık ama çipsiz bir liste açıyor. İndirimli ürün ilk 3 parçada değilse liste boş kalıyor. Bugün canlı veride indirim olmadığı için görünmüyor. | `showSale`, indirim sayısı sıfırdan büyükse ya da süzgeç zaten açıksa doğru olsun (`suche.tsx` için de). İleride indirim sayısını `overrides` üzerinden hesaplayın ya da "Aktionen"i `home.deals` listesine bağlayın. | 3/3 ↓ |
| K-007 | [src/components/ui.tsx:124-149](<mobile/src/components/ui.tsx:124>) | Hacim ya da ağırlıkla satılan ürünlerde birim fiyat (Grundpreis, PAngV §4) yok | Örneğin "Libre Eau de Parfum 90 ml – 59,98 €" ürününün yanında "666,44 € / 1 l" yazması gerekir. Kartta, ürün sayfasında ve sepette bu bilgi yok. Demo satış yapmadığı için bugün değil, gerçek satışta zorunlu olur. | Storefront'a geçerken `unitPrice` ve `unitPriceMeasurement` alanlarını okuyup fiyatın altına "x € / 1 l" yazın. Demo veride başlıktan tahmin yapmayın, çünkü yanlış değer göstermek gizlemekten kötüdür. Bunu belgeye yayın şartı olarak ekleyin. | 3/3 ↓ |
| K-008 | [src/components/ui.tsx:288-308](<mobile/src/components/ui.tsx:288>) | "inkl. MwSt., zzgl. Versand" notu yalnızca ürün sayfasında var | Karttan doğrudan sepete eklenen üründe KDV ve kargo notu hiç görülmüyor. Sepet ve Kasse toplamı "inkl. MwSt." demiyor. Gerçek satışta PAngV §6 gereği zorunlu. | Liste başlığına ya da kart fiyatının altına kısa bir not ekleyin. Sepet ve Kasse'deki "Gesamt" satırına "inkl. MwSt." yazın. | 3/3 ↓ |
| K-009 | [src/components/ui.tsx:1229-1233](<mobile/src/components/ui.tsx:1229>) | Toast bildirimleri VoiceOver'da hiç, TalkBack'te güvenilir biçimde okunmuyor | "Warenkorb voll", "Nicht verfügbar" ve "Rückgängig" gibi bildirimler ekran okuyucu kullanıcısına ulaşmıyor. Kullanıcı sepete eklemenin başarısız olduğunu öğrenemiyor. | `show()` içinde `AccessibilityInfo.announceForAccessibility` çağırın. Ekran okuyucu açıkken bildirimin süresini uzatın. Android'de aynı metnin iki kez okunmasını önleyin. | 3/3 ↓ |
| K-011 | [docs/mobil-uygulama-2026-11-15.md:103-112](<docs/mobil-uygulama-2026-11-15.md:103>) | Yasal gerekler listesinde BFSG (erişilebilirlik yasası) yok | 28.06.2025'ten beri tüketiciye yönelik e-ticaret uygulamalarında erişilebilirlik ve erişilebilirlik beyanı zorunlu. Mikro işletmeler muaf, ama şirketin büyüklüğü bilinmiyor. Bu bir hukuki görüş değildir. | Listeye BFSG maddesini ekleyin: kapsam kontrolü, erişilebilirlik beyanı, TalkBack, VoiceOver ve %200 yazı boyutu testi. Mağaza sahibinden şirket büyüklüğünü isteyin. Maddeyi avukat teyidi listesine de ekleyin. | 1/1 |
| K-013 | [app.json:6](<mobile/app.json:6>) | Ekran yönü dikeye kilitli (WCAG 1.3.4) | Cihazını yatay sabitleyen kullanıcı (iPad standı, tekerlekli sandalye tutacağı) uygulamayı kullanamıyor. Üstelik tablet desteği açık. | `"orientation": "default"` yapın. Yatayda alt pencereyi (BottomSheet), başlığı, alt çubuğu ve klavyeyi sınayın. | 1/1 |
| K-014 | [app.json:9-22](<mobile/app.json:9>) | Yayın yapılandırması eksik: yer tutucu paket kimliği, sürüm numarası, ihracat beyanı | Paket kimliği `de.example.mixooutletdemo` ve Play'e ilk yüklemeden sonra değiştirilemiyor. `versionCode`, `buildNumber` ve `eas.json` yok. iOS şifreleme beyanı tanımsız. Açılış ekranı koyu, uygulama açık renkli. | Gerçek, ters alan adlı bir kimlik seçin. `ITSAppUsesNonExemptEncryption=false` ekleyin. `eas.json`'da otomatik artan sürüm tanımlayın. Kısa bir ana ekran adı seçin. Açılış ekranı ve ikon zeminini paletten alın. | 1/1 |
| K-022 | [src/api/shop.ts:500-504](<mobile/src/api/shop.ts:500>) | Tek bir daire ya da karo görseli için 500 satırlık parçanın tamamı indiriliyor | Ana sayfa açılırken yalnızca 16 küçük görsel için 16 parça isteniyor: telefonda yaklaşık 1,1 MB JSON çözülüp bellekte tutuluyor (ağda gzip ile yaklaşık 0,32 MB). Kategorien'de Technik'in 2. seviyesi 15 parça istiyor: 1,1 MB JSON (ağda yaklaşık 0,34 MB, başkan ölçtü). Bu istekler liste parçalarıyla aynı kuyrukta bekliyor. | Sunucudaki dizine kapsam → temsilci görsel eşlemi ekleyin (yaklaşık 5 KB). Daireleri ekranda göründükçe yükleyin. İsteklere öncelik verin. | 1/1 |
| K-023 | [src/app/(tabs)/_layout.tsx:68-78](<mobile/src/app/(tabs)/_layout.tsx:68>) | Sekme etiketleri rozet sayısını ve "sekme n/m" bilgisini gizliyor | Sepette 3 ürün varken ekran okuyucu sekmeyi yalnızca "Warenkorb" diye okuyor. Merkliste'deki ürün sayısı da okunmuyor. Bu, kütüphane kodundan çıkarıldı, cihazda doğrulanmadı. | Etiketi sayıyla birlikte üretin ("Warenkorb, 3 Artikel"). Start, Kategorien ve Bereich'te elle verilen etiketi kaldırın. | 1/1 |
| K-025 | [src/app/(tabs)/kategorien.tsx:95](<mobile/src/app/(tabs)/kategorien.tsx:95>) | Kategorien 2. seviyeye geçerken odak yönetimi ve duyuru yok; iOS kaçış hareketi çalışmıyor | Bir satıra basınca liste değişiyor ama ekran okuyucunun odağı belirsiz bir yere atlıyor ve yeni seviyenin adı duyurulmuyor. VoiceOver'daki iki parmakla Z hareketi geri götürmüyor. | Seviye değişince kategori adını `announceForAccessibility` ile duyurun. Kaba `onAccessibilityEscape` ekleyin. Kalıcı çözüm 2. seviyeyi ayrı bir rota yapmak. | 1/1 |
| K-026 | [src/app/(tabs)/warenkorb.tsx:72-77](<mobile/src/app/(tabs)/warenkorb.tsx:72>) | "Rückgängig" 5 saniyede kayboluyor; ekran okuyucuyla erişilemiyor (WCAG 2.2.1) | Ürün silindikten sonra çıkan geri alma bildirimi 5 sn kalıyor ve okuma sırasının en sonunda duruyor. Ekran okuyucu kullanıcısı ona zamanında ulaşamıyor. Ürün yeniden eklenebildiği için kayıp sınırlı. | Ekran okuyucu açıkken eylemli bildirim en az 20 sn kalsın. iOS'ta duyurulsun. Odak geri alma düğmesine taşınsın. | 1/1 |
| K-027 | [src/app/(tabs)/warenkorb.tsx:90-117](<mobile/src/app/(tabs)/warenkorb.tsx:90>) | Sepet satırındaki onay kutusu ve adet düğmeleri hangi ürüne ait olduklarını söylemiyor | Her satırda aynı etiketler okunuyor: "Artikel auswählen", "Weniger", "Mehr". Kullanıcı ürün adını duymadan seçim yapıyor. Görsel ve başlık iki ayrı bağlantı durağı. | Etiketlere ürün adını ekleyin ("Artikel auswählen: <ad>"). Görseldeki bağlantıyı ekran okuyucudan gizleyin. | 1/1 |
| K-029 | [src/app/_layout.tsx:21-34](<mobile/src/app/_layout.tsx:21>) | Açılış ekranı yazı tipleri yüklenmeden kapanıyor | Yayın derlemesinde sıra şöyle: koyu açılış ekranı, beyaz boş kare, sonra uygulama. İkonlar bir kare geç geliyor. Sepet ve Merkliste'nin yüklenmesi de yazı tiplerini bekliyor. Expo Go'da bu görünmüyor. | `SplashScreen.preventAutoHideAsync()` çağırın, yazı tipleri hazır olunca `hide()` yapın. Ionicons yazı tipini önceden yükleyin. `ShopProvider`'ı yazı tipi beklemesinin dışına alın. | 1/1 |
| K-031 | [src/app/_layout.tsx:46-48](<mobile/src/app/_layout.tsx:46>) | Liste, arama ve ürün ekranlarından sepete ulaşılamıyor; "hinzugefügt" bildirimi eylemsiz | Bu ekranlarda sekme çubuğu ve sepet ikonu yok. Ürün → "Mehr aus…" → ürün yolundan sonra sepeti görmek için 3-4 kez geri gitmek gerekiyor. | Başarılı eklemede bildirime "Ansehen" eylemi ekleyin (`ui.tsx:205`). Ya da bu ekranların başlığına rozetli sepet ikonu koyun. | 1/1 |
| K-032 | [src/app/kategorie/\[key\].tsx:111-132](<mobile/src/app/kategorie/[key].tsx:111>) | Dizinde sayısı olmayan bir marka süzgeci sınırsız ve sırayla parça indiriyor | Ürün sayfalarının yaklaşık %38'inde marka bağlantısı bu yola düşüyor. Technik'te 9 ürünlü "Hama" için yaklaşık 55 sıralı istek gidiyor (~27 sn, ağda yaklaşık 1,7 MB). `mixodemo://kategorie/all?marke=zzz` bağlantısı 90 parçanın tamamını indirtebiliyor: 7,3 MB JSON, ağda yaklaşık 2,9 MB (başkan ölçtü). Süzgeç kaldırılsa da indirme sürüyor. | Bu dala bir üst sınır koyun (örneğin AUTOLOAD_MAX_CHUNKS × 3), sınırda "Weitere Produkte laden" gösterin. Dizinde olmayan markayı uygulamayın. Süzgeç değişince döngüyü bir iptal bayrağıyla durdurun (ekrandan çıkınca zaten duruyor: `hooks.ts:91, 93`). | 1/1 |
| K-033 | [src/app/kategorie/\[key\].tsx:167-249](<mobile/src/app/kategorie/[key].tsx:167>) | Kategori ve arama listesi her çizimde yüklü satırların tamamında önbelleksiz iş yapıyor | Marka grubu, kapalı süzgeç penceresinin önizlemesi ve ekranda gösterilecek ürünlerin listesi her çizimde baştan hesaplanıyor. 90 parçalık yüklemede masaüstünde 309 ms işlemci süresi ölçüldü. | Marka listesini `useMemo` ile önbelleğe alın. Önizlemeyi yalnızca pencere açıkken hesaplayın. Satırları artımlı biriktirin. Tek bir `Intl` biçimlendirici kullanın. | 1/1 |
| K-034 | [src/app/kategorie/\[key\].tsx:169-175](<mobile/src/app/kategorie/[key].tsx:169>) | Alt kategori değişince fiyat, "Nur verfügbar", birden çok marka ve sıralama süzgeçleri sessizce düşüyor | Cihazda denendi: Uhren → Filter → "bis 25 €" → Kinderuhren yolunda liste 48,05 €'luk ürünü gösteriyor, fiyat süzgeci kaybolmuş. Uygulama bu yolu kendisi öneriyor ("sıralama için alt kategori seçin"). | Süzgeç durumunu rota parametrelerine taşıyın. `listing.tsx`'te alt kategori seçilmeden önce taslağı uygulayın (`onApply(draft)`). İndirim çipini açık süzgeçte de gösterin. | 1/1 |
| K-035 | [src/app/liste/\[id\].tsx:35-38](<mobile/src/app/liste/[id].tsx:35>) | Merkliste ve listelerden çıkarma geri alınamıyor ve bildirim vermiyor; kayıt fiyatı kayboluyor | Kalbe ya da "×" düğmesine tek dokunuş ürünü sessizce siliyor. Ürün yeniden eklenince kayıt fiyatı ("Gemerkt") bugünkü fiyattan başlıyor. Sepette geri alma var, listelerde yok. | Listeler için tek kayıtlık geri alma ekleyin: kayıt fiyatını, tarihini ve sırayı saklasın, silince "Rückgängig" bildirimi çıksın. | 1/1 |
| K-038 | [src/app/produkt/\[id\].tsx:261-267](<mobile/src/app/produkt/[id].tsx:261>) | Eski veri uyarısında ekran okuyucu yalnızca "Erneut versuchen" okuyor | Görme engelli kullanıcı, fiyatın son bilinen yani güncel olmayan değer olduğunu duymuyor. | `accessibilityLabel` alanına uyarı metni ile "Erneut versuchen"i birlikte yazın. | 1/1 |
| K-039 | [src/app/produkt/\[id\].tsx:298-327](<mobile/src/app/produkt/[id].tsx:298>) | 360-375 dp genişlikteki ekranda alt çubuktaki sepet düğmesinin etiketi kesiliyor | Fiyat alt çubuğa geçince düğme "In den Warenkorb" yerine "In den Warenk…" gösteriyor. Bu hesapla ölçüldü, cihazda görülmedi. | Fiyat görünürken düğmeden ikonu kaldırın. Bu yaklaşık 26 dp yer açar. | 1/1 |
| K-040 | [src/app/produkt/\[id\].tsx:305-313](<mobile/src/app/produkt/[id].tsx:305>) | Ürün sayfasındaki kalp ve kalbe uzun basma (liste seçici), doğrulanmamış eski fiyatı "Gemerkt" fiyatı olarak kaydediyor | Çevrimdışı ya da yavaş ağda kalbe basınca ya da uzun basıp bir listeye ekleyince eski fiyat (49,99 €) kaydediliyor (`toggleFav(p)` satır 306, `picker.open(p)` satır 307 ve 313). Merkliste sonra fiyat hiç düşmemişken "10,00 € günstiger" yazıyor. Kartlarda ve sepete eklemede bu doğru yapılıyor. | Görünüm taze değilse önce `getProductCached` ile ürünü tazeleyin (404 gelirse bildirim gösterin), sonra kalbi ya da liste seçiciyi çalıştırın. Ortak bir "önce tazele" yardımcısı yazın. | 1/1 |
| K-041 | [src/app/produkt/\[id\].tsx:376](<mobile/src/app/produkt/[id].tsx:376>) | Tablette ürün görseli ekranı aşıyor, içerikte genişlik sınırı yok | iPad'de kare görsel dikeyde yaklaşık 800 dp, yatayda 1.160 dp oluyor. Başlık ve fiyat ancak kaydırınca görünüyor. iPad'de yön kilidi de tutmuyor. | Görsel karosuna en fazla 520 dp genişlik verip ortalayın. Sayfa içeriğine en fazla 720 dp genişlik verin. Ya da tablet desteğini kapatma kararı alın. | 1/1 |
| K-045 | [src/app/suche.tsx:373-448](<mobile/src/app/suche.tsx:373>) | Arama durumu Android'de her yüzde adımında okunuyor, iOS'ta hiç okunmuyor | TalkBack arama boyunca yaklaşık 23 kez "Suche läuft … %" okuyor. iOS'ta "Keine Treffer" ve sonuç sayısı hiç okunmuyor. "Mindestens 2 Zeichen" uyarısı iki platformda da sessiz. | Yüzdeyi canlı bölgeden (Android'in kendiliğinden okuduğu alan) çıkarın. Yalnızca durum değişimlerini (başladı, durdu, bitti, sonuç sayısı) iki platformda da duyurun. Kısa giriş uyarısını da duyurun. | 1/1 |
| K-046 | [src/components/Banners.tsx:120](<mobile/src/components/Banners.tsx:120>) | Mercan renkli afişte küçük metinlerin kontrastı 4,5:1'in altında | "KATEGORIE" etiketi 4,05-4,44:1, alt satır 3,69-4,05:1. Bu afiş her zaman en büyük kategoride görünüyor. | Gradyanı #b83a2c ile başlatın. Alt satırı %92 beyaz yapın. | 1/1 |
| K-047 | [src/components/Banners.tsx:138-179](<mobile/src/components/Banners.tsx:138>) | Afiş metinleri sistem yazı boyutuyla birlikte büyümüyor (WCAG 1.4.4) | Sistem yazısı %200 olduğunda 11 px'lik satırlar yaklaşık 12 px'te kalıyor. Başlıkta büyütme kapalı. Kartın yüksekliği büyüyebilir olduğu için kodun gerekçesi tutmuyor. | Büyütme sınırını 1,5-2'ye çıkarın. Büyük ölçekte satır sayısını artırın ve görsel karoyu gizleyin. | 1/1 |
| K-049 | [src/components/home.tsx:96](<mobile/src/components/home.tsx:96>) | Liste başındaki alt kategori daireleri marka ve indirim süzgecini düşürüyor | Seiko süzgeçli listede "Herrenuhren" dairesine dokununca 2.804 ürünlük karışık liste açılıyor. Aynı seçimi süzgeç penceresinden yapınca marka korunuyor. | Dairelere marka ve indirim süzgecini de aktarın (`kategorie/[key].tsx:173`'teki mantıkla aynı). | 1/1 |
| K-050 | [src/components/home.tsx:118](<mobile/src/components/home.tsx:118>) | Kategori dairesi etiketi sabit 30 dp yükseklikte; büyük yazıda ikinci satır kesiliyor | "Alle Kategorien" ve "Bildschirmzubehör" gibi adların alt satırı 1,15 ölçekte kırpılıyor. 1,3 ölçekte cihazda görüldü. | `height: 30` yerine `minHeight: 30` kullanın. | 1/1 |
| K-051 | [src/components/listing.tsx:263-279](<mobile/src/components/listing.tsx:263>) | Marka süzgeci "175 Marken" diyor ama yaklaşık 40 çip gösteriyor | Uhren'de Seiko süzgeçte yok. Arama alanı ya da "tümünü yükle" seçeneği de yok. | Notu "16 von 175 Marken · weitere beim Scrollen" yapın. Ya da marka arama alanı ve tümünü yükleme ekleyin. | 1/1 |
| K-055 | [src/components/ui.tsx:180-182](<mobile/src/components/ui.tsx:180>) | Üstü çizili fiyat ve yüzde rozeti, son 30 günün en düşük fiyatına bakılmadan çiziliyor (PAngV §11) | Bugün veride eski fiyat yok. Ama yönetici ya da Shopify'ın `compare_at_price` alanı eski fiyat yazarsa, rozet referans fiyat kuralına uymadan çıkar. | Rozeti ve üstü çizili fiyatı yalnızca sunucu son 30 günün en düşük fiyatını (ya da UVP etiketini) gönderirse çizin. Bu kuralı tek bir yardımcıda toplayın. | 1/1 |
| K-056 | [src/components/ui.tsx:214-267](<mobile/src/components/ui.tsx:214>) | Kendi listelerindeki kartta "×" düğmesi indirim rozetini ve "Nicht verfügbar" etiketini örtüyor | Üçü de aynı sol üst köşede, bu yüzden indirim yüzdesi okunamıyor. Bu koordinat hesabından çıkarıldı. | "×" düğmesini sağ üste taşıyın. Bu görünümde kalp zaten yok. | 1/1 |
| K-057 | [src/components/ui.tsx:233-296](<mobile/src/components/ui.tsx:233>) | Karttaki kalp, sepet ve × etiketleri ürünü adlandırmıyor; marka iki kez okunabiliyor | 40 kartlık sayfada 40 kez aynı "In den Warenkorb" okunuyor. Başlık markayla başlıyorsa "Casio Casio G-Shock…" gibi tekrar oluyor. | Etiketlere kısa ürün adını ekleyin. Bağlantı etiketini tek bir değişkende `cardTitle` ile üretin. Kalpte etiket ile seçili durumu aynı anda değiştirmeyin, yalnızca birini değiştirin. | 1/1 |
| K-060 | [src/components/ui.tsx:816-836](<mobile/src/components/ui.tsx:816>) | Adet değişince yeni adet okunmuyor; "Weniger" düğmesi sessizce "Entfernen"e dönüşüyor | Adet 2 iken "Weniger"e basan kullanıcı adedi 1'e indiriyor ve düğme duyurusuz olarak "Entfernen" oluyor. İkinci basış satırı siliyor. | Adet değişince yeni adedi ekran okuyucuya duyurun (Android'de adet metnini canlı bölge yapın, iOS'ta `announceForAccessibility` çağırın). Ya da adet seçiciyi tek bir "ayarlanabilir" (adjustable) öğeye çevirin. | 1/1 |
| K-061 | [src/components/ui.tsx:878](<mobile/src/components/ui.tsx:878>) | Aramayı açan kutunun rolü "search", bu yüzden yazılabilir alan gibi okunuyor | TalkBack "Bearbeitungsfeld" (düzenleme alanı) diyor. Kullanıcı yazmayı bekliyor ama dokununca başka bir ekran açılıyor. | `accessibilityRole="button"` yapın. | 1/1 |
| K-063 | [src/components/ui.tsx:1322-1324](<mobile/src/components/ui.tsx:1322>) | Seçilmemiş radyo düğmesi ve onay halkasının kenar kontrastı 1,33:1 (en az 3:1 olmalı) | Sortieren, Unterkategorie, Verfügbarkeit ve liste seçicideki halkalar zor görülüyor. Onay kutusunun kenarı ise 5,66:1, yani tutarsız. | Radyo ve onay halkasının kenarını `colors.muted` yapın. | 1/1 |
| K-065 | [src/hooks.ts:317-341](<mobile/src/hooks.ts:317>) | Güncel fiyatları getiren kod, listedeki ürünler değişince daha önce öğrendiği bütün fiyatları unutuyor | Sepetten bir satır silinince, yeni istek dönene kadar sunucuda olmayan ürün seçili ve toplama dahil görünüyor. Merkliste'den bir öğe çıkarınca bütün kartlar soluklaşıyor. 60 sn'lik önbellek içinde bu bir iki kare sürüyor, sonrasında ağ süresi kadar. | Önceki sonucu koruyun ve yalnızca yeni ürünleri isteyin. Ya da ürün → fiyat eşlemesini tüm uygulama için tek bir yerde tutun. | 1/1 |
| K-066 | [src/hooks.ts:317-338](<mobile/src/hooks.ts:317>) | Güncel fiyat yalnızca listedeki ürünler değişince isteniyor; açık sekmelerde yenilenmiyor, hatadan sonra tekrar denenmiyor | Çevrimdışı açılan sepet, bağlantı geri gelse de "geschätzt" (tahmini) kalıyor. 4 saat önceki fiyat "Gesamt" olarak görünüyor. Kasse ayrıca yüklendiği için farklı bir toplam gösterebiliyor. | Fiyat getiren koda (kanca) yenileme işlevi ve başarısız ürün listesi ekleyin. Ekran öne gelince ya da uygulama açılınca veri eskiyse yenileyin. Sepete "Preise aktualisieren" eylemi koyun. | 1/1 |
| K-067 | [src/hooks.ts:318-336](<mobile/src/hooks.ts:318>) | Güncel fiyatlar ekran sırasıyla değil alfabetik sırayla isteniyor; aynı fiyat kodu liste ekranlarında iki kez çalışıyor | 200 ürünlük Merkliste yaklaşık 50 turda, ~14 sn'de doğrulanıyor. İlk ekrandaki kartlar en sona kalabiliyor. Gelen her yanıt bütün ızgarayı yeniden çiziyor. | İstek sırasını ekran sırasıyla kurun ve görünen ürünleri öne alın. Güncellemeleri toplu yazın. Ekranlardaki ikinci fiyat kodunu kaldırın. | 1/1 |
| K-070 | [src/store/shopStore.tsx:264-268](<mobile/src/store/shopStore.tsx:264>) | Liste 200 ürün sınırına ulaşınca kalp ve liste seçici sessizce hiçbir şey yapmıyor | Dolu listede kalbe basınca kalp boş kalıyor ve hiçbir mesaj çıkmıyor. Kullanıcı ürünün eklendiğini sanabilir. Sepette bunun için "Warenkorb voll" mesajı var. | Ekleme işlevi "eklendi", "çıkarıldı" ya da "dolu" sonucunu döndürsün. Dolu durumda "Liste voll (max. 200 Produkte)" bildirimi gösterin. | 1/1 |
| K-072 | [src/store/shopStore.tsx:468-480](<mobile/src/store/shopStore.tsx:468>) | "Daten löschen" bozuk kayıt yedeğini silmiyor; silme başarısız olsa da "Daten gelöscht" deniyor | Okunamayan eski kayıt, sepet, listeler ve arama geçmişiyle birlikte `mixo.v2.corrupt` anahtarında kalıyor. Silme hatası sessizce yutuluyor. | Silinecek anahtarlara `CORRUPT_KEY`'i ekleyin. `clearAllData` başarılı olup olmadığını döndürsün. Bildirim yalnızca başarılı silmede gösterilsin. | 1/1 |
| K-078 | [src/strings.ts:195](<mobile/src/strings.ts:195>) | Kasse "es werden keine Daten gesendet" diyor, ama sepet içeriği ürün kimliği olarak sunucuya gidiyor | Güncel fiyatı öğrenmek için sepetteki ve listelerdeki her ürün sunucuya soruluyor. Metin bunu dışlıyor. Bu durum mağazaların gizlilik formlarında da beyan edilmeli. | Metni şöyle değiştirin: "keine Bestell-, Zahlungs- oder persönlichen Daten … nur für aktuelle Preise ruft die App Produktdaten ab". `aboutDemo3` metnini ve `shopStore`'daki yorumu da buna göre düzeltin. | 1/1 |

### Düşük (151)

| K | Yer | Başlık | Ne oluyor | Düzeltme | Oy |
|---|---|---|---|---|---|
| K-012 | [README.md:24](<mobile/README.md:24>) | "Storefront geçişinde yalnız `shop.ts` değişir" iddiası yanlış | Ekranlar kataloğu doğrudan "kaçıncı parça" diye istiyor: bu düzen `hooks.ts`, `ContextRail`, ürün ve kategori ekranları, `filters.ts` ve `suche.tsx` gibi üst katmanlara sızmış. Storefront'ta parça yok, sayfalama ve arama sunucuda yapılıyor. Bu yüzden geçiş için yapılacak iş tahmini yanlış çıkar. | README 24, `config.ts` 2-3, `shop.ts` 7 ve belge 60/83'ü düzeltip etkilenecek dosyaları listeleyin. Port soyutlamasını geçiş başlayınca yapın. | 1/1 ↓ |
| K-015 | [app.json:13-22](<mobile/app.json:13>) | Android'de şablondan gelen gereksiz izinler engellenmemiş | Expo şablonu `SYSTEM_ALERT_WINDOW`, `VIBRATE` ve depolama izinlerini ekliyor. Uygulama bunların hiçbirini kullanmıyor ama Play listesinde görünüyorlar. Prebuild çalıştırılmadı, bu şablondan çıkarıldı. | `blockedPermissions` listesine bu dört izni ekleyin. Derlemeden sonra birleşmiş manifesti kontrol edin. | 1/1 ↓ |
| K-016 | [src/api/shop.ts:67-78](<mobile/src/api/shop.ts:67>) | Okuma isteklerinde otomatik yeniden deneme yok | Tek bir kopukluk aramayı durduruyor ("Fortsetzen" ile sürüyor). Açılıştaki kısa bir kopukluk, ana sayfadaki daire görsellerini uygulama yeniden başlatılana kadar boş bırakıyor. Başkanın 90 parçalık ölçümünde de 1 istek bağlantı hatası verdi, ikinci denemede geldi. | Ağ hatası, 5xx ve zaman aşımında 2 kez yeniden deneyin. Daire görselini getiren kod hatayı ayrı tutup tekrar denesin. | 1/1 ↓ |
| K-017 | [src/api/shop.ts:85-91](<mobile/src/api/shop.ts:85>) | Görsel adresi doğrulanmıyor | "http" ile başlayan her adres yükleniyor. Yönetici üçüncü taraf bir adres girerse kullanıcının IP adresi gizlilik metninde adı geçmeyen bir siteye gider. "httpfoo.jpg" gibi bir ad da yanlış sınıflanır. | Yalnızca https ve yalnızca demo sunucusu ile `cdn.shopify.com` adreslerine izin verin. Sunucudaki doğrulamayı da aynı listeye daraltın. | 1/1 ↓ |
| K-018 | [src/api/shop.ts:194-285](<mobile/src/api/shop.ts:194>) | Parça önbelleği sınırsız büyüyor; her parça okuması 500 satırı yeniden yazıyor | Bir arama sonrası 25-50 MB kalıcı bellek kullanılıyor (masaüstünde ölçüldü). Tam bir tarama, ürün anlık görüntülerinin önbelleğini boşaltıyor. | Parça önbelleğine yaklaşık 40 parçalık sınır, ürün önbelleğine boyut sınırı koyun. Anlık görüntüyü yalnızca parça ilk kez çözülürken yazın. | 1/1 ↓ |
| K-019 | [src/api/shop.ts:235-247](<mobile/src/api/shop.ts:235>) | Sunucudan gelen JSON doğrulanmıyor | Fiyatı olmayan bir satır 0,00 € olarak görünüp sepete eklenebilir. Parça satırında başlık alanı hiç yoksa ya da metin değilse (`shop.ts:211`'de `r[1] as string`), kart başlığı hazırlanırken uygulama çöker. Boş başlık sorun değil; ürün okumasında eksik başlık zaten boş metne çevriliyor (`shop.ts:237`). Bugünkü veri temiz, ama Storefront'a geçişte bu durum tetiklenebilir. | Fiyatı sıfırdan büyük ve sonlu olmayan ya da kimliği olmayan satırı atın. Metin alanlarını dizgeye çevirin. Yönetici değişikliklerini tür denetimiyle uygulayın. | 1/1 ↓ |
| K-020 | [src/api/shop.ts:344-360](<mobile/src/api/shop.ts:344>) | Arama her seferinde bütün ürünleri yeniden normalize ediyor; ø/æ/œ/ł harfleri sadeleşmiyor; ekrandan çıkınca tarama sürüyor | "Bjorn" yazınca "Bjørn" bulunmuyor. Tarama, ürün sayfasıyla aynı iş parçacığında yarışıyor. | Normalleştirmeye ø→o, æ→ae ve benzeri dönüşümleri ekleyin. Her ürünü bir kez normalize edin. Arama ekranı arka plana geçince taramayı durdurun. | 1/1 ↓ |
| K-021 | [src/api/shop.ts:458-466](<mobile/src/api/shop.ts:458>) | "Meintest du" eşiği kısa sorgularda alakasız öneriler üretiyor | 3 harfli "usb" için "uhr" gibi öneriler çıkıyor. Öneri yalnızca sonuç boşken görünüyor. | 5 harf ve altında en fazla 1 harf farkına izin verin. | 1/1 ↓ |
| K-024 | [src/app/(tabs)/index.tsx:25-26](<mobile/src/app/(tabs)/index.tsx:25>) | Kargo eşiği sunucudan gelmese de başlıkta "ab 39 €" yazılıyor | Sunucu alanı eksik ya da bozuksa yedek değer olan 39 €, doğrulanmış bir bilgi gibi gösteriliyor. Kod yorumu ise "iddia yazılmaz" diyor. | Eşik alanını boş olabilen bir sayı yapın. "Sunucudan geldi" bilgisini eşiğin gerçekten gelip gelmediğine bağlayın. | 1/1 ↓ |
| K-028 | [src/app/(tabs)/warenkorb.tsx:186](<mobile/src/app/(tabs)/warenkorb.tsx:186>) | 5,50 € kargo ücreti sabit bir varsayım, ama "Versand" kesinmiş gibi yazılıyor | Sunucu yalnızca eşiği gönderiyor, ücret uygulamada sabit duruyor. Eşik gelince "Annahme" (varsayım) eki kalkıyor. Mantık iki ekranda kopyalanmış. | Ücret sunucudan gelene kadar "Versand (Annahme)" yazın. Hesabı ortak bir yardımcıda toplayın. | 1/1 ↓ |
| K-030 | [src/app/_layout.tsx:21-59](<mobile/src/app/_layout.tsx:21>) | Hiçbir rotada hata sınırı (ErrorBoundary) yok: tek bir çizim hatası bütün uygulamayı düşürüyor | `src/` altında hiçbir rota `ErrorBoundary` dışa aktarmıyor. expo-router hata yakalayıcıyı yalnız rota bunu dışa aktarırsa kuruyor (`node_modules/expo-router/build/useScreens.js:206-216`); kendiliğinden bir hata ekranı yok. Bozuk bir sunucu alanı ya da tek bir bileşen hatası, yayın derlemesinde boş ekran ya da uygulamanın kapanması demek. Yeniden deneme yolu yok. Şüpheci önemi, varsayılan bir hata ekranı olduğu varsayımıyla indirdi; kod bu varsayımı doğrulamıyor. Derece oylamadaki gibi bırakıldı, ama düzeltme ucuz olduğu için P0'a alındı. | Kök `_layout.tsx`'ten Almanca bir `ErrorBoundary` dışa aktarın ("Erneut versuchen" ve "Zur Startseite" düğmeleriyle). | 1/1 ↓ |
| K-036 | [src/app/produkt/\[id\].tsx:35-99](<mobile/src/app/produkt/[id].tsx:35>) | Marka rafı için 8 parçaya kadar indiriliyor | Ürün sayfalarının yaklaşık %17'sinde, kategori başına bir kez 8 parçaya kadar isteniyor: 8 parça 560-660 KB JSON, ağda gzip ile yaklaşık 115-260 KB (Uhren ve Technik için başkan ölçtü). Ekrandan çıkınca indirme iptal edilmiyor. Bu sayfaların çeyreğinde raf yine de çizilmiyor. | Döngüyü 4 parçayla sınırlayın ve iptal bayrağı ekleyin. Kalıcı çözüm sunucuda marka başına bir uç. | 1/1 ↓ |
| K-037 | [src/app/produkt/\[id\].tsx:254-272](<mobile/src/app/produkt/[id].tsx:254>) | Ürün sayfası aynı anda "zzgl. Versand" ve "Kostenloser Versand" yazıyor | Eşiğin üstündeki üründe iki satır birbiriyle çelişiyor. | Kargo bedava olduğunda "inkl. MwSt., versandkostenfrei" yazın. | 1/1 ↓ |
| K-042 | [src/app/suche.tsx:181-184](<mobile/src/app/suche.tsx:181>) | `mixodemo://suche?q=…` bağlantısı aramayı kendiliğinden başlatıyor ve sınırsız uzunlukta geçmişe yazıyor | Dışarıdan gelen bir bağlantının metni "Letzte Suchen" kapsülünde kalıcı olarak görünür. Tüm katalog taraması da kendiliğinden başlar. | Arama metnine yaklaşık 80 karakterlik sınır koyun. Bağlantıdan gelen metni yalnızca arama kutusuna yazın, geçmişe yalnızca elle gönderilen aramaları ekleyin. | 1/1 ↓ |
| K-044 | [src/app/suche.tsx:323](<mobile/src/app/suche.tsx:323>) | Aramayı duraklatan düğmenin adı "Abbrechen" (iptal) | Basınca sonuçlar yerinde kalıyor ve "Fortsetzen" çıkıyor. "İptal" sözcüğü yanıltıcı. | Yeni `searchStop: "Anhalten"` anahtarını kullanın. | 1/1 ↓ |
| K-048 | [src/components/ContextRail.tsx:33-43](<mobile/src/components/ContextRail.tsx:33>) | Sepetteki öneri şeridi yüklenirken başka bir şeritle yer değiştiriyor | Önce "Zuletzt angesehen" görünüyor, sonra "Mehr aus …" geliyor. Arada gereksiz fiyat istekleri gidiyor. | Yükleme sürerken yer tutucu gösterin. Hata olursa "Zuletzt angesehen" şeridine dönün. | 1/1 ↓ |
| K-052 | [src/components/ui.tsx:23-31](<mobile/src/components/ui.tsx:23>) | `ui.tsx` 1.383 satır ve temel parçalar veri katmanını içe aktarıyor | Bakım ve test zorlaşıyor, kullanılmayan parçalar fark edilmiyor. | Ölü parçaları silin. Veriye ihtiyaç duymayan temel parçaları `primitives.tsx`'e taşıyın. | 1/1 ↓ |
| K-053 | [src/components/ui.tsx:129-134](<mobile/src/components/ui.tsx:129>) | Web'de eski fiyat "statt" ile okunmuyor | Web ekran okuyucusu iki ayrı fiyat okuyor. Yalnızca web önizlemesinde geçerli. | Web'de tam cümleyi görünmez metin olarak ekleyin, görsel fiyatı ekran okuyucudan gizleyin. | 1/1 ↓ |
| K-054 | [src/components/ui.tsx:136-141](<mobile/src/components/ui.tsx:136>) | Dar kartta ve web'de uzun fiyatlar kesilebiliyor | Web'de "1.134,00 €" gibi tutarlar 390 dp genişlikte kesiliyor. Uygulamada normal telefonlarda sığıyor. | Yazı boyutunu genişlik tablosundan seçin. Şerit kartının en küçük genişliğini yaklaşık 140 dp yapın. | 1/1 ↓ |
| K-058 | [src/components/ui.tsx:271-293](<mobile/src/components/ui.tsx:271>) | Doğrulanmamış kartta iki hızlı dokunuş işlemi iki kez çalıştırıyor | Kalpte ürün önce ekleniyor sonra çıkarılıyor, sonuçta hiçbir şey değişmiyor. Sepette adet 2 oluyor. Yavaş ağda bekleme sırasında hiçbir geri bildirim yok. | Bekleyen bir işlem varken ikinci dokunuşu yok sayın. Beklerken düğmeyi soluk ya da dolu gösterin. Hata yakalama ekleyin. | 1/1 ↓ |
| K-059 | [src/components/ui.tsx:563-1124](<mobile/src/components/ui.tsx:563>) | Büyük yazıda düğme etiketleri ve başlıklar üç noktayla kesiliyor | "Abbrech…" ya da "1.234 Ergebnisse anz…" gibi kesilmeler oluyor (tahmini hesap). Ekran okuyucu tam etiketi okuyor. | Yazı ölçeği 1,2'yi geçince diyalog düğmelerini alt alta dizin. Düğmelere 2 satıra izin verin. | 1/1 ↓ |
| K-062 | [src/components/ui.tsx:1187-1230](<mobile/src/components/ui.tsx:1187>) | Bildirim konumu her ekranda sekme çubuğu varmış gibi hesaplanıyor | Kategorie ve Suche ekranlarında bildirim gereksiz yere yaklaşık 56 dp yukarıda çıkıp kart başlıklarını örtüyor. Bazı sayılar iki yerde ayrı ayrı yazılmış ve yalnız elle eşit tutuluyor: sekme çubuğu yüksekliği bildirim kodunda 56, sekme düzeninde 58; son arama sayısı (10, `suche.tsx:102`) ve en büyük adet (99, `ui.tsx:808`) kayıttaki sınırlardan (`LIMITS`) okunmuyor, ayrıca yazılmış. | Varsayılan konumu 0 yapın. Sekme ekranları ve alt çubuk kendi yüksekliğini bildirsin. Bu sayıları tek yerden (`LIMITS`) alın. | 1/1 ↓ |
| K-064 | [src/config.ts:7](<mobile/src/config.ts:7>) | `export:web` çıktısı tarayıcıda veri yükleyemiyor (CORS) | Bu çıktı yalnızca derleme kontrolü için. README CORS kısıtını zaten anlatıyor. | README:19'a bir not ekleyin. Web'de barındırma gerekirse aynı kökende çalışan bir okuma vekili kullanın. | 1/1 ↓ |
| K-068 | [src/hooks.ts:384-414](<mobile/src/hooks.ts:384>) | Sepet toplamı mantığı testsiz ve bulunduğu yerde test edilemiyor | Toplam hesabı bozulursa hiçbir test yakalamaz. Bugünkü hesap doğru. | Güncel fiyatı kayıtlı ürünle birleştiren kodu ve toplam hesabını `src/pricing.ts`'e taşıyıp test yazın. | 1/1 ↓ |
| K-069 | [src/store/shopStore.tsx:189-258](<mobile/src/store/shopStore.tsx:189>) | Kayıt mantığı (taşıma, yedek, sınırlar, silme) testsiz | Bu mantık bozulursa kullanıcının sepeti ve listeleri sessizce silinebilir, ve hiçbir test bunu yakalamaz. Bugünkü mantık doğru. | Saf işlevleri `persist.ts`'e taşıyın. Depolamayı parametre olarak alacak biçimde yazıp test edin. | 1/1 ↓ |
| K-071 | [src/store/shopStore.tsx:312-331](<mobile/src/store/shopStore.tsx:312>) | Bütün durum tek bir anahtarda tutuluyor, her değişiklikte tamamı yazılıyor | Her ürün açılışında kaydın tamamı yeniden yazılıyor. Açılışta da gereksiz bir yazma oluyor. Yazma hatası sessiz kalıyor. Sınırlarda kayıt yaklaşık 1,3 MB. | Açılıştaki ilk yazmayı atlayın. Yazma hatasını kullanıcıya bir kez gösterin. Son bakılan ürün yazmasını biraz geciktirin. | 1/1 ↓ |
| K-073 | [src/store/shopStore.tsx:482-501](<mobile/src/store/shopStore.tsx:482>) | Her kayıt değişikliği bütün kartları yeniden çiziyor | Gereksiz çizimler oluyor. Süresi ölçülmedi. | Favori listesini ve kimlik kümesini önbelleğe alın. Kartları `React.memo` ile sarın. `lastRemoved`'ı ayrı tutun. | 1/1 ↓ |
| K-074 | [src/strings.ts:39-71](<mobile/src/strings.ts:39>) | İndirimli ürün listesi üç farklı adla anılıyor: "Aktionen", "Angebote", "Reduziert" | Aynı hedefe giden üç ayrı ad var, bu tutarsız. | Tek bir ad seçin. | 1/1 ↓ |
| K-075 | [src/strings.ts:120](<mobile/src/strings.ts:120>) (ayrıca 24, 172, 192, 210) | Mühendislik notu gibi metinler: "Annahme", "Server", "Schwelle", "Datenübernahme" | Bu sözcükler normal bir alıcıya teknik ve anlamsız geliyor. Çoğu yalnızca bağlantı kopukken görünüyor. | "Versand (geschätzt)", "voraussichtlich", "Stand der Demodaten" gibi sade ifadeler kullanın. | 1/1 ↓ |
| K-076 | [src/strings.ts:143-151](<mobile/src/strings.ts:143>) | "Zu Liste hinzufügen" ve "Aus Liste entfernen" dilbilgisi hatası | Artikel eksik. Bu metin hem başlıkta hem ekran okuyucu etiketinde kullanılıyor. | "Zur Liste hinzufügen" ve "Aus der Liste entfernen" yazın. | 1/1 ↓ |
| K-077 | [src/strings.ts:192](<mobile/src/strings.ts:192>) (ayrıca 45, 102, 103, 121, 124, 125, 202) | Ücretsiz kargo dört farklı biçimde yazılıyor | "Gratisversand", "Kostenloser Versand", "kostenlos" ve "gratis ab" bir arada kullanılıyor. `freeShipLabel` (202) hiç kullanılmıyor. | Tek bir terim seçin ve kullanılmayan anahtarı silin. | 1/1 ↓ |
| K-079 | [src/strings.ts:344](<mobile/src/strings.ts:344>) | "Beliebt" başlığı gerçek satıştan değil, demo vitrin trafiğinden geliyor | Birkaç kişi web demosunda aynı 6 ürüne bakarsa bu ürünler "Beliebt" diye gösterilir. Bu, `TASARIM.md`'deki yasakla çelişiyor. Bugün canlı demo "curated" veriyle çalışıyor. | Her iki durumda da nötr bir başlık kullanın. "Beliebt"i gerçek satış verisi bağlanınca açın. | 1/1 ↓ |
| K-080 | [tools/dev-proxy.mjs:6-12](<mobile/tools/dev-proxy.mjs:6>) | Geliştirme vekilinin izin listesi `img/../` ile aşılabiliyor | `/img/../api/admin/orders` isteği hedef sunucuya ulaşıyor. Bu yalnızca bir geliştirme aracı ve çerez iletmiyor. | Adresi önce normalleştirin, sonra izin listesini sınayın. `..` içeren adresleri reddedin. | 1/1 ↓ |
| K-081 | [LICENSE:3](<mobile/LICENSE:3>) | LICENSE dosyası Expo şablonundan kalmış (MIT, 650 Industries) | Kapalı bir müşteri uygulaması için yanıltıcı bir lisans beyanı. | Dosyayı silin ya da sahibin kendi beyanını yazın. `package.json`'a `"license": "UNLICENSED"` ekleyin. | 1/1 |
| K-082 | [TASARIM.md:98-110](<mobile/TASARIM.md:98>) | `TASARIM.md` ve README koddan sapmış | Belgedeki örnek yolu yok. Anlatılan bazı öğeler kodda farklı. Kodda ham renk kodları var. | Belgeleri koda göre güncelleyin. Renkleri `theme.ts`'e taşıyın. | 1/1 |
| K-083 | [app.json:8](<mobile/app.json:8>) | "Açık tema" ayarı Android'de `expo-system-ui` olmadan uygulanmıyor | Karanlık modda alt sistem çubuğunun kontrastı tutarsız olabilir. Cihazda görülmedi. | `expo-system-ui` paketini kurun. | 1/1 |
| K-084 | [app.json:13-22](<mobile/app.json:13>) | Android otomatik yedeklemesi açık; "nur auf diesem Gerät" metni tam doğru değil | Sepet, listeler ve arama geçmişi Google Drive yedeğine giriyor. | `allowBackup: false` yapın ya da metni düzeltin. | 1/1 |
| K-085 | [app.json:23-27](<mobile/app.json:23>) | Web çıktısında sayfa dili İngilizce (`lang="en"`) | Web ekran okuyucusu Almanca metni İngilizce sesle okuyor. | `web.lang: "de"` ekleyin. | 1/1 |
| K-086 | [app.json:31-36](<mobile/app.json:31>) | Açılış ekranında görsel yok ve rengi marka paletinde değil | Logosuz, düz #16181d renkli bir ekran çıkıyor. iOS'ta durum çubuğu koyu zemin üstünde koyu kalabiliyor. | Açılış ekranına görsel ve genişlik tanımlayın, rengi paletten seçin. | 1/1 |
| K-087 | [package.json:34-43](<mobile/package.json:34>) | Test ve lint betiklerinin kapsamı dar, Node sürümü tanımlı değil | Yeni bir test dosyası eklenirse sessizce çalışmaz. `tools/` lint dışında kalıyor. eslint sürüm aralığı yanlış. | `engines` alanı ekleyin, testleri glob ile bulun, eslint'i `^9.22` yapın, tümünü çalıştıran bir `check` betiği yazın. | 1/1 |
| K-089 | [src/api/shop.ts:182-191](<mobile/src/api/shop.ts:182>) | Eşzamanlı istek sınırı bir yarış durumunda 1 aşılabiliyor | 4 yerine 5 istek aynı anda gidebiliyor. Etkisi hafif. | Boşalan yuvayı doğrudan bekleyen isteğe devredin. | 1/1 |
| K-090 | [src/api/shop.ts:207](<mobile/src/api/shop.ts:207>) | Katalogda bozuk Almanca başlıklar ekrana olduğu gibi çıkıyor | "Illy thiopien" ve "Milchaufschumer wei" gibi başlıklar var. Örneklenen 1.148 ürünün 2'sinde görüldü. | Kaynak veriyi düzeltin. Acilse bu başlıkları sunucuda `overrides` ile düzeltin. | 1/1 |
| K-091 | [src/api/shop.ts:288-289](<mobile/src/api/shop.ts:288>) | `getProduct` üstünde iki ayrı açıklama bloğu var | "404 gelirse null döner" açıklaması editörün ipucunda görünmüyor. | İki bloğu birleştirin. | 1/1 |
| K-093 | [src/api/shop.ts:354](<mobile/src/api/shop.ts:354>) | Model kodu aramasında alakasız sonuç çıkıyor | "BN0500" araması bir Guess kolyeyi de buluyor. | Rakam içeren arama sözcüklerinde eşleşmeyi sözcük başından başlatın. | 1/1 |
| K-094 | [src/api/shop.ts:406-420](<mobile/src/api/shop.ts:406>) | "seiko" yazınca yalnızca "Seiko Precision" markası öneriliyor | Marka önerileri yalnızca her kategorinin ilk 16 markasından geliyor. Arama 22 sonuç veriyor ve bunların çoğu Seiko saat. | Kısa vadede "Nach … suchen" satırına güvenin. Kalıcı çözüm dizine tam marka listesini eklemek. | 1/1 |
| K-095 | [src/api/shop.ts:425-445](<mobile/src/api/shop.ts:425>) | Ürünü olmayan (0 ürünlü) kategori önerilebiliyor | Bugünkü veride böyle bir kategori yok. Yönetici bir kategoriyi tamamen gizlerse "0 Produkte" önerisi çıkar. | Önerileri ürün sayısı sıfırdan büyük olanlarla sınırlayın. | 1/1 |
| K-096 | [src/app/(tabs)/_layout.tsx:68-78](<mobile/src/app/(tabs)/_layout.tsx:68>) | Sekme ikonları her kayıt değişikliğinde baştan kuruluyor | Görünür bir hata yok, küçük bir performans maliyeti var. | İkonları modül düzeyinde sabit yapın. Rozetleri yalnızca sepet ve Merkliste sayısını okuyan küçük bir kodla besleyin. | 1/1 |
| K-098 | [src/app/(tabs)/bereich.tsx:66-69](<mobile/src/app/(tabs)/bereich.tsx:66>) | Son bakılanlar şeridinin eşiği iki yerde tekrarlanıyor ve boşluk elle yazılmış | Tek ürünlük geçmişe buradan ulaşılamıyor. Eşiğin gerekçesi yazılmamış. | Eşiği tek bir değişkene alın ve gerekçesini yorumlayın. Boşluk için `space.m` kullanın. Eşik 2 kalsın. | 1/1 |
| K-100 | [src/app/(tabs)/index.tsx:52](<mobile/src/app/(tabs)/index.tsx:52>) | Günlük ürün karışımı gün değişince yenilenmiyor | Uygulama gece yarısını açık geçirirse sıra ertesi güne geçmiyor. | Yorumu "her açılışta" diye düzeltin ya da gün değişimini izleyin. | 1/1 |
| K-101 | [src/app/(tabs)/index.tsx:96-110](<mobile/src/app/(tabs)/index.tsx:96>) | Ana sayfa başlığı listeden sonra çiziliyor; ekran okuyucu onu en sona bırakabilir | Bu bir olasılık, cihazda doğrulanmadı. | Kodda başlığı listeden önceye alın. | 1/1 |
| K-102 | [src/app/(tabs)/index.tsx:96-107](<mobile/src/app/(tabs)/index.tsx:96>) | "Start" sekmesine tekrar dokunmak sayfayı başa sarmıyor | Uzun sayfanın en altındayken sekmeye dokunmak hiçbir şey yapmıyor. | `useScrollToTop` kullanın. | 1/1 |
| K-103 | [src/app/(tabs)/kategorien.tsx:21-34](<mobile/src/app/(tabs)/kategorien.tsx:21>) | Kategorien'in 2. seviyesi yerel durumda tutuluyor; web'de tarayıcının geri tuşu 1. seviyeye dönmüyor | Sayfa yenilenince 2. seviye kayboluyor. | Seviyeyi sorgu parametresine taşıyın. | 1/1 |
| K-104 | [src/app/(tabs)/kategorien.tsx:41-42](<mobile/src/app/(tabs)/kategorien.tsx:41>) | 2. seviyede ürün sayısı birimsiz yazılıyor; kullanılmayan bir alan var | "6.545" sayısının neyi gösterdiği belli değil. | Sayıyı "n Produkte" biçiminde alt yazı olarak verin. | 1/1 |
| K-105 | [src/app/(tabs)/warenkorb.tsx:62](<mobile/src/app/(tabs)/warenkorb.tsx:62>) | Yükleme göstergesinin erişilebilir etiketi yok | Ekran okuyucu yüklendiğini duymuyor. Sorun birçok ekranda var. | Yükleme bileşenine ilerleme rolü ve "Wird geladen" etiketi verin. | 1/1 |
| K-106 | [src/app/(tabs)/warenkorb.tsx:80-81](<mobile/src/app/(tabs)/warenkorb.tsx:80>) | Bir yorum kodla uyuşmuyor ve küçük ölü kod var | Yorumda "son eklenen" yazıyor, kod ise "dizideki son satırı" alıyor. Ayrıca hiç çalışmayan bir koşul dalı var. | Yorumu düzeltin, ölü dalları silin. | 1/1 |
| K-107 | [src/app/(tabs)/warenkorb.tsx:91-102](<mobile/src/app/(tabs)/warenkorb.tsx:91>) | Sepet satırında aynı ürüne iki bağlantı var; ürün adı bağlantısı küçük | Ekran okuyucu aynı ürünü iki kez okuyor. | Görseldeki bağlantıyı ekran okuyucudan gizleyin. Ad bağlantısının dokunma alanını büyütün (`hitSlop`). | 1/1 |
| K-108 | [src/app/(tabs)/warenkorb.tsx:141-146](<mobile/src/app/(tabs)/warenkorb.tsx:141>) | Kargo varsayım kartına dokunup yeniden denenebiliyor, ama bunu belirten hiçbir şey yok | Kullanıcı yeniden deneme imkânını fark etmiyor. | Bir ipucu metni ve yenile ikonu ekleyin. | 1/1 |
| K-109 | [src/app/(tabs)/warenkorb.tsx:193-207](<mobile/src/app/(tabs)/warenkorb.tsx:193>) | Toplam çubuğunun etiketi seçim bilgisini gizliyor | "Nichts ausgewählt" ve "n von m" bilgileri ekran okuyucuda okunmuyor. | Etikete seçim metnini ekleyin ve bir ipucu verin. | 1/1 |
| K-110 | [src/app/(tabs)/warenkorb.tsx:220](<mobile/src/app/(tabs)/warenkorb.tsx:220>) | Sepet boşaltılınca hâlâ açık duran "Rückgängig" etkisiz kalıyor | Kullanıcı geri aldığını sanıyor ama hiçbir şey olmuyor. | Sepeti boşaltırken bildirimi de kapatın (`toast.hide()`). | 1/1 |
| K-111 | [src/app/_layout.tsx:38-54](<mobile/src/app/_layout.tsx:38>) | "Sayfa bulunamadı" ekranı yok ve site haritası (`_sitemap`) yayında açık | Bilinmeyen bir bağlantı İngilizce bir ekran açıyor. Bu ekran gelen adresi metin olarak gösteriyor ve tüm rotaları listeleyen bir bağlantı sunuyor. | Site haritasını kapatın (`sitemap: false`). Gelen adresi göstermeyen Almanca bir `+not-found.tsx` ekleyin. | 1/1 |
| K-112 | [src/app/kasse.tsx:31-78](<mobile/src/app/kasse.tsx:31>) | Derin bağlantıyla açılınca "Zurück zum Warenkorb" Start sayfasına dönüyor | Bu yalnızca `mixodemo://kasse` bağlantısıyla açılınca oluyor. | Geri gidilecek ekran varsa geri gidin, yoksa sepete yönlendirin. | 1/1 |
| K-113 | [src/app/kasse.tsx:48](<mobile/src/app/kasse.tsx:48>) | Ayırıcı çizgi 16 dp kayık | Çizgi metnin başladığı yerle hizalı değil. | Girintiyi `space.l + 56 + space.m` yapın. | 1/1 |
| K-114 | [src/app/kasse.tsx:55](<mobile/src/app/kasse.tsx:55>) | Kasse satırlarında marka yazmıyor | Ürün tanınmıyor. | Sepetteki gibi marka satırı ekleyin. | 1/1 |
| K-115 | [src/app/kategorie/\[key\].tsx:163](<mobile/src/app/kategorie/[key].tsx:163>) | Sıralama için yükleme başarısız olursa sıralama açıklamasız biçimde standarda dönüyor | Kullanıcı seçtiği sıralamanın neden kaybolduğunu anlamıyor. | Kısa bir bildirim gösterin. | 1/1 |
| K-116 | [src/app/kategorie/\[key\].tsx:207](<mobile/src/app/kategorie/[key].tsx:207>) | Marka bağlantısından açılan listenin başlığında marka yazmıyor | Başlık "Uhren · 6.487" diyor ama altında 15 sonuç var. | Tek marka seçiliyken "Seiko in Uhren" gibi bir başlık yazın. | 1/1 |
| K-117 | [src/app/liste/\[id\].tsx:24-101](<mobile/src/app/liste/[id].tsx:24>) | `mixodemo://liste/merkliste` bağlantısıyla açılan Merkliste'de silme ve yeniden adlandırma sessizce çalışmıyor | Bu yalnızca elle yazılan bağlantıyla oluyor. Kullanıcı Merkliste'yi sildiğini sanıyor. | Bu adresi Merkliste ekranına yönlendirin. | 1/1 |
| K-118 | [src/app/liste/\[id\].tsx:35-38](<mobile/src/app/liste/[id].tsx:35>) | "×" düğmesi aç-kapa çalışıyor: çok hızlı çift dokunuş ürünü listeye geri ekliyor | Seyrek görülüyor. Ürün geri gelince kayıt fiyatı notu kayboluyor. | Yalnızca çıkaran, tekrar basılınca da aynı sonucu veren bir `removeFromList` yazın. | 1/1 |
| K-119 | [src/app/liste/\[id\].tsx:97-102](<mobile/src/app/liste/[id].tsx:97>) | Liste silinirken geri dönüş sırasında "Diese Liste gibt es nicht mehr" yanıp sönüyor | Kısa süreli bir görsel sıçrama oluyor. | Son görülen listeyi saklayıp silme sırasında onu çizin. | 1/1 |
| K-120 | [src/app/listen.tsx:38](<mobile/src/app/listen.tsx:38>) | "+n" rozeti 99'da kesiliyor ama "99+" yazmıyor | 200 ürünlük listede rozet "+99" gösteriyor. | Sınırı aşınca "99+" yazın. | 1/1 |
| K-121 | [src/app/listen.tsx:98](<mobile/src/app/listen.tsx:98>) | Yeni liste oluşturulunca geri bildirim yok | Liste uzunsa yeni satır ekranın dışında kalıyor. | Yeni satırı vurgulayın ya da bir bildirim gösterin. | 1/1 |
| K-122 | [src/app/produkt/\[id\].tsx:88-99](<mobile/src/app/produkt/[id].tsx:88>) | Aynı markadan yalnızca 1-2 ürün varsa bunlar iki rafta da görünmüyor | Öneri kartları kayboluyor. | Alt kategori rafından yalnızca marka rafına girmiş ürünleri çıkarın. | 1/1 |
| K-123 | [src/app/produkt/\[id\].tsx:115-117](<mobile/src/app/produkt/[id].tsx:115>) | Ürün sayfasının başlığı boş (web'de sekme başlığı yok) | WCAG 2.4.2'ye aykırı. Yalnızca web'i etkiliyor. | Başlık olarak ürün adını verin. Görünen başlık boş kalabilir. | 1/1 |
| K-124 | [src/app/produkt/\[id\].tsx:143](<mobile/src/app/produkt/[id].tsx:143>) | Dizin yüklenmeden kategori izinde ham anahtar ("uhren") görünüyor | Ham anahtar ekran okuyucu etiketine de giriyor. | Dizin yüklenene kadar kategori kapsülünü çizmeyin. | 1/1 |
| K-126 | [src/app/produkt/\[id\].tsx:169-175](<mobile/src/app/produkt/[id].tsx:169>) | Satışta olmayan ya da fiyatı doğrulanmamış üründe de "Kostenloser Versand" yazıyor | Bu ifade "Nicht verfügbar" ile çelişiyor. | Ürün satışta değilse satırı gizleyin. Fiyat doğrulanmamışsa nötr metin gösterin. | 1/1 |
| K-127 | [src/app/produkt/\[id\].tsx:214](<mobile/src/app/produkt/[id].tsx:214>) | "Bild vergrößern" düğmesinin web'de rolü yok | Web ekran okuyucusu bunu düğme olarak tanımıyor. | Web'de `button` rolünü kullanın. | 1/1 |
| K-128 | [src/app/produkt/\[id\].tsx:214-224](<mobile/src/app/produkt/[id].tsx:214>) | Görseli olmayan üründe büyütme düğmesi boş bir tam ekran açıyor | Beyaz, boş bir ekran çıkıyor. | Görsel yoksa düğmeyi devre dışı bırakın ve ikonu gizleyin. | 1/1 |
| K-129 | [src/app/produkt/\[id\].tsx:215](<mobile/src/app/produkt/[id].tsx:215>) | Görsel genişliği sabit; karttaki önbelleğe alınmış görsel kullanılmıyor | Görsel biraz bulanık görünüyor ve geçiş sırasında karo boş kalıyor. | Kartın 360 px'lik görselini yer tutucu olarak kullanın. Genişliği ekran yoğunluğuna göre seçin. | 1/1 |
| K-130 | [src/app/produkt/\[id\].tsx:216-252](<mobile/src/app/produkt/[id].tsx:216>) | Aynı indirim yüzdesi iki kez çiziliyor | Görselde ve fiyat kartında aynı rozet var, bu gereksiz tekrar. | Birini kaldırın. | 1/1 |
| K-131 | [src/app/produkt/\[id\].tsx:255-275](<mobile/src/app/produkt/[id].tsx:255>) | Ürün yokken aynı mesaj üç yerde tekrarlanıyor; fiyatı doğrulanmamış üründe yine "Verfügbar" yazıyor | Satışta olmayan üründe aynı bilgi üç farklı ifadeyle çıkıyor. Doğrulanmamış bir durum kesinmiş gibi gösteriliyor. | Bilgi satırını yalnızca veri tazeyken gösterin. Tekrar eden mesajları teke indirin. | 1/1 |
| K-132 | [src/app/produkt/\[id\].tsx:334](<mobile/src/app/produkt/[id].tsx:334>) | Büyütülen görsel yakınlaştırılamıyor ve sayfadakinden pek büyük değil | Büyütme ikonu, uygulamanın karşılamadığı bir özellik vaat ediyor. | İkonu kaldırın ya da zemini karışım (blend) ile çizin. | 1/1 |
| K-133 | [src/app/suche.tsx:69](<mobile/src/app/suche.tsx:69>) | Son aramalardaki "×" düğmesi 40 dp genişlikte | Kod yorumu 44 dp diyor. | Genişliği 44 yapın. | 1/1 |
| K-134 | [src/app/suche.tsx:133](<mobile/src/app/suche.tsx:133>) | Arama ekranında dizin hatası yeniden denenmiyor | Ekran açık kaldığı sürece öneriler ve "Meintest du" görünmüyor. | Hata varken gönderimde ya da ekran öne geldiğinde yeniden deneyin. | 1/1 |
| K-135 | [src/app/suche.tsx:163-177](<mobile/src/app/suche.tsx:163>) | Aynı sorguyu yeniden göndermek taramayı baştan başlatıyor ve süzgeçleri siliyor | Liste bir an yanıp sönüyor ve uygulanan süzgeç kayboluyor. | Sorgu aynıysa ve tarama bittiyse yalnızca klavyeyi kapatın. | 1/1 |
| K-136 | [src/app/suche.tsx:166-169](<mobile/src/app/suche.tsx:166>) | En kısa arama uzunluğu yanlış birimle sayılıyor | Tek bir Çince ya da Rusça harf reddediliyor, tek bir emoji kabul ediliyor. | Karakterleri `[...t].length` ile sayın. | 1/1 |
| K-137 | [src/app/suche.tsx:182-184](<mobile/src/app/suche.tsx:182>) | `?q=` bağlantısıyla açılışta öneri listesi bir kare görünüyor | Kısa bir yanıp sönme oluyor. | Açılışta "sonuç bekleniyor" durumunu çizin. | 1/1 |
| K-138 | [src/app/suche.tsx:282-312](<mobile/src/app/suche.tsx:282>) | Tarama sürerken süzgeç tüm sonuçları gizlerse ızgara açıklamasız boş kalıyor | Yalnızca ilerleme çubuğu görünüyor. | "Noch keine Treffer mit diesen Filtern" satırını gösterin. | 1/1 |
| K-139 | [src/app/suche.tsx:437-441](<mobile/src/app/suche.tsx:437>) | Android'de arama önerileri klavyenin altında kalıyor | Alttaki satırlara ulaşılamıyor. | Klavye yüksekliği kadar alt boşluk bırakın. | 1/1 |
| K-140 | [src/app/zuletzt.tsx:14-27](<mobile/src/app/zuletzt.tsx:14>) | Son bakılan ürünleri tek tek kaldırma ya da temizleme yolu yok | Bu geçmiş yalnızca "tüm verileri sil" ile silinebiliyor. | Tek tek kaldırma ve "geçmişi temizle" eylemleri ekleyin. | 1/1 |
| K-141 | [src/categoryIcons.ts:7-18](<mobile/src/categoryIcons.ts:7>) | Sunucuya yeni bir kategori eklenirse sessizce genel bir ikon alıyor | Çökme yok, yalnızca genel etiket ikonu görünüyor. | Dizindeki kategorilerin hepsinin ikonu olduğunu doğrulayan bir test yazın. | 1/1 |
| K-142 | [src/components/Banners.tsx:67-79](<mobile/src/components/Banners.tsx:67>) | Daralmış başlıkta görünmez olan satır ekran okuyucuda hâlâ okunuyor | Ekran okuyucu görünmeyen bir öğeyi okuyor. | Kaydırma eşiği geçilince bu satırı ekran okuyucudan gizleyin. | 1/1 |
| K-143 | [src/components/Banners.tsx:120-122](<mobile/src/components/Banners.tsx:120>) | Technik afişi mercan ya da kırmızı zemin ve ham renk kodları kullanıyor | Tasarım kuralına aykırı ve indirim izlenimi veriyor. | Tasarım belirteçlerinden bir görünüm seçin. Renkleri `theme.ts`'e taşıyın. | 1/1 |
| K-144 | [src/components/Banners.tsx:224-228](<mobile/src/components/Banners.tsx:224>) | Afişlere ve kategori dairelerine basınca görsel geri bildirim yok | Diğer kartlarla tutarsız. | Basılı durumda opaklığı değiştirin. | 1/1 |
| K-145 | [src/components/Banners.tsx:234-241](<mobile/src/components/Banners.tsx:234>) | Afiş görsellerinde düşük kalite süzgeci yok | Afişte bulanık bir görsel çıkabilir. | Görseli temsilci görsel yolundan alın ya da sunucudan kalite bilgisini isteyin. | 1/1 |
| K-147 | [src/components/Banners.tsx:293-313](<mobile/src/components/Banners.tsx:293>) | Son afiş kaydırınca hizasına oturmuyor (~16 dp) | Görsel bir kayma oluyor. | Kaydırma durma noktalarını (`snapToOffsets`) elle hesaplayın. | 1/1 |
| K-148 | [src/components/ContextRail.tsx:26-31](<mobile/src/components/ContextRail.tsx:26>) | Merkliste'den gelen öneri kaynağı ürünü kendi şeridinde tekrar gösteriyor | Bu yalnızca sepet boşken oluyor. | Kaynak ürünü şeritten çıkarın. | 1/1 |
| K-149 | [src/components/ContextRail.tsx:33](<mobile/src/components/ContextRail.tsx:33>) | Raf eşiği (3) burada sabit yazılmış, ürün sayfasında ayrı tanımlanmış | Biri değişirse raflar tutarsızlaşır. | `RAIL_MIN`'i `config.ts`'e taşıyın. | 1/1 |
| K-151 | [src/components/ListPicker.tsx:25-29](<mobile/src/components/ListPicker.tsx:25>) | Liste adının tekrar denetimi araya giren fazla boşlukları dikkate almıyor | "Geschenke  Mama" (iki boşluk) yazılırsa aynı adlı iki liste oluşuyor. | Ad karşılaştırması için ortak bir normalleştirme yazın. | 1/1 |
| K-153 | [src/components/ListPicker.tsx:54](<mobile/src/components/ListPicker.tsx:54>) | "Name vergeben" uyarısı iOS'ta duyurulmuyor | VoiceOver kullanıcısı "Speichern" düğmesinin neden pasif olduğunu duymuyor. | Uyarıyı iOS'ta duyurun. | 1/1 |
| K-154 | [src/components/ListPicker.tsx:135-136](<mobile/src/components/ListPicker.tsx:135>) | Diyalog stilleri kopyalanmış; yorum "aynı" diyor ama değil | Bir yer değişirse diğeri farklılaşır. | Ortak bir diyalog kabı yazın. | 1/1 |
| K-157 | [src/components/home.tsx:62-70](<mobile/src/components/home.tsx:62>) | "Alle" dairesinden sonraki boşluk iki katına çıkıyor | Bu boşluk 8 dp, diğer daireler arası 4 dp. | Fazladan eklenen `marginRight`'ı kaldırın. | 1/1 |
| K-160 | [src/components/listing.tsx:52-57](<mobile/src/components/listing.tsx:52>) | "Filter" düğmesinin etkin durumu yalnızca "(2)" ile gösteriliyor; aç-kapa kapsüller onay kutusu gibi tanıtılmıyor | Ekran okuyucu "etkin" yerine "seçili" diyor. | Aç-kapa kapsüllere onay kutusu rolü verin. Etikete "2 aktiv" yazın. | 1/1 |
| K-161 | [src/components/listing.tsx:61-65](<mobile/src/components/listing.tsx:61>) | Devre dışı "Sortieren" düğmesi nedenini söylemiyor | Nedeni açıklayan metin hiçbir zaman görünmüyor, yani ölü kod. | Düğmeyi etkin bırakın. Pencere açılsın ve fiyat seçenekleri nedeniyle birlikte pasif görünsün. | 1/1 |
| K-162 | [src/components/listing.tsx:157-160](<mobile/src/components/listing.tsx:157>) | Android'de bir sonraki eylem, alt pencere kapanma animasyonu bitmeden çalışıyor | Ekranda titreme oluyor. | Yaklaşık 300 ms gecikme ekleyin. | 1/1 |
| K-163 | [src/components/listing.tsx:174-181](<mobile/src/components/listing.tsx:174>) | Aynı adı taşıyan iki ayrı `GroupTitle` bileşeni var | Yanlış olanı içe aktarmak kolay. | Yereldekinin adını `SheetGroupTitle` yapın. | 1/1 |
| K-165 | [src/components/listing.tsx:254](<mobile/src/components/listing.tsx:254>) | Alt kategori satırında sayı birimsiz okunuyor | Ekran okuyucu "Damenuhren, 1.816" diyor. | Erişilebilir değeri "n Produkte" biçiminde verin. | 1/1 |
| K-166 | [src/components/listing.tsx:291-298](<mobile/src/components/listing.tsx:291>) | "Reduziert" seçeneği "Verfügbarkeit" başlığının altında | İndirim bir stok durumu değil, bu yüzden yeri yanlış. | Ayrı bir gruba taşıyın. | 1/1 |
| K-167 | [src/components/listing.tsx:336-346](<mobile/src/components/listing.tsx:336>) | Liste başlığındaki fiyat aralığının etiketi yok | Ürün sayısıyla birlikte tek bir cümle gibi okunuyor. | "Preise von … bis …" biçiminde yazın. | 1/1 |
| K-168 | [src/components/ui.tsx:60-71](<mobile/src/components/ui.tsx:60>) | Hiç yüklenemeyen bir görsel sınırsız kez yeniden isteniyor | Dakikada bir istek gidiyor ve her seferinde bütün görseller yeniden çiziliyor. | Her görsel adresi için bir deneme sayacı tutun. | 1/1 |
| K-169 | [src/components/ui.tsx:109-117](<mobile/src/components/ui.tsx:109>) | Web'de ürün görselleri `alt` metni olmadan çıkıyor | Web ekran okuyucusu dosya adını okuyabiliyor. | Varsayılan olarak boş `alt` verin. | 1/1 |
| K-170 | [src/components/ui.tsx:180-182](<mobile/src/components/ui.tsx:180>) | İndirim kuralı iki yerde kopyalanmış ve koşulları farklı | Satışta olmayan üründe kartta üstü çizili fiyat var, ürün sayfasında yok. | Ortak bir indirim hesaplama yardımcısı yazın ve test edin. | 1/1 |
| K-171 | [src/components/ui.tsx:198-203](<mobile/src/components/ui.tsx:198>) | Bildirimler açık pencerelerin altında kalıyor | "Hinzugefügt" penceresi açıkken sepet doluysa hata mesajı görünmüyor. | Hatayı kartın üzerinde gösterin ve duyurun. | 1/1 |
| K-173 | [src/components/ui.tsx:223](<mobile/src/components/ui.tsx:223>) | Kart başlıkları sözcük ortasından tiresiz bölünüyor | "He\|rren-Armbanduhr" gibi bölünmeler oluyor. | `android_hyphenationFrequency="normal"` ekleyin. | 1/1 |
| K-174 | [src/components/ui.tsx:272-277](<mobile/src/components/ui.tsx:272>) | Web'de "Zur Liste" yalnızca uzun basmayla açılıyor; şeritler fareyle kaydırılamıyor | Bu yalnızca web önizlemesini etkiliyor. | Görünür bir "Zur Liste" düğmesi ve şeritler için ‹ › düğmeleri ekleyin. | 1/1 |
| K-175 | [src/components/ui.tsx:290](<mobile/src/components/ui.tsx:290>) | Doğrulanmamış fiyat ile satışta olmayan ürün aynı soluk stille çiziliyor | Çevrimdışıyken neden soluk göründüğüne dair açıklama yok. | Tek satırlık bir açıklama notu ekleyin. | 1/1 |
| K-176 | [src/components/ui.tsx:343-353](<mobile/src/components/ui.tsx:343>) | Izgara ilk çizimde yanlış sütun sayısıyla açılıp sonra yeniden kuruluyor | Geniş ekranda sıçrama oluyor. | Sütun sayısını ölçülen genişlikten hesaplayın. | 1/1 |
| K-177 | [src/components/ui.tsx:487-495](<mobile/src/components/ui.tsx:487>) | İskelet animasyonu "hareketi azalt" ayarını dikkate almıyor; hata kutusu duyurulmuyor | Ayar açık olsa da animasyon sürekli oynuyor. Hata kutusu ekran okuyucuya bildirilmiyor. | Ayar açıkken animasyonu oynatmayın. Hata kutusuna "uyarı" (`alert`) rolü verin. | 1/1 |
| K-178 | [src/components/ui.tsx:608-632](<mobile/src/components/ui.tsx:608>) | Sayı rozetlerinin yüksekliği sabit; büyük yazıda rakam rozetin dışına taşıyor | Beyaz rakam, beyaz zeminde görünmez oluyor. | Rozet metnine en fazla 1,2 büyütme sınırı verin. | 1/1 |
| K-179 | [src/components/ui.tsx:626-690](<mobile/src/components/ui.tsx:626>) | Ölü kod ve kullanılmayan bağımlılık | `Badge`, `SectionTitle`, `Segmented` ve `react-native-gesture-handler` hiç kullanılmıyor. | Bunları silin. Paketi kaldırmadan önce expo-doctor ile kontrol edin. | 1/1 |
| K-180 | [src/components/ui.tsx:641-646](<mobile/src/components/ui.tsx:641>) | Demo şeridinin erişilebilir etiketi görünen metni içermiyor | Sesli komut, görünen metinle eşleşmiyor (WCAG 2.5.3). | Etiketi görünen metinle başlatın. | 1/1 |
| K-181 | [src/components/ui.tsx:692-696](<mobile/src/components/ui.tsx:692>) | Metin bölme işlevi Almanca kısaltmalarda yanlış yerden bölüyor | Bugün bir sorun yok, ama metin değişirse "z. B." gibi kısaltmalarda hata çıkar. | Başlık ve metni ayrı ayrı verin. | 1/1 |
| K-182 | [src/components/ui.tsx:677-1329](<mobile/src/components/ui.tsx:677>) | Bazı dokunma alanları 42 dp | Tasarım belgesi "hepsi en az 44 dp" diyor. | Bu alanlara `minHeight: sizes.touch` verin. | 1/1 |
| K-183 | [src/components/ui.tsx:733-743](<mobile/src/components/ui.tsx:733>) | İlerleme çubuğunun erişilebilir adı yok | Ekran okuyucu "45 Prozent" diyor ama neyin yüzdesi olduğunu söylemiyor. | Bir etiket verin ya da çubuğu ekran okuyucudan gizleyin. | 1/1 |
| K-185 | [src/components/ui.tsx:967-972](<mobile/src/components/ui.tsx:967>) | Kart grubu öğeleri sıra numarasıyla anahtarlanıyor | Bir satır silinince alttaki satırların iç durumu yanlış satıra kayabilir. | Her öğenin kendi anahtarını kullanın. | 1/1 |
| K-186 | [src/components/ui.tsx:1054](<mobile/src/components/ui.tsx:1054>) | Başlığın belirme animasyonu "hareketi azalt" ayarını dikkate almıyor | 180 ms'lik bir solma, düşük risk. | Ayar açıksa başlığı animasyonsuz gösterin. | 1/1 |
| K-187 | [src/components/ui.tsx:1084-1086](<mobile/src/components/ui.tsx:1084>) | Başlıkta sol öğe boş bırakılarak geri oku gizlenemiyor | Bugün böyle bir ekran yok, gizli bir kural. | Boş sol öğeyi de "gizle" olarak dikkate alın. | 1/1 |
| K-188 | [src/components/ui.tsx:1095](<mobile/src/components/ui.tsx:1095>) | Kenar solma efekti kısa ya da yarı saydam renklerde gri bir geçiş üretiyor | Bugün etkisi yok. | Rengi önce tam 6 haneli biçime çevirin. | 1/1 |
| K-189 | [src/components/ui.tsx:1128-1156](<mobile/src/components/ui.tsx:1128>) | Pencere açılınca ilk odak tam ekran "Schließen" arka planına düşüyor; iOS kaçış hareketi yok | TalkBack önce "Schließen" okuyor. Diyalog dışında dokunulan her nokta "Schließen" sayılıyor ve yanlışlıkla kapatmaya açık. | Arka planı ekran okuyucudan gizleyin. `onAccessibilityEscape` ekleyin. | 1/1 |
| K-190 | [src/components/ui.tsx:1157-1169](<mobile/src/components/ui.tsx:1157>) | Alt pencere (BottomSheet) kaydırılamıyor | Büyük yazıda marka rafı ekran dışında kalıp kesiliyor. | Pencere içeriğini kaydırılabilir bir alana alın. | 1/1 |
| K-191 | [src/config.ts:7](<mobile/src/config.ts:7>) | Boş bırakılan `EXPO_PUBLIC_API_BASE` varsayılan adrese düşmüyor | Yalnızca yanlış yapılandırmada görülür, ama o zaman bütün istekler hatalı adrese gider. | Değeri kırpın. Boşsa varsayılan adresi kullanın. | 1/1 |
| K-192 | [src/config.ts:16-18](<mobile/src/config.ts:16>) | Fiyat eşikleri ile şerit başlıkları birbirine yalnızca bir yorumla bağlı; kullanılmayan metinler var | "unter 25 €" başlığında rakam elle yazılmış, eşik değişirse başlık yanlış olur. | Başlıkları eşik değerinden üretin. Kullanılmayan metin anahtarlarını silin. | 1/1 |
| K-195 | [src/filters.ts:42-45](<mobile/src/filters.ts:42>) | Fiyat aralıkları yöneticinin fiyat değişikliklerini hesaba katmıyor | Yönetici bir ürünün fiyatını aralığın altına çekerse ürün fiyat süzgeciyle bulunamaz. | Aralık sınırlarını yöneticinin girdiği fiyatlarla genişletin. | 1/1 |
| K-196 | [src/filters.ts:59-60](<mobile/src/filters.ts:59>) | Aynı işlevin üstünde iki ayrı açıklama bloğu var | İlk açıklama editör ipucunda görünmüyor. | İki bloğu birleştirin. | 1/1 |
| K-200 | [src/hooks.ts:217-228](<mobile/src/hooks.ts:217>) | Taranacak parça sayısı 0 ise arama "durduruldu" görünüyor | Bu durum yalnızca kuramsal: dizinde "all" kapsamı yoksa olur. | Bu durumda hata durumuna geçin. | 1/1 |
| K-201 | [src/hooks.ts:303-310](<mobile/src/hooks.ts:303>) | Daire ve afiş görselini getiren kod hatadan sonra yeniden denemiyor; hatalar iz bırakmadan yutuluyor; boş görsel düzeni kaydırıyor | Çevrimdışı açılışta daire görselleri boş kalıyor ve sayfa düzeni sıçrıyor. | Hatayı ayrı bir durum olarak tutup yeniden deneyin. Görsel için ayrılan yeri koruyun. | 1/1 |
| K-203 | [src/shipping.ts:4](<mobile/src/shipping.ts:4>) | Hiçbir ürün seçili değilken sepet aynı anda "kostenlos" ve "Noch 39 €" diyor | İki satır birbiriyle çelişiyor. | Seçim yokken kargo satırına "–" yazın ve kargo kartını gizleyin. | 1/1 |
| K-206 | [src/store/shopStore.tsx:174-187](<mobile/src/store/shopStore.tsx:174>) | Arama geçmişi okunurken ve yazılırken farklı normalleştiriliyor | Yalnızca bozuk bir kayıtta aynı arama iki ayrı girdi olur. | Ortak bir arama normalleştirme işlevi yazın. | 1/1 |
| K-208 | [src/store/shopStore.tsx:220-227](<mobile/src/store/shopStore.tsx:220>) | Kayıt okunamazsa oturum sessizce kaydetmeden çalışıyor; veri silindikten sonra da kaydetmiyor | Nadir görülüyor, ama o oturumda eklenen her şey kayboluyor. | Kullanıcıya bir kez bildirin. Başarılı silmeden sonra kaydetmeyi yeniden açın. | 1/1 |
| K-209 | [src/store/shopStore.tsx:287-351](<mobile/src/store/shopStore.tsx:287>) | Açılıştaki kısa pencerede yapılan değişiklikler sınır denetlenmeden yeniden uygulanıyor | Pratikte nadir. Liste sınırı aşılabilir ya da kalp ters dönebilir. | Sınırı değişikliği uygulayan işlevin içinde de denetleyin. | 1/1 |
| K-210 | [src/store/shopStore.tsx:327-331](<mobile/src/store/shopStore.tsx:327>) | Web'de iki sekme birbirinin kaydının üstüne yazıyor | Bu yalnızca web önizlemesinde oluyor. | Tarayıcının `storage` olayını dinleyin ya da README'ye "tek sekme" notu ekleyin. | 1/1 |
| K-213 | [src/store/shopStore.tsx:468-480](<mobile/src/store/shopStore.tsx:468>) | Veri silme işlemi görsel önbelleğini temizlemiyor | Bakılan ürünlerin görselleri cihazda bir gezinme izi olarak kalıyor. | Silme sırasında `Image.clearDiskCache` ve `clearMemoryCache` çağırın. | 1/1 |
| K-215 | [src/strings.ts:24](<mobile/src/strings.ts:24>) | "Bestand" sözcüğü stok verisi varmış izlenimi veriyor | Uygulamada stok adedi yok, yalnızca "satışta mı" bilgisi var. | "Preis und Verfügbarkeit" yazın. | 1/1 |
| K-216 | [src/strings.ts:79-189](<mobile/src/strings.ts:79>) | Sayım terimleri tutarsız ("Positionen" ve "Artikel") | Sepet "500 Artikel" diyorken uyarı "max. 100 Positionen" diyor. | "max. 100 verschiedene Artikel" yazın. | 1/1 |
| K-217 | [src/strings.ts:105](<mobile/src/strings.ts:105>) | "Mehr aus Weitere Düfte" dilbilgisi açısından bozuk | Gerçek alt kategori adı kalıba girince Almanca bozuk çıkıyor. | "Weitere Produkte: {sub}" kalıbını kullanın. | 1/1 |
| K-218 | [src/strings.ts:162](<mobile/src/strings.ts:162>) | "Gemerkt: 10,00 €" ifadesi belirsiz | Tasarım belgesi "Preis beim Merken" diyor. | "Preis beim Merken: {x}" yazın. | 1/1 |
| K-219 | [src/strings.ts:205-207](<mobile/src/strings.ts:205>) | "bis 25 €" etiketli süzgeç 25,00 €'luk ürünü kapsamıyor | Tam 25,00 €'luk ürün "25–100 €" kapsülünde çıkıyor. | Etiketleri "unter 25 €" ve "25 bis unter 100 €" yapın. | 1/1 |
| K-220 | [src/strings.ts:208](<mobile/src/strings.ts:208>) | Über ekranındaki "Echt" başlığı belirsiz | Kasa ve ödemenin de gerçek olduğu izlenimini verebilir. | "Echte Daten" ve "Nur Demo" başlıklarını kullanın. | 1/1 |
| K-221 | [src/strings.ts:209-210](<mobile/src/strings.ts:209>) | Über ekranı, demo sunucusunun ayarlarını "Echt" başlığı altında gösteriyor | Kargo eşiği aslında demo sunucusunun bir yönetici ayarı. | Bu cümleyi "Demo" bloğuna taşıyın. "Einzelne Angaben können in der Demo bearbeitet sein" notunu ekleyin. | 1/1 |
| K-222 | [src/strings.ts:223-230](<mobile/src/strings.ts:223>) | Tekil metinler kalıptan kopyalanmış; bazı sayılar biçimlendirilmiyor | Büyük sayılar "9.900" yerine "9900" çıkabilir. Pratikte bu metinlerdeki sayılar küçük. | Sayıları `num()` ile biçimlendirin. | 1/1 |
| K-223 | [src/theme.ts:216](<mobile/src/theme.ts:216>) | Kısa tutar ve yüzde metinlerinde sayı ile € ya da % arasında normal boşluk var | Asıl tutar biçimi `eur()` (Intl de-DE) zaten bölünmez boşluk kullanıyor. Sorun yalnız kısa tutarda (`eurShort`, "39 €") ve "{p} %" kalıplarında (`strings.ts` 72, 75, 87, 88, 91, 203) ile fiyat aralığı etiketlerinde (205-207). Dar satırda "39" ile "€" ya da "45" ile "%" ayrı satırlara düşebiliyor. | Bu boşlukları bölünmez boşluk (U+00A0) yapın; "−{pct} %" rozetleri için de. | 1/1 |
| K-224 | [test/logic.test.ts:51-56](<mobile/test/logic.test.ts:51>) | Dışa açılmış saf işlevlerin çoğu testsiz; test verisi tür hatasını zorlama dönüşümle gizliyor | Süzgeç, öneri ve rota çözümleme mantığı test edilmiyor. | Bu işlevler için test yazın. Test verisini zorlama dönüşüm (cast) olmadan, doğru türle kurun. | 1/1 |
| K-225 | [tools/dev-proxy.mjs:8-15](<mobile/tools/dev-proxy.mjs:8>) | Geliştirme vekili bütün ağ arayüzlerinde dinliyor ve her kaynağa CORS izni veriyor | Aynı Wi-Fi ağındaki biri vekili kullanabilir. Bu yalnızca bir geliştirme aracı. | Yalnızca 127.0.0.1'de dinleyin. CORS iznini Expo web adresiyle sınırlayın. İsteklere zaman aşımı ekleyin. | 1/1 |

---

## 5. Kök nedenler

Birçok bulgu aynı birkaç kök nedenden çıkıyor. Her grup için, o grubu kapatacak tek değişiklik yazıldı.

| # | Kök neden | Bulgular | Grubu kapatacak tek değişiklik |
|---|---|---|---|
| R1 | Yayın kimliği ve yapılandırması Expo şablonunda kalmış | K-002, K-013, K-014, K-015, K-081, K-083, K-084, K-085, K-086, K-111 | `app.json`, `assets/` ve `LICENSE` için tek bir yayın düzenlemesi: marka ikonları, gerçek paket kimliği, `blockedPermissions`, `allowBackup: false`, `web.lang`, açılış görseli, `expo-system-ui`, `sitemap: false`, serbest yön, `eas.json`. |
| R2 | Uygulamada yasal bilgi katmanı yok | K-004, K-011, K-078, K-079, K-221 | "Rechtliches" ekranı (Impressum, Datenschutz) ve gizlilik ile demo beyanlarının tek bir metin kaynağından gelmesi. |
| R3 | Fiyat ve kargo bildirimi dağınık, kurallar ekran ekran kopyalanmış | K-007, K-008, K-024, K-028, K-037, K-055, K-126, K-130, K-170, K-203, K-219 | `src/pricing.ts` dosyası (indirim görünümü, kargo görünümü, KDV notu, birim fiyat). Kart, ürün sayfası, sepet ve Kasse yalnızca bunu kullanır. |
| R4 | Görsellerin kaynağı denetimsiz | K-001, K-017, K-145 | Sunucuda `fix/` görsellerinin temizlenmesi ve görsel lisans listesi. Uygulamada görsel adresleri için izin listesi. |
| R5 | Hatalara karşı dayanıklılık eksik: geçici bir ağ hatası kalıcı hata durumuna dönüşüyor, çizim hatası için güvenlik ağı yok | K-003, K-016, K-030, K-134, K-200, K-201 | `shop.ts`'te son iyi yapılandırma ve tekrar denemeli istek. Veri getiren kodlarda (kancalar) "hata + yeniden dene" düzeni. Kök `_layout.tsx`'te Almanca bir hata sınırı (`ErrorBoundary`). |
| R6 | Güncel fiyatları getiren kod her seferinde baştan başlıyor | K-065, K-066, K-067, K-068, K-175 | Ürün → güncel fiyat eşlemesini uygulama genelinde tek bir önbellekte tutmak. Yenileme, başarısız ürün listesi ve görünür ürünlere öncelik. |
| R7 | Kayıt işlemleri niyet ve sonuç bildirmiyor | K-035, K-040, K-058, K-070, K-072, K-118, K-151, K-208, K-209, K-213 | Kayıt işlevlerini niyete dayalı ve sonuç döndüren hale getirmek (`setInList`, `removeFromList`, `clearAllData` başarı ya da "dolu" bilgisi döndürür). Ortak bir "önce tazele" yardımcısı. |
| R8 | Ekran durumu rotada değil, ekranın yerel belleğinde | K-005, K-006, K-025, K-034, K-049, K-103, K-116 | Kategorien seviyesini ve Kategorie süzgeçlerini (fiyat, stok, marka, indirim, sıralama) rota parametrelerine taşımak. |
| R9 | Sunucunun statik parça (chunk) modeli üst katmanlara sızıyor | K-012, K-018, K-020, K-022, K-032, K-033, K-036, K-051, K-094, K-095 | Sunucu dizinine küçük özetler (temsilci görsel, tam marka listesi). `shop.ts`'te parça değil alan düzeyinde bir arayüz (liste, arama, ilgili ürünler). |
| R10 | Ekran okuyucu için ortak bir katman yok | K-009, K-023, K-026, K-027, K-038, K-045, K-057, K-060, K-061, K-104, K-105, K-107, K-108, K-109, K-142, K-153, K-160, K-165, K-171, K-177, K-180, K-183, K-186, K-189 | Tek bir `src/a11y.ts` dosyası: duyuru yapma, ekran okuyucu ve "hareketi azalt" durumunu okuma, ürün adını içeren etiket üreticileri. Bildirimler, arama ve adet seçici bunu kullanır. |
| R11 | Sabit ölçüler büyük yazıya ve dar ekrana uymuyor | K-039, K-041, K-047, K-050, K-054, K-059, K-178, K-182, K-190 | Sabit yükseklik yerine en az yükseklik, ve yazı ölçeğine bağlı dizilim kuralı. Tablet için içerik genişlik sınırı. |
| R12 | Bildirim (toast) katmanı hangi ekranda olduğunu bilmiyor | K-031, K-062, K-110 | `ToastProvider`'a ekran bazlı konum, `hide()` işlevi ve "Ansehen" eylemi eklemek. |
| R13 | Saf mantık arayüz ve kayıt koduyla iç içe, bu yüzden testsiz | K-052, K-069, K-082, K-087, K-179, K-224 | `pricing.ts` ve `persist.ts` ayrımı, tüm denetimleri çalıştıran bir `check` betiği, ölü kodun temizliği. |
| R14 | Almanca için bir terim sözlüğü yok | K-044, K-074, K-075, K-076, K-077, K-131, K-166, K-167, K-181, K-192, K-215, K-216, K-217, K-218, K-220, K-222, K-223 | `strings.ts`'te tek geçişte terim revizyonu: indirim, kargo, sayım ve fiyat aralığı terimleri, bölünmez boşluk. |

Bu gruplar 196 onaylı bulgunun 126'sını kapsıyor. Hiçbir gruba girmeyen 70 bulgu tekil kusurlardır ve çoğu (61'i) bölüm 6'daki P2 paketlerinde. 8'i P1'de: K-019, K-042, K-080 ve K-225 (P1-7), K-029 (P1-3), K-046 ve K-063 (P1-4), K-056 (P1-8). 1'i P0'da: K-128, K-001'in düzeltmesi görselsiz ürün bıraktığı için P0-1'e alındı.

---

## 6. Düzeltme planı

Süreler kaba tahmindir. Kodlama ve emülatörde kısa denemeyi kapsar. Gerçek cihaz testi, görsel ya da metin temini ve hukuki onay ayrıca zaman alır.

### P0: mağaza sahibine yeniden göstermeden önce (yaklaşık 30 saat)

| Paket | Kapattığı bulgular | Dokunulacak dosyalar | Tahmini süre |
|---|---|---|---|
| P0-1 Görsel hakları | K-001, K-128 | Önce `_build.py` (`fix/` ürünlerinde `img` boş, `lq=1`) ve katalog yeniden üretimi; sonra sunucuda `demo/img/fix/` silinir. Uygulama: `mobile/src/app/produkt/[id].tsx` (görselsiz üründe büyütme kapalı) | 3,5 saat (lisanslı görsel temini hariç) |
| P0-2 Uygulama kimliği | K-002, K-086 | `mobile/app.json`, `mobile/assets/*` | 3 saat (Mixo logosu hazırsa) |
| P0-3 Kategori gezinmesi ve süzgeçler | K-005, K-006, K-034, K-049 | `(tabs)/kategorien.tsx`, `(tabs)/_layout.tsx`, `kategorie/[key].tsx`, `components/listing.tsx`, `components/home.tsx`, `app/suche.tsx`, `routes.ts` | 6 saat |
| P0-4 Hatalara dayanıklılık | K-003, K-016, K-030, K-134, K-201 | `api/shop.ts`, `hooks.ts`, `components/Banners.tsx`, `app/suche.tsx`, `app/_layout.tsx` (hata sınırı) | 6 saat |
| P0-5 Sepet ve fiyat doğruluğu | K-037, K-040, K-065, K-066, K-126, K-203 | `hooks.ts`, `produkt/[id].tsx`, `(tabs)/warenkorb.tsx`, `kasse.tsx` | 6 saat |
| P0-6 Sepete ulaşma ve bildirim konumu | K-031, K-062, K-110 | `components/ui.tsx`, `(tabs)/warenkorb.tsx`, `strings.ts` | 2 saat |
| P0-7 Yanlış ya da hatalı metinler | K-044, K-075, K-076, K-078, K-215, K-217, K-221 | `strings.ts`, `store/shopStore.tsx` (yorum) | 1,5 saat |
| P0-8 Veri silmenin tamamlanması | K-072, K-208, K-213 | `store/shopStore.tsx`, `(tabs)/bereich.tsx` | 2 saat |

### P1: mağaza yayınından önce (yaklaşık 64 saat)

| Paket | Kapattığı bulgular | Dokunulacak dosyalar | Tahmini süre |
|---|---|---|---|
| P1-1 Yasal katman | K-004, K-011, K-079, K-081, K-084 | `(tabs)/bereich.tsx`, `ueber.tsx`, yeni "Rechtliches" ekranı, `strings.ts`, `app.json`, `LICENSE`, `package.json`, `docs/mobil-uygulama-2026-11-15.md` | 6 saat (metinler mağaza sahibinden ve avukattan) |
| P1-2 Fiyat bildirimleri (PAngV) | K-007, K-008, K-024, K-028, K-055, K-130, K-170, K-219 | Yeni `pricing.ts`, `components/ui.tsx`, `produkt/[id].tsx`, `(tabs)/warenkorb.tsx`, `kasse.tsx`, `(tabs)/index.tsx`, `api/shop.ts`, `strings.ts` | 10 saat (Storefront alanlarına bağlı) |
| P1-3 Yayın yapılandırması ve platform | K-013, K-014, K-015, K-029, K-041, K-083, K-085, K-111 | `app.json`, yeni `eas.json`, `app/_layout.tsx`, yeni `app/+not-found.tsx`, `produkt/[id].tsx`, `components/ui.tsx` | 8 saat (ve gerçek cihazda, tablette test) |
| P1-4 Erişilebilirlik (orta) | K-009, K-023, K-025, K-026, K-027, K-038, K-045, K-046, K-047, K-050, K-057, K-060, K-061, K-063, K-105, K-177, K-189, K-190 | Yeni `a11y.ts`, `components/ui.tsx`, `(tabs)/_layout.tsx`, `(tabs)/kategorien.tsx`, `(tabs)/warenkorb.tsx`, `produkt/[id].tsx`, `app/suche.tsx`, `components/Banners.tsx`, `components/home.tsx` | 14 saat (ve TalkBack ile VoiceOver testi) |
| P1-5 Liste davranışları | K-035, K-058, K-070, K-118, K-151, K-209 | `store/shopStore.tsx`, `components/ui.tsx`, `liste/[id].tsx`, `components/ListPicker.tsx` | 6 saat |
| P1-6 Ağ ve performans | K-018, K-020, K-022, K-032, K-033, K-036, K-067 | `api/shop.ts`, `hooks.ts`, `kategorie/[key].tsx`, `components/listing.tsx`, `produkt/[id].tsx`, `components/home.tsx`, sunucu dizini (temsilci görsel eşlemi) | 12 saat |
| P1-7 Sınır doğrulama ve sertleştirme | K-017, K-019, K-042, K-080, K-225 | `api/shop.ts`, `app/suche.tsx`, `store/shopStore.tsx`, `tools/dev-proxy.mjs` | 4 saat |
| P1-8 Orta düzey UX | K-039, K-051, K-056 | `produkt/[id].tsx`, `components/listing.tsx`, `components/ui.tsx` | 4 saat |

### P2: sonra (yaklaşık 38 saat)

| Paket | Kapattığı bulgular | Dokunulacak dosyalar | Tahmini süre |
|---|---|---|---|
| P2-1 Almanca metin cilası | K-074, K-077, K-090, K-131, K-166, K-167, K-181, K-192, K-216, K-218, K-220, K-222, K-223 | `strings.ts`, `theme.ts`, `config.ts`, `components/listing.tsx`, `produkt/[id].tsx`, `components/ui.tsx`; katalog verisi | 3 saat |
| P2-2 Erişilebilirlik cilası | K-053, K-059, K-101, K-104, K-107, K-108, K-109, K-123, K-127, K-133, K-142, K-153, K-160, K-161, K-165, K-169, K-171, K-178, K-180, K-182, K-183, K-186 | `components/ui.tsx`, `components/listing.tsx`, `components/Banners.tsx`, `components/ListPicker.tsx`, `(tabs)/index.tsx`, `(tabs)/kategorien.tsx`, `(tabs)/warenkorb.tsx`, `produkt/[id].tsx`, `app/suche.tsx` | 8 saat |
| P2-3 UX ve görsel cila | K-021, K-048, K-054, K-093, K-094, K-095, K-102, K-103, K-112, K-113, K-114, K-115, K-116, K-119, K-120, K-121, K-122, K-124, K-129, K-132, K-135, K-137, K-138, K-139, K-143, K-144, K-145, K-147, K-148, K-157, K-162, K-173, K-174, K-175, K-176 | `api/shop.ts`, ekran dosyalarının çoğu, `components/*` | 11,5 saat |
| P2-4 Durum ve uç durumlar | K-071, K-073, K-100, K-117, K-136, K-140, K-168, K-185, K-187, K-188, K-191, K-195, K-200, K-206, K-210 | `store/shopStore.tsx`, `hooks.ts`, `components/ui.tsx`, `filters.ts`, `config.ts`, `liste/[id].tsx`, `zuletzt.tsx`, `app/suche.tsx`, `(tabs)/index.tsx` | 6 saat |
| P2-5 Mimari, belgeler ve testler | K-012, K-052, K-064, K-068, K-069, K-082, K-087, K-089, K-091, K-096, K-098, K-106, K-141, K-149, K-154, K-163, K-179, K-196, K-224 | `README.md`, `TASARIM.md`, `package.json`, yeni `pricing.ts` ve `persist.ts`, `test/*`, `components/ui.tsx`, `api/shop.ts` | 9 saat |

Üç aşamanın toplamı 196 onaylı bulgunun hepsini kapsıyor: P0'da 32, P1'de 60, P2'de 104 bulgu var. Düşük dereceli iki bulgu önceliklendirildi: K-030 (tek çizim hatası uygulamayı düşürüyor) P2-5'ten P0-4'e, K-128 (görselsiz üründe boş büyütme ekranı) P2-3'ten P0-1'e. K-001'in düzeltmesi yaklaşık 661 ürünü görselsiz bıraktığı için K-128 artık sık görülecek.

---

## 7. Güçlü yanlar

- **Tek ve sade ağ katmanı.** Bütün sunucu erişimi tek bir dosyada (`src/api/shop.ts`) ve yalnızca okuma (GET) yapıyor. 15 sn'lik zaman aşımı yanıtın okunmasını da kapsıyor. Hatalar önbelleğe alınmıyor, 404 ayrı ele alınıyor ve parça indirmelerinde eşzamanlılık sınırı var.
- **Hiçbir veri uydurulmuyor.** Uygulamada puan, yorum, stok baskısı, geri sayım, teslim sözü ya da kupon yok. Eski fiyat yalnızca gerçekten daha yüksekse gösteriliyor ve yüzde aşağı yuvarlanıyor. Kısmi sayılar "mind." diye, doğrulanmamış toplam "geschätzt" diye, varsayılan kargo "Annahme" diye etiketleniyor. `design.test.ts:94-97`, "für dich" ve "beliebt" gibi ifadelerin "Aus dem Sortiment" başlığına (`T.bestCurated`) girmesini engelliyor. Bu test diğer başlığı (`T.bestBehavior`, bugün "Beliebt") denetlemiyor; bu açık K-079'da.
- **Sağlam kayıt düzeni.** Yazmalar sıraya giriyor ve yalnızca en son durum yazılıyor. Yükleme bitmeden yapılan değişiklikler kaybolmuyor. Okunamayan bir kaydın üstüne yazılmadan önce yedeği alınıyor. Eski sürümden yeniye taşıma yarıda kalırsa bir sonraki açılışta tamamlanıyor. Diskten okunan her alan tek tek doğrulanıyor.
- **Yarış durumlarına karşı büyük ölçüde korumalı.** Eski yanıtlar etiketlerle tanınıp yok sayılıyor. Kategori listesi ve arama, kullanıcı ekrandan çıkınca yeni istek açmıyor (`hooks.ts:91, 93`). İki istisna var: ürün sayfasındaki marka rafı (K-036) ve daire görselini getiren kod (`hooks.ts:306`) başlamış isteği iptal etmiyor. Arama durdurulup kaldığı yerden sürdürülebiliyor ve aynı sonucu iki kez eklemiyor.
- **Gizlilik açısından temiz.** Arama tamamen cihazda yapılıyor, arama terimleri sunucuya gitmiyor. Analiz, reklam ya da çökme raporlama aracı, cihaz kimliği ve çerez yok. Yazı tipleri uygulamanın içinde, çalışırken Google'a istek gitmiyor. Kasada kişisel veri ya da ödeme alanı yok.
- **Kapalıyken güvenli katalog.** Yapılandırma alınamazsa katalog hiç açılmıyor, böylece gizlenmiş ürün ve kategoriler sızmıyor. Derin bağlantıdaki kategori anahtarı dizinle, alt kategori numarası rakam kalıbıyla sınanıyor; bilinmeyen kapsam "Kategorie wählen" ekranına düşüyor. İki parametre ise sınanmıyor: marka adı yalnız baştaki ve sondaki boşluklardan temizleniyor, dizindeki markalarla karşılaştırılmıyor (`routes.ts:40`, K-032'deki `?marke=zzz`), arama metninin uzunluğuna sınır yok (K-042).
- **Temiz tedarik zinciri.** 809 paketin tamamı resmî npm deposundan geliyor ve bütünlük değerleri var. Depoda gizli anahtar yok.
- **Kod kalitesi.** Strict TypeScript ile 0 hata, hiç `any` yok, lint temiz, 18/18 test geçiyor. Çalışma anında içe aktarma döngüsü yok. Yorumlar, kodun neden öyle yazıldığını anlatıyor.
- **Platform bilgisi yerinde.** iOS'un aynı anda iki pencere açamaması, Android geri tuşu, kenardan kenara ekran düzeni ve expo-router 58'in güncel `anchor` ayarı bilinçli olarak ele alınmış. Web'de çalışmayan `Alert` hiç kullanılmamış.
- **Erişilebilirliğin temeli var.** Neredeyse her dokunulabilir öğenin rolü ve Almanca etiketi var. Başlık rolleri tutarlı. Fiyat ekran okuyucuya "12,99 €, statt 19,99 €" diye tek cümleyle veriliyor. Uzun basmanın erişilebilir bir karşılığı var. Paletin çoğu kontrast açısından güçlü.
- **Almanca metin düzeni.** Tüm metinler tek bir dosyada (`strings.ts`). Çoğul biçimleri doğru, sayı ve para birimi de-DE biçiminde, tırnaklar „…" biçiminde. Hitap baştan sona "du".
- **Kullanıcı deneyimi.** Sepete eklemede güçlü geri bildirim var (adet rozeti, "Hinzugefügt" penceresi, 5 sn'lik geri alma). Boş ekranlar tutarlı. Sonuç çıkmayan aramada "Meintest du" öneriliyor. Demo olduğu her yerde açıkça belli. Uygulama açık temaya sabitlenmiş (`userInterfaceStyle: "light"`); U10 emülatörde (Expo Go) gece modunu açtığında ekranlar bozulmadı. Ancak bu sabitleme Android yayın derlemesinde `expo-system-ui` olmadan uygulanmıyor (K-083) ve yayın derlemesinde denenmedi.
- **Marka bağımsızlığı.** Referans alınan mağazanın adı, sloganı, logosu ya da turuncu rengi hiçbir yerde yok. Palet kendi renklerimizden oluşuyor.

---

## 8. Çürütülen iddialar

Bu iddialar incelendi ve bir kusur olarak doğrulanmadı.

| K | İddia | Neden çürütüldü |
|---|---|---|
| K-010 | Daire görselinde eski kapsamın yanıtı yeni kapsamın sonucunu eziyor | Hiçbir kullanım yerinde aynı bileşenin kapsamı değişmiyor, bu yüzden yarış oluşamıyor. Önlem olarak eklenmesi ucuz ama gerekmiyor. |
| K-043 | Metin düzenlenince görünmeyen tarama arka planda sürüyor | İnen parçalar önbellekte kalıp yeniden kullanılıyor. Taramayı durdurmak, kullanıcı aynı sorguya dönünce davranışı kötüleştirir. |
| K-088 | Dizin ile parçalar arasında sürüm bağı yok | Katalog statik ve yalnızca sunucuya yeni sürüm yüklenince değişiyor. Olası bir hata yeniden denemeyle toparlanıyor. |
| K-092 | Kapsam çözümleyici biçimsiz kapsamları geçerli sayıyor | Kapsam her zaman sayıya çevrilerek üretiliyor, biçimsiz bir değer çözümleyiciye ulaşamıyor. |
| K-097 | "Listen" sayısı Merkliste'yi de sayıyor | Sayı, açılan ekrandaki satır sayısıyla birebir aynı. Merkliste orada da ilk satır. |
| K-099 | Kaydırma konumu sıfırlanmıyor | Liste bağlandıktan sonra hata durumuna dönülemiyor, anlatılan durum oluşmuyor. |
| K-125 | Doğrulanmamış görünümde çift dokunuş adedi 2 yapıyor | Taze görünümde de iki dokunuş iki adet ekliyor, bu beklenen davranış. Eski fiyat yalnızca çok dar bir uç durumda görünüyor. |
| K-146 | "44.862 Produkte" sayısı satışta olmayanları da sayıyor | Satışta olmayan ürünler katalogda etiketli olarak görünüyor, sayı gösterilenle uyumlu. |
| K-150 | Liste özetinin başlığı yalnızca bir sayı | Her kullanım yerinde ekranın kendi başlığı bağlamı veriyor. |
| K-152 | Android'deki klavye kaçınma ayarı düğmeleri gizliyor | Ortalanmış diyalogda iki ayar aynı sonucu veriyor. İddia doğrulanmamış bir varsayımdı. |
| K-155 | Fiyat notu sonradan beliriyor, kartlar sıçrıyor | Not yalnızca fiyat değiştiyse çıkıyor. Önerilen düzeltme yeni bir sorun açardı. |
| K-156 | "Jetzt X günstiger" bir indirim duyurusu sayılabilir | Karşılaştırma kullanıcının kendi kaydettiği fiyatla yapılıyor, satıcının indirim reklamı değil. |
| K-158 | Alt kategori dairelerinin anahtarı ad, çakışabilir | Canlı veride aynı adlı iki alt kategori yok. |
| K-159 | Marka kartındaki " · " ayırıcısı belirsiz okunuyor | Ekran okuyucular burada kısa bir duraklama yapıyor, somut bir engel yok. |
| K-164 | Süzgeç penceresinde odak grubuna kaydırma yarışa açık | iOS'ta çağrı animasyondan sonra geliyor. Android için kanıt yok. İkinci açılışta zaten doğru çalışıyor. |
| K-172 | Kart kaldırıldıktan sonra gelen yanıt durum güncelliyor | React bunu sessizce yok sayıyor, gözlenebilir bir sonucu yok. |
| K-184 | Daire ikonunun ölçüsü iki yerde tanımlı | İki yer de aynı tasarım belirtecinden besleniyor, elle ikinci bir güncelleme gerekmiyor. |
| K-193 | Bilinmeyen fiyat aralığı süzgeç sayacında sayılıyor | Geçersiz bir aralık kimliği hiçbir yoldan oluşamıyor. |
| K-194 | Tür parametresi `T`, metin nesnesi `T` ile aynı adı taşıyor | TypeScript tür ve değer adlarını ayrı tutuyor, çakışma yok. |
| K-197 | Arama süzgeci seçili markayı listeye eklemiyor | Yeni aramada süzgeçler zaten sıfırlanıyor. |
| K-198 | Günlük karışım girdi sırasına bağlı ve yavaş | Liste kısa ve sunucu sırası sabit, somut bir etkisi yok. |
| K-199 | Yeniden denemek mevcut veriyi siliyor | Yeniden deneme yalnızca veri yokken, yani hata durumunda çağrılıyor. |
| K-202 | Çok büyük alt kategori numarası kabul ediliyor | Geçersiz kapsam "Bilinmeyen kapsam" ekranına düşüyor, çıkmaz yok. |
| K-204 | Kargo ilerleme çubuğu geçersiz eşikte hata veriyor | Sunucu değeri geçersizse yedek değer (39) kullanılıyor, geçersiz değer hesaba ulaşamıyor. |
| K-205 | Kayda yazarken doğrulama yapılmıyor | Fiyat zaten sayı olarak üretiliyor, senaryo varsayımsaldı. |
| K-207 | Eski sürümden taşıma her nesneyi başarılı sayıyor | Bozuk kayıtta eski veri korunuyor. Eski sürümün farklı bir biçimde yayımlandığına dair iz yok. |
| K-211 | Adet ve seçim işlevleri değişmeyen durumda da yeni durum üretiyor | Seçim işlevi her seferinde gerçekten değer değiştiriyor. Etkisi tek bir gereksiz çizim. |
| K-212 | Arama geçmişi istenmeden kaydediliyor (§25 TDDDG) | Veri yalnızca cihazda kalıyor, uygulamada açıklanıyor ve silinebiliyor. Hukuki bir sorun kanıtlanmadı. |
| K-214 | Hitapta emir kipi ve mastar karışık kullanılıyor | Almanca arayüzlerde yaygın bir kural, anlam sorunu yok. |

---

## 9. Kontrol edilemeyenler

Üyelerin kontrol edemediği konular aşağıda birleştirildi ve tekrarlar ayıklandı. Bu konulardaki bulgular kod okumasına ya da hesaba dayanıyor.

- **iOS:** Hiç çalıştırılmadı (Linux ortamı). Expo Go ve simülatör denenmedi. iOS'a özgü bulgular kod, React Native ve react-native-screens kaynakları ile Expo belgelerinden çıkarıldı.
- **Gerçek cihaz:** Android yalnızca emülatörde (Expo Go) denendi, bunu da yalnızca U10 yaptı. Diğer üyeler yalnızca kod okudu.
- **Ekran okuyucular:** TalkBack, VoiceOver, NVDA ya da JAWS ile gerçek deneme yapılmadı. Canlı bölgeler, pencere kapanınca odağın geri dönüşü, okuma sırası ve klavye odak halkası koddan ve platform kurallarından çıkarıldı.
- **Yayın derlemesi:** `expo prebuild` ve EAS çalıştırılmadı. Android manifest izinleri, `allowBackup`, iOS ATS, açılış ekranı, ikonlar ve Android 16'nın büyük ekranlardaki yön davranışı derlenmiş çıktıda görülmedi. `expo-doctor` ağa çıktığı için çalıştırılmadı.
- **Tablet ve yatay yön:** Geniş ekran düzeni (3 sütun), katlanabilir cihazlar ve sol/sağ güvenli alan boşlukları denenmedi.
- **Pencere üstünde gezinme:** Diyalog açıkken geri gitme ya da yön değiştirme iOS'ta denenmedi. Android'de pencere içinde klavye kaçınma, uzun basma ve hedef SDK 37 / Android 17'deki "tahmine dayalı geri" davranışı da denenmedi.
- **Performans:** Cihazda profil çıkarılmadı (Hermes süreleri, FPS, bellek). Verilen süre ve bellek rakamları Node 22 / V8 ile masaüstünde ölçüldü, Hermes'te daha yavaş olması beklenir. Tam katalog taramasının mobil ağda süresi ve Android'deki `mixBlendMode` çizim maliyeti ölçülmedi.
- **Ağ önbelleği ve görseller:** Android ve iOS'un HTTP önbelleğinin 304 yanıtıyla yeniden doğrulama yapıp yapmadığı bilinmiyor. `cdn.shopify.com` ve `/img/fix/` görsellerinin bayt boyutları ölçülmedi, çünkü bu adresler izin verilen uçlarda değildi. Tek bir parça indirme hatasının (all-79) yerel ağdan kaynaklanıp kaynaklanmadığı belirlenemedi.
- **Web:** Web paketi tarayıcıda açılmadı (sunucu başlatmak yasaktı). Geliştirme vekili ve CORS yalnızca kaynak kod ve curl ile incelendi.
- **Sunucu tarafı:** Railway ve demo sunucusu erişim günlüklerinin IP saklayıp saklamadığı ve saklama süresi bilinmiyor. Shopify CDN'in veri işleme koşulları incelenemedi. Ürün ucunun yönetici değişikliklerini uygulayıp uygulamadığı doğrulanamadı, çünkü canlıda hiç değişiklik yok. Yönetici indirim ve fiyat senaryoları canlı denenmedi. `/api/config` ve `/api/shop/home` yanıtlarının sıkıştırılmadan gönderilmesi bir sunucu konusu olduğu için uygulama bulgusu sayılmadı.
- **Hukuk:** Şunlar bilinmiyor ya da teyit edilmedi:
  - BFSG mikro işletme muafiyeti
  - Shopify'daki fiyatların KDV dahil olup olmadığı
  - Gerçek kargo kuralı ve teslimat ülkeleri
  - Görsellerin lisansı (`cdn.shopify.com` ve `fix/`)
  - Web demosu herkese açıksa bugün Impressum gerekip gerekmediği
  - App Store Connect ve Play Console formları, yaş derecelendirmesi

  Kanun ve mağaza yönergesi maddeleri bellekten yazıldı. Bu rapor hukuki görüş değildir.
- **Veri:** 90 parçanın tamamı taranmadı. Bozuk başlıklar için 6 kategorinin ilk parçasına (1.148 ürün) bakıldı. Eski kayıt biçimi (`mixo.demo.v1`) doğrulanamadı, çünkü `mobile/` git'te izlenmiyor ve geçmişi yok.
- **Kayıt sınırları:** Android'de tek bir değerin okuma sınırı (yaklaşık 2 MB) cihazda denenmedi. Hesaplanan en büyük kayıt 1,1-1,4 MB. Uygulama yazma ortasında kapatılırsa ya da arka plana alınırsa ne olduğu da denenmedi.
- **Dil ve biçim:** Hermes'in de-DE para ve sayı biçiminin eski Android'de aynı çıkıp çıkmadığı bilinmiyor. `accessibilityLanguage` ayarlanmadığı için, cihaz dili Almanca değilse etiketlerin yanlış sesle okunma riski denenmedi. Sunucudan gelen duyuru metni ve yönetici etiketleri denetlenemedi.
- **Kontrast:** Kontrastlar elle hesaplandı. Afiş gradyanındaki konumlar 390 dp genişlik varsayımıyla hesaplandı. Ürün fotoğraflarının üstündeki öğeler ölçülmedi.
- **Bağımlılıklar:** `npm audit` 3 orta uyarı verdi, hepsi yalnızca komut satırı aracında. `audit fix` uygulanmadı.

**Konseyin hiç bakmadığı alanlar.** Aşağıdakileri hiçbir üye incelemedi. Tamlık denetimi bunları ortaya çıkardı.

- **Üçüncü taraf lisans bildirimleri:** Inter ve Fraunces yazı tipleri (SIL OFL, `@expo-google-fonts/*`) ile MIT ve BSD lisanslı paketlerin lisans metinleri uygulamada hiçbir yerde gösterilmiyor. U6 yalnız projenin kendi `LICENSE` dosyasına baktı. *Neden önemli:* Bu lisanslar, dağıtılan kopyayla birlikte telif ve lisans metninin verilmesini istiyor. Mağaza yayınından önce bir "Open-Source-Lizenzen" ekranı gerekip gerekmediği hukuken teyit edilmeli.
- **Verinin tarihi:** `strings.ts` 24, 172 ve 209 "zum Zeitpunkt der Datenübernahme" diyor, ama hiçbir yerde tarih yok. Başkan `/data/index.js`'e baktı: dosyada yalnız `total`, `cats`, `lists` ve `facets` alanları var, tarih alanı yok. *Neden önemli:* Kullanıcı fiyatların ne kadar eski olduğunu öğrenemiyor. Uygulamanın dürüstlük çizgisi düşünülünce "Stand: TT.MM.JJJJ" bilgisinin eksikliği incelenmeli.
- **Paket boyutu ve soğuk açılış süresi:** Kimse `npx expo export` çalıştırıp JS paketinin boyutuna bakmadı. 6 yazı tipi ağırlığının (U3'e göre yaklaşık 1,8 MB), Ionicons'un tam setinin ve kullanılmayan `react-native-gesture-handler`'ın (K-179) payı ölçülmedi. *Neden önemli:* İndirme boyutu ve açılış süresi ilk izlenimi ve mağazadaki boyut bilgisini belirliyor; K-029'daki açılış sırasıyla birlikte ele alınmalı.
- **Çökme takibi ve izlenebilirlik:** Çökme raporlama aracının olmaması yalnız gizlilik artısı olarak yazıldı. K-030 (hata sınırı yok) ile birlikte düşünülünce, yayında yaşanan çökmeleri kimse görmez. *Neden önemli:* Bu açığın nasıl kapatılacağı (ör. rızaya bağlı bir çökme raporlayıcı ve Datenschutz metninde beyanı) bir ürün ve hukuk kararı; incelenmedi.
- **Güncelleme ve dağıtım yolu:** `package.json`'da `expo-updates` yok, `app.json`'da `runtimeVersion` tanımlı değil. Demoya ya da yayına bir hata düzeltmesi göndermek için her seferinde yeni derleme gerekiyor. Demonun mağaza sahibine nasıl ulaştırılacağı (Expo Go, geliştirme derlemesi ya da TestFlight / Play iç test) da incelenmedi. *Neden önemli:* P0 sonrası gösterim için bir yol seçilmeli. Expo Go ile gösterilirse ikon ve açılış ekranı sorunları (K-002, K-029, K-086) görünmez, yayın derlemesinde ise görünür.
- **Uçtan uca ve bileşen testleri:** Hiç arayüz akış testi yok (Maestro, Detox ya da React Native Testing Library). K-068, K-069 ve K-224 yalnız saf işlevlere bakıyor. "Sepete ekle → Kasse" ve "liste oluştur / sil" gibi temel akışların otomatik testi ele alınmadı. *Neden önemli:* P0 düzeltmeleri tam da bu akışlara (gezinme, süzgeç, sepet fiyatı) dokunuyor; bozulmayı bugün yalnız elle deneme yakalar.
- **Sunucu yükü ve maliyeti:** Her tam arama 90 parçanın tamamını indiriyor. Başkan bunu ölçtü: 7,3 MB JSON, ağda gzip ile yaklaşık 2,9 MB. 90 isteğin 1'i ilk denemede bağlantı hatası verdi, ikincide geldi. Çok kullanıcıda Railway'in dışarı giden trafiği ve maliyeti hesaplanmadı. Üyelerin boyut ölçümleri çoğunlukla düz JSON üzerindendi; bu raporda yalnız K-022, K-032 ve K-036'ya ağ boyutu eklendi. *Neden önemli:* Demo sunucusunun barındırma maliyeti ve mobil veri tüketimi, gösterim sayısı arttıkça büyür.
- **Cihaz saati:** Önbellek süreleri `Date.now()` farkıyla hesaplanıyor (`shop.ts` 106, 251, 302). Cihaz saati geri alınırsa önbellek, geri alınan süre kadar taze sayılıyor ve yenilenmiyor. *Neden önemli:* Düşük önem; ama yönetici fiyat ya da gizleme değişikliği o süre boyunca uygulamaya yansımaz.
- **İncelenmeyen dosyalar:** `mobile/CLAUDE.md` (tek satır, `AGENTS.md`'ye yönlendiriyor), `package-lock.json` (yalnız paket kaynakları ve bütünlük değerleri tarandı), `assets/android-icon-background.png` ve `assets/android-icon-monochrome.png`, `.expo/` klasörü (`.gitignore`'da, yerel geliştirme önbelleği) ve `LICENSE`'ın 7-21. satırları. *Neden önemli:* İki Android ikon dosyası `app.json` 17-18'de uyarlanabilir ikonun zemini ve Android 13+ tema ikonu olarak kullanılıyor; K-002'deki Expo şablonu sorunu bunlarda da olabilir, gözle doğrulanmalı.

---

## Ek A: Bulgu → açı listesi

Bölüm 3'teki sayıların dayanağı. Bir bulgu birden çok açıda geçebilir; açı toplamları 233, tekil onaylı bulgu 196'dır. Kritik bulgu olmadığı için o sütun yok.


| Açı | Yüksek | Orta | Düşük | Toplam |
|---|---|---|---|---|
| Doğruluk | – | K-003, K-005, K-006, K-034, K-040, K-049, K-065, K-066, K-070 | K-019, K-020, K-021, K-058, K-100, K-112, K-117, K-118, K-120, K-122, K-128, K-134, K-135, K-136, K-145, K-148, K-151, K-170, K-185, K-191, K-195, K-200, K-206, K-209, K-219 | 34 |
| Durum ve kalıcılık | – | K-003, K-005, K-034, K-035, K-065, K-066 | K-042, K-069, K-071, K-110, K-201, K-208, K-209 | 13 |
| Veri, ağ, performans | – | K-003, K-022, K-029, K-032, K-033, K-065, K-066, K-067 | K-016, K-018, K-020, K-036, K-071, K-073, K-090, K-129, K-168 | 17 |
| Güvenlik ve gizlilik | K-004 | K-032, K-072, K-078 | K-015, K-017, K-042, K-080, K-084, K-111, K-213, K-225 | 12 |
| Erişilebilirlik | – | K-009, K-011, K-013, K-023, K-025, K-026, K-027, K-038, K-045, K-046, K-047, K-050, K-057, K-060, K-061, K-063 | K-053, K-059, K-085, K-101, K-105, K-107, K-108, K-109, K-123, K-127, K-133, K-142, K-153, K-160, K-161, K-165, K-169, K-171, K-177, K-178, K-180, K-182, K-183, K-186, K-189, K-190 | 42 |
| Dürüstlük, hukuk, mağaza | K-001, K-004 | K-002, K-006, K-007, K-008, K-011, K-014, K-055, K-078 | K-019, K-024, K-028, K-037, K-079, K-081, K-126, K-140, K-215, K-221 | 20 |
| Mimari, bakım, test | – | – | K-012, K-030, K-052, K-062, K-068, K-069, K-082, K-087, K-089, K-091, K-096, K-098, K-106, K-141, K-149, K-151, K-154, K-163, K-179, K-187, K-192, K-196, K-201, K-222, K-224 | 25 |
| Almanca metin | – | – | K-037, K-044, K-074, K-075, K-076, K-077, K-090, K-124, K-131, K-166, K-167, K-181, K-192, K-203, K-215, K-216, K-217, K-218, K-219, K-220, K-223 | 21 |
| Platform ve Expo | – | K-029, K-041 | K-017, K-054, K-064, K-083, K-086, K-103, K-111, K-139, K-162, K-171, K-174, K-188, K-210 | 15 |
| UX ve görsel | – | K-031, K-034, K-039, K-051, K-056 | K-048, K-059, K-062, K-093, K-094, K-095, K-102, K-104, K-108, K-113, K-114, K-115, K-116, K-119, K-121, K-124, K-130, K-132, K-137, K-138, K-144, K-147, K-157, K-171, K-173, K-175, K-176 | 32 |
| Marka | – | K-002 | K-143 | 2 |
