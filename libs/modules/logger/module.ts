import { Inject, Module } from '@nestjs/common';
import { ILoggerService } from './adapter';
import { LoggerService } from './service';
@Module({
  providers: [
    {
      provide: ILoggerService,
      useFactory: (req) => {
        return new LoggerService()
      },
    },
  ],
  exports: [ILoggerService],
})
export class LoggerCommonModule {}
