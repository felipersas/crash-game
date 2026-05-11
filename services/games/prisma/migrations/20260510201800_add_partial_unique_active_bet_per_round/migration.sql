-- Ensure only one non-cancelled bet per player per round.
-- CANCELLED bets are excluded so players can retry after wallet debit failures.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_bet_per_round
  ON bets (player_id, round_id)
  WHERE status IN ('PENDING', 'ACTIVE', 'CASHED_OUT', 'LOST');
