import { expect, it } from 'vitest';
import { profileLinksSchema, publicProfileLinks } from '../src/lib/profile-links';
const link = {
  service: 'github',
  label: 'Работы',
  url: 'https://github.com/example',
  isPublic: false,
};
it('accepts explicit service links and keeps private links private', () => {
  expect(profileLinksSchema.safeParse([link]).success).toBe(true);
  expect(publicProfileLinks([link], true)).toEqual([]);
  expect(publicProfileLinks([{ ...link, isPublic: true }], false)).toEqual([]);
  expect(publicProfileLinks([{ ...link, isPublic: true }], true)).toHaveLength(1);
});
it('rejects unsafe URLs, misleading services and owner or verification fields', () => {
  for (const url of [
    'https://localhost/',
    'https://127.0.0.1',
    'javascript:alert(1)',
    'https://github.com.evil.example',
    'https://evil.example',
  ])
    expect(profileLinksSchema.safeParse([{ ...link, url }]).success).toBe(false);
  expect(profileLinksSchema.safeParse([{ ...link, verified: true }]).success).toBe(false);
  expect(profileLinksSchema.safeParse(Array(7).fill(link)).success).toBe(false);
});
