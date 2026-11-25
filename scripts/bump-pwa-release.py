#!/usr/bin/env python3
"""Atualiza a coorte do PWA de forma consistente, após mudança de dados."""
import json,re,subprocess,sys
from datetime import datetime,timezone
from pathlib import Path
root=Path(__file__).resolve().parents[1]
manifest=root/"version.json"
data=json.loads(manifest.read_text(encoding="utf-8"))
old=data["build"]
new=sys.argv[1] if len(sys.argv)>1 else datetime.now(timezone.utc).strftime("%Y%m%d.%H%M%S")
if not re.fullmatch(r"\d{8}\.\d+",new) or old==new: raise ValueError("Release inválida")
paths=subprocess.check_output(["git","ls-files","-z"],cwd=root).decode().split("\0")
for relative in paths:
    if not relative or relative.startswith(("vendor/","supabase/","data/","scripts/",".github/")): continue
    p=root/relative
    if p.suffix not in {".js",".mjs",".html",".css",".py",".json"} or p.name in {"version.json","package-lock.json","package.json"}: continue
    source=p.read_text(encoding="utf-8")
    if old not in source: continue
    if relative=="sw.js":
        # Preserve explicitly owned historical caches; replace build references only.
        source=re.sub(r'(const (?:RELEASE_ID|CACHE_REVISION|BOOTSTRAP_BUILD|UPDATE_BUILD) = ")'+re.escape(old)+r'(")',lambda m:m[1]+new+m[2],source)
        owned=f'"volt-app-v4-atomic-{old}"'
        if owned not in source: source=source.replace("  CACHE_NAME,","  CACHE_NAME,\n  "+owned+",")
    else:
        source=source.replace(old,new)
    p.write_text(source,encoding="utf-8")
data.update(release=new,build=new,releasedAt=datetime.now(timezone.utc).isoformat(),message="Atualização de competências oficiais das bandeiras ANEEL.")
manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("Coorte PWA:",old,"->",new)
