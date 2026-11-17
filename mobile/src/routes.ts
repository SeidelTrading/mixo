import type { Href } from 'expo-router';
import type { Suggestion } from './api/shop';

/** Ekranlar yol dizgisini elle yazmaz; her bağlantı buradan gelir. */
export const href = {
  start: (): Href => '/',
  merkliste: (): Href => '/favoriten',
  warenkorb: (): Href => '/warenkorb',
  kategorien: (): Href => '/kategorien',
  suche: (q?: string): Href => ({ pathname: '/suche', params: q ? { q } : {} }),
  kategorie: (key: string, o?: { sub?: number | null; marke?: string | null; reduziert?: boolean }): Href => {
    const params: Record<string, string> = { key };
    if (o?.sub != null) params.sub = String(o.sub);
    if (o?.marke) params.marke = o.marke;
    if (o?.reduziert) params.reduziert = '1';
    return { pathname: '/kategorie/[key]', params };
  },
  produkt: (id: string): Href => ({ pathname: '/produkt/[id]', params: { id } }),
  kasse: (): Href => '/kasse',
  listen: (): Href => '/listen',
  liste: (id: string): Href => ({ pathname: '/liste/[id]', params: { id } }),
  ueber: (): Href => '/ueber',
  zuletzt: (): Href => '/zuletzt',
};

export function hrefForSuggestion(s: Suggestion): Href {
  if (s.kind === 'kategorie') return href.kategorie(s.key);
  if (s.kind === 'unterkategorie') return href.kategorie(s.key, { sub: s.sub });
  return href.kategorie(s.key, { sub: s.sub, marke: s.marke });
}

export type KategorieParams = { key: string; sub: number | null; marke: string | null; reduziert: boolean };

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

/** useLocalSearchParams çıktısını çözer; geçersiz sub → null, boş marke → null. */
export function parseKategorieParams(raw: Record<string, string | string[] | undefined>): KategorieParams {
  const subS = first(raw.sub).trim();
  const subN = /^\d+$/.test(subS) ? Number(subS) : NaN;
  const marke = first(raw.marke).trim();
  return {
    key: first(raw.key) || 'all',
    sub: Number.isInteger(subN) ? subN : null,
    marke: marke || null,
    reduziert: first(raw.reduziert) === '1',
  };
}
