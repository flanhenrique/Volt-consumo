#!/usr/bin/env python3
"""Generate the immutable technical archive and SHA-512 for VOLT's INPI RPC filing.

The archive is built from the frozen release commit, not from the current working
branch, so preparation files added later cannot silently alter the protected object.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

PRODUCT = "VOLT Consumo"
RELEASE = "20260816.5"
TARGET_COMMIT = "5c99b3daf292e775405f6f24959525c3f69e21cd"
ALGORITHM = "SHA-512"

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "inpi" / "output"
ARCHIVE = OUTPUT / f"VOLT-{RELEASE}-source.zip"
HASH_FILE = OUTPUT / f"VOLT-{RELEASE}-source.sha512.txt"
MANIFEST = OUTPUT / f"VOLT-{RELEASE}-manifest.json"


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def sha512(path: Path) -> str:
    digest = hashlib.sha512()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    if not (ROOT / ".git").exists():
        raise SystemExit("Execute este script dentro de um clone Git completo do repositório VOLT.")

    # Fail if the frozen object does not exist locally.
    git("cat-file", "-e", f"{TARGET_COMMIT}^{{commit}}")
    resolved = git("rev-parse", TARGET_COMMIT)
    if resolved != TARGET_COMMIT:
        raise SystemExit(f"Commit inesperado: {resolved}")

    OUTPUT.mkdir(parents=True, exist_ok=True)

    # Remove only generated outputs so a second run is explicit and reproducible.
    for path in (ARCHIVE, HASH_FILE, MANIFEST):
        if path.exists():
            path.unlink()

    subprocess.run(
        [
            "git",
            "archive",
            "--format=zip",
            f"--prefix=VOLT-{RELEASE}/",
            f"--output={ARCHIVE}",
            TARGET_COMMIT,
        ],
        cwd=ROOT,
        check=True,
    )

    digest = sha512(ARCHIVE)
    HASH_FILE.write_text(f"{digest}  {ARCHIVE.name}\n", encoding="utf-8")

    manifest = {
        "product": PRODUCT,
        "release": RELEASE,
        "repository": "flanhenrique/Volt-consumo",
        "commit": TARGET_COMMIT,
        "commit_date": git("show", "-s", "--format=%cI", TARGET_COMMIT),
        "archive": ARCHIVE.name,
        "archive_size_bytes": ARCHIVE.stat().st_size,
        "hash_algorithm": ALGORITHM,
        "hash": digest,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "inpi_service_code": 730,
        "warning": "Preserve exatamente este ZIP. Qualquer alteração produz outro hash.",
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Arquivo técnico: {ARCHIVE}")
    print(f"Algoritmo: {ALGORITHM}")
    print(f"Hash: {digest}")
    print(f"Manifesto: {MANIFEST}")
    print("Guarde o ZIP intacto em pelo menos dois locais independentes.")


if __name__ == "__main__":
    main()
