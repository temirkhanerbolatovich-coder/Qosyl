import { z } from 'zod';
import { categories } from '../lib/validation';

/** JSON wire dates, after Response.json serializes Prisma Date values. */
export const dateTimeSchema = z.iso.datetime({ offset: true });
const nullableDate = dateTimeSchema.nullable();
const text = z.string();
const id = z.string().min(1);
const count = z.number().int().nonnegative();

export const projectStatusSchema = z.enum([
  'draft',
  'pending_moderation',
  'published',
  'paused',
  'assigned',
  'in_progress',
  'submitted',
  'changes_requested',
  'accepted',
  'completed',
  'cancelled',
  'disputed',
  'expired',
]);
export const applicationStatusSchema = z.enum(['active', 'withdrawn', 'selected', 'not_selected']);
export const paymentStatusSchema = z.enum([
  'not_reported',
  'reported_paid_by_client',
  'confirmed_received_by_student',
  'disputed',
]);
export const visibilitySchema = z.enum(['private', 'public', 'redacted_public']);
export const roleSchema = z.enum(['student', 'client', 'admin']);
export const userStatusSchema = z.enum(['active', 'suspended']);
export const verificationStatusSchema = z.enum(['pending', 'verified', 'rejected']);

export const personNameSchema = z.strictObject({ id, name: text });
export const demoPersonSchema = personNameSchema.extend({ demo: z.boolean() });
export const viewerSchema = personNameSchema.extend({ roles: z.array(roleSchema) });
export const publicUserSchema = demoPersonSchema.extend({
  clientProfile: z
    .strictObject({ name: text, verificationStatus: verificationStatusSchema })
    .nullable(),
});

export const studentProfileSchema = z.strictObject({
  userId: id,
  bio: text,
  city: text,
  institution: text,
  discipline: text,
  weeklyHours: z.number().int(),
  skills: z.array(text),
  formats: z.array(text),
  isPublic: z.boolean(),
  updatedAt: dateTimeSchema,
});
export const clientProfileSchema = z.strictObject({
  userId: id,
  name: text,
  industry: text,
  city: text,
  contact: text,
  description: text,
  verificationStatus: verificationStatusSchema,
  verificationReason: text.nullable(),
  updatedAt: dateTimeSchema,
});
export const externalWorkSchema = z.strictObject({
  id,
  userId: id,
  title: text,
  description: text,
  url: text,
  createdAt: dateTimeSchema,
});

