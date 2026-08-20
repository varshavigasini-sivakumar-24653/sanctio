// Shared between the TopBar's Filter/quarter popovers and the Pipeline board, so
// both read the same URL search params and never drift on what a filter means.

import { slaState } from './format';

export const SLA_STATES = ['good', 'warning', 'serious', 'critical', 'neutral'];
export const SLA_STATE_LABEL = {
  good: 'On track',
  warning: 'Due soon',
  serious: 'Overdue',
  critical: 'Breached',
  neutral: 'No SLA',
};

/** A project's real `created_time`, bucketed into calendar quarters — not a
 * simulated date range. Most demo files land in the same quarter, which is the
 * honest answer for a portfolio seeded in one sitting, not a bug. */
export function quarterKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

export function quarterLabel(key) {
  const [y, q] = String(key).split('-Q');
  return `Q${q} ${y}`;
}

export function parsePipelineFilters(searchParams) {
  const sla = searchParams.get('sla');
  const sector = searchParams.get('sector');
  return {
    sla: sla ? sla.split(',').filter(Boolean) : [],
    sector: sector ? sector.split(',').filter(Boolean) : [],
    quarter: searchParams.get('quarter') || 'all',
  };
}

export function pipelineFilterCount(filters) {
  return filters.sla.length + filters.sector.length;
}

export function applyPipelineFilters(loans, filters) {
  return loans.filter((l) => {
    if (filters.sla.length && !filters.sla.includes(slaState(l.daysInStage, l.slaDays))) return false;
    if (filters.sector.length && l.sector && !filters.sector.includes(l.sector)) return false;
    if (filters.quarter !== 'all' && quarterKey(l.originatedOn) !== filters.quarter) return false;
    return true;
  });
}

/** Toggle one value inside a comma-joined search-param list. */
export function toggleParamValue(searchParams, key, value) {
  const next = new URLSearchParams(searchParams);
  const current = new Set((next.get(key) || '').split(',').filter(Boolean));
  if (current.has(value)) current.delete(value);
  else current.add(value);
  if (current.size) next.set(key, [...current].join(','));
  else next.delete(key);
  return next;
}
