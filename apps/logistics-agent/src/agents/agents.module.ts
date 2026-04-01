import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { AgentsClientService } from "./agents-client.service";

@Module({
    imports: [
        ConfigModule,
        ClientsModule.registerAsync([
            {
                name: "GUARDIAN_AGENT",
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
                            "RABBITMQ_GUARDIAN_AGENT_QUEUE",
                            "guardian_agent_queue",
                        ),
                        queueOptions: { durable: false },
                    },
                }),
                inject: [ConfigService],
            },
            {
                name: "ORCHESTRATOR_AGENT",
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
                            "RABBITMQ_ORCHESTRATOR_AGENT_QUEUE",
                            "orchestrator_agent_queue",
                        ),
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
