CREATE TABLE IF NOT EXISTS "email_change_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "email" text NOT NULL,
  "token_hash" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_change_tokens_token_hash_unique"
  ON "email_change_tokens" ("token_hash");

CREATE INDEX IF NOT EXISTS "idx_email_change_tokens_user_created_at"
  ON "email_change_tokens" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_email_change_tokens_email_created_at"
  ON "email_change_tokens" ("email", "created_at");
