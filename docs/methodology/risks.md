# Potential Risks

This page documents the technical and project risks identified in the current Chronicles setup, their potential impact, and the mitigations in place or planned.

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Azure subscription quota limits | Medium | High | New Azure account created mid-sprint; monitor usage; split resources across subscriptions if needed |
| R2 | PostgreSQL SSL connection failures | Medium | Medium | `DATABASE_SSL` flag documented; local dev uses `false`, production uses `true`; connection retry logic in asyncpg |
| R3 | Google OAuth outage or misconfiguration | Low | Critical | Cannot be fully mitigated (external dependency); ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correctly configured; monitor Google status page |
| R4 | JSONB query performance degradation at scale | Medium | Medium | Indexes on `project_id` and `created_at`; queries use GIN indexes on JSONB where possible; pagination on all list endpoints |
| R5 | Single Gitea instance downtime | Low | High | Gitea is self-hosted on the SDP server; if it goes down, CI/CD and work tracking are unavailable. Local development and testing can continue independently |
| R6 | No password fallback for authentication | Low | Medium | Deliberate design decision (Sprint 5 PO review, 2026-08-24). All team members and testers have Google accounts. Risk accepted |
| R7 | Brevo SMTP service disruption | Low | Low | Only affects transactional emails (welcome, account-deleted notifications). Non-blocking for core functionality. Emails are best-effort |
| R8 | Concurrent CGV project reducing Sprint 3 capacity | High | Medium | Capacity planning reduced for Sprint 3; prioritising bug fixes and polish over new features; WIP limits prevent overcommitment |
| R9 | Azure free-tier cost exhaustion | Medium | Medium | Monitor Azure cost alerts; use consumption-based pricing where possible; tear down unused resources; consolidate backend + frontend on minimal App Service plans |
| R10 | Multi-repo vs monorepo architecture decision pending | Medium | Medium | Pending lecturer confirmation (raised at Sprint 5 PO review). Current monorepo works for team size; can split if required |
| R11 | Test coverage gaps in user-defined schema edge cases | Medium | Medium | Backend tests use in-memory SQLite; JSONB-specific behaviour may differ from production PostgreSQL. Integration tests against a real PostgreSQL instance are planned |
| R12 | Single Product Owner as bottleneck | Medium | Medium | Matthew is external with limited availability. Internal PO role filled by Athalia for day-to-day priority decisions; escalations batched for PO reviews |

## Risk Assessment Detail

### R1: Azure subscription quota limits

During Sprint 1, the team's primary Azure account hit its subscription quota limit, blocking deployment of the PostgreSQL Flexible Server. A new Azure account was created by Nkosinathi to unblock deployment. This remains a risk because free-tier subscriptions have strict resource limits.

**Mitigation:** Monitor Azure cost and usage dashboards weekly. If limits are approached, split resources across subscriptions or upgrade to a paid tier.

### R2: PostgreSQL SSL connection failures

Azure Database for PostgreSQL requires SSL in production. The `DATABASE_SSL` environment variable controls this. During Sprint 1, the team encountered SSL handshake errors when deploying to Azure.

**Mitigation:** The `DATABASE_SSL` flag is documented in `.env.example` and the deployment guide. Local development uses `DATABASE_SSL=false`; production uses `DATABASE_SSL=true`. Asyncpg's SSL parameters are configured in `database.py`.

### R3: Google OAuth outage or misconfiguration

Since Chronicles uses Google OAuth as its sole authentication method, a Google API outage or a misconfigured OAuth client would prevent all users from logging in. There is no password fallback.

**Mitigation:** This is an accepted risk — the decision to go Google-only was made at the Sprint 5 PO review (2026-08-24). The OAuth client configuration is documented in `AUTHENTICATION_AND_AZURE.md`. The `OAUTH_REDIRECT_URI` must be registered exactly in the Google Cloud console for both local and production environments.

### R4: JSONB query performance

User-defined entry schemas are stored in PostgreSQL JSONB columns. As the number of entries grows, queries that filter or aggregate on JSONB fields could become slow.

**Mitigation:** All list endpoints use pagination (default 20 items, max 100). The `entries` table has indexes on `project_id` and `created_at`. GIN indexes can be added on the JSONB `data` column if query patterns warrant it. The `time_spent` aggregate uses a computed column, not a JSONB scan.

### R8: CGV project overlap

The Computer Graphics and Vision (CGV) project runs concurrently with the second half of the semester, reducing the team's available development capacity in Sprint 3 and the submission window.

**Mitigation:** Sprint 3 capacity is reduced proportionally. The sprint plan prioritises bug fixes, polish, and documentation over new features. WIP limits prevent overcommitment. The Scrumban pull-based model means team members pick up work as capacity allows.

AI Declaration: The preceding document was reviewed and edited with: Qoder
