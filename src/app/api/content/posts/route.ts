import { apiSuccess, apiFailure } from '@/server/api/http';
import { publicContentQueryInput } from '@/lib/content-validation';
import { queryPublicContent } from '@/server/content/public';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = publicContentQueryInput.parse(Object.fromEntries(params));
    return apiSuccess(await queryPublicContent(query.limit, query));
  } catch (error) {
    return apiFailure(error, 'content.public');
  }
}
