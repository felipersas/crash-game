import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsRecorderService } from './services/metrics-recorder.service.js';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      path: '/metrics',
    }),
  ],
  providers: [MetricsRecorderService],
  exports: [MetricsRecorderService],
})
export class ObservabilityModule {}
