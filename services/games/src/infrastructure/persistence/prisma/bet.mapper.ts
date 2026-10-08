import type { $Enums, Bet as BetRow } from '@prisma/client';
import { BetId, PlayerId, RoundId } from '@crash/domain';
import { Bet, type BetSnapshot, type BetStatus } from '@/domain/entities/bet.entity';

export function betToDomain(row: BetRow): Bet {
  return Bet.restore({
    id: BetId.from(row.id),
    roundId: RoundId.from(row.roundId),
    playerId: PlayerId.from(row.playerId),
    playerName: row.playerName,
    amountCents: row.amountCents,
    status: row.status as BetStatus,
    autoCashOutMultiplier: row.autoCashOutMultiplier,
    cashOutMultiplier: row.cashOutMultiplier,
    cashOutAmount: row.cashOutAmount,
    cashedOutAt: row.cashedOutAt,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt,
  });
}

export function betToRow(snapshot: BetSnapshot) {
  return { ...snapshot, status: snapshot.status as $Enums.BetStatus };
}
