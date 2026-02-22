import { Injectable, Scope } from '@nestjs/common';
import { gray, green, red, yellow } from 'colorette';
import { IncomingMessage } from 'node:http';
import { pino, multistream, DestinationStream, Logger, StreamEntry } from 'pino';
import { pinoHttp, HttpLogger } from 'pino-http';
import { existsSync, mkdirSync } from 'node:fs';

import { ILoggerService } from './adapter';

@Injectable({ scope: Scope.REQUEST })
export class LoggerService implements ILoggerService {
  pinoHttp: HttpLogger;
  private pinoLogger: Logger;
  private extraInfo: object = {};

  constructor() {
    Error.stackTraceLimit = 10;
    const passUrl = new Set(['/health-check', '/graphql']);
    const dir = './logs';
    !existsSync(dir) && mkdirSync(dir);

    // Correctly typed streams array
    const streams: StreamEntry[] = [
      { level: 'info', stream: process.stdout },
      // Uncomment if you want file logging
      // {
      //   level: 'info',
      //   stream: pino.destination({ dest: `./logs/info.log`, sync: false })
      // },
      // {
      //   level: 'error',
      //   stream: pino.destination({ dest: `./logs/error.log`, sync: false })
      // },
    ];

    this.pinoLogger = pino(
      {
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
          log(object) {
            return { ...object };
          },
        },
        redact: {
          paths: [
            'pid',
            'hostname',
            'trace_flags',
            'span_id',
            'name',
            'email',
            'password',
            'profile.address',
            'profile.phone',
          ],
          remove: true,
        },
        customLevels: {
          // You can define custom levels if needed
        },
        useOnlyCustomLevels: false,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            levelFirst: true,
            translateTime: 'yyyy-dd-mm, h:MM:ss TT',
          },
        },
      },
      multistream(streams),
    );

    this.pinoHttp = pinoHttp({
      logger: this.pinoLogger,
      autoLogging: {
        ignore: (req: IncomingMessage) => passUrl.has((req as any).originalUrl),
      },
      customProps: () => ({}),
    });
  }

  setExtraInfo(infos: object): void {
    this.extraInfo = { ...this.extraInfo, ...infos };
    this.pinoHttp.logger = this.pinoHttp.logger.child(this.extraInfo);
  }

  log(message: string, context: object = {}): void {
    this.pinoHttp.logger.info({ ...context }, green(message));
  }

  trace(message: string, context: object = {}): void {
    this.pinoHttp.logger.trace({ ...context }, gray(message));
  }

  info(message: string, context: object = {}): void {
    this.pinoHttp.logger.info({ ...context }, green(message));
  }

  warn(message: string, context: object = {}): void {
    this.pinoHttp.logger.warn({ ...context }, yellow(message));
  }

  error(message: string, context: object = {}): void {
    this.pinoHttp.logger.error({ ...context }, red(message));
  }

  fatal(message: string, context: object = {}): void {
    this.pinoHttp.logger.fatal({ ...context }, red(message));
  }
}