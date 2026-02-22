import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';

/** Type for health.check(indicators) to avoid conflicting Terminus typings across monorepo. */
type HealthCheckRun = (indicators: Array<() => Promise<Record<string, unknown>>>) => Promise<unknown>;

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly http: HttpHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return (this.health.check as HealthCheckRun)([
      () => this.http.pingCheck('nestjs-docs', 'https://docs.nestjs.com'),
    ]);
  }
}
