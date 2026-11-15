import asyncio,json,os,sys
from playwright.async_api import async_playwright
C=json.load(open('_raw/collections.json'))['collections']
cnt={c['handle']:c['products_count'] for c in C}; ttl={c['handle']:c['title'] for c in C}
ORDER="""mixoutlet-jtl-category-196 mixoutlet-jtl-category-195 unisexduefte parfum-sets parfum-nachfuellungen haarduefte mixoutlet-jtl-category-194 mixoutlet-jtl-category-12
damenuhren herrenuhren unisexuhren kinderuhren smartwatches wohnraumuhren buero-smartwatch
schmuck-armbander schmuck-halsketten schmuck-ohrringe schmuck-ringe schmuck
mixoutlet-jtl-category-184 mixoutlet-jtl-category-25 mixoutlet-jtl-category-69 mixoutlet-jtl-category-155 mixoutlet-jtl-category-65
mixoutlet-jtl-category-136 mixoutlet-jtl-category-137 mixoutlet-jtl-category-144 mixoutlet-jtl-category-192 mixoutlet-jtl-category-13 mixoutlet-jtl-category-79
mixoutlet-jtl-category-146 aftershave-rasurpflege gesundheit-alltagshilfen mixoutlet-jtl-category-129
mixoutlet-jtl-category-148 mixoutlet-jtl-category-149 mixoutlet-jtl-category-130 lebensmittel-spezialitaeten babybedarf mixoutlet-jtl-category-180
mixoutlet-jtl-category-32 mixoutlet-jtl-category-31""".split()
skip=('buero-sortiment','buero-group-')
ORDER+=sorted([h for h in cnt if h.startswith('buero-') and not h.startswith(skip) and cnt[h]>0],key=lambda h:cnt[h])
JS="""async u=>{const r=await fetch(u);if(r.status!=200)return {s:r.status};const j=await r.json();
return {s:200,p:j.products.map(p=>{const v=p.variants.find(v=>v.available)||p.variants[0]||{};return [p.id,p.handle,p.title,p.vendor,v.price,v.compare_at_price,p.variants.some(v=>v.available)?1:0,(p.images[0]||{}).src||'',p.product_type]})}}"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--disable-blink-features=AutomationControlled'])
        c=await b.new_context(locale='de-DE',user_agent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')
        pg=await c.new_page()
        await pg.goto('https://mixoutlet.de/',wait_until='domcontentloaded'); await pg.wait_for_timeout(2000)
        for h in ORDER:
            out=f'_raw/all/{h}.json'
            if os.path.exists(out): continue
            rows=[];page=1;fail=0
            while page<=100:
                try: r=await pg.evaluate(JS,f'/collections/{h}/products.json?limit=250&page={page}')
                except Exception as e: r={'s':-1}
                if r['s']!=200:
                    fail+=1; print(' retry',h,page,r['s'],flush=True)
                    if fail>6: break
                    await pg.wait_for_timeout(30000 if r['s']==429 else 8000)
                    if r['s']==-1: await pg.goto('https://mixoutlet.de/',wait_until='domcontentloaded')
                    continue
                rows+=r['p']
                if len(r['p'])<250: break
                page+=1; await pg.wait_for_timeout(1200)
            ok=fail<=6
            if ok: json.dump({'title':ttl[h],'rows':rows},open(out,'w'),ensure_ascii=False)
            print(h,ttl[h],cnt[h],len(rows),'OK' if ok else 'FAILED',flush=True)
            await pg.wait_for_timeout(1500)
        await b.close(); print('DONE',flush=True)
asyncio.run(main())
