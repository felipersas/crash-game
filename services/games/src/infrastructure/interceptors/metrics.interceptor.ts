import { Inject, Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;

    // Extract route pattern for stable labels (e.g. "/games/bet" not "/games/bet?id=123")
    const route: string =
      this.reflector.get<string>('path', context.getHandler()) ??
      request.url?.split('?')[0] ??
      'unknown';

    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<{ statusCode: number }>();
          const durationSeconds = (Date.now() - start) / 1000;
          this.metrics.observeHttpRequest(method, route, response.statusCode, durationSeconds);
        },
        error: (error: { status?: number }) => {
          const durationSeconds = (Date.now() - start) / 1000;
          const statusCode = error.status ?? 500;
          this.metrics.observeHttpRequest(method, route, statusCode, durationSeconds);
        },
      }),
    );
  }
}
