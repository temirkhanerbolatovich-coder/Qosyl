import { describe, it, expect } from 'vitest';
import { leadCommandSchema, leadQueryInput, leadConversionInput } from '../src/lib/lead-validation';
const create = () => ({
  action: 'createLead',
  kind: 'business_request',
  sourceUrl: 'https://example.org/request',
  sourceName: 'Synthetic source',
  title: 'Synthetic private request',
  summary: 'A synthetic request requiring manual verification.',
  assignedToId: 'admin',
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
describe('manual lead contract', () => {
  it('requires bounded source, evidence, assignee and future validity', () => {
    expect(leadCommandSchema.safeParse(create()).success).toBe(true);
    for (const fields of [
      { title: 'short' },
      { summary: 'short' },
      { assignedToId: '' },
      { expiresAt: new Date(Date.now() - 1000).toISOString() },
      { expiresAt: new Date(Date.now() + 91 * 86400000).toISOString() },
    ])
      expect(leadCommandSchema.safeParse({ ...create(), ...fields }).success).toBe(false);
  });
  it.each([
    'http://example.org',
    'https://user:secret@example.org',
    'https://example.org:8443/path',
  ])('rejects unsafe source URL %s', (sourceUrl) => {
    expect(leadCommandSchema.safeParse({ ...create(), sourceUrl }).success).toBe(false);
  });
  it('requires literal action, version and nontrivial manual evidence', () => {
    expect(leadCommandSchema.safeParse({ ...create(), action: 'scrapeAndContact' }).success).toBe(
      false,
    );
    expect(
      leadCommandSchema.safeParse({
        action: 'recordConsent',
        leadId: 'lead',
        expectedVersion: 1,
        clientId: 'client',
        evidence: 'short',
      }).success,
    ).toBe(false);
    expect(
      leadCommandSchema.safeParse({
        action: 'verifyLead',
        leadId: 'lead',
        expectedVersion: 0,
        reason: 'A valid verification reason.',
      }).success,
    ).toBe(false);
  });
  it('bounds pagination and filters rather than silently ignoring unknown values', () => {
    expect(leadQueryInput.parse({})).toEqual({ page: 1 });
    for (const query of [
      { page: 1.5 },
      { page: 10001 },
      { kind: 'project' },
      { status: 'published' },
    ])
      expect(leadQueryInput.safeParse(query).success).toBe(false);
  });
  it('requires explicit owner confirmation and a complete project brief', () => {
    expect(
      leadConversionInput.safeParse({
        leadId: 'lead',
        expectedVersion: 1,
        confirmation: false,
        project: {},
      }).success,
    ).toBe(false);
    expect(
      leadConversionInput.safeParse({
        leadId: 'lead',
        expectedVersion: 1,
        confirmation: true,
        project: { title: 'An incomplete brief' },
      }).success,
    ).toBe(false);
  });
});
