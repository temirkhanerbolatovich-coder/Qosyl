import { z } from 'zod';
import type { Action } from '../lib/validation';
import {
  agreementSchema,
  applicationSchema,
  clientProfileSchema,
  dateTimeSchema,
  demoPersonSchema,
  eventSchema,
  externalWorkSchema,
  milestoneSchema,
  moderationActionSchema,
  notificationSchema,
  ownerProjectDetailSchema,
  paymentSchema,
  personNameSchema,
  portfolioRecordSchema,
  privateProjectSchema,
  projectDetailSchema,
  projectStatusSchema,
  publicProjectDetailSchema,
  publicProjectSchema,
  reportSchema,
  reviewWithAuthorSchema,
  roleSchema,
  studentProfileSchema,
  submissionSchema,
  submissionWithRevisionsSchema,
  userStatusSchema,
  viewerSchema,
} from './api-entities';
import { categories } from '../lib/validation';
import { pilotCostsDataSchema } from './pilot-costs';
import { backgroundJobsDataSchema } from './background-jobs';

export * from './api-entities';

const count = z.number().int().nonnegative();
export const okDataSchema = z.strictObject({ ok: z.literal(true) });
export const catalogDataSchema = z.strictObject({
  projects: z.array(publicProjectSchema),
  total: count,
  categories: z.array(z.enum(categories)),
  page: z.number().int().min(1).max(10000),
});
export const projectDataSchema = z.strictObject({
  project: projectDetailSchema,
  application: applicationSchema.nullable(),
  canApply: z.boolean(),
});
/** Use these contextual projections when verifying public or owner responses explicitly. */
export const publicProjectDataSchema = projectDataSchema.extend({
  project: publicProjectDetailSchema,
});
export const ownerProjectDataSchema = projectDataSchema.extend({
  project: ownerProjectDetailSchema,
});

export const dashboardProjectSchema = privateProjectSchema.extend({
  payment: paymentSchema.nullable(),
  _count: z.strictObject({ applications: count }),
});
export const dashboardPortfolioSchema = portfolioRecordSchema.extend({
  project: z.strictObject({
    category: z.enum(categories),
    demo: z.boolean(),
    status: projectStatusSchema,
  }),
});
export const dashboardApplicationSchema = applicationSchema.extend({
  project: publicProjectSchema,
});
export const dashboardDataSchema = z.strictObject({
  user: viewerSchema,
  currentUser: viewerSchema,
  projects: z.array(dashboardProjectSchema),
  applications: z.array(dashboardApplicationSchema),
  notifications: z.array(notificationSchema),
  portfolio: z.array(dashboardPortfolioSchema),
});

export const workProjectSchema = privateProjectSchema.extend({
  client: publicProjectSchema.shape.client,
  assignedStudent: personNameSchema.nullable(),
  agreements: z.array(agreementSchema),
  milestones: z.array(milestoneSchema),
  submissions: z.array(submissionWithRevisionsSchema),
  events: z.array(eventSchema),
  payment: paymentSchema.nullable(),
  portfolio: portfolioRecordSchema.nullable(),
  reviews: z.array(reviewWithAuthorSchema),
});
export const workDataSchema = z.strictObject({
  project: workProjectSchema,
  currentUser: viewerSchema,
  agreements: z.array(agreementSchema),
  milestones: z.array(milestoneSchema),
  submissions: z.array(submissionWithRevisionsSchema),
  events: z.array(eventSchema),
  payment: paymentSchema.nullable(),
  portfolio: portfolioRecordSchema.nullable(),
  reviews: z.array(reviewWithAuthorSchema),
});
export const applicantSchema = demoPersonSchema.extend({
  studentProfile: studentProfileSchema.nullable(),
  externalWorks: z.array(externalWorkSchema),
});
export const applicantApplicationSchema = applicationSchema.extend({ student: applicantSchema });
export const applicationsDataSchema = z.strictObject({
  project: privateProjectSchema,
  applications: z.array(applicantApplicationSchema),
});

export const adminProjectSchema = publicProjectSchema.extend({
  moderationReason: z.string().nullable(),
});
export const adminClientSchema = clientProfileSchema.extend({ user: demoPersonSchema });
export const adminReportSchema = reportSchema.extend({
  author: personNameSchema,
  project: z.strictObject({ id: z.string().min(1), title: z.string() }).nullable(),
});
export const adminUserSchema = viewerSchema.extend({
  status: userStatusSchema,
  statusReason: z.string().nullable(),
  demo: z.boolean(),
  createdAt: dateTimeSchema,
});
export const adminAuditSchema = moderationActionSchema.extend({
  actor: z.strictObject({ name: z.string() }),
});
export const adminDataSchema = z.strictObject({
  projects: z.array(adminProjectSchema),
  clients: z.array(adminClientSchema),
  reports: z.array(adminReportSchema),
  users: z.array(adminUserSchema),
  audit: z.array(adminAuditSchema),
  stats: z.strictObject({
    completed: count,
    paid: count,
    firstPaidStudents: count,
    pendingModeration: count,
    openReports: count,
  }),
});

