import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';

/**
 * HTTP Exception Filter
 *
 * Follows NestJS best practices:
 * - Uses @Catch(HttpException) for all HTTP exceptions (including custom ones)
 * - Handles built-in and custom HttpException instances uniformly
 * - Returns consistent error response format
 *
 * @see https://docs.nestjs.com/exception-filters
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Extract error name and message
    const errorName = exception.constructor.name;
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message || exception.message;

    // Log client errors (4xx) as warnings, server errors (5xx) as errors
    if (statusCode >= 500) {
      this.logger.error(
        `[${errorName}] ${message} - ${request.method} ${request.url}`
      );
    } else {
      this.logger.warn(
        `[${errorName}] ${message} - ${request.method} ${request.url}`
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
