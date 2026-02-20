import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/onedelivery',
      schema: 'order',
      entities: [Order, OrderItem],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature([Order, OrderItem]),
  ],
  controllers: [OrderController],
  providers: [OrderService],
})
export class AppModule {}
