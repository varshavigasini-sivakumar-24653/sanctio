# Sanctio — Commercial Loan Origination & Disbursement
Built on Zoho Projects (system of record) + Zoho Catalyst (hosting, functions, cron).

---

## 0. Verified environment (checked 2026-08-20 via MCP)

| | |
|---|---|
| Portal name | `varshavigasinidotsivakumarzohotestdotcom` |
| **Portal ID** | **`60083699064`** |
| Data centre | **India — `projects.zoho.in`** |
| Plan | `UltimateTrial` — custom modules **and** Blueprints available |
| Owner | Varsha S, `varshavigasini.sivakumar@zohotest.com` (zpuid `60083674144`) |
| Existing custom modules | **none** — all 21 modules are `type: default`. Clean slate. |
| Catalyst organization | **NONE FOUND** — see §11 blockers |

**DC constraint:** the portal is on `.in`. The Catalyst org must be created on
`console.catalyst.zoho.in`, not `.com`. Cross-DC OAuth will fail with opaque errors.

**Trial constraint:** `UltimateTrial` expires. Custom modules and Blueprints are Ultimate-tier
features — if the trial lapses before judging, the live demo URL degrades. Confirm the remaining
trial window before the video is recorded.

---

## 1. Core architectural decision

**A loan file is a Zoho Project.** Not a record in a table — an actual Project, created from a
template. Everything else hangs off it.

This is the whole pitch. Commercial lending is a multi-party, dependency-driven, SLA-bound
approval process. That is what Zoho Projects already is.

| Lending concept | Zoho Projects primitive |
|---|---|
| Loan file / deal | **Project** (from template) |
| Loan-level attributes (amount, product, stage, RM) | **Project custom fields** |
| The 7 lending stages | **Phases** |
| Stage checklists ("collect audited financials") | **Task Lists + Tasks** |
| "Legal review can't start until valuation lands" | **Task dependencies** |
| Credit decision state machine | **Blueprint** transitions |
| Credit deviations needing authority sign-off | **Issues** module, repurposed |
| Turnaround time per stage per person | **Time Logs** |
| Regulatory audit trail | **Comments** (timestamped, attributed) |
| Document vault | **Attachments** |
| Product / sector / priority | **Tags** |
| The three personas | **Users + Profiles** |
| Borrowers, facilities, collateral, risk, conditions, tranches | **Custom Modules** (6) |

---

## 2. Custom Modules

Six modules. Each entry: what it is, why it exists, and its fields.

### 2.1 `Borrowers`
**The corporate entity.** A master record reused across multiple loan files — one borrower can
hold several facilities over years, which is exactly why this can't live on the project.

Handles guarantors too, via `Entity Role`, instead of a near-duplicate module.

| Field | Type | Notes |
|---|---|---|
| Entity Name | Text | Legal name |
| Entity Role | Picklist | Borrower / Co-Borrower / Guarantor |
| Constitution | Picklist | Pvt Ltd / Public Ltd / LLP / Partnership / Proprietorship / Trust |
| CIN / Registration No | Text | |
| PAN | Text | |
| GSTIN | Text | |
| Industry / Sector | Picklist | Manufacturing, Infra, Pharma, Textiles, Logistics, IT/ITES, Retail, Agri-processing |
| Group Name | Text | For group-exposure aggregation |
| Date of Incorporation | Date | |
| Registered Address | Multiline | |
| Annual Turnover (₹ Cr) | Decimal | Latest audited |
| EBITDA (₹ Cr) | Decimal | |
| Net Worth (₹ Cr) | Decimal | |
| Existing Group Exposure (₹ Cr) | Decimal | Drives concentration checks |
| Internal Rating | Picklist | AAA, AA, A, BBB, BB, B, C, D |
| KYC Status | Picklist | Pending / In Progress / Verified / Deficient |
| Banking Since | Date | |
| Relationship Manager | User lookup | |

### 2.2 `Facilities`
**The individual credit limits inside one sanction.** A commercial sanction is never a single
number — it's a package: a term loan, a cash-credit limit, and a bank guarantee, each with its
own amount, tenor, pricing and security. Modelling this correctly is the clearest signal of
domain fluency in the whole build.

