import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Transport, MicroserviceOptions } from "@nestjs/microservices";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { Logger } from "nestjs-pino";

async function bootstrap() {
    // bufferLogs ensures startup messages are held until Pino is ready to take over
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    const configService = app.get(ConfigService);
    app.useLogger(app.get(Logger));

    const corsOrigin = configService.get(
        "CORS_ORIGIN",
        "http://localhost:5173",
    );
    app.enableCors({
        origin: corsOrigin.includes(",")
            ? corsOrigin.split(",").map((o: string) => o.trim())
            : corsOrigin,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    });

    const config = new DocumentBuilder()
        .setTitle("OneDelivery Orchestrator")
        .setDescription("API documentation for the AI Orchestrator Agent")
        .setVersion("1.0")
        .addBearerAuth()
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("orchestrator-agent/api", app, document);

    const rabbitUrl = configService.get(
        "RABBITMQ_URL",
        "amqp://rabbit:rabbit@localhost:5672",
    );
    const rabbitQueue = configService.get(
        "RABBITMQ_ORCHESTRATOR_AGENT_QUEUE",
        "orchestrator_agent_queue",
    );
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.RMQ,
        options: {
            urls: rabbitUrl.split(","),
            queue: rabbitQueue,
            queueOptions: { durable: false },
            prefetchCount: 1,
        },
    });

    await app.startAllMicroservices();
    await app.listen(configService.get("ORCHESTRATOR_AGENT_PORT"));
    console.log(
        `🚀🚀🚀 Orchestrator service running on port ${configService.get("ORCHESTRATOR_AGENT_PORT")}, RabbitMQ ${rabbitQueue}}`,
    );
}
bootstrap();
