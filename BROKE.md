# What broke

Running log, kept from the first minute. This is the submission's "what broke" field, and the
most useful thing we can hand the next person.

---

## 1. Custom module `field_type` values are undocumented, case-sensitive, and fail with a 500

**Cost: ~25 minutes.** The worst kind of bug — a server error where a validation error belongs.

The Create/Update Field API documents `field_type` with the examples
*"single_line, picklist, date, user"*. **None of those four strings work.** Passing any of them —
or the obvious guesses `decimal` and `number` — returns:

```
500 INTERNAL_SERVER_ERROR / OPERATIONAL_VALIDATION_ERROR
"Internal server error. Please contact support@zohoprojects.com"
```

There is no hint that the field type is the problem. We initially assumed our numeric field needed
`data_type` or a `precision_value` in a different position, and burned time permuting the body
shape rather than the type string.

**How we found it:** stopped guessing and called
`get_fields` on the built-in `tasks` module, which returns `field_type` for every default field —
i.e. the real, authoritative vocabulary. Recommended first move for anyone hitting this.

### The values that actually work

| Purpose | Correct `field_type` | Notes |
|---|---|---|
| Short text | `singleline` | max_length defaults to 100 |
| Long text | `multiline` | max_length defaults to 1000 |
| Dropdown | `picklist` | options added separately via bulk-options API |
| Multi-select | `multipicklist` | |
| Decimal / money | `Double` | **capital D**; `field_type_properties.precision_value: "2"` |
| Integer | `Numeric` | **capital N** |
| Date | `Date` | **capital D**; stored `sys_millis` |
| Date + time | `dateandtime` | |
| Single user | `userpicklist` | needs `field_type_properties.userlist_type: "all_users"` |
| Multiple users | `multiuserpicklist` | |
| Boolean | `checkbox` | `boolean` also appears on default fields but `checkbox` is the creatable one |

Note the inconsistent casing: `singleline` and `picklist` are lowercase, while `Double`, `Numeric`
and `Date` are capitalised. This is not a typo in our code — it's the API.

---

## 2. Custom modules are created in `draft` and are invisible until explicitly activated

**Cost: ~5 minutes**, and it would have cost far more if discovered after seeding data.

`POST /settings/modules` returns `"status": "draft"`. The module exists, accepts field creation,
and is completely absent from the Zoho Projects UI. There is no warning in the create response
that a second call is required.

Fix: call the Activate Module API for each module after creating it.

```
POST /api/v3/portal/{portal_id}/settings/modules/{module_api_name}/activate
```

Anyone scripting module creation should treat create-then-activate as a single unit, or they will
demo an empty portal.

---

## 3. Field API names are auto-derived from the display name, and you don't choose them

`display_name: "CIN / Registration No"` silently became `field_name: "cin_registration_no"` —
slashes and spaces collapsed to underscores. The derived name is what every subsequent
create/update record call must use; display names are rejected as keys.

Consequence: **you cannot know a field's API name until you create it.** Any seeding script has to
either read the names back via `get_fields` or be written after the schema exists. We chose to
read them back, which also guards against silent collisions (two display names normalising to the
same API name).

---

## 4. `is_global_module` has to be decided at creation

Portal-level vs project-scoped is set by `is_global_module` at create time and drives the whole
data model — portal-level means every child record needs an explicit `Loan Reference` join key and
every list query must filter on it, or it returns the entire loan book.

We chose portal-level deliberately (borrowers outlive individual loan files). Worth deciding before
writing a single field, not after.

---

## 5. A missing OAuth scope reports as `URL_RULE_NOT_CONFIGURED`, not 401

**Cost: ~40 minutes**, most of it spent brute-forcing URL paths that were correct all along.

A self-client token without the custom-module scopes produces two *different* symptoms
for the same cause:

| Endpoint | Response |
|---|---|
| `/settings/modules`, `/settings/fields`, `/settings/layouts` | `401 INVALID_OAUTHSCOPE` — honest |
| `/modules/{module}/records` and every variant | `400 URL_RULE_NOT_CONFIGURED` / *"Given URL is wrong"* |

The second message is actively misleading. It says the path is wrong, so we went and
enumerated a dozen path shapes — `/modules/{m}/records`, `/{m}/records`, `/{m}`,
module-id forms, project-scoped forms — all returning the same "wrong URL".

**The path was never wrong.** Proof: the same portal, same module, reached through the
Zoho Projects MCP server (which holds a full scope set) returns `200` with an empty
result. The route exists; the gateway simply does not expose it to a token whose scopes
don't cover it, and reports the closed route as a bad URL.

**Lesson:** if a Zoho v3 path 400s with `URL_RULE_NOT_CONFIGURED` while a neighbouring
path on the same portal works, suspect scopes before you suspect the path.

### Also: two documented-looking scope names silently do not exist

We requested ten scopes. The token came back with eight. `ZohoProjects.settings.ALL` and
`ZohoProjects.customentity.ALL` were **dropped without any error** — the grant succeeds,
and you discover the gap only when an endpoint fails. Always print the `scope` field of
the token-refresh response and compare it against what you asked for:

