import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { AppError, assert } from '@/lib/permissions';
import { attachmentMediaTypes } from '@/lib/project-attachments';
import { apiFailure, apiSuccess, requireSameOrigin } from '@/server/api/http';
import {
  assertProjectAttachmentUploadAccess,
  readAttachmentBody,
  readProjectAttachmentList,
  uploadProjectAttachment,
} from '@/server/attachments/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getCurrentUser();
    assert(actor, 401, 'Войдите в аккаунт.');
    return apiSuccess(await readProjectAttachmentList(db, actor, (await context.params).id));
  } catch (error) {
    return apiFailure(error, 'attachments.list');
  }
}

export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await getCurrentUser();
    assert(actor, 401, 'Войдите в аккаунт.');
    const projectId = (await context.params).id;
    await assertProjectAttachmentUploadAccess(db, actor, projectId);
    let filename: string;
    try {
      filename = decodeURIComponent(request.headers.get('x-file-name') ?? '');
    } catch {
      throw new AppError(400, 'Некорректное имя файла.');
    }
    const mediaType =
      request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
    assert(
      attachmentMediaTypes.some((type) => type === mediaType),
      415,
      'Разрешены только PDF, PNG, JPEG и TXT.',
    );
    const bytes = await readAttachmentBody(request);
    return apiSuccess(
      await uploadProjectAttachment(db, actor, projectId, { filename, mediaType, bytes }),
    );
  } catch (error) {
    return apiFailure(error, 'attachments.upload');
  }
}
