import * as Redis from 'ioredis';
import RedisMemoryServer from 'redis-memory-server';
import { redis_url } from './e2e-setup';
import { killPorts } from './in-memory-datasource';
// const { killPortProcess } = require('kill-port-process');
// const pidFromPort = require('pid-from-port');

export class RedisService {
  redisClient: Redis.Redis;
  constructor(url: string) {
    this.redisClient = new Redis.Redis(url);
  }

  async get<T>(key: string): Promise<T> {
    const data = await this.redisClient.get(key);
    const newData: T = JSON.parse(data);
    return newData;
  }

  async set<T>(key: string, data: T, ttlInSecond?: number): Promise<'OK'> {
    const str = JSON.stringify(data);
    return await this.redisClient.setex(key, ttlInSecond, str);
  }

  async setNoTTL<T>(key: string, data: T): Promise<'OK'> {
    const str = JSON.stringify(data);
    return await this.redisClient.set(key, str);
  }

  async del<T>(keys: string[]): Promise<number> {
    return await this.redisClient.del(keys);
  }

  async hGetAll<T>(keys: string) {
    const data = await this.redisClient.hgetall(keys);
    return data;
  }

  async keys<T>(keys: string) {
    const data = await this.redisClient.keys(keys);
    return data;
  }

  async getKeyType(key: string): Promise<string> {
    const keyType = await this.redisClient.type(key);
    return keyType;
  }

  async sortedSetRemoveRangeByScore(key: string, min: number, max: number): Promise<unknown> {
    return await this.redisClient.zrangebyscore(key, min, max);
  }

  async sortedSetAdd(key: Redis.RedisKey, member: {
    score: number,
    value: string,
  }): Promise<unknown> {
    return await this.redisClient.zadd(key, member.score, member.value);
  }

  async zCount(key: Redis.RedisKey, min: number, max: number): Promise<number> {
    return await this.redisClient.zcount(key, min, max);
  }

  async hGetVals<T>(key: string) {
    const vals = await this.redisClient.hvals(key);
    const data = vals.map(val => JSON.parse(val));
    return data;
  }
  async hSet<T>(keys: string, data: any) {
    for await (const key of Object.keys(data)) {
      await this.redisClient.hset(keys, {
        [key]: data[key]
      })
    }
    return true;
  }

  async hGet<T>(keys: string, field: string) {
    return await this.redisClient.hget(keys, field);
  }
}

export const mockRedisFactory = async () => {
  const cacheService = new RedisService(redis_url);
  return cacheService;
};

export const createInMemRedisApp = async (port: number) => {
  let redisServer;

  // Got critical security: GMS-2020-2 - execa => need to remove kill-port-process package

  // await pidFromPort(port)
  //   .then(async () => port)
  //   .then(killPortProcess)
  //   .catch((error) => {});

  await killPorts([port]);

  redisServer = new RedisMemoryServer({
    instance: {
      port,
    },
    autoStart: true,
  });

  const host = await redisServer.getHost();
  const url = `redis://${host}:${port}`;
  return { redisServer, url };
};
