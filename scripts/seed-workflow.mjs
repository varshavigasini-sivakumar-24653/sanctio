// Seeds the parts of each loan file that a self-client token can actually READ BACK:
// phases, tasks and issues. Run after the loan-file Projects exist.
//
// WHY THIS EXISTS
// Custom-module records are createable through the MCP but unreadable over REST with a
// self-client token (BROKE.md #8), and a deployed Catalyst function cannot call the MCP.
// So the child data the app must display lives where the token has full read/write:
//
//   Sanction conditions  -> Tasks        (owner, due date, status, blocks downstream)
//   Disbursement tranches-> Tasks        (scheduled vs actual, released by)
//   Credit deviations    -> Issues       (severity == approval authority)
//   The 7 lending stages -> Phases       (with real dates, driving the stage rail)
//
// This is not a workaround dressed up as a design. docs/SPEC.md always claimed a
// sanction condition IS a task; this makes the claim literal. The six custom modules
// remain in the portal as the record-of-schema and are shown in the walkthrough.
//
// Run: node scripts/seed-workflow.mjs [--clean]

import { api, unwrap, PORTAL_ID } from './zoho.mjs';
import { DATASET, STAGES, STAGE_SLA } from './dataset.mjs';

const P = `/portal/${PORTAL_ID}`;
const log = (...a) => console.log(...a);
const clean = process.argv.includes('--clean');

/* Phases want MM-DD-YYYY. Tasks want YYYY-MM-DD. Same API, same request, different
 * format — passing ISO to a phase returns 400 INVALID_PARAMETER_VALUE with no hint
 * that the date shape is the problem. See BROKE.md #9. */
