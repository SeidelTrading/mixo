/* Outlet demo – katalog, arama, filtre, sepet ve davranış analizi (tamamı tarayıcıda çalışır) */
(async()=>{
const IDX=window.MX_INDEX, F=window.MX_FEATURED;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const eur=n=>n.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const num=n=>n.toLocaleString('de-DE');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let FREE=39; const SHIP=5.5, PAGE=24;
const fmtN=n=>String(n).replace('.',',');
const CDN='https://cdn.shopify.com/s/files/1/0799/7639/9006/files/';
const imgUrl=(s,w=480)=>!s?'':s.startsWith('fix/')?'img/'+s:(s.startsWith('img/')||s.startsWith('http'))?s:CDN+s+'?width='+w;
/* yönetici düzenlemeleri (başlık, fiyat, stok, görsel) ve gizli kategoriler: /api/config ile gelir */
let OV={}; const HIDCAT=new Set();
const ov=p=>{const o=OV[p.id];if(o){if(o.title!=null&&p.title!==o.title){p.title=o.title;delete p._h}if(o.price!=null)p.price=o.price;if(o.was!=null)p.was=o.was;if(o.na!=null)p.na=!!o.na;if(o.img)p.img=o.img}return p};
const CAT=Object.fromEntries(IDX.cats.map(c=>[c.k,c]));
const label=k=>CAT[k]?.label||'';
const store={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}},del(k){try{localStorage.removeItem(k)}catch{}}};
F.forEach(p=>{p.si=CAT[p.cat]?CAT[p.cat].subs.findIndex(s=>s.name===p.sub):-1});
const known=new Map(F.map(p=>[p.id,p]));
let cart=store.get('mx-cart2',{}), wish=store.get('mx-wish2',{});
Object.values(cart).forEach(e=>e?.p&&known.set(e.p.id,e.p)); Object.values(wish).forEach(p=>p?.id&&known.set(p.id,p));
const blank=()=>({cat:'all',sub:-1,q:'',sort:'',wishOnly:false,shown:PAGE,brands:new Set(),pmin:null,pmax:null,avail:false});
let state=blank(), token=0, facetBrands=null, bq='', qCounts=null, qCountsFor='', applying=false, pushNext=false, lastTracked='';
const HEART='<svg class="icon" viewBox="0 0 24 24"><path d="M20.5 5.5c-2.3-2.4-6.1-1.7-8.5 1-2.4-2.7-6.2-3.4-8.5-1-5 5 3.4 11.6 8.5 15 5.1-3.4 13.5-10 8.5-15Z"/></svg>';
const taxTxt=()=>'inkl. MwSt. · zzgl. 5,50 € DHL-Versand · ab '+fmtN(FREE)+' € kostenlos (DE)';

/* ───────── Davranış katmanı: olay kaydı → profil → kişiselleştirme (yalnız onay varsa) ───────── */
const B={consent:store.get('mx-consent',null),ev:store.get('mx-ev',[]),user:store.get('mx-user',null),seen:store.get('mx-seen',[]),meta:store.get('mx-meta',{sessions:0,last:0,first:Date.now()})};
const newSession=Date.now()-B.meta.last>30*60e3;
if(newSession)B.meta.sessions++;
B.meta.last=Date.now(); store.set('mx-meta',B.meta);
B.seen.forEach(p=>p?.id&&!known.has(p.id)&&known.set(p.id,p));
let saveT;
/* sunucuya olay gönderimi (yalnız onay varsa; sunucu yoksa sessizce atlanır) */
const outbox=[]; let vid=store.get('mx-vid',null);
function flush(){ if(!outbox.length||B.consent!==true||location.protocol==='file:')return;
  if(!vid){vid=(crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2,12));store.set('mx-vid',vid)}
  const body=JSON.stringify({vid,events:outbox.splice(0,60)});
  try{ if(!navigator.sendBeacon?.('/api/events',new Blob([body],{type:'text/plain'})))fetch('/api/events',{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true}).catch(()=>{}) }catch{} }
setInterval(flush,5000); addEventListener('pagehide',flush); document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});
const HID=new Set();
function track(e,d={}){
  if(B.consent!==true)return;
  outbox.push({s:B.meta.sessions,e,...d});
  B.ev.push({t:Date.now(),s:B.meta.sessions,e,...d}); if(B.ev.length>500)B.ev.splice(0,B.ev.length-500);
  B.meta.last=Date.now(); clearTimeout(saveT); saveT=setTimeout(()=>{store.set('mx-ev',B.ev);store.set('mx-meta',B.meta)},300);
  renderInsights();
}
const pref=p=>({id:p.id,c:p.cat,si:p.si??-1,b:p.vendor,pr:p.price});
function profile(){
  const now=Date.now(), W={view:1,dwell:1,wish:3,add:5,cat:.5,sugg:2};
  const cat={},sub={},brand={},prices=[],n={view:0,wish:0,add:0,checkout:0,search:0,cat:0,remove:0,exit_intent:0,sort:0,filter:0,cart_open:0};
  let cheap=0;
  for(const x of B.ev){
    n[x.e]=(n[x.e]||0)+1;
    if(x.e==='sort'&&x.o==='asc')cheap++; if(x.e==='filter'&&x.k==='pmax')cheap++;
    if(x.e==='dwell'&&x.sec<12)continue;
    const w=(W[x.e]||0)*Math.pow(.5,(now-x.t)/(7*864e5)); if(!w)continue;
    if(x.c&&CAT[x.c]){cat[x.c]=(cat[x.c]||0)+w; if(x.si>=0){const k=x.c+'/'+x.si;sub[k]=(sub[k]||0)+w}}
    if(x.b)brand[x.b]=(brand[x.b]||0)+w;
    if(x.pr&&(x.e==='view'||x.e==='add'))prices.push(x.pr);
  }
  const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]);
  const cats=top(cat), subs=top(sub), brands=top(brand);
  prices.sort((a,b)=>a-b); const med=prices.length?prices[prices.length>>1]:0;
  const cur=B.ev.filter(x=>x.s===B.meta.sessions), sv={}; cur.forEach(x=>{if(x.e==='view'&&x.si>=0){const k=x.c+'/'+x.si;sv[k]=(sv[k]||0)+1}});
  const cartN=count(), bsum=brands.reduce((a,b)=>a+b[1],0);
  let stage,action;
  if(cartN&&cur.some(x=>x.e==='checkout')){stage='Kaufbereit';action='Checkout frei halten: keine Ablenkung, Vertrauen zeigen (Versand, Rückgabe, Zahlung).'}
  else if(cartN&&(n.remove||n.exit_intent||(B.meta.sessions>1&&!cur.some(x=>x.e==='add')))){stage='Zögert';action='Warenkorb freundlich in Erinnerung rufen und offene Fragen klären (Lieferzeit, Rückgabe).'}
  else if(cartN){stage='Entscheidet';action='Lücke bis zum Gratisversand zeigen und passende Ergänzungen vorschlagen.'}
  else if(Object.values(sv).some(v=>v>=3)){stage='Vergleicht';action='Ähnliche Produkte nebeneinander zeigen, Unterschiede sichtbar machen.'}
  else if(n.view){stage='Stöbert';action='„Für dich“-Auswahl aus den angesehenen Kategorien zeigen.'}
  else{stage='Neu';action='Orientierung geben: Kategorien, Suche, Bestseller-Marken.'}
  const traits=[];
  if(cheap)traits.push('preisbewusst'); if(brands[0]&&n.view>=4&&brands[0][1]/bsum>=.5)traits.push('markentreu ('+brands[0][0]+')');
  if(n.search>=2&&n.search>n.cat)traits.push('zielgerichtet (sucht statt zu stöbern)'); if(cats.length>=3)traits.push('entdeckt gern Neues');
  if(n.wish>=2&&!n.add)traits.push('sammelt auf der Merkliste');
  return {cats,subs,brands,med,band:[med*.5,med*1.6],stage,action,traits,n};
}
const subName=k=>{const [c,i]=k.split('/');return CAT[c]?.subs[i]?.name||label(c)};

