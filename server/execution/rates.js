/**
 * Server-side rate resolution for the execution module.
 *
 * Rates are stored per user in `user_data.rates` as a JSON blob. The project
 * owner's rate card is what governs all time entries on that project —
 * editors logging time still use the owner's rates, not their own. This
 * matches how the rest of the app computes project cost.
 *
 * The fallback shape (empty INTERNAL_RATE, empty CONSULTANT_RATES) is
 * intentional: a brand-new user may not have saved any rates yet. Returning
 * zero is preferable to crashing a POST /time call during their first
 * exploration of the module.
 */
import { db } from '../db.js';

/**
 * Fetch the rates configured by the owner of a project. Never throws.
 * @param {string} projectId
 * @returns {{ INTERNAL_RATE: number, CONSULTANT_RATES: object }}
 */
export function loadProjectRates(projectId) {
  const row = db.prepare(`
    SELECT ud.rates FROM user_data ud
    JOIN projects p ON p.owner_id = ud.user_id
    WHERE p.id = ?
  `).get(projectId);
  const fallback = { INTERNAL_RATE: 0, CONSULTANT_RATES: {} };
  if (!row || !row.rates) return fallback;
  try {
    const parsed = JSON.parse(row.rates);
    return {
      INTERNAL_RATE: Number(parsed.INTERNAL_RATE) || 0,
      CONSULTANT_RATES: parsed.CONSULTANT_RATES || {},
    };
  } catch {
    return fallback;
  }
}

/**
 * Same convention as src/lib/costCalculations.js#getHourlyRate: internal
 * employees flat-rate, consultants keyed by role + level. Never throws,
 * returns 0 when unknown.
 *
 * @param {{ INTERNAL_RATE: number, CONSULTANT_RATES: object }} rates
 * @param {string} role
 * @param {string} level
 * @returns {number}
 */
export function getHourlyRate(rates, role, level) {
  if (level === 'Employé interne') return rates.INTERNAL_RATE || 0;
  return rates.CONSULTANT_RATES?.[role]?.[level] || 0;
}
