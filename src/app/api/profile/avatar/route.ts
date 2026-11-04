import { avatarVisibilityInput, avatarDeleteInput } from '@/contracts/avatar';
import { getCurrentUser } from '@/lib/session';
import { assert } from '@/lib/permissions';
import { apiSuccess, apiFailure, requireSameOrigin, readJsonObject } from '@/server/api/http';
import { readAttachmentBody } from '@/server/attachments/service';
import { beginAvatarMutation, readOwnAvatar, writeAvatar } from '@/server/profile/avatar';
import { sanitizeAvatar } from '@/server/profile/avatar-image';
import { MAX_AVATAR_BYTES } from '@/lib/avatar';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess({ avatar: await readOwnAvatar(user.id) });
  } catch (error) {
    return apiFailure(error, 'avatar.read');
  }
}
async function mutate(request: Request, operation: 'upload' | 'visibility' | 'delete') {
  try {
    requireSameOrigin(request);
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    await beginAvatarMutation(user.id);
    if (operation === 'upload') {
      const mediaType =
        request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
      assert(['image/jpeg', 'image/png'].includes(mediaType), 415, 'Разрешены только JPEG и PNG.');
      const bytes = await sanitizeAvatar(
        await readAttachmentBody(request, MAX_AVATAR_BYTES),
        mediaType,
      );
      return apiSuccess({ avatar: await writeAvatar(user.id, { bytes }) });
    }
    const body = await readJsonObject(request, 1024);
    const change =
      operation === 'visibility'
        ? avatarVisibilityInput.parse(body)
        : { ...avatarDeleteInput.parse(body), remove: true as const };
    return apiSuccess({ avatar: await writeAvatar(user.id, change) });
  } catch (error) {
    return apiFailure(error, `avatar.${operation}`);
  }
}
export const POST = (request: Request) => mutate(request, 'upload');
export const PATCH = (request: Request) => mutate(request, 'visibility');
export const DELETE = (request: Request) => mutate(request, 'delete');
