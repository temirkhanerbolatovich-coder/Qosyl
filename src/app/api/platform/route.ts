import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { assert } from '@/lib/permissions';
import { mutateMarketplace, queryMarketplace } from '@/server/marketplace';
import { apiFailure, apiSuccess, readJsonObject, requireSameOrigin } from '@/server/api/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    return apiSuccess(await queryMarketplace(request.nextUrl.searchParams, await getCurrentUser()));
  } catch (error) {
    return apiFailure(error, 'platform.query');
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const input = await readJsonObject(request, 65_536);
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    return apiSuccess(await mutateMarketplace(input, user));
  } catch (error) {
    return apiFailure(error, 'platform.command');
  }
}
