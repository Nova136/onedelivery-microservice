import {
  inMemPostgres,
  logistics_e2e_port,
} from '@libs/utils/tests/e2e-setup';
import { mockGuard } from '@libs/utils/tests/in-memory-datasource';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ClientAuthGuard } from '@libs/utils/guards/auth.guard';
import { Transport } from '@nestjs/microservices';

export const createLogisticApp = async () => {
  const dataSource = inMemPostgres.ds;
  const fixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DataSource)
    .useValue(dataSource)
    .overrideProvider(ClientAuthGuard)
    .useValue(mockGuard)
    .compile();

 
  const app = fixture.createNestApplication();
  const microservice = fixture.createNestMicroservice({
      transport: Transport.TCP,
      options: { port: logistics_e2e_port },
  });
  await microservice.listen();
  await app.init();
  return { app, dataSource, db: inMemPostgres.db, microservice };
};
