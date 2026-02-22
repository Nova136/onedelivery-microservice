import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { AuthModule } from './auth/auth.module';
import { ClientAuthGuard } from '@libs/utils/guards/auth.guard';
import { HealthModule } from '@libs/modules/health-check/health-check.module';


@Module({
  imports: [
    HealthModule,
    ConfigModule.forRoot({
      envFilePath: ['.env'],
    }),   
    AuthModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/onedelivery',
      schema: 'user',
      entities: [User],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
  ],
  providers: [
    ClientAuthGuard
  ],
})
export class AppModule {}
