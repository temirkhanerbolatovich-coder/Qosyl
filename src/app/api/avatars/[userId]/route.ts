import { getCurrentUser } from '@/lib/session';
import { assert } from '@/lib/permissions';
import { apiFailure } from '@/server/api/http';
import { readAvatar } from '@/server/profile/avatar';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    assert(userId.length > 0 && userId.length <= 100, 404, 'Изображение недоступно.');
    const viewer = await getCurrentUser();
    const avatar = await readAvatar(userId, viewer?.id);
    assert(avatar, 404, 'Изображение недоступно.');
    return new Response(new Uint8Array(avatar.bytes), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(avatar.bytes.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline; filename="avatar.jpg"',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  } catch (error) {
    return apiFailure(error, 'avatar.image');
  }
}
