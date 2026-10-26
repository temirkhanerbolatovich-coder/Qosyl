BEGIN;
CREATE UNIQUE INDEX "Project_id_clientId_key" ON "Project"("id","clientId");
CREATE TABLE "Lead" (
  "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "sourceUrl" TEXT NOT NULL,"urlHash" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,"title" TEXT NOT NULL,"summary" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'new',"version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "assignedToId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "verifiedAt" TIMESTAMP(3),"contactedAt" TIMESTAMP(3),"consentAt" TIMESTAMP(3),"consentEvidence" TEXT,
  "clientId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT,
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE RESTRICT,"conversionHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',CURRENT_TIMESTAMP),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',CURRENT_TIMESTAMP),
  CONSTRAINT "Lead_valid_kind" CHECK ("kind" IN ('business_request','discussion')),
  CONSTRAINT "Lead_valid_status" CHECK ("status" IN ('new','verified','contacted','consented','declined','archived','converted')),
  CONSTRAINT "Lead_bounded_fields" CHECK (length("sourceUrl")<=2000 AND "sourceUrl" ~ '^https://' AND length(btrim("sourceName")) BETWEEN 3 AND 120 AND length(btrim("title")) BETWEEN 8 AND 140 AND length(btrim("summary")) BETWEEN 20 AND 2000),
  CONSTRAINT "Lead_valid_hash_version" CHECK ("urlHash" ~ '^[a-f0-9]{64}$' AND "version">=1),
  CONSTRAINT "Lead_consent_tuple" CHECK (("consentAt" IS NULL AND "clientId" IS NULL AND "consentEvidence" IS NULL) OR ("consentAt" IS NOT NULL AND "clientId" IS NOT NULL AND "consentEvidence" IS NOT NULL AND length(btrim("consentEvidence")) BETWEEN 10 AND 2000)),
  CONSTRAINT "Lead_pipeline" CHECK (
    ("status" <> 'new' OR ("verifiedAt" IS NULL AND "contactedAt" IS NULL AND "consentAt" IS NULL))
    AND ("status" NOT IN ('verified','contacted','consented','converted') OR "verifiedAt" IS NOT NULL)
    AND ("status" NOT IN ('contacted','consented','converted') OR "contactedAt" IS NOT NULL)
    AND ("status" NOT IN ('consented','converted') OR ("consentAt" IS NOT NULL AND "kind"='business_request'))
    AND ("contactedAt" IS NULL OR ("verifiedAt" IS NOT NULL AND "contactedAt">="verifiedAt"))
    AND ("consentAt" IS NULL OR ("contactedAt" IS NOT NULL AND "consentAt">="contactedAt"))
  ),
  CONSTRAINT "Lead_conversion" CHECK (("status"='converted' AND "projectId" IS NOT NULL AND "conversionHash" IS NOT NULL AND "conversionHash" ~ '^[a-f0-9]{64}$') OR ("status"<>'converted' AND "projectId" IS NULL AND "conversionHash" IS NULL)),
  CONSTRAINT "Lead_project_owner" FOREIGN KEY ("projectId","clientId") REFERENCES "Project"("id","clientId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "Lead_kind_urlHash_key" ON "Lead"("kind","urlHash");
CREATE UNIQUE INDEX "Lead_projectId_key" ON "Lead"("projectId");
CREATE INDEX "Lead_status_updatedAt_id_idx" ON "Lead"("status","updatedAt","id");
CREATE INDEX "Lead_assignedToId_status_idx" ON "Lead"("assignedToId","status");
CREATE INDEX "Lead_clientId_status_expiresAt_idx" ON "Lead"("clientId","status","expiresAt");
CREATE TABLE "LeadEvent" (
  "id" TEXT PRIMARY KEY,"leadId" TEXT NOT NULL REFERENCES "Lead"("id") ON DELETE RESTRICT,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,"version" INTEGER NOT NULL,
  "action" TEXT NOT NULL,"note" TEXT NOT NULL,"detailsJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',CURRENT_TIMESTAMP),
  CONSTRAINT "LeadEvent_valid_payload" CHECK ("version">=1 AND length(btrim("action")) BETWEEN 1 AND 100 AND length(btrim("note")) BETWEEN 10 AND 4000 AND jsonb_typeof("detailsJson")='object')
);
CREATE UNIQUE INDEX "LeadEvent_leadId_version_key" ON "LeadEvent"("leadId","version");
CREATE TRIGGER immutable_lead_event BEFORE UPDATE OR DELETE ON "LeadEvent" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
-- Source identity never changes; edits and all state changes have a monotonically increasing version.
CREATE FUNCTION guard_lead_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Lead history must be retained'; END IF;
  IF NEW."id"<>OLD."id" OR NEW."kind"<>OLD."kind" OR NEW."sourceUrl"<>OLD."sourceUrl" OR NEW."urlHash"<>OLD."urlHash" OR NEW."createdById"<>OLD."createdById" OR NEW."createdAt"<>OLD."createdAt" OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'Invalid lead identity or version change'; END IF;
  IF OLD."status"='converted' AND (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."projectId" IS DISTINCT FROM OLD."projectId" OR NEW."clientId" IS DISTINCT FROM OLD."clientId" OR NEW."conversionHash" IS DISTINCT FROM OLD."conversionHash" OR NEW."consentAt" IS DISTINCT FROM OLD."consentAt" OR NEW."consentEvidence" IS DISTINCT FROM OLD."consentEvidence") THEN RAISE EXCEPTION 'Converted lead ownership is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guarded_lead_update BEFORE UPDATE OR DELETE ON "Lead" FOR EACH ROW EXECUTE FUNCTION guard_lead_mutation();
COMMIT;
