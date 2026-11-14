ALTER TABLE "OpportunityFavorite" ADD COLUMN "reminderDaysBefore" INTEGER, ADD COLUMN "reminderDeadline" TIMESTAMP(3);
ALTER TABLE "OpportunityFavorite" ADD CONSTRAINT "OpportunityFavorite_reminderDaysBefore_check" CHECK ("reminderDaysBefore" IS NULL OR "reminderDaysBefore" IN (1, 3, 7));
