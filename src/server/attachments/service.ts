import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { config } from '@/lib/config';
import { AppError, assert, isParticipant } from '@/lib/permissions';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_PROJECT_ATTACHMENT_BYTES,
  MAX_USER_ATTACHMENT_BYTES,
  MAX_PROJECT_ATTACHMENTS,
  validateProjectAttachment,
} from '@/lib/project-attachments';
import { rate } from '@/server/marketplace/shared';

type Tx = Prisma.TransactionClient;
const metadataSelect = {
  id: true,
  projectId: true,
  uploaderId: true,
  filename: true,
  mediaType: true,
  byteSize: true,
  createdAt: true,
  submissions: { select: { submissionId: true }, orderBy: { submissionId: 'asc' as const } },
} satisfies Prisma.ProjectAttachmentSelect;
type AttachmentMetadata = Prisma.ProjectAttachmentGetPayload<{ select: typeof metadataSelect }>;
const metadata = ({ submissions, ...attachment }: AttachmentMetadata) => ({
  ...attachment,
  submissionIds: submissions.map((entry) => entry.submissionId),
  scanStatus: 'unscanned' as const,
});

async function account(tx: Tx, actorId: string, mutation = false) {
  const user = await tx.user.findUnique({ where: { id: actorId } });
  assert(
    user?.status === 'active' && (!user.demo || config.demoEnabled),
    403,
    'Аккаунт недоступен.',
  );
  if (mutation) assert(config.localMode || user.emailVerified, 403, 'Сначала подтвердите email.');
  return user;
}

async function projectAccess(tx: Tx, actorId: string, projectId: string, upload = false) {
  assert(projectId.length > 0 && projectId.length <= 100, 404, 'Рабочие материалы недоступны.');
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      clientId: true,
      assignedStudentId: true,
      status: true,
      agreements: {
        where: { clientApprovedAt: { not: null }, studentApprovedAt: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
  });
  assert(project && isParticipant(project, actorId), 404, 'Рабочие материалы недоступны.');
  assert(
    project.agreements.length > 0,
    409,
    'Файлы доступны после согласования условий обеими сторонами.',
  );
  if (upload)
    assert(
      project.status === 'in_progress' || project.status === 'changes_requested',
      409,
      'Загрузка доступна во время работы или доработки результата.',
    );
  return project;
}

