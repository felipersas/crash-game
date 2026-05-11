import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '@/domain/errors/domain.errors';
import {
  InsufficientFundsError,
  InvalidMoneyAmountError,
  NegativeMoneyError,
  WalletNotFoundError,
  OptimisticLockError,
} from '@/domain/errors/domain.errors';

/**
 * Maps domain errors to appropriate HTTP status codes.
 */
const ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [InsufficientFundsError.name]: HttpStatus.BAD_REQUEST, // 400
  [InvalidMoneyAmountError.name]: HttpStatus.BAD_REQUEST, // 400
  [NegativeMoneyError.name]: HttpStatus.BAD_REQUEST, // 400
  [WalletNotFoundError.name]: HttpStatus.NOT_FOUND, // 404
  [OptimisticLockError.name]: HttpStatus.CONFLICT, // 409
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

    let code: string | undefined;

    if (exception instanceof DomainError) {
      statusCode = ERROR_STATUS_MAP[exception.constructor.name] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      errorName = exception.constructor.name;
      message = exception.message;
      code = exception.code;

      this.logger.warn(`[${errorName}] ${message} - ${request.method} ${request.url}`);
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      errorName = exception.constructor.name;
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;

      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    }

    return response.status(statusCode).json({
      statusCode,
      code,
      error: errorName,
      message,
      path: (request as any).url,
      timestamp: new Date().toISOString(),
    });
  }
}
