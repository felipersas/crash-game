import { Inject, Injectable } from '@nestjs/common';
import { Round } from '@/domain/entities/round.entity';
import { SeedChain } from '@/domain/value-objects/seed-chain.value-object';
import { CrashPoint } from '@/domain/value-objects/crash-point.value-object';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IUseCase } from '../interfaces/use-case';
import { ROUND_REPOSITORY } from '@/infrastructure/di/tokens';

export interface VerifyRoundInput {
  roundId: string;
}

export interface VerifyRoundOutput {
  roundId: string;
  seed: string;
  seedHash: string;
  crashPoint: number;
  verified: boolean;
}

@Injectable()
export class VerifyRoundUseCase implements IUseCase<VerifyRoundInput, VerifyRoundOutput> {
  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
  ) {}

  async execute(input: VerifyRoundInput): Promise<VerifyRoundOutput> {
    const round = await this.roundRepository.findById(input.roundId);

    if (!round) {
      throw new Error('Round not found');
    }

    const seed = round.getSeed();
    const seedHash = round.getSeedHash();
    const crashPointValue = round.getCrashPoint();

    if (!seed || !seedHash || crashPointValue === null) {
      throw new Error('Round data incomplete for verification');
    }

    // Verify the seed hash matches
    const hashMatches = await SeedChain.verifySeed(seed, seedHash);

    // Verify the crash point calculation
    const calculatedCrashPoint = await CrashPoint.fromSeed(seed);
    const crashPointMatches = Math.abs(calculatedCrashPoint.getValue() - crashPointValue) < 0.01;

    return {
      roundId: round.id,
      seed,
      seedHash,
      crashPoint: crashPointValue,
      verified: hashMatches && crashPointMatches,
    };
  }
}
