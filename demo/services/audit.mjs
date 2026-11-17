import { actorCtx, store } from '../lib/store.mjs';
import { changes } from './settings.mjs';
import crypto from 'node:crypto';

// Denetim izi: yasal ya da parasal etkisi olan yazmalar değişiklik günlüğüne düşer.
//
// Neden ayrı bir yardımcı var: `logChange` (services/settings.mjs) mağaza işlemleri içindir ve her çağrıda
// Instagram yenileme kancasını tetikler. İş modüllerinin yazmaları çoğu zaman `store.tx()` içinde olur;
// orada bir kancanın kendi yazmasını açması işlemi içeriden bozabilir. `audit` kanca tetiklemez, bu yüzden
// işlem içinden güvenle çağrılır. Günlük kaydı aynı yere (changes tablosu + bellekteki liste) gider, yani
// panelin değişiklik ekranında mağaza işlemleriyle birlikte görünür.
//
// Geri alma: varsayılan olarak YOKTUR. Bir iade ödemesi ya da gönderilmiş bir marka yetkisi "geri alınamaz";
// kayıt yalnız kimin ne zaman ne yaptığını söyler. Gerçekten tersine çevrilebilen bir işlem (havuz
// birleştirmesi gibi) `undo` verir ve karşılığı `services/actions.mjs` içinde bir işlev olmak ZORUNDADIR,
// yoksa paneldeki geri alma düğmesi o kaydı tanımaz (bkz. actions.undo).
// `id`: geri alma verisinin kendi kayıt kimliğini taşıması gerektiğinde önceden üretilip verilir
// (kayıt yazıldıktan sonra kimliği içine eklemek ikinci bir yazma demek olurdu; changes.id benzersizdir).
export const newChangeId = () => crypto.randomUUID().slice(0, 8);

export function audit(by, summary, undo = null, id = newChangeId()) {
  const user = actorCtx.getStore()?.username, // oturumdaki panel kullanıcısı; alan adı `username` (lib/auth.mjs)
    c = {
      id,
      t: Date.now(),
      by: String(by),
      ...(user ? { user } : {}),
      summary: String(summary),
      undo,
      undone: false,
    };
  changes.push(c);
  store.addChange(c);
  return c;
}
