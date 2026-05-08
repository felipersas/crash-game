/**
 * Defines the contract for handling commands from other services (e.g., Wallet).
 * Commands are received via RabbitMQ and processed asynchronously.
 */
export interface IMessageHandler<TCommand = unknown, TResult = unknown> {
  /**
   * Handle a command from the message broker.
   * Returns the result to be sent back to the caller (via replyTo queue).
   */
  handle(command: TCommand): Promise<TResult>;
}

/**
 * Supported command types from Wallet Service.
 */
export interface CreditWalletCommand {
  readonly type: 'CreditWalletCommand';
  readonly id: string;
  readonly walletId: string;
  readonly amount: bigint;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly replyTo?: string;
}

export interface DebitWalletCommand {
  readonly type: 'DebitWalletCommand';
  readonly id: string;
  readonly walletId: string;
  readonly amount: bigint;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly replyTo?: string;
}

export type WalletCommand = CreditWalletCommand | DebitWalletCommand;

/**
 * Result type for command responses.
 */
export interface CommandResult {
  readonly commandId: string;
  readonly status: 'success' | 'error';
  readonly newBalance?: bigint;
  readonly error?: string;
}
