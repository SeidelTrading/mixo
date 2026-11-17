import crypto from 'node:crypto';
import { store } from '../lib/store.mjs';
import { norm } from './catalog.mjs';

// Satış yasağı kuralları (HTTP bilmez): şirket × marka × pazar yeri × kategori bazında.
// Boş alan "hepsi" demektir. Kural mevzuat kaynaklı olabildiği için gerekçe (reason) zorunludur.
// Kurallar `rules` belgesinde tutulur: { rules: [...] }.
const MARKET_RE = /^[a-z0-9._-]{1,40}$/i;
const FIELDS = ['company', 'vendor', 'market', 'category'];

export class RulesError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new RulesError(code, msg);
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Karşılaştırma anahtarı: aksan ve büyük/küçük harf yok sayılır.
const key = s => norm(str(s, 200)).replace(/\s+/g, ' ');

const load = () => {
  const d = store.doc('rules', { rules: [] });
  return Array.isArray(d?.rules) ? d.rules : [];
};
const save = rules => store.saveDoc('rules', { rules });

function clean(input, base = {}) {
  const o = { ...base, ...input };
  const r = {
    id: base.id,
    company: str(o.company, 120),
    vendor: str(o.vendor, 120),
    market: str(o.market, 40).toLowerCase(),
    category: str(o.category, 120),
    action: 'deny',
    reason: str(o.reason, 500),
    created: base.created,
    enabled: o.enabled === undefined ? true : o.enabled !== false,
  };
  if (o.action !== undefined && o.action !== 'deny') fail('invalid', "Yalnız 'deny' eylemi desteklenir");
  if (r.market && !MARKET_RE.test(r.market)) fail('invalid', 'Geçersiz pazar yeri');
  if (!r.reason) fail('invalid', 'Gerekçe (reason) zorunlu');
  if (!FIELDS.some(f => r[f])) fail('invalid', 'En az biri dolu olmalı: company, vendor, market, category');
  return r;
}

export function listRules() {
  return load();
}

export function addRule(input) {
  const rule = clean(input ?? {}, { id: crypto.randomUUID().slice(0, 8), created: Date.now() });
  save([...load(), rule]);
  return rule;
}

export function updateRule(id, patch) {
  const rules = load();
  const i = rules.findIndex(r => r.id === id);
  if (i < 0) fail('notfound', 'Kural yok');
  const next = clean(patch ?? {}, rules[i]);
  rules[i] = next;
  save(rules);
  return next;
}

export function removeRule(id) {
  const rules = load();
  const i = rules.findIndex(r => r.id === id);
  if (i < 0) fail('notfound', 'Kural yok');
  const [gone] = rules.splice(i, 1);
  save(rules);
  return gone;
}

const matches = (ruleVal, v) => !ruleVal || key(ruleVal) === key(v);
// Özgüllük: dolu alan sayısı; eşitlikte önce eklenen kural kazanır.
const specificity = r => FIELDS.filter(f => r[f]).length;

const describe = r => {
  const parts = [
    r.company && `${r.company} şirketi`,
    r.vendor && `${r.vendor} markası`,
    r.category && `${r.category} kategorisi`,
    r.market && `${r.market} pazar yeri`,
  ].filter(Boolean);
  return `Satış yasağı (${parts.join(', ')}): ${r.reason}`;
};

// SÖZLEŞME: evaluate({ vendor, market, poolId, shopId, company, category }) → { allowed, reason? }
// poolId ve shopId şimdilik eşleştirmede kullanılmaz (çağıranlarla imza uyumu için kabul edilir).
export function evaluate(q = {}) {
  const hit = load()
    .filter(
      r =>
        r.enabled !== false &&
        r.action === 'deny' &&
        matches(r.company, q.company) &&
        matches(r.vendor, q.vendor) &&
        matches(r.market, q.market) &&
        matches(r.category, q.category),
    )
    .reduce((best, r) => (!best || specificity(r) > specificity(best) ? r : best), null);
  return hit ? { allowed: false, reason: describe(hit) } : { allowed: true };
}

// Toplu yüklemeden önce: her marka için bu şirket + pazar yerinde izin durumu.
export function preview(arg) {
  const { company, market, vendors } = arg ?? {};
  const list = Array.isArray(vendors) ? vendors : [];
  return [...new Set(list.map(v => str(v, 120)))].map(vendor => {
    const r = evaluate({ company, market, vendor });
    return r.allowed ? { vendor, allowed: true } : { vendor, allowed: false, reason: r.reason };
  });
}