export const pilotStageSchema = z.strictObject({
  id: z.enum(['published', 'applied', 'selected', 'started', 'submitted', 'accepted', 'paid']),
  label: z.string(),
  count,
  shareOfPublished: z.number().min(0).max(1).nullable(),
});
export const pilotMetricsDataSchema = z.strictObject({
  asOf: dateTimeSchema,
  stages: z.array(pilotStageSchema),
  views: count.nullable(),
  engagement: z.strictObject({
    startedAt: dateTimeSchema.nullable(),
    viewedPairs: count,
    appliedPairs: count,
    conversionRate: z.number().min(0).max(1).nullable(),
    viewedProjects: count,
    coverage: z.literal('tracked_authenticated_students'),
  }),
  repeat30Days: z.strictObject({
    windowDays: z.literal(30),
    undatedClients: count,
    matureClients: count,
    immatureClients: count,
    repeatClients: count,
    repeatRate: z.number().min(0).max(1).nullable(),
    cohorts: z.array(
      z.strictObject({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        matureClients: count,
        immatureClients: count,
        repeatClients: count,
        repeatRate: z.number().min(0).max(1).nullable(),
      }),
    ),
  }),
  firstPaidStudents: count,
  repeatClients: count,
  disputed: count,
  cancelled: count,
});

export const viewDataSchemas = {
  catalog: catalogDataSchema,
  project: projectDataSchema,
  dashboard: dashboardDataSchema,
  portfolio: dashboardDataSchema,
  work: workDataSchema,
  applications: applicationsDataSchema,
  admin: adminDataSchema,
  pilotMetrics: pilotMetricsDataSchema,
  pilotCosts: pilotCostsDataSchema,
  backgroundJobs: backgroundJobsDataSchema,
} as const;

export const commandDataSchemas = {
  recordProjectView: okDataSchema,
  recordPilotCost: okDataSchema,
  voidPilotCost: okDataSchema,
  createProject: privateProjectSchema,
  updateProject: privateProjectSchema,
  submitForModeration: okDataSchema,
  moderateProject: okDataSchema,
  applyToProject: applicationSchema,
  updateApplication: okDataSchema,
  withdrawApplication: okDataSchema,
  selectApplicant: okDataSchema,
  approveAgreement: okDataSchema,
  proposeAgreement: okDataSchema,
  toggleMilestone: okDataSchema,
  submitDeliverable: submissionSchema,
  requestChanges: okDataSchema,
  acceptSubmission: okDataSchema,
  acknowledgePayment: okDataSchema,
  closeProject: okDataSchema,
  cancelProject: okDataSchema,
  disputeProject: okDataSchema,
  setPortfolio: okDataSchema,
  consentPortfolio: okDataSchema,
  createReview: okDataSchema,
  fileComplaint: okDataSchema,
  moderateClient: okDataSchema,
  suspendUser: okDataSchema,
  resolveReport: okDataSchema,
  pauseProject: okDataSchema,
  markNotification: okDataSchema,
} as const satisfies Record<Action, z.ZodType>;

export const profileDataSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  email: z.string(),
  roles: z.array(roleSchema),
  demo: z.boolean(),
  studentProfile: studentProfileSchema.nullable(),
  clientProfile: clientProfileSchema.nullable(),
  externalWorks: z.array(externalWorkSchema),
});
export const profileSavedDataSchema = z.strictObject({
  saved: z.literal(true),
  role: z.enum(['student', 'client']),
});
export const okHealthSchema = z.strictObject({ status: z.literal('ok') });
export const unavailableHealthSchema = z.strictObject({ status: z.literal('unavailable') });
export const healthDataSchema = z.union([okHealthSchema, unavailableHealthSchema]);

export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
]);
export const apiErrorSchema = z.strictObject({
  error: z.string(),
  code: apiErrorCodeSchema,
  fields: z.record(z.string(), z.array(z.string())).optional(),
});

export type PlatformView = keyof typeof viewDataSchemas;
export type ViewData<V extends PlatformView> = z.infer<(typeof viewDataSchemas)[V]>;
export type CommandData<A extends Action> = z.infer<(typeof commandDataSchemas)[A]>;
export type ProfileData = z.infer<typeof profileDataSchema>;
export type ProfileSavedData = z.infer<typeof profileSavedDataSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
