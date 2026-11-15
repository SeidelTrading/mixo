#!/usr/bin/env python3
"""Mixo grafiğini yeniler. Kullanım: python3 graphify-out/refresh.py  (Mixo klasöründen)
Kaynakları geçici klasöre kopyalar (data/img/_verify hariç), AST'yi yeniden çıkarır,
semantic.json (belgelerden LLM çıkarımı, elle yenilenir) ile birleştirip graph.json/graph.html/GRAPH_REPORT.md yazar."""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'graphify-out'
FILES = ['demo/server.mjs','demo/app.js','demo/index.html','demo/instagram.mjs','demo/marketing.mjs','demo/Dockerfile','demo/package.json','demo/admin/index.html','docs/satis-ve-analiz-mimarisi.md']
FILES += sorted(p.name for p in ROOT.glob('_*.py'))
py = Path(subprocess.check_output(['bash','-c','head -1 $(which graphify)|tr -d "#!"']).decode().strip())
tmp = Path(tempfile.mkdtemp())
for f in FILES:
    s = ROOT / f
    if s.exists(): (tmp/f).parent.mkdir(parents=True, exist_ok=True); shutil.copy(s, tmp/f)
code = f'''
import json
from pathlib import Path
from graphify.detect import detect
from graphify.extract import extract
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json
d = detect(Path("."))
ast = extract([Path(f) for f in d["files"]["code"]], cache_root=Path("."))
sem = json.loads(Path(r"{OUT/'semantic.json'}").read_text())
seen = {{n["id"] for n in ast["nodes"]}}; nodes = list(ast["nodes"])
for n in sem["nodes"]:
    if n["id"] not in seen: nodes.append(n); seen.add(n["id"])
ext = {{"nodes": nodes, "edges": ast["edges"]+sem["edges"], "hyperedges": sem.get("hyperedges", [])}}
G = build_from_json(ext, root=".", directed=False)
com = cluster(G); coh = score_all(G, com)
labels = {{c: str(G.nodes[max(v, key=G.degree)].get("label"))[:40]+" grubu" for c, v in com.items()}}
Path("graphify-out").mkdir(exist_ok=True)
to_json(G, com, "graphify-out/graph.json")
q = suggest_questions(G, com, labels)
Path("graphify-out/GRAPH_REPORT.md").write_text(generate(G, com, coh, labels, god_nodes(G), surprising_connections(G, com), d, {{"input": 0, "output": 0}}, ".", suggested_questions=q))
print(G.number_of_nodes(), "dugum", G.number_of_edges(), "kenar")
'''
subprocess.check_call([str(py), '-c', code], cwd=tmp)
subprocess.call(['graphify','export','html'], cwd=tmp)
for n in ('graph.json','GRAPH_REPORT.md','graph.html'):
    if (tmp/'graphify-out'/n).exists(): shutil.copy(tmp/'graphify-out'/n, OUT/n)
shutil.rmtree(tmp)
print('tamam:', OUT)
