"""docs/parfum-fiyat-kiyasi-2026-11-15.csv -> demo/sunum/analiz.html
Çalıştır: python3 html_yap.py   (Mixo/_fiyat içinde)"""
import csv, json, statistics as st, html

R = list(csv.DictReader(open('../docs/parfum-fiyat-kiyasi-2026-11-15.csv', encoding='utf-8-sig'), delimiter=';'))
ST = ['pahalı', 'aşırı fark (kontrol)', 'piyasada', 'ucuz', 'fiyat bulunamadı']
KEY = {'pahalı': 'p', 'aşırı fark (kontrol)': 'a', 'piyasada': 'n', 'ucuz': 'u', 'fiyat bulunamadı': 'x'}
cnt = {s: sum(r['durum'] == s for r in R) for s in ST}
ok = [r for r in R if r['fark_yuzde'] and r['durum'] != 'aşırı fark (kontrol)']
f = lambda r: float(r['fark_yuzde'])
b = lambda r: float(r['bizim'])
BANDS = [('Tam 69,00 €', lambda r: b(r) == 69), ('45 € ve altı', lambda r: b(r) <= 45),
         ('45–100 € (69,00 hariç)', lambda r: 45 < b(r) <= 100 and b(r) != 69),
         ('100–200 €', lambda r: 100 < b(r) <= 200), ('200 € üstü', lambda r: b(r) > 200)]
eur = lambda v: f'{float(v):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.') + ' €'
pct = lambda v: ('+' if v > 0 else '−' if v < 0 else '') + '%' + str(abs(round(v)))
band_rows = ''
for name, sel in BANDS:
    s = [r for r in ok if sel(r)]; n = len(s)
    p, m, u = (sum(r['durum'] == k for r in s) for k in ('pahalı', 'piyasada', 'ucuz'))
    med = st.median(f(r) for r in s)
    seg = ''.join(f'<i class="{c}" style="width:{100*v/n:.1f}%" title="{t}: {v}"></i>' for c, v, t in (('p', p, 'pahalı'), ('n', m, 'piyasada'), ('u', u, 'ucuz')) if v)
    band_rows += f'<tr><td>{name}</td><td class="r">{n}</td><td class="r"><b class="{"tp" if med > 15 else "tu" if med < -15 else ""}">{pct(med)}</b></td><td class="barcell"><span class="bar">{seg}</span></td><td class="r">{p}</td><td class="r">{m}</td><td class="r">{u}</td></tr>'

def ex(title_part):
    r = next(x for x in R if title_part.lower() in x['urun'].lower() and x['tipik'])
    return f'<tr><td>{html.escape(r["urun"].split(" – ")[0])}</td><td class="r">{eur(r["bizim"])}</td><td class="r">{eur(r["tipik"])}</td><td class="r"><b class="{"tp" if f(r) > 0 else "tu"}">{pct(f(r))}</b></td></tr>'
EXP = ['Bvlgari Man In Black', 'Black Opium Eau de Parfum 90', 'Fahrenheit Le Eau', 'Dior Dune', 'Khamrah Eau de Parfum 100', 'Zimaya Sharaf', 'Honor & Glory']
EXU = ['I Want Choo Eau de Parfum 100', 'Mon Paris Eau de Parfum 90', 'Gorgeous Gardenia Eau de Parfum 100', 'When the Rain Stops', 'Ange ou Démon Le Secret']
exp_rows = ''.join(ex(t) for t in EXP); exu_rows = ''.join(ex(t) for t in EXU)

data = [[r['marka'], r['urun'], float(r['bizim']), float(r['tipik']) if r['tipik'] else None, float(r['en_dusuk']) if r['en_dusuk'] else None,
         r['en_dusuk_magaza'], r['ulke'], int(r['fark_yuzde']) if r['fark_yuzde'] else None, KEY[r['durum']],
         r['url'] if r['url'].startswith(('http://', 'https://')) else '', int(r['teklif'] or 0)] for r in R]
blob = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
priced = len(R) - cnt['fiyat bulunamadı']
med_all = st.median(f(r) for r in ok)
over = [r for r in R if r['fark_yuzde'] and f(r) > 15]
over_sum = round(sum(b(r) - float(r['tipik']) for r in over))
n69 = sum(b(r) == 69 for r in R)
de = sum(r['ulke'] == 'DE' for r in R if r['tipik']); single = sum(r['teklif'] == '1' for r in R)

T = open('analiz_sablon.html', encoding='utf-8').read()
for k, v in dict(TOPLAM=len(R), FIYATLI=priced, MEDYAN=pct(med_all), PAHALI=cnt['pahalı'], ASIRI=cnt['aşırı fark (kontrol)'], PIYASADA=cnt['piyasada'],
                 UCUZ=cnt['ucuz'], YOK=cnt['fiyat bulunamadı'], N69=n69, BANDS=band_rows, EXP=exp_rows, EXU=exu_rows, OVERN=len(over),
                 OVERSUM=f'{over_sum:,}'.replace(',', '.'), DE=de, TEK=single, DATA=blob).items():
    T = T.replace('{{' + k + '}}', str(v))
assert '{{' not in T, T[T.index('{{'):][:40]
open('../demo/sunum/analiz.html', 'w', encoding='utf-8').write(T)
print('yazıldı', len(T) // 1024, 'KB', cnt)
