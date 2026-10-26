import { z } from 'zod';

export const safePortfolioUrl = z
  .string()
  .trim()
  .max(2_000)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Используйте HTTPS-ссылку без логина и пароля.');

export const profileInput = z
  .object({
    role: z.enum(['student', 'client']),
    name: z.string().trim().min(2).max(100),
    city: z.string().trim().min(2).max(100),
    bio: z.string().trim().max(1_500).optional(),
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
