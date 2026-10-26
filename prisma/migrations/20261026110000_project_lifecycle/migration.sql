-- Existing event authors and notifications remain unchanged. System events no
-- longer need to impersonate an owner, and automatic deliveries retain their key.
BEGIN;

ALTER TABLE "ProjectEvent" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_valid_dedupe_key"
  CHECK ("dedupeKey" IS NULL OR length(btrim("dedupeKey")) BETWEEN 1 AND 200);

CREATE FUNCTION protect_automatic_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."dedupeKey" IS NOT NULL THEN
      RAISE EXCEPTION 'Automatic notification delivery keys are retained';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."dedupeKey" IS NOT NULL OR NEW."dedupeKey" IS NOT NULL THEN
    IF ROW(NEW.id, NEW."userId", NEW.text, NEW.url, NEW."createdAt", NEW."dedupeKey")
      IS DISTINCT FROM
      ROW(OLD.id, OLD."userId", OLD.text, OLD.url, OLD."createdAt", OLD."dedupeKey")
    THEN
      RAISE EXCEPTION 'Automatic notification identity and content are immutable';
    END IF;
  END IF;
  -- Reading or marking unread does not affect the retained delivery identity.
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_automatic_notification
  BEFORE UPDATE OR DELETE ON "Notification"
  FOR EACH ROW EXECUTE FUNCTION protect_automatic_notification();

CREATE TABLE "BackgroundJobRun" (
  "id" TEXT NOT NULL,
  "job" TEXT NOT NULL DEFAULT 'project-lifecycle',
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC', CURRENT_TIMESTAMP),
  "finishedAt" TIMESTAMP(3) NOT NULL,
  "expiredProjects" INTEGER NOT NULL DEFAULT 0,
  "remindersCreated" INTEGER NOT NULL DEFAULT 0,
  "scannedProjects" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "nextCursor" TEXT,
  CONSTRAINT "BackgroundJobRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BackgroundJobRun_valid_job" CHECK ("job" = 'project-lifecycle'),
  CONSTRAINT "BackgroundJobRun_valid_status" CHECK ("status" IN ('completed', 'busy', 'failed')),
  CONSTRAINT "BackgroundJobRun_nonnegative_counts" CHECK (
    "expiredProjects" >= 0 AND "remindersCreated" >= 0 AND "scannedProjects" >= 0
  ),
  CONSTRAINT "BackgroundJobRun_valid_times" CHECK ("finishedAt" >= "startedAt"),
  CONSTRAINT "BackgroundJobRun_valid_error_code" CHECK (
    "errorCode" IS NULL OR length(btrim("errorCode")) BETWEEN 1 AND 100
  )
);
CREATE INDEX "BackgroundJobRun_job_startedAt_idx" ON "BackgroundJobRun"("job", "startedAt");
CREATE TRIGGER immutable_background_job_run
  BEFORE UPDATE OR DELETE ON "BackgroundJobRun"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

COMMIT;
