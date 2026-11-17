// Prototip kirlenmesine karşı iki küçük yardımcı (konsey 17.11.2026 bulgusu).
// Kullanıcıdan gelen metin bir nesnenin anahtarı olarak kullanıldığında `__proto__`, `constructor` ve
// `prototype` Object.prototype'a ulaşır: yazma süreç boyunca kalıcı olur ve "var mı" denetimleri
// sahte pozitif verir. İki savunma var ve ikisi birlikte kullanılır:
//   isSafeKey — uç katmanında kapı: böyle bir kimlik taşıyan istek daha servise girmeden reddedilir.
//   dict      — servis katmanında zemin: harita nesneleri prototipsiz kurulur, kapı delinse bile zarar vermez.
// lib/ içindedir çünkü hiçbir iş kuralı taşımaz ve services ile routes'un ikisi de kullanır.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** @param {unknown} v */
export const isSafeKey = v => typeof v === 'string' && v !== '' && !UNSAFE_KEYS.has(v);

/** @returns {Record<string, any>} */
export const dict = src =>
  Object.assign(Object.create(null), src && typeof src === 'object' && !Array.isArray(src) ? src : {});
