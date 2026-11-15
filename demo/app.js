/* Outlet demo – katalog, arama, filtre, sepet ve davranış analizi (tamamı tarayıcıda çalışır) */
// Yükleyici: app/*.js dosyaları (index.html'de sırayla) bölümleri window.MXM altına kaydeder; burada sırayla çalıştırılır.
// Bölümler ortak adları Ctx üzerinden paylaşır; yeniden atanan değişkenler Ctx.S içindedir.
(async () => {
  const Ctx = { S: {} };
  for (const g of [
    'core',
    'behavior',
    'tracking',
    'catalog',
    'cards',
    'filters',
    'url',
    'grid',
    'suggest',
    'cart',
    'drawer',
    'checkout',
    'personal',
    'insights',
    'clickactions1',
    'clickactions2',
    'clickactions3',
    'clicks',
    'inputs',
    'searchinputs',
    'config',
    'init',
  ])
    await window.MXM[g](Ctx);
})();
