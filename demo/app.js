/* Outlet demo – katalog, arama, filtre, sepet ve davranış analizi (tamamı tarayıcıda çalışır) */
// Yükleyici: app/*.js dosyaları (index.html'de sırayla) bölümleri window.MXM altına kaydeder; burada sırayla çalıştırılır.
// Bölümler ortak adları Ctx üzerinden paylaşır; yeniden atanan değişkenler Ctx.S içindedir.
(async () => {
  const Ctx = { S: {} };
  for (const g of [
    'core',
    'behavior',
    'catalog',
    'cards',
    'url',
    'grid',
    'cart',
    'modal',
    'personal',
    'events',
    'boot',
  ])
    await window.MXM[g](Ctx);
})();