| Field | Type | Notes |
|---|---|---|
| Loan Reference | Text | Ties to the loan-file Project (see §6) |
| Facility Type | Picklist | Term Loan / Cash Credit / Overdraft / Bank Guarantee / Letter of Credit / WCDL |
| Amount Requested (₹ Cr) | Decimal | |
| Amount Sanctioned (₹ Cr) | Decimal | Blank until sanction |
| Tenor (Months) | Number | |
| Moratorium (Months) | Number | |
| Interest Basis | Picklist | Repo-linked / MCLR / Fixed |
| Spread (bps) | Number | |
| All-in Rate (%) | Decimal | |
| Processing Fee (%) | Decimal | |
| Repayment Frequency | Picklist | Monthly / Quarterly / Bullet / On Demand |
| End Use | Multiline | Regulatory requirement |
| Security Type | Picklist | Primary / Collateral / Unsecured |
| Status | Picklist | Proposed / Recommended / Sanctioned / Rejected / Withdrawn |

### 2.3 `Collateral & Valuations`
**Security offered, its valuation, and its legal clearance.** Legal due diligence lives here
rather than in its own module — in secured lending, legal review *is* title verification of the
security. Attaching the opinion to the asset is the correct model, not a shortcut.

| Field | Type | Notes |
|---|---|---|
| Loan Reference | Text | |
| Collateral Type | Picklist | Industrial Property / Commercial Property / Residential Property / Plant & Machinery / Stock & Book Debts / FD Lien / Personal Guarantee |
| Description | Multiline | |
| Owner Name | Text | |
| Location | Text | |
| — *Valuation* — | | |
| Valuer Name | Text | Empanelled valuer |
| Valuation Date | Date | |
| Market Value (₹ Cr) | Decimal | |
| Realizable Value (₹ Cr) | Decimal | |
| Distress Value (₹ Cr) | Decimal | |
| LTV (%) | Decimal | Computed against sanctioned amount |
| Next Revaluation Due | Date | Feeds the covenant cron |
| — *Legal* — | | |
| Advocate Name | Text | |
| Title Search Period (Yrs) | Number | Typically 13 or 30 |
| Chain of Title Verified | Checkbox | |
| Encumbrance Certificate | Picklist | Clear / Encumbered / Not Obtained |
| Litigation Search | Picklist | Clear / Pending Litigation / Not Done |
| Legal Opinion | Picklist | Clear / Clear with Conditions / Defective / Awaited |
| Opinion Date | Date | |
| — *Charge creation* — | | |
| Charge Type | Picklist | First / Second / Pari Passu / Negative Lien |
| Charge Registered | Checkbox | |
| CERSAI / ROC Filing Ref | Text | |

### 2.4 `Risk Assessments`
**The credit analyst's scored appraisal.** One record per assessment round — a re-appraisal
after a deviation creates a second record, so the rating history is preserved for audit.

| Field | Type | Notes |
|---|---|---|
| Loan Reference | Text | |
| Assessment Date | Date | |
| Assessed By | User lookup | |
| Financial Score | Number | 0–100 |
| Management Score | Number | 0–100 |
| Industry Score | Number | 0–100 |
| Compliance Score | Number | 0–100 |
| Collateral Score | Number | 0–100 |
| Composite Score | Decimal | Weighted |
| Internal Rating Grade | Picklist | AAA…D |
| Probability of Default (%) | Decimal | |
| Loss Given Default (%) | Decimal | |
| DSCR | Decimal | Debt service coverage |
| Debt / EBITDA | Decimal | |
| Current Ratio | Decimal | |
| Key Risks | Multiline | |
| Mitigants | Multiline | |
| Recommendation | Picklist | Approve / Approve with Conditions / Refer to Committee / Decline |
| Max Recommended Exposure (₹ Cr) | Decimal | |

### 2.5 `Sanction Conditions`
**Pre-disbursement conditions and continuing covenants.** The most operationally important
module: it gates disbursement and drives the covenant-monitoring cron. This is where most real
lending processes actually leak.

