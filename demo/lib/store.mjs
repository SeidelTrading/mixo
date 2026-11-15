import { AsyncLocalStorage } from 'node:async_hooks';
import { openStore } from '../db.mjs';
import { DATA_DIR } from './config.mjs';

/* ───────── kalıcı veri: SQLite (db.mjs). Bellekteki yapılar korunur; her değişiklik veritabanına yazılır. ───────── */
export const store = openStore(DATA_DIR);
{
  const im = store.importLegacy();
  if (im)
    console.log(
      'eski JSON dosyaları veritabanına aktarıldı (dosyalar .tasindi olarak duruyor):',
      JSON.stringify(im),
    );
}
export const actorCtx = new AsyncLocalStorage(); // istek kapsamındaki panel kullanıcısı (değişiklik günlüğüne kişi yazmak için)

export const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
