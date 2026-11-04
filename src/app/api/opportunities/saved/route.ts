import { getCurrentUser } from '@/lib/session';
import { db } from '@/lib/db';
import { assert } from '@/lib/permissions';
import { apiFailure, apiSuccess, readJsonObject, requireSameOrigin } from '@/server/api/http';
import { mutateOpportunitySaves, queryOpportunitySaves } from '@/server/content/saved';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess(await queryOpportunitySaves(db, user));
  } catch (error) {
    return apiFailure(error, 'opportunity.saved.read');
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess(await mutateOpportunitySaves(db, user, await readJsonObject(request, 8192)));
  } catch (error) {
    return apiFailure(error, 'opportunity.saved.write');
  }
}
