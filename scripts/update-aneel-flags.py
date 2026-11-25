#!/usr/bin/env python3
"""Atualiza competências publicadas pela ANEEL; nunca inventa valores ou reescreve histórico."""
import csv, io, json, re, sys, urllib.request
from datetime import date
from pathlib import Path
from decimal import Decimal
import unicodedata

URL = "https://dadosabertos.aneel.gov.br/dataset/7f43a020-6dc5-44b8-80b4-d97eaa94436c/resource/0591b8f6-fe54-437b-b72b-1aa2efd46e42/download/bandeira-tarifaria-acionamento.csv"
FILE = Path("packages/consumption-domain/browser/billing-engine.js")
MARKER = re.compile(r'(export const ANEEL_MONTHLY_FLAGS = Object\.freeze\()(\{.*?\})(\);)',re.S)
def normalized(value):
    return ''.join(c for c in unicodedata.normalize("NFD",value.lower()) if unicodedata.category(c)!="Mn")
def flag_name(value):
    n=normalized(value)
    if "verde" in n: return "green"
    if "amarela" in n: return "yellow"
    if "vermelha" in n and "1" in n: return "red1"
    if "vermelha" in n and "2" in n: return "red2"
    raise ValueError("Bandeira desconhecida: "+value)
def read_rows(text):
    dialect=csv.Sniffer().sniff(text[:4096], delimiters=";,")
    reader=csv.DictReader(io.StringIO(text),dialect=dialect)
    expected={"DatCompetencia","NomBandeiraAcionada","VlrAdicionalBandeira"}
    if not expected.issubset(reader.fieldnames or []): raise ValueError("Schema ANEEL alterado")
    rows={}
    today=date.today()
    next_month=f"{today.year+(today.month==12):04d}-{today.month%12+1:02d}"
    for row in reader:
        raw=row["DatCompetencia"].strip()
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}",raw): raise ValueError("Competência inválida: "+raw)
        month=date.fromisoformat(raw).strftime("%Y-%m")
        if month < "2026-01" or month > next_month: continue
        flag=flag_name(row["NomBandeiraAcionada"])
        value=Decimal(row["VlrAdicionalBandeira"].strip().replace(",","."))
        if not value.is_finite() or value<0 or (flag=="green")!=(value==0): raise ValueError("Adicional inválido")
        if month in rows and rows[month]!=(flag,value): raise ValueError("Competência duplicada divergente")
        rows[month]=(flag,value)
    return rows
def main():
    source=FILE.read_text(encoding="utf-8")
    match=MARKER.search(source)
    if not match: raise ValueError("Catálogo não encontrado")
    old=json.loads(match.group(2))
    if len(sys.argv)>1: raw=Path(sys.argv[1]).read_bytes()
    else:
        request=urllib.request.Request(URL,headers={"User-Agent":"Volt-Consumo ANEEL updater"})
        with urllib.request.urlopen(request,timeout=60) as res: raw=res.read(10_000_001)
    if len(raw)>10_000_000: raise ValueError("CSV grande demais")
    try: text=raw.decode("utf-8-sig")
    except UnicodeDecodeError: text=raw.decode("cp1252")
    rows=read_rows(text)
    # Detecta a unidade monetária usando competências oficiais já confirmadas.
    factors={value/Decimal(str(old[month][1])) for month,(flag,value) in rows.items() if month in old and flag==old[month][0] and old[month][1]>0}
    if len(factors)!=1 or next(iter(factors)) not in {Decimal(1),Decimal(100),Decimal(1000)}: raise ValueError("Unidade do adicional não confirmada")
    factor=next(iter(factors))
    merged=dict(old)
    for month,(flag,value) in sorted(rows.items()):
        rate=value/factor
        if rate>1: raise ValueError("Adicional fora da faixa esperada")
        entry=[flag,float(rate)]
        if month in old and old[month]!=entry: raise ValueError("Histórico divergente: "+month)
        merged[month]=entry
    if merged==old: print("Nenhuma nova competência publicada"); return
    months=sorted(merged)
    for a,b in zip(months,months[1:]):
        y,m=map(int,a.split("-"))
        if b!=f"{y+(m==12):04d}-{m%12+1:02d}": raise ValueError("Lacuna no catálogo")
    FILE.write_text(source[:match.start(2)]+json.dumps(merged,indent=2,ensure_ascii=False)+source[match.end(2):],encoding="utf-8")
    print("Competências novas:",sorted(set(merged)-set(old)))
if __name__=="__main__": main()
