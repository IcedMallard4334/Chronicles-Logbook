"""Generates a flat-style SVG coverage badge (shields.io look) with no
external dependencies or network calls. Useful when your Gitea instance
isn't publicly reachable, so a shields.io "endpoint" badge can't work --
this produces the SVG itself, which you commit into the repo instead.

Usage:
    badge.py <label> <percentage> <output_path>
    badge.py Backend 87.3 badges/backend-coverage.svg
"""

import sys


def coverage_color(pct: float) -> str:
    if pct >= 80:
        return "#4c1"  # green
    if pct >= 60:
        return "#dfb317"  # yellow
    return "#e05d44"  # red


def render_badge(label: str, pct: float) -> str:
    value = f"{pct:.1f}%"
    color = coverage_color(pct)
    label_width = 6 + len(label) * 7
    value_width = 6 + len(value) * 7
    total_width = label_width + value_width
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{total_width}" height="20" role="img" aria-label="{label}: {value}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="{total_width}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="{label_width}" height="20" fill="#555"/>
    <rect x="{label_width}" width="{value_width}" height="20" fill="{color}"/>
    <rect width="{total_width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="{label_width / 2}" y="14">{label}</text>
    <text x="{label_width + value_width / 2}" y="14">{value}</text>
  </g>
</svg>'''


def main() -> None:
    if len(sys.argv) != 4:
        print("Usage: badge.py <label> <percentage> <output_path>", file=sys.stderr)
        sys.exit(1)
    label, pct_str, output_path = sys.argv[1], sys.argv[2], sys.argv[3]
    pct = float(pct_str)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(render_badge(label, pct))
    print(f"Wrote {label} badge ({pct}%) to {output_path}")


if __name__ == "__main__":
    main()