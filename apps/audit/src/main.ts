import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const config = new DocumentBuilder()
    .setTitle('Audit API')
    .setDescription('Audit microservice – health and internal RPC')
    .setVersion('1.0')
    .addTag('audit')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: configService.get('AUDIT_TCP_HOST', '127.0.0.1'),
      port: configService.get('AUDIT_TCP_PORT', 3001),
    },
  });
  const rabbitUrl = configService.get('RABBITMQ_URL', 'amqp://rabbit:rabbit@localhost:5672');
  const rabbitQueue = configService.get('RABBITMQ_AUDIT_QUEUE', 'audit_queue');
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
  await app.listen(configService.get('AUDIT_PORT'));
  console.log(
    `🚀🚀🚀 Audit service running on port ${configService.get('AUDIT_PORT')},RabbitMQ ${rabbitQueue}}`,
  );
}
bootstrap();
