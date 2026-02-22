import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Redis from 'ioredis';

@Injectable()
export class RedisService {
  cluster: Redis.Cluster;
  constructor(private configService: ConfigService) {
    this.cluster = new Redis.Cluster(
      this.configService
        .get('REDIS_CLUSTER_NODES')
        .split(',')
        .map((x) => ({
          host: x.split(':')[0],
          port: parseInt(x.split(':')[1]),
        })),
      {
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
          password: this.configService.get('REDIS_PASSWORD'),
        },
      },
    );
  }

  async get<T>(key: string): Promise<T> {
    const data = await this.cluster.get(key);
    const newData: T = JSON.parse(data);
    return newData;
  }

  async set<T>(key: string, data: T, ttlInSecond?: number): Promise<'OK'> {
    const str = JSON.stringify(data);
    return await this.cluster.setex(key, ttlInSecond, str);
  }

  async setNoTTL<T>(key: string, data: T): Promise<'OK'> {
    const str = JSON.stringify(data);
    return await this.cluster.set(key, str);
  }

  async del<T>(keys: string[]): Promise<number> {
    return await this.cluster.del(keys);
  }

  async hGetAll<T>(keys: string) {
    const data = await this.cluster.hgetall(keys);
    return data;
  }

  async keys<T>(keys: string) {
    const data = await this.cluster.keys(keys);
    return data;
  }

  async getKeyType(key: string): Promise<string> {
    const keyType = await this.cluster.type(key);
    return keyType;
  }

  async sortedSetRemoveRangeByScore(key: string, min: number, max: number): Promise<unknown> {
    return await this.cluster.zrangebyscore(key, min, max);
  }

  async sortedSetAdd(key: Redis.RedisKey, member: {
    score: number,
    value: string,
  }): Promise<unknown> {
    return await this.cluster.zadd(key, member.score, member.value);
  }

  async zCount(key: Redis.RedisKey, min: number, max: number): Promise<number> {
    return await this.cluster.zcount(key, min, max);
  }

  async hGetVals<T>(key: string) {
    const vals = await this.cluster.hvals(key);
    const data = vals.map(val => JSON.parse(val));
    return data;
  }
  async hSet<T>(keys: string, data: any) {
    return await this.cluster.hset(keys, data);
  }

  async hGet<T>(keys: string, field: string) {
    return await this.cluster.hget(keys, field);
  }

}
