import { Readable } from 'node:stream';
import { createGunzip, createInflateRaw } from 'node:zlib';

/**
 * Büyük besleme dosyaları (yüzlerce MB) belleğe tamamen alınmadan işlenir:
 * bayt akışı -> (gzip | zip ilk dosya | düz) -> UTF-8 metin parçaları.
 * Sıkıştırma ilk baytlardan anlaşılır (gzip 1f 8b, zip "PK\3\4").
 */

const GZIP = [0x1f, 0x8b];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const startsWith = (buf, sig) => buf.length >= sig.length && sig.every((b, i) => buf[i] === b);

/** async iterable (Uint8Array) başına bir tampon ekleyip kalanını aynen verir. */
async function* prepend(head, it) {
  if (head.length) yield head;
  for await (const c of it) yield c;
}

/** Bir zlib dönüşümünden geçirir; tüketici erken çıkarsa (satır sınırı) iki uç da kapatılır. */
async function* through(src, z) {
  const input = Readable.from(src, { objectMode: false });
  input.on('error', e => z.destroy(e));
  input.pipe(z);
  try {
    for await (const c of z) yield c;
  } finally {
    input.destroy();
    z.destroy();
  }
}

/** En az n bayt olana kadar okur; { head, rest } döner. */
async function readAtLeast(it, n, head = Buffer.alloc(0)) {
  while (head.length < n) {
    const r = await it.next();
    if (r.done) break;
    head = Buffer.concat([head, Buffer.from(r.value)]);
  }
  return head;
}

/** Zip arşivindeki İLK dosyanın sıkıştırılmış verisini (yöntem 0: düz, 8: deflate) açar. Diğer dosyalar yok sayılır. */
async function* unzipFirst(it, head) {
  head = await readAtLeast(it, 30, head);
  if (!startsWith(head, ZIP)) throw new Error('zip yerel dosya başlığı yok');
  const flags = head.readUInt16LE(6);
  const method = head.readUInt16LE(8);
  const compSize = head.readUInt32LE(18);
  const start = 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  head = await readAtLeast(it, start, head);
  const sizeKnown = !(flags & 0x08) && compSize > 0;
  if (method !== 0 && method !== 8) throw new Error(`zip sıkıştırma yöntemi desteklenmiyor (${method})`);
  if (method === 0 && !sizeKnown) throw new Error('zip: boyutu bilinmeyen sıkıştırılmamış girdi');
  async function* data() {
    let left = sizeKnown ? compSize : Infinity;
    for await (const c of prepend(head.subarray(start), { [Symbol.asyncIterator]: () => it })) {
      const b = Buffer.from(c);
      if (b.length >= left) {
        yield b.subarray(0, left);
        return;
      }
      left -= b.length;
      yield b;
    }
  }
  yield* method === 8 ? through(data(), createInflateRaw()) : data();
}

/**
 * Bayt akışını açılmış bayt akışına çevirir. compression: 'auto' | 'gzip' | 'zip' | 'none'.
 * maxBytes: açılmış veri üst sınırı (sıkıştırma bombasına karşı).
 */
export async function* decompress(source, { compression = 'auto', maxBytes = 4 * 1024 ** 3 } = {}) {
  const it = source[Symbol.asyncIterator]();
  const head = await readAtLeast(it, 4);
  const kind =
    compression !== 'auto'
      ? compression
      : startsWith(head, GZIP)
        ? 'gzip'
        : startsWith(head, ZIP)
          ? 'zip'
          : 'none';
  const rest = { [Symbol.asyncIterator]: () => it };
  const out =
    kind === 'gzip'
      ? through(prepend(head, rest), createGunzip())
      : kind === 'zip'
        ? unzipFirst(it, head)
        : prepend(head, rest);
  let total = 0;
  for await (const c of out) {
    total += c.length;
    if (total > maxBytes) throw new Error('besleme açılmış boyut sınırını aştı');
    yield c;
  }
}

/** Açılmış bayt akışını UTF-8 metin parçalarına çevirir (çok baytlı karakterler parça sınırında bölünmez, BOM atılır). */
export async function* textChunks(bytes) {
  const dec = new TextDecoder('utf-8');
  for await (const c of bytes) {
    const s = dec.decode(c, { stream: true });
    if (s) yield s;
  }
  const tail = dec.decode();
  if (tail) yield tail;
}
