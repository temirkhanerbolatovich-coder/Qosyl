import { z } from 'zod';

/** Links are opened by the user, never fetched by the server. */
export const safePortfolioUrl = z
  .string()
  .trim()
  .max(2_000)
  .url()
  .refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const local =
      !hostname.includes('.') ||
      ['localhost', 'local', 'internal', 'lan', 'home'].some(
        (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
      );
    const literal = hostname.startsWith('[') || /^\d+(\.\d+){3}$/.test(hostname);
    return url.protocol === 'https:' && !url.username && !url.password && !local && !literal;
  }, 'Используйте публичный HTTPS-домен без логина и пароля.');

export const profileLinkServices = [
  'website',
  'linkedin',
  'github',
  'behance',
  'dribbble',
  'other',
] as const;
export const profileLinkLabels = {
  website: ['Личный сайт', 'Жеке сайт'],
  linkedin: ['LinkedIn', 'LinkedIn'],
  github: ['GitHub', 'GitHub'],
  behance: ['Behance', 'Behance'],
  dribbble: ['Dribbble', 'Dribbble'],
  other: ['Другая работа', 'Басқа жұмыс'],
} as const;
const serviceDomains = {
  linkedin: 'linkedin.com',
  github: 'github.com',
  behance: 'behance.net',
  dribbble: 'dribbble.com',
};
export const profileLinkSchema = z
  .strictObject({
    service: z.enum(profileLinkServices),
    label: z.string().trim().max(80),
    url: safePortfolioUrl,
    isPublic: z.boolean(),
  })
  .refine(
    (link) => {
      if (!(link.service in serviceDomains)) return true;
      let url: URL;
      try {
        url = new URL(link.url);
      } catch {
        return false;
      }
      const host = url.hostname.toLowerCase().replace(/\.$/, '');
      const domain = serviceDomains[link.service as keyof typeof serviceDomains];
      return host === domain || host.endsWith(`.${domain}`);
    },
    { path: ['url'], message: 'Домен ссылки должен соответствовать выбранному сервису.' },
  );
export const profileLinksSchema = z.array(profileLinkSchema).max(6);
export type ProfileLink = z.infer<typeof profileLinkSchema>;
export function readProfileLinks(value: unknown): ProfileLink[] {
  const parsed = profileLinksSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}
export function publicProfileLinks(value: unknown, profileIsPublic: boolean): ProfileLink[] {
  return profileIsPublic ? readProfileLinks(value).filter((link) => link.isPublic) : [];
}
