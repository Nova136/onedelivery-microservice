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
    origin: corsOrigin.includes(',') ? corsOrigin.split(',').map((o) => o.trim()) : corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'token', 'owner'],
  });

  const config = new DocumentBuilder()
    .setTitle('Order API')
    .setDescription('Order microservice – health and internal RPC')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // Serve Swagger at /order/api so Kong (strip_path: false) forwards /order/api correctly
  SwaggerModule.setup('order/api', app, document);

  const rabbitUrl = configService.get('RABBITMQ_URL', 'amqp://rabbit:rabbit@localhost:5672');
  const rabbitQueue = configService.get('RABBITMQ_ORDER_QUEUE', 'order_queue');
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
  await app.listen(configService.get('ORDER_PORT'));
  console.log(
    `🚀🚀🚀 Order service running on port ${configService.get('ORDER_PORT')},RabbitMQ ${rabbitQueue}}`,
  );
 
}
bootstrap();
