ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_deletion_requested_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_deletion_scheduled_for" timestamp;

CREATE INDEX IF NOT EXISTS "idx_users_account_deletion_scheduled_for"
  ON "users" ("account_deletion_scheduled_for");
