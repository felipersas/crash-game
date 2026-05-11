import { Inject, Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import type { Request } from 'express';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;

    // Use the route pattern (e.g. /wallets/:id) for stable labels
    const route =
      this.reflector.get<string>('path', context.getHandler()) ||
      request.route?.path ||
      request.url;

    const start = performance.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode || 200;
          const durationSeconds = (performance.now() - start) / 1000;
          this.metrics.observeHttpRequest(method, route, statusCode, durationSeconds);
        },
        error: () => {
          const durationSeconds = (performance.now() - start) / 1000;
          this.metrics.observeHttpRequest(method, route, 500, durationSeconds);
        },
      }),
    );
  }
}
