"""out/*.json -> docs/parfum-fiyat-kiyasi-2026-11-15.csv + özet. Çalıştır: python3 birlestir.py (Mixo/_fiyat içinde)"""
import json,glob,csv,statistics as st,collections
P={o['id']:o for o in json.load(open('parfum.json'))}
R={}
for f in sorted(glob.glob('out/*.json')):
    for r in json.load(open(f)):
        if r.get('id') not in P: continue
        ok=r.get('status')=='bulundu' and any(isinstance(o.get('price'),(int,float)) and o['price']>0 for o in r.get('offers',[]))
        old=R.get(r['id'])
        if old and old['ok'] and not ok: continue
        if old and old['ok'] and ok: r['offers']=old['offers']+r['offers']
        r['ok']=ok; R[r['id']]=r
rows=[]
for i,o in P.items():
    r=R.get(i,{'ok':False,'note':'aranmadı'})
    d=dict(marka=o['vendor'],urun=o['title'],bizim=o['price'],durum='',en_dusuk='',en_dusuk_magaza='',ulke='',tipik='',teklif=0,fark_yuzde='',url='',eslesen='',notlar=(r.get('note') or '')[:200])
    if r['ok']:
        of=sorted([x for x in r['offers'] if isinstance(x.get('price'),(int,float)) and x['price']>0],key=lambda x:x['price'])
        lo=of[0]; tip=st.median(x['price'] for x in of)
        f=(o['price']/tip-1)*100
        d.update(en_dusuk=lo['price'],en_dusuk_magaza=lo.get('shop',''),ulke=lo.get('country',''),tipik=round(tip,2),teklif=len(of),fark_yuzde=round(f),url=lo.get('url',''),eslesen=lo.get('matched_title',''))
        d['durum']='aşırı fark (kontrol)' if (f>200 or f<-60) else ('pahalı' if f>15 else 'ucuz' if f<-15 else 'piyasada')
    else:
        d['durum']='fiyat bulunamadı'
    rows.append(d)
rows.sort(key=lambda d:(d['fark_yuzde']=='' , -(d['fark_yuzde'] or 0)))
w=csv.DictWriter(open('../docs/parfum-fiyat-kiyasi-2026-11-15.csv','w',newline='',encoding='utf-8-sig'),fieldnames=list(rows[0]),delimiter=';')
w.writeheader(); w.writerows(rows)
c=collections.Counter(d['durum'] for d in rows); print(len(rows),dict(c))
ok=[d for d in rows if d['fark_yuzde']!='' and d['durum']!='aşırı fark (kontrol)']
print('medyan fark %',st.median(d['fark_yuzde'] for d in ok),'DE teklifli',sum(1 for d in ok if d['ulke']=='DE'))
def grp(name,sel):
    s=[d for d in ok if sel(d)]
    if s: print(f"{name}: n={len(s)} medyan fark %{st.median(d['fark_yuzde'] for d in s):.0f} pahalı={sum(d['durum']=='pahalı' for d in s)} ucuz={sum(d['durum']=='ucuz' for d in s)} piyasada={sum(d['durum']=='piyasada' for d in s)}")
grp('69,00 € olanlar',lambda d:d['bizim']==69.0)
grp('<=45 €',lambda d:d['bizim']<=45)
grp('45-100 € (69 hariç)',lambda d:45<d['bizim']<=100 and d['bizim']!=69)
grp('100-200 €',lambda d:100<d['bizim']<=200)
grp('>200 €',lambda d:d['bizim']>200)
grp('Chanel',lambda d:d['marka'].lower()=='chanel')
print('toplam bizim',round(sum(d['bizim'] for d in ok)),'toplam tipik',round(sum(d['tipik'] for d in ok)))
for t,k in (('EN PAHALI',ok[:15]),('EN UCUZ',ok[-12:])):
    print(t)
    for d in k: print(f"  {d['urun'][:62]:62} {d['bizim']:>8} | {d['tipik']:>8} | {d['fark_yuzde']:>5}% | {d['en_dusuk_magaza'][:18]} {d['ulke']}")
print('AŞIRI FARK')
for d in rows:
    if d['durum']=='aşırı fark (kontrol)': print(f"  {d['urun'][:62]:62} {d['bizim']:>8} | {d['tipik']:>8} | {d['eslesen'][:50]}")
