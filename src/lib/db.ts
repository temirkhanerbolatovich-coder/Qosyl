import 'server-only';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const globalDb = globalThis as unknown as { marketplaceDb?: PrismaClient };
export const db =
  globalDb.marketplaceDb ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      // Prisma maps timestamp-without-time-zone to UTC; database defaults must use the same clock.
      options: '-c timezone=UTC',
    }),
  });
if (process.env.NODE_ENV !== 'production') globalDb.marketplaceDb = db;