/** Stable terms snapshot; no fresh-deadline validation applies to historical versions. */
export const projectTermsSchema = z.strictObject({
  title: text,
  category: z.enum(categories),
  problem: text,
  description: text,
  deliverables: text,
  acceptanceCriteria: z.array(text),
  skills: z.array(text),
  difficulty: z.enum(['beginner_friendly', 'intermediate']),
  mode: z.enum(['remote', 'onsite', 'hybrid']),
  city: text,
  locationPrivate: text,
  contactPrivate: text,
  budgetKzt: z.number().int(),
  estimatedHours: z.number().int(),
  dueAt: dateTimeSchema,
  preferredTime: text,
});
export const privateProjectSchema = projectTermsSchema.extend({
  id,
  clientId: id,
  assignedStudentId: id.nullable(),
  status: projectStatusSchema,
  demo: z.boolean(),
  demoApplicationsAllowed: z.boolean(),
  moderationReason: text.nullable(),
  publishedAt: nullableDate,
  expiresAt: nullableDate,
  clientClosedAt: nullableDate,
  studentClosedAt: nullableDate,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export const publicProjectSchema = projectTermsSchema
  .omit({
    locationPrivate: true,
    contactPrivate: true,
  })
  .extend({
    id,
    status: projectStatusSchema,
    demo: z.boolean(),
    demoApplicationsAllowed: z.boolean(),
    publishedAt: nullableDate,
    createdAt: dateTimeSchema,
    client: publicUserSchema,
  });
/** Non-owner detail includes IDs and client status, but no private scalar project fields. */
export const publicProjectDetailSchema = publicProjectSchema.extend({
  clientId: id,
  assignedStudentId: id.nullable(),
  client: publicUserSchema.extend({ status: userStatusSchema }),
});
export const ownerProjectDetailSchema = privateProjectSchema.extend({ client: publicUserSchema });
export const projectDetailSchema = z.union([publicProjectDetailSchema, ownerProjectDetailSchema]);

export const applicationSchema = z.strictObject({
  id,
  projectId: id,
  studentId: id,
  message: text,
  links: z.array(text),
  status: applicationStatusSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export const agreementSchema = z.strictObject({
  id,
  projectId: id,
  number: z.number().int().positive(),
  snapshotJson: projectTermsSchema,
  clientApprovedAt: nullableDate,
  studentApprovedAt: nullableDate,
  createdAt: dateTimeSchema,
});
export const milestoneSchema = z.strictObject({
  id,
  projectId: id,
  title: text,
  done: z.boolean(),
  agreementNumber: z.number().int().positive(),
});
export const revisionSchema = z.strictObject({
  id,
  submissionId: id,
  notes: text,
  criteriaIndexes: z.array(count),
  createdAt: dateTimeSchema,
});
export const submissionSchema = z.strictObject({
  id,
  projectId: id,
  studentId: id,
  links: z.array(text),
  notes: text,
  createdAt: dateTimeSchema,
});
export const submissionWithRevisionsSchema = submissionSchema.extend({
  revisions: z.array(revisionSchema),
});

/** Current event payload vocabulary; extra data is rejected instead of silently stripped. */
export const eventMetadataSchema = z.strictObject({
  automatic: z.boolean().optional(),
  approve: z.boolean().optional(),
  reason: text.optional(),
  requiresRemoderation: z.boolean().optional(),
  applicationId: id.optional(),
  version: z.number().int().positive().optional(),
  milestoneId: id.optional(),
  done: z.boolean().optional(),
  submissionId: id.optional(),
  status: paymentStatusSchema.optional(),
  visibility: visibilitySchema.optional(),
});
export const eventSchema = z.strictObject({
  id,
  projectId: id,
  actorId: id.nullable(),
  action: text,
  metadataJson: eventMetadataSchema,
  createdAt: dateTimeSchema,
  actor: personNameSchema.nullable(),
});
export const paymentSchema = z.strictObject({
  projectId: id,
  status: paymentStatusSchema,
  clientPaidAt: nullableDate,
  studentReceivedAt: nullableDate,
  updatedAt: dateTimeSchema,
});
export const portfolioRecordSchema = z.strictObject({
  id,
  projectId: id,
  studentId: id,
  title: text,
  summary: text,
  role: text,
  skills: z.array(text),
  publicLinks: z.array(text),
  visibility: visibilitySchema,
  clientConsentAt: nullableDate,
  studentConsentAt: nullableDate,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export const reviewSchema = z.strictObject({
  id,
  projectId: id,
  authorId: id,
  recipientId: id,
  rating: z.number().int().min(1).max(5),
  body: text,
  createdAt: dateTimeSchema,
});
export const reviewWithAuthorSchema = reviewSchema.extend({ author: personNameSchema });
export const notificationSchema = z.strictObject({
  id,
  userId: id,
  text,
  url: text,
  readAt: nullableDate,
  createdAt: dateTimeSchema,
});
export const reportSchema = z.strictObject({
  id,
  authorId: id,
  projectId: id.nullable(),
  targetUserId: id.nullable(),
  reason: text,
  status: z.enum(['open', 'resolved']),
  resolution: text.nullable(),
  createdAt: dateTimeSchema,
  resolvedAt: nullableDate,
});
export const moderationActionSchema = z.strictObject({
  id,
  actorId: id,
  targetId: id,
  action: text,
  reason: text,
  createdAt: dateTimeSchema,
});

export type PublicProject = z.infer<typeof publicProjectSchema>;
export type PrivateProject = z.infer<typeof privateProjectSchema>;
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
