// Ürün havuzu eşleştirme kuralı birim testleri. Çalıştır: node --test test/unit-pool.mjs   (Node >= 22.13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mixo-unit-'));
process.env.ADMIN_PASSWORD = 'birim-test-parolasi-1';
process.env.SESSION_SECRET = 'birim-test-secret';
process.env.RAILWAY_ENVIRONMENT = '';
process.env.ORDER_VERIFY = 'off';

const pool = await import('../services/pool.mjs');
const { store } = await import('../lib/store.mjs');

test.after(() => {
  try {
    store.close();
  } catch {}
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('havuz: aynı vendor + aynı başlık ama farklı MPN ayrı ürün kalır', () => {
  const a = pool.ingest({
    src: 'wawi',
    ref: 'MPN-A',
    title: 'Akkuschrauber GSR 12V',
    vendor: 'Bosch',
    mpn: '06019H8100',
    eans: ['4006381333931'],
    price: 99,
    image: 'https://cdn.example.com/a.jpg',
  });
  const b = pool.ingest({
    src: 'wawi',
    ref: 'MPN-B',
    title: 'Akkuschrauber GSR 12V',
    vendor: 'Bosch',
    mpn: '06019H8200',
    eans: ['5901234123457'],
    price: 149,
    image: 'https://cdn.example.com/b.jpg',
  });
  assert.notEqual(b.id, a.id, 'farklı MPN birleştirilmemeli');
  assert.equal(b.created, true);
  assert.equal(pool.getPool(a.id).mpn, '06019H8100');
  assert.equal(pool.getPool(b.id).mpn, '06019H8200');
  // İkinci ürünün fiyatı, görseli ve EAN'ı kendi kaydında duruyor (feed'den düşmüyor).
  assert.equal(pool.getPool(b.id).sources[0].data.price, 149);
  assert.equal(pool.eanFor(b.id, 'idealo'), '5901234123457');
  assert.equal(pool.getPool(a.id).eans.length, 1);
});

test('havuz: MPN yokken başlık eşleşmesi hâlâ birleştirir', () => {
  const a = pool.ingest({ src: 'wawi', ref: 'T-A', title: 'Kabellose Maus X', vendor: 'Logi' });
  const b = pool.ingest({ src: 'amazon', ref: 'T-B', title: 'kabellose  maus x', vendor: 'LOGI' });
  assert.equal(b.id, a.id);
  assert.equal(b.created, false);
});

test('havuz: taraflardan birinde MPN yoksa başlık eşleşmesi son çare olarak çalışır', () => {
  const a = pool.ingest({ src: 'wawi', ref: 'H-A', title: 'Tastatur K2', vendor: 'Keyco' });
  // Gelen kaydın MPN'i var, havuzdaki kaydın MPN'i boş → başlık eşleşmesi geçerli, MPN tamamlanır.
  const b = pool.ingest({ src: 'amazon', ref: 'H-B', title: 'Tastatur K2', vendor: 'Keyco', mpn: 'K2-001' });
  assert.equal(b.id, a.id);
  assert.equal(pool.getPool(a.id).mpn, 'K2-001');
  // Artık havuzda MPN var: farklı MPN'li üçüncü kayıt ayrı ürün olur.
  const c = pool.ingest({ src: 'idealo', ref: 'H-C', title: 'Tastatur K2', vendor: 'Keyco', mpn: 'K2-002' });
  assert.notEqual(c.id, a.id);
});

test('havuz: MPN eşleşmesi başlık farklı olsa da birleştirir (sıra: EAN > MPN > başlık)', () => {
  const a = pool.ingest({
    src: 'wawi',
    ref: 'S-A',
    title: 'Bohrmaschine GSB 13 RE',
    vendor: 'Bosch2',
    mpn: 'GSB 13 RE',
  });
  const b = pool.ingest({
    src: 'amazon',
    ref: 'S-B',
    title: 'BOSCH Schlagbohrmaschine — tamamen başka başlık',
    vendor: 'bosch2',
    mpn: 'gsb13re',
  });
  assert.equal(b.id, a.id);
});
