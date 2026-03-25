/// <reference types="jest" />
import { CanActivate, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { DataSource } from 'typeorm';
import { v4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';

import { decode } from 'jsonwebtoken';
import { DataType, newDb } from 'pg-mem';

const execPromise = promisify(exec);
export const setupInMemoryDataSource = async (config: any, schemaNames?: string[]) => {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  schemaNames.forEach((schemaName) => {
    db.createSchema(schemaName);
  });

  db.public.registerFunction({
    implementation: () => 'test',
    name: 'current_database',
  });

  // db.public.registerFunction({
  //   implementation: () => 'test',
  //   args: [DataType.regclass, DataType.text],
  //   returns: DataType.text,
  //   name: 'pg_catalog.obj_description',
  // });

  db.public.registerFunction({
    implementation: () => 'test',
    args: [DataType.regclass, DataType.text],
    returns: DataType.text,
    name: 'obj_description',
  });

  db.registerExtension('uuid-ossp', (schema) => {
    schema.registerFunction({
      name: 'uuid_generate_v4',
      returns: DataType.uuid,
      implementation: v4,
      impure: true,
    });
  });
  // db.public.none('CREATE FUNCTION pg_catalog.obj_description')
  db.public.registerFunction({
    name: 'version',
    implementation: () => 'PostgreSQL 14.2, compiled by Visual C++ build 1914, 64-bit',
  });
  const ds: DataSource = await db.adapters.createTypeormDataSource({
    ...config,
    cache: false,
  });
  await ds.initialize();
  try {
    await ds.synchronize();
  } catch (error) {
    console.log('DB Sync error', error);
  }
  return { ds, db };
};

export const setupTestingDataSource = async (config: any) => {
  console.log('config: ', config);
  const dataSource = new DataSource(config);
  const ds = await dataSource.initialize();
  await ds.synchronize();

  return {
    ds,
    db: {
      backup: () => {
        restore: () => {};
      },
    },
  };
};

export const mockedClientProxy = {
  connect: jest.fn().mockImplementation(() => of({})),
  send: jest.fn().mockImplementation(() => of({})),
};

export class MockUtils {
  static setMock(mock: unknown): any {
    return mock as any;
  }
}

export const mockGuard: CanActivate = {
  canActivate(context: ExecutionContext): any {
    try {
      const exlcudeRequests: any = [
        '/login',
        '/signup',
        '/api',
        '/health',
        '/api-docs',
        '/create',
        '/health-check',
        '/health-check',
        '/user/health-check',
        '/logistics/health-check',
        '/order/health-check',
        '/payment/health-check',
        '/audit/health-check'
      ];
      const request = context.getArgByIndex(0);
      if (request.url && exlcudeRequests.includes(request.url.split('?')[0])) {
        return true;
      }

      // Tests should rely only on `Authorization: Bearer <jwt>` (see `libs/utils/guards/auth.guard.ts`).
      const authHeader = request?.headers?.authorization;
      if (!authHeader || typeof authHeader !== 'string') {
        return false;
      }
      if (!authHeader.startsWith('Bearer ')) {
        return false;
      }

      const authToken = authHeader.slice(7);
      const decoded = decode(authToken.toString()) as { sub?: string; userId?: string } | null;
      if (!decoded) {
        return false;
      }

      request.userId = decoded.sub ?? decoded.userId;
      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  },
};

export async function killPorts(ports: number[]): Promise<any[]> {
  const platform = process.platform;

    const results = await Promise.all(
      ports.map(async (port) => {
        try {
          let command: string;
          if (platform === "win32") {
            command = `netstat -ano | findstr :${port}`;
          } else {
            command = `lsof -ti:${port}`;
          }
          // const command = `netstat -ano | findstr :${port}`;
          console.log(`command:::${platform}::: `, command);

          const { stdout } = await execPromise(command);

          const lines = stdout.trim().split("\n");
          if (lines.length === 0 || stdout.trim() === "") {
            return null;
          }

          const pids = lines.map((line) => line.trim().split(/\s+/).pop());
          const killResults = await Promise.all(
            pids.map(async (pid) => {
              try {
                if (platform === "win32") {
                  await execPromise(`taskkill /PID ${pid} /F`);
                } else {
                  await execPromise(`kill -9 ${pid}`);
                }
                // await execPromise(`taskkill /PID ${pid} /F`);
                return `Killed process ${pid} on port ${port}`;
              } catch (killError) {
                return null;
              }
            }),
          );

          return killResults.filter((result) => result !== null);
        } catch (error) {
          // console.error(
          //   `Error finding process on port ${port}: ${error.message}`,
          // );
          return null;
        }
      }),
    );

    return results.filter((result) => result !== null);
}