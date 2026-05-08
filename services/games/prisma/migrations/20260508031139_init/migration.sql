-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('BETTING', 'ACTIVE', 'CRASHED');

-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('ACTIVE', 'CASHED_OUT', 'LOST');

-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "rounds" (
    "id" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "seedHash" TEXT NOT NULL,
    "next_seed" TEXT,
    "status" "RoundStatus" NOT NULL,
    "crash_point" DOUBLE PRECISION,
    "betting_end_time" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "crashed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bets" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "status" "BetStatus" NOT NULL,
    "cash_out_multiplier" DOUBLE PRECISION,
    "cash_out_amount" BIGINT,
    "cashed_out_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_jobs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bets_round_id_idx" ON "bets"("round_id");

-- CreateIndex
CREATE INDEX "bets_player_id_idx" ON "bets"("player_id");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_id_status_idx" ON "outbox_events"("aggregate_id", "status");

-- CreateIndex
CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "processed_jobs_job_id_key" ON "processed_jobs"("job_id");

-- CreateIndex
CREATE INDEX "processed_jobs_processed_at_idx" ON "processed_jobs"("processed_at");

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
