import { z } from 'zod';
export const avatarVisibilityInput = z.strictObject({
  revision: z.string().uuid(),
  isPublic: z.boolean(),
});
export const avatarDeleteInput = z.strictObject({ revision: z.string().uuid() });
export const avatarResponse = z.strictObject({
  data: z.strictObject({
    avatar: z.strictObject({ revision: z.string().uuid(), isPublic: z.boolean() }).nullable(),
  }),
});
