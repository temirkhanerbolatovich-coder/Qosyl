import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { after, test } from 'node:test';
import type { Prisma, PrismaClient } from '@prisma/client';
import { db } from '../src/lib/db';
import { AppError } from '../src/lib/permissions';
import { workCommands } from '../src/server/marketplace/commands/work';
import { submissionSchema } from '../src/contracts/api-entities';
import { MAX_ATTACHMENT_BYTES } from '../src/lib/project-attachments';
import {
  projectAttachmentListSchema,
  projectAttachmentMutationSchema,
} from '../src/contracts/project-attachments';
import {
  assertProjectAttachmentUploadAccess,
  deleteProjectAttachment,
  downloadProjectAttachment,
  readAttachmentBody,
  readProjectAttachmentList,
  uploadProjectAttachment,
} from '../src/server/attachments/service';

const target = new URL(process.env.DATABASE_URL || 'invalid:');
if (
  !/^\/student_marketplace_e2e_attachments_[a-f0-9]{12}$/.test(target.pathname) ||
  !['127.0.0.1', 'localhost'].includes(target.hostname) ||
  process.env.DATABASE_TEST_URL !== process.env.DATABASE_URL
)
  throw Error('Isolated attachment database required.');
after(() => db.$disconnect());
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const denied = (code: number) => (error: unknown) => {
  assert.ok(error instanceof AppError);
  assert.equal(error.status, code);
  return true;
};

async function fixture(signed = true) {
  const user = (roles: string[]) =>
    db.user.create({
      data: {
        id: randomUUID(),
        email: randomUUID() + '@example.test',
        name: 'Synthetic attachment owner',
        roles,
        emailVerified: true,
      },
    });
  const client = await user(['client']);
  const student = await user(['student']);
  const stranger = await user(['student']);
  const admin = await user(['admin']);
  const terms = {
    title: 'Synthetic private attachment project',
    category: 'it',
    problem: 'Synthetic bounded project problem',
    description: 'Synthetic attachment integration fixture. No real client materials.',
    deliverables: 'A verified synthetic result file',
    acceptanceCriteria: ['Synthetic result can be downloaded by the participants.'],
    skills: ['TypeScript'],
    difficulty: 'beginner_friendly',
    mode: 'remote',
    city: '',
    locationPrivate: '',
    contactPrivate: '',
    budgetKzt: 10000,
    estimatedHours: 2,
    dueAt: new Date(Date.now() + 86_400_000),
    preferredTime: '',
  };
  const project = await db.project.create({
    data: {
      ...terms,
      clientId: client.id,
      assignedStudentId: student.id,
      status: signed ? 'in_progress' : 'assigned',
    },
  });
  const agreement = await db.agreementVersion.create({
    data: {
      projectId: project.id,
      number: 1,
      snapshotJson: { ...terms, dueAt: terms.dueAt.toISOString() },
      clientApprovedAt: signed ? new Date() : null,
      studentApprovedAt: signed ? new Date() : null,
    },
  });
  const upload = (
    bytes = Buffer.from('Synthetic private result.\n'),
    filename = 'result.txt',
    actor = student,
  ) => uploadProjectAttachment(db, actor, project.id, { filename, mediaType: 'text/plain', bytes });
  return { client, student, stranger, admin, project, agreement, terms, upload };
}