/** Authenticate before consuming the upload stream; the write transaction repeats these checks. */
export async function assertProjectAttachmentUploadAccess(
  database: PrismaClient,
  actor: User,
  projectId: string,
) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.id} FOR NO KEY UPDATE`;
    await account(tx, actor.id, true);
    await projectAccess(tx, actor.id, projectId, true);
    // Commit the attempt before reading bytes; malformed uploads must still consume the limit.
    await rate(tx, `attachments:${actor.id}`, 20, 60_000);
  });
}

/** Participant metadata only: bytes and digest never enter a catalogue/work JSON projection. */
export async function readProjectAttachmentList(
  database: PrismaClient,
  actor: User,
  projectId: string,
) {
  return database.$transaction(
    async (tx) => {
      await account(tx, actor.id);
      await projectAccess(tx, actor.id, projectId);
      const attachments = await tx.projectAttachment.findMany({
        where: { projectId },
        select: metadataSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return { attachments: attachments.map(metadata) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

/** Bound the binary stream itself; Content-Length and the filename are untrusted inputs. */
export async function readAttachmentBody(request: Request, maxBytes = MAX_ATTACHMENT_BYTES) {
  const declared = Number(request.headers.get('content-length'));
  assert(
    !Number.isFinite(declared) || declared <= maxBytes,
    413,
    'Файл слишком большой.',
  );
  const reader = request.body?.getReader();
  assert(reader, 400, 'Выберите непустой файл.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 20_000);
  try {
    while (true) {
      const part = await reader.read();
      assert(!timedOut, 400, 'Загрузка файла не завершилась вовремя. Повторите попытку.');
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError(413, 'Файл слишком большой.');
      }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export async function uploadProjectAttachment(
  database: PrismaClient,
  actor: User,
  projectId: string,
  input: { filename: string; mediaType: string; bytes: Uint8Array },
) {
  assert(input.bytes.byteLength <= MAX_ATTACHMENT_BYTES, 413, 'Файл слишком большой.');
  const bytes = Buffer.from(input.bytes);
  const validated = validateProjectAttachment({ ...input, bytes });
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return database.$transaction(
    async (tx) => {
      // Every upload/deletion locks its uploader first, then the project. The user
      // lock protects a cross-project quota; the project lock protects both participants.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.id} FOR NO KEY UPDATE`;
      await account(tx, actor.id, true);
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
      await projectAccess(tx, actor.id, projectId, true);
      const existing = await tx.projectAttachment.findUnique({
        where: { projectId_uploaderId_sha256: { projectId, uploaderId: actor.id, sha256 } },
        select: metadataSelect,
      });
      if (existing) return { attachment: metadata(existing) };
      const projectTotals = await tx.projectAttachment.aggregate({
        where: { projectId },
        _count: { id: true },
        _sum: { byteSize: true },
      });
      const ownerTotals = await tx.projectAttachment.aggregate({
        where: { uploaderId: actor.id },
        _sum: { byteSize: true },
      });
      assert(
        projectTotals._count.id < MAX_PROJECT_ATTACHMENTS,
        409,
        'В заказе уже сохранено максимальное число файлов.',
      );
      assert(
        (projectTotals._sum.byteSize ?? 0) + bytes.byteLength <= MAX_PROJECT_ATTACHMENT_BYTES,
        409,
        'Общий размер файлов заказа превышает лимит.',
      );
      assert(
        (ownerTotals._sum.byteSize ?? 0) + bytes.byteLength <= MAX_USER_ATTACHMENT_BYTES,
        409,
        'Общий размер ваших файлов превышает лимит.',
      );
      const attachment = await tx.projectAttachment.create({
        data: {
          projectId,
          uploaderId: actor.id,
          filename: validated.filename,
          mediaType: validated.mediaType,
          byteSize: bytes.byteLength,
          sha256,
          bytes,
        },
        select: metadataSelect,
      });
      return { attachment: metadata(attachment) };
    },
    { maxWait: 5_000, timeout: 15_000 },
  );
}

export async function downloadProjectAttachment(
  database: PrismaClient,
  actor: User,
  attachmentId: string,
) {
  assert(attachmentId.length > 0 && attachmentId.length <= 100, 404, 'Файл недоступен.');
  return database.$transaction(
    async (tx) => {
      await account(tx, actor.id);
      const attachment = await tx.projectAttachment.findUnique({
        where: { id: attachmentId },
        select: metadataSelect,
      });
      assert(attachment, 404, 'Файл недоступен.');
      await projectAccess(tx, actor.id, attachment.projectId);
      const stored = await tx.projectAttachment.findUniqueOrThrow({
        where: { id: attachmentId },
        select: { bytes: true, sha256: true },
      });
      const { bytes, sha256 } = stored;
      assert(
        bytes.byteLength === attachment.byteSize &&
          createHash('sha256').update(bytes).digest('hex') === sha256,
        503,
        'Файл временно недоступен. Обратитесь к оператору.',
      );
      return { attachment: metadata(attachment), bytes };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function deleteProjectAttachment(
  database: PrismaClient,
  actor: User,
  attachmentId: string,
) {
  assert(attachmentId.length > 0 && attachmentId.length <= 100, 404, 'Файл недоступен.');
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.id} FOR NO KEY UPDATE`;
    await account(tx, actor.id, true);
    const target = await tx.projectAttachment.findUnique({
      where: { id: attachmentId },
      select: { projectId: true },
    });
    assert(target, 404, 'Файл недоступен.');
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${target.projectId} FOR UPDATE`;
    await projectAccess(tx, actor.id, target.projectId);
    const attachment = await tx.projectAttachment.findUnique({
      where: { id: attachmentId },
      select: metadataSelect,
    });
    assert(attachment?.uploaderId === actor.id, 404, 'Файл недоступен.');
    assert(
      attachment.submissions.length === 0,
      409,
      'Файл уже включён в сдачу и сохранён в истории.',
    );
    await tx.projectAttachment.delete({ where: { id: attachmentId } });
    return { removed: true as const };
  });
}
