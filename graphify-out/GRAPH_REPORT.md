# Graph Report - .  (2026-11-15)

## Corpus Check
- Corpus is ~27,869 words - fits in a single context window. You may not need a graph.

## Summary
- 283 nodes · 465 edges · 23 communities (19 shown, 4 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- app.js grubu
- server.mjs grubu
- Admin panel index.html (Outlet Demo Yone grubu
- Pazarlama (kampanya, IG hatti, sepet hat grubu
- Storefront index.html (outlet.demo) grubu
- Musteri kayip/yakalama noktalari tablosu grubu
- P grubu
- effP() grubu
- package.json grubu
- MixOutlet satis platformu ve musteri ana grubu
- Canliya gecis mimarisi (/events, /recomm grubu
- track() olay kaydi grubu
- profile() profil cikarimi grubu
- isPending() grubu
- dashboard() grubu
- _build.py grubu
- cleanOverride() grubu
- Filter paneli (kategori, fiyat, marka, s grubu
- marketing.mjs grubu
- _fix_prep.py grubu
- _verify_prep.py grubu
- Demobar uyari seridi grubu

## God Nodes (most connected - your core abstractions)
1. `Storefront index.html (outlet.demo)` - 35 edges
2. `Admin panel index.html (Outlet Demo Yonetim)` - 17 edges
3. `P` - 16 edges
4. `runTool()` - 16 edges
5. `Pazarlama (kampanya, IG hatti, sepet hatirlatma)` - 13 edges
6. `Koyu kenar cubugu menu` - 12 edges
7. `effP()` - 11 edges
8. `track()` - 10 edges
9. `renderGrid()` - 10 edges
10. `add()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Ziyaretci analizi (huni, aramalar, sifir sonuc)` --semantically_similar_to--> `Kundenanalyse (Demo) paneli`  [INFERRED] [semantically similar]
  demo/admin/index.html → docs/satis-ve-analiz-mimarisi.md
- `Demo kasa modal (co-sheet)` --semantically_similar_to--> `Sade odeme (misafir, PayPal/Klarna/kart)`  [INFERRED] [semantically similar]
  demo/index.html → docs/satis-ve-analiz-mimarisi.md
- `Pazarlama (kampanya, IG hatti, sepet hatirlatma)` --implements--> `Sepet tarayicida saklanir, izinli e-posta hatirlatma`  [INFERRED]
  demo/admin/index.html → docs/satis-ve-analiz-mimarisi.md
- `Onay kuyrugu (sorunlu urunler)` --implements--> `Gorsel denetimi (sorunlu urunler listenin sonuna)`  [INFERRED]
  demo/admin/index.html → docs/satis-ve-analiz-mimarisi.md
- `Ziyaretci analizi (huni, aramalar, sifir sonuc)` --shares_data_with--> `Saatlik is: profil, huni, sifir sonuclu arama`  [INFERRED]
  demo/admin/index.html → docs/satis-ve-analiz-mimarisi.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Storefront homepage rails/sections** — demo_index_beliebt, demo_index_fuerdich, demo_index_welten, demo_index_katalog [EXTRACTED 1.00]
- **Admin marketing tools** — demo_admin_index_tab_pazarlama, demo_admin_index_tab_instagram, demo_admin_index_api_mk_ig_queue [INFERRED 0.85]
- **Consent to track to profile flow** — docs_satis_ve_analiz_mimarisi_consent_gate, docs_satis_ve_analiz_mimarisi_track_function, docs_satis_ve_analiz_mimarisi_profile_function [EXTRACTED 1.00]

## Communities (23 total, 4 thin omitted)

### Community 0 - "app.js grubu"
Cohesion: 0.12
Nodes (39): add(), applyUrl(), card(), closeAll(), closeModal(), commitSearch(), del(), endView() (+31 more)

### Community 1 - "server.mjs grubu"
Cohesion: 0.06
Nodes (32): initInstagram(), actions, BUDGET_POOL, CHANGES_FILE, CONTENT_KEYS, convs, cookie(), EVENT_TYPES (+24 more)

### Community 2 - "Admin panel index.html (Outlet Demo Yone grubu"
Cohesion: 0.07
Nodes (37): Admin panel index.html (Outlet Demo Yonetim), AI Asistan yuzen sohbet, /api/admin/analytics?days=, /api/admin/announcement, /api/admin/assistant, /api/admin/category, /api/admin/content, /api/admin/customers (+29 more)

### Community 3 - "Pazarlama (kampanya, IG hatti, sepet hat grubu"
Cohesion: 0.11
Nodes (18): /api/admin/instagram/draft, /api/admin/instagram/post-edit, /api/admin/instagram/reply-edit, /api/admin/instagram/simulate, /api/admin/instagram/state, /api/admin/instagram/suggest, /api/admin/marketing/campaign-apply, /api/admin/marketing/ig-preview (+10 more)

### Community 4 - "Storefront index.html (outlet.demo) grubu"
Cohesion: 0.11
Nodes (18): Storefront index.html (outlet.demo), Konto popover, Hero banner Dein Alltag. Deine Auswahl., Beliebt rail, Marken marquee, Budget bolumu, Sol kategori listesi, CSS tasarim tokenlari (navy, blue, sun, coral, Fraunces/Inter) (+10 more)

### Community 5 - "Musteri kayip/yakalama noktalari tablosu grubu"
Cohesion: 0.12
Nodes (16): /api/admin/approve, /api/admin/approve-filter, /api/admin/clear, /api/admin/problems, /api/admin/problems.csv, Onay kuyrugu (sorunlu urunler), Demo kasa modal (co-sheet), Urun modal + benzer urunler (+8 more)

### Community 6 - "P grubu"
Cohesion: 0.24
Nodes (15): analytics(), assistant(), filterProblems(), HAY, hayOf(), listProducts(), maybePending(), norm() (+7 more)

### Community 7 - "effP() grubu"
Cohesion: 0.26
Nodes (13): createOrder(), effP(), freeShip(), hiddenCounts(), hiddenIds(), isHidden(), pickDiverse(), PREMIUM_POOL (+5 more)

### Community 8 - "package.json grubu"
Cohesion: 0.18
Nodes (10): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk, engines, node, name, private, scripts (+2 more)

### Community 9 - "MixOutlet satis platformu ve musteri ana grubu"
Cohesion: 0.20
Nodes (11): Warenkorb drawer + ucretsiz kargo cubugu, Iskelet kartlar (yukleme), Search suggest dropdown, Zuletzt angesehen bolumu, MixOutlet satis platformu ve musteri analiz mimarisi, Karanlik desenler yapilmiyor (sahte sayac, uydurma stok), Ucretsiz kargo cubugu + fark kapatan urun onerisi, Durust dopamin mekanizmalari (+3 more)

### Community 10 - "Canliya gecis mimarisi (/events, /recomm grubu"
Cohesion: 0.25
Nodes (9): Olay tablosu Postgres/ClickHouse, /events toplu gonderim 5sn, Dort metrik + A/B testi, Saatlik is: profil, huni, sifir sonuclu arama, Kimlik: cerez kimligi, giriste hesapla birlesme, Canliya gecis mimarisi (/events, /recommend), /recommend?user=, Saklama: ham olay 13 ay, silme talebi tek sorgu (+1 more)

### Community 11 - "track() olay kaydi grubu"
Cohesion: 0.25
Nodes (8): app.js istemci mantigi, Consent banner, data/featured.js, data/index.js, Onay (Einverstanden) TTDSG 25 / GDPR, Olay kaydi localStorage son 500 olay, Izlenen olaylar listesi, track() olay kaydi

### Community 12 - "profile() profil cikarimi grubu"
Cohesion: 0.25
Nodes (8): Fur dich bolumu, Kundenanalyse insights drawer, Davranis etiketleri (fiyata duyarli, markaya bagli...), Musteri asamalari Neu..Kaufbereit, Fur dich seridi (kisisel oneri), Kundenanalyse (Demo) paneli, profile() profil cikarimi, Puanlama: goruntuleme 1, 12sn 1, favori 3, sepet 5, 7 gun yarilanma

### Community 13 - "isPending() grubu"
Cohesion: 0.40
Nodes (5): adminItem(), baseOf(), isPending(), isProblem(), PROBLEM_IDS

### Community 14 - "dashboard() grubu"
Cohesion: 0.50
Nodes (5): customers(), dashboard(), liveOrders(), money(), orderRow()

### Community 15 - "_build.py grubu"
Cohesion: 0.67
Nodes (3): brand(), main(), _raw/all/*.json -> demo/data/ (index.js, featured.js, parça dosyaları). Çalıştır

### Community 16 - "cleanOverride() grubu"
Cohesion: 0.50
Nodes (4): cleanContent(), cleanOverride(), OV_KEYS, toNum()

### Community 17 - "Filter paneli (kategori, fiyat, marka, s grubu"
Cohesion: 0.67
Nodes (3): Filter paneli (kategori, fiyat, marka, stok), Katalog: filtre paneli + sonuc grid, Sol filtre paneli (kategori, fiyat, marka, stok)

## Knowledge Gaps
- **93 isolated node(s):** `name`, `private`, `type`, `start`, `node` (+88 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Storefront index.html (outlet.demo)` connect `Storefront index.html (outlet.demo) grubu` to `Admin panel index.html (Outlet Demo Yone grubu`, `Musteri kayip/yakalama noktalari tablosu grubu`, `MixOutlet satis platformu ve musteri ana grubu`, `track() olay kaydi grubu`, `profile() profil cikarimi grubu`, `Filter paneli (kategori, fiyat, marka, s grubu`, `Demobar uyari seridi grubu`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `Admin panel index.html (Outlet Demo Yonetim)` connect `Admin panel index.html (Outlet Demo Yone grubu` to `Pazarlama (kampanya, IG hatti, sepet hat grubu`, `Musteri kayip/yakalama noktalari tablosu grubu`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `Koyu kenar cubugu menu` connect `Admin panel index.html (Outlet Demo Yone grubu` to `Pazarlama (kampanya, IG hatti, sepet hat grubu`, `Musteri kayip/yakalama noktalari tablosu grubu`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _93 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app.js grubu` be split into smaller, more focused modules?**
  _Cohesion score 0.11522198731501057 - nodes in this community are weakly interconnected._
- **Should `server.mjs grubu` be split into smaller, more focused modules?**
  _Cohesion score 0.05731707317073171 - nodes in this community are weakly interconnected._
- **Should `Admin panel index.html (Outlet Demo Yone grubu` be split into smaller, more focused modules?**
  _Cohesion score 0.06606606606606606 - nodes in this community are weakly interconnected._