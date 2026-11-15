# Parfüm fiyat kıyası: mixoutlet.de ve piyasa

15 Kasım 2026 · Liste: `parfum-fiyat-kiyasi-2026-11-15.csv` (602 satır, noktalı virgül ayraçlı, Excel'de açılır) · Ham veri ve betik: `_fiyat/` (`birlestir.py` listeyi yeniden üretir) · Bağlam: `hedef-siteler-analizi-2026-11-15.md`

## Yöntem ve sınırı

- 602 parfüm (Parfum & Düfte koleksiyonları) için ürün başına 1–2 web araması yapıldı; fiyatlar **arama sonucu özetlerinden** alındı, mağaza sayfaları açılmadı. Fiyatlar tarihsizdir, kargo hariçtir.
- Eşleşme kuralı: aynı marka, koku, konsantrasyon ve ml. Set, tester, dekant alınmadı.
- "Tipik" = bulunan tekliflerin medyanı (en fazla 3 teklif). 391 ürünün 181'inde tek teklif var.
- En düşük teklifin 135'i Almanya mağazasından; kalanı başka euro ülkelerinden (Fransa 87, Avusturya 41, İspanya 26). Chanel'de karşılaştırma çoğu kez markanın resmi sitesindeki liste fiyatıyla yapıldı; bu, bizi olduğundan ucuz gösterir.
- Sonuç bir **ön eleme listesidir**; fiyat değiştirmeden önce satırdaki bağlantıdan kontrol edilmeli.

## Sonuç

| Durum (tipik fiyata göre) | Ürün |
|---|---|
| Pahalı (+%15 üstü) | 135 |
| Aşırı fark, önce veri kontrolü (3 katından fazla ya da %60'tan ucuz) | 24 |
| Piyasada (±%15) | 91 |
| Ucuz (−%15 altı) | 141 |
| Fiyat bulunamadı | 211 |

Genel medyan fark +%2: ortalamada piyasadayız, ama dağılım iki uçlu.

| Fiyat grubu | Fiyatı bulunan | Medyan fark | Pahalı | Piyasada | Ucuz |
|---|---|---|---|---|---|
| Tam 69,00 € | 61 | **+%130** | 60 | 1 | 0 |
| 45 € ve altı | 58 | −%15 | 11 | 18 | 29 |
| 45–100 € (69,00 hariç) | 121 | **−%30** | 16 | 22 | 83 |
| 100–200 € | 86 | +%8 | 26 | 37 | 23 |
| 200 € üstü | 41 | +%18 | 22 | 13 | 6 |

1. **69,00 € sorunu.** 113 üründe fiyat tam 69,00 €. Fiyatı bulunan 61'in 60'ı pahalı; piyasada bunların çoğu 20–30 € (Lattafa, Riiffs, Gulf Orchid, Fragrance World, Zimaya). Bu tek tek fiyatlandırma değil, toplu atanmış bir varsayılan fiyat gibi görünüyor (çıkarım).
2. **Gerçek outlet fiyatı 45–100 € bandında.** Jimmy Choo I Want Choo 100 ml 39,04 € (piyasa ~94 €), YSL Mon Paris 90 ml 53,36 € (~107 €), Gucci Flora Gorgeous Gardenia 100 ml 63,19 € (~125 €), Maison Margiela Replica 100 ml ~62 € (~119–133 €). idealo ve Kaufland'da öne çıkabilecek ürünler bunlar.
3. **Pahalı tasarım parfümleri.** Bvlgari Man In Black 100 ml 288 € (~101 €), YSL Black Opium 90 ml 293,40 € (~110 €), Dior Fahrenheit EDP 75 ml 280 € (~104 €), Dior Homme Parfum 50 ml 288,64 € (~110 €).
4. **Aşırı fark (24 ürün).** Büyük olasılıkla veri hatası: Dior Dune EDT 100 ml 440 € (~83 €), Lattafa Khamrah 100 ml 120 € (~30 €), Lattafa Khamrah Qahwa 276 € (~30 €), Chanel Gabrielle EDP 100 ml 533,88 € (~160 €). Ters yönde: Givenchy Gentleman EDP 100 ml 35,94 € (~131 €), D&G The One EDT 100 ml 39,89 € (~110 €); bunlar ya çok iyi fırsat ya da yanlış ürün/boy.
5. Pahalı ve aşırı farklı 156 üründe tipik fiyatın üstündeki toplam fark ~11.000 € (ürün başına bir adet üzerinden).

## Fiyatı bulunamayan 211 ürün

- 39'u "Take Off" markası: aramada hiç çıkmıyor (özel marka olabilir; kıyas anlamsız).
- 36'sının başlığında ml yok; eşleştirme yapılamadı. Başlık düzeltmesi gerekir.
- 44'ü 69,00 € olan ürün; büyük olasılıkla aynı sorun.
- Kalanı: yalnız farklı boy/konsantrasyon bulundu, set, ya da euro dışı teklif.

## Öneri

1. 69,00 € olan 113 ürünün fiyat kaynağını sahibine sor; kural hatasıysa tek seferde düzelir.
2. "Aşırı fark" 24 satırını elle kontrol et (CSV'de bağlantılar var).
3. "Ucuz" 141 satırı idealo/Kaufland denemesi ve reklam vitrini için aday listesi yap; önce stok ve EAN teyidi.
4. Pahalı 135 satır için hedef: tipik fiyatın altı, ya da bu ürünleri fiyat karşılaştırma kanallarının dışında tut.
