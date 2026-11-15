Görev: parfüm piyasa fiyatı toplama (yalnız web araması; hiçbir siteye form gönderme, hesap açma yok).

Girdi: /home/wpu/Desktop/Urunler/Mixo/_fiyat/in/bNN.json — her kayıt {id, title, price}. `price`, mixoutlet.de'nin EUR fiyatı.
Çıktı: /home/wpu/Desktop/Urunler/Mixo/_fiyat/out/bNN.json (yalnız bu dosyayı yaz; başka dosyaya dokunma).

Her ürün için:
1. WebSearch ile Almanca ara: ürün adı + boyut + "Preis" (ör. `Versace Versense Eau de Toilette 100 ml Preis`). Ürün başına YALNIZ 1 arama (ortak arama kotası dar; ikinci arama yapma). Aramaları tek tek, sırayla yap; paralel arama gönderme. "too_many_requests" gelirse aynı sorguyu bir kez yeniden dene. Kota dolduğu bildirilirse dur, o ana kadarkini yaz ve aranmayan kayıtların notuna tam olarak "ARANMADI" yaz. Arama aracı yüklü değilse önce ToolSearch ile "select:WebSearch" yükle. Sayfa açma (WebFetch) yapma; yalnız arama özetlerini kullan.
2. Yalnızca AYNI ürün için fiyat al: aynı marka, aynı koku adı, aynı konsantrasyon (Eau de Parfum / Eau de Toilette / Parfum / Extrait ayrıdır; "Intense", "Elixir", "Absolu", "Le Parfum" gibi ekler ayrı üründür) ve AYNI ml. Farklı boy, set, tester, numune/dekant (abfüllung) fiyatlarını alma. Başlıkta ml yoksa status "bulunamadi" yaz.
3. Yalnız EUR fiyat. Önce Almanya mağazaları (.de alan adları, kaufland.de, idealo.de, amazon.de, ebay.de, douglas.de, flaconi.de, notino.de, parfumdreams.de). Almanya teklifi yoksa başka euro bölgesi mağazası kabul, ama "country" alanına ülke kodunu yaz. Kupon kodlu fiyatı değil, liste/satış fiyatını al.
4. En fazla 3 teklif kaydet: en düşük ve tipik olanlar. İkinci el, açık kutu, hasarlı teklifleri alma.
5. Emin değilsen ya da fiyat çıkmadıysa status "bulunamadi". ASLA tahmin etme, ezberden fiyat yazma; yalnız bu oturumdaki arama sonuçlarında gördüğün rakamı yaz.

Çıktı biçimi: geçerli JSON dizi, girdideki her kayıt için bir kayıt:
{"id": <aynı id, sayı>, "status": "bulundu" | "bulunamadi", "offers": [{"shop": "...", "country": "DE", "price": 48.15, "url": "...", "matched_title": "sonuçta görünen ürün adı ve ml"}], "note": "kısa not"}

Her 10 üründe bir dosyayı yeniden yaz (yarıda kesilirse iş kaybolmasın). Bitince yalnızca şunu bildir: kaç ürün bulundu / bulunamadı ve varsa sorunlar (en fazla 3 cümle). Fiyat listesini mesajda tekrarlama.
