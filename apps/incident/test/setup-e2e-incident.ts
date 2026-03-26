import { inMemPostgres, incident_e2e_port } from '@libs/utils/tests/e2e-setup';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Transport } from '@nestjs/microservices';
import { AppModule } from '../src/app.module';

export const createIncidentApp = async () => {
  const dataSource = inMemPostgres.ds;

  const fixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DataSource)
    .useValue(dataSource)
    .compile();

  const app = fixture.createNestApplication();
  const microservice = fixture.createNestMicroservice({
    transport: Transport.TCP,
    options: { port: incident_e2e_port },
  });

  await microservice.listen();
  await app.init();

  return { app, dataSource, db: inMemPostgres.db, microservice };
};

