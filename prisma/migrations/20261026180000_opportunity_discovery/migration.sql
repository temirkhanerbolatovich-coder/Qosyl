BEGIN;
ALTER TABLE "ContentSource" DROP CONSTRAINT "ContentSource_valid_type", DROP CONSTRAINT "ContentSource_feed_matches_type";
ALTER TABLE "ContentSource" ADD CONSTRAINT "ContentSource_valid_type" CHECK ("type" IN ('manual','rss','html'));
ALTER TABLE "ContentSource" ADD CONSTRAINT "ContentSource_feed_matches_type" CHECK (("type"='manual' AND "feedUrl" IS NULL) OR ("type" IN ('rss','html') AND "feedUrl" IS NOT NULL AND "feedUrl" ~ '^https://'));
ALTER TABLE "ContentRevision" DROP CONSTRAINT "ContentRevision_valid_category";
ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_valid_category" CHECK ("category" IN ('hackathon','competition','internship','event','grant','scholarship','training','news','article','other'));
COMMIT;
