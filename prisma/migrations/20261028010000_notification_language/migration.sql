CREATE TABLE "NotificationPreference" (
  "userId" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'ru',
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "NotificationPreference_language_check" CHECK ("language" IN ('ru', 'kk')),
  CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
