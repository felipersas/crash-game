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
};

/**
 * Domain Exception Filter
 *
 * Catches all DomainError instances and maps them to appropriate HTTP responses.
 * This keeps domain logic clean of HTTP concerns while providing proper API responses.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: DomainError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode = ERROR_STATUS_MAP[exception.constructor.name] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    // Log domain errors for debugging
    this.logger.warn(
      `[${exception.constructor.name}] ${exception.message} - ${request.method} ${request.url}`
    );

    response.status(statusCode).json({
      statusCode,
      error: exception.constructor.name,
      message: exception.message,
      path: (request as any).url,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Global Exception Filter
 *
 * Catches all remaining exceptions (non-domain errors) and returns a generic error response.
 * This prevents stack traces from leaking to clients in production.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';

    // Handle HttpException (including built-in NestJS exceptions)
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
    } else if (exception instanceof Error) {
      // Log unexpected errors for debugging
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack
      );
    }

    response.status(statusCode).json({
      statusCode,
      error: 'InternalServerError',
      message,
      path: (request as any).url,
      timestamp: new Date().toISOString(),
    });
  }
}
