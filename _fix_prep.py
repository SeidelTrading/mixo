"""Sorunlu ürünler için bulunan aday fotoğrafları inceleme sayfalarına dizer.
Girdi: _verify/fix_R.json (sorgu -> [[başlık, bing küçük görsel kimliği], ...]), _verify/fix_q.txt
Çıktı: _verify/fix/c/<kimlik>.jpg (adaylar), _verify/fix/sheets/NNN.jpg + NNN.json (sayfa başına 8 ürün)
Çalıştır: python3 _fix_prep.py"""
import json, os, re, textwrap, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont

os.chdir(os.path.dirname(os.path.abspath(__file__)))
CDN = 'https://cdn.shopify.com/s/files/1/0799/7639/9006/files/'
P = json.load(open('_verify/problems_882.json'))
Q = open('_verify/fix_q.txt').read().split('|')
R = json.load(open('_verify/fix_R.json'))
assert len(P) == len(Q)
os.makedirs('_verify/fix/c', exist_ok=True); os.makedirs('_verify/fix/cur', exist_ok=True); os.makedirs('_verify/fix/sheets', exist_ok=True)
SAFE = re.compile(r'^OIP\.[A-Za-z0-9_\-]+$')
items = []
for p, q in zip(P, Q):
    c = [x for x in R.get(q, []) if SAFE.match(x[1])][:3]
    if c:
        items.append({'id': p['id'], 'title': p['title'], 'vendor': p['vendor'], 'tur': p['tur'], 'img': p['img'], 'q': q, 'cands': c})
print('aday bulunan ürün', len(items), '/', len(P), flush=True)


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 300:
        return 1
    for a in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30) as r:
                d = r.read()
            open(path, 'wb').write(d); return 1
        except Exception:
            time.sleep(1 + 2 * a)
    return 0


jobs = []
for it in items:
    jobs.append((CDN + urllib.request.quote(it['img']) + '?width=200', f"_verify/fix/cur/{it['id'][:120]}.img"))
    for _, cid in it['cands']:
        jobs.append((f'https://tse1.mm.bing.net/th/id/{cid}?pid=Api&w=474', f'_verify/fix/c/{cid}.jpg'))
jobs = list(dict.fromkeys(jobs))
with ThreadPoolExecutor(16) as ex:
    ok = sum(ex.map(lambda j: fetch(*j), jobs))
print('indirilen', ok, '/', len(jobs), flush=True)

f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 12)
CW, RH, N = 190, 200, 8
for s in range(0, len(items), N):
    part = items[s:s + N]
    im = Image.new('RGB', (CW * 4 + 330, RH * len(part)), 'white'); d = ImageDraw.Draw(im); meta = []
    for j, it in enumerate(part):
        y = j * RH
        d.rectangle((0, y, im.width - 1, y + RH - 1), outline=(200, 200, 200))
        d.text((6, y + 4), f'{j}', fill=(200, 30, 30), font=fb)
        paths = [f"_verify/fix/cur/{it['id'][:120]}.img"] + [f'_verify/fix/c/{c[1]}.jpg' for c in it['cands']]
        for k, pth in enumerate(paths):
            x = k * CW
            try:
                t = Image.open(pth).convert('RGBA'); bg = Image.new('RGBA', t.size, 'white'); bg.alpha_composite(t)
                t = bg.convert('RGB'); t.thumbnail((170, 170)); im.paste(t, (x + 18 + (170 - t.width) // 2, y + 4 + (170 - t.height) // 2))
            except Exception:
                d.text((x + 60, y + 80), 'YOK', fill='red', font=fb)
            d.text((x + 22, y + 180), 'MEVCUT' if k == 0 else f'ADAY {k}', fill=(120, 120, 120) if k == 0 else (30, 60, 200), font=fb)
        x = CW * 4 + 6
        for n, l in enumerate(textwrap.wrap(it['title'], 46)[:3]):
            d.text((x, y + 6 + n * 14), l, fill='black', font=fb)
        for k, c in enumerate(it['cands']):
            for n, l in enumerate(textwrap.wrap(f'{k + 1}: {c[0]}', 52)[:2]):
                d.text((x, y + 58 + k * 44 + n * 13), l, fill=(60, 60, 60), font=f)
        meta.append({'n': j, 'id': it['id'], 'title': it['title'], 'vendor': it['vendor'], 'tur': it['tur'],
                     'cands': [{'k': k + 1, 'alt': c[0], 'cid': c[1]} for k, c in enumerate(it['cands'])]})
    k = s // N
    im.save(f'_verify/fix/sheets/{k:03d}.jpg', quality=80)
    json.dump(meta, open(f'_verify/fix/sheets/{k:03d}.json', 'w'), ensure_ascii=False)
print('sayfa', (len(items) + N - 1) // N, 'HAZIR', flush=True)
