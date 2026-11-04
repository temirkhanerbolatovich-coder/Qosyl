import { getCurrentUser } from '@/lib/session';
import { assert } from '@/lib/permissions';
import { apiSuccess, apiFailure, requireSameOrigin, readJsonObject } from '@/server/api/http';
import { caseCommand } from '@/lib/portfolio-case';
import { readCases, changeCase } from '@/server/profile/portfolio';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    assert(user.roles.includes('student'), 403, 'Нужен профиль исполнителя.');
    return apiSuccess({ items: await readCases(user.id) });
  } catch (error) {
    return apiFailure(error, 'portfolio.read');
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await getCurrentUser();
    assert(user, 401, 'Войдите в аккаунт.');
    const command = caseCommand.parse(await readJsonObject(request, 32_768));
    return apiSuccess({ items: await changeCase(user.id, command) });
  } catch (error) {
    return apiFailure(error, 'portfolio.change');
  }
}
