import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { assert } from '@/lib/permissions';
import { apiFailure, apiSuccess, requireSameOrigin } from '@/server/api/http';
import { deleteProjectAttachment, downloadProjectAttachment } from '@/server/attachments/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getCurrentUser();
    assert(actor, 401, 'Войдите в аккаунт.');
    const result = await downloadProjectAttachment(db, actor, (await context.params).id);
    const encodedName = encodeURIComponent(result.attachment.filename).replace(
      /[!'()*]/g,
      (value) => '%' + value.charCodeAt(0).toString(16).toUpperCase(),
    );
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="qosyl-attachment"; filename*=UTF-8''${encodedName}`,
        'Content-Length': String(result.bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': 'sandbox',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    return apiFailure(error, 'attachments.download');
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await getCurrentUser();
    assert(actor, 401, 'Войдите в аккаунт.');
    return apiSuccess(await deleteProjectAttachment(db, actor, (await context.params).id));
  } catch (error) {
    return apiFailure(error, 'attachments.delete');
  }
}
