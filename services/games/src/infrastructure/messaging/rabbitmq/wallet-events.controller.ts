import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, type RmqContext } from '@nestjs/microservices';
import { WalletDebitedEventHandler } from './handlers/wallet-debited.handler';
import { WalletDebitFailedEventHandler } from './handlers/wallet-debit-failed.handler';
import type {
  WalletDebitedMessage,
  WalletDebitFailedMessage,
} from '@/infrastructure/messaging/types/wallet.events';

/**
 * Consumes wallet replies of the bet saga from the `wallet.events` exchange.
 * Failed messages are rejected without requeue; the inbox retry job owns retries.
 */
@Controller()
export class WalletEventsController {
  private readonly logger = new Logger(WalletEventsController.name);

  constructor(
    private readonly walletDebitedHandler: WalletDebitedEventHandler,
    private readonly walletDebitFailedHandler: WalletDebitFailedEventHandler,
  ) {}

  @EventPattern('WalletDebited')
  async handleWalletDebited(
    @Payload() event: WalletDebitedMessage,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    await this.acknowledge(context, event.eventType, () => this.walletDebitedHandler.handle(event));
  }

  @EventPattern('WalletDebitFailed')
  async handleWalletDebitFailed(
    @Payload() event: WalletDebitFailedMessage,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    await this.acknowledge(context, event.eventType, () =>
      this.walletDebitFailedHandler.handle(event),
    );
  }

  private async acknowledge(
    context: RmqContext,
    eventType: string,
    handle: () => Promise<void>,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const message = context.getMessage();

    try {
      await handle();
      channel.ack(message);
    } catch (error: unknown) {
      this.logger.error(
        `Error processing ${eventType}: ${error instanceof Error ? error.message : String(error)}`,
      );
      channel.nack(message, false, false);
    }
  }
}
