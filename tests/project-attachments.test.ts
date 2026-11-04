import { describe, expect, it } from 'vitest';
import {
  validateProjectAttachment,
  MAX_ATTACHMENT_BYTES,
  isPrivateAttachmentLink,
} from '../src/lib/project-attachments';
import { mutationSchemas } from '../src/lib/validation';
import { projectAttachmentListSchema } from '../src/contracts/project-attachments';
import { buildApiSpec } from '../scripts/generate-api-spec';
import { readFileSync } from 'node:fs';
const text = new TextEncoder().encode('Обезличенный учебный результат.\n');
const validate = (filename = 'Результат.txt', mediaType = 'text/plain', bytes = text) =>
  validateProjectAttachment({ filename, mediaType, bytes });
describe('bounded attachment policy', () => {
  it('accepts declared text, PDF and real JPEG with matching extensions', () => {
    expect(validate()).toMatchObject({
      filename: 'Результат.txt',
      mediaType: 'text/plain',
      byteSize: text.length,
    });
    expect(
      validate(
        'result.PDF',
        'application/pdf',
        new TextEncoder().encode('%PDF-1.7\nSynthetic fixture\n%%EOF'),
      ).mediaType,
    ).toBe('application/pdf');
    expect(
      validate('logo.jpg', 'image/jpeg', readFileSync('public/brand/qosyl-logo.jpg')).mediaType,
    ).toBe('image/jpeg');
  });
  it('checks PNG dimensions, and treats checks as format guards rather than AV', () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    png.set([73, 72, 68, 82], 12);
    const view = new DataView(png.buffer);
    view.setUint32(16, 10);
    view.setUint32(20, 10);
    expect(validate('pixel.png', 'image/png', png).byteSize).toBe(24);
    view.setUint32(16, 16001);
    expect(() => validate('large.png', 'image/png', png)).toThrow();
  });
  it.each([
    '../a.txt',
    'folder/a.txt',
    'C:\\a.txt',
    'bad\r\nname.txt',
    'a\u202etxt.txt',
    '.hidden.txt',
    '／a.txt',
    'a'.repeat(121) + '.txt',
  ])('rejects unsafe display filename %s', (filename) => {
    expect(() => validate(filename)).toThrow();
  });
  it('rejects empty/oversized files, mismatched extensions, invalid UTF8 and binary text', () => {
    for (const [filename, mediaType, bytes] of [
      ['a.txt', 'text/plain', new Uint8Array()],
      ['a.txt', 'text/plain', new Uint8Array(MAX_ATTACHMENT_BYTES + 1)],
      ['a.pdf', 'application/pdf', text],
      ['a.exe', 'text/plain', text],
      ['a.svg', 'image/svg+xml', text],
      ['a.txt', 'text/plain', new Uint8Array([255])],
      ['a.txt', 'text/plain', new Uint8Array([65, 0, 66])],
    ] as const)
      expect(() => validate(filename, mediaType, bytes)).toThrow();
  });
  it('requires one to five unique combined results and retains old link-only calls', () => {
    const parse = (fields: Record<string, unknown>) =>
      mutationSchemas.submitDeliverable.parse({
        projectId: 'project',
        notes: 'Описание проверенного результата',
        ...fields,
      });
    expect(parse({ links: ['https://example.org/result'] })).toMatchObject({ attachmentIds: [] });
    expect(parse({ attachmentIds: ['file'] })).toMatchObject({ links: [] });
    expect(() => parse({})).toThrow();
    expect(() => parse({ attachmentIds: ['file', 'file'] })).toThrow();
    expect(() =>
      parse({ attachmentIds: ['a', 'b', 'c', 'd', 'e'], links: ['https://example.org/result'] }),
    ).toThrow();
    expect(() => parse({ links: ['https://qosyl.example/api/attachments/file'] })).toThrow();
  });
  it('keeps private attachment links out of portfolio publicLinks', () => {
    expect(isPrivateAttachmentLink('https://qosyl.example/api/%61ttachments/private')).toBe(true);
    expect(isPrivateAttachmentLink('https://qosyl.example/api//attachments/private')).toBe(true);
    expect(isPrivateAttachmentLink('https://qosyl.example//api///attachments/private')).toBe(true);
    expect(isPrivateAttachmentLink('https://qosyl.example/api/%5Cattachments/private')).toBe(true);
    expect(isPrivateAttachmentLink('https://example.org/result')).toBe(false);
    expect(
      mutationSchemas.setPortfolio.safeParse({
        projectId: 'project',
        title: 'Учебный результат',
        summary: 'Обезличенное описание результата',
        role: 'Дизайнер',
        skills: [],
        visibility: 'public',
        publicLinks: ['https://qosyl.example/api/attachments/file'],
      }).success,
    ).toBe(false);
  });
  it('rejects binary/hash data in metadata and documents binary routes and consent boundaries', () => {
    const row = {
      id: 'file',
      projectId: 'project',
      uploaderId: 'student',
      filename: 'result.txt',
      mediaType: 'text/plain',
      byteSize: 1,
      createdAt: '2026-10-27T00:00:00Z',
      submissionIds: [],
      scanStatus: 'unscanned',
    };
    expect(projectAttachmentListSchema.safeParse({ attachments: [row] }).success).toBe(true);
    expect(
      projectAttachmentListSchema.safeParse({ attachments: [{ ...row, bytes: 'secret' }] }).success,
    ).toBe(false);
    const spec = buildApiSpec();
    const upload = spec.paths['/api/projects/{id}/attachments'].post;
    expect(upload.security).not.toContainEqual({});
    expect(upload.parameters).toContainEqual({ $ref: '#/components/parameters/Origin' });
    expect(upload.description).toContain('not antivirus');
    expect(
      spec.paths['/api/attachments/{id}'].get.responses['200'].content['application/octet-stream']
        .schema.format,
    ).toBe('binary');
  });
});
