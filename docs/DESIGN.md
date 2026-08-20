# Sanctio — Design System & UX Spec

Companion to `SPEC.md`. This file governs everything visual. Judged criteria are use case,
module/data integrity, and **UI/UX quality** — so this is not a styling appendix, it is half the
submission.

---

## 1. Design direction

**A credit desk, not a SaaS landing page.**

Restraint reads as professional in financial software. Gradients, glassmorphism, neon accents and
drop shadows read as amateur — they are the tell of a demo built by someone who has never seen a
bank's internal tooling. The reference points are Linear, Stripe's dashboard, Bloomberg terminals:
hairline borders, flat surfaces, generous header whitespace, dense tabular bodies, one accent
colour used sparingly.

Five rules, no exceptions:

1. **Hairlines, not shadows.** 1px borders at 10% ink. Shadows only on genuinely floating layers
   (dropdown, modal, toast).
2. **One accent.** Blue `--series-1` for interactive and primary data. Status colours are reserved
   for status. Nothing else is coloured.
3. **Money is tabular.** Every currency figure and every numeric column uses
   `font-variant-numeric: tabular-nums`. Misaligned digits are the fastest way to look unfinished.
4. **Dense body, airy header.** Table rows at 40px. Page headers get 32px of breathing room.
5. **No emoji, no icon soup.** One consistent stroke icon set (Lucide), 16px, `--text-secondary`.

---

## 2. Tokens

Declared once on `:root`. Dark values under **both** the media query and the `data-theme` scope so
the toggle wins in either direction.

```css
:root {
  color-scheme: light;

  /* ── Surfaces ─────────────────────────────── */
  --page:           #f9f9f7;   /* app background */
  --surface-1:      #fcfcfb;   /* cards, panels, chart surface */
  --surface-2:      #f2f2ee;   /* table header, inset wells */
  --surface-3:      #e8e8e2;   /* hover on surface-2 */
  --overlay:        rgba(11,11,11,0.32);

  /* ── Ink ──────────────────────────────────── */
  --text-primary:   #0b0b0b;
  --text-secondary: #52514e;
  --text-muted:     #898781;   /* axis labels, meta, placeholders */
  --text-inverse:   #fcfcfb;

  /* ── Lines ────────────────────────────────── */
  --border:         rgba(11,11,11,0.10);
  --border-strong:  rgba(11,11,11,0.18);
  --gridline:       #e1e0d9;
  --axis:           #c3c2b7;

  /* ── Accent / interactive ─────────────────── */
  --accent:         #2a78d6;
  --accent-hover:   #256abf;
  --accent-wash:    #cde2fb;   /* selected row, active nav */
  --focus-ring:     #2a78d6;

  /* ── Data series (validated — see §3) ─────── */
  --series-1:       #2a78d6;
  --series-2:       #eb6834;

  /* ── Status (fixed, never themed) ─────────── */
  --good:           #0ca30c;
  --warning:        #fab219;
  --serious:        #ec835a;
  --critical:       #d03b3b;
  --good-text:      #006300;   /* status as text needs the darker step */

  /* ── Type ─────────────────────────────────── */
  --font: system-ui, -apple-system, "Segoe UI", sans-serif;

  /* ── Geometry ─────────────────────────────── */
  --r-sm: 4px;  --r-md: 6px;  --r-lg: 10px;
  --shadow-pop:  0 4px 12px rgba(11,11,11,0.10), 0 0 0 1px var(--border);
  --shadow-modal: 0 16px 48px rgba(11,11,11,0.20);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --page:           #0d0d0d;
    --surface-1:      #1a1a19;
    --surface-2:      #222221;
    --surface-3:      #2c2c2a;
    --overlay:        rgba(0,0,0,0.60);
    --text-primary:   #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted:     #898781;
    --text-inverse:   #0b0b0b;
    --border:         rgba(255,255,255,0.10);
    --border-strong:  rgba(255,255,255,0.20);
    --gridline:       #2c2c2a;
    --axis:           #383835;
    --accent:         #3987e5;
    --accent-hover:   #5598e7;
    --accent-wash:    #184f95;
    --focus-ring:     #5598e7;
    --series-1:       #3987e5;
    --series-2:       #d95926;
    --good-text:      #0ca30c;
  }
}
:root[data-theme="dark"] { /* …identical dark block… */ }
```

**Dark mode is selected, not inverted.** The series hues are re-stepped for the dark surface
(`#2a78d6`→`#3987e5`), not algorithmically lightened. Status colours are mode-invariant by design.

### Type scale

| Role | Size / weight / tracking |
|---|---|
| Page title | 20px / 600 / -0.01em |
| Section head | 13px / 600 / 0.02em / uppercase / `--text-secondary` |
| Body | 13px / 400 |
| Table cell | 13px / 400 / tabular-nums |
| Meta, caption | 11px / 400 / `--text-muted` |
| Stat tile value | 28px / 600 / tabular-nums |
| Hero figure | 40px / 600 / tabular-nums |

Spacing scale: **4 / 8 / 12 / 16 / 24 / 32 / 48**. Nothing off-scale.

---

## 3. Charts

Validated against the surfaces above with the skill's validator — all checks PASS in both modes:

```
2-series, light (#2a78d6, #eb6834 on #fcfcfb): CVD ΔE 24.7 · normal 33.6 · contrast ≥3:1 → PASS
2-series, dark  (#3987e5, #d95926 on #1a1a19): CVD ΔE 26.8 · normal 31.8 · contrast ≥3:1 → PASS
```

Chart inventory for the Deal Desk, with the form chosen by the data's job:

