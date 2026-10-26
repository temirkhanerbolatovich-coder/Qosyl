import { getCurrentUser } from '@/lib/session';
import { assert } from '@/lib/permissions';
import { apiSuccess, apiFailure, readJsonObject, requireSameOrigin } from '@/server/api/http';
import { queryContentIntake, mutateContentIntake } from '@/server/content/service';
import { publicContentQueryInput, contentQueueInput } from '@/lib/content-validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    const params = new URL(request.url).searchParams;
    const query = contentQueueInput.parse({
      page: params.get('page') ?? undefined,
      status: params.get('status') ?? undefined,
    });
    return apiSuccess(
      await queryContentIntake(
        user,
        query.page,
        query.status,
        publicContentQueryInput.parse(Object.fromEntries(params)),
      ),
    );
  } catch (error) {
    return apiFailure(error, 'content.query');
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess(await mutateContentIntake(await readJsonObject(request, 32768), user));
  } catch (error) {
    return apiFailure(error, 'content.mutate');
  }
}