```
"scope": "ZohoProjects.portals.READ ZohoProjects.projects.ALL ..."
```

Silent partial grants mean "the token works" is not the same as "the token works for
what you need".

---

## 6. `page` is mandatory on v3 list endpoints, and omitting it is a 400

`GET /portal/{id}/issues?per_page=2` returns:

```
400 LESS_THAN_MIN_OCCURANCE  field_name: "page"  "Input Parameter Missing"
```

`per_page` alone is not enough. Every list call needs `page=1&per_page=N`. At least this
error names the offending field, which puts it well ahead of the rest of this list.

---

## 7. The REST API and the MCP server return different response shapes

`/portals` and `/projects` return a **bare JSON array**. Other endpoints wrap in
`{data:{result:[...]}}`. The MCP server wraps *everything*.

So code developed against MCP responses reads `res.data.result`, gets `undefined` from
the raw REST endpoint, and renders an empty list — which looks like "there is no data"
rather than "the parsing is wrong". We hit exactly this and it cost real time before
someone noticed `/portals` had returned 200 with content.

Fix: one tolerant `unwrap()` helper that accepts every shape, used on every list read.

---

## 8. Custom-module records: proven unreachable by a self-client token

Worth recording as a settled fact rather than a suspicion, because we spent a long time
on it and the failure mode is misleading at every step.

**The test that settles it.** With 13 borrower records definitely present in the portal:

| Caller | Result |
|---|---|
| Zoho Projects **MCP server** (`get_record_list`) | `200`, all 13 records with every custom field |
| Our **self-client token**, every route we could think of | `400 URL_RULE_NOT_CONFIGURED` |

Routes tried, all on `projects.zoho.in/api/v3` unless noted — every one identical:

```
/portal/{p}/modules/{module}/records      /portal/{p}/{module}/records
/portal/{p}/{module}                      /portal/{p}/modules/{module}
/portal/{p}/modules/{moduleId}/records    /portal/{p}/{moduleId}/records
/portal/{p}/custommodule/{module}/records /portal/{p}/custommodules/{module}/records
/portal/{p}/customentity/{module}         /portal/{p}/entities/{module}/records
/portal/{p}/records/{module}              /portal/{p}/module/{module}/records
/portal/{p}/projects/{pid}/{module}       /portal/{p}/projects/{pid}/{module}/records
```

Alternate hosts, also no: `www.zohoapis.in/projects/v3/...` 404s even for `/projects`
(despite the token response advertising `api_domain: https://www.zohoapis.in`), and
`projectsapi.zoho.in/api/v3/...` reaches the same gateway and gives the same 400.

**Why it is not "the module is empty":** the identical 400 appeared before *and* after
the records existed. An empty module would return `200` with an empty array — which is
exactly what the MCP returns when a module genuinely has no rows.

**Why we could not fix it with scopes:** the Zoho API console **rejects as invalid** every
scope name that would plausibly cover custom entities:

```
ZohoProjects.settings.ALL       ZohoProjects.customentity.ALL
ZohoProjects.customfields.ALL   ZohoProjects.custommodule.ALL
ZohoProjects.layouts.ALL        ZohoProjects.entity.ALL
```

`ZohoProjects.custom_fields.ALL` (with the underscore) *is* accepted, and is the only
custom-anything scope the console will take.

**Practical consequence for anyone building this:** a Catalyst function cannot call the
MCP server, so schema and records can be *created* through the MCP but a deployed app
cannot *read* them back over REST. Plan the data model around what a self-client token
can actually reach — Projects, Tasks, Milestones, Issues, Timelogs — or verify custom
module record access on day one, before designing six modules around it.

---

## 9. Four Projects v3 write quirks, each a bare 400

Found while moving child data onto Tasks and Issues. None of these messages names the
real problem.

**Phases want `MM-DD-YYYY`. Tasks want `YYYY-MM-DD`.** Same API, same request shape.
Passing ISO to a phase returns `400 INVALID_PARAMETER_VALUE` with no indication that the
date format is at fault — we assumed a missing required field first.

**Task `priority` rejects the values the UI shows.** `"High"` and `"Medium"` both return
`400 Input Parameter Does not Match the Pattern Specified`. Omitting `priority` succeeds.
We never found the accepted form and dropped the field.

**Issues key on `name`, not `title`.** Sending `title` returns
`400 Input Parameter Missing: name` — which reads as "you forgot a field" rather than
"the field you sent is not a thing". Tasks and Issues both use `name`; nothing uses `title`.

**Tasklist creation needs a scope that does not exist in our grant.**
`POST /projects/{id}/tasklists` returns `401 INVALID_OAUTHSCOPE` even with
`ZohoProjects.tasks.ALL`. Tasks can be created *without* a tasklist — Zoho files them
under an auto-created "General" list — so this is avoidable, but it means you cannot
organise tasks into named lists via API with a tasks-only grant.

