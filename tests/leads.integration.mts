import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { db } from '../src/lib/db';
import { AppError } from '../src/lib/permissions';
import {
  mutateLead,
  queryLeadDetail,
  queryLeads,
  queryLeadHandoffs,
  queryLeadHandoff,
  convertLead,
} from '../src/server/leads/service';
import {
  leadListDataSchema,
  leadDetailDataSchema,
  leadHandoffsDataSchema,
} from '../src/contracts/leads';
const target = new URL(process.env.DATABASE_TEST_URL ?? 'invalid:');
if (
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname !== '/student_marketplace_e2e' ||
  target.toString() !== new URL(process.env.DATABASE_URL ?? 'invalid:').toString()
)
  throw new Error('Explicit isolated E2E database required.');
after(() => db.$disconnect());
const reason = 'Синтетическое обоснование ручного действия для интеграционной проверки.';
const expiresAt = () => new Date(Date.now() + 86400000).toISOString();
const rejectsStatus = (status: number) => (error: unknown) => {
  assert.ok(error instanceof AppError);
  assert.equal(error.status, status);
  return true;
};
const wire = (value: unknown) => JSON.parse(JSON.stringify(value));
test('private leads and explicit client handoff', async (t) => {
  async function actor(role: string) {
    return db.user.create({
      data: {
        id: randomUUID(),
        email: `${randomUUID()}@example.test`,
        name: `Lead test ${role}`,
        roles: [role],
        emailVerified: true,
      },
    });
  }
  const admin = await actor('admin'),
    client = await actor('client'),
    other = await actor('client'),
    student = await actor('student');
  async function create(overrides: Record<string, unknown> = {}) {
    return mutateLead(
      {
        action: 'createLead',
        kind: 'business_request',
        sourceUrl: `https://example.org/lead/${randomUUID()}?utm_source=test`,
        sourceName: 'Synthetic lead source',
        title: 'Synthetic business request',
        summary: 'Synthetic private business request without any real contact.',
        assignedToId: admin.id,
        expiresAt: expiresAt(),
        ...overrides,
      },
      admin,
    );
  }
  async function act(leadId: string, action: string, fields: Record<string, unknown> = {}) {
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    return mutateLead({ action, leadId, expectedVersion: lead.version, reason, ...fields }, admin);
  }
  async function consent(leadId: string) {
    await act(leadId, 'verifyLead');
    await act(leadId, 'recordContact');
    await act(leadId, 'recordConsent', { clientId: client.id, evidence: reason });
    return db.lead.findUniqueOrThrow({ where: { id: leadId } });
  }
  const project = {
    title: 'A normal explicit owner project',
    category: 'spreadsheets',
    problem: 'Synthetic problem description',
    description: 'Synthetic scope for a small limited task and no personal data.',
    deliverables: 'One summary table and calculation explanation.',
    acceptanceCriteria: ['Totals match the input.'],
    skills: ['Excel'],
    difficulty: 'beginner_friendly',
    mode: 'remote',
    city: '',
    budgetKzt: 1000,
    estimatedHours: 2,
    dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
  await t.test(
    'private guards and fresh persisted roles/status precede every mutation',
    async () => {
      await assert.rejects(mutateLead({ action: 'createLead' }, student), rejectsStatus(403));
      await assert.rejects(queryLeads(new URLSearchParams(), student), rejectsStatus(403));
      await assert.rejects(queryLeadHandoffs(student), rejectsStatus(403));
      await db.user.update({ where: { id: admin.id }, data: { roles: ['student'] } });
      await assert.rejects(create(), rejectsStatus(403));
      await db.user.update({
        where: { id: admin.id },
        data: { roles: ['admin'], status: 'suspended' },
      });
      await assert.rejects(create(), rejectsStatus(403));
      await db.user.update({ where: { id: admin.id }, data: { status: 'active' } });
    },
  );
  await t.test(
    'manual identity deduplicates trackers and never resurrects a closed record',
    async () => {
      const url = `https://example.org/lead/${randomUUID()}`;
      const first = await create({ sourceUrl: `${url}?utm_source=one` });
      const repeated = await create({ sourceUrl: `${url}?utm_source=two` });
      assert.equal(repeated.leadId, first.leadId);
      await act(first.leadId, 'closeLead', { decision: 'declined' });
      assert.equal((await create({ sourceUrl: url })).leadId, first.leadId);
      assert.equal(
        (await db.lead.findUniqueOrThrow({ where: { id: first.leadId } })).status,
        'declined',
      );
      await assert.rejects(create({ sourceUrl: 'https://127.0.0.1/private' }), rejectsStatus(400));
      await assert.rejects(create({ assignedToId: student.id }), rejectsStatus(400));
      assert.notEqual((await create({ sourceUrl: url, kind: 'discussion' })).leadId, first.leadId);
    },
  );
  await t.test(
    'verification/contact/consent do not create projects and only the assigned client sees the handoff',
    async () => {
      const created = await create();
      const before = await db.project.count();
      await assert.rejects(act(created.leadId, 'recordContact'), rejectsStatus(409));
      await assert.rejects(
        act(created.leadId, 'recordConsent', { clientId: client.id, evidence: reason }),
        rejectsStatus(409),
      );
      await consent(created.leadId);
      assert.equal(await db.project.count(), before);
      const own = leadHandoffsDataSchema.parse(wire(await queryLeadHandoffs(client)));
      assert.ok(own.leads.some((lead) => lead.id === created.leadId));
      const projection = own.leads.find((lead) => lead.id === created.leadId)!;
      assert.ok(!('consentEvidence' in projection));
      assert.ok(!('assignedToId' in projection));
      assert.ok(!('conversionHash' in projection));
      assert.ok(!(await queryLeadHandoffs(other)).leads.some((lead) => lead.id === created.leadId));
      await assert.rejects(queryLeadHandoff(created.leadId, other), rejectsStatus(404));
      await assert.rejects(
        act(created.leadId, 'recordConsent', { clientId: student.id, evidence: reason }),
        rejectsStatus(409),
      );
    },
  );
  await t.test(
    'only the consenting owner explicitly creates one normal draft, and identical retries are safe',
    async () => {
      const lead = await consent((await create()).leadId);
      const input = { leadId: lead.id, expectedVersion: lead.version, confirmation: true, project };
      await assert.rejects(convertLead(input, other), rejectsStatus(404));
      await assert.rejects(convertLead(input, admin), rejectsStatus(403));
      try {
        await db.user.update({ where: { id: client.id }, data: { roles: ['student'] } });
        await assert.rejects(convertLead(input, client), rejectsStatus(403));
        await db.user.update({
          where: { id: client.id },
          data: { roles: ['client'], status: 'suspended' },
        });
        await assert.rejects(convertLead(input, client), rejectsStatus(403));
      } finally {
        await db.user.update({
          where: { id: client.id },
          data: { roles: ['client'], status: 'active' },
        });
      }
      const result = await convertLead(input, client);
      assert.equal((await convertLead(input, client)).projectId, result.projectId);
      await assert.rejects(
        convertLead({ ...input, project: { ...project, budgetKzt: 2000 } }, client),
        rejectsStatus(409),
      );
      const saved = await db.project.findUniqueOrThrow({ where: { id: result.projectId } });
      assert.equal(saved.clientId, client.id);
      assert.equal(saved.status, 'draft');
      assert.equal(saved.publishedAt, null);
      assert.equal(saved.budgetKzt, 1000);
      assert.equal(
        await db.projectEvent.count({
          where: { projectId: result.projectId, action: 'createProject' },
        }),
        1,
      );
      assert.equal(
        await db.leadEvent.count({ where: { leadId: lead.id, action: 'convertLead' } }),
        1,
      );
      await assert.rejects(act(lead.id, 'closeLead', { decision: 'archived' }), rejectsStatus(409));
      await act(lead.id, 'addLeadNote');
      assert.equal((await convertLead(input, client)).projectId, result.projectId);
    },
  );
  await t.test(
    'revoked or expired handoffs cannot create drafts; discussions cannot acquire a project',
    async () => {
      const lead = await consent((await create()).leadId);
      await act(lead.id, 'revokeConsent');
      await assert.rejects(
        convertLead(
          { leadId: lead.id, expectedVersion: lead.version, confirmation: true, project },
          client,
        ),
        rejectsStatus(404),
      );
      assert.ok(!(await queryLeadHandoffs(client)).leads.some((record) => record.id === lead.id));
      await act(lead.id, 'recordConsent', { clientId: client.id, evidence: reason });
      // Expired fixture remains private history; only its own mutable expiry/version is changed.
      const expired = await db.lead.update({
        where: { id: lead.id },
        data: { expiresAt: new Date(Date.now() - 1000), version: { increment: 1 } },
      });
      await assert.rejects(
        convertLead(
          { leadId: lead.id, expectedVersion: expired.version, confirmation: true, project },
          client,
        ),
        rejectsStatus(409),
      );
      const discussion = await create({ kind: 'discussion' });
      await act(discussion.leadId, 'verifyLead');
      await act(discussion.leadId, 'recordContact');
      await assert.rejects(
        act(discussion.leadId, 'recordConsent', { clientId: client.id, evidence: reason }),
        rejectsStatus(409),
      );
      await act(discussion.leadId, 'closeLead', { decision: 'archived' });
    },
  );
  await t.test(
    'concurrent commands have one winner and conversion cannot duplicate a draft',
    async () => {
      const lead = await consent((await create()).leadId);
      const input = { leadId: lead.id, expectedVersion: lead.version, confirmation: true, project };
      const results = await Promise.allSettled([
        convertLead(input, client),
        convertLead(input, client),
      ]);
      assert.ok(results.some((result) => result.status === 'fulfilled'));
      assert.equal(
        await db.leadEvent.count({ where: { leadId: lead.id, action: 'convertLead' } }),
        1,
      );
      const saved = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
      const replay = await convertLead(input, client);
      assert.equal(replay.projectId, saved.projectId);
      const record = await create(),
        before = await db.lead.findUniqueOrThrow({ where: { id: record.leadId } });
      const command = {
        action: 'verifyLead',
        leadId: record.leadId,
        expectedVersion: before.version,
        reason,
      };
      const votes = await Promise.allSettled([
        mutateLead(command, admin),
        mutateLead(command, admin),
      ]);
      assert.equal(votes.filter((vote) => vote.status === 'fulfilled').length, 1);
    },
  );
  await t.test('assign/edit/reopen preserve capture and immutable event pagination', async () => {
    const historyAdmin = await actor('admin');
    const created = await create();
    await act(created.leadId, 'assignLead', { assignedToId: historyAdmin.id });
    await act(created.leadId, 'editLead', {
      title: 'Corrected private business title',
      summary: 'Corrected private summary preserving original evidence in history.',
      sourceName: 'Corrected source name',
      expiresAt: expiresAt(),
    });
    await act(created.leadId, 'verifyLead');
    await act(created.leadId, 'closeLead', { decision: 'declined' });
    await act(created.leadId, 'reopenLead');
    for (let i = 0; i < 22; i++) {
      const lead = await db.lead.findUniqueOrThrow({ where: { id: created.leadId } });
      await mutateLead(
        { action: 'addLeadNote', leadId: lead.id, expectedVersion: lead.version, reason },
        historyAdmin,
      );
    }
    const detail = leadDetailDataSchema.parse(
      wire(await queryLeadDetail(created.leadId, 2, admin)),
    );
    assert.equal(detail.events.length, 8);
    assert.equal(detail.total, 28);
    assert.equal(detail.lead.status, 'new');
    assert.equal(detail.lead.verifiedAt, null);
    const list = leadListDataSchema.parse(
      wire(
        await queryLeads(new URLSearchParams({ kind: 'business_request', status: 'new' }), admin),
      ),
    );
    assert.ok(
      list.leads.every((lead) => lead.kind === 'business_request' && lead.status === 'new'),
    );
    await assert.rejects(queryLeadDetail(created.leadId, 1, client), rejectsStatus(403));
  });
});
