"""Extracts a line-coverage percentage from a Cobertura XML report or a
json-summary report, prints it, and appends it to the file at
GITHUB_OUTPUT so it's usable as a step output later in the workflow.

Written in Python (not inline shell) so it runs identically regardless
of which shell the runner defaults to -- avoids the bash-vs-cmd script
generation issue seen with mixed shell defaults on Windows runners.

Usage:
    extract_coverage.py cobertura coverage.xml
    extract_coverage.py json-summary coverage/coverage-summary.json
"""

import json
import os
import sys
import xml.etree.ElementTree as ET


def pct_from_cobertura(path: str) -> float:
    root = ET.parse(path).getroot()
    return round(float(root.attrib["line-rate"]) * 100, 1)


def pct_from_json_summary(path: str) -> float:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return round(data["total"]["lines"]["pct"], 1)


def main() -> None:
    if len(sys.argv) != 3:
        print(
            "Usage: extract_coverage.py <cobertura|json-summary> <input>",
            file=sys.stderr,
        )
        sys.exit(1)

    fmt, input_path = sys.argv[1], sys.argv[2]
    if fmt == "cobertura":
        pct = pct_from_cobertura(input_path)
    elif fmt == "json-summary":
        pct = pct_from_json_summary(input_path)
    else:
        print(f"Unknown format: {fmt}", file=sys.stderr)
        sys.exit(1)

    print(f"Coverage: {pct}%")

    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as f:
            f.write(f"percentage={pct}\n")


if __name__ == "__main__":
    main()