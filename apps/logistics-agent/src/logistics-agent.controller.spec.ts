import { Test, TestingModule } from '@nestjs/testing';
import { LogisticsAgentController } from './logistics-agent.controller';
import { LogisticsAgentService } from './logistics-agent.service';
import { LogisticsAction } from './core/dto/execute-logistics-task.dto';

describe('LogisticsAgentController', () => {
  let controller: LogisticsAgentController;

  const mockLogisticsService = {
    executeTask: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LogisticsAgentController],
      providers: [{ provide: LogisticsAgentService, useValue: mockLogisticsService }],
    }).compile();

    controller = module.get<LogisticsAgentController>(LogisticsAgentController);
    jest.clearAllMocks();
  });

  describe('handleAgentTask (TCP)', () => {
    it('should parse JSON payload and call executeTask', async () => {
      mockLogisticsService.executeTask.mockResolvedValue('SUCCESS: Order cancelled');

      const payload = {
        userId: 'user-1',
        sessionId: 'session-1',
        message: JSON.stringify({ action: LogisticsAction.CANCEL_ORDER, orderId: 'order-1', description: 'Cancel request' }),
      };

      const result = await controller.handleAgentTask(payload);

      expect(mockLogisticsService.executeTask).toHaveBeenCalledWith({
        action: LogisticsAction.CANCEL_ORDER,
        userId: 'user-1',
        sessionId: 'session-1',
        orderId: 'order-1',
        description: 'Cancel request',
      });
      expect(result).toEqual({ reply: 'SUCCESS: Order cancelled' });
    });

    it('should return rejection message when JSON payload is malformed', async () => {
      const payload = {
        userId: 'user-1',
        sessionId: 'session-1',
        message: 'not valid json {{{',
      };

      const result = await controller.handleAgentTask(payload);

      expect(mockLogisticsService.executeTask).not.toHaveBeenCalled();
      expect(result).toEqual({
        reply: 'REJECTED: Logistics agent received a malformed data payload from the Orchestrator.',
      });
    });

    it('should use userId and sessionId from root payload, not from JSON body', async () => {
      mockLogisticsService.executeTask.mockResolvedValue('SUCCESS');

      const payload = {
        userId: 'trusted-user',
        sessionId: 'trusted-session',
        message: JSON.stringify({ action: LogisticsAction.CANCEL_ORDER, userId: 'injected-user' }),
      };

      await controller.handleAgentTask(payload);

      expect(mockLogisticsService.executeTask).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'trusted-user', sessionId: 'trusted-session' }),
      );
    });
  });

  describe('handleIncomingTask (HTTP)', () => {
    it('should call executeTask and return reply', async () => {
      mockLogisticsService.executeTask.mockResolvedValue('SUCCESS: Cancelled');

      const result = await controller.handleIncomingTask({
        action: LogisticsAction.CANCEL_ORDER,
        userId: 'user-1',
        sessionId: 'session-1',
        orderId: 'order-1',
        description: 'Cancel please',
      });

      expect(result).toEqual({ reply: 'SUCCESS: Cancelled' });
    });
  });
});
