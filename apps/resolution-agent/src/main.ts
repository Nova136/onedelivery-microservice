import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  const corsOrigin = configService.get('CORS_ORIGIN', 'http://localhost:5173');
  app.enableCors({
    origin: corsOrigin.includes(',') ? corsOrigin.split(',').map((o: string) => o.trim()) : corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const config = new DocumentBuilder()
        .setTitle("OneDelivery RESOLUTION")
        .setDescription("API documentation for the AI Resolution Agent")
        .setVersion("1.0")
        .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('resolution-agent/api', app, document);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: configService.get('RESOLUTION_AGENT_TCP_HOST', '127.0.0.1'),
      port: configService.get('RESOLUTION_AGENT_TCP_PORT', 3012),
    },
  });
  const rabbitUrl = configService.get('RABBITMQ_URL', 'amqp://rabbit:rabbit@localhost:5672');
  const rabbitQueue = configService.get('RABBITMQ_RESOLUTION_AGENT_QUEUE', 'resolution_agent_queue');
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: rabbitUrl.split(','),
      queue: rabbitQueue,
      queueOptions: { durable: false },
      prefetchCount: 1,
    },
  });

  await app.startAllMicroservices();
  await app.listen(configService.get('RESOLUTION_AGENT_PORT'));
  console.log(
    `🚀🚀🚀 Resolution service running on port ${configService.get('RESOLUTION_AGENT_PORT')}, RabbitMQ ${rabbitQueue}}`,
  );
}
bootstrap();
