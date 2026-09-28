# Load & Performance Test Evidence — Index

Raw output from every `chronicles-logbook/scripts/load_test.py` run against
the deployed API, kept in full rather than only excerpted, so any number
quoted in [API Performance, Load & Robustness](../testing/api-performance.md)
can be traced back to the request-by-request data it came from. Each run
produced a `.csv` (one row per request) and, other than one aborted run, a
`.md` summary table.

All runs below were captured on 27 September 2026, against the same deployed
code (the throughput fix described in that doc's Finding 1 was not yet
deployed for any of them — see that page for what changed afterwards).

## The two runs discussed in the report

| Time | Type | Summary | Raw data |
|---|---|---|---|
| 05:34 | Latency | [latency-20260927-053410.md](latency-20260927-053410.md) | [.csv](latency-20260927-053410.csv) |
| 05:35 | Load | [load-20260927-053540.md](load-20260927-053540.md) | [.csv](load-20260927-053540.csv) |
| 05:34 | Robustness | [robustness-20260927-053447.md](robustness-20260927-053447.md) | [.csv](robustness-20260927-053447.csv) |
| 07:35 | Latency | [latency-20260927-073522.md](latency-20260927-073522.md) | [.csv](latency-20260927-073522.csv) |
| 07:37 | Load | [load-20260927-073727.md](load-20260927-073727.md) | [.csv](load-20260927-073727.csv) |
| 07:36 | Robustness | [robustness-20260927-073611.md](robustness-20260927-073611.md) | [.csv](robustness-20260927-073611.csv) |

## Additional runs (not separately discussed)

Captured while the tooling itself was being developed and tuned, in between
the two runs above. Kept for completeness rather than discarded, since the
Sprint 3 guidance is explicit that test evidence should be shown in full. They
tell the same story as the two runs above (same code, same order of
magnitude) and are not double-counted in any average or comparison in the
main report.

| Time | Type | Notes |
|---|---|---|
| 05:29 | Latency | [.csv only](latency-20260927-052959.csv) — aborted before the summary step ran |
| 05:51 | Latency | [latency-20260927-055111.md](latency-20260927-055111.md) — full run, consistent with both main runs |
| 05:52 | Robustness | [robustness-20260927-055219.md](robustness-20260927-055219.md) — full run, same 6 accepted-invalid-value pattern as the 07:36 run (Finding 5, now fixed) |

## Reproducing

See [API Performance, Load & Robustness — Reproducing these results](../testing/api-performance.md#reproducing-these-results).
