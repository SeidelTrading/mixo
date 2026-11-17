import { tenantOfUser } from './tenants.mjs';

// Kiracı kapsamı (K-07). Tek sorumluluk: "bu kullanıcı hangi kiracıyı görür" ve "bu kayda erişebilir mi".
// Konsey bulgusu #1 (Kritik): services/tenants.mjs içindeki scopeOf/tenantOfUser yazılmıştı ama hiçbir uç çağırmıyordu;
// bir kiracının 'duzenleyen' kullanıcısı diğer kiracının verisini görebiliyordu.
//
// MİMARİ NOTU: ARCHITECTURE.md'deki bağımlılık yönü routes → services → lib'dir; bu dosya istisnadır.
// Kapsam kuralı kiracı kaydını okumak zorunda olduğu için services/tenants.mjs YALNIZ OKUNUR biçimde
// (tenantOfUser) içe aktarılır. tenants.mjs bu modülü içe aktarmaz, yani döngü oluşmaz.
//
// Kural:
//   - 'yonetici' (isBoss) tüm kiracıları görür; bu bilinçli bir karardır ve kodda açıkça durur.
//   - Diğer roller yalnız kendi kiracısına bağlı kayıtları görür.
//   - Kullanıcı hiçbir kiracıya bağlı değilse (tek kiracılı kurulum) kiracı alanı olmayan kayıtlara erişebilir.

export class ScopeError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.code = 'forbidden';
    this.http = 403; // handler.mjs bunu 403 yanıtına çevirir
  }
}

const nameOf = me => (typeof me?.username === 'string' ? me.username : '');

/**
 * İstekteki kullanıcının kiracı kapsamı.
 * @param {{ username?: string, role?: string } | null | undefined} me
 * @returns {{ tenantId: string | null, isBoss: boolean }}
 */
export function scopeFor(me) {
  const isBoss = me?.role === 'yonetici';
  const u = nameOf(me);
  return { tenantId: u ? (tenantOfUser(u)?.id ?? null) : null, isBoss };
}

// Kapsam ile tek bir kaydın kiracı kimliğini karşılaştırır. Kayıtta kiracı alanı yoksa (null/undefined)
// yalnız kiracıya bağlı OLMAYAN kullanıcı (ve yönetici) görebilir.
const matches = (s, tenantId) =>
  s.isBoss || (s.tenantId ? tenantId === s.tenantId : tenantId === null || tenantId === undefined);

/**
 * Yetkisiz değilse kapsamı döndürür, yetkisizse ScopeError (403) fırlatır.
 * @param {{ username?: string, role?: string } | null | undefined} me
 * @param {string | null | undefined} tenantId
 */
export function assertScope(me, tenantId) {
  const s = scopeFor(me);
  if (!matches(s, tenantId)) throw new ScopeError('Bu kayda erişim yetkiniz yok.');
  return s;
}

/** Fırlatmayan sürüm (liste süzmede ve koşullu dallarda). */
export function canSee(me, tenantId) {
  return matches(scopeFor(me), tenantId);
}

/**
 * Liste süzme: kapsam bir kez hesaplanır, her kayıt için kiracı kimliği `pick` ile okunur.
 * @template T
 * @param {{ username?: string, role?: string } | null | undefined} me
 * @param {T[]} rows
 * @param {(row: T) => string | null | undefined} [pick]
 * @returns {T[]}
 */
export function filterScope(me, rows, pick = /** @type {any} */ (r => r?.tenantId ?? null)) {
  const s = scopeFor(me);
  if (s.isBoss) return rows;
  return rows.filter(r => matches(s, pick(r)));
}

/**
 * Kayıtlarında kiracı alanı OLMAYAN modüller için kapı. Veri kiracıya göre süzülemediğinden,
 * bir kiracıya bağlı kullanıcı (yönetici dışı) bu veriyi hiç görmemelidir: kaydın ona ait olduğu
 * kanıtlanamaz. Yöneticiye ve hiçbir kiracıya bağlı olmayan kullanıcıya (tek kiracılı kurulum) açıktır.
 * @param {{ username?: string, role?: string } | null | undefined} me
 * @param {string} what
 */
export function assertShared(me, what = 'Bu veri') {
  const s = scopeFor(me);
  if (s.tenantId && !s.isBoss)
    throw new ScopeError(`${what} kayıtları kiracıya bağlı tutulmadığı için kiracı kullanıcısına kapalıdır.`);
  return s;
}

// Prototip kirlenmesi kapısı lib/safe.mjs'tedir; uçlar onu buradan da alabilsin diye yeniden dışa aktarılır.
export { isSafeKey } from '../lib/safe.mjs';
