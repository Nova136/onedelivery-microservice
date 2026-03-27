import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController (guardian-agent)', () => {
  let controller: AppController;

  const mockAppService = {
    processChat: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: mockAppService }],
    }).compile();

    controller = module.get<AppController>(AppController);
    jest.clearAllMocks();
  });

  describe('handleAgentChat', () => {
    it('should call processChat and return reply', async () => {
      mockAppService.processChat.mockResolvedValue('Guardian response');

      const payload = { userId: 'user-1', sessionId: 'session-1', message: 'Help me' };
      const result = await controller.handleAgentChat(payload);

      expect(mockAppService.processChat).toHaveBeenCalledWith('user-1', 'session-1', 'Help me');
      expect(result).toEqual({ reply: 'Guardian response' });
    });

    it('should forward verification messages to processChat', async () => {
      mockAppService.processChat.mockResolvedValue('CORRECTED: Different answer [policy violation]');

      const payload = {
        userId: 'user-1',
        sessionId: 'session-verify',
        message: 'Verify this response: ...',
      };
      const result = await controller.handleAgentChat(payload);

      expect(result.reply).toContain('CORRECTED:');
    });

    it('should return whatever processChat returns, including escalation responses', async () => {
      const escalationReply = 'I have escalated your concern to a human agent.';
      mockAppService.processChat.mockResolvedValue(escalationReply);

      const payload = { userId: 'user-1', sessionId: 'session-1', message: 'I need help urgently' };
      const result = await controller.handleAgentChat(payload);

      expect(result).toEqual({ reply: escalationReply });
    });
  });
});
