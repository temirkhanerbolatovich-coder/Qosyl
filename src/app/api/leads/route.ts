import { getCurrentUser } from '@/lib/session';
import { assert } from '@/lib/permissions';
import { apiSuccess, apiFailure, requireSameOrigin, readJsonObject } from '@/server/api/http';
import { queryLeadHandoffs, convertLead } from '@/server/leads/service';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess(
      await queryLeadHandoffs(user, Number(new URL(request.url).searchParams.get('page') ?? 1)),
    );
  } catch (error) {
    return apiFailure(error, 'leads.handoffs');
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess(await convertLead(await readJsonObject(request, 65536), user));
  } catch (error) {
    return apiFailure(error, 'leads.convert');
  }
}
