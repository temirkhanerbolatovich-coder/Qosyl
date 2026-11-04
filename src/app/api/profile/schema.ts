import { z } from 'zod';
import { hiddenProfileFieldsSchema } from '@/lib/profile-visibility';
import { experiencesSchema } from '@/lib/profile-details';

import { safePortfolioUrl, profileLinksSchema } from '@/lib/profile-links';
export { safePortfolioUrl } from '@/lib/profile-links';

export const profileInput = z
  .object({
    role: z.enum(['student', 'client']),
    name: z.string().trim().min(2).max(100),
    city: z.string().trim().min(2).max(100),
    bio: z.string().trim().max(1_500).optional(),
    headline: z.string().trim().max(120).optional(),
    studyYear: z.number().int().min(1).max(8).nullable().optional(),
    languages: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
    experiences: experiencesSchema.optional(),
    profileLinks: profileLinksSchema.optional(),
    hiddenFields: hiddenProfileFieldsSchema.optional(),
    institution: z.string().trim().max(150).optional(),
    discipline: z.string().trim().max(100).optional(),
    weeklyHours: z.number().int().min(1).max(40).optional(),
    skills: z.array(z.string().trim().min(1).max(50)).max(15).optional(),
    formats: z
      .array(z.enum(['remote', 'onsite', 'hybrid']))
      .min(1)
      .max(3)
      .optional(),
    isPublic: z.boolean().optional(),
    externalWorks: z
      .array(
        z
          .object({
            title: z.string().trim().min(2).max(150),
            description: z.string().trim().max(1_000).default(''),
            url: safePortfolioUrl,
          })
          .strict(),
      )
      .max(10)
      .optional(),
    organisationName: z.string().trim().max(150).optional(),
    industry: z.string().trim().max(100).optional(),
    contact: z.string().trim().max(300).optional(),
    description: z.string().trim().max(1_500).optional(),
  })
  .strict();
