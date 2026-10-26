import { getCurrentUser } from '@/lib/session';
import { assert } from '@/lib/permissions';
import { apiFailure, apiSuccess, readJsonObject, requireSameOrigin } from '@/server/api/http';
import { getPrivateProfile, updateProfile } from '@/server/profile/service';
import { profileInput } from './schema';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess(getPrivateProfile(user));
  } catch (error) {
    return apiFailure(error, 'profile.read', {
      fallbackStatus: 503,
      fallbackMessage: 'Не удалось загрузить профиль. Повторите позже.',
    });
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    const data = profileInput.parse(await readJsonObject(request, 16_384));
    await updateProfile(user, data);
    return apiSuccess({ saved: true, role: data.role });
  } catch (error) {
    return apiFailure(error, 'profile.update', {
      fallbackStatus: 503,
      fallbackMessage: 'Не удалось сохранить профиль. Повторите позже.',
      validationMessage: 'Проверьте имя, город, ссылки и остальные поля профиля.',
      includeFields: true,
    });
  }
}
