import { HttpStatus } from '@nestjs/common';
import type { DomainErrorStatusMap } from '@crash/http';

/**
 * HTTP status for each Games domain error code.
 * Codes missing here (seed chain/crash point invariants) are server errors.
 */
export const GAMES_ERROR_STATUS: DomainErrorStatusMap = {
  BET_BELOW_MINIMUM: HttpStatus.BAD_REQUEST,
  BET_ABOVE_MAXIMUM: HttpStatus.BAD_REQUEST,
  ROUND_NOT_ACCEPTING_BETS: HttpStatus.BAD_REQUEST,
  NO_ACTIVE_BET: HttpStatus.BAD_REQUEST,
  ROUND_ALREADY_CRASHED: HttpStatus.BAD_REQUEST,
  INVALID_BET_STATE: HttpStatus.BAD_REQUEST,
  INVALID_ROUND_STATE: HttpStatus.BAD_REQUEST,
  INVALID_MULTIPLIER: HttpStatus.BAD_REQUEST,
  INVALID_AUTO_CASHOUT_MULTIPLIER: HttpStatus.BAD_REQUEST,
  SEED_NOT_AVAILABLE: HttpStatus.BAD_REQUEST,
  ROUND_NOT_FOUND: HttpStatus.NOT_FOUND,
  BET_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_BET: HttpStatus.CONFLICT,
  OPTIMISTIC_LOCK: HttpStatus.CONFLICT,
};
