import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { Delivery } from './entities/delivery.entity';
import { DeliveryTracking } from './entities/delivery-tracking.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/onedelivery',
      schema: 'logistics',
      entities: [Delivery, DeliveryTracking],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature([Delivery, DeliveryTracking]),
  ],
  controllers: [LogisticsController],
  providers: [LogisticsService],
})
export class AppModule {}
