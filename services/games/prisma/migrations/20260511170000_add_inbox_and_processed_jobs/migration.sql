-- Inbox table for idempotent event consumption from other services
CREATE TABLE IF NOT EXISTS "inbox_events" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inbox_events_idempotency_key_key" ON "inbox_events"("idempotency_key");
CREATE INDEX IF NOT EXISTS "inbox_events_status_created_at_idx" ON "inbox_events"("status", "created_at");
