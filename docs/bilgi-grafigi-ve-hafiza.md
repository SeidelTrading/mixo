# Bilgi grafiği ve Cognee hafızası

Durum: 2026-11-15. Bu belge proje bilgisinin nerede tutulduğunu ve nasıl yenilendiğini anlatır.

## 1. Graphify grafiği (`graphify-out/`)

| Dosya | Ne |
|---|---|
| `graph.json` | Ham grafik (≈283 düğüm, ≈465 kenar, 23 topluluk) |
| `graph.html` | Tarayıcıda açılan etkileşimli görünüm |
| `GRAPH_REPORT.md` | Önemli düğümler, topluluklar, önerilen sorular |
| `semantic.json` | Belgelerden (`docs/`, iki HTML) LLM ile çıkarılmış düğüm ve kenarlar; yenilemede olduğu gibi kullanılır |
| `refresh.py` | Grafiği baştan kurar |

**Kapsam:** `demo/server.mjs`, `app.js`, `index.html`, `instagram.mjs`, `marketing.mjs`, `admin/index.html`, `Dockerfile`, `package.json`, kökteki `_*.py`, `docs/*.md`.
**Dışarıda:** `demo/data/`, `demo/img/`, `demo/data.js`, `demo/admin-data/`, `demo/store/`, `_raw/`, `_verify/`, `node_modules`.

Yenileme (Mixo klasöründen; kaynakları geçici klasöre kopyalar, kaynağa yazmaz):

```bash
python3 graphify-out/refresh.py
```

Kod AST ile her seferinde yeniden çıkarılır (ücretsiz). Belgeler (`docs/`, HTML'ler) değiştiyse `semantic.json` eskir; `/graphify` becerisiyle belge parçası yeniden çıkarılıp bu dosya güncellenmeli. Ayrıca yeni dosya eklendiyse `refresh.py` içindeki `FILES` listesine ekleyin.

Sorgu:

```bash
graphify query "onay kuyruğu sorunlu ürünler"
graphify explain "Onay kuyrugu (sorunlu urunler)"
```

Not: Anlamsal (HTML/belge) düğüm adları ASCII'ye çevrilmiş Türkçedir ("kuyrugu", "urunler"); sorguda her iki yazımı deneyin. Kod düğümleri (`approve_products` gibi) AST'den gelir; sunucu fonksiyonlarının çoğu `demo/server.mjs` içinde nesne yöntemi olduğundan grafikte görünmeyebilir.

## 2. Cognee hafızası

Kategori: `project` (`project_docs`). Dört not, başlıkları `MIXO-OUTLET-DEMO / ...` ile başlar:

1. **MİMARİ** — dosyalar ve görevleri, veri satırı biçimi.
2. **YÖNETİCİ API VE VERİ DÜZENİ** — uçlar, `settings.json`, `changes.jsonl`, `events.jsonl`, `orders.json`, `DATA_DIR`.
3. **YAYIN VE KARARLAR** — Railway proje/servis, marka adı, onay kuyruğu, `img/fix/`, karanlık desen yok.
4. **BİLİNEN EKSİKLER VE RİSKLER** — "canlıda gerekir" listesi, doğrulanmamışlar.

"Doğrulanmadı" işaretliler: Railway volume'un bağlı olup olmadığı, `demo/data.js`'in kullanımı, `admin/index.html`'de kalan tek "mixoutlet" geçişi.

Yeni oturumda sorgu: Cognee otomatik hatırlatma yapar; elle aramak için `cognee-memory:cognee-search` becerisi ya da

```bash
~/.claude/plugins/cache/cognee/cognee-memory/0.2.0/scripts/cognee-search.sh "MIXO-OUTLET-DEMO yayın Railway" 5 --graph
```

Notlar anlık görüntüdür (başka oturum `demo/` altında yazıyordu); kod değişince ilgili notu yeniden yazın. Gizli değer (API anahtarı, parola, token) hiçbir yere yazılmaz.
