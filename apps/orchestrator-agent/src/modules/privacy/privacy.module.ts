import { Module } from '@nestjs/common';
import { PrivacyService, TokenService } from './privacy.service';
import { RedisService } from 'nestjs-redis';

@Module({
  providers: [PrivacyService, TokenService, RedisService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
