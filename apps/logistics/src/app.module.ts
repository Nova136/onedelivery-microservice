import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { Delivery } from './database/entities/delivery.entity';
import { DeliveryTracking } from './database/entities/delivery-tracking.entity';
import { Product } from './database/entities/product.entity';
import { ProductsModule } from './products/products.module';
import { RolesGuard } from '@libs/utils/guards/roles.guard';
import { HealthModule } from '@libs/modules/health-check/health-check.module';
import { ClientAuthGuard } from '@libs/utils/guards/auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env'],
    }),
    HealthModule,
    ProductsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/onedelivery',
      schema: 'logistics',
      entities: [Delivery, DeliveryTracking, Product],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature([Delivery, DeliveryTracking]),
  ],
  controllers: [LogisticsController],
  providers: [
    LogisticsService,
    ClientAuthGuard
  ],
})
export class AppModule {}
