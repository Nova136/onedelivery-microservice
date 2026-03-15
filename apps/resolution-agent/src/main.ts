import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Transport, MicroserviceOptions } from "@nestjs/microservices";
import { AppModule } from "./app.module";

async function bootstrap() {
    const appContext = await NestFactory.createApplicationContext(AppModule);
    const configService = appContext.get(ConfigService);

    const rabbitUrl = configService.get(
        "RABBITMQ_URL",
        "amqp://rabbit:rabbit@localhost:5672",
    );
    const rabbitQueue = configService.get(
        "RABBITMQ_RESOLUTION_AGENT_QUEUE",
        "resolution_agent_queue",
    );

    const app = await NestFactory.createMicroservice<MicroserviceOptions>(
        AppModule,
        {
            transport: Transport.RMQ,
            options: {
                urls: rabbitUrl.split(","),
                queue: rabbitQueue,
                queueOptions: { durable: false },
                prefetchCount: 1,
            },
        },
    );

    await app.listen();
    console.log(
        `🚀🚀🚀 Resolution Agent is running and listening to ${rabbitQueue}`,
    );
}
bootstrap();
