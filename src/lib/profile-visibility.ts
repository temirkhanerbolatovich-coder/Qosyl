import { z } from 'zod';
import { publicExperiences } from './profile-details';
import { publicProfileLinks } from './profile-links';

export const profileVisibilityFields = [
  'headline',
  'city',
  'education',
  'bio',
  'languages',
  'skills',
] as const;
export const hiddenProfileFieldsSchema = z.array(z.enum(profileVisibilityFields)).max(6);
export type ProfileVisibilityField = (typeof profileVisibilityFields)[number];
export const profileVisibilityLabels = {
  headline: ['Профессиональный заголовок', 'Кәсіби тақырып'],
  city: ['Город', 'Қала'],
  education: ['Образование и курс', 'Білім және курс'],
  bio: ['О себе', 'Өзіңіз туралы'],
  languages: ['Языки', 'Тілдер'],
  skills: ['Навыки', 'Дағдылар'],
} as const;

/** Apply before serializing a profile to any account other than its owner. */
export function visibleStudentProfile<
  T extends {
    hiddenFields: string[];
    headline: string;
    city: string;
    institution: string;
    discipline: string;
    studyYear: number | null;
    bio: string;
    languages: string[];
    skills: string[];
    experiences: unknown;
    profileLinks: unknown;
    isPublic: boolean;
  },
>(profile: T) {
  const hidden = new Set(profile.hiddenFields);
  return {
    ...profile,
    headline: hidden.has('headline') ? '' : profile.headline,
    city: hidden.has('city') ? '' : profile.city,
    institution: hidden.has('education') ? '' : profile.institution,
    discipline: hidden.has('education') ? '' : profile.discipline,
    studyYear: hidden.has('education') ? null : profile.studyYear,
    bio: hidden.has('bio') ? '' : profile.bio,
    languages: hidden.has('languages') ? [] : profile.languages,
    skills: hidden.has('skills') ? [] : profile.skills,
    experiences: publicExperiences(profile.experiences, profile.isPublic),
    profileLinks: publicProfileLinks(profile.profileLinks, profile.isPublic),
  };
}
