import { z } from 'zod';
import { recordPilotCostInput, voidPilotCostInput } from './pilot-cost-validation';
z.config(z.locales.ru());

export const categories = [
  'design',
  'spreadsheets',
  'analytics',
  'writing',
  'it',
  'admin',
  'smm',
] as const;
export const safeUrl = z
  .string()
  .trim()
  .max(1500)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Используйте HTTPS-ссылку без логина и пароля.');
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const projectFields = z
  .object({
    title: text(8, 140),
    category: z.enum(categories),
    problem: text(10, 1500),
    description: text(20, 10000),
    deliverables: text(10, 3000),
    acceptanceCriteria: z.array(text(3, 500)).min(1).max(15),
    skills: z.array(text(1, 50)).max(15).default([]),
    difficulty: z.enum(['beginner_friendly', 'intermediate']),
    mode: z.enum(['remote', 'onsite', 'hybrid']),
    city: text(0, 120).default(''),
    locationPrivate: text(0, 500).default(''),
    contactPrivate: text(0, 300).default(''),
    budgetKzt: z.coerce.number().int().min(1).max(10000000),
    estimatedHours: z.coerce.number().int().min(1).max(160),
    dueAt: z.coerce
      .date()
      .refine((date) => date.getTime() > Date.now(), 'Срок должен быть в будущем.'),
    preferredTime: text(0, 300).default(''),
  })
  .refine((value) => value.mode === 'remote' || value.city.length > 0, {
    message: 'Для очной работы укажите город.',
    path: ['city'],
  });

const id = text(1, 100);
const projectId = z.object({ projectId: id });
const reason = text(10, 2000);
const links = z.array(safeUrl).max(5);
export const mutationSchemas = {
  recordProjectView: projectId,
  recordPilotCost: recordPilotCostInput,
  voidPilotCost: voidPilotCostInput,
  createProject: projectFields,
  updateProject: projectFields.and(projectId),
  submitForModeration: projectId,
  moderateProject: projectId.extend({ approve: z.boolean(), reason: text(0, 2000).default('') }),
  applyToProject: projectId.extend({ message: text(15, 2000), links: links.default([]) }),
  updateApplication: z.object({
    applicationId: id,
    message: text(15, 2000),
    links: links.default([]),
  }),
  withdrawApplication: z.object({ applicationId: id }),
  selectApplicant: projectId.extend({ applicationId: id }),
  approveAgreement: projectId.extend({ agreementId: id }),
  proposeAgreement: projectFields.and(projectId),
  toggleMilestone: projectId.extend({ milestoneId: id }),
  submitDeliverable: projectId.extend({ links: links.min(1), notes: text(10, 4000) }),
  requestChanges: projectId.extend({
    submissionId: id,
    notes: reason,
    criteriaIndexes: z.array(z.number().int().min(0)).min(1).max(15),
  }),
  acceptSubmission: projectId.extend({ submissionId: id }),
  acknowledgePayment: projectId.extend({
    status: z.enum(['reported_paid_by_client', 'confirmed_received_by_student', 'disputed']),
  }),
  closeProject: projectId,
  cancelProject: projectId.extend({ reason }),
  disputeProject: projectId.extend({ reason }),
  setPortfolio: projectId.extend({
    title: text(5, 140),
    summary: text(10, 3000),
    role: text(2, 150),
    skills: z.array(text(1, 50)).max(15),
    publicLinks: links.default([]),
    visibility: z.enum(['private', 'public', 'redacted_public']),
  }),
  consentPortfolio: projectId.extend({ expectedUpdatedAt: z.string().datetime() }),
  createReview: projectId.extend({ rating: z.number().int().min(1).max(5), body: text(10, 1500) }),
  fileComplaint: z
    .object({ projectId: id.optional(), targetUserId: id.optional(), reason })
    .refine((value) => !!value.projectId || !!value.targetUserId, 'Укажите объект жалобы.'),
  moderateClient: z.object({ userId: id, approve: z.boolean(), reason: text(0, 2000).default('') }),
  suspendUser: z.object({ userId: id, suspend: z.boolean(), reason }),
  resolveReport: z.object({ reportId: id, resolution: reason }),
  pauseProject: projectId.extend({ reason }),
  markNotification: z.object({ notificationId: id }),
};
export type Action = keyof typeof mutationSchemas;
export type ProjectInput = z.infer<typeof projectFields>;
