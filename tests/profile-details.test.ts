import { describe, it, expect } from 'vitest';
import { profileInput } from '../src/app/api/profile/schema';
import { experienceSchema, readExperiences, publicExperiences } from '../src/lib/profile-details';
const base = { role: 'student', name: 'Студент', city: 'Семей' };
const entry = {
  organisation: 'Учебный проект',
  role: 'Аналитик',
  kind: 'academic',
  employment: '',
  startMonth: '2025-09',
  endMonth: '',
  tasks: 'Проверка данных',
  results: '',
  isPublic: false,
};
describe('student profile details', () => {
  it('filters private entries in guest and applicant projections', () => {
    expect(publicExperiences([entry], true)).toEqual([]);
    expect(publicExperiences([{ ...entry, isPublic: true }], false)).toEqual([]);
    expect(publicExperiences([entry, { ...entry, isPublic: true }], true)).toEqual([
      { ...entry, isPublic: true },
    ]);
  });
  it('keeps optional details optional and accepts an empty experience collection', () => {
    expect(profileInput.safeParse(base).success).toBe(true);
    expect(
      profileInput.safeParse({ ...base, studyYear: null, languages: [], experiences: [] }).success,
    ).toBe(true);
  });
  it('validates course, languages, month ordering, and list size', () => {
    for (const patch of [
      { studyYear: 9 },
      { languages: [''] },
      { experiences: [{ ...entry, endMonth: '2025-08' }] },
      { experiences: [{ ...entry, startMonth: '2025-13' }] },
      { experiences: Array(6).fill(entry) },
    ]) {
      expect(profileInput.safeParse({ ...base, ...patch }).success).toBe(false);
    }
  });
  it('requires explicit visibility and rejects verification and owner spoofing', () => {
    expect(experienceSchema.safeParse({ ...entry, isPublic: undefined }).success).toBe(false);
    for (const patch of [{ verified: true }, { userId: 'other' }, { kind: 'platform_verified' }]) {
      expect(experienceSchema.safeParse({ ...entry, ...patch }).success).toBe(false);
    }
    expect(profileInput.safeParse({ ...base, userId: 'other', experiences: [entry] }).success).toBe(
      false,
    );
  });
  it('fails closed for invalid stored data', () => {
    expect(readExperiences({ unsafe: true })).toEqual([]);
    expect(readExperiences([entry])).toEqual([entry]);
  });
});