/* ───────── Parça parça katalog yükleyici (script etiketi; file:// ile de çalışır) ───────── */
const lists={}, waiting={};
window.MXC=(key,i,rows)=>{const w=waiting[key+'#'+i];if(w){delete waiting[key+'#'+i];w(rows)}};
const toP=r=>{const c=IDX.cats[r[6]];const p={id:r[0],title:r[1],vendor:r[2],price:r[3],was:r[4],img:r[5],cat:c.k,si:r[7],sub:c.subs[r[7]].name,base:'',na:r[8]===0,lq:r[9]===1};ov(p);if(!known.has(p.id))known.set(p.id,p);return p};
function loadChunk(key,i){return new Promise((res,rej)=>{waiting[key+'#'+i]=res;const s=document.createElement('script');s.src=`data/${key.replace('/','_')}-${i}.js`;s.onerror=()=>rej(new Error('chunk '+key+i));document.head.appendChild(s)})}
function ensure(key,count,onProgress){
  const L=lists[key]??={n:0,rows:[],q:Promise.resolve(),done:false}, total=IDX.lists[key]||0;
  const run=async()=>{
    while(L.rows.length<count&&L.n<total){
      const from=L.n,len=L.rows.length,to=Math.min(total,from+(count===Infinity?6:1)),ps=[];
      for(let i=from;i<to;i++)ps.push(loadChunk(key,i));
      L.n=to;
      try{for(const b of ps)L.rows.push(...(await b).map(toP).filter(p=>!HID.has(p.id)&&!HIDCAT.has(p.cat)))}catch(e){L.n=from;L.rows.length=len;throw e}
      onProgress?.(L.n/total);
    }
    if(L.n>=total)L.done=true;
    return L.rows;
  };
  const r=L.q.then(run,run); L.q=r.catch(()=>{}); return r;
}
const scopeKey=()=>state.cat==='all'?'all':state.sub>=0?state.cat+'/'+state.sub:state.cat;
const scopeTotal=()=>state.cat==='all'?IDX.total:state.sub>=0?CAT[state.cat].subs[state.sub].n:CAT[state.cat].n;
const hasFilters=()=>!!(state.brands.size||state.pmin!=null||state.pmax!=null||state.avail);
const countBrands=list=>{const m=new Map();for(const p of list)m.set(p.vendor,(m.get(p.vendor)||0)+1);return [...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'de'))};

/* arama: büyük/küçük harf, aksan ve tire/boşluk farkına duyarsız */
const norm=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss');
const hay=p=>p._h??=(()=>{const a=norm(p.title+' '+p.vendor+' '+p.sub);return a+' '+a.replace(/[^a-z0-9]/g,'')})();
const matcher=q=>{const ws=norm(q).split(/\s+/).filter(Boolean).map(w=>[w,w.replace(/[^a-z0-9]/g,'')]);return p=>{const h=hay(p);return ws.every(([w,c])=>h.includes(w)||(c.length>1&&h.includes(c)))}};

/* marka şeridi */
const marks=['dior','chanel','prada','armani','lancome','hermes','burberry','chloe','guess','tommy','calvin','festina','orient','adidas','brother','hp','canon','epson','samsung','kyocera'];
$('#brandTrack').innerHTML=[...marks,...marks].map(m=>`<img src="img/mx-mark-${m}.webp" alt="${m}" loading="lazy">`).join('');

/* ───────── kartlar ───────── */
const priceHtml=p=>`<div class="price${p.was?' sale':''}">${eur(p.price)}${p.was?`<s>${eur(p.was)}</s>`:''}</div>`;
const baseTxt=p=>p.base?esc(p.base.replace(/€([\d.,]+)/,'$1 €')):'';
function card(p){
  return `<article class="card">
    ${p.na?'<span class="chip" style="background:#e8e9ef;color:#555b6e">Zurzeit nicht verfügbar</span>':p.was?`<span class="chip" style="background:var(--coral);color:#fff">−${Math.round((1-p.price/p.was)*100)} %</span>`:p.price>=FREE?'<span class="chip">Gratis-Versand</span>':''}
    <button class="wish" data-wish="${esc(p.id)}" aria-pressed="${!!wish[p.id]}" aria-label="Merken">${HEART}</button>
    <button class="media" data-open="${esc(p.id)}" aria-label="${esc(p.title)} ansehen"><img src="${esc(imgUrl(p.img))}" alt="${esc(p.title)}" loading="lazy" onerror="this.style.visibility='hidden'"></button>
    <div class="body">
      <span class="vendor">${esc(p.vendor)}</span>
      <h3 data-open="${esc(p.id)}">${esc(p.title)}</h3>
      ${priceHtml(p)}
      <div class="tax">${p.base?baseTxt(p)+'<br>':''}inkl. MwSt.</div>
      <div class="foot">${p.na?'<button class="add" disabled style="opacity:.45;cursor:not-allowed">Nicht verfügbar</button>':`<button class="add" data-add="${esc(p.id)}">In den Warenkorb <span aria-hidden="true">+</span></button>`}</div>
    </div></article>`;
}
const skeleton=n=>Array.from({length:n},()=>'<div class="card sk"><div class="media"></div><div class="body"><span></span><span></span><span></span></div></div>').join('');
function renderRails(){
  $('#watchRail').innerHTML=F.filter(p=>p.cat==='uhren'&&!HID.has(p.id)&&!HIDCAT.has(p.cat)).map(card).join('');
  $('#scentRail').innerHTML=F.filter(p=>p.cat==='parfum'&&!HID.has(p.id)&&!HIDCAT.has(p.cat)).map(card).join('');
}

/* ───────── filtre paneli ───────── */
const PRICES=[[null,25],[25,50],[50,100],[100,250],[250,null]];
function renderFilters(){
  const q=state.q.trim(), useQ=q.length>=2&&qCounts&&qCountsFor===q;
  const cn=c=>useQ?(qCounts.c[c.k]||0):c.n, sn=(c,i)=>useQ?(qCounts.s[c.k+'/'+i]||0):c.subs[i].n;
  const row=(on,attr,name,n)=>`<button class="frow${on?' on':''}" ${attr}><span>${esc(name)}</span><i>${num(n)}</i></button>`;
  const cats=row(state.cat==='all'&&!state.wishOnly,'data-fcat="all"','Alle Produkte',useQ?qCounts.t:IDX.total)+
    IDX.cats.filter(c=>!HIDCAT.has(c.k)&&(cn(c)||state.cat===c.k)).map(c=>row(state.cat===c.k,`data-fcat="${c.k}"`,c.label,cn(c))+
      (state.cat===c.k&&c.subs.length>1?`<div class="fsubs">${c.subs.map((s,i)=>sn(c,i)||state.sub===i?row(state.sub===i,`data-fsub="${i}"`,s.name,sn(c,i)):'').join('')}</div>`:'')).join('');
  $('#fbody').innerHTML=`
    <div class="fg"><h4>Kategorie</h4><div class="fcats">${cats}</div></div>
    <div class="fg"><h4>Preis</h4>
      <div class="fprice"><input id="pmin" type="number" min="0" step="1" inputmode="decimal" placeholder="von" value="${state.pmin??''}" aria-label="Preis von"><span>–</span><input id="pmax" type="number" min="0" step="1" inputmode="decimal" placeholder="bis" value="${state.pmax??''}" aria-label="Preis bis"><span>€</span></div>
      <div class="fquick">${PRICES.map(([a,b])=>`<button data-price="${a??''}-${b??''}" aria-pressed="${state.pmin===a&&state.pmax===b}">${a==null?`bis ${b} €`:b==null?`ab ${a} €`:`${a}–${b} €`}</button>`).join('')}</div></div>
    <div class="fg"><h4>Marke</h4><input id="bq" type="search" placeholder="Marke suchen …" value="${esc(bq)}" aria-label="Marke suchen"><div id="blist"></div></div>
    <div class="fg"><h4>Verfügbarkeit</h4><label class="fcheck"><input type="checkbox" id="favail" ${state.avail?'checked':''}><span>Nur sofort verfügbar</span></label></div>`;
  renderBrandList();
  const n=state.brands.size+(state.pmin!=null||state.pmax!=null?1:0)+(state.avail?1:0)+(state.cat!=='all'?1:0);
  $('#fcount').textContent=n?`(${n})`:'';
}
function renderBrandList(){
  const el=$('#blist'); if(!el)return;
  const src=facetBrands||IDX.facets?.[scopeKey()]?.b||[], nq=norm(bq.trim());
  const hit=(nq?src.filter(([b])=>norm(b).includes(nq)):src).slice(0,24);
  const extra=[...state.brands].filter(b=>!hit.some(r=>r[0]===b)).map(b=>[b,(src.find(r=>r[0]===b)||[])[1]??null]);
  el.innerHTML=[...extra,...hit].map(([b,n])=>`<label class="fcheck"><input type="checkbox" data-brand="${esc(b)}" ${state.brands.has(b)?'checked':''}><span>${esc(b)}</span>${n==null?'':`<i>${num(n)}</i>`}</label>`).join('')
    +(facetBrands?(src.length>hit.length&&!nq?`<p class="fnote">${num(src.length)} Marken – tippe oben, um zu suchen.</p>`:hit.length||extra.length?'':'<p class="fnote">Keine Marke gefunden.</p>')
      :`<button class="fnote flink" data-ballload>Alle ${num(IDX.facets?.[scopeKey()]?.nb||0)} Marken laden</button>`);
}
function loadAllBrands(){const key=scopeKey();return ensure(key,Infinity).then(rows=>{if(key===scopeKey()&&!facetBrands){facetBrands=countBrands(rows);renderBrandList()}}).catch(()=>{})}
function renderPills(){
  const a=[];
  if(state.wishOnly)a.push(['wish','♥ Merkliste']);
  if(state.q.trim())a.push(['q',`Suche: „${state.q.trim()}“`]);
  if(state.cat!=='all')a.push(['cat',label(state.cat)]);
  if(state.sub>=0)a.push(['sub',CAT[state.cat].subs[state.sub].name]);
  state.brands.forEach(b=>a.push(['b:'+b,b]));
  if(state.pmin!=null||state.pmax!=null)a.push(['price',state.pmin==null?`bis ${state.pmax} €`:state.pmax==null?`ab ${state.pmin} €`:`${state.pmin}–${state.pmax} €`]);
  if(state.avail)a.push(['avail','Sofort verfügbar']);
  $('#pills').innerHTML=a.map(([k,t])=>`<button data-pill="${esc(k)}" aria-label="${esc(t)} entfernen">${esc(t)} <span aria-hidden="true">×</span></button>`).join('')+(a.length>1?'<button class="reset" data-reset>Alle zurücksetzen</button>':'');
}

