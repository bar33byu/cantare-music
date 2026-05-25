CREATE TABLE IF NOT EXISTS "magic_link_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "token_hash" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "magic_link_tokens_token_hash_unique"
  ON "magic_link_tokens" ("token_hash");

CREATE INDEX IF NOT EXISTS "idx_magic_link_tokens_email_created_at"
  ON "magic_link_tokens" ("email", "created_at");

CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_token_hash_unique"
  ON "user_sessions" ("token_hash");

CREATE INDEX IF NOT EXISTS "idx_user_sessions_user_expires_at"
  ON "user_sessions" ("user_id", "expires_at");
