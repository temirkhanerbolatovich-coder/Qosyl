BEGIN;
-- Opt-in only: all existing saved searches remain off, with no initial catalogue delivery.
ALTER TABLE "SavedOpportunitySearch"
  ADD COLUMN "notificationFrequency" TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN "notificationSince" TIMESTAMP(3),
  ADD COLUMN "nextNotificationAt" TIMESTAMP(3),
  ADD CONSTRAINT "SavedOpportunitySearch_notification_state" CHECK (
    ("notificationFrequency" = 'off' AND "notificationSince" IS NULL AND "nextNotificationAt" IS NULL)
    OR ("notificationFrequency" IN ('daily', 'weekly') AND "notificationSince" IS NOT NULL
      AND "nextNotificationAt" IS NOT NULL AND "nextNotificationAt" > "notificationSince")
  );
CREATE INDEX "SavedOpportunitySearch_notificationFrequency_nextNotificationAt_idx"
  ON "SavedOpportunitySearch"("notificationFrequency", "nextNotificationAt");

CREATE TABLE "OpportunitySearchMatch" (
  "id" TEXT NOT NULL,
  "searchId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
  CONSTRAINT "OpportunitySearchMatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpportunitySearchMatch_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "SavedOpportunitySearch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OpportunitySearchMatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OpportunitySearchMatch_searchId_itemId_key" ON "OpportunitySearchMatch"("searchId", "itemId");
CREATE INDEX "OpportunitySearchMatch_itemId_idx" ON "OpportunitySearchMatch"("itemId");
COMMIT;
