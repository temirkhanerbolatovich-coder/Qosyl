CREATE TABLE "ProfileAvatar" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "bytes" BYTEA NOT NULL,
  "revision" TEXT NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileAvatar_bytes_check" CHECK (octet_length("bytes") BETWEEN 1 AND 524288)
);
