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
