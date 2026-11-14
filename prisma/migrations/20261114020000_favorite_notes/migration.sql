ALTER TABLE "OpportunityFavorite" ADD COLUMN "note" TEXT;
ALTER TABLE "OpportunityFavorite" ADD CONSTRAINT "OpportunityFavorite_note_check" CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 300);
