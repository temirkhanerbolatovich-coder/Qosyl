import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma, type User } from '@prisma/client';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { AppError, assert, requireRole } from '@/lib/permissions';
import { canonicalizeContentUrl, ContentFeedError } from '@/lib/content-feed';
import { leadCommandSchema, leadConversionInput, leadQueryInput } from '@/lib/lead-validation';
import { projectsCommands } from '@/server/marketplace/commands/projects';
import { rate } from '@/server/marketplace/shared';

type Tx = Prisma.TransactionClient;
async function currentUser(tx: Tx, session: User, role: 'admin' | 'client') {
  const user = await tx.user.findUnique({ where: { id: session.id } });
  assert(
    user?.status === 'active' && (!user.demo || config.demoEnabled),
    403,
    'Аккаунт недоступен.',
  );
  requireRole(user.roles, role);
  assert(config.localMode || user.emailVerified, 403, 'Сначала подтвердите email.');
  return user;
}
async function eligibleUser(tx: Tx, id: string, role: 'admin' | 'client') {
  const user = await tx.user.findUnique({ where: { id } });
  assert(
    user?.status === 'active' && user.roles.includes(role) && (!user.demo || config.demoEnabled),
    400,
    role === 'admin' ? 'Выберите действующего администратора.' : 'Выберите действующего заказчика.',
  );
}
const transaction = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: 15000,
  maxWait: 5000,
};

