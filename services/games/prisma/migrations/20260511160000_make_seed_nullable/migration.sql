-- Seed is only revealed after round crashes (provably fair).
-- Allow NULL during BETTING/ACTIVE phases.
ALTER TABLE "rounds" ALTER COLUMN "seed" DROP NOT NULL;