/* ───────── paylaşılabilir adres + geri tuşu ───────── */
function qs(){
  const u=new URLSearchParams();
  if(state.wishOnly){u.set('v','merkliste');return u.toString()}
  if(state.cat!=='all')u.set('c',state.cat); if(state.sub>=0)u.set('s',state.sub);
  if(state.q.trim())u.set('q',state.q.trim()); if(state.brands.size)u.set('b',[...state.brands].join('|'));
  if(state.pmin!=null)u.set('min',state.pmin); if(state.pmax!=null)u.set('max',state.pmax);
  if(state.sort)u.set('o',state.sort); if(state.avail)u.set('a',1);
  return u.toString();
}
function syncUrl(){
  if(applying)return; const s=qs(), mine=location.hash==='#katalog'||location.hash.startsWith('#katalog?');
  if(!s&&!mine){pushNext=false;return}
  const h='#katalog'+(s?'?'+s:''); if(h===location.hash){pushNext=false;return}
  try{history[pushNext&&mine?'pushState':'replaceState'](null,'',location.pathname+location.search+h)}catch{}
  pushNext=false;
}
function applyUrl(first){
  const h=location.hash; if(h!=='#katalog'&&!h.startsWith('#katalog?'))return false;
  const u=new URLSearchParams(h.slice(9)), s=blank();
  if(u.get('v')==='merkliste'){s.wishOnly=true;s.shown=9999}
  if(CAT[u.get('c')]&&!HIDCAT.has(u.get('c'))){s.cat=u.get('c');const i=parseInt(u.get('s'));if(i>=0&&CAT[s.cat].subs[i])s.sub=i}
  s.q=u.get('q')||''; (u.get('b')||'').split('|').filter(Boolean).forEach(b=>s.brands.add(b));
  const f=v=>{const x=parseFloat(v);return isFinite(x)&&x>=0?x:null}; s.pmin=f(u.get('min')); s.pmax=f(u.get('max'));
  if(['asc','desc','az'].includes(u.get('o')))s.sort=u.get('o'); s.avail=u.get('a')==='1';
  state=s; $('#q').value=s.q; $('#sort').value=s.sort; applying=true; renderGrid().finally(()=>{applying=false});
  if(first&&h.length>9)setTimeout(()=>$('#katalog').scrollIntoView(),60);
  return true;
}

/* ───────── ürün ızgarası ───────── */
const status=m=>{$('#more').innerHTML=`<span class="loading">${m}</span>`};
async function renderGrid(){
  const my=++token, q=state.q.trim(), grid=$('#grid'), key=scopeKey();
  facetBrands=lists[key]?.done&&!q&&!hasFilters()?countBrands(lists[key].rows):null;
  renderFilters(); renderPills(); syncUrl();
  let list,total;
  try{
    if(state.wishOnly){list=Object.values(wish);total=list.length}
    else if(q.length>=2||state.sort||hasFilters()){
      grid.style.opacity=.45; const base=scopeTotal();
      if(!grid.children.length)grid.innerHTML=skeleton(8);
      if(q.length>=2&&qCountsFor!==q){
        const all=await ensure('all',Infinity,f=>{if(my===token)status(`Durchsuche ${num(IDX.total)} Produkte … ${Math.round(f*100)} %`)});
        if(my!==token)return;
        const m=matcher(q), c={}, s={}; let t=0;
        for(const p of all)if(m(p)){t++;c[p.cat]=(c[p.cat]||0)+1;const k=p.cat+'/'+p.si;s[k]=(s[k]||0)+1}
        qCounts={c,s,t}; qCountsFor=q;
      }
      list=await ensure(key,Infinity,f=>{if(my===token)status(`${num(base)} Produkte werden geprüft … ${Math.round(f*100)} %`)});
      if(my!==token)return;
      if(q.length>=2)list=list.filter(matcher(q));
      if(state.pmin!=null)list=list.filter(p=>p.price>=state.pmin);
      if(state.pmax!=null)list=list.filter(p=>p.price<=state.pmax);
      if(state.avail)list=list.filter(p=>!p.na);
      facetBrands=countBrands(list);
      if(state.brands.size)list=list.filter(p=>state.brands.has(p.vendor));
      total=list.length;
      if(state.sort){list=list.slice();
        if(state.sort==='asc')list.sort((a,b)=>a.price-b.price);
        if(state.sort==='desc')list.sort((a,b)=>b.price-a.price);
        if(state.sort==='az')list.sort((a,b)=>a.vendor.localeCompare(b.vendor,'de'))}
      renderFilters();
    }else{
      total=scopeTotal();
      if(!(lists[key]?.rows.length>=Math.min(state.shown,total))){status('Produkte werden geladen …');if(!grid.children.length)grid.innerHTML=skeleton(8)}
      list=await ensure(key,state.shown); if(my!==token)return;
    }
  }catch(e){ if(my===token){grid.style.opacity=1;grid.innerHTML='<div class="empty">Die Produkte konnten nicht geladen werden. Bitte Seite neu laden.</div>';$('#more').innerHTML=''} return }
  grid.style.opacity=1;
  const vis=list.slice(0,state.shown);
  $('#count').innerHTML=`<b>${num(total)}</b> ${total===1?'Produkt':'Produkte'}${q?` für „${esc(q)}“`:''}`;
  if(vis.length)grid.innerHTML=vis.map(card).join('');
  else if(state.wishOnly)grid.innerHTML='<div class="empty">Deine Merkliste ist noch leer. Tippe auf das Herz an einem Produkt.</div>';
  else{
    const tips=[]; if(hasFilters())tips.push('<button class="btn btn-ghost" data-clearf>Filter entfernen</button>');
    if(q&&state.cat!=='all')tips.push(`<button class="btn btn-ghost" data-fcat="all">In allen Kategorien suchen</button>`);
    grid.innerHTML=`<div class="empty"><b>Dazu haben wir gerade nichts gefunden.</b><p>${q?'Prüfe die Schreibweise oder versuche es mit weniger Wörtern – z. B. nur Marke oder Modellnummer.':'Lockere einen Filter, um mehr Auswahl zu sehen.'}</p><div class="cta" style="justify-content:center;margin-top:16px">${tips.join('')}<button class="btn btn-primary" data-reset>Alles anzeigen</button></div></div>`;
  }
  $('#more').innerHTML=total?`<span>${num(vis.length)} von ${num(total)} Produkten</span><div class="bar" style="width:min(240px,60%)"><i style="width:${vis.length/total*100}%"></i></div>`+(total>vis.length?'<button class="btn btn-ghost" data-more>Mehr laden</button>':''):'';
  const sig=q+'|'+key; if(q.length>=2&&sig!==lastTracked&&!applying){lastTracked=sig;track('search',{q,n:total,c:state.cat==='all'?undefined:state.cat})}
}
function setCat(c,keep){const q=keep?state.q:'';const o=state;state=blank();state.cat=CAT[c]&&!HIDCAT.has(c)?c:'all';if(keep){state.q=q;state.brands=o.brands;state.pmin=o.pmin;state.pmax=o.pmax;state.avail=o.avail;state.sort=o.sort}else{$('#q').value='';$('#sort').value=''}
  pushNext=true;if(state.cat!=='all')track('cat',{c:state.cat,si:-1});renderGrid()}
