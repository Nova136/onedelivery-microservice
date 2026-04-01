import { Module } from "@nestjs/common";
import { MemoryClientService } from "./memory-client.service";
import { ClientsModule, Transport } from "@nestjs/microservices";
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
    providers: [MemoryClientService],
    exports: [MemoryClientService],
})
export class MemoryClientModule {}