| Field | Type | Notes |
|---|---|---|
| Loan Reference | Text | |
| Condition Text | Multiline | |
| Category | Picklist | Pre-Disbursement / Post-Disbursement / Continuing Covenant |
| Condition Type | Picklist | Documentary / Security Perfection / Financial Covenant / Regulatory / Insurance |
| Owner | User lookup | |
| Due Date | Date | |
| Frequency | Picklist | One-time / Monthly / Quarterly / Half-Yearly / Annual |
| Status | Picklist | Open / Complied / Waived / Breached |
| Evidence | Attachment | |
| Verified By | User lookup | |
| Verified Date | Date | |
| Waiver Authority | Picklist | Credit Manager / Head of Credit / Credit Committee |
| Blocks Disbursement | Checkbox | Hard gate — Ops cannot release while true and status is Open |

### 2.6 `Disbursement Tranches`
**Scheduled and actual money movement.** Enforces that funds only leave once conditions are met.

| Field | Type | Notes |
|---|---|---|
| Loan Reference | Text | |
| Facility Reference | Text | Which facility is drawn |
| Tranche No | Number | |
| Amount (₹ Cr) | Decimal | |
| Scheduled Date | Date | |
| Requested Date | Date | |
| Actual Disbursement Date | Date | |
| Purpose / End Use | Multiline | |
| Beneficiary Account | Text | Masked in UI |
| Mode | Picklist | RTGS / NEFT / Internal Transfer |
| Pre-conditions Met | Checkbox | Server-computed from §2.5 |
| Blocked Reason | Multiline | Auto-filled with the failing condition |
| Released By | User lookup | |
| Utilization Certificate Received | Checkbox | |
| Status | Picklist | Scheduled / Requested / Blocked / Released / Cancelled |

---

## 3. Phases (the 7 stages)

Every loan-file Project is created from a template with these phases and a task list per phase.

| # | Phase | SLA (days) | Owner role | Exit gate |
|---|---|---|---|---|
| 1 | Origination & Lead Capture | 2 | Relationship Manager | Borrower + Facilities created |
| 2 | Document Collection & KYC | 5 | Relationship Manager | KYC Verified |
| 3 | Credit Appraisal | 7 | Credit Analyst | Risk Assessment submitted |
| 4 | Valuation & Legal Due Diligence | 10 | Credit Analyst | Valuation + Legal Opinion on record |
| 5 | Risk & Sanction | 5 | Head of Credit | Blueprint → Sanctioned |
| 6 | Documentation & Disbursement | 7 | Operations | Tranche 1 Released |
| 7 | Post-Disbursement Monitoring | ongoing | Operations | — |

SLA breach is what the escalation cron watches (§7).

---

## 4. Blueprint — the credit decision state machine

```
Draft
  └─ Submit ──────────► Submitted
                          └─ Pick Up ─────► Under Appraisal
                                              ├─ Raise Deviation ─► Deviation Pending
                                              │                       ├─ Approve Deviation ─► Under Appraisal
                                              │                       └─ Reject Deviation ──► Declined
                                              ├─ Return to RM ──────► Draft
                                              └─ Recommend ────────► Recommended
                                                                      ├─ Sanction ─► Sanctioned ─► Documentation ─► Disbursed ─► Under Monitoring ─► Closed
                                                                      ├─ Decline ──► Declined
                                                                      └─ Hold ─────► On Hold
```

Transitions are permissioned by role — an RM cannot fire `Sanction`. That enforcement is the
point; it's a maker-checker control, not UI decoration.

---

## 5. Credit Deviations (repurposed Issues module)

A deviation is a departure from credit policy that needs a higher authority to approve — LTV
above norm, DSCR below floor, exposure over the sectoral cap. Zoho Projects' Issues module
already has severity, assignee, status, and a comment thread. That is a deviation register.

**Authority matrix**, mapped onto Issue severity:

| Deviation magnitude | Severity | Approver |
|---|---|---|
| Within 10% of policy norm | Minor | Credit Manager |
| 10–25% | Major | Head of Credit |
| Above 25% | Critical | Credit Committee |

Rename the module to "Deviations" in portal settings if permitted; otherwise we label it in our
own UI and the underlying entity stays Issues.

---

## 6. `Loan Reference` — RESOLVED: portal-level

All six custom modules are created **portal-level (global)**. The module list confirms the data
model supports this: default modules carry an explicit `is_global_module` flag (`projects`,
`documents`, `tags`, `users` are `true`; `tasks`, `issues`, `phases`, `timelogs` are `false`).
Custom modules are created with the global flag set.

Consequence: **`Loan Reference` is the join key.** Format `LN-2026-0042`. It is written on every
child record in all six modules, and the BFF resolves it to the loan-file Project.

