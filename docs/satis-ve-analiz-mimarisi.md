# MixOutlet — satış platformu önerileri ve müşteri analiz mimarisi

Durum: 2026-11-14. Demo (`demo/`) tek sayfalık statik bir sitedir; aşağıdaki "demoda var"
satırları tarayıcıda çalışan gerçek koddur (`demo/app.js`), "canlıda gerekir" satırları
henüz yoktur.

## 1. Müşteriyi nerede yakalarız, nerede kaybederiz

| Aşama | Kaybetme nedeni | Yakalama yolu | Demoda |
|---|---|---|---|
| İlk 5 saniye | Ne satıldığı anlaşılmıyor, sayfa ağır | Net başlık, 10 kategori, arama kutusu üstte | var |
| Arama | 45 bin üründe aradığını bulamıyor, "0 sonuç" | Yazarken öneri (kategori, marka, ürün), yazım toleransı ("g-shock" = "G Shock"), boş sonuçta çıkış yolu | var |
| Liste | Çok ürün, daraltamıyor | Sol filtre paneli: kategori, alt kategori, fiyat, marka, stok; seçili filtreler tek tıkla kalkıyor | var |
| Liste | Geri tuşu / paylaşım filtreyi sıfırlıyor | Filtre ve arama adres çubuğunda; link paylaşılabilir, geri tuşu çalışıyor | var |
| Ürün | Karar veremiyor, alternatif göremiyor | Aynı alt kategoriden, yakın fiyatlı "benzer ürünler" | var |
| Ürün | Güven eksik (kargo, iade, stok) | Stok, kargo süresi ve 14 gün cayma hakkı fiyatın hemen altında | var |
| Ürün | Fotoğraf ürünü göstermiyor (kutu, logo) | Görsel denetimi; sorunlu ürünleri listenin sonuna at | denetim sürüyor |
| Sepet | Kargo ücreti sürprizi | Ücretsiz kargoya kalan tutar çubuğu + o farkı kapatan gerçek ürün önerisi | var |
| Sepet | Sepeti bırakıp gidiyor | Sepet tarayıcıda saklanır; dönüşte hatırlatma. Canlıda: izinli e-posta hatırlatması | kısmen |
| Ödeme | Zorunlu üyelik, az ödeme seçeneği | Misafir ödeme, PayPal/Klarna/kart, tek sayfa | canlıda gerekir |
| Sonrası | Tek seferlik müşteri | Sipariş takibi, yeniden sipariş (toner/mürekkep!), stok/fiyat bildirimi | canlıda gerekir |

En yüksek getirili üç iş (sırayla): **arama kalitesi**, **ödeme adımının sadeliği**,
**toner/mürekkep için "yazıcı modeline göre bul" ve yeniden sipariş**. Kataloğun üçte ikisi
teknik sarf malzemesi; bu müşteri gezmeye değil, doğru parçayı hızlı bulmaya gelir.

## 2. "Dopamin" tarafı: ne yapıyoruz, ne yapmıyoruz

Sitede kalma süresini artıran dürüst mekanizmalar (demoda var):

- **Anında geri bildirim:** sepete ekleyince rozet canlanır, favoride kalp büyür, yükleme
  sırasında iskelet kartlar görünür.
- **İlerleme hissi:** ücretsiz kargo çubuğu dolar, eşik geçilince yeşile döner.
- **Kişisel keşif:** "Für dich" şeridi, bakılan alt kategoriden ve kişinin fiyat aralığından
  daha önce görmediği ürünleri getirir; "Zuletzt angesehen" kaldığı yere döndürür.
- **Sürtünmesiz arama:** `/` tuşu aramayı açar, ok tuşlarıyla önerilerde gezilir.

Bilerek **yapmadıklarım**: sahte geri sayım, "son 2 adet" gibi uydurma stok baskısı, çıkışı
engelleyen pencere, gizli ön seçili kutular. Bunlar Almanya'da UWG ve AB DSA madde 25
kapsamında "karanlık desen" sayılır; ihtar (Abmahnung) riski taşır ve iade/şikâyet oranını
yükseltir. Gerçek stok az olduğunda bunu göstermek ise serbesttir ve işe yarar.

## 3. Müşteri analiz mimarisi

### Demoda çalışan hâli (tamamı tarayıcıda)

```
tıklama/arama/filtre ──► track()  ──► olay kaydı (localStorage, son 500 olay)
                                          │
                                          ▼
                                      profile()  ──► ilgi (kategori, marka), fiyat aralığı,
                                          │           aşama, özellikler
                          ┌───────────────┼────────────────┐
                          ▼               ▼                ▼
                     "Für dich"     sepet önerisi     Kundenanalyse paneli
```

- **Onay:** olay kaydı yalnızca kullanıcı "Einverstanden" derse başlar (TTDSG §25, GDPR).
  Reddederse yalnız sepet ve favoriler saklanır. Panelden silme ve kapatma var.
- **Olaylar:** ürün görüntüleme, kalma süresi, arama (sonuç sayısıyla), kategori, filtre,
  sıralama, favori, sepete ekleme/çıkarma, sepet açma, ödeme tıklaması, çıkış niyeti.
- **Puanlama:** görüntüleme 1, 12 sn üzeri kalma 1, favori 3, sepete ekleme 5; 7 günlük
  yarılanma ile eskiyen ilgi zayıflar.
- **Aşama:** Neu → Stöbert → Vergleicht (aynı alt kategoride 3+ ürün) → Entscheidet
  (sepette ürün) → Zögert (ürün çıkardı, çıkmaya yeltendi ya da sepetle geri döndü) →
  Kaufbereit (ödemeye tıkladı). Her aşamanın önerilen bir sonraki adımı panelde yazar.
- **Özellikler:** fiyata duyarlı, markaya bağlı, hedefe yönelik (arayan), keşifçi,
  favori biriktiren. Bunlar davranıştan türetilen etiketlerdir, psikolojik teşhis değildir.

Paneli görmek için: sayfanın altında **Kundenanalyse (Demo)** ya da üstteki kişi simgesi.

### Canlıya geçiş (henüz yok)

```
Tarayıcı (onaylı) ──► /events (toplu, 5 sn'de bir)  ──► olay tablosu (Postgres / ClickHouse)
                                                             │ saatlik iş
                          ┌──────────────────────────────────┼───────────────────────┐
                          ▼                                  ▼                       ▼
                 müşteri profili tablosu            huni ve arama raporu     "0 sonuçlu aramalar"
                 (ilgi, fiyat bandı, aşama)         (aşama aşama kayıp)      (eksik ürün / eş anlamlı)
                          │
                          ▼
            /recommend?user=…  ──► ana sayfa, ürün sayfası, sepet, e-posta
```

- **Kimlik:** giriş yoksa çerezdeki rastgele kimlik; girişte hesapla birleştirilir.
- **Mağaza Shopify üzerinde:** olaylar için Shopify Web Pixel + müşteri olayları, öneriler
  için Search & Discovery kullanılabilir; ayrı bir sunucu ancak bunlar yetmezse kurulmalı.
- **Ölçülecek dört sayı:** arama → ürün tıklama oranı, ürün → sepet oranı, sepet → ödeme
  oranı, 30 günde geri dönen müşteri oranı. Her değişiklik A/B testiyle bu dördüne bakılarak
  kabul edilir.
- **Saklama:** ham olay 13 ay, sonra yalnız toplamlar. Profil silme talebi tek sorguyla
  karşılanabilmeli.
