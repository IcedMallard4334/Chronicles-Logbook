"""Builds a markdown per-file coverage breakdown table -- the "analysis"
piece Codecov normally provides -- from either a Cobertura XML report
(backend, coverage.py --cov-report=xml) or a json-summary report
(frontend, vitest/istanbul --coverage with the json-summary reporter).

Files are sorted worst-coverage-first so the ones that need attention
show up at the top, and anything under THRESHOLD is flagged.

Usage:
    coverage_table.py cobertura coverage.xml backend-coverage-table.md
    coverage_table.py json-summary coverage/coverage-summary.json frontend-coverage-table.md
"""

import json
import sys
import xml.etree.ElementTree as ET

THRESHOLD = 80.0  # files below this get flagged with a warning icon


def rows_from_cobertura(path: str) -> list[tuple[str, float]]:
    root = ET.parse(path).getroot()
    rows = []
    for cls in root.iter("class"):
        filename = cls.attrib.get("filename", cls.attrib.get("name", "?"))
        pct = round(float(cls.attrib["line-rate"]) * 100, 1)
        rows.append((filename, pct))
    return rows


def rows_from_json_summary(path: str) -> list[tuple[str, float]]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    rows = []
    for filename, stats in data.items():
        if filename == "total":
            continue
        rows.append((filename, round(stats["lines"]["pct"], 1)))
    return rows


def render_table(rows: list[tuple[str, float]]) -> str:
    if not rows:
        return "_No coverage data available._\n"
    rows.sort(key=lambda r: r[1])
    lines = ["| File | Coverage |", "|---|---|"]
    for filename, pct in rows:
        flag = " ⚠️" if pct < THRESHOLD else ""
        lines.append(f"| `{filename}` | {pct}%{flag} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    if len(sys.argv) != 4:
        print(
            "Usage: coverage_table.py <cobertura|json-summary> <input> <output>",
            file=sys.stderr,
        )
        sys.exit(1)
    fmt, input_path, output_path = sys.argv[1], sys.argv[2], sys.argv[3]
    if fmt == "cobertura":
        rows = rows_from_cobertura(input_path)
    elif fmt == "json-summary":
        rows = rows_from_json_summary(input_path)
    else:
        print(f"Unknown format: {fmt}", file=sys.stderr)
        sys.exit(1)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(render_table(rows))


if __name__ == "__main__":
    main()