import { z } from 'zod';

const smtpSchema = z.object({
  SMTP_HOST: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9.-]+$/),
  SMTP_PORT: z.enum(['465', '587']),
  SMTP_USER: z
    .string()
    .min(1)
    .max(500)
    .refine((value) => !/[\r\n]/.test(value)),
  SMTP_PASSWORD: z.string().min(1).max(1000),
  SMTP_FROM: z.email().max(254),
});

/** Validation errors identify fields only; configuration values can contain secrets. */
export function getSmtpSettings(environment: Record<string, string | undefined>) {
  const parsed = smtpSchema.safeParse(environment);
  if (!parsed.success)
    throw new Error(
      `Проверьте настройки почты: ${[...new Set(parsed.error.issues.map((issue) => issue.path[0]))].join(', ')}. Используйте SMTP465/TLS или587/STARTTLS и адрес отправителя без заголовков.`,
    );
  const values = parsed.data;
  const port = Number(values.SMTP_PORT);
  return {
    from: values.SMTP_FROM,
    transport: {
      host: values.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      tls: { rejectUnauthorized: true },
      auth: { user: values.SMTP_USER, pass: values.SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    },
  };
}
