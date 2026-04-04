import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('incident', { exclude: ['health', 'docs'] });
  const configService = app.get(ConfigService);

  const corsOrigin = configService.get('CORS_ORIGIN', 'http://localhost:5173');
  app.enableCors({
    origin: corsOrigin.includes(',') ? corsOrigin.split(',').map((o) => o.trim()) : corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'token', 'owner'],
  });

  const config = new DocumentBuilder()
    .setTitle('Incident API')
    .setDescription('Incident microservice – log and track incidents')
    .setVersion('1.0')
    .addTag('incident')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('incident/api', app, document);

  const rabbitUrl = configService.get('RABBITMQ_URL', 'amqp://rabbit:rabbit@localhost:5672');
  const rabbitQueue = configService.get('RABBITMQ_INCIDENT_QUEUE', 'incident_queue');
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
  await app.listen(configService.get('INCIDENT_PORT', 3006));
  console.log(
    `🚀🚀🚀 Incident service running on port ${configService.get('INCIDENT_PORT', 3006)}, RabbitMQ ${rabbitQueue}`,
  );
}
bootstrap();
