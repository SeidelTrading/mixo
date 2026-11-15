// Tarayıcı duman testi (Playwright, Chromium): vitrin açılır, arama/sepet/merkliste/ürün penceresi çalışır, sayfa hatası yok.
// Çalıştır: node test/browser.mjs   (Node >= 22.13; Chromium: PLAYWRIGHT_CHROMIUM yolu, ~/.cache/ms-playwright ya da sistem Chrome'u)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 18793,
  BASE = `http://127.0.0.1:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mixo-browser-'));
let pass = 0,
  failN = 0;
const ok = (c, name, extra = '') => {
  c ? pass++ : failN++;
  console.log((c ? '  ✔ ' : '  ✘ ') + name + (c ? '' : '   ← ' + extra));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChromium() {
  const cands = [process.env.PLAYWRIGHT_CHROMIUM];
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  if (fs.existsSync(cache))
    for (const d of fs
      .readdirSync(cache)
      .filter(x => /^chromium-\d+$/.test(x))
      .sort()
      .reverse())
      cands.push(path.join(cache, d, 'chrome-linux64/chrome'), path.join(cache, d, 'chrome-linux/chrome'));
  cands.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/snap/bin/chromium');
  return cands.find(p => p && fs.existsSync(p));
}

const exe = findChromium();
if (!exe) {
  console.log(
    'Chromium bulunamadı; tarayıcı testi atlandı (PLAYWRIGHT_CHROMIUM verin ya da `npx playwright install chromium`).',
  );
  process.exit(process.env.CI ? 1 : 0);
}

const child = spawn(process.execPath, ['--no-warnings', 'server.mjs'], {
  cwd: DEMO,
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: DIR,
    ADMIN_PASSWORD: 'tarayici-test-parola-1',
    SESSION_SECRET: 'x',
    RAILWAY_ENVIRONMENT: '',
    ANTHROPIC_API_KEY: '',
  },
});
let logs = '';
child.stdout.on('data', d => (logs += d));
child.stderr.on('data', d => (logs += d));
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(BASE + '/api/config');
      break;
    } catch {
      await sleep(150);
    }
  }
  browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE' });
  // Dış görseller (CDN) çevrimdışı olabilir: yalnız kendi adresimize giden istekleri geçir.
  await ctx.route(
    u => !u.href.startsWith(BASE),
    r => r.abort(),
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/i.test(m.text()))
      errors.push('console: ' + m.text());
  });

  console.log('1) Açılış ve katalog');
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid .card:not(.sk)', { timeout: 20000 });
  const n0 = await page.locator('#grid .card:not(.sk)').count();
  ok(n0 > 5, 'ürün ızgarası dolu (' + n0 + ' kart)');
  ok(((await page.textContent('#count')) || '').trim().length > 0, 'ürün sayacı görünür');
  const consent = page.locator('#consent [data-consent="0"]');
  if (await consent.isVisible()) {
    await consent.click();
    ok(!(await page.locator('#consent').isVisible()), '"Nur Notwendiges" onay çubuğunu kapatır');
  }

  console.log('2) Arama ve sıralama');
  const total0 = (await page.textContent('#count')) || '';
  await page.fill('#q', 'kabel');
  await page.press('#q', 'Enter');
  await page
    .waitForFunction(t => document.querySelector('#count')?.textContent !== t, total0, { timeout: 10000 })
    .catch(() => {});
  ok((await page.textContent('#count')) !== total0, 'arama sonuç sayısını değiştirir');
  ok((await page.locator('#grid .card:not(.sk)').count()) > 0, 'arama sonuç döndürür');
  await page.selectOption('#sort', { index: 1 }).catch(() => {});
  await sleep(300);
  ok((await page.locator('#grid .card:not(.sk)').count()) > 0, 'sıralama sonrası ürünler duruyor');

  console.log('3) Sepet ve merkliste');
  await page.locator('#grid [data-add]').first().click();
  ok(((await page.textContent('#cartCount')) || '').trim() === '1', 'sepet sayacı 1');
  await page.locator('#grid [data-wish]').first().click();
  ok(((await page.textContent('#wishCount')) || '').trim() === '1', 'merkliste sayacı 1');
  await page.click('#cartBtn');
  await page.waitForSelector('#items >> text=€', { timeout: 5000 }).catch(() => {});
  ok(/€/.test((await page.textContent('#items')) || ''), 'sepet çekmecesi ürünü ve fiyatı gösterir');
  await page.keyboard.press('Escape');
  await sleep(300);

  console.log('4) Ürün penceresi');
  await page.locator('#grid [data-open]').first().click();
  await page.waitForSelector('#sheet *', { timeout: 5000 }).catch(() => {});
  ok(((await page.textContent('#sheet')) || '').trim().length > 20, 'ürün penceresi içerik gösterir');
  await page.keyboard.press('Escape');

  console.log('5) Kalıcılık');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid .card:not(.sk)', { timeout: 20000 });
  ok(((await page.textContent('#cartCount')) || '').trim() === '1', 'yeniden yüklemeden sonra sepet korunur');

  console.log('6) Öneri listesi, filtre, kasa');
  await page.fill('#q', '');
  await page.press('#q', 'Enter');
  await page.waitForSelector('#grid .card:not(.sk)', { timeout: 10000 });
  await page.fill('#q', 'ka');
  await page
    .waitForFunction(() => (document.querySelector('#suggest')?.textContent || '').trim().length > 0, null, {
      timeout: 5000,
    })
    .catch(() => {});
  ok(((await page.textContent('#suggest')) || '').trim().length > 0, 'arama önerileri açılır');
  await page.fill('#q', '');
  await page.press('#q', 'Escape');
  const fcat = page.locator('#filters [data-fcat]:not([data-fcat="all"])').first();
  if (await fcat.count()) {
    const before = (await page.textContent('#count')) || '';
    await fcat.click();
    await page
      .waitForFunction(t => document.querySelector('#count')?.textContent !== t, before, { timeout: 8000 })
      .catch(() => {});
    ok((await page.textContent('#count')) !== before, 'kategori filtresi sonuç sayısını değiştirir');
    ok(
      /[?&#]/.test(page.url()) && page.url() !== BASE + '/',
      'filtre adrese yansır (paylaşılabilir bağlantı)',
      page.url(),
    );
  }
  await page.click('#cartBtn');
  await page.click('[data-checkout]');
  await page.waitForSelector('#coForm', { timeout: 5000 });
  const vals = {
    name: 'Max Mustermann',
    email: 'tarayici@example.com',
    street: 'Musterstr. 1',
    zip: '10115',
    city: 'Berlin',
  };
  for (const [k, v] of Object.entries(vals))
    if (await page.locator('#co_' + k).count()) await page.fill('#co_' + k, v);
  await page.check('#co_ok');
  await page.click('#coGo');
  await page.waitForSelector('#sheet >> text=/MX-/', { timeout: 10000 }).catch(() => {});
  ok(
    /MX-/.test((await page.textContent('#sheet')) || ''),
    'demo siparişi tamamlanır ve sipariş numarası gösterilir',
  );

  ok(errors.length === 0, 'sayfa hatası yok', errors.slice(0, 3).join(' | '));
} catch (e) {
  failN++;
  console.error('TARAYICI TESTİ ÇÖKTÜ:', e.message, '\n--- sunucu günlüğü ---\n' + logs.slice(-800));
} finally {
  await browser?.close().catch(() => {});
  child.kill('SIGTERM');
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(`\nSONUÇ: ${pass} geçti, ${failN} kaldı`);
  process.exit(failN ? 1 : 0);
}
