import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health-check.controller';
import { HttpModule } from '@nestjs/axios';
@Module({
  imports: [
    TerminusModule,HttpModule
  ],
  controllers: [HealthController],
  providers: []
})
export class HealthModule {}
