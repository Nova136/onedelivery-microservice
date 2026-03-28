import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { AuditClientService } from "./audit-client.service";

@Module({
    imports: [
        ClientsModule.registerAsync([
            {
                name: "AUDIT_SERVICE",
                imports: [ConfigModule],
                inject: [ConfigService],
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
                            "RABBITMQ_AUDIT_QUEUE",
                            "audit_queue",
                        ),
                        queueOptions: { durable: false },
                    },
                }),
            },
        ]),
    ],
    providers: [AuditClientService],
    exports: [AuditClientService],
})
export class AuditModule {}
