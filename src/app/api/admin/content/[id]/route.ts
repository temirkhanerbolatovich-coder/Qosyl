import { getCurrentUser } from '@/lib/session';
import { assert } from '@/lib/permissions';
import { apiSuccess, apiFailure } from '@/server/api/http';
import { queryContentDetail } from '@/server/content/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    const { id } = await context.params;
    return apiSuccess(
      await queryContentDetail(
        user,
        id,
        Number(new URL(request.url).searchParams.get('page') ?? 1),
      ),
    );
  } catch (error) {
    return apiFailure(error, 'content.detail');
  }
}
