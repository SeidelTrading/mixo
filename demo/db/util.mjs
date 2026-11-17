export const DB_NAME = 'mixo.db';
// Sürüm 2 ile gelen tablolar: sürüm 1 yedeklerinde bulunmaz, bu yüzden doğrulamada eksikliği hata sayılmaz.
export const POOL_TABLES = ['pool', 'pool_ean', 'pool_src'];
export const TABLES = [
  'kv',
  'orders',
  'events',
  'changes',
  'sessions',
  'users',
  'logins',
  'jobs',
  ...POOL_TABLES,
];

export const parse = (s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};
export const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
