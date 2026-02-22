import { ClientAuthGuard } from '@libs/utils/guards/auth.guard';
import { ResponseInterceptor } from '@libs/utils/interceptors/response.interceptor';
import { art_e2e_port, auditlog_e2e_port, common_e2e_port, inMemPostgres, medical_e2e_port, user_e2e_port } from '@libs/utils/tests/e2e-setup';
import { mockGuard } from '@libs/utils/tests/in-memory-datasource';
import { Reflector } from '@nestjs/core';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

export const createARTApp = async () => {
  const dataSource = inMemPostgres.ds;
  const fixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DataSource)
    .useValue(dataSource)
    .overrideProvider(ClientAuthGuard)
    .useValue(mockGuard)
    .overrideProvider('COMMON_SERVICE')
    .useValue(
      ClientProxyFactory.create({
        transport: Transport.TCP,
        options: { port: common_e2e_port },
      }),
    ).overrideProvider('USER_SERVICE')
    .useValue(
      ClientProxyFactory.create({
        transport: Transport.TCP,
        options: { port: user_e2e_port },
      }),
    ).overrideProvider('MEDICAL_SERVICE')
    .useValue(
      ClientProxyFactory.create({
        transport: Transport.TCP,
        options: { port: medical_e2e_port },
      }),
    )
    .overrideProvider('AUDITLOG_SERVICE')
    .useValue(
      ClientProxyFactory.create({
        transport: Transport.TCP,
        options: { port: auditlog_e2e_port },
      }),
    )

    .compile();

  const app = fixture.createNestApplication();
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new ResponseInterceptor(reflector));

  const microservice = fixture.createNestMicroservice({
    transport: Transport.TCP,
    options: { port: art_e2e_port },
  });
  await microservice.listen();
  await app.init();
  return { app, dataSource, db: inMemPostgres.db, microservice };
};