function commitSearch(q){state.q=q.trim();state.cat='all';state.sub=-1;state.shown=PAGE;state.wishOnly=false;$('#q').value=state.q;hideSuggest();pushNext=true;renderGrid();$('#katalog').scrollIntoView()}

/* ───────── arama önerileri ───────── */
const sg=$('#suggest'); let allBrands=null, preloading=false;
function preloadAll(){if(preloading)return;preloading=true;ensure('all',Infinity).then(rows=>{allBrands=countBrands(rows);if(!sg.hidden)renderSuggest()}).catch(()=>{preloading=false})}
const recent=()=>{const a=[];for(let i=B.ev.length-1;i>=0&&a.length<4;i--){const x=B.ev[i];if(x.e==='search'&&!a.includes(x.q))a.push(x.q)}return a};
function renderSuggest(){
  const raw=$('#q').value.trim(), nq=norm(raw); let h='';
  if(nq.length<2){
    const r=recent();
    h=(r.length?'<div class="sgh">Zuletzt gesucht</div>'+r.map(x=>`<button data-sq="${esc(x)}"><span>${esc(x)}</span></button>`).join(''):'')
      +'<div class="sgh">Beliebte Kategorien</div>'+IDX.cats.filter(c=>!HIDCAT.has(c.k)).slice(0,6).map(c=>`<button data-scat="${c.k}"><span>${esc(c.label)}</span><i>${num(c.n)}</i></button>`).join('');
  }else{
    const cats=[]; IDX.cats.filter(c=>!HIDCAT.has(c.k)).forEach(c=>{if(norm(c.label).includes(nq))cats.push([c.k,-1,c.label,c.n]);c.subs.forEach((s,i)=>{if(norm(s.name).includes(nq))cats.push([c.k,i,c.label+' › '+s.name,s.n])})});
    const full=lists.all?.done; let prods=[],n=0;
    if(full){const hits=lists.all.rows.filter(matcher(raw));n=hits.length;prods=hits.filter(p=>!p.na&&!p.lq).slice(0,5)}
    const brands=(allBrands||IDX.facets.all.b).filter(([b])=>norm(b).includes(nq)).slice(0,4);
    if(cats.length)h+='<div class="sgh">Kategorien</div>'+cats.slice(0,4).map(([k,i,t,c])=>`<button data-scat="${k}" data-ssub="${i}"><span>${esc(t)}</span><i>${num(c)}</i></button>`).join('');
    if(brands.length)h+='<div class="sgh">Marken</div>'+brands.map(([b,c])=>`<button data-sbrand="${esc(b)}"><span>${esc(b)}</span><i>${num(c)}</i></button>`).join('');
    if(prods.length)h+='<div class="sgh">Produkte</div>'+prods.map(p=>`<button class="sgp" data-open="${esc(p.id)}" data-from="sugg"><img src="${esc(imgUrl(p.img,96))}" alt=""><span>${esc(p.title)}</span><b>${eur(p.price)}</b></button>`).join('');
    h+=full?(n?`<button class="sgall" data-sq="${esc(raw)}">Alle ${num(n)} Ergebnisse anzeigen <kbd>↵</kbd></button>`:'<div class="sgh">Keine Treffer – versuche ein anderes Wort oder nur die Modellnummer.</div>')
           :`<div class="sgh"><span class="loading">Produkte werden geladen …</span></div><button class="sgall" data-sq="${esc(raw)}">Suchen <kbd>↵</kbd></button>`;
  }
  sg.innerHTML=h; sg.hidden=!h;
}
function hideSuggest(){sg.hidden=true}

/* ───────── sepet ───────── */
const count=()=>Object.values(cart).reduce((a,e)=>a+e.n,0);
const subtotal=()=>Object.values(cart).reduce((a,e)=>a+e.p.price*e.n,0);
let gapT=0, wasFree=subtotal()>=FREE;
function renderCart(){
  Object.keys(cart).forEach(id=>{if(!cart[id]?.p||cart[id].n<1)delete cart[id]});
  store.set('mx-cart2',cart);
  const c=count(), s=subtotal(), cb=$('#cartCount'), wn=Object.keys(wish).length;
  if(cb.textContent!==String(c)){cb.classList.remove('bump');void cb.offsetWidth;cb.classList.add('bump')}
  cb.textContent=c; cb.hidden=!c;
  const wb=$('#wishCount'); wb.textContent=wn; wb.hidden=!wn;
  const left=FREE-s, free=c&&left<=0;
  $('#ship').className='ship'+(free?' done':'');
  $('#ship').innerHTML=(c?(left>0?`Noch <b>${eur(left)}</b> bis zum kostenlosen DHL-Versand`:'Geschafft – dein Versand ist <b>kostenlos</b>'):'Kostenloser DHL-Versand ab '+fmtN(FREE)+' € (DE)')
    +`<div class="bar"><i style="width:${Math.min(100,s/FREE*100)}%"></i></div><div id="gap"></div>`;
  if(free&&!wasFree)toast('Gratis-Versand erreicht'); wasFree=!!free;
  $('#items').innerHTML=c?Object.values(cart).map(({n,p})=>`<div class="item">
      <img src="${esc(imgUrl(p.img,160))}" alt=""><div><span class="vendor">${esc(p.vendor)}</span><b>${esc(p.title)}</b>
      <span class="qty"><button data-q="${esc(p.id)}" data-d="-1" aria-label="Weniger">−</button><span>${n}</span><button data-q="${esc(p.id)}" data-d="1" aria-label="Mehr">+</button></span>
      <button class="rm" data-rm="${esc(p.id)}">Entfernen</button></div><strong>${eur(p.price*n)}</strong></div>`).join('')
    :`<div class="cart-empty"><b>Dein Warenkorb ist noch leer.</b>Entdecke deinen Mix und finde dein nächstes Lieblingsprodukt.</div>`;
  const ship=c&&s<FREE?SHIP:0;
  $('#dfoot').innerHTML=c?`<div class="row"><span>Zwischensumme</span><span>${eur(s)}</span></div>
    <div class="row"><span>DHL-Versand (DE)</span><span>${ship?eur(ship):'kostenlos'}</span></div>
    <div class="row total"><span>Gesamt</span><span>${eur(s+ship)}</span></div>
    <button class="btn btn-primary" data-checkout>Zur Kasse <svg class="icon" viewBox="0 0 24 24"><path d="M4 12h16m-6-6 6 6-6 6"/></svg></button>
    <span class="tax" style="text-align:center">inkl. MwSt. · 14 Tage Widerrufsrecht · Demo – es wird nichts bestellt</span>`
    :`<button class="btn btn-ghost" data-close>Weiter einkaufen</button>`;
  if(c&&left>0)fillGap(left);
}
/* ücretsiz kargoya kalan tutarı kapatan, sepetle ilgili gerçek öneriler */
async function fillGap(left){
  const my=++gapT, items=Object.values(cart).map(e=>e.p).filter(p=>p.si>=0); if(!items.length)return;
  const p0=items[items.length-1];
  try{
    const rows=await ensure(p0.cat+'/'+p0.si,400); if(my!==gapT||!$('#gap'))return;
    const pick=rows.filter(p=>!p.na&&!p.lq&&!cart[p.id]&&p.price>=left&&p.price<=left+15).sort((a,b)=>a.price-b.price).slice(0,3);
    if(pick.length)$('#gap').innerHTML='<small>Passt dazu und bringt dich über '+fmtN(FREE)+' €:</small>'+pick.map(p=>`<div class="gapi"><img src="${esc(imgUrl(p.img,96))}" alt=""><button data-open="${esc(p.id)}">${esc(p.title)}</button><b>${eur(p.price)}</b><button class="plus" data-add="${esc(p.id)}" aria-label="In den Warenkorb">+</button></div>`).join('');
  }catch{}
}
function add(id,n=1){const p=known.get(id);if(!p||p.na)return;(cart[id]??={n:0,p}).n+=n;track('add',pref(p));renderCart();toast('In den Warenkorb gelegt');}
let tt;function toast(m){const t=$('#toast');t.innerHTML='<svg class="icon" viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>'+esc(m);t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2600)}

