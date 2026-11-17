import { EMAIL_RE, DAY } from './shared.mjs';
import { sign, sigOk } from '../lib/auth.mjs';

// Açık izin (opt-in), çift onay (double opt-in), sepet anlık görüntüsü, sipariş sonrası kayıt.
// Çift onay zorunludur (GDPR / UWG): kayıt açıldığında adres yalnız "bekliyor" durumundadır,
// alıcı listesine ancak doğrulama bağlantısına tıklandıktan sonra girer. Bunu uygulayan tek yer
// consentOk(); hatırlatma alıcıları bu fonksiyondan geçer, listeyi doğrudan okumaz.
export const CONFIRM_DAYS = 7; // doğrulama bağlantısının ömrü
// Ad alanı e-posta konusuna da girer: satır sonu/NUL gibi başlık enjeksiyonu karakterleri atılır.
const cleanName = n =>
  String(n || '')
    .replace(/[\r\n\0\u2028\u2029]+/g, ' ')
    .trim()
    .slice(0, 80);
// Veri sahibi hakları (erişim/silme) ve izin geri çekme. makeConsent'ten ayrı tutulur (okunurluk).
function makeSubjectRights({ db, save, logConsent, simMail, lower, SITE, CONSENT_TEXT, MAX_CONSENT_LOG }) {
  /* ───────── Abmelden: tek tıkla izin geri çekme (H-05) ───────── */
  // Çerezden bağımsız: bağlantı adresin kendisine gittiği için imza kimlik kanıtıdır.
  // Belirteç adrese bağlıdır ve süresizdir (eski e-postadaki bağlantı da çalışmalı).
  const unsubToken = email => sign(`unsub:${lower(email)}`);
  const unsubscribeUrl = email =>
    `${SITE}/api/consent/unsubscribe?e=${encodeURIComponent(lower(email))}&token=${unsubToken(email)}`;
  // Dönüş: 'ok' | 'already' | 'bad'
  function unsubscribe(email, token, ip) {
    email = lower(email);
    if (!EMAIL_RE.test(email) || !sigOk(String(token || ''), `unsub:${email}`)) return 'bad';
    if (!db.optins[email]) return 'already';
    logConsent(email, 'revoke', { ip: ip || null, via: 'unsubscribe-link' });
    delete db.optins[email];
    delete db.carts[email];
    save();
    return 'ok';
  }

  /* ───────── Veri sahibi hakları: erişim (Art. 15) ve silme (Art. 17) (H-04) ───────── */
  // Kimlik doğrulaması: bağlantı yalnız adresin KENDİSİNE gönderilir ve imzalıdır (sipariş/rıza onayı
  // bağlantılarının aynı deseni). Rastgele biri başkasının verisini ne indirebilir ne silebilir.
  // Belirteç zaman damgasına bağlıdır; bağlantı CONFIRM_DAYS gün sonra geçersizdir.
  const subjectToken = (action, email, ts) => sign(`subj:${action}:${lower(email)}:${ts}`);
  const subjectUrl = (action, email, ts) =>
    `${SITE}/api/privacy/${action}?e=${encodeURIComponent(lower(email))}&ts=${ts}&token=${subjectToken(action, email, ts)}`;
  function subjectOk(action, email, ts, token) {
    email = lower(email);
    const n = Number(ts);
    if (!EMAIL_RE.test(email) || !Number.isFinite(n)) return false;
    if (Math.abs(Date.now() - n) > CONFIRM_DAYS * DAY) return false;
    return sigOk(String(token || ''), `subj:${action}:${email}:${n}`);
  }
  // Veri sahibi talebi: imzalı erişim/silme bağlantılarını adresin kendisine yollar.
  // Adresin kayıtlı olup olmadığı dışarı sızmaz; çağıran uç her durumda aynı yanıtı verir.
  function requestSubjectLinks(email) {
    email = lower(email);
    if (!EMAIL_RE.test(email)) return false;
    const ts = Date.now();
    simMail({
      kind: `privacy:${email}:${ts}`,
      name: 'Datenauskunft',
      to: email,
      subject: 'Ihre Daten: Auskunft oder Löschung',
      body: `Hallo,\n\nSie haben Auskunft über Ihre Daten oder deren Löschung angefordert.\n\nAuskunft (Art. 15 DSGVO):\n${subjectUrl('export', email, ts)}\n\nLöschung (Art. 17 DSGVO):\n${subjectUrl('erase', email, ts)}\n\nDie Links sind ${CONFIRM_DAYS} Tage gültig. Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail — ohne Klick passiert nichts.`,
    });
    return true;
  }
  // Rıza günlüğünde adres yerine geri döndürülemez anahtar (anahtarlı HMAC; ham e-posta kalmaz).
  const emailKey = email => sign(`subject:${lower(email)}`);
  // Bu adrese dair sakladığımız veri (erişim hakkı). Rıza günlüğü kanıt olarak birlikte döner.
  function exportSubject(email) {
    email = lower(email);
    if (!EMAIL_RE.test(email)) return null;
    const key = emailKey(email);
    return {
      email,
      generatedAt: Date.now(),
      optin: db.optins[email] ? { ...db.optins[email] } : null,
      cart: db.carts[email] ? { ...db.carts[email] } : null,
      consentLog: (db.consent || [])
        .filter(x => x.email === email || x.emailKey === key)
        .map(x => ({ ...x })),
      mails: (db.sim || [])
        .filter(x => x.to === email)
        .map(x => ({ t: x.t, rule: x.rule, subject: x.subject, body: x.body, simulated: true })),
    };
  }
  // Silme hakkı: izin kaydı, sepet ve simüle posta kutusundaki kişisel alanlar silinir.
  // Rıza günlüğü SİLİNMEZ (ispat yükü): ama oradaki ham e-posta geri döndürülemez anahtara çevrilir
  // ve silme işleminin kendisi ayrı bir kayıt olarak günlüğe yazılır (silme kanıtı).
  function eraseSubject(email, ip) {
    email = lower(email);
    if (!EMAIL_RE.test(email)) return null;
    const key = emailKey(email);
    const out = {
      optin: !!db.optins[email],
      cart: !!db.carts[email],
      mails: 0,
      consentEntries: 0,
    };
    delete db.optins[email];
    delete db.carts[email];
    db.sim ??= [];
    for (let i = db.sim.length - 1; i >= 0; i--)
      if (db.sim[i].to === email) {
        db.sim.splice(i, 1); // dizi yerinde değişir: başka modüllerin tuttuğu referans bozulmaz
        out.mails++;
      }
    db.consent ??= [];
    for (const x of db.consent)
      if (x.email === email) {
        out.consentEntries++;
        x.email = null; // ham e-posta kalmaz
        x.emailKey = key;
        x.erased = true;
      }
    // Silme kanıtı: kim değil, hangi anahtar ve ne zaman. Ham e-posta burada da yazılmaz.
    db.consent.push({
      t: Date.now(),
      email: null,
      emailKey: key,
      action: 'erase',
      text: CONSENT_TEXT,
      ip: ip || null,
    });
    if (db.consent.length > MAX_CONSENT_LOG) db.consent.splice(0, db.consent.length - MAX_CONSENT_LOG);
    save();
    return out;
  }

  return {
    unsubscribe,
    unsubscribeUrl,
    requestSubjectLinks,
    subjectOk,
    exportSubject,
    eraseSubject,
    emailKey,
  };
}

