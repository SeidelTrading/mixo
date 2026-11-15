"""_raw/all/*.json -> demo/data/ (index.js, featured.js, parça dosyaları).
Çalıştır: python3 _build.py   (Mixo klasöründe)"""
import json, os, re, glob, shutil, collections

CHUNK = 500
CDN = 'https://cdn.shopify.com/s/files/1/0799/7639/9006/files/'
CATS = [('uhren', 'Uhren'), ('parfum', 'Parfum & Düfte'), ('technik', 'Technik'), ('drucker', 'Drucker & Büro'),
        ('wohnen', 'Wohnen & Haushalt'), ('schmuck', 'Schmuck'), ('mode', 'Mode'), ('pflege', 'Körperpflege'),
        ('freizeit', 'Spielzeug & Freizeit'), ('genuss', 'Genuss & Mehr')]
J = 'mixoutlet-jtl-category-'
# öncelik sırası: bir ürün ilk eşleşen koleksiyonun kategorisine girer (özelden genele)
MAP = [
    (J+'196', 'parfum', 'Damendüfte'), (J+'195', 'parfum', 'Herrendüfte'), ('unisexduefte', 'parfum', 'Unisexdüfte'),
    ('parfum-sets', 'parfum', 'Parfum-Sets'), ('parfum-nachfuellungen', 'parfum', 'Nachfüllungen'),
    ('haarduefte', 'parfum', 'Haardüfte'), (J+'194', 'parfum', 'Raumdüfte'), (J+'12', 'parfum', 'Weitere Düfte'),
    ('damenuhren', 'uhren', 'Damenuhren'), ('herrenuhren', 'uhren', 'Herrenuhren'), ('unisexuhren', 'uhren', 'Unisexuhren'),
    ('kinderuhren', 'uhren', 'Kinderuhren'), ('smartwatches', 'uhren', 'Smartwatches'), ('buero-smartwatch', 'uhren', 'Smartwatches'),
    ('wohnraumuhren', 'uhren', 'Wohnraumuhren'),
    ('schmuck-armbander', 'schmuck', 'Armbänder'), ('schmuck-halsketten', 'schmuck', 'Halsketten'),
    ('schmuck-ohrringe', 'schmuck', 'Ohrringe'), ('schmuck-ringe', 'schmuck', 'Ringe'), ('schmuck', 'schmuck', 'Weiterer Schmuck'),
    (J+'184', 'drucker', 'Toner'), ('buero-toner', 'drucker', 'Toner'), (J+'25', 'drucker', 'Tintenpatronen'),
    ('buero-ink', 'drucker', 'Tintenpatronen'), (J+'69', 'drucker', 'Trommeln'), (J+'155', 'drucker', '3D-Druck'),
    ('buero-printers', 'drucker', 'Drucker & Scanner'), ('buero-print_accessory', 'drucker', 'Druckerzubehör'),
    ('buero-paper', 'drucker', 'Bürobedarf'), ('buero-adhesive', 'drucker', 'Bürobedarf'),
    ('buero-presentation', 'drucker', 'Bürobedarf'), ('buero-office_furniture', 'drucker', 'Bürobedarf'),
    (J+'65', 'technik', 'Handyhüllen'), (J+'32', 'technik', 'Ladegeräte & Strom'), ('buero-power', 'technik', 'Ladegeräte & Strom'),
    ('buero-phone_accessories', 'technik', 'Handyzubehör'), ('buero-phones', 'technik', 'Smartphones & Telefone'),
    ('buero-computers', 'technik', 'Computer & Notebooks'), ('buero-components', 'technik', 'Komponenten'),
    ('buero-input_devices', 'technik', 'Maus & Tastatur'), ('buero-mousepad', 'technik', 'Maus & Tastatur'),
    ('buero-audio', 'technik', 'Audio'), ('buero-displays', 'technik', 'Monitore & Projektion'),
    ('buero-display_accessories', 'technik', 'Bildschirmzubehör'), ('buero-storage', 'technik', 'Datenspeicher'),
    ('buero-network', 'technik', 'Netzwerk'), ('buero-cameras', 'technik', 'Kameras'),
    ('buero-computer_accessories', 'technik', 'Computerzubehör'),
    (J+'31', 'technik', 'Kabel & Adapter'), ('buero-cables', 'technik', 'Kabel & Adapter'), (J+'180', 'technik', 'Kabel & Adapter'),
    (J+'136', 'wohnen', 'Küche'), ('buero-kitchen', 'wohnen', 'Küche'), (J+'144', 'wohnen', 'Werkzeuge'),
    ('buero-tools', 'wohnen', 'Werkzeuge'), ('buero-lighting', 'wohnen', 'Beleuchtung'),
    ('buero-electrical', 'wohnen', 'Elektroinstallation'), ('buero-garden', 'wohnen', 'Garten'),
    (J+'137', 'wohnen', 'Haushalt & Reinigung'), ('buero-household', 'wohnen', 'Haushalt & Reinigung'),
    ('buero-cleaning', 'wohnen', 'Haushalt & Reinigung'), ('buero-climate', 'wohnen', 'Haushalt & Reinigung'),
    (J+'192', 'mode', 'Socken'), ('buero-bags', 'mode', 'Taschen & Reise'), (J+'79', 'mode', 'Taschen & Reise'),
    (J+'13', 'mode', 'Kleidung & Accessoires'),
    ('aftershave-rasurpflege', 'pflege', 'Aftershave & Rasur'), ('gesundheit-alltagshilfen', 'pflege', 'Gesundheit & Alltag'),
    (J+'146', 'pflege', 'Körperpflege'), ('buero-personalcare', 'pflege', 'Körperpflege'), (J+'129', 'pflege', 'Körperpflege'),
    ('buero-toys', 'freizeit', 'Spielwaren'), (J+'148', 'freizeit', 'Spielwaren'),
    ('buero-leisure', 'freizeit', 'Freizeit & Camping'), (J+'130', 'freizeit', 'Spielzeug & Hobby'), (J+'149', 'freizeit', 'Spielzeug & Hobby'),
    ('buero-food', 'genuss', 'Kaffee & Lebensmittel'), ('lebensmittel-spezialitaeten', 'genuss', 'Spezialitäten'),
    ('babybedarf', 'genuss', 'Babybedarf'),
]
# mağazanın iç satıcı adları -> marka başlıktan türetilir
BAD = {'uhren1', 'uhren2', 'my store', '', 'mixoutlet', 'mixoutlet.de'}
MULTI = ['Calvin Hill', 'Tommy Hilfiger', 'Philip Watch', 'Philipp Plein', 'Plein Sport', 'Just Cavalli', 'Swiss Alpine Military', 'Swiss Military',
         'Michael Kors', 'Light Time', 'Armani Exchange', 'Mark Maddox', 'Emporio Armani', 'G Shock', 'Pierre Cardin',
         'Carlo Cantinaro', 'Lucien Rochat', 'Baume Mercier', 'Frederique Constant', 'Calvin Klein', 'Hip Hop', 'Tsar Bomba',
         'Avi 8', 'Skagen Denmark', 'Calypso Watches', 'Techno Line', 'Aston Martin', 'Karl Lagerfeld', 'Liu Jo', 'Paul Hewitt',
         'Rocco Barocco', 'Kenneth Cole', 'Epoque Time', 'Carl Von Zeyten', 'Kid Watch', 'Q Q', 'Hugo Boss', 'Ted Baker',
         'Daniel Wellington', 'Jacques Lemans', 'Marc Jacobs', 'Juicy Couture', 'Versus Versace', 'Paco Rabanne',
         'Jean Paul Gaultier', 'Dolce & Gabbana', 'Yves Saint Laurent', 'Carolina Herrera', 'Giorgio Armani', 'Tom Ford']
