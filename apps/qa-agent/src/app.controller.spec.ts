import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController (qa-agent)', () => {
  let controller: AppController;

  const mockAppService = {
    processChatMessageBySessionId: jest.fn(),
    analyzeTrends: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: mockAppService }],
    }).compile();

    controller = module.get<AppController>(AppController);
    jest.clearAllMocks();
  });

  describe('handleReviewSession', () => {
    it('should call processChatMessageBySessionId and return reply', async () => {
      mockAppService.processChatMessageBySessionId.mockResolvedValue(
        JSON.stringify({ status: 'NO_INCIDENT', sentiment_captured: true }),
      );

      const payload = { userId: 'user-1', sessionId: 'session-1', message: '' };
      const result = await controller.handleReviewSession(payload);

      expect(mockAppService.processChatMessageBySessionId).toHaveBeenCalledWith('user-1', 'session-1');
      expect(result.reply).toContain('NO_INCIDENT');
    });

    it('should return incident logged reply when service detects failure', async () => {
      mockAppService.processChatMessageBySessionId.mockResolvedValue(
        JSON.stringify({ status: 'INCIDENT_LOGGED', sentiment_captured: true }),
      );

      const payload = { userId: 'user-2', sessionId: 'session-2', message: '' };
      const result = await controller.handleReviewSession(payload);

      expect(result.reply).toContain('INCIDENT_LOGGED');
    });
  });

  describe('handleAnalyzeTrends (RMQ)', () => {
    it('should call analyzeTrends and return result', async () => {
      const trends = { totalByThisMonth: 5, mostCommon: 'LATE_DELIVERY', trend: 'NA' };
      mockAppService.analyzeTrends.mockResolvedValue(trends);

      const result = await controller.handleAnalyzeTrends();

      expect(mockAppService.analyzeTrends).toHaveBeenCalled();
      expect(result).toEqual(trends);
    });
  });

  describe('analyzeTrends (HTTP GET)', () => {
    it('should call analyzeTrends and return trend analysis', async () => {
      const trends = { totalByThisMonth: 10, mostCommon: 'MISSING_ITEMS', trend: 'NA' };
      mockAppService.analyzeTrends.mockResolvedValue(trends);

      const result = await controller.analyzeTrends();

      expect(mockAppService.analyzeTrends).toHaveBeenCalled();
      expect(result).toEqual(trends);
    });
  });
});
