ALTER TABLE "ExternalPortfolioItem"
 ADD COLUMN "role" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "problem" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "contribution" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "period" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "tools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "result" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "links" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'draft',
 ADD COLUMN "publicationAllowed" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "revision" TEXT NOT NULL DEFAULT 'legacy';
-- Existing works were already published with the profile. Preserve that permission,
-- while new rows require explicit consent and begin as drafts.
UPDATE "ExternalPortfolioItem" SET "visibility" = 'public', "publicationAllowed" = true;
WITH ranked AS (
 SELECT id, row_number() OVER (PARTITION BY "userId" ORDER BY "createdAt" DESC, id ASC) - 1 AS position FROM "ExternalPortfolioItem"
) UPDATE "ExternalPortfolioItem" item SET position = ranked.position FROM ranked WHERE item.id = ranked.id;
ALTER TABLE "ExternalPortfolioItem" ADD CONSTRAINT "ExternalPortfolioItem_visibility_check" CHECK (visibility IN ('draft','private','public'));
ALTER TABLE "ExternalPortfolioItem" ADD CONSTRAINT "ExternalPortfolioItem_publication_check" CHECK (visibility <> 'public' OR "publicationAllowed");
CREATE INDEX "ExternalPortfolioItem_userId_position_idx" ON "ExternalPortfolioItem"("userId", position);