FIX = {'q q': 'Q&Q', 'liu-jo': 'Liu Jo', 'g shock': 'G-Shock', 'roccobarocco': 'Rocco Barocco'}
SKIPW = {'original', '2x', '3x', '4x', '5x'}


def brand(title):
    t = re.sub(r'\s+', ' ', title).strip()
    w = t.split(' ')
    while len(w) > 1 and w[0].lower() in SKIPW:
        w = w[1:]
    t = ' '.join(w)
    if ' DOCKS ' in f' {t} ':
        return 'DOCKS'
    if re.match(r'SUG-\d', t):
        return 'SUG'
    for m in MULTI:
        if t.lower().startswith(m.lower() + ' ') or t.lower() == m.lower():
            return FIX.get(m.lower(), m)
    b = w[0].strip(',.:') if w else ''
    if not b or re.match(r'^\d', b):
        return 'Ohne Marke'
    if b.lower() in FIX:
        return FIX[b.lower()]
    return b.title() if b.isupper() and len(b) > 3 else b


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    os.chdir(here)
    have = {os.path.basename(f)[:-5] for f in glob.glob('_raw/all/*.json')}
    mapped = {h for h, _, _ in MAP}
    print('eşlenmemiş koleksiyon:', sorted(have - mapped) or '-', '| eksik dosya:', sorted(mapped - have) or '-')
    catk = [k for k, _ in CATS]
    subs = {k: [] for k in catk}          # sub adları, ilk görülme sırasıyla
    prods = {}                            # id -> row
    order = collections.defaultdict(list)  # (cat, sub) -> [row]
    late = collections.defaultdict(list)
    low = collections.defaultdict(list)
    lowq = set(json.load(open('_verify/dusuk_kalite_ids.json'))) if os.path.exists('_verify/dusuk_kalite_ids.json') else set()
    stats = collections.Counter()
    fixes = json.load(open('_verify/fixes.json')) if os.path.exists('_verify/fixes.json') else {}   # elle/ajanla doğrulanmış düzeltmeler: {id: {img?, title?, ok?}}
    lowq -= {k for k, v in fixes.items() if v.get('img') or v.get('ok')}
    for h, cat, sub in MAP:
        if h not in have:
            continue
        for pid, handle, title, vendor, price, cmp_, avail, img, _ptype in json.load(open(f'_raw/all/{h}.json'))['rows']:
            if pid in prods:
                continue
            stats['gorulen'] += 1
            if not avail:
                stats['stokta_yok'] += 1
            if not img:
                stats['gorselsiz'] += 1; prods[pid] = None; continue
            try:
                pr = round(float(price), 2)
            except (TypeError, ValueError):
                pr = 0
            if pr <= 0:
                stats['fiyatsiz'] += 1; prods[pid] = None; continue
            was = 0
            try:
                c = round(float(cmp_), 2) if cmp_ else 0
                was = c if c > pr else 0
            except ValueError:
                pass
            v = (vendor or '').strip()
            if v.lower() in BAD:
                v = brand(title)
            im = img.split('?')[0]
            im = im[len(CDN):] if im.startswith(CDN) else im
            if sub not in subs[cat]:
                subs[cat].append(sub)
            fx = fixes.get(handle)
            if fx:
                title = fx.get('title') or title; im = fx.get('img') or im; stats['duzeltilen'] += 1
            row = [handle, re.sub(r'\s+', ' ', title).strip(), v, pr, was, im, catk.index(cat), sub]
            prods[pid] = row
            bad = handle in lowq                              # fotoğrafı ürünü göstermiyor (görsel denetim)
            if bad:
                stats['gorsel_sorunlu'] += 1
            if avail and not bad:
                order[(cat, sub)].append(row)
            elif avail:
                row += [1, 1]; low[(cat, sub)].append(row)    # 10. alan 1 = görseli sorunlu, sona atılır
            else:
                row.append(0); row += [1] if bad else []; late[(cat, sub)].append(row)   # 9. alan 0 = stokta yok
    for k2 in set(low) | set(late):    # sıra: düzgün ürünler, görseli sorunlular, stokta olmayanlar
        order[k2] += low[k2] + late[k2]
    for cat in catk:
        for r in (r for s in subs[cat] for r in order[(cat, s)]):
            r[7] = subs[cat].index(r[7])

    def interleave(lists):
        """Büyük liste küçükleri boğmasın: orantılı karıştırma."""
        lists = [l for l in lists if l]
        out = []; pos = [0] * len(lists); tot = sum(map(len, lists))
        credit = [0.0] * len(lists)
        while len(out) < tot:
            for i, l in enumerate(lists):
                credit[i] += max(len(l) / tot * len(lists), 0.15)
                while credit[i] >= 1 and pos[i] < len(l):
                    out.append(l[pos[i]]); pos[i] += 1; credit[i] -= 1
                if pos[i] >= len(l):
                    credit[i] = 0
        return out

    out = 'demo/data'
    shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    lists = {}; facets = {}; size = 0

    def emit(key, rows):
        nonlocal size
        n = 0
        for i in range(0, len(rows), CHUNK):
            s = f'MXC({json.dumps(key)},{n},{json.dumps(rows[i:i+CHUNK], ensure_ascii=False, separators=(",", ":"))})'
            open(f'{out}/{key.replace("/", "_")}-{n}.js', 'w').write(s); size += len(s.encode()); n += 1
        lists[key] = n
        bc = collections.Counter(r[2] for r in rows)
        facets[key] = {'b': bc.most_common(16), 'nb': len(bc), 'min': min((r[3] for r in rows), default=0),
                       'max': max((r[3] for r in rows), default=0), 'sale': sum(1 for r in rows if r[4])}

    cats = []; per_cat = []
    for k, label in CATS:
        sl = [order[(k, s)] for s in subs[k]]
        for i, rows in enumerate(sl):
            emit(f'{k}/{i}', rows)
        allc = interleave(sl); per_cat.append(allc); emit(k, allc)
        cats.append({'k': k, 'label': label, 'n': len(allc), 'subs': [{'name': s, 'n': len(order[(k, s)])} for s in subs[k]]})
    everything = interleave(per_cat); emit('all', everything)
    idx = {'total': len(everything), 'cats': cats, 'lists': lists, 'facets': facets}
    open(f'{out}/index.js', 'w').write('window.MX_INDEX=' + json.dumps(idx, ensure_ascii=False, separators=(',', ':')))

    # öne çıkanlar: ilk demodaki yerel fotoğraflı seçki (şeritler + "unser Fund" kutuları)
    src = open('demo/data.js').read()
    old = json.loads(src[src.index('['):src.rindex(']') + 1])
    need = lambda p: p['vendor'] == 'Chanel' or p['id'] == 'apple-a1400' or 'sauvage-edp' in p['img']
    feat = [p for p in old if p['cat'] == 'uhren'][:14] + [p for p in old if p['cat'] == 'parfum'][:16]
    feat += [p for p in old if need(p) and p not in feat]
    open(f'{out}/featured.js', 'w').write('window.MX_FEATURED=' + json.dumps(feat, ensure_ascii=False, separators=(',', ':')))

    # yönetici paneli için sorunlu ürün listesi (sunucu okur, statik olarak sunulmaz)
    if os.path.exists('_verify/bulgular.csv'):
        import csv
        byh = {r[0]: r for r in everything}
        probs = [{'id': x['urun_id'], 'title': x['baslik'], 'vendor': byh[x['urun_id']][2], 'cat': CATS[byh[x['urun_id']][6]][0], 'catLabel': x['kategori'], 'sub': x['alt_kategori'],
                  'tur': x['tur'], 'not': x['not'], 'img': byh[x['urun_id']][5]} for x in csv.DictReader(open('_verify/bulgular.csv')) if x['urun_id'] in lowq and x['urun_id'] in byh]
        os.makedirs('demo/admin-data', exist_ok=True); json.dump(probs, open('demo/admin-data/problems.json', 'w'), ensure_ascii=False)
        print('yönetici paneli sorunlu ürün kaydı:', len(probs))
    print(dict(stats)); print('toplam ürün:', len(everything), '| parça dosyası:', sum(lists.values()), '| veri boyutu MB:', round(size / 1e6, 1))
    for c in cats:
        print(f" {c['label']:<22}{c['n']:>7}  " + ', '.join(f"{s['name']} {s['n']}" for s in c['subs']))
    print('markası başlıktan türetilenlerden örnek:', collections.Counter(r[2] for r in everything if r[6] in (0, 5)).most_common(25))


main()
