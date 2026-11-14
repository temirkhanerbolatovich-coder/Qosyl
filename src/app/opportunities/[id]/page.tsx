import { notFound } from 'next/navigation';
import { publicContentPostSchema } from '@/contracts/content-intake';
import { queryPublicContentDetail, querySimilarOpportunities } from '@/server/content/public';
import { OpportunityDetail } from '@/components/opportunity-detail-page';

export const dynamic = 'force-dynamic';

function returnPath(input: string | string[] | undefined) {
  if (typeof input !== 'string' || !input.startsWith('/') || input.startsWith('//')) {
    return '/opportunities';
  }
  try {
    const url = new URL(input, 'https://qosyl.invalid');
    if (
      url.origin !== 'https://qosyl.invalid' ||
      !['/', '/opportunities', '/opportunities/saved'].includes(url.pathname)
    ) {
      return '/opportunities';
    }
    return url.pathname + url.search;
  } catch {
    return '/opportunities';
  }
}

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id } = await params;
  const post = await queryPublicContentDetail(id);
  if (!post) notFound();
  const serialized = publicContentPostSchema.parse(JSON.parse(JSON.stringify(post)));
  const similar = (await querySimilarOpportunities(id)).map((item) => ({
    reason: item.reason,
    post: publicContentPostSchema.parse(JSON.parse(JSON.stringify(item.post))),
  }));
  const { from } = await searchParams;
  const back = returnPath(from);
  const catalogue = back === '/opportunities' || back.startsWith('/opportunities?');
  return (
    <OpportunityDetail
      key={serialized.id + serialized.expiresAt}
      post={serialized}
      similar={similar}
      returnTo={catalogue ? `${back}#opportunity-${encodeURIComponent(id)}` : back}
    />
  );
}
