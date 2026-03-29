import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import {ResolutionClientService} from "./resolution-client.service"

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
                        urls: configService
                            .get(
                                "RABBITMQ_URL",
                                "amqp://rabbit:rabbit@localhost:5672",
                            )
                            .split(","),
                        queue: configService.get(
                            "RABBITMQ_RESOLUTION_AGENT_QUEUE",
                            "resolution_agent_queue",
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
