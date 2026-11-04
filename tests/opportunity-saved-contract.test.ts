import { describe, it, expect } from 'vitest';
import { buildApiSpec } from '../scripts/generate-api-spec';
import { opportunitySavedCommand } from '../src/lib/opportunity-saved';
import { opportunitySavedDataSchema } from '../src/contracts/opportunity-saved';
describe('private saved opportunity contract', () => {
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
    const row = { id: 'save', itemId: 'material', createdAt: '2026-10-27T00:00:00Z', post: null };
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
