-- A source can return from text A to B and back to A. Each observed change must
-- retain its sequence; repeated current snapshots are deduplicated in the locked
-- import transaction. Historical snapshots remain append-only.
DROP INDEX "ContentRevision_itemId_contentHash_key";
CREATE INDEX "ContentRevision_itemId_contentHash_idx" ON "ContentRevision"("itemId", "contentHash");
