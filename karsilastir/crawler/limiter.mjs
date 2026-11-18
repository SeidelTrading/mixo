/**
 * Host başına en az `minIntervalMs` aralık + küresel eşzamanlılık sınırı.
 * Slot rezervasyonu senkron yapıldığı için aynı host'a gelen istekler kesinlikle sıraya girer.
 * Ayrıca aynı host'a ASLA paralel istek gitmez: bir istek (yanıt gövdesi dahil) bitmeden o host'un sonraki isteği
 * başlamaz; yavaş bir yanıt aralığı aşsa bile iki istek üst üste binmez.
 * now/sleep enjekte edilebilir (testlerde sahte saat).
 */
export class RateLimiter {
  constructor({
    minIntervalMs,
    maxConcurrent = 2,
    now = Date.now,
    sleep = ms => new Promise(r => setTimeout(r, ms)),
  }) {
    this.minIntervalMs = minIntervalMs;
    this.maxConcurrent = maxConcurrent;
    this.now = now;
    this.sleep = sleep;
    this.nextAt = new Map();
    /** host -> o host'ta sırada bekleyen son isteğin bitiş sözü (host başına sıralı yürütme). */
    this.tail = new Map();
    this.active = 0;
    this.waiters = [];
  }

  async #acquire() {
    if (this.active >= this.maxConcurrent) await new Promise(r => this.waiters.push(r));
    this.active++;
  }
  #release() {
    this.active--;
    this.waiters.shift()?.();
  }

  /** interval: bu host için özel aralık (yalnızca kullanıcının kendi sitesi için; bkz. crawler ownDomains). */
  async run(host, fn, interval = this.minIntervalMs) {
    const t = this.now();
    const slot = Math.max(t, this.nextAt.get(host) ?? 0);
    this.nextAt.set(host, slot + interval);
    const prev = this.tail.get(host);
    /** @type {(v?: any) => void} */
    let finish = () => {};
    const mine = new Promise(r => (finish = r));
    this.tail.set(host, mine);
    try {
      if (prev) await prev; // aynı host: önceki istek bitmeden başlamaz
      const t2 = this.now();
      if (slot > t2) await this.sleep(slot - t2);
      await this.#acquire();
      try {
        return await fn();
      } finally {
        this.#release();
      }
    } finally {
      finish();
      if (this.tail.get(host) === mine) this.tail.delete(host);
    }
  }
}
