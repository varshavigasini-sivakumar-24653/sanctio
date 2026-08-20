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
