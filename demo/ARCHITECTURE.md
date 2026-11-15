# Mixo demo: mimari (kısa)

Tek süreçli Node 22 uygulaması (`node:sqlite`). Giriş noktası `server.mjs` (≈25 satır): HTTP sunucusunu açar, iş kuyruğunu başlatır, kapanışta veritabanını kapatır.

```
server.mjs            giriş: createServer(handle), sinyaller, jobs'ı yükler
lib/                  config · store (SQLite + AsyncLocalStorage) · auth (parola, oturum, istemci adresi, hız sınırı) · http (send, readBody, güvenlik başlıkları, statik dosya) · ai (Claude istemcisi) · cache
services/             iş mantığı (HTTP bilmez)
  catalog             katalog (≈45 bin ürün) ve sorunlu ürün listesi
  settings            ayarlar, değişiklik günlüğü (logChange), hooks (modüller arası gevşek bağ)
  overrides           ürün/içerik düzenlemesi doğrulama ve etkin ürün (effP)
  actions             mağazayı değiştiren tüm işlemler + geri alma
  visibility          gizli/onay bekleyen mantığı, arama, listeleme
  pricing · orders    kargo/para · sipariş, müşteri, pano
  storefront          vitrin ana sayfası
  analytics           olay toplama ve analiz
  assistant*          Claude asistanı: araç tanımı (assistant-tools), işleyici tablosu (tool-handlers), onay kapısı (assistant-gate), sohbet döngüsü (assistant)
  channels            Instagram ve pazarlama modüllerinin bağlanması (instagram.mjs, marketing.mjs)
routes/               uçlar: handler.mjs sıra ve yetki kapılarını yönetir; public · admin-auth · admin-me · admin-system · admin-data · admin-store · admin-assistant
jobs/                 kalıcı iş kuyruğu (yedek, temizlik, sipariş doğrulama e-postası ve iptali)
app.js + app/        Vitrin (tarayıcı): app.js yükleyici; app/*.js bölümleri sırayla çalıştırır (core, behavior, catalog, cards, url, grid, cart, modal, personal, events, boot). Bölümler ortak adları `Ctx` ile paylaşır; yeniden atanan değişkenler `Ctx.S` içindedir. Klasik betik: file:// ile de çalışır
db.mjs + db/          SQLite: db.mjs açar ve birleştirir; db/ altında şema, belgeler, kayıtlar (sipariş/günlük/olay), hesaplar, iş kuyruğu, yedek, eski veri içe aktarma, doğrulama/geri yükleme
instagram.mjs + instagram/   Instagram modülü: içerik, taslak, bayrak, yayın, yanıt, gelen kutusu/webhook, görünüm, yönetici uçları (route tablosu)
marketing.mjs + marketing/   Pazarlama modülü: öneri, Instagram köprüsü, kurallar, hatırlatma, izin, yönetici uçları (route tablosu)
```

## Kurallar

- Bağımlılık yönü: `routes → services → lib`. `services` HTTP'yi bilmez; `lib` hiçbir `services` modülünü içe aktarmaz.
- Döngüsel içe aktarma yok. Modüller arası geri çağrı gerektiğinde `services/settings.mjs` içindeki `hooks` nesnesi kullanılır (ör. `hooks.orderPlaced`, `hooks.runJobs`). Döngü denetimi: bkz. aşağıdaki komut.
- Yeni uç: ilgili `routes/*.mjs` dosyasına ekle. İşleyici bağlamı `c = { req, res, url, p, ip, secure, auth, body, me }` alır; eşleşmezse hiçbir şey yazmadan döner, yanıt yazılırsa zincir durur.
- Fabrika modüller (`instagram`, `marketing`) ortak bağlamı `c` nesnesiyle gruplara dağıtır: her grup `makeX(c)` ile yalnız kullandığı adları alır, ürettiklerini döndürür. Yönetici uçları `GET`/`POST` route tablosudur.
- Her yazma işlemi `actions` içinden geçer (günlük + geri alma). Yeni asistan aracı: `assistant-tools.mjs` (tanım) + `tool-handlers.mjs` (işleyici); birim testi ikisinin eşleştiğini denetler.

## Geliştirme

```bash
npm run check        # lint + biçim + tip + birim + uçtan uca (Node >= 22.13; .nvmrc: 22)
npm run test:unit    # node:test
npm run test:e2e     # sunucuyu geçici DATA_DIR ile başlatıp 80+ denetim yapar
npm run test:browser # Playwright/Chromium vitrin duman testi
npm run test:coverage
```

CI: `.github/workflows/ci.yml` (lint, biçim, tip, birim, uçtan uca, `npm audit`).

## Bilinen sınırlar

Tek süreç ve tek disk (yatay ölçek yok); siparişler ve olaylar bellekte tutuluyor; `instagram/admin.mjs` ve `marketing/suggest.mjs` işlevleri hâlâ 150 satırı aşıyor (ESLint uyarısı olarak görünür); vitrin bölümleri (`app/events.js` 340 satır) hâlâ büyük; tarayıcı duman testi (`npm run test:browser`) 16 denetim yapar.
