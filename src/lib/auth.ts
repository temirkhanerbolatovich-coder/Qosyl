import 'server-only';

import { betterAuth, getCurrentAdapter } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { sendMail } from '@/lib/mail';

export const auth = betterAuth({
  appName: config.productName,
  baseURL: config.baseUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: 'postgresql', transaction: true }),
  trustedOrigins: [config.baseUrl],
  disabledPaths: ['/update-user', '/change-email', '/delete-user'],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: !config.localMode,
    autoSignIn: config.localMode,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 30 * 60,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: `${config.productName} — восстановление доступа`,
        text: `Ссылка для смены пароля действует 30 минут: ${url}\nЕсли вы не запрашивали письмо, проигнорируйте его.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: !config.localMode,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: `${config.productName} — подтверждение email`,
        text: `Подтвердите email по ссылке: ${url}\nСсылка действует один час.`,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  user: {
    additionalFields: {
      adultConfirmedAt: { type: 'date', required: false, input: false },
      termsAcceptedAt: { type: 'date', required: false, input: false },
      status: {
        type: 'string',
        required: false,
        input: false,
        returned: false,
        defaultValue: 'active',
      },
      statusReason: { type: 'string', required: false, input: false, returned: false },
      demo: {
        type: 'boolean',
        required: false,
        input: false,
        returned: false,
        defaultValue: false,
      },
    },
    changeEmail: { enabled: false },
    deleteUser: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 120,
    customRules: {
      '/sign-up/email': { window: 60, max: 6 },
      '/sign-in/email': { window: 60, max: 10 },
      '/request-password-reset': { window: 60, max: 4 },
      '/reset-password': { window: 60, max: 6 },
      '/send-verification-email': { window: 60, max: 4 },
    },
  },
  advanced: {
    useSecureCookies: new URL(config.baseUrl).protocol === 'https:',
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-up/email') {
        if (ctx.body?.adultConfirmed !== true || ctx.body?.privacyConsent !== true) {
          throw new APIError('BAD_REQUEST', {
            message:
              'Для участия в пилоте подтвердите возраст 18+ и согласие с условиями обработки данных.',
          });
        }
        if (
          typeof ctx.body?.name !== 'string' ||
          ctx.body.name.trim().length < 2 ||
          ctx.body.name.length > 100
        ) {
          throw new APIError('BAD_REQUEST', {
            message: 'Укажите имя длиной от 2 до 100 символов.',
          });
        }
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            adultConfirmedAt: new Date(),
            termsAcceptedAt: new Date(),
          },
        }),
        after: async (user) => {
          await db.moderationAction.create({
            data: {
              actorId: user.id,
              targetId: user.id,
              action: 'account_registered',
              reason: 'Регистрация с подтверждением возраста 18+ и согласием на условия пилота.',
            },
          });
        },
      },
    },
    session: {
      create: {
        before: async (session, context) => {
          if (!context) return false;
          // Signup creates the account and first session in one transaction.
          // Reading via the auth adapter sees that uncommitted account safely.
          const adapter = await getCurrentAdapter(context.context.adapter);
          const user = await adapter.findOne<{
            status: string;
            statusReason: string | null;
            demo: boolean;
          }>({
            model: 'user',
            where: [{ field: 'id', value: session.userId }],
          });
          if (!user) return false;
          if (user.demo && !config.demoEnabled) {
            throw new APIError('FORBIDDEN', {
              message: 'Демонстрационный аккаунт недоступен в этом окружении.',
            });
          }
          if (user.status !== 'active') {
            throw new APIError('FORBIDDEN', {
              message: `Аккаунт приостановлен. ${user.statusReason || 'Обратитесь к модератору через раздел помощи.'}`,
            });
          }
          return { data: session };
        },
        after: async (session) => {
          await db.user.update({
            where: { id: session.userId },
            data: { lastLoginAt: new Date() },
          });
        },
      },
    },
  },
});
