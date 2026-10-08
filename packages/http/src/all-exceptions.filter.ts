import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '@crash/domain';

/** HTTP status per domain error code. Unmapped domain errors are server errors. */
export type DomainErrorStatusMap = Readonly<Record<string, HttpStatus>>;

/** Codes raised by the shared kernel (@crash/domain). */
const SHARED_KERNEL_STATUS: DomainErrorStatusMap = {
  INVALID_MONEY_AMOUNT: HttpStatus.BAD_REQUEST,
  NEGATIVE_MONEY: HttpStatus.BAD_REQUEST,
  INVALID_IDEMPOTENCY_KEY: HttpStatus.BAD_REQUEST,
};

export interface ApiErrorBody {
  statusCode: number;
  code?: string;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Translates every exception into the API error body:
 * - DomainError → status from the map, stable `code`, user-facing message
 * - HttpException → its own status and message (e.g. validation errors)
 * - anything else → 500 with a generic message (details are only logged)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly statusByCode: DomainErrorStatusMap;

  constructor(statusByCode: DomainErrorStatusMap) {
    this.statusByCode = { ...SHARED_KERNEL_STATUS, ...statusByCode };
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const body = this.toBody(exception, request);

    ctx.getResponse<Response>().status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, request: Request): ApiErrorBody {
    const base = { path: request.url, timestamp: new Date().toISOString() };

    if (exception instanceof DomainError) {
      const statusCode = this.statusByCode[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      this.logger.warn(
        `[${exception.code}] ${exception.message} - ${request.method} ${request.url}`,
      );
      return {
        ...base,
        statusCode,
        code: exception.code,
        error: exception.name,
        message: exception.message,
      };
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      return {
        ...base,
        statusCode: exception.getStatus(),
        error: exception.name,
        message:
          typeof response === 'object' && response !== null && 'message' in response
            ? (response as { message: string | string[] }).message
            : exception.message,
      };
    }

    this.logger.error(
      `Unhandled exception - ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
    };
  }
}
