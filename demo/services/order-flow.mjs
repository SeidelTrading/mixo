import { hooks } from './settings.mjs';
import { saveOrder } from './orders.mjs';
import { P } from './catalog.mjs';
import { consume } from './dashboard.mjs';
import { labelFor } from './shipping.mjs';

// Sipariş akışının iş modüllerine bağlanması. Burası var çünkü dashboard ve shipping zaten orders'ı okuyor;
// orders'ın onları doğrudan import etmesi döngü yaratırdı. Bağ tek yönlü bir kanca ile kurulur (hooks.orderCompleted).
//
// Kanca YALNIZ geçerli siparişte çalışır: sipariş doğrulaması açıkken doğrulanmamış sipariş hedefi düşürmez ve
// kargo etiketi almaz (bkz. services/orders.mjs). Bu modülde atılan hiçbir hata siparişi düşürmemeli —
// sipariş zaten kaydedilmiştir, yan etkinin başarısızlığı müşteriye yansımaz, günlüğe yazılır.

// K-19: satılan her kalem, kategorisinin günlük hedef sayacından düşer. Hedefi tanımlı olmayan kategori sessizce atlanır.
function consumeTargets(o) {
  const perCat = new Map();
  for (const i of o.items || []) {
    const cat = P.get(i.id)?.cat;
    if (!cat) continue;
    perCat.set(cat, (perCat.get(cat) || 0) + (Number(i.qty) || 0));
  }
  for (const [cat, qty] of perCat) {
    if (qty < 1) continue;
    try {
      consume({ cat, qty });
    } catch (e) {
      // 'notfound' = o kategori için hedef tanımlı değil; beklenen durum, sessiz geçilir.
      if (e?.code !== 'notfound') console.error('hedef sayacı düşürülemedi:', cat, e?.message);
    }
  }
}

// K-16, K-17: siparişin posta koduna ve tutarına göre kargo firması seçilir ve siparişe yazılır.
function chooseCarrier(o) {
  try {
    const choice = labelFor(o);
    if (!choice) return;
    o.shippingChoice = choice;
    if (Number.isFinite(choice.extraCost) && choice.extraCost > 0) o.shippingExtra = choice.extraCost;
    saveOrder(o);
  } catch (e) {
    // Geçersiz posta kodu gibi durumlarda seçim yapılmaz; sipariş yine de geçerlidir, etiket elle basılır.
    console.error('kargo seçimi yapılamadı:', o.id, e?.message);
  }
}

hooks.orderCompleted = o => {
  if (!o || typeof o !== 'object') return;
  consumeTargets(o);
  chooseCarrier(o);
};