/* ───────── pencereler ───────── */
let lastFocus, openAt=0, openP=null;
function openDrawer(){closeModal(true);lastFocus=document.activeElement;$('#insights').classList.remove('on');$('#drawer').classList.add('on');$('#drawer').setAttribute('aria-hidden','false');$('#scrim').classList.add('on');document.body.style.overflow='hidden';track('cart_open')}
function openModal(id,from){
  const p=known.get(id); if(!p)return; if(openP)endView(); lastFocus=document.activeElement; let n=1;
  const ic=d=>`<svg class="icon" viewBox="0 0 24 24">${d}</svg>`;
  $('#sheet').innerHTML=`<button class="iconbtn x" data-close aria-label="Schließen">${ic('<path d="M6 6l12 12M18 6 6 18"/>')}</button>
    <div class="pm"><img src="${esc(imgUrl(p.img,900))}" alt="${esc(p.title)}"></div>
    <div class="pi"><span class="vendor">${esc(p.vendor)} · ${esc(label(p.cat))}${p.sub?' · '+esc(p.sub):''}</span><h2>${esc(p.title)}</h2>
      ${priceHtml(p)}
      <div class="tax">${p.base?baseTxt(p)+' · ':''}${taxTxt()}</div>
      <ul class="facts">
        <li>${ic('<path d="m5 12 5 5 9-10"/>')}${p.na?'Zurzeit nicht verfügbar':'Auf Lager – direkt aus Deutschland'}</li>
        <li>${ic('<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.7"/><circle cx="17.5" cy="18" r="1.7"/>')}${p.price>=FREE?'Kostenloser DHL-Versand':'DHL-Versand 5,50 € · ab '+fmtN(FREE)+' € kostenlos'} · ca. 3–5 Werktage</li>
        <li>${ic('<path d="M4 9h13a3 3 0 0 1 0 6H9"/><path d="m7 6-3 3 3 3"/>')}14 Tage Widerrufsrecht</li>
      </ul>
      <div class="buy"><span class="qty"><button id="mMinus" aria-label="Weniger">−</button><span id="mQty">1</span><button id="mPlus" aria-label="Mehr">+</button></span>
        <button class="btn btn-primary" id="mAdd">In den Warenkorb</button>
        <button class="iconbtn wish" style="box-shadow:inset 0 0 0 1.5px var(--line);width:50px;height:50px" data-wish="${esc(p.id)}" aria-pressed="${!!wish[p.id]}" aria-label="Merken">${HEART}</button></div>
    </div><div class="sim" id="sim"></div>`;
  $('#mMinus').onclick=()=>{n=Math.max(1,n-1);$('#mQty').textContent=n};
  $('#mPlus').onclick=()=>{n++;$('#mQty').textContent=n};
  if(p.na){const b=$('#mAdd');b.disabled=true;b.textContent='Nicht verfügbar';b.style.opacity=.45}
  $('#mAdd').onclick=()=>{add(id,n);closeAll();openDrawer()};
  $('#sheet').scrollTop=0; hideSuggest();
  $('#modal').classList.add('on');$('#modal').setAttribute('aria-hidden','false');$('#scrim').classList.add('on');document.body.style.overflow='hidden';
  $('#sheet .x').focus();
  if(!history.state?.mxModal){try{history.pushState({mxModal:1},'',location.href)}catch{}}
  openP=p; openAt=Date.now(); track(from==='sugg'?'sugg':'view',pref(p)); if(from==='sugg')track('view',pref(p));
  if(B.consent===true){B.seen=[p,...B.seen.filter(x=>x.id!==p.id)].slice(0,12).map(({_h,...x})=>x);store.set('mx-seen',B.seen)}
  similar(p);
}
async function similar(p){
  if(!(p.si>=0))return;
  try{
    const rows=await ensure(p.cat+'/'+p.si,300); if(openP!==p||!$('#sim'))return;
    const pick=rows.filter(x=>x.id!==p.id&&!x.na&&!x.lq).map(x=>[x,(x.vendor===p.vendor?0:1)+Math.abs(Math.log((x.price||1)/(p.price||1)))]).sort((a,b)=>a[1]-b[1]).slice(0,4).map(x=>x[0]);
    if(pick.length)$('#sim').innerHTML=`<h4>Ähnliche Produkte in ${esc(p.sub)}</h4><div class="simg">${pick.map(x=>`<button data-open="${esc(x.id)}"><img src="${esc(imgUrl(x.img,200))}" alt="" loading="lazy"><span class="vendor">${esc(x.vendor)}</span><span>${esc(x.title)}</span><b>${eur(x.price)}</b></button>`).join('')}</div>`;
  }catch{}
}
function endView(){if(!openP)return;track('dwell',{...pref(openP),sec:Math.round((Date.now()-openAt)/1000)});openP=null;clearTimeout(fyT);fyT=setTimeout(()=>{renderForYou();renderSeen()},400)}

