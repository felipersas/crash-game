-- Create InboxEventStatus enum
CREATE TYPE "InboxEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- Create inbox_events table
CREATE TABLE "inbox_events" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "idempotencyKey" TEXT NOT NULL UNIQUE,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "InboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP,
    "errorMessage" TEXT,
    "retryCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX "inbox_events_idempotencyKey_idx" ON "inbox_events"("idempotencyKey");
CREATE INDEX "inbox_events_status_createdAt_idx" ON "inbox_events"("status", "createdAt");
