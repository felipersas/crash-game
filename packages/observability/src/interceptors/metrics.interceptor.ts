import { Inject, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsRecorderService, METRICS_RECORDER } from '../services/metrics-recorder.service';

interface HttpRequestLike {
  method: string;
  url: string;
  route?: { path?: string };
}

/**
 * Records duration and count of every HTTP request, labelled by route pattern
 * (e.g. /games/bets/:betId) to keep metric cardinality bounded.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(@Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequestLike>();
    const route = request.route?.path ?? request.url.split('?')[0];
    const start = performance.now();

    const record = (statusCode: number) =>
      this.metrics.observeHttpRequest(
        request.method,
        route,
        statusCode,
        (performance.now() - start) / 1000,
      );

    return next.handle().pipe(
      tap({
        next: () => record(http.getResponse<{ statusCode: number }>().statusCode),
        error: (error: { status?: number }) => record(error.status ?? 500),
      }),
    );
  }
}
