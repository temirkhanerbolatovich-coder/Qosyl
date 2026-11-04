import { describe, it, expect } from 'vitest';
import { caseCommand, caseFields } from '../src/lib/portfolio-case';
const data = {
  title: 'Учебный проект',
  description: '',
  role: '',
  problem: '',
  contribution: '',
  period: '2026',
  tools: [],
  result: '',
  url: '',
  links: [],
  visibility: 'draft',
  publicationAllowed: false,
};
describe('Independent portfolio contract', () => {
  it('accepts a draft without links and requires permission for public output', () => {
    expect(caseFields.safeParse(data).success).toBe(true);
    expect(caseFields.safeParse({ ...data, visibility: 'public' }).success).toBe(false);
    expect(
      caseFields.safeParse({ ...data, visibility: 'public', publicationAllowed: true }).success,
    ).toBe(true);
  });
  it('rejects origin, ownership and verification spoofing', () => {
    for (const extra of [
      { userId: 'victim' },
      { source: 'platform_verified' },
      { projectId: 'project' },
      { clientConsentAt: new Date().toISOString() },
    ])
      expect(caseCommand.safeParse({ action: 'create', data: { ...data, ...extra } }).success).toBe(
        false,
      );
  });
  it('blocks unsafe links and private attachments even on a public HTTPS domain', () => {
    for (const url of [
      'javascript:alert(1)',
      'http://example.com',
      'https://127.0.0.1/x',
      'https://example.com/api/attachments/secret',
      'https://example.com/api%2Fattachments/secret',
    ])
      expect(caseFields.safeParse({ ...data, links: [url] }).success).toBe(false);
  });
  it('bounds text, tools and links and requires a revision for edits', () => {
    expect(caseFields.safeParse({ ...data, contribution: 'a'.repeat(1501) }).success).toBe(false);
    expect(caseFields.safeParse({ ...data, tools: Array(16).fill('Tool') }).success).toBe(false);
    expect(caseCommand.safeParse({ action: 'update', id: 'case', data }).success).toBe(false);
  });
});
