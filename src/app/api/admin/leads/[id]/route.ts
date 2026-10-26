import { getCurrentUser } from '@/lib/session';
import { assert } from '@/lib/permissions';
import { apiSuccess, apiFailure } from '@/server/api/http';
import { queryLeadDetail } from '@/server/leads/service';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess(
      await queryLeadDetail(
        (await context.params).id,
        Number(new URL(request.url).searchParams.get('page') ?? 1),
        user,
      ),
    );
  } catch (error) {
    return apiFailure(error, 'leads.detail');
  }
}
