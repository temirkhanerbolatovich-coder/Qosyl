BEGIN;
ALTER TABLE "ContentRevision" ADD COLUMN "canonicalUrl" TEXT,
  ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_https_snapshot"
  CHECK ("canonicalUrl" IS NULL OR ("canonicalUrl" ~ '^https://' AND length("canonicalUrl") <= 2000)),
  ADD CONSTRAINT "ContentRevision_valid_origin" CHECK ("origin" IN ('legacy', 'import', 'manual', 'editorial'));
-- Historical revisions are immutable. Their missing URL is not guessed or backfilled;
-- the editor must save a new snapshot before publishing a legacy revision.
CREATE UNIQUE INDEX "ContentRevision_itemId_id_key" ON "ContentRevision"("itemId", "id");
ALTER TABLE "ContentItem" ADD COLUMN "approvedRevisionId" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3), ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "ContentItem" DROP CONSTRAINT "ContentItem_closed_status";
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_valid_status"
  CHECK ("status" IN ('pending_review', 'published', 'rejected', 'archived', 'withdrawn')),
  ADD CONSTRAINT "ContentItem_approvedRevisionId_fkey" FOREIGN KEY ("approvedRevisionId")
    REFERENCES "ContentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ContentItem_approved_same_item" FOREIGN KEY ("id", "approvedRevisionId")
    REFERENCES "ContentRevision"("itemId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ContentItem_publication_times" CHECK (
    ("approvedRevisionId" IS NULL AND "approvedAt" IS NULL AND "expiresAt" IS NULL)
    OR ("approvedRevisionId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "expiresAt" IS NOT NULL AND "expiresAt" > "approvedAt")
  ),
  ADD CONSTRAINT "ContentItem_published_has_approval" CHECK (
    "status" <> 'published' OR "approvedRevisionId" IS NOT NULL
  );
CREATE INDEX "ContentItem_status_expiresAt_approvedAt_idx" ON "ContentItem"("status", "expiresAt", "approvedAt");
ALTER TABLE "ContentAudit" ADD COLUMN "revisionId" TEXT;
ALTER TABLE "ContentAudit" ADD CONSTRAINT "ContentAudit_revisionId_fkey" FOREIGN KEY ("revisionId")
  REFERENCES "ContentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ContentAudit_revision_same_item" FOREIGN KEY ("itemId", "revisionId")
    REFERENCES "ContentRevision"("itemId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ContentAudit_editorial_attribution" CHECK (
    "action" NOT IN ('content_published','content_rejected','content_archived','content_withdrawn','content_reopened','content_edited')
    OR ("actorId" IS NOT NULL AND "itemId" IS NOT NULL AND "revisionId" IS NOT NULL AND length(btrim("reason")) >= 10)
  );
COMMIT;
