import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Payment } from './entities/payment.entity';
import { Refund } from './entities/refund.entity';
import { HealthModule } from '@libs/modules/health-check/health-check.module';
import { ClientAuthGuard } from '@libs/utils/guards/auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env'],
    }),
    HealthModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
   
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/onedelivery',
      schema: 'payment',
      entities: [Payment, Refund],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature([Payment, Refund]),
  ],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    ClientAuthGuard
  ],
  
})
export class AppModule {}
