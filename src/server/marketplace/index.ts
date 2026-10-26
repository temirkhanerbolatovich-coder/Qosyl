import 'server-only';
import { Prisma, type User } from '@prisma/client';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { assert } from '@/lib/permissions';
import { mutationSchemas, type Action } from '@/lib/validation';
import { platformViewSchema } from '@/lib/catalog-query';
import { rate } from './shared';
import { projectsCommands } from './commands/projects';
import { applicationsCommands } from './commands/applications';
import { workCommands } from './commands/work';
import { portfolioCommands } from './commands/portfolio';
import { moderationCommands } from './commands/moderation';
import { notificationsCommands } from './commands/notifications';
import { publicQueries } from './queries/public';
import { accountQueries } from './queries/account';
import { adminQueries } from './queries/admin';
import { recordProjectView } from '@/server/pilot/views';
import { recordPilotCost, voidPilotCost, queryPilotCosts } from '@/server/pilot/costs';
import { queryBackgroundJobs } from '@/server/lifecycle/status';

const commandHandlers = {
  recordProjectView: (tx, _action, raw, user) => recordProjectView(tx, raw, user),
  recordPilotCost: (tx, _action, raw, user) => recordPilotCost(tx, raw, user),
  voidPilotCost: (tx, _action, raw, user) => voidPilotCost(tx, raw, user),
  createProject: projectsCommands,
  updateProject: projectsCommands,
  submitForModeration: projectsCommands,
  pauseProject: projectsCommands,
  applyToProject: applicationsCommands,
  updateApplication: applicationsCommands,
  withdrawApplication: applicationsCommands,
  selectApplicant: applicationsCommands,
  approveAgreement: workCommands,
  proposeAgreement: workCommands,
  toggleMilestone: workCommands,
  submitDeliverable: workCommands,
  requestChanges: workCommands,
  acceptSubmission: workCommands,
  acknowledgePayment: workCommands,
  closeProject: workCommands,
  cancelProject: workCommands,
  disputeProject: workCommands,
  setPortfolio: portfolioCommands,
  consentPortfolio: portfolioCommands,
  createReview: portfolioCommands,
  moderateProject: moderationCommands,
  fileComplaint: moderationCommands,
  moderateClient: moderationCommands,
  suspendUser: moderationCommands,
  resolveReport: moderationCommands,
  markNotification: notificationsCommands,
} satisfies Record<Action, (...args: Parameters<typeof projectsCommands>) => Promise<unknown>>;

export async function mutateMarketplace(raw: Record<string, unknown>, sessionUser: User) {
  const action = raw.action as Action;
  assert(
    typeof action === 'string' && Object.hasOwn(mutationSchemas, action),
    400,
    'Неизвестное действие.',
  );
  return db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({ where: { id: sessionUser.id } });
      assert(
        user && user.status === 'active',
        403,
        'Аккаунт приостановлен. Обратитесь к администратору.',
      );
      assert(!user.demo || config.demoEnabled, 403, 'Демонстрационный аккаунт недоступен.');
      assert(config.localMode || user.emailVerified, 403, 'Сначала подтвердите email.');
      await rate(tx, `platform:${user.id}`, 120, 60000);
      return commandHandlers[action](tx, action, raw, user);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 15000,
    },
  );
}

export async function queryMarketplace(params: URLSearchParams, user: User | null) {
  const view = platformViewSchema.parse(params.get('view') || 'catalog');
  if (view === 'project' || view === 'work') {
    const id = params.get('id');
    assert(id && id.length <= 100, 400, 'Укажите корректный ID заказа.');
  }
  if (view === 'applications') {
    const id = params.get('projectId');
    assert(id && id.length <= 100, 400, 'Укажите корректный ID заказа.');
  }
  if (view === 'catalog' || view === 'project') return publicQueries(params, user);
  assert(user, 401, 'Войдите в аккаунт.');
  assert(
    user.status === 'active' && (!user.demo || config.demoEnabled),
    403,
    'Аккаунт недоступен.',
  );
  if (view === 'admin' || view === 'pilotMetrics') return adminQueries(params, user);
  if (view === 'pilotCosts') return queryPilotCosts(params, user);
  if (view === 'backgroundJobs') return queryBackgroundJobs(user);
  return accountQueries(params, user);
}
