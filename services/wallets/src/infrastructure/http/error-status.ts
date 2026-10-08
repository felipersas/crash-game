import { HttpStatus } from '@nestjs/common';
import type { DomainErrorStatusMap } from '@crash/http';

/**
 * HTTP status for each Wallets domain error code.
 */
export const WALLETS_ERROR_STATUS: DomainErrorStatusMap = {
  INSUFFICIENT_FUNDS: HttpStatus.BAD_REQUEST,
  WALLET_NOT_FOUND: HttpStatus.NOT_FOUND,
  OPTIMISTIC_LOCK: HttpStatus.CONFLICT,
};
