import { z } from 'zod';
import {
  attachmentMediaTypes,
  MAX_ATTACHMENT_BYTES,
  MAX_PROJECT_ATTACHMENTS,
} from '@/lib/project-attachments';
const id = z.string().min(1).max(100);
export const projectAttachmentSchema = z.strictObject({
  id,
  projectId: id,
  uploaderId: id,
  filename: z.string().min(1).max(120),
  mediaType: z.enum(attachmentMediaTypes),
  byteSize: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  createdAt: z.iso.datetime({ offset: true }),
  submissionIds: z.array(id),
  scanStatus: z.literal('unscanned'),
});
export const projectAttachmentListSchema = z.strictObject({
  attachments: z.array(projectAttachmentSchema).max(MAX_PROJECT_ATTACHMENTS),
});
export const projectAttachmentMutationSchema = z.strictObject({
  attachment: projectAttachmentSchema,
});
export const projectAttachmentDeleteSchema = z.strictObject({ removed: z.literal(true) });
export type ProjectAttachment = z.infer<typeof projectAttachmentSchema>;
