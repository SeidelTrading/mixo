#!/usr/bin/env python3
"""DOCKS kenar çubuğu grubunu eski Claude hesabından yeni hesaba kopyalar.

Kullanım (Claude masaüstü uygulaması TAMAMEN KAPALIYKEN):
    python3 docks-kenar-cubugu-tasi.py            # yalnız ne yapacağını gösterir
    python3 docks-kenar-cubugu-tasi.py --uygula   # yedek alır ve kopyalar

Ön koşul: yeni hesapla en az bir kez giriş yapıp Code sekmesini açmış ve
uygulamayı kapatmış olmalısın; yeni hesabın klasörü ancak o zaman oluşur.

Ne yapar:
- Eski hesabın DOCKS grubundaki oturumları ve onlardan açılan alt oturumları bulur.
- Oturum dosyalarını yeni hesabın klasörüne kopyalar (eskiler silinmez).
- DOCKS grubunu, sırasını ve atamaları yeni hesabın kenar çubuğu ayarlarına ekler.
- Değiştirmeden önce yapılandırma dosyasının ve oturum klasörünün yedeğini alır.
Konuşma geçmişi ~/.claude/projects altında zaten ortak; ona dokunmaz.
Bu, uygulamanın resmî bir özelliği değil; uygulamanın yerel dosyalarını düzenler.
"""
import json, shutil, sys, time
from pathlib import Path

ESKI = "dee90202-6b40-4af1-a9e7-2f72b2943cb4/eb0e99d4-7032-403b-ae1b-1dae182bbc1c"
GRUP = "cg-98565b2d-5be7-4f97-b905-3ef469d151f3"
KOK = Path.home() / ".config/Claude"
CFG = KOK / "claude_desktop_config.json"
OTURUMLAR = KOK / "claude-code-sessions"
uygula = "--uygula" in sys.argv

kapsamlar = [f"{a.name}/{o.name}" for a in OTURUMLAR.iterdir() if a.is_dir()
             for o in a.iterdir() if o.is_dir()]
yeniler = [k for k in kapsamlar if k != ESKI]
if len(yeniler) != 1:
    sys.exit(f"Yeni hesap klasörü tek olmalı, bulunan: {yeniler or 'yok'}. "
             "Yeni hesapla giriş yapıp Code sekmesini açtın mı?")
YENI = yeniler[0]
eski_dir, yeni_dir = OTURUMLAR / ESKI, OTURUMLAR / YENI

cfg = json.loads(CFG.read_text())
prefs = cfg["preferences"]["epitaxyPrefs"]
gs = prefs["dframe-group-scopes"][ESKI]

# Gruba atanmış oturumlar + onlardan açılan alt oturumlar (spawnedFrom zinciri)
secili = {k.split(":", 1)[1] for k, v in gs["assignments"].items() if v == GRUP}
oturum = {f.stem: json.loads(f.read_text()) for f in eski_dir.glob("local_*.json")}
degisti = True
while degisti:
    degisti = False
    for sid, d in oturum.items():
        ebeveyn = (d.get("spawnedFrom") or {}).get("sessionId")
        if sid not in secili and ebeveyn in secili:
            secili.add(sid); degisti = True
secili &= oturum.keys()

print(f"Eski hesap : {ESKI}\nYeni hesap : {YENI}\nTaşınacak oturum: {len(secili)}")
for sid in sorted(secili, key=lambda s: oturum[s].get("createdAt", 0)):
    print("  -", oturum[sid].get("title", sid))
if not uygula:
    sys.exit("\nDeneme çalıştırması. Uygulamak için: --uygula")

# Yedek
damga = time.strftime("%Y%m%d-%H%M%S")
shutil.copy2(CFG, CFG.with_name(f"claude_desktop_config.json.yedek-{damga}"))
shutil.copytree(OTURUMLAR, KOK / f"claude-code-sessions.yedek-{damga}")

# Oturum dosyaları
yeni_dir.mkdir(parents=True, exist_ok=True)
for sid in secili:
    hedef = yeni_dir / f"{sid}.json"
    if not hedef.exists():
        shutil.copy2(eski_dir / f"{sid}.json", hedef)

# Grup ve atamalar
ygs = prefs["dframe-group-scopes"].setdefault(YENI, {"groups": [], "assignments": {}, "order": {}})
ygs.setdefault("groups", []); ygs.setdefault("assignments", {}); ygs.setdefault("order", {})
if not any(g["id"] == GRUP for g in ygs["groups"]):
    ygs["groups"].insert(0, next(g for g in gs["groups"] if g["id"] == GRUP))
for k, v in gs["assignments"].items():
    if v == GRUP:
        ygs["assignments"][k] = v
ygs["order"][GRUP] = gs.get("order", {}).get(GRUP, [])

# Kenar çubuğu bölümü
eski_sec = prefs["dframe-code-sections"][ESKI]
yeni_sec = prefs["dframe-code-sections"].setdefault(YENI, json.loads(json.dumps(
    {k: v for k, v in eski_sec.items() if k != "sections"} | {"sections": [
        s for s in eski_sec["sections"] if s["kind"] != "manual"]})))
if not any(s["id"] == GRUP for s in yeni_sec["sections"]):
    bolum = next(s for s in eski_sec["sections"] if s["id"] == GRUP)
    yeni_sec["sections"].append(bolum)
    yeni_sec["sections"].sort(key=lambda s: (s["kind"] == "sessions", s.get("order", 0)))
    for i, s in enumerate(yeni_sec["sections"]):
        s["order"] = i

CFG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2))
print(f"\nTamam. Yedekler: {CFG.name}.yedek-{damga} ve claude-code-sessions.yedek-{damga}")
print("Uygulamayı açıp kenar çubuğunda DOCKS grubunu kontrol et.")
