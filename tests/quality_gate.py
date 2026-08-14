from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
RELEASE_ID = "20260813.7"
BOOTSTRAP_BUILD = "20260814.11"
failures = []


class HtmlInventory(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.refs = []
        self.module_entries = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"])
        for attr in ("src", "href"):
            value = values.get(attr, "")
            if value.startswith(("./", "../")) and not value.startswith("../"):
                self.refs.append(value.split("?", 1)[0].split("#", 1)[0])
        if tag == "script" and values.get("type") == "module" and values.get("src"):
            self.module_entries.append(values["src"])


def check(condition, message):
    if not condition:
        failures.append(message)


def parse_html(relative):
    parser = HtmlInventory()
    parser.feed((ROOT / relative).read_text(encoding="utf-8"))
    return parser


index_source = (ROOT / "index.html").read_text(encoding="utf-8")
root_html = parse_html("index.html")
check(len(root_html.ids) == len(set(root_html.ids)), "index.html contém IDs duplicados")
check(root_html.module_entries == [f"./bootstrap.js?v={BOOTSTRAP_BUILD}"], "a raiz deve possuir exatamente uma entrada module versionada: bootstrap.js")
for reference in root_html.refs:
    check((ROOT / reference[2:]).exists(), f"referência local inexistente em index.html: {reference}")
for asset in ["styles/tokens.css", "styles/glass.css", "styles/layout.css", "styles/components.css", "styles/pages.css"]:
    check(f'./{asset}?v={RELEASE_ID}' in index_source, f"asset mutável sem versão de release no HTML: {asset}")
check(f'./bootstrap.js?v={BOOTSTRAP_BUILD}' in index_source, "bootstrap mutável sem versão própria no HTML")

bootstrap_source = (ROOT / "bootstrap.js").read_text(encoding="utf-8")
check(f'const BOOTSTRAP_BUILD = "{BOOTSTRAP_BUILD}"' in bootstrap_source, "bootstrap e HTML devem compartilhar o mesmo build")
check(f'const ATOMIC_RELEASE = "{RELEASE_ID}"' in bootstrap_source, "bootstrap deve atualizar o grafo atômico correto")
check('cache: "reload"' in bootstrap_source, "bootstrap deve revalidar os módulos críticos antes de iniciar")

beta_html = parse_html("beta/index.html")
check(not beta_html.module_entries, "/beta não pode inicializar uma segunda aplicação")
check((ROOT / "beta/redirect.js").exists(), "/beta precisa manter apenas a compatibilidade de redirecionamento")

for javascript in [ROOT / "app.js", *sorted((ROOT / "src").glob("*.js"))]:
    source = javascript.read_text(encoding="utf-8")
    specifiers = re.findall(r'from\s+["\']([^"\']+)["\']', source)
    specifiers += re.findall(r'import\(["\']([^"\']+)["\']\)', source)
    for specifier in specifiers:
        if specifier.startswith("."):
            path, _, query = specifier.partition("?")
            target = (javascript.parent / path).resolve()
            check(target.exists(), f"import local quebrado em {javascript.relative_to(ROOT)}: {specifier}")
            check(query == f"v={RELEASE_ID}", f"import local sem versão atômica em {javascript.relative_to(ROOT)}: {specifier}")

active_sources = "\n".join((ROOT / item).read_text(encoding="utf-8") for item in [
    "index.html", "app.js", "sw.js", "styles/tokens.css", "styles/glass.css", "styles/layout.css",
    "styles/components.css", "styles/pages.css", "src/app-state.js", "src/cycles.js", "src/renderer.js", "src/volt-service.js"
])
for forbidden, reason in {
    "requestSubmit(": "persistência não pode simular submit",
    "MutationObserver": "lifecycle ativo não pode depender de MutationObserver",
    "setInterval(": "aplicação ativa não pode fazer polling global",
    "Tarifas e encargos": "card legado não pode existir no código ativo",
    "Organização ativa": "seletor legado não pode existir na Home",
    "organization-summary": "card de organização não pode existir em Usuários",
    "members-list": "renderer de membros por organização não pode controlar Usuários",
    "Preparando sua visão geral": "splash visual não faz parte do produto",
    'id="boot-screen"': "bootstrap não pode criar uma tela visual inventada"
}.items():
    check(forbidden not in active_sources, reason)

check("[hidden] { display: none !important; }" in (ROOT / "styles/tokens.css").read_text(encoding="utf-8"), "proteção estática [hidden] ausente")
app_source = (ROOT / "app.js").read_text(encoding="utf-8")
check('id="maintenance-screen"' not in index_source, "tela de manutenção não pode permanecer ativa")
check("initializeMaintenanceGate" not in app_source, "gate de manutenção não pode bloquear o bootstrap")
check("startApplication();" in app_source, "aplicação deve iniciar diretamente")
for accent in ("emerald", "azure", "violet", "amber", "coral", "teal"):
    check(f'data-accent-choice="{accent}"' in index_source, f"cor de aparência ausente: {accent}")
    check(f':root[data-accent="{accent}"]' in (ROOT / "styles/tokens.css").read_text(encoding="utf-8"), f"tokens da cor ausentes: {accent}")
check('localStorage.setItem(`volt-accent:${user.id}`' in app_source, "cor deve permanecer isolada por usuário")
check((ROOT / "index.html").read_text(encoding="utf-8").count('id="page-reports"') == 1, "Relatórios deve possuir uma única página")
for removed_item in ('data-nav="accounts"', 'data-page="accounts"', "Ciclos anteriores"):
    check(removed_item not in active_sources, f"item removido voltou ao código ativo: {removed_item}")

sw_source = (ROOT / "sw.js").read_text(encoding="utf-8")
check('request.mode === "navigate"' in sw_source, "Service Worker deve separar navegação de assets")
check("OWNED_CACHE_NAMES.has(name)" in sw_source, "Service Worker só pode limpar caches explicitamente próprios")
check(sw_source.count("response.clone()") == 2, "cada estratégia de rede deve clonar a resposta exatamente uma vez")
check(f'const RELEASE_ID = "{RELEASE_ID}"' in sw_source, "Service Worker e grafo de assets devem compartilhar a release")
check(f'const BOOTSTRAP_BUILD = "{BOOTSTRAP_BUILD}"' in sw_source, "Service Worker deve conhecer o build do bootstrap")
check("cacheApplicationShell().then(() => self.skipWaiting())" in sw_source, "Service Worker novo deve ativar somente após formar o cache completo")
check(f'searchParams.set("v", "{RELEASE_ID}")' in (ROOT / "src/supabase-loader.js").read_text(encoding="utf-8"), "runtime Supabase deve pertencer à mesma release")
service_source = (ROOT / "src/volt-service.js").read_text(encoding="utf-8")
check('client.rpc("beta_platform_users_snapshot")' in service_source, "Usuários deve consumir o diretório global da plataforma")
check('client.rpc("beta_admin_snapshot")' not in service_source, "Usuários não pode voltar ao snapshot restrito à organização")

checksum_file = ROOT / "vendor/SHA256SUMS"
if checksum_file.exists():
    for line in checksum_file.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        expected, relative = re.split(r"\s+", line.strip(), maxsplit=1)
        relative = relative.lstrip("*").replace("./", "")
        target = ROOT / "vendor" / relative
        check(target.exists(), f"vendor ausente: {relative}")
        if target.exists():
            payload = target.read_bytes()
            if target.suffix == ".js":
                payload = payload.replace(b"\r\n", b"\n")
            actual = hashlib.sha256(payload).hexdigest()
            check(actual == expected, f"checksum inválido: vendor/{relative}")

manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
check(manifest.get("start_url") == "./" and manifest.get("scope") == "./", "manifest deve controlar somente a aplicação oficial")

if failures:
    print("QUALITY GATE: FALHOU")
    for failure in failures:
        print(f"- {failure}")
    sys.exit(1)
print("QUALITY GATE: PASSOU")
