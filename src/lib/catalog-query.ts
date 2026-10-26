import { z } from 'zod';
import { categories } from './validation';

export const platformViews = [
  'catalog',
  'project',
  'dashboard',
  'portfolio',
  'work',
  'applications',
  'admin',
  'pilotMetrics',
  'pilotCosts',
  'backgroundJobs',
] as const;
export const platformViewSchema = z.enum(platformViews);

const integer = (minimum: number, maximum: number) =>
  z.coerce.number().int().min(minimum).max(maximum).optional();
const filterText = (maximum: number) => z.string().trim().max(maximum).optional();
const deadline = z
  .string()
  .refine((value) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }
    return z.iso.datetime({ offset: true }).safeParse(value).success;
  }, 'Укажите существующую дату YYYY-MM-DD или ISO datetime с часовым поясом.')
  .optional();

/** Limits match stored project fields; all dates are validated before constructing Prisma input. */
export const catalogQuerySchema = z
  .object({
    q: filterText(150),
    category: z.enum(categories).optional(),
    skill: filterText(50),
    mode: z.enum(['remote', 'onsite', 'hybrid']).optional(),
    city: filterText(120),
    minBudget: integer(0, 10_000_000),
    maxBudget: integer(0, 10_000_000),
    difficulty: z.enum(['beginner_friendly', 'intermediate']).optional(),
    maxHours: integer(0, 160),
    dueBefore: deadline,
    sort: z.enum(['newest', 'relevance']).default('newest'),
    page: integer(1, 10_000).default(1),
  })
  .refine(
    (value) =>
      value.minBudget === undefined ||
      value.maxBudget === undefined ||
      value.minBudget <= value.maxBudget,
    { path: ['maxBudget'], message: 'Максимальный бюджет меньше минимального.' },
  );

export function parseCatalogQuery(params: URLSearchParams) {
  const values = Object.fromEntries(
    [...params.entries()].filter(([, value]) => value.trim() !== ''),
  );
  const parsed = catalogQuerySchema.parse(values);
  const due = parsed.dueBefore;
  return {
    ...parsed,
    dueBefore: due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? `${due}T23:59:59.999+05:00` : due,
  };
}
