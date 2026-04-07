const dotenv = require('dotenv');
import setIdNextVal from '@libs/utils/seeding-setid-max';
import { DataSource, DataSourceOptions } from 'typeorm';
import { runSeeders, SeederOptions } from 'typeorm-extension';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
dotenv.config({ path: '../../.env' });

const { DB_TYPE, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

const options: DataSourceOptions & SeederOptions = {
  type: DB_TYPE as any,
  host: DB_HOST,
  port: Number(DB_PORT),
  username: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  entities: [(__dirname + '/**/*.entity{.ts,.js}').replace(/\\/g, '/')],
  seeds: [
    (__dirname + '/**/*.seed{.ts,.js}').replace(/\\/g, '/'),
  ],
  namingStrategy: new SnakeNamingStrategy(),
};

const dataSource = new DataSource(options);

dataSource.initialize().then(async () => {
  await dataSource.query(`CREATE SCHEMA IF NOT EXISTS payment;`);
  await dataSource.synchronize(true);
  await runSeeders(dataSource);
  process.exit();
});

