import { expect, it } from 'vitest';
import { hiddenProfileFieldsSchema, visibleStudentProfile } from '../src/lib/profile-visibility';
const original = {
  hiddenFields: ['headline', 'city', 'education', 'bio', 'languages', 'skills'],
  headline: 'Private headline',
  city: 'Private city',
  institution: 'Private school',
  discipline: 'Private discipline',
  studyYear: 3,
  bio: 'Private bio',
  languages: ['Private language'],
  skills: ['Private skill'],
  experiences: [],
  profileLinks: [],
  isPublic: true,
};
it('redacts all configured fields before guest and client serialization without changing owner data', () => {
  const before = structuredClone(original);
  const visible = visibleStudentProfile(original);
  expect(visible).toMatchObject({
    headline: '',
    city: '',
    institution: '',
    discipline: '',
    studyYear: null,
    bio: '',
    languages: [],
    skills: [],
  });
  expect(JSON.stringify(visible)).not.toContain('Private');
  expect(original).toEqual(before);
});
it('preserves the existing projection unless the owner hides a field', () => {
  expect(visibleStudentProfile({ ...original, hiddenFields: [] })).toEqual({
    ...original,
    hiddenFields: [],
  });
  expect(hiddenProfileFieldsSchema.safeParse(['email']).success).toBe(false);
});
