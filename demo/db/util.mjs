export const DB_NAME = 'mixo.db';
export const TABLES = ['kv', 'orders', 'events', 'changes', 'sessions', 'users', 'logins', 'jobs'];

export const parse = (s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};
export const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
