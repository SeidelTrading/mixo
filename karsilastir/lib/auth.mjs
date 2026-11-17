import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { parseCookies } from './http.mjs';

const COOKIE = 'kb_admin';
const TTL_MS = 8 * 3600 * 1000;

/** Tek yönetici parolası (ortam değişkeni) -> scrypt ile bellekte hash'lenir; oturumlar bellekte tutulur. */
export function createAuth({ password, secureCookie = false, now = Date.now }) {
  const salt = randomBytes(16);
  const hash = password ? scryptSync(password, salt, 64) : null;
  const sessions = new Map();
  const fails = [];

  const enabled = () => !!hash;

  function verify(candidate) {
    if (!hash) return false;
    const t = now();
    while (fails.length && t - fails[0] > 15 * 60 * 1000) fails.shift();
    if (fails.length >= 10) return false; // kaba kuvvet freni (genel, IP tutulmaz)
    const ok = timingSafeEqual(scryptSync(String(candidate), salt, 64), hash);
    if (!ok) fails.push(t);
    return ok;
  }

  function login() {
    const token = randomBytes(32).toString('hex');
    sessions.set(token, now() + TTL_MS);
    const attrs = `Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${TTL_MS / 1000}${secureCookie ? '; Secure' : ''}`;
    return `${COOKIE}=${token}; ${attrs}`;
  }

  function isAuthed(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const exp = token && sessions.get(token);
    if (!exp) return false;
    if (exp < now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  function logout(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) sessions.delete(token);
    return `${COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0`;
  }

  /** CSRF: SameSite=Strict'e ek olarak Origin başlığı varsa Host ile eşleşmeli. */
  function sameOrigin(req) {
    const o = req.headers.origin;
    if (!o) return true;
    try {
      return new URL(o).host === req.headers.host;
    } catch {
      return false;
    }
  }

  return { enabled, verify, login, isAuthed, logout, sameOrigin };
}
