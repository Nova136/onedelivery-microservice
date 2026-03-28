import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { OrderClientService } from "./order-client.service";

@Module({
    imports: [
        ConfigModule,
        ClientsModule.registerAsync([
            {
                name: "ORDER_SERVICE",
                imports: [ConfigModule],
                useFactory: (configService: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: configService
                            .get(
                                "RABBITMQ_URL",
                                "amqp://rabbit:rabbit@localhost:5672",
                            )
                            .split(","),
                        queue: configService.get(
                            "RABBITMQ_ORDER_QUEUE",
                            "order_queue",
                        ),
                        queueOptions: { durable: false },
                    },
                }),
                inject: [ConfigService],
            },
        ]),
    ],
    providers: [OrderClientService],
    exports: [OrderClientService],
})
export class OrderClientModule {}
