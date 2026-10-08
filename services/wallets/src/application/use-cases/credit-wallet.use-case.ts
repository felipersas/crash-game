import { Inject, Injectable } from '@nestjs/common';
import { Money, type PlayerId } from '@crash/domain';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { WalletNotFoundError } from '@/domain/errors/domain.errors';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import type { IInboxRepository } from '@/application/interfaces/inbox.repository';
import type { IUnitOfWork } from '@/application/interfaces/unit-of-work';
import type { IUseCase } from '@/application/interfaces/use-case';
import { WALLET_REPOSITORY, INBOX_REPOSITORY, UNIT_OF_WORK } from '@/application/di.tokens';

export interface CreditWalletInput {
  playerId: PlayerId;
  amountCents: bigint;
  reason: string;
  /** Inbox entry to mark processed in the same transaction (exactly-once credit). */
  inboxEventId?: string;
}

export interface CreditWalletOutput {
  walletId: string;
  newBalanceCents: bigint;
  version: number;
}

/**
 * Credit Wallet Use Case - Application Layer
 *
 * Credits money to a player's wallet (e.g. cash-out payouts from Games).
 */
@Injectable()
export class CreditWalletUseCase implements IUseCase<CreditWalletInput, CreditWalletOutput> {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepository: IWalletRepository,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepository: IInboxRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async execute(input: CreditWalletInput): Promise<CreditWalletOutput> {
    const wallet = await this.walletRepository.findByPlayerId(input.playerId);
    if (!wallet) {
      throw new WalletNotFoundError();
    }

    wallet.credit(Money.fromCents(input.amountCents), input.reason);

    await this.unitOfWork.commit(wallet.id, wallet.pullEvents(), async (tx) => {
      await this.walletRepository.save(wallet, tx);
      if (input.inboxEventId) {
        await this.inboxRepository.markAsProcessed(input.inboxEventId, tx);
      }
    });

    this.metrics.incrWalletOp('credit', Number(input.amountCents));

    return {
      walletId: wallet.id,
      newBalanceCents: wallet.getBalance().toCents(),
      version: wallet.getVersion(),
    };
  }
}
