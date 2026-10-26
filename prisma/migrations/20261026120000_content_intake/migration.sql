-- New, disabled, closed content intake. Existing marketplace data is untouched.
BEGIN;

CREATE TABLE "ContentModuleSettings" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC', CURRENT_TIMESTAMP),
  CONSTRAINT "ContentModuleSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContentModuleSettings_singleton" CHECK ("id" = 'content')
);
INSERT INTO "ContentModuleSettings" ("id") VALUES ('content');

CREATE TABLE "ContentSource" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "feedUrl" TEXT,
  "allowedHost" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "rightsNote" TEXT NOT NULL,
  "termsUrl" TEXT,
  "intervalMinutes" INTEGER NOT NULL DEFAULT 360,
  "maxItems" INTEGER NOT NULL DEFAULT 50,
  "lastCheckedAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
  "nextRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC', CURRENT_TIMESTAMP),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC', CURRENT_TIMESTAMP),
  CONSTRAINT "ContentSource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContentSource_valid_type" CHECK ("type" IN ('manual', 'rss')),
  CONSTRAINT "ContentSource_feed_matches_type" CHECK (
    ("type" = 'manual' AND "feedUrl" IS NULL)
    OR ("type" = 'rss' AND "feedUrl" IS NOT NULL AND "feedUrl" ~ '^https://')
  ),
  CONSTRAINT "ContentSource_valid_name" CHECK (length(btrim("name")) BETWEEN 1 AND 200),
  CONSTRAINT "ContentSource_valid_host" CHECK (
    length("allowedHost") BETWEEN 1 AND 253
    AND "allowedHost" = lower("allowedHost")
    AND "allowedHost" ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
  ),
  CONSTRAINT "ContentSource_rights_recorded" CHECK (length(btrim("rightsNote")) BETWEEN 1 AND 2000),
  CONSTRAINT "ContentSource_valid_terms_url" CHECK ("termsUrl" IS NULL OR "termsUrl" ~ '^https://'),
  CONSTRAINT "ContentSource_bounded_schedule" CHECK (
    "intervalMinutes" BETWEEN 15 AND 10080 AND "maxItems" BETWEEN 1 AND 100
    AND "consecutiveErrors" >= 0
  )
);
CREATE INDEX "ContentSource_enabled_nextRunAt_idx" ON "ContentSource"("enabled", "nextRunAt");

CREATE TABLE "ContentItem" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "externalId" TEXT,
  "canonicalUrl" TEXT NOT NULL,
  "urlHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_review',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC', CURRENT_TIMESTAMP),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC', CURRENT_TIMESTAMP),
  CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContentItem_sourceId_fkey" FOREIGN KEY ("sourceId")
    REFERENCES "ContentSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContentItem_closed_status" CHECK ("status" IN ('pending_review', 'rejected', 'archived', 'withdrawn')),
  CONSTRAINT "ContentItem_https_url" CHECK ("canonicalUrl" ~ '^https://' AND length("canonicalUrl") <= 2000),
  CONSTRAINT "ContentItem_valid_hash" CHECK ("urlHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "ContentItem_valid_external_id" CHECK ("externalId" IS NULL OR length(btrim("externalId")) BETWEEN 1 AND 1000)
);
CREATE UNIQUE INDEX "ContentItem_sourceId_externalId_key" ON "ContentItem"("sourceId", "externalId");
CREATE UNIQUE INDEX "ContentItem_sourceId_urlHash_key" ON "ContentItem"("sourceId", "urlHash");
CREATE INDEX "ContentItem_status_createdAt_idx" ON "ContentItem"("status", "createdAt");