/** Captures manual research and outcomes only; no network request or message is sent. */
export async function mutateLead(raw: Record<string, unknown>, session: User) {
  requireRole(session.roles, 'admin');
  const input = leadCommandSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const user = await currentUser(tx, session, 'admin');
    await rate(tx, `leads:${user.id}`, 60, 60000);
    if (input.action === 'createLead') {
      await eligibleUser(tx, input.assignedToId, 'admin');
      let sourceUrl: string;
      try {
        sourceUrl = canonicalizeContentUrl(
          input.sourceUrl,
          input.sourceUrl,
          new URL(input.sourceUrl).hostname,
        );
      } catch (error) {
        if (error instanceof ContentFeedError)
          throw new AppError(400, 'Нужна безопасная ссылка на внешний оригинал.');
        throw error;
      }
      const urlHash = createHash('sha256').update(sourceUrl).digest('hex');
      const existing = await tx.lead.findUnique({
        where: { kind_urlHash: { kind: input.kind, urlHash } },
      });
      if (existing) return { leadId: existing.id, version: existing.version };
      const lead = await tx.lead.create({
        data: {
          kind: input.kind,
          sourceUrl,
          urlHash,
          sourceName: input.sourceName,
          title: input.title,
          summary: input.summary,
          expiresAt: new Date(input.expiresAt),
          assignedToId: input.assignedToId,
          createdById: user.id,
        },
      });
      await tx.leadEvent.create({
        data: {
          leadId: lead.id,
          actorId: user.id,
          version: 1,
          action: 'createLead',
          note: 'Материал вручную добавлен как непроверенный кандидат.',
          detailsJson: { sourceUrl, kind: input.kind },
        },
      });
      return { leadId: lead.id, version: lead.version };
    }
    await tx.$queryRaw`SELECT "id" FROM "Lead" WHERE "id"=${input.leadId} FOR UPDATE`;
    const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
    assert(lead, 404, 'Запись не найдена.');
    assert(
      lead.version === input.expectedVersion,
      409,
      'Запись изменилась. Обновите её перед решением.',
    );
    const now = new Date();
    let update: Prisma.LeadUncheckedUpdateInput = {};
    let details: Record<string, string> = {};
    const note = input.action === 'recordConsent' ? input.evidence : input.reason;
    if (['verifyLead', 'recordContact', 'recordConsent'].includes(input.action))
      assert(
        lead.expiresAt > now,
        409,
        'Срок актуальности истёк. Верните запись на проверку и уточните срок.',
      );
    switch (input.action) {
      case 'editLead':
        assert(
          lead.status === 'new',
          409,
          'Изменять описание можно до проверки. Сначала верните запись на проверку.',
        );
        update = {
          title: input.title,
          summary: input.summary,
          sourceName: input.sourceName,
          expiresAt: new Date(input.expiresAt),
        };
        details = {
          previousTitle: lead.title,
          previousSummary: lead.summary,
          previousSourceName: lead.sourceName,
          previousExpiresAt: lead.expiresAt.toISOString(),
          title: input.title,
          summary: input.summary,
          sourceName: input.sourceName,
          expiresAt: input.expiresAt,
        };
        break;
      case 'assignLead':
        await eligibleUser(tx, input.assignedToId, 'admin');
        update = { assignedToId: input.assignedToId };
        details = { previousAssignedToId: lead.assignedToId, assignedToId: input.assignedToId };
        break;
      case 'verifyLead':
        assert(lead.status === 'new', 409, 'Проверять можно только новую запись.');
        update = { status: 'verified', verifiedAt: now };
        break;
      case 'recordContact':
        assert(lead.status === 'verified', 409, 'Сначала проверьте материал.');
        update = { status: 'contacted', contactedAt: now };
        break;
      case 'recordConsent':
        assert(
          lead.kind === 'business_request' && lead.status === 'contacted',
          409,
          'Согласие на заказ фиксируется только после ручного контакта по бизнес-запросу.',
        );
        await eligibleUser(tx, input.clientId, 'client');
        update = {
          status: 'consented',
          consentAt: now,
          consentEvidence: input.evidence,
          clientId: input.clientId,
        };
        details = { clientId: input.clientId, evidence: input.evidence };
        break;
      case 'revokeConsent':
        assert(
          lead.status === 'consented',
          409,
          'Нет действующей передачи для отмены. Созданный заказ управляется его владельцем.',
        );
        update = { status: 'contacted', consentAt: null, consentEvidence: null, clientId: null };
        details = { previousClientId: lead.clientId! };
        break;
      case 'closeLead':
        assert(
          lead.status !== 'converted' && lead.status !== input.decision,
          409,
          'Запись уже завершена этим решением или связана с заказом.',
        );
        update = { status: input.decision };
        break;
      case 'reopenLead':
        assert(
          lead.status !== 'new' && lead.status !== 'converted',
          409,
          'Запись уже новая или связана с заказом.',
        );
        update = {
          status: 'new',
          verifiedAt: null,
          contactedAt: null,
          consentAt: null,
          consentEvidence: null,
          clientId: null,
        };
        break;
      case 'addLeadNote':
        break;
    }
    const saved = await tx.lead.update({
      where: { id: lead.id },
      data: { ...update, version: { increment: 1 } },
    });
    await tx.leadEvent.create({
      data: {
        leadId: lead.id,
        actorId: user.id,
        version: saved.version,
        action: input.action,
        note,
        detailsJson: { ...details, previousStatus: lead.status, status: saved.status },
      },
    });
    return { leadId: saved.id, version: saved.version };
  }, transaction);
}