| Chart | Form | Colour |
|---|---|---|
| Portfolio KPIs | 4 stat tiles, no plot | ink only + status pill |
| TAT: actual vs SLA by stage | horizontal bars + SLA reference line | single hue `--series-1`; bars over SLA in `--critical` |
| Exposure by sector | horizontal bars, sorted desc | single hue `--series-1` |
| Exposure by rating grade | vertical bars, grade on axis | single hue + annotated investment-grade divider |
| Sanctioned vs Disbursed | grouped bars, 2 series | `--series-1` / `--series-2` + legend |
| SLA aging | table with status pills | status palette + icon + label |

Mark rules: 2px lines, 4px rounded data-ends anchored to the baseline, 2px surface gap between
adjacent fills, recessive `--gridline` grid, no gridline on the categorical axis. Hover tooltip on
every mark — an HTML chart is interactive by default.

**Never a dual-axis chart.** Sanctioned (₹Cr) and TAT (days) never share a plot.

Rating grade is *not* colour-encoded — the grade is on the axis, so colouring it too is redundant
encoding. Exposure-by-grade gets a single hue and an annotated divider between investment and
sub-investment grade instead.

---

## 4. App shell

```
┌────────────────────────────────────────────────────────────┐
│ ▚ Sanctio    Pipeline  Deal Desk  Borrowers   ⌘K  ☾  VS ▾ │  56px top bar
├──────────┬─────────────────────────────────────────────────┤
│          │  Page header — title, meta, primary action      │
│ context  │  ─────────────────────────────────────────────  │
│ rail     │                                                 │
│ 240px    │  content                                        │
│          │                                                 │
└──────────┴─────────────────────────────────────────────────┘
```

Top bar: product mark, primary nav, command palette hint, **theme toggle**, user menu (→ logout).
The context rail is per-screen (filters on Pipeline, stage nav on Loan File) and collapses below
1280px. Desktop-first — this is back-office software — but must not break on a 1280px laptop, which
is what will be screen-recorded.

## 5. Component inventory

Build these once, before any screen:

`Button` (primary/secondary/ghost/danger) · `Input` `Select` `DatePicker` `Textarea` ·
`StatusPill` (icon + label, never colour alone) · `Badge` · `StatTile` · `DataTable` (sortable,
sticky header, zebra-free, hairline rows) · `Card` · `Drawer` (right, 480px) · `Modal` · `Toast` ·
`Tabs` · `StageTimeline` · `KanbanCard` · `ConditionChecklist` · `DeviationCard` · `AvatarStack` ·
`MoneyCell` · `Skeleton` · `EmptyState` · `ErrorState` · `ThemeToggle`.

### Money formatting

Indian conventions, because a lending app that prints `$40,000,000` is instantly not credible:

- Primary display: **`₹40.00 Cr`** (2dp, always the Cr unit on loan amounts)
- Full form on hover/tooltip: **`₹40,00,00,000`** (lakh–crore grouping, not thousands)
- Sub-crore values: **`₹85.00 L`**
- Basis points for spread: **`+ 285 bps`**
- Never a bare number without a unit.

## 6. Login & logout

Judged explicitly, so these are designed screens, not plumbing.

**Login** — centred card on `--page`, 400px. Product mark, one-line positioning statement, email +
password, primary button, inline error on the field (never a bare alert), loading state on submit.

Below a hairline divider: **three one-click demo role cards.**

```
Sign in as …
┌──────────────────┬──────────────────┬──────────────────┐
│ Relationship Mgr │ Credit Officer   │ Operations       │
│ Originates files │ Appraises,       │ Verifies         │
│                  │ sanctions        │ conditions,      │
│                  │                  │ releases funds   │
└──────────────────┴──────────────────┴──────────────────┘
```

Each fills the credentials and submits. This is a deliberate play for the judges: they will click
all three in thirty seconds instead of typing passwords from a submission form, and they will *see*
the role-based UI difference immediately. Highest-leverage 45 minutes of UI work in the build.

**Logout** — user menu → confirm → return to login with a "You've been signed out" toast. Session
cleared. No dead end, no blank screen.

## 7. States — the thing demos always miss

Judges click things that have no data. Every list, panel and chart needs all four:

| State | Requirement |
|---|---|
| Loading | Skeleton matching final layout. Never a centred spinner, never layout shift. |
| Empty | Icon + one-line explanation + the action that fixes it. Never "No data". |
| Error | What failed, and a Retry. Never a raw stack trace or a silent blank. |
| Populated | The real thing. |

## 8. Motion & accessibility

- Transitions 150ms ease-out; drawers/modals 200ms. Nothing slower — sluggish reads as broken.
- `@media (prefers-reduced-motion: reduce)` → all transitions to `0.01ms`.
- Visible 2px `--focus-ring` on every interactive element, offset 2px. Never `outline: none`.
- Full keyboard path through the sanction flow — it's the one judges will try.
- Status never colour-alone: pill = dot + text label.
- Contrast ≥ 4.5:1 body text, ≥ 3:1 large text and UI marks, both themes.
- **No theme flash:** an inline script in `<head>` stamps `data-theme` from `localStorage` before
  first paint. A white flash on a dark-mode load undoes the whole impression.

## 9. Polish pass — do not skip

Reserve 3 hours at the end purely for this, and run it as a checklist:

- [ ] Both themes screenshotted on all 5 screens, side by side, at 1280px
- [ ] Every number tabular and unit-suffixed
- [ ] No `Lorem`, no `test`, no `asdf`, no placeholder avatar
- [ ] Tab through the whole sanction flow — focus visible at every stop
- [ ] Every empty and loading state seen at least once
- [ ] No console errors or warnings
- [ ] Refresh on every route — no white flash, no 404 on deep link
- [ ] Hover state on every clickable thing
- [ ] Nothing off the 4px spacing scale
- [ ] Charts eyeballed for label collision at 1280px (the validator checks colour, not layout)
