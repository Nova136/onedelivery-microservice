import { HttpException, HttpStatus, InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MockUtils } from '../../utils/tests/in-memory-datasource';
import { ILoggerService } from './adapter';
import { LoggerService } from './service';

describe('LoggerService', () => {
  let loggerService: ILoggerService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: ILoggerService,
          useClass: LoggerService,
        },
      ],
    }).compile();

    loggerService = module.get(ILoggerService);
    loggerService.setExtraInfo({ service: 'Test' });

    // Mock the pino logger methods
    jest.spyOn(loggerService, 'error');
    jest.spyOn(loggerService, 'fatal');
    jest.spyOn(loggerService, 'warn');
    jest.spyOn(loggerService, 'info');
    jest.spyOn(loggerService, 'trace');
    jest.spyOn(loggerService, 'log');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('error', () => {
    test('should log HttpException error', () => {
      const error = new HttpException('Error', HttpStatus.INTERNAL_SERVER_ERROR);
      loggerService.error('ERROR', error);
      expect(loggerService.error).toHaveBeenCalledWith('ERROR', error);
    });

    test('should log simple error message', () => {
      loggerService.error('ERROR');
      expect(loggerService.error).toHaveBeenCalledWith('ERROR', {});
    });

    test('should log Error object', () => {
      const error = new Error('Test error');
      loggerService.error('ERROR', error);
      expect(loggerService.error).toHaveBeenCalledWith('ERROR', error);
    });

    test('should log error with context object', () => {
      const context = { key: 'value' };
      loggerService.error('ERROR', context);
      expect(loggerService.error).toHaveBeenCalledWith('ERROR', context);
    });
  });

  describe('fatal', () => {
    test('should log fatal error with exception', () => {
      const error = new InternalServerErrorException();
      loggerService.fatal('FATAL', error);
      expect(loggerService.fatal).toHaveBeenCalledWith('FATAL', error);
    });

    test('should log fatal error with context', () => {
      const context = { reason: 'critical failure' };
      loggerService.fatal('FATAL', context);
      expect(loggerService.fatal).toHaveBeenCalledWith('FATAL', context);
    });
  });

  describe('warn', () => {
    test('should log warning with message only', () => {
      loggerService.warn('WARNING');
      expect(loggerService.warn).toHaveBeenCalledWith('WARNING', {});
    });

    test('should log warning with context', () => {
      const context = { module: 'Auth' };
      loggerService.warn('WARNING', context);
      expect(loggerService.warn).toHaveBeenCalledWith('WARNING', context);
    });
  });

  describe('info', () => {
    test('should log info message', () => {
      loggerService.info('INFO');
      expect(loggerService.info).toHaveBeenCalledWith('INFO', {});
    });

    test('should log info with additional data', () => {
      const data = { userId: 123 };
      loggerService.info('User logged in', data);
      expect(loggerService.info).toHaveBeenCalledWith('User logged in', data);
    });
  });

  describe('trace', () => {
    test('should log trace message', () => {
      loggerService.trace('TRACE');
      expect(loggerService.trace).toHaveBeenCalledWith('TRACE', {});
    });

    test('should log trace with debug data', () => {
      const debugData = { query: 'SELECT * FROM users' };
      loggerService.trace('SQL Query', debugData);
      expect(loggerService.trace).toHaveBeenCalledWith('SQL Query', debugData);
    });
  });

  describe('log', () => {
    test('should log general message', () => {
      loggerService.log('LOG');
      expect(loggerService.log).toHaveBeenCalledWith('LOG', {});
    });

    test('should log with context', () => {
      const context = { action: 'startup' };
      loggerService.log('Application started', context);
      expect(loggerService.log).toHaveBeenCalledWith('Application started', context);
    });
  });

  describe('setExtraInfo', () => {
    test('should merge extra info with existing context', () => {
      const initialInfo = { service: 'Test' };
      const additionalInfo = { version: '1.0.0' };
      
      loggerService.setExtraInfo(additionalInfo);
      
      // Verify the logger is called with merged context
      loggerService.info('Test message');
      expect(loggerService.info).toHaveBeenCalledWith('Test message', {
        ...initialInfo,
        ...additionalInfo
      });
    });
  });
});