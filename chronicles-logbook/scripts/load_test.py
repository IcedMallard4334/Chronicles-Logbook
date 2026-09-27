"""
Load, latency & robustness tester for the Chronicles Logbook API.
Covers US-3.18 (load/stress), US-3.16 (latency evidence) and US-3.15 (malformed input -> 400, never 500).

Hits the API directly over HTTP (never through the UI), as the Sprint 3 guidance requires.

Usage
-----
    pip install requests
    export API_BASE_URL="https://chronicles-drivenbydesign-api-gub5h0e8aee0gcb0.uaenorth-01.azurewebsites.net"

    # Login - easiest: the chronicles_refresh cookie from the browser (F12 > Application > Cookies).
    # The script exchanges it at POST /auth/refresh for a fresh access token itself.
    export CHRONICLES_REFRESH="<value of the chronicles_refresh cookie>"
    # ...or, if you have them: API_TOKEN="<bearer access token>" / API_COOKIE="name=value"

    # Optional: PROJECT_ID="<id>". If unset, the script finds or creates a project called
    # "Load test (safe to delete)" and uses that for {project_id} in paths.

    # 1,000 requests, 50 at a time, against every endpoint in the config
    python chronicles-logbook/scripts/load_test.py load --requests 1000 --concurrency 50

    # Latency check only (sequential, no load) - is it ~200ms, never >500ms?
    python chronicles-logbook/scripts/load_test.py latency --requests 50

    # Send malformed payloads and flag any endpoint that answers 5xx instead of 400
    python chronicles-logbook/scripts/load_test.py robustness --rounds 20

Endpoints live in load_test_endpoints.json next to this file - edit that to match the real API.
Results are written to <repo root>/docs/evidence/<mode>-<timestamp>.{csv,md} so they can be kept as evidence.
"""

import argparse
import csv
import json
import os
import random
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

import requests

# This file lives at chronicles/chronicles-logbook/scripts/, so parents[2] is the repo root (chronicles/),
# where the MkDocs docs/ folder is.
ROOT = Path(__file__).resolve().parents[2]
ENDPOINTS_FILE = Path(__file__).with_name("load_test_endpoints.json")
OUT_DIR = ROOT / "docs" / "evidence"

LATENCY_TARGET_MS = 200
LATENCY_CEILING_MS = 500

# Payloads that should all be rejected with 4xx by a well-behaved endpoint.
MALFORMED_BODIES = [
    None,                                   # no body at all
    "this is not json",                     # not JSON
    "{\"unterminated\": ",                  # broken JSON
    [],                                     # wrong top-level type
    {},                                     # missing required fields
    {"title": None},                        # null where a value is required
    {"title": 12345, "fields": "not-a-dict"},  # wrong types
    {"title": "x" * 100_000},               # oversized field
    {"unexpected_field": True, "__proto__": {"admin": True}},
]


def load_endpoints():
    with open(ENDPOINTS_FILE, encoding="utf-8") as f:
        return json.load(f)["endpoints"]


# The API rejects cookie-authenticated requests from unknown origins ("Untrusted session request origin"),
# so identify as the deployed frontend, the same way a browser would.
FRONTEND_ORIGIN = os.environ.get(
    "FRONTEND_ORIGIN", "https://chronicles-drivenbydesign-app-hfeehwdce7dfd9fr.uaenorth-01.azurewebsites.net")


def headers():
    h = {"Content-Type": "application/json", "Origin": FRONTEND_ORIGIN, "Referer": FRONTEND_ORIGIN + "/"}
    token = os.environ.get("API_TOKEN")
    if token:
        h["Authorization"] = f"Bearer {token}"
    cookie = os.environ.get("API_COOKIE")  # use this instead if the API authenticates via cookies
    if cookie:
        h["Cookie"] = cookie
    return h


def call(session, base, ep, body=..., raw=False):
    """Make one request; return a result row. Never raises."""
    path = ep["path"].replace("{project_id}", os.environ.get("PROJECT_ID", "1"))
    url = base.rstrip("/") + path
    kwargs = {"headers": headers(), "timeout": (5, 30)}  # (connect, read) seconds
    payload = ep.get("body") if body is ... else body
    if payload is not None:
        if raw or isinstance(payload, str):
            kwargs["data"] = payload if isinstance(payload, str) else json.dumps(payload)
        else:
            kwargs["json"] = payload
    start = time.perf_counter()
    try:
        r = session.request(ep["method"], url, **kwargs)
        status, err = r.status_code, ""
    except requests.RequestException as e:
        status, err = 0, type(e).__name__
    ms = (time.perf_counter() - start) * 1000
    return {"method": ep["method"], "path": ep["path"], "status": status,
            "ms": round(ms, 1), "error": err}


