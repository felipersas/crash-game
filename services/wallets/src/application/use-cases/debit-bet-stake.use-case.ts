import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError, Money, PlayerId } from '@crash/domain';
import type { DomainEvent } from '@crash/messaging';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { OptimisticLockError, WalletNotFoundError } from '@/domain/errors/domain.errors';
import {
  createWalletDebitedEvent,
  createWalletDebitFailedEvent,
  type BetStakeRef,
} from '@/application/events/bet-stake.events';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import type { IInboxRepository } from '@/application/interfaces/inbox.repository';
import type { IUnitOfWork, TransactionContext } from '@/application/interfaces/unit-of-work';
import type { IUseCase } from '@/application/interfaces/use-case';
import { WALLET_REPOSITORY, INBOX_REPOSITORY, UNIT_OF_WORK } from '@/application/di.tokens';

export interface DebitBetStakeInput extends BetStakeRef {
  /** Inbox entry to mark processed in the same transaction (exactly-once debit). */
  inboxEventId?: string;
}

export interface DebitBetStakeOutput {
  debited: boolean;
  /** Why the stake was rejected, when `debited` is false. */
  reason?: string;
}

/**
 * Debit Bet Stake Use Case - Application Layer (bet saga step)
 *
 * Debits a bet stake and replies to Games in the SAME transaction:
 * - success → wallet saved + MoneyDebited + WalletDebited
 * - business rejection (no wallet, insufficient funds, invalid amount)
 *   → WalletDebitFailed; this is a final outcome, never retried
 * Transient failures (e.g. optimistic lock) are rethrown so the message is retried;
 * since nothing was committed, a retry cannot debit twice.
 */
@Injectable()
export class DebitBetStakeUseCase implements IUseCase<DebitBetStakeInput, DebitBetStakeOutput> {
  private readonly logger = new Logger(DebitBetStakeUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepository: IWalletRepository,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepository: IInboxRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async execute(input: DebitBetStakeInput): Promise<DebitBetStakeOutput> {
    try {
      await this.debit(input);
    } catch (error) {
      if (!(error instanceof DomainError) || error instanceof OptimisticLockError) {
        throw error;
      }

      this.logger.warn(`Stake of bet ${input.betId} rejected: ${error.message}`);
      await this.commit(input.roundId, [createWalletDebitFailedEvent(input, error.message)], input);
      return { debited: false, reason: error.message };
    }

    this.metrics.incrWalletOp('debit', Number(input.amountCents));
    return { debited: true };
  }

  private async debit(input: DebitBetStakeInput): Promise<void> {
    const wallet = await this.walletRepository.findByPlayerId(PlayerId.from(input.playerId));
    if (!wallet) {
      throw new WalletNotFoundError();
    }

    wallet.debit(
      Money.fromCents(input.amountCents),
      `Bet ${input.betId} placed in round ${input.roundId}`,
    );

    await this.commit(
      wallet.id,
      [...wallet.pullEvents(), createWalletDebitedEvent(input)],
      input,
      (tx) => this.walletRepository.save(wallet, tx),
    );
  }

  private async commit(
    aggregateId: string,
    events: DomainEvent[],
    input: DebitBetStakeInput,
    work?: (tx: TransactionContext) => Promise<void>,
  ): Promise<void> {
    await this.unitOfWork.commit(aggregateId, events, async (tx) => {
      await work?.(tx);
      if (input.inboxEventId) {
        await this.inboxRepository.markAsProcessed(input.inboxEventId, tx);
      }
    });
  }
}
