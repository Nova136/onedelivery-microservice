import { Module } from "@nestjs/common";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { MemoryService } from "./memory.service";
import { CommonModule } from "@libs/modules/common/common.module";

@Module({
  imports: [
    CommonModule,
    ClientsModule.registerAsync([
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
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}