def pct(values, p):
    if not values:
        return 0.0
    values = sorted(values)
    k = (len(values) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (k - lo)


def summarise(rows):
    by_ep = {}
    for r in rows:
        by_ep.setdefault(f'{r["method"]} {r["path"]}', []).append(r)
    out = []
    for key, rs in by_ep.items():
        ok = [r["ms"] for r in rs if 200 <= r["status"] < 400]
        failures = [r for r in rs if r["status"] == 0 or r["status"] >= 500]
        out.append({
            "endpoint": key,
            "n": len(rs),
            "p50": pct(ok, 50), "p95": pct(ok, 95), "p99": pct(ok, 99),
            "max": max(ok) if ok else 0.0,
            "error_rate": len(failures) / len(rs) * 100,
            "statuses": dict(sorted({str(r["status"]): sum(1 for x in rs if x["status"] == r["status"])
                                     for r in rs}.items())),
        })
    return out


def write_evidence(mode, rows, summary, meta, extra_md=""):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    csv_path = OUT_DIR / f"{mode}-{stamp}.csv"
    md_path = OUT_DIR / f"{mode}-{stamp}.md"

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    lines = [f"# {mode.title()} test - {datetime.now():%Y-%m-%d %H:%M}", ""]
    lines += [f"- **{k}:** {v}" for k, v in meta.items()]
    lines += ["", "| Endpoint | Requests | p50 ms | p95 ms | p99 ms | Max ms | 5xx/timeout % | Status codes |",
              "|---|---|---|---|---|---|---|---|"]
    for s in summary:
        flag = " (over)" if s["p95"] > LATENCY_CEILING_MS else ""
        lines.append(f'| `{s["endpoint"]}` | {s["n"]} | {s["p50"]:.0f} | {s["p95"]:.0f}{flag} | '
                     f'{s["p99"]:.0f} | {s["max"]:.0f} | {s["error_rate"]:.1f} | {s["statuses"]} |')
    lines += ["", f"Latency target ~{LATENCY_TARGET_MS} ms, ceiling {LATENCY_CEILING_MS} ms ('(over)' = p95 above ceiling).",
              "", extra_md, "", f"Raw per-request data: `{csv_path.name}`"]
    md_path.write_text("\n".join(lines), encoding="utf-8")
    return md_path


def run_load(base, endpoints, n, concurrency):
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=concurrency, pool_maxsize=concurrency)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    jobs = [random.choice(endpoints) for _ in range(n)]
    rows = []
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(call, session, base, ep) for ep in jobs]
        for i, fut in enumerate(as_completed(futures), 1):
            rows.append(fut.result())
            if i % max(1, n // 10) == 0:
                print(f"  {i}/{n} done")
    wall = time.perf_counter() - start

    # After the burst: is the API still alive? ("should never just break")
    time.sleep(2)
    health = call(requests.Session(), base, endpoints[0])
    meta = {"Base URL": base, "Total requests": n, "Concurrency": concurrency,
            "Wall time": f"{wall:.1f}s", "Throughput": f"{n / wall:.1f} req/s",
            "Overall 5xx/timeout rate": f'{sum(1 for r in rows if r["status"] in (0,) or r["status"] >= 500) / n * 100:.2f}%',
            "Healthy after burst": "yes" if 200 <= health["status"] < 400 else f'NO (status {health["status"]})'}
    return rows, meta


def run_latency(base, endpoints, n):
    session = requests.Session()
    call(session, base, endpoints[0])  # warm-up: measure cold start separately
    cold = call(requests.Session(), base, endpoints[0])
    rows = []
    for ep in endpoints:
        print(f"  {ep['method']} {ep['path']}")
        rows += [call(session, base, ep) for _ in range(n)]
    ok = [r["ms"] for r in rows if 200 <= r["status"] < 400]
    meta = {"Base URL": base, "Requests per endpoint": n,
            "First request on a fresh connection": f'{cold["ms"]:.0f} ms',
            "Overall median": f"{statistics.median(ok):.0f} ms" if ok else "n/a",
            "Requests over 500 ms": f"{sum(1 for x in ok if x > LATENCY_CEILING_MS)} / {len(ok)}"}
    return rows, meta


# Field-level bad values. Each is applied to one real field of an otherwise valid body, so the request
# only fails if the API actually validates that field. (label, value)
FIELD_BAD_VALUES = [
    ("oversized (100,000 chars)", "x" * 100_000),
    ("wrong type (list)", [1, 2]),
    ("negative number", -1),
]


def field_payloads(ep):
    """Valid body with one field broken at a time, for fields listed in the endpoint's "fuzz" key."""
    base_body = ep.get("body") or {}
    for field in ep.get("fuzz", []):
        for label, value in FIELD_BAD_VALUES:
            yield f"{field}: {label}", {**base_body, field: value}


def run_robustness(base, endpoints, rounds):
    session = requests.Session()
    targets = [ep for ep in endpoints if ep["method"] in ("POST", "PUT", "PATCH")]
    rows = []
    for i in range(rounds):
        print(f"  round {i + 1}/{rounds}")
        for ep in targets:
            for body in MALFORMED_BODIES:
                r = call(session, base, ep, body=body, raw=isinstance(body, str))
                r["payload"] = (json.dumps(body) if not isinstance(body, str) else body)[:60]
                r["kind"] = "generic"
                rows.append(r)
            for label, body in field_payloads(ep):
                r = call(session, base, ep, body=body)
                r["payload"] = label
                r["kind"] = "field"
                rows.append(r)
    bad = [r for r in rows if r["status"] == 0 or r["status"] >= 500]
    accepted_field = [r for r in rows if r["kind"] == "field" and 200 <= r["status"] < 300]
    accepted_generic = [r for r in rows if r["kind"] == "generic" and 200 <= r["status"] < 300]
    codes = sorted({r["status"] for r in rows if 400 <= r["status"] < 500})
    ok_after = call(session, base, endpoints[0])
    meta = {"Base URL": base, "Rounds": rounds, "Malformed requests sent": len(rows),
            "Answered with 5xx / timed out": len(bad),
            "Invalid field values accepted (2xx)": len(accepted_field),
            "Rejection status codes seen": ", ".join(map(str, codes)) or "none",
            "Healthy afterwards": "yes" if 200 <= ok_after["status"] < 400 else f'NO (status {ok_after["status"]})'}

    def listing(rs):
        seen = sorted({(r["method"], r["path"], r["payload"], r["status"]) for r in rs})
        return "\n".join(f"- `{m} {p}` -> {s} for `{pl}`" for m, p, pl, s in seen)

    sections = []
    if bad:
        sections.append("## Endpoints returning 5xx for bad input (should be 4xx)\n\n" + listing(bad))
    if accepted_field:
        sections.append("## Invalid field values that were accepted (should be rejected)\n\n" + listing(accepted_field))
    if accepted_generic:
        sections.append("## Generic junk bodies that got 2xx (check whether that's intended)\n\n"
                        "Usually a body with only unknown fields: the API ignores them and does a no-op update.\n\n"
                        + listing(accepted_generic))
    return rows, meta, "\n\n".join(sections)


TEST_PROJECT_NAME = "Load test (safe to delete)"


# The API rotates the refresh cookie on every use, so the value pasted from the browser only works once.
# The new value is saved here (home folder, outside the repo so it can never be committed) and reused next run.
SESSION_FILE = Path.home() / ".chronicles_load_test_session"


def login(base):
    """Log in with the saved session if there is one, otherwise with $CHRONICLES_REFRESH."""
    candidates = []
    try:
        saved = SESSION_FILE.read_text(encoding="utf-8").strip()
        if saved:
            candidates.append(("saved session", saved))
    except OSError:
        pass
    if os.environ.get("CHRONICLES_REFRESH"):
        candidates.append(("CHRONICLES_REFRESH", os.environ["CHRONICLES_REFRESH"]))
    if not candidates:
        return
    for i, (label, value) in enumerate(candidates):
        try:
            login_with_refresh_cookie(base, value)
            print(f"  logged in using {label}")
            return
        except SystemExit as e:
            if i == len(candidates) - 1:
                raise
            print(f"  {label} no longer valid, trying the next option")


def login_with_refresh_cookie(base, refresh):
    """Swap the browser's chronicles_refresh cookie for an access token / session cookies."""
    s = requests.Session()
    if "PASTE" in refresh.upper() or len(refresh.strip()) < 20:
        raise SystemExit("CHRONICLES_REFRESH still holds the placeholder text - paste the real chronicles_refresh "
                         "cookie value between the quotes.")
    h = {k: v for k, v in headers().items() if k != "Cookie"}
    h["Cookie"] = f"chronicles_refresh={refresh.strip()}"
    r = s.post(base.rstrip("/") + "/auth/refresh", headers=h, timeout=(5, 30))
    if r.status_code >= 400:
        hint = ("The API didn't accept the Origin header. Check FRONTEND_ORIGIN matches the app's address "
                "exactly (no trailing slash)." if "origin" in r.text.lower() else
                "The refresh cookie is probably expired or was already used - log in to the app again "
                "and copy a fresh chronicles_refresh value.")
        raise SystemExit(f"POST /auth/refresh returned {r.status_code}: {r.text[:200]}\n{hint}")
    try:
        body = r.json()
    except ValueError:
        body = {}
    token = None
    if isinstance(body, dict):
        for key in ("access_token", "accessToken", "token", "jwt"):
            if body.get(key):
                token = body[key]
                break
    if token:
        os.environ["API_TOKEN"] = token
    # Keep any cookies the API set (e.g. a cookie-based access token), plus the rotated refresh cookie.
    jar = {c.name: c.value for c in s.cookies}
    jar.setdefault("chronicles_refresh", refresh.strip())
    os.environ["API_COOKIE"] = "; ".join(f"{k}={v}" for k, v in jar.items())
    try:
        SESSION_FILE.write_text(jar["chronicles_refresh"], encoding="utf-8")
    except OSError:
        pass
    got = ("an access token" if token else "no token in the body") + f", cookies: {', '.join(jar) or 'none'}"
    print(f"  /auth/refresh -> {r.status_code} ({got})")


def _extract_id(obj):
    if isinstance(obj, dict):
        for key in ("id", "project_id", "_id"):
            if obj.get(key) is not None:
                return str(obj[key])
        for v in obj.values():
            if isinstance(v, dict):
                found = _extract_id(v)
                if found:
                    return found
    return None


def ensure_test_project(base):
    """Use PROJECT_ID if given; otherwise find or create a throwaway project."""
    if os.environ.get("PROJECT_ID"):
        print(f"  using PROJECT_ID={os.environ['PROJECT_ID']}")
        return
    s = requests.Session()
    url = base.rstrip("/") + "/projects"
    r = s.get(url, headers=headers(), timeout=(5, 30))
    projects = r.json() if r.ok else []
    if isinstance(projects, dict):
        projects = next((v for v in projects.values() if isinstance(v, list)), [])
    for p in projects:
        if isinstance(p, dict) and p.get("name") == TEST_PROJECT_NAME:
            os.environ["PROJECT_ID"] = _extract_id(p)
            print(f"  using existing test project id={os.environ['PROJECT_ID']}")
            return
    r = s.post(url, headers=headers(), json={"name": TEST_PROJECT_NAME}, timeout=(5, 30))
    pid = _extract_id(r.json()) if r.ok else None
    if not pid:
        raise SystemExit(f"Couldn't create a test project (POST /projects -> {r.status_code}: {r.text[:200]}). "
                         f"Set $env:PROJECT_ID to an existing project's id instead.")
    os.environ["PROJECT_ID"] = pid
    print(f"  created test project '{TEST_PROJECT_NAME}' id={pid}")


def preflight(base):
    """Fail fast with a clear message instead of hanging on a dead URL or a bad token."""
    s = requests.Session()
    health = call(s, base, {"method": "GET", "path": "/health"})
    if health["status"] == 0:
        raise SystemExit(f"Can't reach {base} ({health['error']}). Is the URL right, and is the backend running?\n"
                         f"Tip: set $env:API_BASE_URL or pass --base-url.")
    print(f"  /health -> {health['status']} in {health['ms']:.0f} ms")
    login(base)
    if not (os.environ.get("API_TOKEN") or os.environ.get("API_COOKIE")):
        raise SystemExit("Not logged in - almost every route needs a login, so results would just be 401s.\n"
                         "Set $env:CHRONICLES_REFRESH to your chronicles_refresh cookie value first.")
    me = call(s, base, {"method": "GET", "path": "/auth/me"})
    if me["status"] in (401, 403):
        raise SystemExit(f"/auth/me returned {me['status']}: the login was rejected. "
                         f"Log in to the app again, copy a fresh chronicles_refresh value and retry.")
    print(f"  /auth/me -> {me['status']} (logged in)")
    ensure_test_project(base)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["load", "latency", "robustness"])
    ap.add_argument("--requests", type=int, default=1000)
    ap.add_argument("--concurrency", type=int, default=50)
    ap.add_argument("--rounds", type=int, default=10)
    ap.add_argument("--base-url", default=os.environ.get("API_BASE_URL", "http://localhost:8000"))
    args = ap.parse_args()

    endpoints = load_endpoints()
    # Endpoints marked "load": false (writes) are only used by the robustness mode,
    # so a 1,000-request load run doesn't fill the database with junk.
    read_only = [ep for ep in endpoints if ep.get("load", True)]
    print(f"{args.mode} test against {args.base_url} ({len(endpoints)} endpoints)")
    preflight(args.base_url)

    extra = ""
    if args.mode == "load":
        rows, meta = run_load(args.base_url, read_only, args.requests, args.concurrency)
    elif args.mode == "latency":
        rows, meta = run_latency(args.base_url, read_only, args.requests)
    else:
        rows, meta, extra = run_robustness(args.base_url, endpoints, args.rounds)

    path = write_evidence(args.mode, rows, summarise(rows), meta, extra)
    for k, v in meta.items():
        print(f"  {k}: {v}")
    print(f"Evidence written to {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()