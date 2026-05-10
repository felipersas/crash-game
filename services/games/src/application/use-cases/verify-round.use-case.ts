import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { SeedChain } from '@/domain/value-objects/seed-chain.value-object';
import { CrashPoint } from '@/domain/value-objects/crash-point.value-object';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IUseCase } from '../interfaces/use-case';
import { ROUND_REPOSITORY } from '@/infrastructure/di/tokens';
import { RoundStatus } from '@/domain/entities/round.entity';
import { RoundNotFoundError, VerificationFailedError } from '@/domain/errors/domain.errors';

export interface VerifyRoundInput {
  roundId: string;
}

export interface VerifyRoundOutput {
  roundId: string;
  seed: string;
  seedHash: string;
  salt: string;
  crashPoint: number;
  verified: boolean;
  verificationFormula: string;
}

@Injectable()
export class VerifyRoundUseCase implements IUseCase<VerifyRoundInput, VerifyRoundOutput> {
  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
  ) {}

  async execute(input: VerifyRoundInput): Promise<VerifyRoundOutput> {
    const round = await this.roundRepository.findById(input.roundId);

    if (!round) {
      throw new RoundNotFoundError();
    }

    if (round.getStatus() !== RoundStatus.CRASHED) {
      throw new UnauthorizedException('Seed only available after round crashes');
    }

    const seed = round.getSeed();
    const seedHash = round.getSeedHash();
    const crashPointValue = round.getCrashPoint();

    if (!seed || !seedHash || crashPointValue === null) {
      throw new VerificationFailedError();
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
      salt: seed,
      crashPoint: crashPointValue,
      verified: hashMatches && crashPointMatches,
      verificationFormula: 'SHA-256(seed) → extract first 52 bits → crash = max(1.00, (1 - 0.04) / (bits / 2^52))',
    };
  }
}
