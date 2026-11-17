/**
 * Host başına en az `minIntervalMs` aralık + küresel eşzamanlılık sınırı.
 * Slot rezervasyonu senkron yapıldığı için aynı host'a gelen istekler kesinlikle sıraya girer.
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
    if (slot > t) await this.sleep(slot - t);
    await this.#acquire();
    try {
      return await fn();
    } finally {
      this.#release();
    }
  }
}
