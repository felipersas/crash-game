import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { WalletDebitedEventHandler } from './handlers/wallet-debited.handler';
import { WalletDebitFailedEventHandler } from './handlers/wallet-debit-failed.handler';
@Controller()
export class WalletEventsController {
  private readonly logger = new Logger(WalletEventsController.name);

  constructor(
    private readonly walletDebitedHandler: WalletDebitedEventHandler,
    private readonly walletDebitFailedHandler: WalletDebitFailedEventHandler,
  ) {}

  @EventPattern('WalletDebited')
  async handleWalletDebited(
    @Payload() event: any,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const msg = context.getMessage();

    try {
      await this.walletDebitedHandler.handle(event);
      channel.ack(msg);
      this.logger.debug('WalletDebited event processed');
    } catch (error: unknown) {
      this.logger.error(
        `Error processing WalletDebited: ${error instanceof Error ? error.message : String(error)}`,
      );
      channel.nack(msg, false, false);
    }
  }

  @EventPattern('WalletDebitFailed')
  async handleWalletDebitFailed(
    @Payload() event: any,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const msg = context.getMessage();

    try {
      await this.walletDebitFailedHandler.handle(event);
      channel.ack(msg);
      this.logger.debug('WalletDebitFailed event processed');
    } catch (error: unknown) {
      this.logger.error(
        `Error processing WalletDebitFailed: ${error instanceof Error ? error.message : String(error)}`,
      );
      channel.nack(msg, false, false);
    }
  }
}