export async function queryLeads(params: URLSearchParams, user: User) {
  requireRole(user.roles, 'admin');
  const { page, kind, status } = leadQueryInput.parse({
    page: params.get('page') ?? undefined,
    kind: params.get('kind') ?? undefined,
    status: params.get('status') ?? undefined,
  });
  const where = { ...(kind ? { kind } : {}), ...(status ? { status } : {}) };
  const [leads, total, operators, clients] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    db.lead.count({ where }),
    db.user.findMany({
      where: {
        status: 'active',
        roles: { has: 'admin' },
        ...(!config.demoEnabled ? { demo: false } : {}),
      },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 100,
    }),
    db.user.findMany({
      where: {
        status: 'active',
        roles: { has: 'client' },
        ...(!config.demoEnabled ? { demo: false } : {}),
      },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 100,
    }),
  ]);
  return { leads, total, page, operators, clients };
}
export async function queryLeadDetail(id: string, page: number, user: User) {
  requireRole(user.roles, 'admin');
  assert(
    Number.isInteger(page) && page >= 1 && page <= 10000,
    400,
    'Некорректная страница истории.',
  );
  const lead = await db.lead.findUnique({ where: { id } });
  assert(lead, 404, 'Запись не найдена.');
  const [events, total] = await Promise.all([
    db.leadEvent.findMany({
      where: { leadId: id },
      orderBy: { version: 'desc' },
      skip: (page - 1) * 20,
      take: 20,
    }),
    db.leadEvent.count({ where: { leadId: id } }),
  ]);
  return { lead, events, page, total };
}
const handoffSelect = {
  id: true,
  version: true,
  status: true,
  title: true,
  summary: true,
  sourceName: true,
  sourceUrl: true,
  expiresAt: true,
  projectId: true,
} satisfies Prisma.LeadSelect;
export async function queryLeadHandoffs(user: User, page = 1) {
  requireRole(user.roles, 'client');
  assert(Number.isInteger(page) && page >= 1 && page <= 10000, 400, 'Некорректная страница.');
  const where = {
    clientId: user.id,
    OR: [{ status: 'consented', expiresAt: { gt: new Date() } }, { status: 'converted' }],
  };
  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      select: handoffSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 20,
      skip: (page - 1) * 20,
    }),
    db.lead.count({ where }),
  ]);
  return { leads, total, page };
}
export async function queryLeadHandoff(id: string, user: User) {
  requireRole(user.roles, 'client');
  const lead = await db.lead.findFirst({
    where: { id, clientId: user.id, status: 'consented', expiresAt: { gt: new Date() } },
    select: handoffSelect,
  });
  assert(lead, 404, 'Передача недоступна: проверьте срок, согласие и владельца.');
  return lead;
}

/** The consenting owner explicitly supplies a normal project brief. Replays reuse the same draft. */
export async function convertLead(raw: Record<string, unknown>, session: User) {
  requireRole(session.roles, 'client');
  const input = leadConversionInput.parse(raw);
  const hash = createHash('sha256').update(JSON.stringify(input.project)).digest('hex');
  return db.$transaction(async (tx) => {
    const user = await currentUser(tx, session, 'client');
    await rate(tx, `lead-drafts:${user.id}`, 30, 60000);
    await tx.$queryRaw`SELECT "id" FROM "Lead" WHERE "id"=${input.leadId} FOR UPDATE`;
    const lead = await tx.lead.findFirst({ where: { id: input.leadId, clientId: user.id } });
    assert(lead, 404, 'Передача не найдена.');
    if (lead.status === 'converted') {
      assert(
        lead.conversionHash === hash,
        409,
        'По этой передаче уже создан другой черновик. Откройте существующий заказ.',
      );
      return { projectId: lead.projectId! };
    }
    assert(
      lead.version === input.expectedVersion &&
        lead.status === 'consented' &&
        lead.kind === 'business_request' &&
        lead.expiresAt > new Date(),
      409,
      'Передача изменилась, отозвана или просрочена. Обновите страницу.',
    );
    // Reuse the existing transaction-level project creation, including demo flags and ProjectEvent.
    const result = await projectsCommands(tx, 'createProject', input.project, user);
    assert('id' in result, 500, 'Не удалось создать черновик.');
    const saved = await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: 'converted',
        version: { increment: 1 },
        projectId: result.id,
        conversionHash: hash,
      },
    });
    await tx.leadEvent.create({
      data: {
        leadId: lead.id,
        actorId: user.id,
        version: saved.version,
        action: 'convertLead',
        note: 'Заказчик явно подтвердил передачу и самостоятельно создал черновик задания.',
        detailsJson: { projectId: result.id },
      },
    });
    return { projectId: result.id };
  }, transaction);
}
