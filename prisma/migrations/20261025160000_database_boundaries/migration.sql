-- Preserve existing rows. Any violated invariant aborts the whole migration;
-- never repair payment claims, selection or historical versions automatically.
BEGIN;

ALTER TABLE "AgreementVersion"
  ADD CONSTRAINT "AgreementVersion_positive_number" CHECK ("number" > 0);
ALTER TABLE "ProjectMilestone"
  ADD CONSTRAINT "ProjectMilestone_positive_agreement_number" CHECK ("agreementNumber" > 0);
ALTER TABLE "ProjectMilestone"
  ADD CONSTRAINT "ProjectMilestone_projectId_agreementNumber_fkey"
  FOREIGN KEY ("projectId", "agreementNumber")
  REFERENCES "AgreementVersion"("projectId", "number")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A second selected application is invalid even for writes outside the API.
CREATE UNIQUE INDEX "Application_one_selected_per_project"
  ON "Application"("projectId") WHERE "status" = 'selected';

ALTER TABLE "ClientProfile"
  ADD CONSTRAINT "ClientProfile_valid_verification_status"
  CHECK ("verificationStatus" IN ('pending', 'verified', 'rejected'));
ALTER TABLE "Report"
  ADD CONSTRAINT "Report_valid_status" CHECK ("status" IN ('open', 'resolved')),
  ADD CONSTRAINT "Report_resolution_matches_status" CHECK (
    ("status" <> 'open' OR ("resolvedAt" IS NULL AND "resolution" IS NULL))
    AND ("status" <> 'resolved' OR ("resolvedAt" IS NOT NULL
        AND "resolution" IS NOT NULL AND length(btrim("resolution")) > 0))
  );

-- Disputed claims retain their timestamps as evidence. Other states must match
-- the sequence already required by acknowledgePayment in the application.
ALTER TABLE "PaymentAcknowledgement"
  ADD CONSTRAINT "PaymentAcknowledgement_claims_match_status" CHECK (
    ("status" = 'not_reported' AND "clientPaidAt" IS NULL AND "studentReceivedAt" IS NULL)
    OR ("status" = 'reported_paid_by_client' AND "clientPaidAt" IS NOT NULL AND "studentReceivedAt" IS NULL)
    OR ("status" = 'confirmed_received_by_student' AND "clientPaidAt" IS NOT NULL AND "studentReceivedAt" IS NOT NULL)
    OR "status" = 'disputed'
  );

-- Queries in dashboards and public portfolios filter by owner, then sort by date.
-- Composite replacements retain the original leading-column lookup capability.
CREATE INDEX "Project_clientId_updatedAt_idx" ON "Project"("clientId", "updatedAt");
CREATE INDEX "Project_assignedStudentId_updatedAt_idx" ON "Project"("assignedStudentId", "updatedAt");
CREATE INDEX "ExternalPortfolioItem_userId_createdAt_idx" ON "ExternalPortfolioItem"("userId", "createdAt");
CREATE INDEX "ProjectMilestone_projectId_agreementNumber_idx" ON "ProjectMilestone"("projectId", "agreementNumber");
DROP INDEX "Project_clientId_idx";
DROP INDEX "Project_assignedStudentId_idx";
DROP INDEX "ExternalPortfolioItem_userId_idx";
DROP INDEX "ProjectMilestone_projectId_idx";

CREATE INDEX "Application_studentId_updatedAt_idx" ON "Application"("studentId", "updatedAt");
CREATE INDEX "Application_projectId_createdAt_idx" ON "Application"("projectId", "createdAt");
CREATE INDEX "RevisionRequest_submissionId_idx" ON "RevisionRequest"("submissionId");
CREATE INDEX "PortfolioRecord_studentId_createdAt_idx" ON "PortfolioRecord"("studentId", "createdAt");
CREATE INDEX "Review_recipientId_createdAt_idx" ON "Review"("recipientId", "createdAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

COMMIT;