/* ───────── demo kasa: sipariş sunucuya yazılır, ödeme yoktur ───────── */
function openCheckout(){
  const items=Object.values(cart).filter(e=>e?.p&&e.n>0); if(!items.length)return;
  closeModal(true); $('#drawer').classList.remove('on'); $('#drawer').setAttribute('aria-hidden','true');
  const s=subtotal(), ship=s>=FREE?0:SHIP, field=(id,l,ph,type='text',ac='')=>`<label class="co-f">${l}<input id="co_${id}" type="${type}" placeholder="${ph}" autocomplete="${ac}" required></label>`;
  $('#sheet').innerHTML=`<button class="iconbtn x" data-close aria-label="Schließen"><svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <form class="co" id="coForm" novalidate>
      <h2>Zur Kasse</h2>
      <p class="co-demo"><b>Demo:</b> Es wird nichts bezahlt und nichts geliefert. Bitte keine echten Daten eingeben – die Bestellung wird nur im Demo-System angezeigt.</p>
      ${field('name','Name','Max Mustermann','text','name')}${field('email','E-Mail','max@example.com','email','email')}${field('street','Straße und Hausnummer','Musterstraße 1','text','street-address')}
      <div class="co-row">${field('zip','PLZ','10115','text','postal-code')}${field('city','Ort','Berlin','text','address-level2')}</div>
      <div class="co-pay"><b>Zahlung</b><span>Rechnung (Demo) · keine Zahlungsdaten nötig</span></div>
      <label class="co-chk"><input id="co_ok" type="checkbox"> Ich habe verstanden, dass dies eine Demo ist.</label>
      <label class="co-chk"><input id="co_mk" type="checkbox"> Optional: Erinnert mich per E-Mail an meinen Warenkorb und an Nachbestellungen (jederzeit widerrufbar).</label>
      <div class="co-err" id="co_err" role="alert"></div>
    </form>
    <aside class="co-sum"><h3>Deine Bestellung</h3>
      ${items.map(({n,p})=>`<div class="co-it"><img src="${esc(imgUrl(p.img,120))}" alt=""><span>${n} × ${esc(p.title)}</span><b>${eur(p.price*n)}</b></div>`).join('')}
      <div class="co-tot"><span>Zwischensumme</span><span>${eur(s)}</span></div><div class="co-tot"><span>DHL-Versand</span><span>${ship?eur(ship):'kostenlos'}</span></div>
      <div class="co-tot t"><span>Gesamt</span><span>${eur(s+ship)}</span></div>
      <button class="btn btn-primary" form="coForm" id="coGo" style="width:100%;margin-top:14px">Demo-Bestellung abschicken</button>
      <span class="tax">inkl. MwSt. · 14 Tage Widerrufsrecht</span></aside>`;
  $('#sheet').classList.add('co-sheet'); $('#modal').classList.add('on'); $('#modal').setAttribute('aria-hidden','false'); $('#scrim').classList.add('on'); document.body.style.overflow='hidden';
  $('#sheet').scrollTop=0; $('#co_name').focus();
  const mkSync=()=>{const em=$('#co_email').value.trim(); if(!/^\S+@\S+\.\S{2,}$/.test(em))return; fetch('/api/cart-save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:em,name:$('#co_name').value.trim(),optin:$('#co_mk').checked,items:items.map(({n,p})=>({id:p.id,qty:n}))})}).catch(()=>{})};
  $('#co_mk').onchange=mkSync; $('#co_email').onchange=()=>{if($('#co_mk').checked)mkSync()};
  $('#coForm').onsubmit=async e=>{e.preventDefault(); const err=$('#co_err'); err.textContent='';
    if(!$('#co_ok').checked){err.textContent='Bitte bestätige den Demo-Hinweis.';return}
    const v=k=>$('#co_'+k).value.trim(); if(!v('name')||!/^\S+@\S+\.\S{2,}$/.test(v('email'))||!v('street')||!v('zip')||!v('city')){err.textContent='Bitte alle Felder korrekt ausfüllen.';return}
    $('#coGo').disabled=true;
    try{const r=await fetch('/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items:items.map(({n,p})=>({id:p.id,qty:n})),marketing:$('#co_mk').checked,customer:{name:v('name'),email:v('email'),street:v('street'),zip:v('zip'),city:v('city')}})}), j=await r.json();
      if(!r.ok)throw new Error(j.error||'Fehler');
      track('checkout',{v:j.order.total,k:'order'}); Object.keys(cart).forEach(k=>delete cart[k]); renderCart();
      $('#sheet').innerHTML=`<button class="iconbtn x" data-close aria-label="Schließen"><svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button><div class="co-done"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg><h2>Danke für deine Demo-Bestellung!</h2><p>Bestellnummer <b>${esc(j.order.id)}</b> · Gesamt ${eur(j.order.total)}</p><p class="tax">Es wurde nichts bezahlt und nichts verschickt. Die Bestellung erscheint im Demo-Verwaltungsbereich.</p><button class="btn btn-primary" data-close>Weiter einkaufen</button></div>`;
    }catch(x){err.textContent=x.message||'Fehler'; $('#coGo').disabled=false}};
}
function closeModal(keep){
  const was=$('#modal').classList.contains('on'); $('#sheet').classList.remove('co-sheet');
  $('#modal').classList.remove('on');$('#modal').setAttribute('aria-hidden','true');if(!keep){$('#scrim').classList.remove('on');document.body.style.overflow=''}
  if(was){endView();if(history.state?.mxModal){try{history.back()}catch{}}}
}
function closeAll(){closeModal();['#drawer','#insights','#filters'].forEach(s=>{$(s).classList.remove('on')});$('#drawer').setAttribute('aria-hidden','true');$('#acct').hidden=true;$('#scrim').classList.remove('on');document.body.style.overflow='';lastFocus?.focus?.()}

/* ───────── kişiselleştirme: Für dich + Zuletzt angesehen ───────── */
let fyT, fyN=0;
async function renderForYou(){
  const sec=$('#fuerdich'), my=++fyN; if(B.consent!==true){sec.hidden=true;return}
  const pr=profile(), key=pr.subs[0]?.[0]; if(!key||pr.n.view<2){sec.hidden=true;return}
  try{
    const rows=await ensure(key,300); if(my!==fyN)return;
    const seen=new Set(B.seen.map(p=>p.id)), bw=Object.fromEntries(pr.brands.slice(0,5));
    const pick=rows.filter(p=>!p.na&&!p.lq&&!seen.has(p.id)&&!cart[p.id]).map(p=>[p,(bw[p.vendor]?-1:0)+(pr.med?Math.abs(Math.log(p.price/pr.med)):0)]).sort((a,b)=>a[1]-b[1]).slice(0,12).map(x=>x[0]);
    if(!pick.length){sec.hidden=true;return}
    $('#fyTitle').textContent=(B.user?.name?`${B.user.name}, das`:'Das')+' könnte dir gefallen.';
    $('#fyWhy').textContent=`Ausgewählt, weil du dir ${subName(key)} angesehen hast${pr.med?` – rund um ${eur(pr.med)}`:''}.`;
    $('#fyRail').innerHTML=pick.map(card).join(''); $('#fyMore').dataset.k=key; sec.hidden=false;
  }catch{sec.hidden=true}
}
function renderSeen(){const sec=$('#zuletzt');if(B.consent!==true||B.seen.length<2){sec.hidden=true;return}$('#seenRail').innerHTML=B.seen.map(card).join('');sec.hidden=false}

/* ───────── müşteri analizi paneli (mağaza sahibi için demo) ───────── */
const EV={view:'Produkt angesehen',dwell:'Verweildauer',add:'In den Warenkorb',remove:'Aus Warenkorb entfernt',wish:'Auf Merkliste',unwish:'Von Merkliste entfernt',search:'Suche',cat:'Kategorie geöffnet',filter:'Filter gesetzt',sort:'Sortierung',more:'Mehr geladen',cart_open:'Warenkorb geöffnet',checkout:'Zur Kasse geklickt',exit_intent:'Wollte die Seite verlassen',sugg:'Suchvorschlag gewählt',session:'Neuer Besuch',login:'Angemeldet'};
function renderInsights(){
  const el=$('#ibody'); if(!el||!$('#insights').classList.contains('on'))return;
  if(B.consent!==true){el.innerHTML='<p class="fnote" style="font-size:14.5px">Die Analyse ist ausgeschaltet, weil keine Einwilligung vorliegt. Ohne Einwilligung speichern wir nur Warenkorb und Merkliste.</p><button class="btn btn-primary" data-consent="1">Analyse einschalten</button>';return}
  const p=profile(), bars=a=>{const m=a[0]?.[1]||1;return a.slice(0,5).map(([k,v])=>`<div class="ibar"><span>${esc(k)}</span><i style="width:${Math.max(6,v/m*100)}%"></i></div>`).join('')||'<p class="fnote">Noch keine Daten.</p>'};
  const fn=[['Angesehen',p.n.view],['Gemerkt',p.n.wish],['Warenkorb',p.n.add],['Kasse',p.n.checkout]], fm=Math.max(1,...fn.map(x=>x[1]));
  el.innerHTML=`<div class="istage"><small>AKTUELLE PHASE</small><b>${p.stage}</b><span>${p.action}</span></div>
    <div class="ikpi"><div><b>${B.meta.sessions}</b>Besuche</div><div><b>${p.n.view}</b>Produkte</div><div><b>${p.n.search}</b>Suchen</div><div><b>${count()}</b>im Korb</div></div>
    <h4>Trichter</h4>${fn.map(([k,v])=>`<div class="ibar f"><span>${k} · ${v}</span><i style="width:${Math.max(4,v/fm*100)}%"></i></div>`).join('')}
    <h4>Interessen</h4>${bars(p.subs.map(([k,v])=>[label(k.split('/')[0])+' › '+subName(k),v]).concat(p.subs.length?[]:p.cats.map(([k,v])=>[label(k),v])))}
    <h4>Marken</h4>${bars(p.brands)}
    <h4>Preisrahmen</h4><p class="fnote" style="font-size:14px">${p.med?`meist ${eur(p.band[0])} – ${eur(p.band[1])} (Median ${eur(p.med)})`:'Noch keine Daten.'}</p>
    <h4>Merkmale</h4><div class="itr">${p.traits.map(t=>`<span>${esc(t)}</span>`).join('')||'<p class="fnote">Noch zu wenig Verhalten für eine Einschätzung.</p>'}</div>
    <h4>Letzte Ereignisse</h4><ol class="ilog">${B.ev.slice(-12).reverse().map(x=>`<li><time>${new Date(x.t).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time>${esc(EV[x.e]||x.e)}${x.q?` „${esc(x.q)}“ (${x.n})`:x.sec!=null?` ${x.sec}s`:x.b?` · ${esc(x.b)}`:x.c?` · ${esc(label(x.c))}`:''}</li>`).join('')||'<li>Noch keine Ereignisse.</li>'}</ol>
    <div class="cta"><button class="btn btn-ghost" data-wipe>Meine Daten löschen</button><button class="btn btn-ghost" data-consent="0">Analyse ausschalten</button></div>`;
}
function openInsights(){closeModal(true);$('#drawer').classList.remove('on');$('#acct').hidden=true;$('#insights').classList.add('on');$('#scrim').classList.add('on');document.body.style.overflow='hidden';renderInsights()}
function setConsent(v){B.consent=v;store.set('mx-consent',v);$('#consent').hidden=true;if(!v){B.ev=[];B.seen=[];outbox.length=0;vid=null;store.del('mx-ev');store.del('mx-seen');store.del('mx-vid');document.cookie='mxv=; Max-Age=0; Path=/'}else track('session',{n:B.meta.sessions});renderForYou();renderSeen();renderInsights()}
function renderAcct(){$('#acct').innerHTML=B.user?.name?`<b>Hallo, ${esc(B.user.name)}</b><p>Schön, dass du da bist.</p><button class="btn btn-ghost" data-insights>Meine Analyse (Demo)</button><button class="flink" data-logout>Abmelden</button>`
  :`<b>Anmelden (Demo)</b><p>Nur dein Vorname – er bleibt in diesem Browser.</p><form id="loginF"><input id="uname" maxlength="24" placeholder="Vorname" autocomplete="given-name" aria-label="Vorname"><button class="btn btn-primary">Anmelden</button></form><button class="flink" data-insights>Kundenanalyse ansehen (Demo)</button>`;
  $('#acctBtn').classList.toggle('in',!!B.user?.name)}

/* ───────── olaylar ───────── */
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-add],[data-wish],[data-open],[data-cat],[data-fcat],[data-fsub],[data-more],[data-price],[data-pill],[data-reset],[data-clearf],[data-ballload],[data-fopen],[data-fclose],[data-sq],[data-scat],[data-sbrand],[data-q],[data-rm],[data-close],[data-checkout],[data-rail],[data-consent],[data-insights],[data-wipe],[data-logout],[data-fy]');
  if(!t){ if(e.target.id==='modal')closeAll(); if(!e.target.closest('.search'))hideSuggest(); if(!e.target.closest('#acct,#acctBtn'))$('#acct').hidden=true; return; }
  const d=t.dataset;
  if(d.add)add(d.add);
  else if(d.wish){const id=d.wish,p=known.get(id);if(!p)return;if(wish[id])delete wish[id];else{const {_h,...c}=p;wish[id]=c}store.set('mx-wish2',wish);track(wish[id]?'wish':'unwish',pref(p));
    $$('[data-wish]').forEach(b=>{if(b.dataset.wish===id){b.setAttribute('aria-pressed',!!wish[id]);if(wish[id]){b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop')}}});
    toast(wish[id]?'Auf der Merkliste gespeichert':'Von der Merkliste entfernt');renderCart();if(state.wishOnly)renderGrid();}
  else if(d.open)openModal(d.open,d.from);
  else if(d.cat){e.preventDefault();setCat(d.cat);$('#katalog').scrollIntoView()}
  else if(d.fcat)setCat(d.fcat,true);
  else if('fsub' in d){const i=Number(d.fsub);state.sub=state.sub===i?-1:i;state.shown=PAGE;state.brands=new Set();pushNext=true;if(state.sub>=0)track('cat',{c:state.cat,si:state.sub});renderGrid()}
  else if('more' in d){state.shown+=PAGE;track('more');renderGrid()}
  else if('price' in d){const [a,b]=d.price.split('-').map(x=>x===''?null:Number(x));const on=state.pmin===a&&state.pmax===b;state.pmin=on?null:a;state.pmax=on?null:b;state.shown=PAGE;if(!on&&b!=null)track('filter',{k:'pmax'});renderGrid()}
  else if(d.pill){const k=d.pill;if(k==='wish')state.wishOnly=false;else if(k==='q'){state.q='';$('#q').value=''}else if(k==='cat'){state.cat='all';state.sub=-1}else if(k==='sub')state.sub=-1;else if(k==='price')state.pmin=state.pmax=null;else if(k==='avail')state.avail=false;else if(k.startsWith('b:'))state.brands.delete(k.slice(2));state.shown=PAGE;renderGrid()}
  else if('reset' in d){state=blank();$('#q').value='';$('#sort').value='';bq='';pushNext=true;renderGrid()}
  else if('clearf' in d){state.brands=new Set();state.pmin=state.pmax=null;state.avail=false;renderGrid()}
  else if('ballload' in d){t.textContent='Marken werden geladen …';loadAllBrands()}
  else if('fopen' in d){$('#filters').classList.add('on');$('#scrim').classList.add('on');document.body.style.overflow='hidden'}
  else if('fclose' in d){$('#filters').classList.remove('on');$('#scrim').classList.remove('on');document.body.style.overflow=''}
  else if('sq' in d)commitSearch(d.sq);
  else if(d.scat){hideSuggest();$('#q').value='';setCat(d.scat);if(d.ssub>=0){state.sub=Number(d.ssub);renderGrid()}$('#katalog').scrollIntoView()}
  else if(d.sbrand){hideSuggest();state=blank();$('#q').value='';state.brands.add(d.sbrand);pushNext=true;track('filter',{k:'brand',b:d.sbrand});renderGrid();$('#katalog').scrollIntoView()}
  else if(d.q){const c=cart[d.q];if(c){c.n+=Number(d.d);if(c.n<1)track('remove',pref(c.p));renderCart()}}
  else if(d.rm){const c=cart[d.rm];if(c)track('remove',pref(c.p));delete cart[d.rm];renderCart()}
  else if('close' in d)closeAll();
  else if('checkout' in d){track('checkout',{v:Math.round(subtotal()*100)/100});openCheckout()}
  else if(d.rail){const r=$('#'+t.dataset.target);r.scrollBy({left:d.rail*r.clientWidth*.8,behavior:'smooth'})}
  else if('consent' in d)setConsent(d.consent==='1');
  else if('insights' in d){e.preventDefault();openInsights()}
  else if('wipe' in d){B.ev=[];B.seen=[];store.del('mx-ev');store.del('mx-seen');renderForYou();renderSeen();renderInsights();toast('Deine Verlaufsdaten wurden gelöscht')}
  else if('logout' in d){B.user=null;store.del('mx-user');renderAcct();renderForYou()}
  else if('fy' in d){e.preventDefault();const [c,i]=(t.dataset.k||'').split('/');if(CAT[c]){setCat(c);state.sub=Number(i);renderGrid();$('#katalog').scrollIntoView()}}
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.brand){t.checked?state.brands.add(t.dataset.brand):state.brands.delete(t.dataset.brand);state.shown=PAGE;if(t.checked)track('filter',{k:'brand',b:t.dataset.brand});renderGrid()}
  else if(t.id==='pmin'||t.id==='pmax'){const v=parseFloat(t.value);state[t.id]=isFinite(v)&&v>=0?v:null;state.shown=PAGE;if(t.id==='pmax'&&state.pmax!=null)track('filter',{k:'pmax'});renderGrid()}
  else if(t.id==='favail'){state.avail=t.checked;state.shown=PAGE;track('filter',{k:'avail'});renderGrid()}
});
document.addEventListener('input',e=>{if(e.target.id==='bq'){bq=e.target.value;if(!facetBrands&&bq.trim().length>=2)loadAllBrands();renderBrandList()}});
document.addEventListener('submit',e=>{if(e.target.id==='loginF'){e.preventDefault();const n=$('#uname').value.trim();if(!n)return;B.user={name:n};store.set('mx-user',B.user);track('login');renderAcct();renderForYou();toast('Hallo, '+n)}});
$('#scrim').onclick=closeAll;
$('#cartBtn').onclick=openDrawer;
$('#acctBtn').onclick=()=>{const a=$('#acct');a.hidden=!a.hidden;if(!a.hidden)renderAcct()};
$('#wishBtn').onclick=()=>{state=blank();state.wishOnly=true;state.shown=9999;$('#q').value='';pushNext=true;renderGrid();$('#katalog').scrollIntoView()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!sg.hidden)hideSuggest();else closeAll()}if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){e.preventDefault();$('#q').focus()}});
let qt;
$('#q').addEventListener('focus',()=>{preloadAll();renderSuggest()});
$('#q').addEventListener('input',()=>{preloadAll();clearTimeout(qt);qt=setTimeout(renderSuggest,140)});
$('#q').addEventListener('search',e=>{if(!e.target.value&&state.q){state.q='';renderGrid()}});
$('#q').addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();commitSearch($('#q').value);$('#q').blur()}
  else if(e.key==='ArrowDown'&&!sg.hidden){e.preventDefault();sg.querySelector('button')?.focus()}
});
sg.addEventListener('keydown',e=>{const b=[...sg.querySelectorAll('button')],i=b.indexOf(document.activeElement);if(e.key==='ArrowDown'){e.preventDefault();b[Math.min(b.length-1,i+1)]?.focus()}else if(e.key==='ArrowUp'){e.preventDefault();(i<=0?$('#q'):b[i-1]).focus()}});
$('#sort').onchange=e=>{state.sort=e.target.value;state.shown=PAGE;track('sort',{o:state.sort});renderGrid()};
window.addEventListener('popstate',e=>{if($('#modal').classList.contains('on')&&!e.state?.mxModal){$('#modal').classList.remove('on');$('#modal').setAttribute('aria-hidden','true');$('#scrim').classList.remove('on');document.body.style.overflow='';endView();return}
  const h=location.hash;if((h==='#katalog'||h.startsWith('#katalog?'))&&h.slice(9)!==qs())applyUrl()});
