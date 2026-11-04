import { z } from 'zod';
import { publicContentPostSchema } from './content-intake';
import { savedOpportunityFilters, opportunityNotificationFrequency } from '@/lib/opportunity-saved';
const id = z.string().min(1),
  date = z.iso.datetime({ offset: true });
export const opportunitySavedDataSchema = z.strictObject({
  favorites: z
    .array(
      z.strictObject({ id, itemId: id, createdAt: date, post: publicContentPostSchema.nullable() }),
    )
    .max(100),
  searches: z
    .array(
      z.strictObject({
        id,
        name: z.string(),
        filters: savedOpportunityFilters,
        createdAt: date,
        notificationFrequency: opportunityNotificationFrequency,
        nextNotificationAt: date.nullable(),
      }),
    )
    .max(20),
});
export const opportunitySavedMutationSchema = z.strictObject({ saved: z.literal(true) });
export type OpportunitySavedData = z.infer<typeof opportunitySavedDataSchema>;
