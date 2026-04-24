/**
 * Zod validation schemas for the execution module.
 *
 * Design notes:
 *   - `create` schemas require the minimum: title + status (status is
 *     validated separately against project_statuses at the route layer).
 *   - `update` schemas are `.partial()` so clients can PATCH-style update
 *     any single field. Everything stays strict on types.
 *   - Priority is an enum rather than free text so Kanban badges can style
 *     consistently across projects.
 */
import { z } from 'zod';

const priority = z.enum(['low', 'medium', 'high', 'critical']);
const nonEmptyTitle = z.string().trim().min(1).max(200);
const description = z.string().max(10_000).optional().nullable();
const estimateHours = z.number().positive().max(10_000).optional().nullable();
const phaseIdList = z.array(z.string().min(1)).optional();

// --- Epic ---

export const epicCreateSchema = z.object({
  title: nonEmptyTitle,
  status: z.string().min(1),
  priority: priority.optional(),
  description,
  milestone_id: z.string().nullish(),
  phase_ids: phaseIdList,
});

export const epicUpdateSchema = z.object({
  title: nonEmptyTitle.optional(),
  status: z.string().min(1).optional(),
  priority: priority.optional(),
  description,
  milestone_id: z.string().nullish(),
  phase_ids: phaseIdList,
});

// --- Story ---

export const storyCreateSchema = z.object({
  title: nonEmptyTitle,
  status: z.string().min(1),
  priority: priority.optional(),
  description,
  estimate_hours: estimateHours,
});

export const storyUpdateSchema = z.object({
  title: nonEmptyTitle.optional(),
  status: z.string().min(1).optional(),
  priority: priority.optional(),
  description,
  estimate_hours: estimateHours,
});

// --- Task ---

export const taskCreateSchema = z.object({
  title: nonEmptyTitle,
  status: z.string().min(1),
  priority: priority.optional(),
  description,
  assignee_id: z.number().int().positive().nullish(),
  estimate_hours: estimateHours,
});

export const taskUpdateSchema = z.object({
  title: nonEmptyTitle.optional(),
  status: z.string().min(1).optional(),
  priority: priority.optional(),
  description,
  assignee_id: z.number().int().positive().nullish(),
  estimate_hours: estimateHours,
});

// --- Transition ---

export const transitionSchema = z.object({
  to: z.string().min(1),
});
