-- Defense-in-depth: ensure balance can never go negative at the database level,
-- even if application logic has a bug.
ALTER TABLE "Wallet" ADD CONSTRAINT "balance_non_negative" CHECK ("balanceCents" >= 0);