Rules this imposes:
- The reference is generated **server-side** at loan-file creation, in the same function that
  creates the Project. Never client-side — collisions are unrecoverable once records are written.
- Store it both ways: as a project custom field on the Project, and as a text field on each child
  record. The Project is the authority.
- The BFF's loan-detail endpoint fans out across the six modules filtering on `Loan Reference`,
  then assembles one response. Six calls per loan file, so this endpoint gets the short-TTL cache.
- Portal-level also means one flat namespace of records across all loans. Every list query must
  filter by `Loan Reference` or it returns the entire book. Easy bug to ship; guard it in the BFF,
  not in each screen.

---

## 7. Catalyst Cron Triggers

Two nightly jobs. These are what make the app *do something while nobody is watching* — and they
satisfy the "backend logic in serverless functions or Cron Triggers" requirement properly.

**`sla-escalation`** — finds loan files past their phase SLA, escalates to the next authority,
posts a comment on the Project, and raises a Critical deviation at 2× SLA.

**`covenant-watch`** — scans `Sanction Conditions` for covenants falling due or lapsed
(insurance expiring, stock statement overdue, revaluation due), flips status to `Breached` past
grace, and raises an Issue against the owner.

---

## 8. Screens (4 + login)

1. **Pipeline Board** — kanban by phase, cards coloured by SLA aging, filterable by RM / product
   / sector. The "where is everything stuck" view.
2. **Loan File** — the workhorse. Header (borrower, facilities, exposure, rating, stage), stage
   timeline with TAT actuals, document vault, conditions checklist, deviations panel, audit trail.
3. **Credit Decision Desk** — appraisal summary, scorecard, deviations awaiting *this user's*
   authority, and the Blueprint transition buttons. Approve / return / decline with a mandatory note.
4. **Deal Desk Dashboard** — TAT by stage, bottleneck stage, exposure by sector and by rating
   grade, sanctioned-vs-disbursed, SLA breach list, upcoming covenants.

## 9. Roles

| Role | Can | Cannot |
|---|---|---|
| **Relationship Manager** | Create loan files, maintain borrowers, upload docs, submit | Appraise, sanction, disburse |
| **Credit / Risk Officer** | Appraise, score, raise & approve deviations within authority, recommend, sanction | Originate, release funds |
| **Operations** | Verify conditions, release tranches, record utilization | Appraise, sanction |
| *(Deal Desk dashboard)* | Read-only aggregate — serves Branch Manager / Compliance | Any write |

Three demo logins, one per role, on `zohotest` accounts.

## 10. Demo data

12 loan files spread across all 7 phases, ₹8 Cr – ₹120 Cr, mixed products and sectors.

Three deliberately planted problems — the broken deals are what make a demo feel real:
1. One file **breaching SLA** in Credit Appraisal → the escalation cron has already fired on it.
2. One file with a **Critical deviation pending** at Head of Credit → drives the approval demo.
3. One sanctioned file where **tranche 2 is Blocked** on an unmet pre-disbursement condition
   (charge not registered) → drives the Ops demo.

---

## 11. Blockers and open dependencies

**B1 — No Catalyst organization exists.** Hard blocker on requirements 2 and 7. Must be created
at `console.catalyst.zoho.in` (India DC, to match the portal). Account signup can't be automated
from here.

**B2 — Catalyst CLI not yet verified.** Slate deploys need `zcatalyst-cli` installed and
authenticated. Unverified locally.

**B3 — Portal has one user.** Demo data needs tasks assigned to a credit analyst and an ops
officer, or the pipeline looks synthetic. Add 2–3 more `@zohotest.com` users to the portal so
assignees are real people.

**B4 — Write attribution.** Per-user OAuth for three roles is disproportionate for a demo. The
BFF holds the portal owner's refresh token, enforces role permissions itself, and records the
acting user in comments and `Verified By` / `Released By` fields. Blueprint transitions are
therefore gated at the BFF, not by Projects' own profile permissions. **Disclose this in the
"what broke" field** — it is the honest limitation of the build, and hiding it is worse than
owning it.

