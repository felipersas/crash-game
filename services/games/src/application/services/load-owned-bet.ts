import type { BetId, PlayerId, RoundId } from '@crash/domain';
import type { Bet } from '@/domain/entities/bet.entity';
import { BetNotFoundError } from '@/domain/errors/domain.errors';
import type { IBetRepository } from '@/application/interfaces/bet.repository';

/**
 * Loads a bet by id and checks it belongs to the given player and round.
 * Saga replies reference a specific bet; looking it up by player + round could
 * resolve a newer bet that replaced it.
 */
export async function loadOwnedBet(
  betRepository: IBetRepository,
  ref: { betId: BetId; playerId: PlayerId; roundId: RoundId },
): Promise<Bet> {
  const bet = await betRepository.findById(ref.betId);
  if (!bet || bet.playerId !== ref.playerId || bet.roundId !== ref.roundId) {
    throw new BetNotFoundError();
  }
  return bet;
}
