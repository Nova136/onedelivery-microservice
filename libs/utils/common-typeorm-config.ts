import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

export const db_config: TypeOrmModuleOptions & PostgresConnectionOptions = {
  type: process.env.DB_TYPE as any,
  replication: {
    master: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT as any,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    },
    slaves: [
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT as any,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      },
    ],
  },
  connectTimeoutMS: 60000,
  logging: [],
  entities: [__dirname + '/**/*.entity{.ts,.js}'], // this is general, later will be override by each services entities
  migrations: [], // this is general, later will be override by each services migrations
  namingStrategy: new SnakeNamingStrategy(),
  autoLoadEntities: true, //This will help auto populate entities from path like **/*.entity{.ts,.js}
  migrationsRun: false,
  maxQueryExecutionTime: 10000, //10second,
  cache: {
    type: 'ioredis/cluster',
    duration: 1000, // 1 seconds
    options: {
      startupNodes: process.env.REDIS_CLUSTER_NODES.split(',').map((x) => ({
        host: x.split(':')[0],
        port: parseInt(x.split(':')[1]),
      })),
      options: {
        slotsRefreshTimeout: 60000,
        slotsRefreshInterval: 60000,
        enableOfflineQueue: false,
        enableReadyCheck: false,
        dnsLookup: (address, callback) => callback(null, address),
        redisOptions: {
          maxRetriesPerRequest: null,
          tls: {
            rejectUnauthorized: false,
          },
          password: process.env.REDIS_PASSWORD,
        },
      },
      ignoreErrors: true,
    },
  },
};

export const connectionSource = new DataSource(db_config);

export default async function insertDataWithPrimaryKeyId(datas: any[], dataSource: DataSource, entity: any) {
  const repo = await dataSource.getRepository(entity);
  await repo.save(datas);
  console.log('   Inserted ' + datas?.length + ' seed data to table ' + entity);
}
