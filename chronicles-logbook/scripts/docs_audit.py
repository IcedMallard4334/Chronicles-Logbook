"""Compare the running app with the documentation, and list what the docs have missed.

Run it from the backend folder with the backend's own Python, so the app can be imported:

    cd chronicles-logbook/backend
    ./venv/Scripts/python.exe ../scripts/docs_audit.py          # Windows
    ./venv/bin/python ../scripts/docs_audit.py                   # macOS / Linux

It reports four things, each a place the documentation tends to fall behind the code:

  - routes whose HTTP method and path are not mentioned together on any docs page;
  - database tables that the database page does not name;
  - migration files no page mentions;
  - settings read in app/config.py that no page mentions.

With --strict it exits 1 when anything is found, so it can be made a CI step. It reads files and imports
the app; it never writes, and it uses a throwaway SQLite URL so no real database is touched.
"""

import io
import os
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
DOCS = BACKEND.parent.parent / "docs"

# The app reads its database URL at import time; this keeps the import away from a real database.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./docs_audit.db")
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SKIPPED_ROUTES = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}


def read_docs() -> tuple[str, str]:
    """All the documentation as one string, and the database page on its own."""
    pages = [path.read_text(encoding="utf-8") for path in DOCS.rglob("*.md")]
    database = (DOCS / "architecture" / "database.md").read_text(encoding="utf-8")
    return "\n".join(pages), database


def undocumented_routes(docs: str) -> list[tuple[str, str]]:
    from main import app

    lines = docs.splitlines()
    missing = []
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if not path or not methods or path in SKIPPED_ROUTES:
            continue
        prefix = path.split("{")[0].rstrip("/") or "/"
        for method in sorted(methods - {"HEAD", "OPTIONS"}):
            if not any(prefix in line and method in line for line in lines):
                missing.append((method, path))
    return missing


def main() -> int:
    docs, database = read_docs()
    findings: list[tuple[str, list]] = []

    findings.append(("routes with no documented method and path", undocumented_routes(docs)))

    models = (BACKEND / "app" / "models.py").read_text(encoding="utf-8")
    tables = re.findall(r'__tablename__ = "([a-z_]+)"', models)
    findings.append(("tables missing from architecture/database.md", [t for t in tables if t not in database]))

    migrations = sorted(p.name for p in (BACKEND / "migrations").glob("*.sql"))
    findings.append(
        (
            "migration files no page mentions",
            [m for m in migrations if m not in docs and f"{m[:3]}_" not in docs],
        )
    )

    config = (BACKEND / "app" / "config.py").read_text(encoding="utf-8")
    settings = set(re.findall(r'["\']([A-Z][A-Z0-9_]{3,})["\']', config))
    findings.append(("settings in app/config.py no page mentions", sorted(s for s in settings if s not in docs)))

    total = 0
    for title, items in findings:
        total += len(items)
        print(f"{title}: {len(items)}")
        for item in items:
            print(f"  - {item}")

    print("\nDocumentation matches the code." if total == 0 else f"\n{total} gap(s) found.")
    return 1 if total and "--strict" in sys.argv else 0


if __name__ == "__main__":
    code = main()
    leftover = BACKEND / "docs_audit.db"
    if leftover.exists():
        leftover.unlink()
    sys.exit(code)
