import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { KnowledgeClientService } from "./knowledge-client.service";

@Module({
    imports: [
        ConfigModule,
        ClientsModule.registerAsync([
            {
                name: "KNOWLEDGE_AGENT",
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
                            "RABBITMQ_KNOWLEDGE_QUEUE",
                            "knowledge_queue",
                        ),
                        queueOptions: { durable: false },
                    },
                }),
                inject: [ConfigService],
            },
        ]),
    ],
    providers: [KnowledgeClientService],
    exports: [KnowledgeClientService],
})
export class KnowledgeModule {}
