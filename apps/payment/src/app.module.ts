import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { PaymentController } from "./payment.controller";
import { PaymentService } from "./payment.service";
import { Refund } from "./database/entities/refund.entity";
import { HealthModule } from "@libs/modules/health-check/health-check.module";
import { ClientAuthGuard } from "@libs/utils/guards/auth.guard";
import { CommonModule } from "@libs/modules/common/common.module";
import { Payment } from "./database/entities/payment.entity";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: [".env"],
        }),
        HealthModule,
        CommonModule,
        PassportModule.register({ defaultStrategy: "jwt" }),
        ClientsModule.registerAsync([
            {
                name: "AUDIT_SERVICE",
                imports: [ConfigModule],
                useFactory: (config: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: config
                            .get(
                                "RABBITMQ_URL",
                                "amqp://rabbit:rabbit@localhost:5672",
                            )
                            .split(","),
                        queue: config.get(
                            "RABBITMQ_AUDIT_QUEUE",
                            "audit_queue",
                        ),
                        queueOptions: { durable: false },
                    },
                }),
                inject: [ConfigService],
            },
            {
                name: "INCIDENT_SERVICE",
                imports: [ConfigModule],
                useFactory: (config: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: config
                            .get(
                                "RABBITMQ_URL",
                                "amqp://rabbit:rabbit@localhost:5672",
                            )
                            .split(","),
                        queue: config.get(
                            "RABBITMQ_INCIDENT_QUEUE",
                            "incident_queue",
                        ),
                        queueOptions: { durable: false },
                    },
                }),
                inject: [ConfigService],
            },
        ]),

        TypeOrmModule.forRoot({
            type: "postgres",
            url:
                process.env.DATABASE_URL ??
                "postgresql://postgres:postgres@localhost:5432/onedelivery",
            schema: "payment",
            entities: [Payment, Refund],
            synchronize: process.env.NODE_ENV !== "production",
            namingStrategy: new SnakeNamingStrategy(),
        }),
        TypeOrmModule.forFeature([Payment, Refund]),
    ],
    controllers: [PaymentController],
    providers: [PaymentService, ClientAuthGuard],
})
export class AppModule {}
