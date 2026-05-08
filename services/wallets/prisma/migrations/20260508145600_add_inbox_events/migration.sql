-- Create InboxEvent table for idempotency
-- This table stores incoming events to prevent duplicate processing

CREATE TABLE "inbox_events" (
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

-- Create unique index on idempotency_key for idempotency
CREATE UNIQUE INDEX "inbox_events_idempotency_key_key" ON "inbox_events"("idempotency_key");

-- Create composite index for status and created_at queries
CREATE INDEX "inbox_events_status_created_at_idx" ON "inbox_events"("status", "created_at");

-- Add check constraint for status enum
ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_status_check"
    CHECK ("status" IN ('PENDING', 'PROCESSED', 'FAILED'));
