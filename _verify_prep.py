"""Görsel doğrulama hazırlığı: tüm ürünlerin küçük görsellerini indirir (_verify/t/),
kategori sırasıyla 10x10'luk etiketli sayfalara dizer (_verify/sheets/NNNN.jpg + NNNN.json).
Yarıda kesilirse kaldığı yerden devam eder.  Çalıştır: python3 _verify_prep.py"""
import json, glob, os, sys, textwrap, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont

os.chdir(os.path.dirname(os.path.abspath(__file__)))
CDN = 'https://cdn.shopify.com/s/files/1/0799/7639/9006/files/'
idx = json.loads(open('demo/data/index.js').read().split('=', 1)[1])
rows = []
for ci, c in enumerate(idx['cats']):
    for si, s in enumerate(c['subs']):
        for n in range(idx['lists'][f"{c['k']}/{si}"]):
            t = open(f"demo/data/{c['k']}_{si}-{n}.js").read()
            for r in json.loads(t[t.index('[['):-1]):
                rows.append((r[0], r[1], r[2], r[5], c['label'], s['name']))
print('ürün', len(rows), flush=True)
os.makedirs('_verify/t', exist_ok=True); os.makedirs('_verify/sheets', exist_ok=True)


def get(i):
    p = f'_verify/t/{i:05d}.img'
    if os.path.exists(p) and os.path.getsize(p) > 200:
        return 1
    for a in range(4):
        try:
            with urllib.request.urlopen(CDN + urllib.request.quote(rows[i][3]) + '?width=150', timeout=30) as r:
                d = r.read()
            open(p, 'wb').write(d); return 1
        except Exception:
            time.sleep(2 + 3 * a)
    return 0


t0 = time.time(); ok = 0
with ThreadPoolExecutor(32) as ex:
    for n, r in enumerate(ex.map(get, range(len(rows))), 1):
        ok += r
        if n % 2500 == 0:
            print(f'indirildi {n}/{len(rows)} başarısız {n-ok} {int(time.time()-t0)}s', flush=True)
print('indirme bitti, başarısız', len(rows) - ok, flush=True)

f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 10)
fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 10)
W, H, C, R = 150, 166, 10, 10
for s in range(0, len(rows), C * R):
    im = Image.new('RGB', (W * C, H * R), 'white'); d = ImageDraw.Draw(im); meta = []
    for j in range(min(C * R, len(rows) - s)):
        i = s + j; h, title, vendor, _, cat, sub = rows[i]; x, y = (j % C) * W, (j // C) * H
        try:
            t = Image.open(f'_verify/t/{i:05d}.img').convert('RGBA'); bg = Image.new('RGBA', t.size, 'white')
            bg.alpha_composite(t); t = bg.convert('RGB'); t.thumbnail((116, 116)); im.paste(t, (x + (W - t.width) // 2, y + 2 + (116 - t.height) // 2))
        except Exception:
            d.text((x + 30, y + 50), 'GÖRSEL YOK', fill='red', font=fb)
        d.text((x + 3, y + 119), f'{j:02d} {vendor[:18]}', fill=(30, 60, 200), font=fb)
        for k, l in enumerate(textwrap.wrap(title, 27)[:3]):
            d.text((x + 3, y + 131 + k * 11), l, fill='black', font=f)
        d.rectangle((x, y, x + W - 1, y + H - 1), outline=(215, 215, 215))
        meta.append({'n': j, 'id': h, 'title': title, 'vendor': vendor, 'cat': cat, 'sub': sub})
    k = s // (C * R)
    im.save(f'_verify/sheets/{k:04d}.jpg', quality=78)
    json.dump(meta, open(f'_verify/sheets/{k:04d}.json', 'w'), ensure_ascii=False)
print('sayfa', len(glob.glob('_verify/sheets/*.jpg')), 'HAZIR', flush=True)
