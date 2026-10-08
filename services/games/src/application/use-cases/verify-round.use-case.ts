import { Inject, Injectable } from '@nestjs/common';
import type { RoundId } from '@crash/domain';
import { CrashPoint } from '@/domain/value-objects/crash-point.value-object';
import { verifyRoundFairness } from '@/domain/services/provably-fair';
import { RoundNotFoundError } from '@/domain/errors/domain.errors';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IUseCase } from '@/application/interfaces/use-case';
import { ROUND_REPOSITORY } from '@/application/di.tokens';

export interface VerifyRoundInput {
  roundId: RoundId;
}

export interface VerifyRoundOutput {
  roundId: string;
  seed: string;
  seedHash: string;
  /** Same as seed: the crash point uses no separate salt. Kept for API compatibility. */
  salt: string;
  crashPoint: number;
  verified: boolean;
  verificationFormula: string;
}

/**
 * Verify Round Use Case - Application Layer
 *
 * Reveals the seed of a crashed round and checks it against the commitment
 * and the stored crash point.
 */
@Injectable()
export class VerifyRoundUseCase implements IUseCase<VerifyRoundInput, VerifyRoundOutput> {
  constructor(@Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository) {}

  async execute(input: VerifyRoundInput): Promise<VerifyRoundOutput> {
    const round = await this.roundRepository.findById(input.roundId);
    if (!round) {
      throw new RoundNotFoundError();
    }

    // Throws SeedNotAvailableError until the round has crashed
    const seed = round.getSeed();
    const seedHash = round.getSeedHash();
    const crashPoint = round.getCrashPoint()!;

    const { verified } = await verifyRoundFairness(seed, seedHash, crashPoint);

    return {
      roundId: round.id,
      seed,
      seedHash,
      salt: seed,
      crashPoint,
      verified,
      verificationFormula: CrashPoint.FORMULA,
    };
  }
}