const usDate = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${m}-${d}-${y}`;
};

const projects = unwrap(await api('GET', `${P}/projects?page=1&per_page=200`)).filter(
  (p) => p.loan_reference,
);
log(`${projects.length} loan files\n`);

const byRef = new Map(projects.map((p) => [p.loan_reference, p]));

/* ── Optional cleanup of earlier test artifacts ─────────────────────────────── */

if (clean) {
  log('Cleaning test artifacts…');
  for (const p of projects) {
    const issues = unwrap(await api('GET', `${P}/projects/${p.id}/issues?page=1&per_page=100`));
    for (const i of issues.filter((x) => /^probe /.test(x.name || ''))) {
      await api('DELETE', `${P}/projects/${p.id}/issues/${i.id}`).catch(() => null);
      log(`  - issue ${i.name}`);
    }
    const tasks = unwrap(await api('GET', `${P}/projects/${p.id}/tasks?page=1&per_page=200`));
    for (const t of tasks.filter((x) => /^TEST —|^probe |^Register first charge with CERSAI and ROC$|^Submit monthly stock statement$/.test(x.name))) {
      await api('DELETE', `${P}/projects/${p.id}/tasks/${t.id}`).catch(() => null);
      log(`  - task ${t.name}`);
    }
    // Duplicate phases from probing: keep the first of each name.
    const phases = unwrap(await api('GET', `${P}/projects/${p.id}/phases?page=1&per_page=100`));
    const seen = new Set();
    for (const ph of phases) {
      if (seen.has(ph.name)) {
        await api('DELETE', `${P}/projects/${p.id}/phases/${ph.id}`).catch(() => null);
        log(`  - duplicate phase ${ph.name}`);
      } else seen.add(ph.name);
    }
  }
  log('');
}

/* ── Phases: the stages a file has actually reached ─────────────────────────── */

let phasesMade = 0;
for (const p of projects) {
  const upto = STAGES.indexOf(p.current_stage);
  if (upto < 0) continue;

  const existing = new Set(
    unwrap(await api('GET', `${P}/projects/${p.id}/phases?page=1&per_page=100`)).map((x) => x.name),
  );

  // Walk backwards from the current stage, giving each completed stage its SLA
  // duration, so the rail shows a plausible history rather than all-same dates.
  let cursor = new Date(p.stage_entered_on || Date.now());
  const spans = [];
  for (let i = upto; i >= 0; i--) {
    const end = new Date(cursor);
    const start = new Date(cursor);
    start.setUTCDate(start.getUTCDate() - (STAGE_SLA[STAGES[i]] || 2));
    spans.unshift({ name: STAGES[i], start, end });
    cursor = start;
  }

  for (const s of spans) {
    if (existing.has(s.name)) continue;
    try {
      await api('POST', `${P}/projects/${p.id}/phases`, {
        name: s.name,
        start_date: usDate(s.start.toISOString().slice(0, 10)),
        end_date: usDate(s.end.toISOString().slice(0, 10)),
      });
      phasesMade++;
    } catch (e) {
      log(`  ! phase ${p.loan_reference}/${s.name}: ${String(e.message).slice(0, 120)}`);
    }
  }
}
log(`phases:      +${phasesMade}`);

/* ── Sanction conditions as Tasks ───────────────────────────────────────────── */

// Task name carries the category so the list is readable in the Zoho UI too, where
// there is no custom-field column to lean on.
const conditionTaskName = (c) => `[${c.category}] ${(c.text || '').slice(0, 120)}`;

let condMade = 0;
for (const c of DATASET.conditions) {
  const p = byRef.get(c.loanRef);
  if (!p) continue;
  const name = conditionTaskName(c);

  try {
    await api('POST', `${P}/projects/${p.id}/tasks`, {
      name,
      description:
        `Category: ${c.category}\nType: ${c.type}\nFrequency: ${c.frequency}\n` +
        `Status: ${c.status}\nWaiver authority: ${c.waiverAuthority}\n` +
        `Blocks disbursement: ${c.blocksDisbursement ? 'YES' : 'no'}`,
      end_date: c.dueDate,
    });
    condMade++;
  } catch (e) {
    log(`  ! condition ${c.loanRef}: ${String(e.message).slice(0, 140)}`);
  }
}
log(`conditions:  +${condMade}`);

/* ── Disbursement tranches as Tasks ─────────────────────────────────────────── */

let trMade = 0;
for (const t of DATASET.tranches) {
  const p = byRef.get(t.loanRef);
  if (!p) continue;
  try {
    await api('POST', `${P}/projects/${p.id}/tasks`, {
      name: `[Tranche ${t.trancheNo}] ${t.status} — Rs ${t.amountCr.toFixed(2)} Cr`,
      description:
        `Amount: Rs ${t.amountCr.toFixed(2)} Cr\nScheduled: ${t.scheduledDate}\n` +
        `Actual: ${t.actualDate || 'not released'}\nMode: ${t.mode}\n` +
        `Purpose: ${t.purpose}\n` +
        (t.blockedReason ? `BLOCKED: ${t.blockedReason}` : 'Pre-conditions met'),
      end_date: t.scheduledDate,
    });
    trMade++;
  } catch (e) {
    log(`  ! tranche ${t.loanRef}: ${String(e.message).slice(0, 140)}`);
  }
}
log(`tranches:    +${trMade}`);

/* ── Credit deviations as Issues ────────────────────────────────────────────── */

// Severity is the approval authority — SPEC.md §5. The one Critical deviation is the
// planted case the walkthrough turns on.
const DEVIATIONS = [
  {
    ref: 'LN-2026-0038',
    title: 'Exposure above sectoral cap and DSCR below floor',
    severity: 'Critical',
    detail:
      'Retail sector exposure would breach the 25% cap. DSCR at 1.08x against a 1.25x floor. ' +
      'Requires Credit Committee approval. Compensating security offered: promoter guarantee.',
  },
  {
    ref: 'LN-2026-0041',
    title: 'LTV 4pp above policy norm',
    severity: 'Major',
    detail:
      'LTV computes to 69% against a 65% norm for textiles collateral. Head of Credit authority. ' +
      'Mitigant: receivables hypothecation offered as additional security.',
  },
  {
    ref: 'LN-2026-0021',
    title: 'Moratorium exceeds product norm by 6 months',
    severity: 'Minor',
    detail:
      '24-month moratorium sought against an 18-month norm for project finance. ' +
      'Credit Manager authority. Justified by the construction schedule.',
  },
];

let devMade = 0;
for (const d of DEVIATIONS) {
  const p = byRef.get(d.ref);
  if (!p) continue;
  try {
    await api('POST', `${P}/projects/${p.id}/issues`, {
      name: `[${d.severity}] ${d.title}`,
      description: d.detail,
    });
    devMade++;
  } catch (e) {
    log(`  ! deviation ${d.ref}: ${String(e.message).slice(0, 140)}`);
  }
}
log(`deviations:  +${devMade}`);

log('\nDone. These are all readable by the app over REST.');
