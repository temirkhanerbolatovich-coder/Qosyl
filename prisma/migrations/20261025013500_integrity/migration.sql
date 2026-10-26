-- Checks supplement server validation and protect writes made outside the application.
ALTER TABLE "Project" ADD CONSTRAINT "Project_positive_budget" CHECK ("budgetKzt" > 0 AND "budgetKzt" <= 10000000);
ALTER TABLE "Project" ADD CONSTRAINT "Project_valid_hours" CHECK ("estimatedHours" BETWEEN 1 AND 160);
ALTER TABLE "Project" ADD CONSTRAINT "Project_no_self_assignment" CHECK ("assignedStudentId" IS NULL OR "assignedStudentId" <> "clientId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_has_criteria" CHECK (cardinality("acceptanceCriteria") BETWEEN 1 AND 15);
ALTER TABLE "Review" ADD CONSTRAINT "Review_valid_rating" CHECK (rating BETWEEN 1 AND 5 AND "authorId" <> "recipientId");
ALTER TABLE "StudentProfile" ADD CONSTRAINT "Student_valid_hours" CHECK ("weeklyHours" BETWEEN 1 AND 80);
ALTER TABLE "User" ADD CONSTRAINT "User_valid_roles" CHECK (roles <@ ARRAY['student','client','admin']::text[]);
ALTER TABLE "User" ADD CONSTRAINT "User_valid_status" CHECK (status IN ('active','suspended'));

CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit history is append-only';
END;
$$;
CREATE TRIGGER immutable_project_event BEFORE UPDATE OR DELETE ON "ProjectEvent" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_moderation_action BEFORE UPDATE OR DELETE ON "ModerationAction" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_submission BEFORE UPDATE OR DELETE ON "Submission" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE ON "RevisionRequest" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_review BEFORE UPDATE OR DELETE ON "Review" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE FUNCTION protect_agreement_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Agreement history is immutable'; END IF;
  IF NEW.id <> OLD.id OR NEW."projectId" <> OLD."projectId" OR NEW.number <> OLD.number OR NEW."snapshotJson" <> OLD."snapshotJson" OR NEW."createdAt" <> OLD."createdAt"
    OR (OLD."clientApprovedAt" IS NOT NULL AND NEW."clientApprovedAt" IS DISTINCT FROM OLD."clientApprovedAt")
    OR (OLD."studentApprovedAt" IS NOT NULL AND NEW."studentApprovedAt" IS DISTINCT FROM OLD."studentApprovedAt")
  THEN RAISE EXCEPTION 'Agreement content and existing approvals are immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_agreement BEFORE UPDATE OR DELETE ON "AgreementVersion" FOR EACH ROW EXECUTE FUNCTION protect_agreement_history();
