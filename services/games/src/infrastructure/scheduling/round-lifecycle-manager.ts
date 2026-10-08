import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Round, RoundStatus, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import { SeedChain } from '@/domain/value-objects/seed-chain.value-object';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { ISeedChainRepository } from '@/application/interfaces/seed-chain.repository';
import type { IAutoCashOutRepository } from '@/application/interfaces/auto-cashout.repository';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';
import type { IRoundStateProvider } from '@/application/interfaces/round-state-provider';
import {
  ROUND_REPOSITORY,
  SEED_CHAIN_REPOSITORY,
  AUTO_CASHOUT_REPOSITORY,
  GAME_BROADCASTER,
} from '@/application/di.tokens';
import { CreateRoundUseCase } from '@/application/use-cases/create-round.use-case';
import { StartRoundUseCase } from '@/application/use-cases/start-round.use-case';
import { CrashRoundUseCase } from '@/application/use-cases/crash-round.use-case';
import { CASHOUT_QUEUE } from '@/infrastructure/di.tokens';
import type { AutoCashOutJobData } from '@/infrastructure/workers/auto-cashout.worker';
import { deterministicUuid } from './deterministic-uuid';

const SEED_CHAIN_SIZE = 1000;
const MULTIPLIER_TICK_MS = 100;
const NEXT_ROUND_DELAY_MS = 5000;

/**
 * Round Lifecycle Manager - Infrastructure Layer
 *
 * Drives the game loop and owns the live (in-memory) round:
 * 1. Creates rounds from the provably fair seed chain (CreateRoundUseCase)
 * 2. Transitions BETTING → ACTIVE when the betting window closes (StartRoundUseCase)
 * 3. Ticks the multiplier, dispatches auto cash-outs and pushes updates
 * 4. Persists the crash (CrashRoundUseCase) and schedules the next round
 */