**B5 — "No external DB as source of truth" (requirement 1).** Catalyst is used for exactly three
things: Authentication, the encrypted OAuth refresh token, and a short-TTL read cache on the
loan-detail endpoint. No business data is persisted outside Zoho Projects. State this explicitly
in the submission write-up — judges will look for precisely this, and an unexplained Data Store
table reads as disqualifying.

**B6 — Submission window.** Closed 19-08-2026 11:00. Extension unconfirmed.

---

## 12. Data integrity invariants ("perfect data")

Realistic demo data is not random plausible-looking numbers. A judge who has worked in credit will
spot an LTV that doesn't match the valuation, or tranches that don't sum to the sanction, in
seconds — and once one number is visibly wrong, every other number becomes suspect.

So the demo data is **generated against invariants and then verified by a script** that reads back
from the live portal. `scripts/verify-data.mjs` asserts every rule below and exits non-zero on any
violation. Run it after seeding, and again before recording the video.

### Arithmetic
1. `Σ tranche.Amount` per facility **==** `facility.Amount Sanctioned`
2. `facility.Amount Sanctioned` **≤** `risk.Max Recommended Exposure` for that loan file
3. `facility.Amount Sanctioned` **≤** `facility.Amount Requested` (banks trim, never inflate)
4. `collateral.LTV` **==** `Σ sanctioned / collateral.Realizable Value`, ±0.5pp
5. `Market Value` **>** `Realizable Value` **>** `Distress Value` — always, no exceptions
6. `risk.Composite Score` **==** weighted sum of the five component scores
   (weights: financial 35 / management 20 / industry 15 / compliance 10 / collateral 20)
7. `facility.All-in Rate` **==** benchmark + `Spread (bps)`/100, with one stated benchmark per loan
8. `borrower.Existing Group Exposure` **≥** `Σ sanctioned` across that group's files

### Domain consistency
9. `Internal Rating Grade` sits in the correct composite-score band
   (AAA ≥90, AA 80–89, A 70–79, BBB 60–69, BB 50–59, B 40–49, C 30–39, D <30)
10. `Probability of Default` rises monotonically as grade worsens
11. `Spread (bps)` rises monotonically as grade worsens — better credit is cheaper, always
12. `DSCR` consistent with borrower EBITDA against the facility's debt service
13. `Debt / EBITDA` consistent with `borrower.EBITDA` and total group exposure
14. A `Term Loan` has a repayment frequency and tenor; a `Cash Credit` is `On Demand` with no tenor
15. `Recommendation` = `Decline` ⟹ no sanctioned facility, no tranches
16. `Legal Opinion` = `Defective` ⟹ that collateral is not the sole security on a sanctioned file

### Chronology
17. Stage dates are strictly monotonic: origination ≤ KYC ≤ appraisal ≤ valuation ≤ sanction ≤
    disbursement ≤ monitoring
18. `Valuation Date` and `Opinion Date` both **≤** sanction date — you cannot sanction on diligence
    that doesn't exist yet
19. `Actual Disbursement Date` **≥** sanction date, and **≥** the date its blocking conditions were
    complied
20. `Valuation Date` within 6 months of sanction (stale valuations are a real audit finding)
21. Time logs per phase sum to within ±20% of that phase's elapsed calendar days
22. No date in the future except `Due Date`, `Scheduled Date`, `Next Revaluation Due`

### Workflow
23. Blueprint state consistent with phase: `Sanctioned` ⟹ file is in phase 6 or 7
24. Every `Blocks Disbursement` condition is `Complied` before any tranche on that file is
    `Released` — **except** planted case #3, which is the whole point of that deal
25. Every `Sanctioned` file has ≥1 sanction condition (a sanction without conditions is fiction)
26. Every file past phase 3 has ≥1 risk assessment; past phase 4 has ≥1 collateral record
27. Every deviation `Critical` is assigned to Head of Credit or Committee, per the §5 authority matrix
28. Planted case #1's escalation comment exists and post-dates its SLA breach

### Texture (realism, not correctness)
29. No round numbers on financials — `₹37.50 Cr`, not `₹40 Cr`, except where a limit is genuinely round
30. Borrower names, sectors and cities are internally consistent (a Tiruppur textile exporter, not a
    "Mumbai Textiles Pvt Ltd" in the agri-processing sector)
31. Comment threads read like bankers wrote them — terse, dated, referencing documents by name
32. Assignees vary by role; not every task owned by the portal owner
