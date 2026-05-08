import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '@/domain/errors/domain.errors';
import {
  BetBelowMinimumError,
  BetAboveMaximumError,
  RoundNotAcceptingBetsError,
  DuplicateBetError,
  NoActiveBetError,
  RoundAlreadyCrashedError,
  BetAlreadyCashedOutError,
  RoundNotFoundError,
  BetNotFoundError,
  RoundAlreadyExistsError,
  InvalidSeedError,
  VerificationFailedError,
  OptimisticLockError,
  InvalidBetStateError,
  InvalidRoundStateError,
  SeedNotAvailableError,
  InvalidIdempotencyKeyError,
} from '@/domain/errors/domain.errors';

/**
 * Maps domain errors to appropriate HTTP status codes.
 */
const ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [BetBelowMinimumError.name]: HttpStatus.BAD_REQUEST,        // 400
  [BetAboveMaximumError.name]: HttpStatus.BAD_REQUEST,        // 400
  [RoundNotAcceptingBetsError.name]: HttpStatus.BAD_REQUEST,  // 400
  [DuplicateBetError.name]: HttpStatus.CONFLICT,             // 409
  [NoActiveBetError.name]: HttpStatus.BAD_REQUEST,           // 400
  [RoundAlreadyCrashedError.name]: HttpStatus.BAD_REQUEST,   // 400
  [BetAlreadyCashedOutError.name]: HttpStatus.BAD_REQUEST,   // 400
  [RoundNotFoundError.name]: HttpStatus.NOT_FOUND,           // 404
  [BetNotFoundError.name]: HttpStatus.NOT_FOUND,             // 404
  [RoundAlreadyExistsError.name]: HttpStatus.CONFLICT,       // 409
  [InvalidSeedError.name]: HttpStatus.BAD_REQUEST,           // 400
  [VerificationFailedError.name]: HttpStatus.INTERNAL_SERVER_ERROR, // 500
  [OptimisticLockError.name]: HttpStatus.CONFLICT,           // 409
  [InvalidBetStateError.name]: HttpStatus.BAD_REQUEST,      // 400
  [InvalidRoundStateError.name]: HttpStatus.BAD_REQUEST,    // 400
  [SeedNotAvailableError.name]: HttpStatus.BAD_REQUEST,     // 400
  [InvalidIdempotencyKeyError.name]: HttpStatus.BAD_REQUEST, // 400
};

/**
 * Unified Exception Filter
 *
 * Catches all exceptions and handles them appropriately:
 * - DomainError instances are mapped to specific HTTP status codes
 * - HttpException instances are handled with their status codes
 * - All other errors return 500 Internal Server Error
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorName = 'InternalServerError';
    let message = 'An unexpected error occurred';

    // Handle DomainError instances
    if (exception instanceof DomainError) {
      statusCode = ERROR_STATUS_MAP[exception.constructor.name] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      errorName = exception.constructor.name;
      message = exception.message;

      // Log domain errors as warnings (expected errors)
      this.logger.warn(
        `[${errorName}] ${message} - ${request.method} ${request.url}`
      );
    }
    // Handle HttpException instances (including built-in NestJS exceptions)
    else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      errorName = exception.constructor.name;
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
    }
    // Handle unexpected errors
    else if (exception instanceof Error) {
      message = exception.message;

      // Log unexpected errors for debugging
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack
      );
    }

    return response.status(statusCode).json({
      statusCode,
      error: errorName,
      message,
      path: (request as any).url,
      timestamp: new Date().toISOString(),
    });
  }
}
