import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { KnowledgeClientService } from "./knowledge-client.service";

@Module({
    imports: [
        ClientsModule.registerAsync([
            {
                name: "KNOWLEDGE_AGENT",
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
                            "RABBITMQ_KNOWLEDGE_QUEUE",
                            "knowledge_queue",
                        ),
                        queueOptions: { durable: false },
                    },
                }),
            },
        ]),
    ],
    providers: [KnowledgeClientService],
    exports: [KnowledgeClientService],
})
export class KnowledgeModule {}