@Injectable()
export class RoundLifecycleManager implements IRoundStateProvider, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoundLifecycleManager.name);
  private currentRound: Round | null = null;
  private seedChain: SeedChain | null = null;
  private multiplierInterval: NodeJS.Timeout | null = null;
  private pendingTimeout: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(SEED_CHAIN_REPOSITORY) private readonly seedChainRepository: ISeedChainRepository,
    @Inject(AUTO_CASHOUT_REPOSITORY) private readonly autoCashOutRepository: IAutoCashOutRepository,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    private readonly createRoundUseCase: CreateRoundUseCase,
    private readonly startRoundUseCase: StartRoundUseCase,
    private readonly crashRoundUseCase: CrashRoundUseCase,
    @InjectQueue(CASHOUT_QUEUE) private readonly cashoutQueue: Queue<AutoCashOutJobData>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.seedChain = await this.loadSeedChain();

    const round = await this.roundRepository.findCurrentRound();
    if (!round || round.getStatus() === RoundStatus.CRASHED) {
      await this.createNewRound();
    } else {
      this.logger.log(`Resuming round ${round.id} in ${round.getStatus()} phase`);
      this.currentRound = round;
      this.resumeRound(round);
    }
  }

  onModuleDestroy(): void {
    this.stopTicking();
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
    }
  }

  getCurrentRound(): Round | null {
    return this.currentRound;
  }

  private async loadSeedChain(): Promise<SeedChain> {
    const stored = await this.seedChainRepository.load();
    if (stored && !stored.needsRegeneration()) {
      const { remaining, total } = stored.getSummary();
      this.logger.log(`Seed chain loaded: ${remaining}/${total} seeds remaining`);
      return stored;
    }
    return this.generateSeedChain();
  }

  private async generateSeedChain(): Promise<SeedChain> {
    const chain = await SeedChain.generate(SEED_CHAIN_SIZE, process.env.DETERMINISTIC_SEED);
    await this.seedChainRepository.save(chain);
    this.logger.log(
      `New seed chain generated, commitment: ${chain.getCommitment().slice(0, 16)}...`,
    );
    return chain;
  }

  private async createNewRound(): Promise<void> {
    if (!this.seedChain || this.seedChain.needsRegeneration()) {
      this.seedChain = await this.generateSeedChain();
    }

    const round = await Round.createWithSeedChain(this.seedChain, DEFAULT_ROUND_CONFIG);
    await this.createRoundUseCase.execute({ round });
    this.currentRound = round;

    this.seedChain = this.seedChain.advance();
    await this.seedChainRepository.save(this.seedChain);

    this.logger.log(`Round ${round.id} started in BETTING phase`);
    this.scheduleBettingEnd(round);
  }

  private resumeRound(round: Round): void {
    if (round.getStatus() === RoundStatus.BETTING) {
      this.scheduleBettingEnd(round);
    } else {
      this.startTicking();
    }
  }

  private scheduleBettingEnd(round: Round): void {
    const delay = Math.max(0, (round.getBettingEndTime()?.getTime() ?? 0) - Date.now());
    this.schedule(delay, 'end betting phase', () => this.endBettingPhase());
  }

  private async endBettingPhase(): Promise<void> {
    if (!this.currentRound) return;

    const { round } = await this.startRoundUseCase.execute({ round: this.currentRound });
    this.currentRound = round;
    this.startTicking();
  }

  private startTicking(): void {
    this.stopTicking();
    this.multiplierInterval = setInterval(() => void this.tick(), MULTIPLIER_TICK_MS);
  }

  private stopTicking(): void {
    if (this.multiplierInterval) {
      clearInterval(this.multiplierInterval);
      this.multiplierInterval = null;
    }
  }

  /**
   * One multiplier step. Ticks never overlap: a slow tick (Redis, queue)
   * makes the next one skip instead of processing the crash twice.
   */
  private async tick(): Promise<void> {
    const round = this.currentRound;
    const startedAt = round?.getStartedAt();
    if (!round || !startedAt || this.ticking) return;

    this.ticking = true;
    try {
      round.updateMultiplier((Date.now() - startedAt.getTime()) / 1000);
      const multiplier = round.getCurrentMultiplier();

      await this.dispatchAutoCashOuts(round, multiplier);
      this.broadcaster.broadcastMultiplierUpdate(round.id, multiplier);

      if (round.getStatus() === RoundStatus.CRASHED) {
        this.stopTicking();
        await this.finishRound(round);
      }
    } catch (error) {
      this.logger.error(`Tick failed for round ${round.id}`, error);
    } finally {
      this.ticking = false;
    }
  }

  private async dispatchAutoCashOuts(round: Round, multiplier: number): Promise<void> {
    try {
      const eligible = await this.autoCashOutRepository.fetchAndRemoveEligible(
        round.id,
        multiplier,
      );
      if (eligible.length === 0) return;

      await this.cashoutQueue.addBulk(
        eligible.map(({ playerId, targetMultiplier }) => ({
          name: 'auto-cashout',
          data: {
            playerId,
            roundId: round.id,
            targetMultiplier,
            idempotencyKey: deterministicUuid(round.id, playerId),
          },
        })),
      );
      this.logger.log(`Dispatched ${eligible.length} auto cash-out job(s) for round ${round.id}`);
    } catch (error) {
      this.logger.error('Failed to dispatch auto cash-outs', error);
    }
  }

  private async finishRound(round: Round): Promise<void> {
    try {
      await this.crashRoundUseCase.execute({ round });
    } catch (error) {
      this.logger.error(`Failed to persist crash of round ${round.id}`, error);
    }

    try {
      await this.autoCashOutRepository.clearRound(round.id);
    } catch (error) {
      this.logger.error(`Failed to clear auto cash-out targets of round ${round.id}`, error);
    }

    this.scheduleNextRound();
  }

  /**
   * Keeps the game loop alive: a failed round creation is retried after the same delay.
   */
  private scheduleNextRound(): void {
    this.schedule(NEXT_ROUND_DELAY_MS, 'create next round', async () => {
      try {
        await this.createNewRound();
      } catch (error) {
        this.scheduleNextRound();
        throw error;
      }
    });
  }

  private schedule(delayMs: number, label: string, task: () => Promise<void>): void {
    this.pendingTimeout = setTimeout(() => {
      task().catch((error) => this.logger.error(`Failed to ${label}`, error));
    }, delayMs);
  }
}
