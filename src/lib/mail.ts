import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '@/lib/config';
import { getSmtpSettings } from '@/lib/mail-settings';

type Message = { to: string; subject: string; text: string };

/** Local mail is deliberately filesystem-only: no route exposes reset tokens. */
export async function sendMail(message: Message): Promise<void> {
  if (config.localMode) {
    const hostname = new URL(config.baseUrl).hostname;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
      throw new Error('Локальная почта разрешена только для loopback URL.');
    }
    const directory = path.join(process.cwd(), '.local', 'mail');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      path.join(directory, `${Date.now()}-${randomUUID()}.json`),
      JSON.stringify({ ...message, createdAt: new Date().toISOString() }, null, 2),
      { mode: 0o600 },
    );
    return;
  }

  const settings = getSmtpSettings(process.env);
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport(settings.transport);
  await transport.sendMail({ from: settings.from, ...message });
}
