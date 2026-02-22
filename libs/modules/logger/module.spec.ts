import { Test, TestingModule } from '@nestjs/testing';

import { LoggerCommonModule } from './module';

describe('LoggerModule', () => {
  let loggerModule: LoggerCommonModule;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      providers: [LoggerCommonModule],
    }).compile();

    loggerModule = app.get<LoggerCommonModule>(LoggerCommonModule);
  });

  it('should be defined', () => {
    expect(loggerModule).toBeInstanceOf(LoggerCommonModule);
  });
});
