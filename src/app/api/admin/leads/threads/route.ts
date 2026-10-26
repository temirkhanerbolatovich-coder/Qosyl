import { getCurrentUser } from '@/lib/session';
import { assert } from '@/lib/permissions';
import { apiSuccess, apiFailure, readJsonObject, requireSameOrigin } from '@/server/api/http';
import { queryThreads, threadsStatus } from '@/server/leads/threads-service';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess(await threadsStatus(user));
  } catch (error) {
    return apiFailure(error, 'leads.threads.status');
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess(await queryThreads(await readJsonObject(request, 2048), user));
  } catch (error) {
    return apiFailure(error, 'leads.threads.search');
  }
}
