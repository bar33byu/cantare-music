CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "event_type" text NOT NULL,
  "actor_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "effective_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "resource_type" text,
  "resource_id" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_audit_logs_event_type_created_at"
  ON "audit_logs" ("event_type", "created_at");

CREATE INDEX IF NOT EXISTS "idx_audit_logs_actor_created_at"
  ON "audit_logs" ("actor_user_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_audit_logs_effective_created_at"
  ON "audit_logs" ("effective_user_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_audit_logs_resource"
  ON "audit_logs" ("resource_type", "resource_id");
