// Creates every custom field, section and picklist option defined in schema.mjs.
//
// Idempotent: reads existing fields first and skips anything already present, so it is
// safe to re-run after a partial failure. Run with:  node scripts/apply-schema.mjs

import { api, pool } from './zoho.mjs';
import { MODULES } from './schema.mjs';

const log = (...a) => console.log(...a);

async function layoutFor(moduleApi) {
  const list = await api('GET', `{portal}/settings/layouts?module=${moduleApi}`);
  const layout = (list.data?.result || []).find((l) => l.is_default) || list.data?.result?.[0];
  if (!layout) throw new Error(`No layout found for ${moduleApi}`);

  const detail = await api(
    'GET',
    `{portal}/settings/layouts/${layout.id}?module=${moduleApi}`,
  );
  return { layoutId: layout.id, sections: detail.data?.sections || [] };
}

async function existingFields(moduleApi) {
  const res = await api('GET', `{portal}/settings/fields?module=${moduleApi}&per_page=200`);
  const map = new Map();
  for (const f of res.data?.result || []) map.set(f.display_name, f);
  return map;
}

async function ensureSection(moduleApi, layoutId, name, sections) {
  const hit = sections.find((s) => s.name === name);
  if (hit) return hit.id;
  const res = await api('POST', `{portal}/settings/layouts/${layoutId}/sections`, {
    module: moduleApi,
    name,
    position: { known_position: 'last' },
  });
  const id = res.data?.id;
  log(`    + section "${name}"`);
  sections.push({ id, name });
  return id;
}

async function createField(moduleApi, layoutId, sectionId, def) {
  const field_property = {
    context_property: { is_mandatory: false, has_info: false },
  };
  if (def.precision) field_property.field_type_properties = { precision_value: def.precision };
  if (def.type === 'userpicklist' || def.type === 'multiuserpicklist') {
    field_property.field_type_properties = { userlist_type: 'all_users' };
  }

  const res = await api('PUT', '{portal}/settings/fields', {
    module: moduleApi,
    layout_id: layoutId,
    section_id: sectionId,
    display_name: def.label,
    field_type: def.type,
    field_property,
  });
  return res.data;
}

async function addOptions(moduleApi, layoutId, fieldId, opts) {
  await api('POST', '{portal}/settings/fields/options', {
    module: moduleApi,
    layout_id: layoutId,
    field: fieldId,
    custom_options: opts.map((value) => ({ value })),
    position: { known_position: 'last' },
  });
}

let created = 0;
let skipped = 0;
const failures = [];

for (const mod of MODULES) {
  log(`\n▚ ${mod.label}  (${mod.api})`);
  const { layoutId, sections } = await layoutFor(mod.api);
  const defaultSection =
    sections.find((s) => s.name && s.is_default) || sections[sections.length - 1];

  for (const name of mod.sections || []) {
    await ensureSection(mod.api, layoutId, name, sections);
  }

  const have = await existingFields(mod.api);

  // Sequential rather than pooled: field creation mutates layout order, and parallel
  // writes against the same layout produced duplicated positions in testing.
  for (const def of mod.fields) {
    if (have.has(def.label)) {
      skipped++;
      continue;
    }
    const sectionId = def.section
      ? await ensureSection(mod.api, layoutId, def.section, sections)
      : defaultSection.id;

    try {
      const field = await createField(mod.api, layoutId, sectionId, def);
      created++;
      log(`    + ${def.label}  [${def.type}] -> ${field.field_name}`);
      if (def.opts?.length) {
        await addOptions(mod.api, layoutId, field.id, def.opts);
        log(`        ${def.opts.length} options`);
      }
    } catch (e) {
      failures.push({ module: mod.api, field: def.label, error: e.message });
      log(`    ! ${def.label} FAILED — ${e.message.slice(0, 160)}`);
    }
  }
}

log(`\n${'─'.repeat(60)}`);
log(`created ${created}   skipped(existing) ${skipped}   failed ${failures.length}`);
if (failures.length) {
  log('\nFailures:');
  for (const f of failures) log(`  ${f.module}.${f.field}: ${f.error.slice(0, 200)}`);
  process.exit(1);
}
log('Schema applied.\n');
