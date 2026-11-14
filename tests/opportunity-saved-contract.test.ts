import { describe, it, expect } from 'vitest';
import { buildApiSpec } from '../scripts/generate-api-spec';
import { opportunitySavedCommand } from '../src/lib/opportunity-saved';
import { opportunitySavedDataSchema } from '../src/contracts/opportunity-saved';
import { publicContentPostSchema } from '../src/contracts/content-intake';
describe('private saved opportunity contract', () => {
  it('reads older public records without opportunity conditions', () => {
    const legacy = {
      id: 'item',
      title: 'Internship',
      summary: '',
      category: 'internship',
      geography: '',
      language: 'ru',
      url: 'https://example.org/',
      sourceName: 'Example',
      publishedAt: null,
      approvedAt: '2026-10-27T00:00:00Z',
      expiresAt: '2027-10-27T00:00:00Z',
      deadline: null,
      eventDate: null,
    };
    expect(publicContentPostSchema.parse(legacy)).toMatchObject({
      workFormat: null,
      kazakhstanEligibility: null,
      workload: null,
      compensation: null,
    });
  });
  it('documents authenticated no-store reads and the bounded owner-only commands', () => {
    const endpoint = buildApiSpec().paths['/api/opportunities/saved'];
    expect(endpoint.get.security).not.toContainEqual({});
    expect(endpoint.post.security).not.toContainEqual({});
    expect(endpoint.get.description).toContain('post:null');
    expect(endpoint.post.description).toContain('8192');
    expect(endpoint.post.description).toContain('default off');
    expect(endpoint.post.description).toContain('No external delivery');
    expect(endpoint.post.parameters).toContainEqual({ $ref: '#/components/parameters/Origin' });
    for (const example of Object.values(
      endpoint.post.requestBody.content['application/json'].examples,
    ))
      expect(opportunitySavedCommand.safeParse(example.value).success).toBe(true);
  });
  it('supports unavailable placeholders without permitting private content fields', () => {
    const row = {
      id: 'save',
      itemId: 'material',
      createdAt: '2026-10-27T00:00:00Z',
      reminderDaysBefore: null,
      note: null,
      post: null,
    };
    expect(
      opportunitySavedDataSchema.safeParse({
        favorites: [{ ...row, note: 'Подготовить портфолио' }],
        searches: [],
      }).success,
    ).toBe(true);
    // An empty or over-long note is never returned.
    for (const note of ['', 'а'.repeat(301)])
      expect(
        opportunitySavedDataSchema.safeParse({ favorites: [{ ...row, note }], searches: [] })
          .success,
      ).toBe(false);
    // Only the offered reminder offsets are valid.
    expect(
      opportunitySavedDataSchema.safeParse({
        favorites: [{ ...row, reminderDaysBefore: 3 }],
        searches: [],
      }).success,
    ).toBe(true);
    expect(
      opportunitySavedDataSchema.safeParse({
        favorites: [{ ...row, reminderDaysBefore: 5 }],
        searches: [],
      }).success,
    ).toBe(false);
    expect(opportunitySavedDataSchema.safeParse({ favorites: [row], searches: [] }).success).toBe(
      true,
    );
    expect(
      opportunitySavedDataSchema.safeParse({
        favorites: [{ ...row, title: 'hidden latest revision' }],
        searches: [],
      }).success,
    ).toBe(false);
  });
});
