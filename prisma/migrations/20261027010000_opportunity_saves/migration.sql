BEGIN;
-- Private account preferences. Existing content revisions and publication rules are unchanged.
CREATE TABLE "OpportunityFavorite" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
  CONSTRAINT "OpportunityFavorite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpportunityFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OpportunityFavorite_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OpportunityFavorite_userId_itemId_key" ON "OpportunityFavorite"("userId", "itemId");
CREATE INDEX "OpportunityFavorite_userId_createdAt_idx" ON "OpportunityFavorite"("userId", "createdAt");

CREATE TABLE "SavedOpportunitySearch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "queryHash" TEXT NOT NULL,
  "q" TEXT NOT NULL DEFAULT '',
  "category" TEXT,
  "geography" TEXT NOT NULL DEFAULT '',
  "specialty" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
  CONSTRAINT "SavedOpportunitySearch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavedOpportunitySearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SavedOpportunitySearch_values" CHECK (
    length(trim("name")) BETWEEN 1 AND 80 AND length("q") <= 100 AND length("geography") <= 120
    AND "queryHash" ~ '^[a-f0-9]{64}$'
    AND ("category" IS NULL OR "category" IN ('hackathon','competition','internship','event','grant','scholarship','training','news','article','other'))
    AND ("specialty" IS NULL OR "specialty" IN ('it','engineering','business','education','health','humanities','agriculture','services'))
  )
);
CREATE UNIQUE INDEX "SavedOpportunitySearch_userId_queryHash_key" ON "SavedOpportunitySearch"("userId", "queryHash");
CREATE INDEX "SavedOpportunitySearch_userId_createdAt_idx" ON "SavedOpportunitySearch"("userId", "createdAt");

COMMIT;