let exitShown=false;
document.addEventListener('mouseout',e=>{if(!e.relatedTarget&&e.clientY<=0&&!exitShown&&count()>0){exitShown=true;track('exit_intent');toast(`Dein Warenkorb (${count()} Artikel) bleibt für dich gespeichert`)}});

/* öne çıkan kutular */
function pick(sel,p,lab){const el=$(sel);if(!p||!el)return;el.dataset.open=p.id;
  el.innerHTML=`<img src="${p.img}" alt=""><span><small>${lab}</small><b>${esc(p.title.split(' – ')[0].slice(0,46))}</b><span>${eur(p.price)}</span></span>`}
pick('#pickParfum',F.find(p=>p.vendor==='Chanel'),'UNSER FUND ZUM MOMENT');
pick('#pickTech',F.find(p=>p.id==='apple-a1400'),'UNSER FUND ZUM MOMENT');
const sauv=F.find(p=>p.img.includes('sauvage-edp')); if(sauv)$('#heroTag').dataset.open=sauv.id;
$$('[data-total]').forEach(el=>el.textContent=num(IDX.total));
$$('[data-ncat]').forEach(el=>{const c=CAT[el.dataset.ncat];if(c)el.textContent=num(c.n)+' Produkte'});

/* yönetici panelinden gelen ayarlar: duyuru, gizli ürünler, öne çıkanlar */
async function loadConfig(){
  if(location.protocol==='file:')return;
  try{
    const c=new AbortController(), t=setTimeout(()=>c.abort(),1500), r=await fetch('/api/config',{signal:c.signal}); clearTimeout(t); if(!r.ok)return;
    const cfg=await r.json(); (cfg.hidden||[]).forEach(id=>HID.add(id));
    /* gizli / onay bekleyen ürünler kategori, alt kategori ve toplam sayaçlarından düşer */
    const hc=cfg.hiddenCounts;
    if(hc){IDX.total=Math.max(0,IDX.total-(hc.total||0));
      for(const [k,n] of Object.entries(hc.cats||{}))if(CAT[k])CAT[k].n=Math.max(0,CAT[k].n-n);
      for(const [k,n] of Object.entries(hc.subs||{})){const [c,i]=k.split('/'),sub=CAT[c]?.subs[i];if(sub)sub.n=Math.max(0,sub.n-n)}
      $$('[data-total]').forEach(el=>el.textContent=num(IDX.total));
      $$('[data-ncat]').forEach(el=>{const c=CAT[el.dataset.ncat];if(c)el.textContent=num(c.n)+' Produkte'})}
    OV=cfg.overrides||{};
    /* kategori adları ve gizli kategoriler */
    for(const [k,o] of Object.entries(cfg.categories||{})){const cat=CAT[k];if(!cat)continue;
      if(o.label){cat.label=o.label;$$('nav.cats a[data-cat="'+k+'"], footer a[data-cat="'+k+'"]').forEach(a=>{a.textContent=o.label})}
      if(o.hidden){HIDCAT.add(k);$$('[data-cat="'+k+'"], [data-ncat="'+k+'"]').forEach(a=>{(a.closest('li')||a.closest('.tile')||a).hidden=true})}}
    /* metin içeriği (yalnızca textContent) */
    const ct=cfg.content||{}, an=cfg.announcement||'';
    if(an)$('.announce span:nth-child(1)').textContent=an;
    if(ct.announce2)$('.announce span:nth-child(2)').textContent=ct.announce2;
    if(ct.heroTitle)$('#heroH').textContent=ct.heroTitle;
    if(ct.heroSub)$('#heroSub').textContent=ct.heroSub;
    if(ct.demobar)$('.demobar').textContent=ct.demobar;
    if(Number.isFinite(ct.freeShip)&&ct.freeShip>=0){FREE=ct.freeShip;wasFree=subtotal()>=FREE}
    /* düzenlemeleri bilinen tüm ürünlere uygula */
    F.forEach(ov); known.forEach(ov); Object.values(cart).forEach(e=>e?.p&&ov(e.p)); Object.values(wish).forEach(p=>p&&ov(p)); B.seen.forEach(p=>p&&ov(p));
    const feat=(cfg.featured||[]).map(p=>({...ov(p),base:''})).filter(p=>!HIDCAT.has(p.cat)); feat.forEach(p=>known.set(p.id,p));
    if(feat.length){$('#empRail').innerHTML=feat.map(card).join('');$('#empfohlen').hidden=false}
    Object.keys(cart).forEach(id=>{if(HID.has(id))delete cart[id]});
  }catch{}
}
await loadConfig();
/* vitrin rafları: çok bakılanlar, 25 € altı, premium, (varsa) indirimli */
async function loadShelves(){
  if(location.protocol==='file:')return;
  try{
    const r=await fetch('/api/shop/home'); if(!r.ok)return; const h=await r.json();
    const fill=(id,rows)=>{const sec=$('#'+id), rail=$('#'+id+'Rail'); if(!sec||!rail)return; const ps=(rows||[]).map(r=>{const p={...r,base:''};ov(p);if(!known.has(p.id))known.set(p.id,p);return known.get(p.id)}).filter(p=>!HID.has(p.id)&&!HIDCAT.has(p.cat));
      if(ps.length<4){sec.hidden=true;return} rail.innerHTML=ps.map(card).join(''); sec.hidden=false};
    fill('angebote',h.deals); fill('beliebt',h.best); fill('budget',h.budget); fill('premium',h.premium);
    if(h.bestSource==='curated'){const t=$('#beliebt h2');if(t)t.textContent='Unsere Auswahl für dich.';const e=$('#beliebt .eyebrow');if(e)e.textContent='Von uns ausgewählt'}
  }catch{}
}
loadShelves();
renderRails();renderCart();renderAcct();
if(!applyUrl(true))renderGrid();
renderForYou();renderSeen();
if(B.consent===null)$('#consent').hidden=false;
if(newSession){track('session',{n:B.meta.sessions});if(B.meta.sessions>1&&count()>0)setTimeout(()=>toast(`${B.user?.name?B.user.name+', d':'D'}ein Warenkorb wartet auf dich (${count()} Artikel)`),1200)}
const io=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}}),{threshold:.12});
$$('.reveal').forEach(el=>io.observe(el));
/* Instagram bağlantısı: /?p=<ürün kimliği> ürün penceresini açar */
(async()=>{const id=new URLSearchParams(location.search).get('p');if(!id)return;try{const r=await fetch('/api/shop/product?id='+encodeURIComponent(id));if(!r.ok)return;const p={...(await r.json()),base:''};ov(p);if(!known.has(p.id))known.set(p.id,p);openModal(p.id,'instagram')}catch{}})();
})();
