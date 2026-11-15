import fs from 'node:fs';
import path from 'node:path';
import { parse, isObj } from './util.mjs';

// Eski JSON dosyalarından bir kerelik içe aktarma.
export function makeLegacy({ q, tx, dataDir, doc, saveDoc, putOrder, addChange }) {
  /* eski JSON dosyalarından bir kerelik içe aktarma */
  function importLegacy() {
    if (doc('legacy_import', null)) return null;
    const f = n => path.join(dataDir, n),
      has = n => fs.existsSync(f(n)),
      names = [
        'settings.json',
        'marketing.json',
        'instagram.json',
        'orders.json',
        'changes.jsonl',
        'events.jsonl',
        'sessions.json',
      ].filter(has);
    if (!names.length) {
      saveDoc('legacy_import', { t: Date.now(), files: [] });
      return null;
    }
    const readJson = n => parse(fs.readFileSync(f(n), 'utf8'), undefined),
      lines = n =>
        fs
          .readFileSync(f(n), 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(l => parse(l, null))
          .filter(isObj),
      out = {};
    tx(() => {
      for (const k of ['settings', 'marketing', 'instagram'])
        if (has(k + '.json')) {
          const v = readJson(k + '.json');
          if (isObj(v)) {
            saveDoc(k, v);
            out[k] = 1;
          }
        }
      if (has('orders.json')) {
        const v = readJson('orders.json');
        out.orders = 0;
        if (Array.isArray(v))
          for (const o of v)
            if (isObj(o) && o.id && isObj(o.customer)) {
              putOrder(o);
              out.orders++;
            }
      }
      if (has('changes.jsonl')) {
        out.changes = 0;
        const seen = new Set();
        for (const c of lines('changes.jsonl'))
          if (c.id && !seen.has(c.id)) {
            seen.add(c.id);
            addChange({ ...c, t: Number(c.t) || Date.now(), summary: c.summary ?? '' });
            out.changes++;
          }
      }
      if (has('events.jsonl')) {
        const s = q('INSERT INTO events(t,data) VALUES(?,?)');
        out.events = 0;
        for (const e of lines('events.jsonl'))
          if (Number.isFinite(e.t)) {
            s.run(e.t, JSON.stringify(e));
            out.events++;
          }
      }
      saveDoc('legacy_import', { t: Date.now(), files: names, counts: out });
    });
    for (const n of names) fs.renameSync(f(n), f(n) + '.tasindi'); // eski dosyalar silinmez; bir sonraki açılışta yeniden aktarılmaz
    return out;
  }
  return { importLegacy };
}
