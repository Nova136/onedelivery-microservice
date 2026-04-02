import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { IncidentController } from "./incident.controller";
import { IncidentService } from "./incident.service";
import { Incident } from "./database/entities/incidents.entity";
import { HealthModule } from "@libs/modules/health-check/health-check.module";
import { CommonModule } from "@libs/modules/common/common.module";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";

@Module({
    imports: [
        CommonModule,
        ConfigModule.forRoot({
            envFilePath: [".env"],
        }),
        HealthModule,
        TypeOrmModule.forRoot({
            type: "postgres",
            url:
                process.env.DATABASE_URL ??
                "postgresql://postgres:postgres@localhost:5432/onedelivery",
            schema: "incident",
            entities: [Incident],
            synchronize: true,
            ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
            namingStrategy: new SnakeNamingStrategy(),
        }),
        TypeOrmModule.forFeature([Incident]),
        ClientsModule.registerAsync([
            {
                name: "QA_AGENT_SERVICE",
                useFactory: () => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: (
                            process.env.RABBITMQ_URL ??
                            "amqp://rabbit:rabbit@localhost:5672"
                        ).split(","),
                        queue:
                            process.env.RABBITMQ_QA_AGENT_QUEUE ??
                            "qa_agent_queue",
                        queueOptions: { durable: false },
                    },
                }),
            },
        ]),
    ],
    controllers: [IncidentController],
    providers: [IncidentService],
})
export class AppModule {}
