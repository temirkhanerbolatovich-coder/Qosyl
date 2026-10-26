import { getSmtpSettings } from './mail-settings';
export const config = {
  productName: 'Qosyl',
  baseUrl: new URL(process.env.BETTER_AUTH_URL || 'http://localhost:3000').origin,
  localMode: process.env.LOCAL_DEV_MODE === 'true',
  demoEnabled: process.env.DEMO_ENABLED === 'true',
  timeZone: 'Asia/Qyzylorda',
};

// Enforced when server modules load as well as by npm start; alternate launch commands cannot bypass it.
if (config.localMode) {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.baseUrl).hostname))
    throw new Error('LOCAL_DEV_MODE разрешен только для loopback-адреса.');
} else {
  if (!config.baseUrl.startsWith('https://'))
    throw new Error('Публичная конфигурация требует HTTPS и подтверждения email.');
  if (config.demoEnabled) throw new Error('Демонстрационные данные запрещены в публичном режиме.');
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'])
    if (!process.env[key]) throw new Error(`Публичный режим требует ${key}.`);
  getSmtpSettings(process.env);
}
if ((process.env.BETTER_AUTH_SECRET?.length ?? 0) < 32)
  throw new Error('BETTER_AUTH_SECRET должен содержать минимум32 случайных символа.');
