# Sanctio

**Commercial loan origination and disbursement, built on Zoho Projects.**

A loan file is not a row in a table — it is a project. Sanctio takes that literally: every
commercial credit application becomes a Zoho Project with the seven lending stages as phases,
the underwriting checklist as tasks with real dependencies, the credit decision as a blueprint
state machine, and turnaround time as time logs. Six custom modules carry the lending domain
that has nowhere else to live: borrowers, facilities, collateral and its legal clearance, risk
assessments, sanction conditions, and disbursement tranches.

Built for the Zoho Projects 20th-anniversary Build With AI challenge.

| | |
|---|---|
| Industry | Banking — commercial / corporate lending |
| System of record | Zoho Projects (no external database) |
| Hosting | Zoho Catalyst — Slate frontend, serverless functions, cron triggers |
| Portal | `60083699064` (India DC) |

## How the mapping works

| Lending concept | Zoho Projects primitive |
|---|---|
| Loan file | Project, from a template |
| The 7 lending stages | Phases |
| Underwriting checklist | Tasks + dependencies |
| Credit decision workflow | Blueprint transitions |
| Credit deviations | Issues, repurposed, with severity as the approval authority |
| Turnaround time per stage | Time logs |
| Audit trail | Comments |
| Document vault | Attachments |
| Borrowers, facilities, collateral, risk, conditions, tranches | 6 custom modules |

Full detail in [`docs/SPEC.md`](docs/SPEC.md). Visual system in [`docs/DESIGN.md`](docs/DESIGN.md).
Everything that went wrong, and how to avoid it, in [`BROKE.md`](BROKE.md).

## Layout

```
sanctio/
├── client/          Vite + React frontend, deployed to Catalyst Slate
├── functions/       Catalyst serverless functions (BFF + cron)
├── scripts/         Schema application, demo-data seeding, integrity verification
└── docs/            Spec and design system
```

## Setup

### 1. OAuth self-client

The schema was created through the Zoho Projects MCP server. Bulk field and record operations
run through the same REST API using a self-client token, which the Catalyst backend also needs.

1. Go to **`api-console.zoho.in`** — the India console. Not `.com`; a `.com` client
   authenticates but every API call against `projects.zoho.in` returns 401.
2. **Add Client → Self Client**.
3. Copy the Client ID and Client Secret.
4. Open the **Generate Code** tab, paste the scopes listed in `.env.example`, set a duration of
   10 minutes, and generate. Copy the code.
5. Exchange it for a refresh token within those 10 minutes:

```bash
curl -X POST https://accounts.zoho.in/oauth/v2/token \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=PASTED_CODE"
```

6. `cp .env.example .env` and fill in the three values. `.env` is gitignored.

### 2. Apply the schema

```bash
node scripts/apply-schema.mjs
```

Idempotent — skips fields that already exist, so it is safe to re-run after a partial failure.

### 3. Seed and verify demo data

```bash
node scripts/seed.mjs
node scripts/verify-data.mjs
```

`verify-data.mjs` asserts the 32 integrity invariants in `docs/SPEC.md` §12 against the live
portal and exits non-zero on any violation. Run it before recording the walkthrough — realistic
demo data means arithmetic that survives a reader who knows lending.

## Credits

Schema design, code, and demo data generated with Claude (Opus 5) via the Zoho Projects MCP
server. Human contribution: the domain model and the decisions about what not to build.
