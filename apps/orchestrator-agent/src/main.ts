import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    const config = new DocumentBuilder()
        .setTitle("OneDelivery Orchestrator")
        .setDescription("API documentation for the AI Orchestrator Agent")
        .setVersion("1.0")
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("orchestrator-agent/api", app, document);

    const port = process.env.ORCHESTRATOR_PORT || 3010;
    await app.listen(port);
    console.log(`Orchestrator Agent listening on ${port}`);
}

bootstrap();