export function makeConsent(c) {
  const { db, MAX_OPTINS, MAX_CONSENT_LOG, CONSENT_TEXT, SITE, save, P, uid } = c;
  const lower = e =>
    String(e || '')
      .trim()
      .toLowerCase();
  // Rıza kanıtı: kim, ne zaman, hangi yoldan, hangi onay metni sürümüyle. Silinen izinler de kalır.
  const logConsent = (email, action, extra = {}) => {
    db.consent ??= [];
    db.consent.push({ t: Date.now(), email, action, text: CONSENT_TEXT, ...extra });
    if (db.consent.length > MAX_CONSENT_LOG) db.consent.splice(0, db.consent.length - MAX_CONSENT_LOG);
  };
  // Pazarlama gönderimi için TEK ölçüt. Kayıt var ama onaylanmadıysa alıcı değildir.
  const consentOk = email => !!db.optins[lower(email)]?.confirmed;
  const confirmToken = (email, t) => sign(`oi:${email}:${t}`);
  const confirmUrl = (email, t) =>
    `${SITE}/api/consent/confirm?e=${encodeURIComponent(email)}&token=${confirmToken(email, t)}`;
  // vitrin: açık izin kaydı + sepet anlık görüntüsü (yalnız izin verenler)
  function optIn(email, name, source, ip) {
    email = lower(email);
    if (!EMAIL_RE.test(email)) return false;
    if (!db.optins[email] && Object.keys(db.optins).length >= MAX_OPTINS) return false;
    // confirmed:false = çift onay yapılmadı; bu kayıt hiçbir gönderime alınmaz (bkz. consentOk).
    const yeni = !db.optins[email];
    db.optins[email] ??= {
      t: Date.now(),
      name: cleanName(name),
      source,
      confirmed: false,
      text: CONSENT_TEXT,
    };
    const rec = db.optins[email];
    if (yeni) {
      logConsent(email, 'optin', { source, ip: ip || null });
      sendConfirm(email, rec);
    }
    save();
    return true;
  }
  // Doğrulama e-postası (simülasyon: gerçek gönderim yok, simüle posta kutusuna yazılır).
  function sendConfirm(email, rec) {
    const url = confirmUrl(email, rec.t);
    simMail({
      kind: `consent:${email}:${rec.t}`,
      name: 'Bestätigung',
      to: email,
      subject: 'Bitte bestätigen Sie Ihre E-Mail-Adresse',
      body: `Hallo${rec.name ? ' ' + rec.name : ''},\n\nbitte bestätigen Sie Ihre E-Mail-Adresse, damit wir Ihnen Erinnerungen senden dürfen:\n${url}\n\nDer Link ist ${CONFIRM_DAYS} Tage gültig. Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.`,
    });
  }
  // Doğrulama bağlantısı tıklandığında. Dönüş: 'ok' | 'already' | 'expired' | 'bad'
  function confirmOptIn(email, token, ip) {
    email = lower(email);
    const rec = db.optins[email];
    if (!rec || !EMAIL_RE.test(email)) return 'bad';
    if (!sigOk(token, `oi:${email}:${rec.t}`)) return 'bad';
    if (rec.confirmed) return 'already';
    if (Date.now() - rec.t > CONFIRM_DAYS * DAY) return 'expired';
    rec.confirmed = true;
    rec.confirmedAt = Date.now();
    logConsent(email, 'confirm', { ip: ip || null });
    save();
    return 'ok';
  }
  // Doğrulama e-postasını yeniden gönder (bağlantı süresi dolduysa kayıt tazelenir).
  function resendConfirm(email) {
    email = lower(email);
    const rec = db.optins[email];
    if (!rec || rec.confirmed) return false;
    if (Date.now() - rec.t > CONFIRM_DAYS * DAY) rec.t = Date.now();
    sendConfirm(email, rec);
    save();
    return true;
  }
  // own: istek, bu e-postanın iznini veren tarayıcının imzalı çerezini taşıyor mu (sunucu doğrular). Yalnız o tarayıcı izni silebilir.
  function saveCart(body, own = false, ip) {
    const email = lower(body?.email);
    if (!EMAIL_RE.test(email)) return { err: 'E-Mail ungültig.' };
    if (body.optin !== true) {
      if (!own) return { ok: true, removed: false };
      if (db.optins[email]) logConsent(email, 'revoke', { ip: ip || null });
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
    optIn(email, body.name, 'cart', ip);
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
  const consentRecord = email => db.optins[lower(email)] || null;
  const consentLog = () => db.consent || [];

  const rights = makeSubjectRights({
    db,
    save,
    logConsent,
    simMail,
    lower,
    SITE,
    CONSENT_TEXT,
    MAX_CONSENT_LOG,
  });
  return {
    ...rights,
    optIn,
    saveCart,
    orderPlaced,
    simMail,
    consentOk,
    confirmOptIn,
    resendConfirm,
    logConsent,
    consentRecord,
    consentLog,
  };
}