**Method for isolating any of these:** post the minimal body (`{name}` only), confirm
201, then add one field per request. Four requests found all four faults; guessing at
the body shape found none of them.

---

## 10. Zoho rate-limits token REFRESHES, not API calls

`"You have made too many requests continuously. Please try again after some time."` from
`accounts.zoho.in/oauth/v2/token` — and then every request fails for several minutes.

The cause was not traffic. It was a local dev server that refreshes on boot, restarted
perhaps thirty times across an afternoon of edits, plus each script run refreshing again.
Access tokens last an hour; we were throwing away a perfectly good one every restart.

Fix: cache the access token to disk in local dev, keyed to its expiry, so a restart
reuses it. In-memory caching is sufficient on Catalyst because the function stays warm —
the disk cache is enabled only when a cache path is set, so the deployed function never
touches a filesystem it does not own.

Recovery is simply waiting: it cleared in a little under two minutes.

---

## 11. Zoho also throttles per-endpoint call volume, separate from the token limit

`400 URL_ROLLING_THROTTLES_LIMIT_EXCEEDED — "Cannot execute more than 200 requests per
API in 2 minutes. Try again after 8 minutes."` — hit on `/tasks` specifically, distinct
from item 10's token-refresh limit (a different endpoint, a different failure mode, an
8-minute lockout instead of ~2).

**Cause:** every screen backed by task data (six module tables, the loan file, the
attention feed, the dashboard, concentration) independently fans out across all 15 loan
files' task lists. With no cache, clicking through six sidebar tabs in under a minute is
roughly 90 calls to the same endpoint — comfortably over the 200-per-2-minute ceiling
once dashboard and attention are added, and a demo walkthrough clicking through the app
is exactly this pattern.

**Fix:** a 45-second in-memory TTL cache in front of `tasksOf`/`issuesOf`/`phasesOf` and
`loanProjects` itself. This turns "open six tabs" into one real fetch per project on the
first tab and zero on the rest, which is both the throttle fix and the right thing for
latency regardless. 45s is long enough to absorb a normal click-through, short enough
that a write is visible within one interaction.

**Lesson for the design:** when child data is reachable only by re-deriving it from a
parent list (here: tasks per project, because there is no cross-project task query),
that fan-out cost is paid on every screen unless something remembers the answer. Budget
for this before building six screens on the same underlying fetch, not after tripping
the limit.

**The documented policy and the live one disagree — trust the live one, design for the
stricter one.** Zoho's own community help states the policy as *"100 times in a span of
two minutes... locked for the next 30 minutes"* [(help.zoho.com)](https://help.zoho.com/portal/en/community/topic/zoho-projects-api-100-requests-2-min-limit).
Our own error was `200 requests / 2 minutes, retry after 8 minutes`. Different count,
different lockout, presumably different endpoint tier or a since-changed policy — there
is no way to reconcile this from outside Zoho. Practical takeaway: don't hardcode either
number into retry logic. Cache aggressively so the limit is rarely approached, back off
on the specific error rather than a guessed threshold, and treat whatever the live
response says as more current than any doc.

---

## 12. A field named "Due Date" silently derives to a generic `cf_XXXX` name

On `sanction_condition`, creating a field display-named "Due Date" returned
`field_name: "sanction_condition_cf_0001"` instead of the expected `due_date` — no error,
no warning, just a different derived name than every other field got. Cause unconfirmed
(likely a reserved-name collision somewhere in the portal's shared namespace). Always
read the `field_name` back off the create response rather than assuming it matches the
label — the same lesson as #3, but this time the label wasn't unusual at all.

---

## 13. `catalyst deploy` wipes every console-configured environment variable on the function

Ran `catalyst deploy --only functions` to ship a backend fix. It succeeded, but the live
app immediately started failing every sign-in with `Server is missing its session
secret`. `functions/sanctio_api/catalyst-config.json` has `"env_variables": {}` — scaffolded
empty by the CLI when the function was first added (#nothing to do with secrets at the
time) and never revisited. Deploying a function is apparently **authoritative, not
additive**: it pushed that empty object and silently deleted `SESSION_SECRET` and all six
`ZOHO_*` variables that had been set directly in the Catalyst console. No warning, no
confirmation prompt — the deploy reported success.

**Recovery:** restore the variables via the Catalyst console (Functions → sanctio_api →
Settings → Environment Variables) or the Catalyst API. There's no undo.

**Why the fix isn't "populate `env_variables` in the config file":** that file is
git-tracked (`git ls-files` confirms it — unlike `.env`, which is gitignored). Filling it
in with the real `ZOHO_CLIENT_SECRET` and refresh token would commit live credentials to
source control, which is worse than the outage.

**The actual rule, until Catalyst ships something better:** never run `catalyst deploy`
(bare, or `--only functions`) without immediately re-checking the function's environment
variables afterward — console UI, or `CatalystbyZoho_List_All_Functions` if you have the
MCP connector — and restoring them if they're gone. Treat every function deploy as
destructive to env vars by default, not just the first one that surprised us.
