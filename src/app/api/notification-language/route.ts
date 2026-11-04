import { db } from '@/lib/db';
import { notificationLanguageInput } from '@/lib/notification-language';
import { assert } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/session';
import { apiFailure, apiSuccess, readJsonObject, requireSameOrigin } from '@/server/api/http';
import { getNotificationLanguage, setNotificationLanguage } from '@/server/notification-language';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess({ language: await getNotificationLanguage(db, user.id) });
  } catch (error) {
    return apiFailure(error, 'notification-language.read');
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    const { language } = notificationLanguageInput.parse(await readJsonObject(request, 1024));
    await setNotificationLanguage(db, user.id, language);
    return apiSuccess({ language });
  } catch (error) {
    return apiFailure(error, 'notification-language.write');
  }
}
