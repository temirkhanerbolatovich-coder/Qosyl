-- Windows PostgreSQL may inherit Asia/Qyzylorda. Prisma's timestamp decoder uses
-- UTC, so bare CURRENT_TIMESTAMP would otherwise store a wall clock five hours ahead.
BEGIN;
ALTER TABLE "ProjectView" ALTER COLUMN "firstViewedAt"
  SET DEFAULT timezone('UTC', CURRENT_TIMESTAMP);
ALTER TABLE "PilotAnalyticsSettings" ALTER COLUMN "viewsStartedAt"
  SET DEFAULT timezone('UTC', CURRENT_TIMESTAMP);
ALTER TABLE "PilotCostEntry" ALTER COLUMN "createdAt"
  SET DEFAULT timezone('UTC', CURRENT_TIMESTAMP);

-- This collection has not been deployed to users yet. Reinitialize technical
-- start metadata only while both new journals are empty; never shift user history.
ALTER TABLE "PilotAnalyticsSettings" DISABLE TRIGGER immutable_pilot_analytics_settings;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "ProjectView") AND NOT EXISTS (SELECT 1 FROM "PilotCostEntry") THEN
    UPDATE "PilotAnalyticsSettings" SET "viewsStartedAt" = timezone('UTC', clock_timestamp())
      WHERE "id" = 'pilot';
  ELSIF EXISTS (
    SELECT 1 FROM "PilotAnalyticsSettings"
    WHERE "viewsStartedAt" > timezone('UTC', clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Collection has records and a future start; inspect timestamps before proceeding';
  END IF;
END;
$$;
ALTER TABLE "PilotAnalyticsSettings" ENABLE TRIGGER immutable_pilot_analytics_settings;
COMMIT;
