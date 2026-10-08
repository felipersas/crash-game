import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsRecorderService, METRICS_RECORDER } from './services/metrics-recorder.service';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      path: '/metrics',
    }),
  ],
  providers: [
    MetricsRecorderService,
    { provide: METRICS_RECORDER, useExisting: MetricsRecorderService },
  ],
  exports: [
    MetricsRecorderService,
    { provide: METRICS_RECORDER, useExisting: MetricsRecorderService },
  ],
})
export class ObservabilityModule {}
