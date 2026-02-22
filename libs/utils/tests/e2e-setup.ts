import { createLogisticApp } from '@apps/logistics/test/setup-e2e-logistics';
import { createOrderApp } from '@apps/order/test/setup-e2e-order';
import { createPaymentApp } from '@apps/payment/test/setup-e2e-payment';
import { createAuditApp } from '@apps/audit/test/setup-e2e-audit';
import { createUserApp } from '@apps/user/test/setup-e2e-user';
import { db_config } from '@libs/utils/common-typeorm-config';
import { killPorts, setupInMemoryDataSource, setupTestingDataSource } from '@libs/utils/tests/in-memory-datasource';
import * as fs from 'node:fs';
import { createInMemRedisApp } from './in-memory-redis';
import { deleteS3MockBucketLocation, s3MockBucketLocation } from './s3-mock-config';
const path = require('path');
// const { killPortProcess } = require('kill-port-process');
// const pidFromPort = require('pid-from-port');

export let logisticApp: any;
export let orderApp: any;
export let paymentApp: any;
export let auditApp: any;
export let userApp: any;


export let token: any;
export let auditlog_e2e_port: any;
export let owner: any;
export let userLanguageId: any;

export let redis_url: any;
export let user_e2e_port: any;
export let audit_e2e_port: any;
export let logistics_e2e_port: any;
export let order_e2e_port: any;
export let payment_e2e_port: any;


export let inMemPostgres: any;
export let inMemRedis: any;
export let dbInitialBackup: any;

export let batchJobApp: any;

export function setupInMemoryMicroservices(disablePGMem?: boolean) {
  try {
    beforeAll(async () => {
      // Got critical security: GMS-2020-2 - execa => need to remove kill-port-process package
      await forceKillPorts();

      const configDS = {
        ...db_config,
        entities: [path.join(__dirname, '../../../', 'apps/**/*.entity{.ts,.js}').replace(/\\/g, '/')],
        cache: false,
      };

      console.log('disablePGMem===', disablePGMem);

      if (!disablePGMem) {
        inMemPostgres = await setupInMemoryDataSource(
          {
            ...db_config,
            entities: [path.join(__dirname, '../../../', 'apps/**/*.entity{.ts,.js}')],
          },
          [
            'logistics',
            'order',
            'payment',
            'audit',
            'user',
          ],
        );
      } else {
        inMemPostgres = await setupTestingDataSource(configDS);
      }

      inMemRedis = await createInMemRedisApp(2999);
      redis_url = inMemRedis.url;

      audit_e2e_port=3001;
      logistics_e2e_port=3002;
      order_e2e_port=3003;
      payment_e2e_port=3004;
      user_e2e_port=3005;
     
      logisticApp = await createLogisticApp();
      orderApp = await createOrderApp();
      paymentApp = await createPaymentApp();
      auditApp = await createAuditApp();
      userApp = await createUserApp();

 

     //tokenFromRegister.body.LanguageId;

      dbInitialBackup = inMemPostgres.db.backup();
    });

    afterAll(async () => {
      await Promise.all([
        inMemPostgres?.ds?.close(),

        logisticApp?.app?.close(),
        logisticApp?.microservice?.close(),
        orderApp?.app?.close(),
        orderApp?.microservice?.close(),
        paymentApp?.app?.close(),
        paymentApp?.microservice?.close(),
        auditApp?.app?.close(),
        auditApp?.microservice?.close(),
        userApp?.app?.close(),
        userApp?.microservice?.close(),


      ]);

      setTimeout(async () => {
        await forceKillPorts();
      });
    });
  } catch (error) {
    console.log({ error });
  }

  async function forceKillPorts() {
    const allPort = [3001,3002,3003,3004,3005];

    // for await (const port of allPort) {
    //   await pidFromPort(port)
    //     .then(async () => port)
    //     .then(killPortProcess)
    //     .catch((error) => {});
    // }

    await killPorts(allPort);
  }
}

export async function mockBucketLocation() {
  deleteS3MockBucketLocation(s3MockBucketLocation);
  const safeBucket = path.join(process.env.FILE_AWS_SAFE_BUCKET_NAME);

  var bucketPath = path.join(__dirname, '../../..', 's3-mock-buckets', safeBucket);

  if (!fs.existsSync(bucketPath)) {
    fs.mkdirSync(bucketPath, { recursive: true });
  }
  return true;
}
