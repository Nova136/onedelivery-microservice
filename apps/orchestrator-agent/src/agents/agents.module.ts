import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { AgentsClientService } from "./agents-client.service";

@Module({
    imports: [
        ConfigModule,
        ClientsModule.registerAsync([
            {
                name: "RESOLUTION_AGENT",
                imports: [ConfigModule],
                useFactory: (configService: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: configService.get("RABBITMQ_URL", "amqp://rabbit:rabbit@localhost:5672").split(","),
                        queue: configService.get("RABBITMQ_RESOLUTION_AGENT_QUEUE", "resolution_agent_queue"),
                        queueOptions: { durable: false },
                    },
                }),
                inject: [ConfigService],
            },
            {
                name: "QA_AGENT",
                imports: [ConfigModule],
                useFactory: (configService: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: configService.get("RABBITMQ_URL", "amqp://rabbit:rabbit@localhost:5672").split(","),
                        queue: configService.get("RABBITMQ_QA_AGENT_QUEUE", "qa_agent_queue"),
                        queueOptions: { durable: false },
                    },
                }),
                inject: [ConfigService],
            },
            {
                name: "GUARDIAN_AGENT",
                imports: [ConfigModule],
                useFactory: (configService: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: configService.get("RABBITMQ_URL", "amqp://rabbit:rabbit@localhost:5672").split(","),
                        queue: configService.get("RABBITMQ_GUARDIAN_AGENT_QUEUE", "guardian_agent_queue"),
                        queueOptions: { durable: false },
                    },
                }),
                inject: [ConfigService],
            },
            {
                name: "LOGISTIC_AGENT",
                imports: [ConfigModule],
                useFactory: (configService: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: configService.get("RABBITMQ_URL", "amqp://rabbit:rabbit@localhost:5672").split(","),
                        queue: configService.get("RABBITMQ_LOGISTIC_AGENT_QUEUE", "logistic_agent_queue"),
                        queueOptions: { durable: false },
                    },
                }),
                inject: [ConfigService],
            },
        ]),
    ],
    providers: [AgentsClientService],
    exports: [AgentsClientService],
})
export class AgentsModule {}