CREATE TABLE "ContentRevision" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "geography" TEXT NOT NULL DEFAULT '',
  "language" TEXT NOT NULL DEFAULT 'und',
  "publishedAt" TIMESTAMP(3),
  "publishedAtRaw" TEXT,
  "deadline" TIMESTAMP(3),
  "eventDate" TIMESTAMP(3),
  "score" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC', CURRENT_TIMESTAMP),
  CONSTRAINT "ContentRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContentRevision_itemId_fkey" FOREIGN KEY ("itemId")
    REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContentRevision_positive_number" CHECK ("number" > 0),
  CONSTRAINT "ContentRevision_bounded_text" CHECK (
    length(btrim("title")) BETWEEN 1 AND 300 AND length("summary") <= 2000
    AND length("geography") <= 200 AND length("language") BETWEEN 2 AND 35
    AND ("publishedAtRaw" IS NULL OR length("publishedAtRaw") <= 500)
  ),
  CONSTRAINT "ContentRevision_valid_category" CHECK ("category" IN ('hackathon', 'competition', 'internship', 'event', 'other')),
  CONSTRAINT "ContentRevision_valid_score" CHECK ("score" BETWEEN 0 AND 100),
  CONSTRAINT "ContentRevision_valid_hash" CHECK ("contentHash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "ContentRevision_itemId_number_key" ON "ContentRevision"("itemId", "number");
CREATE UNIQUE INDEX "ContentRevision_itemId_contentHash_key" ON "ContentRevision"("itemId", "contentHash");
CREATE TRIGGER immutable_content_revision BEFORE UPDATE OR DELETE ON "ContentRevision"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TABLE "CrawlRun" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "requestedById" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC', CURRENT_TIMESTAMP),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "leaseUntil" TIMESTAMP(3),
  "found" INTEGER NOT NULL DEFAULT 0,
  "created" INTEGER NOT NULL DEFAULT 0,
  "updated" INTEGER NOT NULL DEFAULT 0,
  "duplicates" INTEGER NOT NULL DEFAULT 0,
  "discarded" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "httpStatus" INTEGER,
  CONSTRAINT "CrawlRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrawlRun_sourceId_fkey" FOREIGN KEY ("sourceId")
    REFERENCES "ContentSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CrawlRun_requestedById_fkey" FOREIGN KEY ("requestedById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CrawlRun_valid_status" CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  CONSTRAINT "CrawlRun_nonnegative_counts" CHECK (
    "found" >= 0 AND "created" >= 0 AND "updated" >= 0 AND "duplicates" >= 0 AND "discarded" >= 0
  ),
  CONSTRAINT "CrawlRun_state_times" CHECK (
    ("status" = 'queued' AND "startedAt" IS NULL AND "finishedAt" IS NULL AND "leaseUntil" IS NULL)
    OR ("status" = 'running' AND "startedAt" IS NOT NULL AND "finishedAt" IS NULL
        AND "leaseUntil" IS NOT NULL AND "leaseUntil" > "startedAt")
    OR ("status" IN ('succeeded', 'failed', 'skipped') AND "finishedAt" IS NOT NULL AND "leaseUntil" IS NULL)
  ),
  CONSTRAINT "CrawlRun_ordered_times" CHECK ("startedAt" IS NULL OR "finishedAt" IS NULL OR "finishedAt" >= "startedAt"),
  CONSTRAINT "CrawlRun_valid_error_code" CHECK ("errorCode" IS NULL OR length(btrim("errorCode")) BETWEEN 1 AND 100),
  CONSTRAINT "CrawlRun_valid_http_status" CHECK ("httpStatus" IS NULL OR "httpStatus" BETWEEN 100 AND 599)
);
CREATE UNIQUE INDEX "CrawlRun_one_active_per_source" ON "CrawlRun"("sourceId")
  WHERE "status" IN ('queued', 'running');
CREATE INDEX "CrawlRun_status_requestedAt_idx" ON "CrawlRun"("status", "requestedAt");
CREATE INDEX "CrawlRun_sourceId_requestedAt_idx" ON "CrawlRun"("sourceId", "requestedAt");

CREATE TABLE "ContentAudit" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "sourceId" TEXT,
  "itemId" TEXT,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC', CURRENT_TIMESTAMP),
  CONSTRAINT "ContentAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContentAudit_actorId_fkey" FOREIGN KEY ("actorId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContentAudit_sourceId_fkey" FOREIGN KEY ("sourceId")
    REFERENCES "ContentSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContentAudit_itemId_fkey" FOREIGN KEY ("itemId")
    REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContentAudit_valid_action_reason" CHECK (
    length(btrim("action")) BETWEEN 1 AND 100 AND length(btrim("reason")) BETWEEN 1 AND 2000
  )
);
CREATE INDEX "ContentAudit_createdAt_idx" ON "ContentAudit"("createdAt");
CREATE INDEX "ContentAudit_sourceId_createdAt_idx" ON "ContentAudit"("sourceId", "createdAt");
CREATE INDEX "ContentAudit_itemId_createdAt_idx" ON "ContentAudit"("itemId", "createdAt");
CREATE TRIGGER immutable_content_audit BEFORE UPDATE OR DELETE ON "ContentAudit"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

COMMIT;
