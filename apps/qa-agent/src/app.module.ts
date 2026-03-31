import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { ScheduleModule } from "@nestjs/schedule";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { MemoryModule } from "./memory/memory.module";
import { CommonModule } from "@libs/modules/common/common.module";
import { HealthModule } from "@libs/modules/health-check/health-check.module";

@Module({
  imports: [
    CommonModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule,
    HealthModule,
    MemoryModule,
    ScheduleModule.forRoot(),
    ClientsModule.registerAsync([
      {
        name: "INCIDENT_SERVICE",
        useFactory: () => ({
          transport: Transport.RMQ,
          options: {
            urls: (process.env.RABBITMQ_URL ??
              "amqp://rabbit:rabbit@localhost:5672")!.split(","),
            queue: process.env.RABBITMQ_INCIDENT_QUEUE ?? "incident_queue",
            queueOptions: { durable: false },
          },
        }),
      },
      {
        name: "USER_SERVICE",
        useFactory: () => ({
          transport: Transport.RMQ,
          options: {
            urls: (process.env.RABBITMQ_URL ??
              "amqp://rabbit:rabbit@localhost:5672")!.split(","),
            queue: process.env.RABBITMQ_USER_QUEUE ?? "user_queue",
            queueOptions: { durable: false },
          },
        }),
      },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
