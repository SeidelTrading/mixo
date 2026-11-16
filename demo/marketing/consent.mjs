import { EMAIL_RE } from './shared.mjs';

// Açık izin (opt-in), sepet anlık görüntüsü, sipariş sonrası kayıt.
// Ad alanı e-posta konusuna da girer: satır sonu/NUL gibi başlık enjeksiyonu karakterleri atılır.
const cleanName = n =>
  String(n || '')
    .replace(/[\r\n\0\u2028\u2029]+/g, ' ')
    .trim()
    .slice(0, 80);
export function makeConsent(c) {
  const { db, MAX_OPTINS, CONSENT_TEXT, save, P, uid } = c;
  // vitrin: açık izin kaydı + sepet anlık görüntüsü (yalnız izin verenler)
  function optIn(email, name, source) {
    email = String(email || '')
      .trim()
      .toLowerCase();
    if (!EMAIL_RE.test(email)) return false;
    if (!db.optins[email] && Object.keys(db.optins).length >= MAX_OPTINS) return false;
    // confirmed:false = çift onay (doğrulama e-postası) yapılmadı. Gerçek gönderim açılmadan önce yalnız confirmed:true kayıtlar alıcı olmalı.
    db.optins[email] ??= {
      t: Date.now(),
      name: cleanName(name),
      source,
      confirmed: false,
      text: CONSENT_TEXT,
    };
    save();
    return true;
  }
  // own: istek, bu e-postanın iznini veren tarayıcının imzalı çerezini taşıyor mu (sunucu doğrular). Yalnız o tarayıcı izni silebilir.
  function saveCart(body, own = false) {
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    if (!EMAIL_RE.test(email)) return { err: 'E-Mail ungültig.' };
    if (body.optin !== true) {
      if (!own) return { ok: true, removed: false };
      delete db.optins[email];
      delete db.carts[email];
      save();
      return { ok: true, removed: true };
    }
    const items = (Array.isArray(body.items) ? body.items : [])
      .slice(0, 30)
      .map(i => ({ id: String(i?.id || ''), qty: Math.floor(Number(i?.qty)) }))
      .filter(i => P.has(i.id) && i.qty >= 1 && i.qty <= 20);
    if (!items.length) return { err: 'Warenkorb leer.' };
    // Kayıtlı bir e-postanın sepetini/adını yalnız izni veren tarayıcı (own) değiştirebilir; başkası sessizce yok sayılır (kayıtlı olup olmadığı sızmaz).
    const known = !!(db.optins[email] || db.carts[email]);
    if (known && !own) return { ok: true, created: false };
    if (Object.keys(db.carts).length > 5000) return { err: 'voll' };
    optIn(email, body.name, 'cart');
    db.carts[email] = { t: Date.now(), name: cleanName(body.name), items };
    save();
    return { ok: true, created: !known };
  }
  const orderPlaced = email => {
    email = String(email).toLowerCase();
    if (db.carts[email]) {
      delete db.carts[email];
      save();
    }
  };
  // İşlem e-postası (ör. sipariş onayı): e-posta sağlayıcısı bağlı olmadığı için simüle posta kutusuna yazılır, gönderilmez.
  const simMail = ({ kind, name, to, subject, body }) => {
    db.sim.push({
      id: uid(),
      t: Date.now(),
      key: kind,
      rule: kind.split(':')[0],
      ruleName: name,
      to,
      subject,
      body,
      simulated: true,
    });
    if (db.sim.length > 1000) db.sim.splice(0, db.sim.length - 1000);
    save();
  };
  return { optIn, saveCart, orderPlaced, simMail };
}
