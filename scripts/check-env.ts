import 'dotenv/config';
import { getSmtpSettings } from '../src/lib/mail-settings';
const base = new URL(process.env.BETTER_AUTH_URL || 'http://localhost:3000');
if (!process.env.DATABASE_URL || (process.env.BETTER_AUTH_SECRET?.length ?? 0) < 32)
  throw new Error('Задайте DATABASE_URL и BETTER_AUTH_SECRET (32+ символов).');
if (process.env.LOCAL_DEV_MODE === 'true') {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
    throw new Error('Локальный режим запрещен для публичного адреса.');
  console.log('Локальная демонстрация: почта в .local/mail, сервер привязан к loopback.');
} else {
  if (base.protocol !== 'https:') throw new Error('Публичный сервер требует HTTPS.');
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
    if (!process.env[key]) throw new Error(`Публичный запуск запрещен без ${key}.`);
  }
  if (process.env.DEMO_ENABLED === 'true')
    throw new Error('Публичный запуск требует DEMO_ENABLED=false.');
  getSmtpSettings(process.env);
}
