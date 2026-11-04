ALTER TABLE "StudentProfile"
  ADD COLUMN "studyYear" INTEGER,
  ADD COLUMN "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "experiences" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_studyYear_check"
  CHECK ("studyYear" IS NULL OR "studyYear" BETWEEN 1 AND 8);