test('private project attachments', { concurrency: false }, async (t) => {
  await t.test(
    'metadata is participant-only, excludes binary/hash and proves exact downloaded bytes',
    async () => {
      const f = await fixture();
      const bytes = Buffer.from('Синтетический результат. Құжат.\n');
      const result = await f.upload(bytes, 'результат.txt');
      projectAttachmentMutationSchema.parse(JSON.parse(JSON.stringify(result)));
      assert.equal(result.attachment.scanStatus, 'unscanned');
      assert.ok(!('bytes' in result.attachment));
      assert.ok(!('sha256' in result.attachment));
      assert.deepEqual(result.attachment.submissionIds, []);
      const listed = await readProjectAttachmentList(db, f.client, f.project.id);
      projectAttachmentListSchema.parse(JSON.parse(JSON.stringify(listed)));
      assert.equal(listed.attachments.length, 1);
      const download = await downloadProjectAttachment(db, f.client, result.attachment.id);
      assert.deepEqual(Buffer.from(download.bytes), bytes);
      assert.equal(hash(download.bytes), hash(bytes));
      for (const actor of [f.stranger, f.admin]) {
        await assert.rejects(readProjectAttachmentList(db, actor, f.project.id), denied(404));
        await assert.rejects(
          downloadProjectAttachment(db, actor, result.attachment.id),
          denied(404),
        );
        await assert.rejects(deleteProjectAttachment(db, actor, result.attachment.id), denied(404));
        await assert.rejects(
          assertProjectAttachmentUploadAccess(db, actor, f.project.id),
          denied(404),
        );
      }
      await assert.rejects(
        deleteProjectAttachment(db, f.client, result.attachment.id),
        denied(404),
      );
    },
  );

  await t.test(
    'fresh account, mutual agreement and lifecycle checks apply before and after upload body reading',
    async () => {
      const f = await fixture(false);
      await assert.rejects(
        assertProjectAttachmentUploadAccess(db, f.student, f.project.id),
        denied(409),
      );
      await assert.rejects(f.upload(), denied(409));
      await assert.rejects(readProjectAttachmentList(db, f.student, f.project.id), denied(409));
      await db.agreementVersion.update({
        where: { id: f.agreement.id },
        data: { clientApprovedAt: new Date(), studentApprovedAt: new Date() },
      });
      await db.project.update({ where: { id: f.project.id }, data: { status: 'in_progress' } });
      await assertProjectAttachmentUploadAccess(db, f.student, f.project.id);
      await db.user.update({ where: { id: f.student.id }, data: { status: 'suspended' } });
      await assert.rejects(f.upload(), denied(403));
      await assert.rejects(readProjectAttachmentList(db, f.student, f.project.id), denied(403));
      await db.user.update({ where: { id: f.student.id }, data: { status: 'active' } });
      const { attachment } = await f.upload();
      await db.project.update({ where: { id: f.project.id }, data: { status: 'completed' } });
      assert.equal(
        (await downloadProjectAttachment(db, f.client, attachment.id)).bytes.byteLength,
        attachment.byteSize,
      );
      await assert.rejects(f.upload(Buffer.from('A different file')), denied(409));
      assert.deepEqual(await deleteProjectAttachment(db, f.student, attachment.id), {
        removed: true,
      });
    },
  );

  await t.test(
    'failed body validation still consumes the committed HTTP preflight attempt limit',
    async () => {
      const f = await fixture();
      for (let index = 0; index < 20; index++) {
        await assertProjectAttachmentUploadAccess(db, f.student, f.project.id);
        await assert.rejects(f.upload(Buffer.alloc(0)), denied(400));
      }
      await assert.rejects(
        assertProjectAttachmentUploadAccess(db, f.student, f.project.id),
        denied(429),
      );
      assert.equal(
        (await readProjectAttachmentList(db, f.student, f.project.id)).attachments.length,
        0,
      );
    },
  );

  await t.test('format, path, empty and oversized inputs are rejected without rows', async () => {
    const f = await fixture();
    for (const filename of ['../secret.txt', 'C:\\secret.txt', 'bad\nname.txt'])
      await assert.rejects(f.upload(Buffer.from('text'), filename), denied(400));
    await assert.rejects(f.upload(Buffer.alloc(0)), denied(400));
    await assert.rejects(f.upload(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)), denied(413));
    await assert.rejects(
      uploadProjectAttachment(db, f.student, f.project.id, {
        filename: 'result.pdf',
        mediaType: 'application/pdf',
        bytes: Buffer.from('fake PDF'),
      }),
      denied(415),
    );
    await assert.rejects(
      uploadProjectAttachment(db, f.student, f.project.id, {
        filename: 'result.html',
        mediaType: 'text/html',
        bytes: Buffer.from('<script>alert(1)</script>'),
      }),
      denied(415),
    );
    assert.equal(
      (await readProjectAttachmentList(db, f.student, f.project.id)).attachments.length,
      0,
    );
  });

  await t.test(
    'deduplication remains stable under concurrent retries and preserves the first filename',
    async () => {
      const f = await fixture();
      const results = await Promise.all([f.upload(), f.upload(undefined, 'renamed.txt')]);
      assert.equal(results[0].attachment.id, results[1].attachment.id);
      assert.equal(results[0].attachment.filename, results[1].attachment.filename);
      assert.equal(
        (await readProjectAttachmentList(db, f.student, f.project.id)).attachments.length,
        1,
      );
      const clientFile = await f.upload(undefined, 'client-result.txt', f.client);
      assert.notEqual(clientFile.attachment.id, results[0].attachment.id);
    },
  );

  await t.test(
    'count quota is serialized across both participants and dedup succeeds at the limit',
    async () => {
      const f = await fixture();
      for (let index = 0; index < 19; index++) {
        const bytes = Buffer.from('Seeded attachment ' + index);
        await db.projectAttachment.create({
          data: {
            projectId: f.project.id,
            uploaderId: f.student.id,
            filename: `seed-${index}.txt`,
            mediaType: 'text/plain',
            byteSize: bytes.length,
            sha256: hash(bytes),
            bytes,
          },
        });
      }
      const results = await Promise.allSettled([
        f.upload(Buffer.from('One last student attachment')),
        f.upload(Buffer.from('One last client attachment'), 'client-final.txt', f.client),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const failure = results.find((result) => result.status === 'rejected');
      assert.ok(failure?.status === 'rejected');
      assert.ok(failure.reason instanceof AppError && failure.reason.status === 409);
      assert.equal(
        (await readProjectAttachmentList(db, f.student, f.project.id)).attachments.length,
        20,
      );
      const duplicate = await f.upload(Buffer.from('Seeded attachment 0'), 'new-name.txt');
      assert.equal(duplicate.attachment.filename, 'seed-0.txt');
    },
  );

  await t.test(
    'project and uploader byte quotas use stored byte lengths across projects',
    async () => {
      const f = await fixture();
      async function fill(projectId: string, count: number, offset: number) {
        for (let index = 0; index < count; index++) {
          const bytes = Buffer.alloc(MAX_ATTACHMENT_BYTES, 65 + index + offset);
          await db.projectAttachment.create({
            data: {
              projectId,
              uploaderId: f.student.id,
              filename: `large-${offset + index}.txt`,
              mediaType: 'text/plain',
              byteSize: bytes.length,
              sha256: hash(bytes),
              bytes,
            },
          });
        }
      }
      await fill(f.project.id, 10, 0);
      await assert.rejects(f.upload(Buffer.from('Project overflow')), denied(409));
      const second = await db.project.create({
        data: {
          ...f.terms,
          clientId: f.client.id,
          assignedStudentId: f.student.id,
          status: 'in_progress',
        },
      });
      await db.agreementVersion.create({
        data: {
          projectId: second.id,
          number: 1,
          snapshotJson: {},
          clientApprovedAt: new Date(),
          studentApprovedAt: new Date(),
        },
      });
      await fill(second.id, 10, 10);
      const third = await db.project.create({
        data: {
          ...f.terms,
          clientId: f.client.id,
          assignedStudentId: f.student.id,
          status: 'in_progress',
        },
      });
      await db.agreementVersion.create({
        data: {
          projectId: third.id,
          number: 1,
          snapshotJson: {},
          clientApprovedAt: new Date(),
          studentApprovedAt: new Date(),
        },
      });
      await assert.rejects(
        uploadProjectAttachment(db, f.student, third.id, {
          filename: 'overflow.txt',
          mediaType: 'text/plain',
          bytes: Buffer.from('Uploader overflow'),
        }),
        denied(409),
      );
      assert.equal(await db.projectAttachment.count({ where: { projectId: third.id } }), 0);
    },
  );

  await t.test(
    'client upload racing student submission cannot deadlock on the notification recipient foreign key',
    async () => {
      const f = await fixture();
      const own = await f.upload();
      let markUserHeld!: () => void;
      let markProjectHeld!: () => void;
      const userHeld = new Promise<void>((resolve) => {
        markUserHeld = resolve;
      });
      const projectHeld = new Promise<void>((resolve) => {
        markProjectHeld = resolve;
      });
      const synchronizedDatabase = {
        $transaction: (
          callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: unknown,
        ) =>
          db.$transaction(
            (tx) =>
              callback(
                new Proxy(tx, {
                  get(target, property, receiver) {
                    if (property === '$queryRaw')
                      return async (...args: Parameters<typeof target.$queryRaw>) => {
                        const result = await target.$queryRaw(...args);
                        if (String(args[0]).includes('FROM "User"')) {
                          markUserHeld();
                          await projectHeld;
                        }
                        return result;
                      };
                    return Reflect.get(target, property, receiver);
                  },
                }),
              ),
            options as never,
          ),
      } as unknown as PrismaClient;
      const upload = uploadProjectAttachment(synchronizedDatabase, f.client, f.project.id, {
        filename: 'racing-client.txt',
        mediaType: 'text/plain',
        bytes: Buffer.from('Concurrent client material.'),
      });
      // Attach a rejection handler before releasing the barrier to keep the test runner strict.
      const uploadResult = upload.then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      );
      await userHeld;
      const submission = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${f.project.id} FOR UPDATE`;
        markProjectHeld();
        return workCommands(
          tx,
          'submitDeliverable',
          {
            projectId: f.project.id,
            links: [],
            attachmentIds: [own.attachment.id],
            notes: 'Concurrent synthetic file-only result.',
          },
          f.student,
        );
      });
      assert.ok('id' in submission);
      const result = await uploadResult;
      assert.equal(result.ok, false);
      if (!result.ok) denied(409)(result.error);
      assert.equal(await db.submission.count({ where: { projectId: f.project.id } }), 1);
      assert.equal(await db.notification.count({ where: { userId: f.client.id } }), 1);
    },
  );

  await t.test(
    'file-only submission binds owned files atomically, rejects foreign IDs and reuses retained files after changes',
    async () => {
      const f = await fixture();
      const own = await f.upload();
      const client = await f.upload(Buffer.from('Synthetic client brief'), 'brief.txt', f.client);
      const foreign = await fixture();
      const foreignFile = await foreign.upload();
      const input = (attachmentIds: string[]) => ({
        projectId: f.project.id,
        links: [],
        attachmentIds,
        notes: 'Synthetic file-only result explained by criteria.',
      });
      const submit = (attachmentIds: string[]) =>
        db.$transaction((tx) =>
          workCommands(tx, 'submitDeliverable', input(attachmentIds), f.student),
        );
      await assert.rejects(submit([]));
      await assert.rejects(submit([client.attachment.id]), denied(404));
      await assert.rejects(submit([foreignFile.attachment.id]), denied(404));
      await assert.rejects(
        db.$transaction((tx) =>
          workCommands(
            new Proxy(tx, {
              get(target, property, receiver) {
                if (property === 'submissionAttachment')
                  return {
                    createMany: async () => {
                      throw Error('Synthetic bind failure');
                    },
                  };
                return Reflect.get(target, property, receiver);
              },
            }),
            'submitDeliverable',
            input([own.attachment.id]),
            f.student,
          ),
        ),
        /Synthetic bind failure/,
      );
      assert.equal(await db.submission.count({ where: { projectId: f.project.id } }), 0);
      assert.equal(await db.submissionAttachment.count({ where: { projectId: f.project.id } }), 0);
      assert.equal(
        (await db.project.findUniqueOrThrow({ where: { id: f.project.id } })).status,
        'in_progress',
      );
      const first = await submit([own.attachment.id]);
      assert.ok('id' in first);
      submissionSchema.parse(JSON.parse(JSON.stringify(first)));
      assert.deepEqual(
        (await readProjectAttachmentList(db, f.client, f.project.id)).attachments.find(
          (file) => file.id === own.attachment.id,
        )?.submissionIds,
        [first.id],
      );
      await assert.rejects(deleteProjectAttachment(db, f.student, own.attachment.id), denied(409));
      await db.$transaction((tx) =>
        workCommands(
          tx,
          'requestChanges',
          {
            projectId: f.project.id,
            submissionId: first.id,
            notes: 'Synthetic correction requested for the agreed criterion.',
            criteriaIndexes: [0],
          },
          f.client,
        ),
      );
      const second = await submit([own.attachment.id]);
      assert.ok('id' in second && second.id !== first.id);
      assert.equal(
        (await readProjectAttachmentList(db, f.client, f.project.id)).attachments.find(
          (file) => file.id === own.attachment.id,
        )?.submissionIds.length,
        2,
      );
      assert.equal(
        (await db.submission.findUniqueOrThrow({ where: { id: first.id } })).notes,
        input([]).notes,
      );
    },
  );

  await t.test(
    'cancellation after a new unsigned agreement retains previously submitted files for both participants',
    async () => {
      const f = await fixture();
      const bytes = Buffer.from('Synthetic retained file before cancellation.');
      const { attachment } = await f.upload(bytes);
      const submission = await db.$transaction((tx) =>
        workCommands(
          tx,
          'submitDeliverable',
          {
            projectId: f.project.id,
            links: [],
            attachmentIds: [attachment.id],
            notes: 'Synthetic delivered result before changes.',
          },
          f.student,
        ),
      );
      assert.ok('id' in submission);
      await db.$transaction((tx) =>
        workCommands(
          tx,
          'requestChanges',
          {
            projectId: f.project.id,
            submissionId: submission.id,
            notes: 'Synthetic requested correction by the agreed criterion.',
            criteriaIndexes: [0],
          },
          f.client,
        ),
      );
      await db.$transaction((tx) =>
        workCommands(
          tx,
          'proposeAgreement',
          {
            ...f.terms,
            projectId: f.project.id,
            dueAt: new Date(Date.now() + 2 * 86_400_000),
            description: 'Synthetic revised agreement awaiting both participant approvals.',
          },
          f.client,
        ),
      );
      const latest = await db.agreementVersion.findFirstOrThrow({
        where: { projectId: f.project.id },
        orderBy: { number: 'desc' },
      });
      assert.equal(latest.number, 2);
      assert.equal(latest.clientApprovedAt, null);
      assert.equal(latest.studentApprovedAt, null);
      assert.equal(
        (await db.project.findUniqueOrThrow({ where: { id: f.project.id } })).status,
        'assigned',
      );
      for (const actor of [f.client, f.student])
        assert.deepEqual(
          Buffer.from((await downloadProjectAttachment(db, actor, attachment.id)).bytes),
          bytes,
        );
      await db.$transaction((tx) =>
        workCommands(
          tx,
          'cancelProject',
          {
            projectId: f.project.id,
            reason: 'Synthetic cancellation before accepting the revised agreement.',
          },
          f.client,
        ),
      );
      assert.equal(
        (await db.project.findUniqueOrThrow({ where: { id: f.project.id } })).status,
        'cancelled',
      );
      for (const actor of [f.client, f.student]) {
        assert.deepEqual(
          Buffer.from((await downloadProjectAttachment(db, actor, attachment.id)).bytes),
          bytes,
        );
        assert.deepEqual(
          (await readProjectAttachmentList(db, actor, f.project.id)).attachments[0].submissionIds,
          [submission.id],
        );
      }
      await assert.rejects(f.upload(Buffer.from('New file after cancellation')), denied(409));
      await assert.rejects(deleteProjectAttachment(db, f.student, attachment.id), denied(409));
    },
  );

  await t.test(
    'a participant dispute creates its report and retains submitted evidence while preventing further uploads',
    async () => {
      const f = await fixture();
      const bytes = Buffer.from('Synthetic retained evidence before dispute.');
      const { attachment } = await f.upload(bytes);
      await db.$transaction((tx) =>
        workCommands(
          tx,
          'submitDeliverable',
          {
            projectId: f.project.id,
            links: [],
            attachmentIds: [attachment.id],
            notes: 'Synthetic result before opening a dispute.',
          },
          f.student,
        ),
      );
      const reason = 'Synthetic participant dispute for manual review of the submitted evidence.';
      await db.$transaction((tx) =>
        workCommands(tx, 'disputeProject', { projectId: f.project.id, reason }, f.student),
      );
      assert.equal(
        (await db.project.findUniqueOrThrow({ where: { id: f.project.id } })).status,
        'disputed',
      );
      const report = await db.report.findFirstOrThrow({
        where: { projectId: f.project.id, authorId: f.student.id },
      });
      assert.equal(report.reason, reason);
      for (const actor of [f.client, f.student])
        assert.deepEqual(
          Buffer.from((await downloadProjectAttachment(db, actor, attachment.id)).bytes),
          bytes,
        );
      await assert.rejects(f.upload(Buffer.from('New file after dispute')), denied(409));
      await assert.rejects(deleteProjectAttachment(db, f.student, attachment.id), denied(409));
    },
  );

  await t.test(
    'linked files are reusable in later submissions and cannot be removed or changed',
    async () => {
      const f = await fixture();
      const { attachment } = await f.upload();
      for (let index = 0; index < 2; index++) {
        const submission = await db.submission.create({
          data: {
            projectId: f.project.id,
            studentId: f.student.id,
            links: [],
            notes: 'Synthetic immutable delivery ' + index,
          },
        });
        await db.submissionAttachment.create({
          data: {
            projectId: f.project.id,
            submissionId: submission.id,
            attachmentId: attachment.id,
          },
        });
      }
      assert.equal(
        (await readProjectAttachmentList(db, f.client, f.project.id)).attachments[0].submissionIds
          .length,
        2,
      );
      await assert.rejects(deleteProjectAttachment(db, f.student, attachment.id), denied(409));
      await assert.rejects(
        db.projectAttachment.update({
          where: { id: attachment.id },
          data: { filename: 'changed.txt' },
        }),
      );
      await assert.rejects(db.projectAttachment.delete({ where: { id: attachment.id } }));
      const foreign = await fixture();
      const submission = await db.submission.create({
        data: {
          projectId: foreign.project.id,
          studentId: foreign.student.id,
          links: [],
          notes: 'Synthetic foreign delivery only',
        },
      });
      await assert.rejects(
        db.submissionAttachment.create({
          data: {
            projectId: foreign.project.id,
            submissionId: submission.id,
            attachmentId: attachment.id,
          },
        }),
      );
    },
  );

  await t.test(
    'unbound deletion is exact and private downloads disappear after removal',
    async () => {
      const f = await fixture();
      const first = await f.upload();
      const second = await f.upload(Buffer.from('A separate synthetic file'));
      assert.deepEqual(await deleteProjectAttachment(db, f.student, first.attachment.id), {
        removed: true,
      });
      await assert.rejects(
        downloadProjectAttachment(db, f.student, first.attachment.id),
        denied(404),
      );
      assert.equal(
        (await readProjectAttachmentList(db, f.student, f.project.id)).attachments[0].id,
        second.attachment.id,
      );
    },
  );

  await t.test(
    'binary body reader enforces the stream cap with absent or dishonest Content-Length',
    async () => {
      const request = new Request('http://localhost/upload', {
        method: 'POST',
        body: Buffer.from('binary result'),
      });
      assert.equal((await readAttachmentBody(request)).toString('utf8'), 'binary result');
      const oversized = () =>
        new Request('http://localhost/upload', {
          method: 'POST',
          headers: { 'Content-Length': '1' },
          body: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1),
        });
      await assert.rejects(readAttachmentBody(oversized()), denied(413));
      const absent = new Request('http://localhost/upload', {
        method: 'POST',
        body: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1),
      });
      await assert.rejects(readAttachmentBody(absent), denied(413));
    },
  );
});
