BEGIN;
-- Private local bytes; never exposed through public Project/Submission projections.
CREATE TABLE "ProjectAttachment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
  CONSTRAINT "ProjectAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectAttachment_values" CHECK (
    length(trim("filename")) BETWEEN 1 AND 120 AND "sha256" ~ '^[a-f0-9]{64}$'
    AND "byteSize" BETWEEN 1 AND 5242880 AND "byteSize" = octet_length("bytes")
    AND "mediaType" IN ('application/pdf','image/png','image/jpeg','text/plain')
  )
);
CREATE UNIQUE INDEX "ProjectAttachment_id_projectId_key" ON "ProjectAttachment"("id", "projectId");
CREATE UNIQUE INDEX "ProjectAttachment_projectId_uploaderId_sha256_key" ON "ProjectAttachment"("projectId", "uploaderId", "sha256");
CREATE INDEX "ProjectAttachment_uploaderId_createdAt_idx" ON "ProjectAttachment"("uploaderId", "createdAt");
CREATE INDEX "ProjectAttachment_projectId_createdAt_idx" ON "ProjectAttachment"("projectId", "createdAt");
CREATE UNIQUE INDEX "Submission_id_projectId_key" ON "Submission"("id", "projectId");

CREATE TABLE "SubmissionAttachment" (
  "projectId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  CONSTRAINT "SubmissionAttachment_pkey" PRIMARY KEY ("submissionId", "attachmentId"),
  CONSTRAINT "SubmissionAttachment_submissionId_projectId_fkey" FOREIGN KEY ("submissionId", "projectId") REFERENCES "Submission"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SubmissionAttachment_attachmentId_projectId_fkey" FOREIGN KEY ("attachmentId", "projectId") REFERENCES "ProjectAttachment"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SubmissionAttachment_attachmentId_projectId_idx" ON "SubmissionAttachment"("attachmentId", "projectId");
CREATE TRIGGER immutable_project_attachment BEFORE UPDATE ON "ProjectAttachment" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_submission_attachment BEFORE UPDATE OR DELETE ON "SubmissionAttachment" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

-- Join rows must agree with the immutable submission author, even for direct DML.
CREATE FUNCTION guard_submission_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  submission_student TEXT;
  attachment_uploader TEXT;
BEGIN
  SELECT "studentId" INTO submission_student FROM "Submission" WHERE id = NEW."submissionId" AND "projectId" = NEW."projectId";
  SELECT "uploaderId" INTO attachment_uploader FROM "ProjectAttachment" WHERE id = NEW."attachmentId" AND "projectId" = NEW."projectId";
  IF submission_student IS DISTINCT FROM attachment_uploader THEN
    RAISE EXCEPTION 'Attachment owner must match submission author' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guarded_submission_attachment BEFORE INSERT ON "SubmissionAttachment" FOR EACH ROW EXECUTE FUNCTION guard_submission_attachment();
COMMIT;
