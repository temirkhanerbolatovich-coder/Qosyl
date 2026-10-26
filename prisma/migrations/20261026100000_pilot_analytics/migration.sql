-- Existing application rows remain unchanged. The collection start is persisted
-- at migration time so unmeasured historical views cannot be presented as zero.
BEGIN;

CREATE TYPE "PilotCostKind" AS ENUM ('acquisition', 'moderation', 'support', 'operations');

CREATE TABLE "ProjectView" (
  "projectId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectView_pkey" PRIMARY KEY ("projectId", "studentId")
);
CREATE INDEX "ProjectView_studentId_idx" ON "ProjectView"("studentId");
CREATE INDEX "ProjectView_firstViewedAt_idx" ON "ProjectView"("firstViewedAt");
ALTER TABLE "ProjectView"
  ADD CONSTRAINT "ProjectView_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectView_studentId_fkey" FOREIGN KEY ("studentId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TRIGGER immutable_project_view
  BEFORE UPDATE OR DELETE ON "ProjectView"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TABLE "PilotAnalyticsSettings" (
  "id" TEXT NOT NULL,
  "viewsStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PilotAnalyticsSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PilotAnalyticsSettings_singleton" CHECK ("id" = 'pilot')
);
INSERT INTO "PilotAnalyticsSettings" ("id") VALUES ('pilot');
CREATE TRIGGER immutable_pilot_analytics_settings
  BEFORE UPDATE OR DELETE ON "PilotAnalyticsSettings"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TABLE "PilotCostEntry" (
  "id" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "projectId" TEXT,
  "kind" "PilotCostKind" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "minutes" INTEGER NOT NULL,
  "amountKzt" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMP(3),
  "voidedById" TEXT,
  "voidReason" TEXT,
  CONSTRAINT "PilotCostEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PilotCostEntry_valid_totals" CHECK (
    "minutes" BETWEEN 0 AND 100000 AND "amountKzt" BETWEEN 0 AND 10000000
    AND ("minutes" > 0 OR "amountKzt" > 0)
  ),
  CONSTRAINT "PilotCostEntry_valid_description" CHECK (
    length(btrim("description")) BETWEEN 3 AND 1000
  ),
  CONSTRAINT "PilotCostEntry_valid_idempotency_key" CHECK (
    length(btrim("idempotencyKey")) BETWEEN 1 AND 100
  ),
  CONSTRAINT "PilotCostEntry_complete_void" CHECK (
    ("voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL)
    OR ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND "voidReason" IS NOT NULL
      AND length(btrim("voidReason")) BETWEEN 10 AND 1000)
  )
);
CREATE UNIQUE INDEX "PilotCostEntry_recordedById_idempotencyKey_key"
  ON "PilotCostEntry"("recordedById", "idempotencyKey");
CREATE INDEX "PilotCostEntry_occurredAt_id_idx" ON "PilotCostEntry"("occurredAt", "id");
CREATE INDEX "PilotCostEntry_projectId_idx" ON "PilotCostEntry"("projectId");
ALTER TABLE "PilotCostEntry"
  ADD CONSTRAINT "PilotCostEntry_recordedById_fkey" FOREIGN KEY ("recordedById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PilotCostEntry_voidedById_fkey" FOREIGN KEY ("voidedById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PilotCostEntry_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION protect_pilot_cost_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Pilot costs are retained; record a void instead';
  END IF;
  IF ROW(NEW."id", NEW."recordedById", NEW."projectId", NEW."kind", NEW."occurredAt",
      NEW."minutes", NEW."amountKzt", NEW."description", NEW."idempotencyKey", NEW."createdAt")
    IS DISTINCT FROM
    ROW(OLD."id", OLD."recordedById", OLD."projectId", OLD."kind", OLD."occurredAt",
      OLD."minutes", OLD."amountKzt", OLD."description", OLD."idempotencyKey", OLD."createdAt")
  THEN
    RAISE EXCEPTION 'Pilot cost input and identity are immutable';
  END IF;
  IF OLD."voidedAt" IS NOT NULL OR NEW."voidedAt" IS NULL THEN
    RAISE EXCEPTION 'A pilot cost permits only its first complete void';
  END IF;
  -- The complete_void CHECK verifies actor and reason together with the timestamp.
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_pilot_cost_entry
  BEFORE UPDATE OR DELETE ON "PilotCostEntry"
  FOR EACH ROW EXECUTE FUNCTION protect_pilot_cost_history();

COMMIT;
