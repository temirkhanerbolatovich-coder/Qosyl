import { getCurrentUser } from '@/lib/session';
import { assert } from '@/lib/permissions';
import { apiSuccess, apiFailure, requireSameOrigin, readJsonObject } from '@/server/api/http';
import { queryLeads, mutateLead } from '@/server/leads/service';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess(await queryLeads(new URL(request.url).searchParams, user));
  } catch (error) {
    return apiFailure(error, 'leads.query');
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess(await mutateLead(await readJsonObject(request, 32768), user));
  } catch (error) {
    return apiFailure(error, 'leads.mutate');
  }
}
