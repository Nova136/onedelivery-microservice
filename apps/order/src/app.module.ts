import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CommonModule } from '@libs/modules/common/common.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { Order } from './database/entities/order.entity';
import { OrderItem } from './database/entities/order-item.entity';
import { HealthModule } from '@libs/modules/health-check/health-check.module';
import { ClientAuthGuard } from '@libs/utils/guards/auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env'],
    }),
    HealthModule,
    CommonModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ClientsModule.registerAsync([
      {
        name: 'PAYMENT_SERVICE',
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get('PAYMENT_TCP_HOST', '127.0.0.1'),
            port: config.get('PAYMENT_TCP_PORT', 3004),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'AUDIT_SERVICE',
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get('AUDIT_TCP_HOST', '127.0.0.1'),
            port: config.get('AUDIT_TCP_PORT', 3001),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'INCIDENT_SERVICE',
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get('INCIDENT_TCP_HOST', '127.0.0.1'),
            port: config.get('INCIDENT_TCP_PORT', 3006),
          },
        }),
        inject: [ConfigService],
      },
    ]),
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
  providers: [
    OrderService,
    ClientAuthGuard
  ],
})
export class AppModule {}
