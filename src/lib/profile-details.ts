import { z } from 'zod';

export const experienceKinds = ['employment', 'academic', 'volunteer', 'personal'] as const;
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const experienceSchema = z
  .strictObject({
    organisation: z.string().trim().min(1).max(120),
    role: z.string().trim().min(1).max(120),
    kind: z.enum(experienceKinds),
    employment: z.string().trim().max(80),
    startMonth: month,
    endMonth: z.union([month, z.literal('')]),
    tasks: z.string().trim().max(500),
    results: z.string().trim().max(500),
    isPublic: z.boolean(),
  })
  .refine((value) => !value.endMonth || value.endMonth >= value.startMonth, {
    path: ['endMonth'],
    message: 'Окончание не может быть раньше начала.',
  });
export const experiencesSchema = z.array(experienceSchema).max(5);
export type StudentExperience = z.infer<typeof experienceSchema>;

export function readExperiences(value: unknown): StudentExperience[] {
  const result = experiencesSchema.safeParse(value);
  return result.success ? result.data : [];
}

/** All projections to another account must use the same explicit publication rule. */
export function publicExperiences(value: unknown, profileIsPublic: boolean): StudentExperience[] {
  return profileIsPublic ? readExperiences(value).filter((item) => item.isPublic) : [];
}

export const experienceKindLabels = {
  employment: ['Работа', 'Жұмыс'],
  academic: ['Учебный проект', 'Оқу жобасы'],
  volunteer: ['Волонтёрство', 'Еріктілік'],
  personal: ['Личный проект', 'Жеке жоба'],
} as const;
